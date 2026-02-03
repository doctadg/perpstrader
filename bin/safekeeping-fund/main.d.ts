import { SafekeepingFundOrchestrator } from './graph';
import { MultiChainWalletManager } from './dex/multi-chain-wallet-manager';
import type { MultiChainWalletConfig } from './types';
/**
 * Safekeeping Fund Agent
 * Runs continuously, monitoring and rebalancing across DEXs
 */
export declare class SafekeepingFundAgent {
    private config;
    private orchestrator;
    private walletManager;
    private isRunning;
    private cycleInterval;
    private cycleCount;
    private timer;
    constructor(config: MultiChainWalletConfig, cycleInterval?: number);
    /**
     * Initialize the agent
     */
    initialize(): Promise<void>;
    /**
     * Start the agent
     */
    start(): Promise<void>;
    /**
     * Stop the agent
     */
    stop(): Promise<void>;
    /**
     * Run the continuous cycle loop
     */
    private runCycleLoop;
    /**
     * Run a single rebalancing cycle
     */
    private runSingleCycle;
    /**
     * Register message bus event handlers
     */
    private registerMessageBusHandlers;
    /**
     * Get agent status
     */
    getStatus(): {
        isRunning: boolean;
        cycleCount: number;
        cycleInterval: number;
        healthStatus: ReturnType<SafekeepingFundOrchestrator['getHealthStatus']> | null;
    };
    /**
     * Force trigger a cycle
     */
    forceCycle(): Promise<void>;
    /**
     * Get wallet manager
     */
    getWalletManager(): MultiChainWalletManager | null;
    /**
     * Get orchestrator
     */
    getOrchestrator(): SafekeepingFundOrchestrator | null;
}
/**
 * Main entry point when run directly
 */
export declare function main(): Promise<void>;
//# sourceMappingURL=main.d.ts.map