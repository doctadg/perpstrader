import { MultiChainWalletManager } from './dex/multi-chain-wallet-manager';
import { createInitialState, updateState, addThought, addError, isStateHealthy, type SafekeepingFundState } from './state';
/**
 * Safekeeping Fund Orchestrator
 * Runs the autonomous rebalancing pipeline with circuit breaker protection
 */
export declare class SafekeepingFundOrchestrator {
    private walletManager;
    private consecutiveErrors;
    private maxConsecutiveErrors;
    private cycleNumber;
    constructor(walletManager: MultiChainWalletManager);
    /**
     * Execute one full rebalancing cycle
     */
    invoke(initialState?: SafekeepingFundState): Promise<SafekeepingFundState>;
    /**
     * Execute a node with circuit breaker protection and fallback handling
     */
    private safeExecute;
    /**
     * Get fallback result when a node fails
     */
    private getFallbackResult;
    /**
     * Register circuit breakers for this orchestrator
     */
    private registerCircuitBreakers;
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
    /**
     * Get the wallet manager
     */
    getWalletManager(): MultiChainWalletManager;
    /**
     * Get current cycle number
     */
    getCycleNumber(): number;
}
/**
 * Create and initialize the safekeeping fund orchestrator
 */
export declare function createSafekeepingFundOrchestrator(walletConfig: import('./types').MultiChainWalletConfig): Promise<SafekeepingFundOrchestrator>;
/**
 * Run a single rebalancing cycle
 */
export declare function runRebalancingCycle(orchestrator: SafekeepingFundOrchestrator): Promise<SafekeepingFundState>;
export type { SafekeepingFundState };
export { createInitialState, updateState, addThought, addError, isStateHealthy };
//# sourceMappingURL=graph.d.ts.map