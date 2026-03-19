"use strict";
// Safekeeping Fund System - LangGraph Orchestrator
// Coordinates all nodes in the safekeeping fund rebalancing pipeline
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStateHealthy = exports.addError = exports.addThought = exports.updateState = exports.createInitialState = exports.SafekeepingFundOrchestrator = void 0;
exports.createSafekeepingFundOrchestrator = createSafekeepingFundOrchestrator;
exports.runRebalancingCycle = runRebalancingCycle;
const logger_1 = __importDefault(require("../shared/logger"));
const circuit_breaker_1 = __importDefault(require("../shared/circuit-breaker"));
const multi_chain_wallet_manager_1 = require("./dex/multi-chain-wallet-manager");
const state_1 = require("./state");
Object.defineProperty(exports, "createInitialState", { enumerable: true, get: function () { return state_1.createInitialState; } });
Object.defineProperty(exports, "updateState", { enumerable: true, get: function () { return state_1.updateState; } });
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_1.addThought; } });
Object.defineProperty(exports, "addError", { enumerable: true, get: function () { return state_1.addError; } });
Object.defineProperty(exports, "isStateHealthy", { enumerable: true, get: function () { return state_1.isStateHealthy; } });
const nodes_1 = require("./nodes");
/**
 * Safekeeping Fund Orchestrator
 * Runs the autonomous rebalancing pipeline with circuit breaker protection
 */
