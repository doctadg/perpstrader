// Trading Agent Orchestrator
// Coordinates all nodes in the trading pipeline
// Enhanced with circuit breaker protection and improved error handling

import { AgentState, createInitialState, PatternMatch, StrategyIdea, MarketRegime } from './state';
import {
    marketDataNode,
    patternRecallNode,
    strategyIdeationNode,
    backtesterNode,
    strategySelectorNode,
    riskGateNode,
    executorNode,
    learnerNode,
} from './nodes';
import logger from '../shared/logger';
import circuitBreaker from '../shared/circuit-breaker';

// Re-export types for convenience
export { AgentState, createInitialState, PatternMatch, StrategyIdea, MarketRegime };

/**
 * Trading Graph Orchestrator
 * Runs all nodes in sequence with conditional branching
 * Enhanced with circuit breaker protection and comprehensive error handling
 */
export class TradingOrchestrator {
    private consecutiveErrors: number = 0;
    private maxConsecutiveErrors: number = 5;

    /**
     * Execute one full trading cycle with enhanced error handling
     */
    async invoke(initialState: AgentState): Promise<AgentState> {
        // Check circuit breakers before starting
        const executionBreaker = circuitBreaker.getBreakerStatus('execution');
        if (executionBreaker?.isOpen) {
            logger.warn('[Orchestrator] Execution circuit breaker is OPEN, skipping cycle');
            return {
                ...initialState,
                currentStep: 'SKIPPED_CIRCUIT_BREAKER',
                thoughts: [...initialState.thoughts, 'Cycle skipped: Execution circuit breaker is open'],
                errors: [...initialState.errors, 'Execution circuit breaker is open'],
            };
        }

        let state = { ...initialState };

        try {
            // Step 1: Fetch market data with circuit breaker protection
            state = { ...state, ...await this.safeExecute('market-data', () => marketDataNode(state)) };

            // Check if we have enough data to continue
            if (state.candles.length < 50 || !state.indicators) {
                logger.warn('[Orchestrator] Insufficient market data, ending cycle');
                return state;
            }

            // Step 2: Pattern recall (now re-enabled)
            state = { ...state, ...await this.safeExecute('pattern-recall', () => patternRecallNode(state)) };

            // Step 3: Strategy ideation using LLM with fallback
            state = { ...state, ...await this.safeExecute('strategy-ideation', () => strategyIdeationNode(state)) };

            // Step 4: Backtest strategies
            state = { ...state, ...await this.safeExecute('backtester', () => backtesterNode(state)) };

            // Step 5: Select best strategy
            state = { ...state, ...await this.safeExecute('strategy-selector', () => strategySelectorNode(state)) };

            // Step 6: Risk evaluation (critical path)
            state = { ...state, ...await this.safeExecute('risk-gate', () => riskGateNode(state), true) };

            // Conditional: Execute if approved
            if (state.shouldExecute && state.signal && state.riskAssessment?.approved) {
                logger.info('[Orchestrator] Step 7: Execution');
                state = { ...state, ...await this.safeExecute('executor', () => executorNode(state), true) };

                // Reset error counter on successful execution
                this.consecutiveErrors = 0;

                // Conditional: Learn from execution
                if (state.shouldLearn && state.executionResult) {
                    logger.info('[Orchestrator] Step 8: Learning');
                    state = { ...state, ...await this.safeExecute('learner', () => learnerNode(state)) };
                }
            } else {
                logger.info('[Orchestrator] Skipping execution (no approved signal)');
            }

            return state;

        } catch (error) {
            this.consecutiveErrors++;
            logger.error('[Orchestrator] Cycle failed:', error);

            const errorMsg = error instanceof Error ? error.message : String(error);

            // Check if we need to open circuit breaker
            if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                circuitBreaker.openBreaker('execution');
                logger.error(`[Orchestrator] Opened execution circuit breaker after ${this.consecutiveErrors} consecutive errors`);
            }

            return {
                ...state,
                errors: [...state.errors, `Orchestrator error: ${errorMsg}`],
                currentStep: 'ERROR',
                thoughts: [
                    ...state.thoughts,
                    `Cycle failed with error: ${errorMsg}`,
                    `Consecutive errors: ${this.consecutiveErrors}/${this.maxConsecutiveErrors}`,
                ],
            };
        }
    }

    /**
     * Execute a node with circuit breaker protection and fallback handling
     */
    private async safeExecute<T>(
        nodeName: string,
        fn: () => Promise<T>,
        isCritical: boolean = false
    ): Promise<T> {
        const breakerName = isCritical ? 'execution' : nodeName;

        return circuitBreaker.execute(
            breakerName,
            fn,
            isCritical ? undefined : () => this.getFallbackResult(nodeName)
        );
    }

    /**
     * Get fallback result when a node fails
     */
    private async getFallbackResult(nodeName: string): Promise<any> {
        logger.warn(`[Orchestrator] Using fallback for ${nodeName}`);

        switch (nodeName) {
            case 'pattern-recall':
                return {
                    currentStep: 'PATTERN_RECALL_FALLBACK',
                    similarPatterns: [],
                    thoughts: ['Pattern recall failed, continuing without pattern data'],
                };

            case 'strategy-ideation':
                return {
                    currentStep: 'STRATEGY_IDEATION_FALLBACK',
                    strategyIdeas: [],
                    thoughts: ['Strategy ideation failed, will use backtest data only'],
                };

            case 'backtester':
                return {
                    currentStep: 'BACKTESTER_FALLBACK',
                    backtestResults: [],
                    thoughts: ['Backtesting failed, using default strategies'],
                };

            case 'learner':
                return {
                    currentStep: 'LEARNING_SKIPPED',
                    thoughts: ['Learning failed, but cycle completed successfully'],
                };

            default:
                return {
                    currentStep: `${nodeName.toUpperCase()}_FALLBACK`,
                    thoughts: [`Node ${nodeName} failed, using fallback`],
                };
        }
    }

    /**
     * Reset error counters
     */
    resetErrorCounters(): void {
        this.consecutiveErrors = 0;
        circuitBreaker.resetBreaker('execution');
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
        const executionBreaker = circuitBreaker.getBreakerStatus('execution');
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
}

// Singleton instance
const orchestrator = new TradingOrchestrator();

/**
 * Build and return the trading orchestrator
 */
export function buildTradingGraph(): TradingOrchestrator {
    return orchestrator;
}

/**
 * Run a single trading cycle with enhanced error handling
 */
export async function runTradingCycle(symbol: string, timeframe: string): Promise<AgentState> {
    logger.info(`[Orchestrator] Starting trading cycle for ${symbol} ${timeframe}`);

    const initialState = createInitialState(symbol, timeframe);
    const result = await orchestrator.invoke(initialState);

    logger.info(`[Orchestrator] Cycle completed. Steps: ${result.thoughts.length}, Errors: ${result.errors.length}`);

    // Log final thoughts
    for (const thought of result.thoughts.slice(-5)) {
        logger.debug(`  → ${thought}`);
    }

    // Log any errors
    if (result.errors.length > 0) {
        logger.warn(`[Orchestrator] Cycle had ${result.errors.length} errors:`);
        for (const error of result.errors.slice(-3)) {
            logger.warn(`  ✗ ${error}`);
        }
    }

    return result;
}

export default buildTradingGraph;
