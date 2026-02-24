"use strict";
// Safekeeping Fund System - Main Entry Point
// 24/7 autonomous agent for multi-chain DEX liquidity rebalancing
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafekeepingFundAgent = void 0;
exports.main = main;
const logger_1 = __importDefault(require("../shared/logger"));
const graph_1 = require("./graph");
const multi_chain_wallet_manager_1 = require("./dex/multi-chain-wallet-manager");
const constants_1 = require("./constants");
const wallet_bootstrap_1 = require("./wallet-bootstrap");
const message_bus_1 = __importDefault(require("../shared/message-bus"));
/**
 * Safekeeping Fund Agent
 * Runs continuously, monitoring and rebalancing across DEXs
 */
class SafekeepingFundAgent {
    config;
    orchestrator = null;
    walletManager = null;
    isRunning = false;
    cycleInterval;
    cycleCount = 0;
    timer = null;
    constructor(config, cycleInterval) {
        this.config = config;
        this.cycleInterval = cycleInterval || constants_1.DEFAULT_CYCLE_INTERVAL;
    }
    /**
     * Initialize the agent
     */
    async initialize() {
        logger_1.default.info('[SafekeepingAgent] Initializing Safekeeping Fund Agent');
        try {
            // Initialize wallet manager
            this.walletManager = new multi_chain_wallet_manager_1.MultiChainWalletManager(this.config);
            await this.walletManager.initialize();
            // Create orchestrator
            this.orchestrator = new graph_1.SafekeepingFundOrchestrator(this.walletManager);
            // Register message bus handlers
            this.registerMessageBusHandlers();
            logger_1.default.info('[SafekeepingAgent] Initialization complete');
        }
        catch (error) {
            logger_1.default.error(`[SafekeepingAgent] Initialization failed: ${error}`);
            throw error;
        }
    }
    /**
     * Start the agent
     */
    async start() {
        if (this.isRunning) {
            logger_1.default.warn('[SafekeepingAgent] Agent is already running');
            return;
        }
        logger_1.default.info('[SafekeepingAgent] Starting Safekeeping Fund Agent');
        this.isRunning = true;
        // Publish start event
        await message_bus_1.default.publish('safekeeping:cycle:start', {
            timestamp: new Date(),
            cycleInterval: this.cycleInterval,
        });
        // Start the cycle loop
        this.runCycleLoop();
    }
    /**
     * Stop the agent
     */
    async stop() {
        logger_1.default.info('[SafekeepingAgent] Stopping Safekeeping Fund Agent');
        this.isRunning = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        // Disconnect wallet manager
        if (this.walletManager) {
            await this.walletManager.disconnect();
        }
        // Publish stop event
        await message_bus_1.default.publish('safekeeping:cycle:stop', {
            timestamp: new Date(),
            cyclesCompleted: this.cycleCount,
        });
        logger_1.default.info(`[SafekeepingAgent] Stopped after ${this.cycleCount} cycles`);
    }
    /**
     * Run the continuous cycle loop
     */
    runCycleLoop() {
        if (!this.isRunning) {
            return;
        }
        this.runSingleCycle()
            .then(() => {
            if (this.isRunning) {
                this.timer = setTimeout(() => this.runCycleLoop(), this.cycleInterval);
            }
        })
            .catch((error) => {
            logger_1.default.error(`[SafekeepingAgent] Cycle error: ${error}`);
            // Continue running even if a cycle fails
            if (this.isRunning) {
                this.timer = setTimeout(() => this.runCycleLoop(), this.cycleInterval);
            }
        });
    }
    /**
     * Run a single rebalancing cycle
     */
    async runSingleCycle() {
        if (!this.orchestrator) {
            throw new Error('Orchestrator not initialized');
        }
        const startTime = Date.now();
        try {
            logger_1.default.info(`[SafekeepingAgent] Starting cycle ${this.cycleCount + 1}`);
            const result = await this.orchestrator.invoke();
            const duration = Date.now() - startTime;
            // Publish completion event
            await message_bus_1.default.publish('safekeeping:cycle:complete', {
                cycleId: result.cycleId,
                cycleNumber: this.cycleCount + 1,
                duration,
                step: result.currentStep,
                rebalances: result.executionResults.length,
                totalValue: result.totalValue,
                avgAPR: result.totalEffectiveAPR,
                errors: result.errors.length,
                timestamp: new Date(),
            });
            // Log summary
            logger_1.default.info(`[SafekeepingAgent] Cycle ${this.cycleCount + 1} complete in ${duration}ms. ` +
                `Step: ${result.currentStep}, ` +
                `Value: $${result.totalValue.toFixed(2)}, ` +
                `APR: ${result.totalEffectiveAPR.toFixed(2)}%, ` +
                `Rebalances: ${result.executionResults.length}`);
            this.cycleCount++;
        }
        catch (error) {
            logger_1.default.error(`[SafekeepingAgent] Cycle ${this.cycleCount + 1} failed: ${error}`);
            // Publish error event
            await message_bus_1.default.publish('safekeeping:cycle:error', {
                cycleNumber: this.cycleCount + 1,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date(),
            });
        }
    }
    /**
     * Register message bus event handlers
     */
    registerMessageBusHandlers() {
        // Handle emergency halt commands
        // (implementation would subscribe to message bus)
    }
    /**
     * Get agent status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            cycleCount: this.cycleCount,
            cycleInterval: this.cycleInterval,
            healthStatus: this.orchestrator?.getHealthStatus() || null,
        };
    }
    /**
     * Force trigger a cycle
     */
    async forceCycle() {
        logger_1.default.info('[SafekeepingAgent] Force triggering cycle');
        await this.runSingleCycle();
    }
    /**
     * Get wallet manager
     */
    getWalletManager() {
        return this.walletManager;
    }
    /**
     * Get orchestrator
     */
    getOrchestrator() {
        return this.orchestrator;
    }
}
exports.SafekeepingFundAgent = SafekeepingFundAgent;
/**
 * Main entry point when run directly
 */
