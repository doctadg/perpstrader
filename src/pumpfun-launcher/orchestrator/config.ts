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

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  launchIntervalMs: 30 * 60 * 1000,   // 30 min
  dailyBudgetSol: 2.0,
  buyAmountSolPerWallet: 0.05,
  numBuyerWallets: 10,
  jitoTipSol: 0.005,
  targetMcapUsd: 5000,
  printterminalUrl: 'http://localhost:3001',
  narrativeCooldownMs: 24 * 60 * 60 * 1000, // 24h
  dataDir: './data/pumpfun-launcher',
  minNarrativeScore: 30,
};
