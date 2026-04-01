import { FeesProfile } from '../../shared/types';
export interface LauncherConfig {
    /** Max concurrent runs */
    maxConcurrentRuns: number;
    /** Default SOL commitment level */
    commitment: 'processed' | 'confirmed' | 'finalized';
    /** Blockhash staleness threshold in slots */
    blockhashStaleSlots: number;
    /** Default fee profile when plan says "auto" */
    autoFeeProfile: {
        microLamportsPerCU: number;
        computeUnitLimit: number;
    };
    /** How often to poll slot tracker (ms) */
    slotPollIntervalMs: number;
    /** Abort if plan execution exceeds this (ms) */
    planTimeoutMs: number;
    /** Retry count for individual step sends */
    stepSendRetries: number;
    /** Delay between retries (ms) */
    stepRetryDelayMs: number;
    /** Jito bundle tip floor (SOL) for burst route */
    jitoTipFloorSol: number;
    /** Jito bundle tip ceil (SOL) for burst route */
    jitoTipCeilSol: number;
}
export declare const DEFAULT_LAUNCHER_CONFIG: LauncherConfig;
export declare const DEFAULT_FEES_PROFILE: FeesProfile;
export declare const ORCHESTRATOR_DEFAULTS: {
    readonly launchIntervalMs: number;
    readonly dailyBudgetSol: 2;
    readonly buyAmountSolPerWallet: 0.05;
    readonly numBuyerWallets: 10;
    readonly jitoTipSol: 0.005;
    readonly targetMcapUsd: 5000;
    readonly printterminalUrl: "http://localhost:3001";
    readonly narrativeCooldownMs: number;
    readonly dataDir: "./data/pumpfun-launcher";
    readonly minNarrativeScore: 30;
};
export declare const POSITION_DEFAULTS: {
    readonly targetMcapUsd: 5000;
    readonly extendedTargetMcapUsd: 10000;
    readonly maxHoldTimeMs: number;
    readonly stopLossPct: 0.5;
    readonly momentumMultiplier: 2;
    readonly momentumWindowMs: number;
    readonly sweepAfterSell: true;
    readonly sellSlippageBps: 1000;
    readonly pollIntervalMs: 5000;
};
//# sourceMappingURL=defaults.d.ts.map