import { AgentState, createInitialState, PatternMatch, StrategyIdea, MarketRegime } from './state';
export { AgentState, createInitialState, PatternMatch, StrategyIdea, MarketRegime };
/**
 * Trading Graph Orchestrator
 * Runs all nodes in sequence with conditional branching
 * Enhanced with circuit breaker protection and comprehensive error handling
 */
export declare class TradingOrchestrator {
    private consecutiveErrors;
    private maxConsecutiveErrors;
    /**
     * Execute one full trading cycle with enhanced error handling
     */
    invoke(initialState: AgentState): Promise<AgentState>;
    /**
     * Execute a node with circuit breaker protection and fallback handling
     */
    private safeExecute;
    /**
     * Get fallback result when a node fails
     */
    private getFallbackResult;
    /**
     * Reset error counters
     */
    resetErrorCounters(): void;
    /**
     * Get orchestrator health status
     */
    getHealthStatus(): {
        consecutiveErrors: number;
        maxConsecutiveErrors: number;
        executionBreakerOpen: boolean;
        status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    };
}
/**
 * Build and return the trading orchestrator
 */
export declare function buildTradingGraph(): TradingOrchestrator;
/**
 * Run a single trading cycle with enhanced error handling
 */
export declare function runTradingCycle(symbol: string, timeframe: string): Promise<AgentState>;
export default buildTradingGraph;
//# sourceMappingURL=graph.d.ts.map