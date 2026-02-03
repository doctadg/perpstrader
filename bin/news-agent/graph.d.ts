import { NewsAgentState, createInitialNewsState, TRADING_CATEGORIES } from './state';
export { NewsAgentState, createInitialNewsState, TRADING_CATEGORIES };
/**
 * News Orchestrator - LangGraph-based news processing pipeline
 * Implements layered filtering with fail-fast behavior
 */
export declare class NewsOrchestrator {
    private consecutiveErrors;
    private maxConsecutiveErrors;
    /**
     * Execute one full news cycle with enhanced error handling
     */
    invoke(initialState: NewsAgentState): Promise<NewsAgentState>;
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
export declare function buildNewsGraph(): NewsOrchestrator;
/**
 * Run a full news cycle across all trading categories
 */
export declare function runNewsCycle(): Promise<NewsAgentState>;
/**
 * Run a single category news cycle
 */
export declare function runSingleCategoryCycle(category: import('../shared/types').NewsCategory, queriesPerCategory?: number): Promise<NewsAgentState>;
export default buildNewsGraph;
//# sourceMappingURL=graph.d.ts.map