async function main() {
    logger_1.default.info('[SafekeepingAgent] ==================================================');
    logger_1.default.info('[SafekeepingAgent] Safekeeping Fund Agent Starting');
    logger_1.default.info('[SafekeepingAgent] ==================================================');
    // Load configuration from env/local wallet store, auto-generating wallets when missing.
    const walletBootstrap = (0, wallet_bootstrap_1.bootstrapSafekeepingWalletConfig)();
    const config = walletBootstrap.config;
    // Check if at least one chain is configured
    const hasConfig = config.ethereum || config.bsc || config.solana;
    if (!hasConfig) {
        logger_1.default.error('[SafekeepingAgent] No chain configured. ' +
            'Set ETH_PRIVATE_KEY/BSC_PRIVATE_KEY/SOLANA_SECRET_KEY or enable SAFEKEEPING_AUTO_CREATE_WALLETS=true.');
        process.exit(1);
    }
    logger_1.default.info(`[SafekeepingAgent] Wallet store path: ${walletBootstrap.walletStorePath}`);
    for (const chain of Object.keys(walletBootstrap.addresses)) {
        const address = walletBootstrap.addresses[chain];
        const source = walletBootstrap.chainSources[chain] || 'missing';
        logger_1.default.info(`[SafekeepingAgent] ${chain} funding address (${source}): ${address}`);
    }
    if (walletBootstrap.generatedChains.length > 0) {
        logger_1.default.warn('[SafekeepingAgent] Generated new wallet(s) for: ' +
            `${walletBootstrap.generatedChains.join(', ')}. ` +
            'Fund these addresses before enabling active liquidity operations.');
    }
    // Create and start agent
    const agent = new SafekeepingFundAgent(config, parseInt(process.env.SAFEKEEPING_CYCLE_INTERVAL || '300000', 10) // 5 minutes default
    );
    try {
        await agent.initialize();
        await agent.start();
        // Handle shutdown gracefully
        process.on('SIGINT', async () => {
            logger_1.default.info('[SafekeepingAgent] Received SIGINT, shutting down...');
            await agent.stop();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            logger_1.default.info('[SafekeepingAgent] Received SIGTERM, shutting down...');
            await agent.stop();
            process.exit(0);
        });
    }
    catch (error) {
        logger_1.default.error(`[SafekeepingAgent] Fatal error: ${error}`);
        process.exit(1);
    }
}
// Run main if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}
//# sourceMappingURL=main.js.map