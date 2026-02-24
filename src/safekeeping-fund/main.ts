// Safekeeping Fund System - Main Entry Point
// 24/7 autonomous agent for multi-chain DEX liquidity rebalancing

import logger from '../shared/logger';
import { SafekeepingFundOrchestrator, createSafekeepingFundOrchestrator } from './graph';
import { MultiChainWalletManager } from './dex/multi-chain-wallet-manager';
import { DEFAULT_CYCLE_INTERVAL } from './constants';
import type { MultiChainWalletConfig } from './types';
import { bootstrapSafekeepingWalletConfig } from './wallet-bootstrap';
import messageBus from '../shared/message-bus';

/**
 * Safekeeping Fund Agent
 * Runs continuously, monitoring and rebalancing across DEXs
 */
export class SafekeepingFundAgent {
  private orchestrator: SafekeepingFundOrchestrator | null = null;
  private walletManager: MultiChainWalletManager | null = null;
  private isRunning: boolean = false;
  private cycleInterval: number;
  private cycleCount: number = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private config: MultiChainWalletConfig,
    cycleInterval?: number
  ) {
    this.cycleInterval = cycleInterval || DEFAULT_CYCLE_INTERVAL;
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    logger.info('[SafekeepingAgent] Initializing Safekeeping Fund Agent');

    try {
      // Initialize wallet manager
      this.walletManager = new MultiChainWalletManager(this.config);
      await this.walletManager.initialize();

      // Create orchestrator
      this.orchestrator = new SafekeepingFundOrchestrator(this.walletManager);

      // Register message bus handlers
      this.registerMessageBusHandlers();

      logger.info('[SafekeepingAgent] Initialization complete');
    } catch (error) {
      logger.error(`[SafekeepingAgent] Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Start the agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[SafekeepingAgent] Agent is already running');
      return;
    }

    logger.info('[SafekeepingAgent] Starting Safekeeping Fund Agent');
    this.isRunning = true;

    // Publish start event
    await messageBus.publish('safekeeping:cycle:start', {
      timestamp: new Date(),
      cycleInterval: this.cycleInterval,
    });

    // Start the cycle loop
    this.runCycleLoop();
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    logger.info('[SafekeepingAgent] Stopping Safekeeping Fund Agent');

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
    await messageBus.publish('safekeeping:cycle:stop', {
      timestamp: new Date(),
      cyclesCompleted: this.cycleCount,
    });

    logger.info(`[SafekeepingAgent] Stopped after ${this.cycleCount} cycles`);
  }

  /**
   * Run the continuous cycle loop
   */
  private runCycleLoop(): void {
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
        logger.error(`[SafekeepingAgent] Cycle error: ${error}`);

        // Continue running even if a cycle fails
        if (this.isRunning) {
          this.timer = setTimeout(() => this.runCycleLoop(), this.cycleInterval);
        }
      });
  }

  /**
   * Run a single rebalancing cycle
   */
  private async runSingleCycle(): Promise<void> {
    if (!this.orchestrator) {
      throw new Error('Orchestrator not initialized');
    }

    const startTime = Date.now();

    try {
      logger.info(`[SafekeepingAgent] Starting cycle ${this.cycleCount + 1}`);

      const result = await this.orchestrator.invoke();

      const duration = Date.now() - startTime;

      // Publish completion event
      await messageBus.publish('safekeeping:cycle:complete', {
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
      logger.info(
        `[SafekeepingAgent] Cycle ${this.cycleCount + 1} complete in ${duration}ms. ` +
        `Step: ${result.currentStep}, ` +
        `Value: $${result.totalValue.toFixed(2)}, ` +
        `APR: ${result.totalEffectiveAPR.toFixed(2)}%, ` +
        `Rebalances: ${result.executionResults.length}`
      );

      this.cycleCount++;

    } catch (error) {
      logger.error(`[SafekeepingAgent] Cycle ${this.cycleCount + 1} failed: ${error}`);

      // Publish error event
      await messageBus.publish('safekeeping:cycle:error', {
        cycleNumber: this.cycleCount + 1,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
    }
  }

  /**
   * Register message bus event handlers
   */
  private registerMessageBusHandlers(): void {
    // Handle emergency halt commands
    // (implementation would subscribe to message bus)
  }

  /**
   * Get agent status
   */
  getStatus(): {
    isRunning: boolean;
    cycleCount: number;
    cycleInterval: number;
    healthStatus: ReturnType<SafekeepingFundOrchestrator['getHealthStatus']> | null;
  } {
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
  async forceCycle(): Promise<void> {
    logger.info('[SafekeepingAgent] Force triggering cycle');
    await this.runSingleCycle();
  }

  /**
   * Get wallet manager
   */
  getWalletManager(): MultiChainWalletManager | null {
    return this.walletManager;
  }

  /**
   * Get orchestrator
   */
  getOrchestrator(): SafekeepingFundOrchestrator | null {
    return this.orchestrator;
  }
}

/**
 * Main entry point when run directly
 */
export async function main(): Promise<void> {
  logger.info('[SafekeepingAgent] ==================================================');
  logger.info('[SafekeepingAgent] Safekeeping Fund Agent Starting');
  logger.info('[SafekeepingAgent] ==================================================');

  // Load configuration from env/local wallet store, auto-generating wallets when missing.
  const walletBootstrap = bootstrapSafekeepingWalletConfig();
  const config: MultiChainWalletConfig = walletBootstrap.config;

  // Check if at least one chain is configured
  const hasConfig = config.ethereum || config.bsc || config.solana;

  if (!hasConfig) {
    logger.error(
      '[SafekeepingAgent] No chain configured. ' +
      'Set ETH_PRIVATE_KEY/BSC_PRIVATE_KEY/SOLANA_SECRET_KEY or enable SAFEKEEPING_AUTO_CREATE_WALLETS=true.'
    );
    process.exit(1);
  }

  logger.info(`[SafekeepingAgent] Wallet store path: ${walletBootstrap.walletStorePath}`);
  for (const chain of Object.keys(walletBootstrap.addresses) as Array<'ethereum' | 'bsc' | 'solana'>) {
    const address = walletBootstrap.addresses[chain];
    const source = walletBootstrap.chainSources[chain] || 'missing';
    logger.info(`[SafekeepingAgent] ${chain} funding address (${source}): ${address}`);
  }

  if (walletBootstrap.generatedChains.length > 0) {
    logger.warn(
      '[SafekeepingAgent] Generated new wallet(s) for: ' +
      `${walletBootstrap.generatedChains.join(', ')}. ` +
      'Fund these addresses before enabling active liquidity operations.'
    );
  }

  // Create and start agent
  const agent = new SafekeepingFundAgent(
    config,
    parseInt(process.env.SAFEKEEPING_CYCLE_INTERVAL || '300000', 10) // 5 minutes default
  );

  try {
    await agent.initialize();
    await agent.start();

    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      logger.info('[SafekeepingAgent] Received SIGINT, shutting down...');
      await agent.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('[SafekeepingAgent] Received SIGTERM, shutting down...');
      await agent.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error(`[SafekeepingAgent] Fatal error: ${error}`);
    process.exit(1);
  }
}

// Run main if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
