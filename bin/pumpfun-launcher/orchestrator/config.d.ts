/**
 * Orchestrator Configuration
 */
export interface OrchestratorConfig {
    /** Cycle interval in ms (default 30 min) */
    launchIntervalMs: number;
    /** Max SOL to spend per day */
    dailyBudgetSol: number;
    /** SOL per buyer wallet (default 0.05) */
    buyAmountSolPerWallet: number;
    /** Number of buyer wallets (default 10) */
    numBuyerWallets: number;
    /** Jito tip in SOL */
    jitoTipSol: number;
    /** Target market cap USD for position manager (default 5000) */
    targetMcapUsd: number;
    /** printterminal API URL */
    printterminalUrl: string;
    /** Cooldown before reusing the same narrative (ms, default 24h) */
    narrativeCooldownMs: number;
    /** Directory for persistent data */
    dataDir: string;
    /** Minimum narrative score to consider */
    minNarrativeScore: number;
}
export declare const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig;
//# sourceMappingURL=config.d.ts.map