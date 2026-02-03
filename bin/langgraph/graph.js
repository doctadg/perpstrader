"use strict";
// Trading Agent Orchestrator
// Coordinates all nodes in the trading pipeline
// Enhanced with circuit breaker protection and improved error handling
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingOrchestrator = exports.createInitialState = void 0;
exports.buildTradingGraph = buildTradingGraph;
exports.runTradingCycle = runTradingCycle;
const state_1 = require("./state");
Object.defineProperty(exports, "createInitialState", { enumerable: true, get: function () { return state_1.createInitialState; } });
const nodes_1 = require("./nodes");
const logger_1 = __importDefault(require("../shared/logger"));
const circuit_breaker_1 = __importDefault(require("../shared/circuit-breaker"));
/**
 * Trading Graph Orchestrator
 * Runs all nodes in sequence with conditional branching
 * Enhanced with circuit breaker protection and comprehensive error handling
 */
class TradingOrchestrator {
    consecutiveErrors = 0;
    maxConsecutiveErrors = 5;
    /**
     * Execute one full trading cycle with enhanced error handling
     */
    async invoke(initialState) {
        // Check circuit breakers before starting
        const executionBreaker = circuit_breaker_1.default.getBreakerStatus('execution');
        if (executionBreaker?.isOpen) {
            logger_1.default.warn('[Orchestrator] Execution circuit breaker is OPEN, skipping cycle');
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
            state = { ...state, ...await this.safeExecute('market-data', () => (0, nodes_1.marketDataNode)(state)) };
            // Check if we have enough data to continue
            if (state.candles.length < 50 || !state.indicators) {
                logger_1.default.warn('[Orchestrator] Insufficient market data, ending cycle');
                return state;
            }
            // Step 2: Pattern recall (now re-enabled)
            state = { ...state, ...await this.safeExecute('pattern-recall', () => (0, nodes_1.patternRecallNode)(state)) };
            // Step 3: Strategy ideation using LLM with fallback
            state = { ...state, ...await this.safeExecute('strategy-ideation', () => (0, nodes_1.strategyIdeationNode)(state)) };
            // Step 4: Backtest strategies
            state = { ...state, ...await this.safeExecute('backtester', () => (0, nodes_1.backtesterNode)(state)) };
            // Step 5: Select best strategy
            state = { ...state, ...await this.safeExecute('strategy-selector', () => (0, nodes_1.strategySelectorNode)(state)) };
            // Step 6: Risk evaluation (critical path)
            state = { ...state, ...await this.safeExecute('risk-gate', () => (0, nodes_1.riskGateNode)(state), true) };
            // Conditional: Execute if approved
            if (state.shouldExecute && state.signal && state.riskAssessment?.approved) {
                logger_1.default.info('[Orchestrator] Step 7: Execution');
                state = { ...state, ...await this.safeExecute('executor', () => (0, nodes_1.executorNode)(state), true) };
                // Reset error counter on successful execution
                this.consecutiveErrors = 0;
                // Conditional: Learn from execution
                if (state.shouldLearn && state.executionResult) {
                    logger_1.default.info('[Orchestrator] Step 8: Learning');
                    state = { ...state, ...await this.safeExecute('learner', () => (0, nodes_1.learnerNode)(state)) };
                }
            }
            else {
                logger_1.default.info('[Orchestrator] Skipping execution (no approved signal)');
            }
            return state;
        }
        catch (error) {
            this.consecutiveErrors++;
            logger_1.default.error('[Orchestrator] Cycle failed:', error);
            const errorMsg = error instanceof Error ? error.message : String(error);
            // Check if we need to open circuit breaker
            if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                circuit_breaker_1.default.openBreaker('execution');
                logger_1.default.error(`[Orchestrator] Opened execution circuit breaker after ${this.consecutiveErrors} consecutive errors`);
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
    async safeExecute(nodeName, fn, isCritical = false) {
        const breakerName = isCritical ? 'execution' : nodeName;
        return circuit_breaker_1.default.execute(breakerName, fn, isCritical ? undefined : () => this.getFallbackResult(nodeName));
    }
    /**
     * Get fallback result when a node fails
     */
    async getFallbackResult(nodeName) {
        logger_1.default.warn(`[Orchestrator] Using fallback for ${nodeName}`);
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
    resetErrorCounters() {
        this.consecutiveErrors = 0;
        circuit_breaker_1.default.resetBreaker('execution');
        logger_1.default.info('[Orchestrator] Error counters reset');
    }
    /**
     * Get orchestrator health status
     */
    getHealthStatus() {
        const executionBreaker = circuit_breaker_1.default.getBreakerStatus('execution');
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
}
exports.TradingOrchestrator = TradingOrchestrator;
// Singleton instance
const orchestrator = new TradingOrchestrator();
/**
 * Build and return the trading orchestrator
 */
function buildTradingGraph() {
    return orchestrator;
}
/**
 * Run a single trading cycle with enhanced error handling
 */
async function runTradingCycle(symbol, timeframe) {
    logger_1.default.info(`[Orchestrator] Starting trading cycle for ${symbol} ${timeframe}`);
    const initialState = (0, state_1.createInitialState)(symbol, timeframe);
    const result = await orchestrator.invoke(initialState);
    logger_1.default.info(`[Orchestrator] Cycle completed. Steps: ${result.thoughts.length}, Errors: ${result.errors.length}`);
    // Log final thoughts
    for (const thought of result.thoughts.slice(-5)) {
        logger_1.default.debug(`  → ${thought}`);
    }
    // Log any errors
    if (result.errors.length > 0) {
        logger_1.default.warn(`[Orchestrator] Cycle had ${result.errors.length} errors:`);
        for (const error of result.errors.slice(-3)) {
            logger_1.default.warn(`  ✗ ${error}`);
        }
    }
    return result;
}
exports.default = buildTradingGraph;
//# sourceMappingURL=graph.js.map