class SafekeepingFundOrchestrator {
    walletManager;
    consecutiveErrors = 0;
    maxConsecutiveErrors = 5;
    cycleNumber = 0;
    constructor(walletManager) {
        this.walletManager = walletManager;
        this.registerCircuitBreakers();
    }
    /**
     * Execute one full rebalancing cycle
     */
    async invoke(initialState) {
        this.cycleNumber++;
        // Use provided state or create new one
        let state = initialState || (0, state_1.createInitialState)(0);
        logger_1.default.info(`[Orchestrator] Starting cycle ${this.cycleNumber} (${state.cycleId})`);
        // Check if wallet manager is ready
        if (!this.walletManager.isReady()) {
            logger_1.default.warn('[Orchestrator] Wallet manager not ready, skipping cycle');
            return {
                ...state,
                currentStep: 'SKIPPED_WALLET_NOT_READY',
                errors: ['Wallet manager not initialized'],
            };
        }
        // Check circuit breakers before starting
        const executionBreaker = circuit_breaker_1.default.getBreakerStatus('safekeeping-execution');
        if (executionBreaker?.isOpen) {
            logger_1.default.warn('[Orchestrator] Execution circuit breaker is OPEN, skipping cycle');
            return (0, state_1.updateState)(state, {
                currentStep: 'SKIPPED_CIRCUIT_BREAKER',
                thoughts: [...state.thoughts, 'Cycle skipped: Execution circuit breaker is open'],
                errors: [...state.errors, 'Execution circuit breaker is open'],
            });
        }
        try {
            // Step 1: Market Monitor - Fetch pool states from all DEXs
            state = (0, state_1.updateState)(state, await this.safeExecute('market-monitor', () => (0, nodes_1.marketMonitorNode)(state, this.walletManager)));
            // Step 2: APR Calculator - Calculate effective APRs
            state = (0, state_1.updateState)(state, await this.safeExecute('apr-calculator', () => (0, nodes_1.aprCalculatorNode)(state)));
            // Step 3: AI Analysis - Get AI-powered insights
            state = (0, state_1.updateState)(state, await this.safeExecute('ai-analysis', () => (0, nodes_1.aiAnalysisNode)(state)));
            // Step 4: Rebalance Planner - Generate rebalance actions
            state = (0, state_1.updateState)(state, await this.safeExecute('rebalance-planner', () => (0, nodes_1.rebalancePlannerNode)(state)));
            // Step 5: Safety Gate - Validate all safety conditions
            state = (0, state_1.updateState)(state, await this.safeExecute('safety-gate', () => (0, nodes_1.safetyGateNode)(state), true));
            // Step 6: Execute - Perform the rebalance if approved
            if (state.selectedRebalance && !state.isPaused && (0, state_1.isStateHealthy)(state)) {
                logger_1.default.info(`[Orchestrator] Executing rebalance: ${state.selectedRebalance.type}`);
                state = (0, state_1.updateState)(state, await this.safeExecute('executor', () => (0, nodes_1.executeNode)(state, this.walletManager), true));
                this.consecutiveErrors = 0; // Reset error counter on successful execution
            }
            else {
                logger_1.default.info('[Orchestrator] No execution - conditions not met');
                state = (0, state_1.addThought)(state, 'No execution - rebalance not triggered or blocked by safety checks');
            }
            // Step 7: Learning - Analyze results and update metrics
            state = (0, state_1.updateState)(state, await this.safeExecute('learner', () => (0, nodes_1.learningNode)(state)));
            // Log final summary
            logger_1.default.info((0, state_1.getStateSummary)(state));
            return state;
        }
        catch (error) {
            this.consecutiveErrors++;
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger_1.default.error(`[Orchestrator] Cycle failed: ${errorMsg}`);
            // Check if we need to open circuit breaker
            if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                circuit_breaker_1.default.openBreaker('safekeeping-execution');
                logger_1.default.error(`[Orchestrator] Opened execution circuit breaker after ${this.consecutiveErrors} consecutive errors`);
            }
            return (0, state_1.updateState)(state, {
                currentStep: 'ERROR',
                errors: [...state.errors, `Orchestrator error: ${errorMsg}`],
                thoughts: [
                    ...state.thoughts,
                    `Cycle failed with error: ${errorMsg}`,
                    `Consecutive errors: ${this.consecutiveErrors}/${this.maxConsecutiveErrors}`,
                ],
            });
        }
    }
    /**
     * Execute a node with circuit breaker protection and fallback handling
     */
    async safeExecute(nodeName, fn, isCritical = false) {
        const breakerName = isCritical ? 'safekeeping-execution' : nodeName;
        return circuit_breaker_1.default.execute(breakerName, fn, isCritical ? undefined : () => this.getFallbackResult(nodeName));
    }
    /**
     * Get fallback result when a node fails
     */
    async getFallbackResult(nodeName) {
        logger_1.default.warn(`[Orchestrator] Using fallback for ${nodeName}`);
        switch (nodeName) {
            case 'market-monitor':
                return {
                    currentStep: 'MARKET_MONITOR_FALLBACK',
                    poolOpportunities: [],
                    thoughts: ['Market monitor failed, continuing without fresh data'],
                };
            case 'apr-calculator':
                return {
                    currentStep: 'APR_CALCULATOR_FALLBACK',
                    thoughts: ['APR calculator failed, using existing data'],
                };
            case 'ai-analysis':
                return {
                    currentStep: 'AI_ANALYSIS_FALLBACK',
                    aiRiskLevel: 'MEDIUM',
                    marketRegime: 'SIDEWAYS',
                    detectedAnomalies: [],
                    thoughts: ['AI analysis failed, using default parameters'],
                };
            case 'rebalance-planner':
                return {
                    currentStep: 'REBALANCE_PLANNER_FALLBACK',
                    rebalanceActions: [],
                    thoughts: ['Rebalance planner failed, skipping rebalance'],
                };
            case 'learner':
                return {
                    currentStep: 'LEARNING_FALLBACK',
                    thoughts: ['Learning failed, but cycle completed'],
                };
            default:
                return {
                    currentStep: `${nodeName.toUpperCase()}_FALLBACK`,
                    thoughts: [`Node ${nodeName} failed, using fallback`],
                };
        }
    }
    /**
     * Register circuit breakers for this orchestrator
     */
    registerCircuitBreakers() {
        const breakers = [
            { name: 'safekeeping-execution', threshold: 3, timeout: 60000 },
            { name: 'safekeeping-apr-fetch', threshold: 10, timeout: 120000 },
            { name: 'safekeeping-ethereum-rpc', threshold: 5, timeout: 30000 },
            { name: 'safekeeping-bsc-rpc', threshold: 5, timeout: 30000 },
            { name: 'safekeeping-solana-rpc', threshold: 5, timeout: 30000 },
            { name: 'safekeeping-ai-analysis', threshold: 5, timeout: 90000 },
        ];
        for (const breaker of breakers) {
            circuit_breaker_1.default.registerBreaker(breaker.name, {
                threshold: breaker.threshold,
                timeout: breaker.timeout,
            });
        }
        logger_1.default.info('[Orchestrator] Circuit breakers registered');
    }
    /**
     * Reset error counters
     */
    resetErrorCounters() {
        this.consecutiveErrors = 0;
        circuit_breaker_1.default.resetBreaker('safekeeping-execution');
        logger_1.default.info('[Orchestrator] Error counters reset');
    }
    /**
     * Get orchestrator health status
     */
    getHealthStatus() {
        const executionBreaker = circuit_breaker_1.default.getBreakerStatus('safekeeping-execution');
        const executionBreakerOpen = executionBreaker?.isOpen || false;
        let status = 'HEALTHY';
        if (executionBreakerOpen || this.consecutiveErrors >= this.maxConsecutiveErrors) {
            status = 'CRITICAL';
        }
        else if (this.consecutiveErrors > 0) {
            status = 'DEGRADED';
        }
        return {
            consecutiveErrors: this.consecutiveErrors,
            maxConsecutiveErrors: this.maxConsecutiveErrors,
            executionBreakerOpen,
            status,
        };
    }
    /**
     * Get the wallet manager
     */
    getWalletManager() {
        return this.walletManager;
    }
    /**
     * Get current cycle number
     */
    getCycleNumber() {
        return this.cycleNumber;
    }
}
exports.SafekeepingFundOrchestrator = SafekeepingFundOrchestrator;
/**
 * Create and initialize the safekeeping fund orchestrator
 */
async function createSafekeepingFundOrchestrator(walletConfig) {
    // Create wallet manager
    const walletManager = new multi_chain_wallet_manager_1.MultiChainWalletManager(walletConfig);
    await walletManager.initialize();
    // Create and return orchestrator
    return new SafekeepingFundOrchestrator(walletManager);
}
/**
 * Run a single rebalancing cycle
 */
async function runRebalancingCycle(orchestrator) {
    logger_1.default.info('[Orchestrator] Starting safekeeping fund cycle');
    const result = await orchestrator.invoke();
    logger_1.default.info(`[Orchestrator] Cycle ${orchestrator.getCycleNumber()} complete. ` +
        `Step: ${result.currentStep}, ` +
        `Rebalances: ${result.executionResults.length}, ` +
        `Errors: ${result.errors.length}`);
    return result;
}
//# sourceMappingURL=graph.js.map