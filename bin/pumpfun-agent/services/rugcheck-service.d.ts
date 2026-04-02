export interface RugCheckRisk {
    name: string;
    value: string;
    description: string;
    score: number;
    level: 'danger' | 'warn' | 'info';
}
export interface RugCheckTopHolder {
    address: string;
    amount: number;
    decimals: number;
    pct: number;
    uiAmount: number;
    owner: string;
    insider: boolean;
}
export interface RugCheckReport {
    mint: string;
    tokenProgram: string;
    creator: string | null;
    creatorBalance: number;
    token: {
        mintAuthority: string | null;
        supply: number;
        decimals: number;
        isInitialized: boolean;
        freezeAuthority: string | null;
    };
    tokenMeta: {
        name: string;
        symbol: string;
        uri: string;
        mutable: boolean;
        updateAuthority: string;
    };
    topHolders: RugCheckTopHolder[];
    risks: RugCheckRisk[];
    score: number;
    score_normalised: number;
    lpLockedPct: number | null;
    lockers: Record<string, any>;
    lockerScanStatus: string;
    markets: any[];
    totalMarketLiquidity: number;
    totalStableLiquidity: number;
    totalLPProviders: number;
    totalHolders: number;
    price: number;
    rugged: boolean;
    graphInsidersDetected: number;
    insiderNetworks: any[] | null;
    creatorTokens: any[] | null;
    launchpad: string | null;
    deployPlatform: string;
    verification: {
        mint: string;
        name: string;
        symbol: string;
        jup_verified: boolean;
        jup_strict: boolean;
        links: string[];
    };
    transferFee: {
        pct: number;
        maxAmount: number;
        authority: string;
    };
}
export interface RugCheckSummary {
    tokenProgram: string;
    tokenType: string;
    risks: RugCheckRisk[];
    score: number;
    score_normalised: number;
    lpLockedPct: number | null;
}
export type RugVerdict = 'SAFE' | 'RUGGED' | 'HIGH_RISK' | 'MEDIUM_RISK' | 'UNKNOWN';
export interface RugCheckResult {
    verdict: RugVerdict;
    report: RugCheckReport | null;
    summary: RugCheckSummary | null;
    rejectReasons: string[];
    scorePenalty: number;
}
/**
 * Get full RugCheck report for a token mint
 * Includes top holders, insider networks, risks, LP locks, transfer fees
 */
export declare function getFullReport(mintAddress: string): Promise<RugCheckReport | null>;
/**
 * Get RugCheck summary (score + risks only, lighter weight)
 */
export declare function getSummary(mintAddress: string): Promise<RugCheckSummary | null>;
/**
 * Evaluate a token against rug detection thresholds
 * Returns a verdict and list of reject reasons
 */
export declare function evaluateToken(mintAddress: string): Promise<RugCheckResult>;
/**
 * Quick check: is this token already confirmed as rugged?
 * Uses summary endpoint (lighter) for speed.
 */
export declare function isRugged(mintAddress: string): Promise<boolean>;
export interface RugCheckGateResult {
    pass: boolean;
    reason: string;
    report: RugCheckReport | null;
}
/**
 * RugCheck gate — quick pass/fail for security-node pipeline.
 * Uses evaluateToken internally, returns gate-compatible result.
 */
export declare function rugCheckGate(mintAddress: string, symbol?: string): Promise<RugCheckGateResult>;
/**
 * Extract red flags from a RugCheck report for AI analysis context.
 */
export declare function extractRugCheckRedFlags(report: RugCheckReport): string[];
/**
 * Convert RugCheck report to a 0-1 score factor for TokenAnalysis.
 * 1 = perfectly safe, 0 = extremely risky.
 */
export declare function rugCheckToScoreFactor(report: RugCheckReport): number;
declare const _default: {
    getFullReport: typeof getFullReport;
    getSummary: typeof getSummary;
    evaluateToken: typeof evaluateToken;
    isRugged: typeof isRugged;
    rugCheckGate: typeof rugCheckGate;
    extractRugCheckRedFlags: typeof extractRugCheckRedFlags;
    rugCheckToScoreFactor: typeof rugCheckToScoreFactor;
};
export default _default;
//# sourceMappingURL=rugcheck-service.d.ts.map