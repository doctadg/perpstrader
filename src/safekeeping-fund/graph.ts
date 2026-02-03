// Safekeeping Fund System - LangGraph Orchestrator
// Coordinates all nodes in the safekeeping fund rebalancing pipeline

import logger from '../shared/logger';
import circuitBreaker from '../shared/circuit-breaker';
import { MultiChainWalletManager } from './dex/multi-chain-wallet-manager';
import {
  createInitialState,
  updateState,
  addThought,
  addError,
  isStateHealthy,
  getStateSummary,
  type SafekeepingFundState,
} from './state';
import {
  marketMonitorNode,
  aprCalculatorNode,
  aiAnalysisNode,
  rebalancePlannerNode,
  safetyGateNode,
  executeNode,
  learningNode,
} from './nodes';

/**
 * Safekeeping Fund Orchestrator
 * Runs the autonomous rebalancing pipeline with circuit breaker protection
 */
export class SafekeepingFundOrchestrator {
  private walletManager: MultiChainWalletManager;
  private consecutiveErrors: number = 0;
  private maxConsecutiveErrors: number = 5;
  private cycleNumber: number = 0;

  constructor(walletManager: MultiChainWalletManager) {
    this.walletManager = walletManager;
    this.registerCircuitBreakers();
  }

  /**
   * Execute one full rebalancing cycle
   */
  async invoke(initialState?: SafekeepingFundState): Promise<SafekeepingFundState> {
    this.cycleNumber++;

    // Use provided state or create new one
    let state = initialState || createInitialState(0);

    logger.info(
      `[Orchestrator] Starting cycle ${this.cycleNumber} (${state.cycleId})`
    );

    // Check if wallet manager is ready
    if (!this.walletManager.isReady()) {
      logger.warn('[Orchestrator] Wallet manager not ready, skipping cycle');
      return {
        ...state,
        currentStep: 'SKIPPED_WALLET_NOT_READY',
        errors: ['Wallet manager not initialized'],
      };
    }

    // Check circuit breakers before starting
    const executionBreaker = circuitBreaker.getBreakerStatus('safekeeping-execution');
    if (executionBreaker?.isOpen) {
      logger.warn('[Orchestrator] Execution circuit breaker is OPEN, skipping cycle');
      return updateState(state, {
        currentStep: 'SKIPPED_CIRCUIT_BREAKER',
        thoughts: [...state.thoughts, 'Cycle skipped: Execution circuit breaker is open'],
        errors: [...state.errors, 'Execution circuit breaker is open'],
      });
    }

    try {
      // Step 1: Market Monitor - Fetch pool states from all DEXs
      state = updateState(
        state,
        await this.safeExecute('market-monitor', () =>
          marketMonitorNode(state, this.walletManager)
        )
      );

      // Step 2: APR Calculator - Calculate effective APRs
      state = updateState(
        state,
        await this.safeExecute('apr-calculator', () => aprCalculatorNode(state))
      );

      // Step 3: AI Analysis - Get AI-powered insights
      state = updateState(
        state,
        await this.safeExecute('ai-analysis', () => aiAnalysisNode(state))
      );

      // Step 4: Rebalance Planner - Generate rebalance actions
      state = updateState(
        state,
        await this.safeExecute('rebalance-planner', () => rebalancePlannerNode(state))
      );

      // Step 5: Safety Gate - Validate all safety conditions
      state = updateState(
        state,
        await this.safeExecute('safety-gate', () => safetyGateNode(state), true)
      );

      // Step 6: Execute - Perform the rebalance if approved
      if (state.selectedRebalance && !state.isPaused && isStateHealthy(state)) {
        logger.info(`[Orchestrator] Executing rebalance: ${state.selectedRebalance.type}`);
        state = updateState(
          state,
          await this.safeExecute('executor', () =>
            executeNode(state, this.walletManager)
          , true)
        );
        this.consecutiveErrors = 0; // Reset error counter on successful execution
      } else {
        logger.info('[Orchestrator] No execution - conditions not met');
        state = addThought(state, 'No execution - rebalance not triggered or blocked by safety checks');
      }

      // Step 7: Learning - Analyze results and update metrics
      state = updateState(
        state,
        await this.safeExecute('learner', () => learningNode(state))
      );

      // Log final summary
      logger.info(getStateSummary(state));

      return state;

    } catch (error) {
      this.consecutiveErrors++;
      const errorMsg = error instanceof Error ? error.message : String(error);

      logger.error(`[Orchestrator] Cycle failed: ${errorMsg}`);

      // Check if we need to open circuit breaker
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        circuitBreaker.openBreaker('safekeeping-execution');
        logger.error(
          `[Orchestrator] Opened execution circuit breaker after ${this.consecutiveErrors} consecutive errors`
        );
      }

      return updateState(state, {
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
  private async safeExecute(
    nodeName: string,
    fn: () => Promise<Partial<SafekeepingFundState>>,
    isCritical: boolean = false
  ): Promise<Partial<SafekeepingFundState>> {
    const breakerName = isCritical ? 'safekeeping-execution' : nodeName;

    return circuitBreaker.execute(
      breakerName,
      fn,
      isCritical ? undefined : () => this.getFallbackResult(nodeName)
    );
  }

  /**
   * Get fallback result when a node fails
   */
  private async getFallbackResult(nodeName: string): Promise<Partial<SafekeepingFundState>> {
    logger.warn(`[Orchestrator] Using fallback for ${nodeName}`);

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
  private registerCircuitBreakers(): void {
    const breakers = [
      { name: 'safekeeping-execution', threshold: 3, timeout: 60000 },
      { name: 'safekeeping-apr-fetch', threshold: 10, timeout: 120000 },
      { name: 'safekeeping-ethereum-rpc', threshold: 5, timeout: 30000 },
      { name: 'safekeeping-bsc-rpc', threshold: 5, timeout: 30000 },
      { name: 'safekeeping-solana-rpc', threshold: 5, timeout: 30000 },
      { name: 'safekeeping-ai-analysis', threshold: 5, timeout: 90000 },
    ];

    for (const breaker of breakers) {
      circuitBreaker.registerBreaker(breaker.name, {
        threshold: breaker.threshold,
        timeout: breaker.timeout,
      });
    }

    logger.info('[Orchestrator] Circuit breakers registered');
  }

  /**
   * Reset error counters
   */
  resetErrorCounters(): void {
    this.consecutiveErrors = 0;
    circuitBreaker.resetBreaker('safekeeping-execution');
    logger.info('[Orchestrator] Error counters reset');
  }

  /**
   * Get orchestrator health status
   */
  getHealthStatus(): {
    consecutiveErrors: number;
    maxConsecutiveErrors: number;
    executionBreakerOpen: boolean;
    status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  } {
    const executionBreaker = circuitBreaker.getBreakerStatus('safekeeping-execution');
    const executionBreakerOpen = executionBreaker?.isOpen || false;

    let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';

    if (executionBreakerOpen || this.consecutiveErrors >= this.maxConsecutiveErrors) {
      status = 'CRITICAL';
    } else if (this.consecutiveErrors > 0) {
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
  getWalletManager(): MultiChainWalletManager {
    return this.walletManager;
  }

  /**
   * Get current cycle number
   */
  getCycleNumber(): number {
    return this.cycleNumber;
  }
}

/**
 * Create and initialize the safekeeping fund orchestrator
 */
export async function createSafekeepingFundOrchestrator(
  walletConfig: import('./types').MultiChainWalletConfig
): Promise<SafekeepingFundOrchestrator> {
  // Create wallet manager
  const walletManager = new MultiChainWalletManager(walletConfig);
  await walletManager.initialize();

  // Create and return orchestrator
  return new SafekeepingFundOrchestrator(walletManager);
}

/**
 * Run a single rebalancing cycle
 */
export async function runRebalancingCycle(
  orchestrator: SafekeepingFundOrchestrator
): Promise<SafekeepingFundState> {
  logger.info('[Orchestrator] Starting safekeeping fund cycle');

  const result = await orchestrator.invoke();

  logger.info(
    `[Orchestrator] Cycle ${orchestrator.getCycleNumber()} complete. ` +
    `Step: ${result.currentStep}, ` +
    `Rebalances: ${result.executionResults.length}, ` +
    `Errors: ${result.errors.length}`
  );

  return result;
}

// Re-export types
export type { SafekeepingFundState };
export { createInitialState, updateState, addThought, addError, isStateHealthy };
