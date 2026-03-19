export interface NewTokenEvent {
    tokenMint: string;
    tokenSymbol: string;
    tokenName: string;
    uri: string;
    creator: string;
    timestamp: Date;
    bondingCurveAddress: string;
}
export interface SnipeCandidate {
    event: NewTokenEvent;
    score: number;
    recommendation: string;
    buyExecuted: boolean;
    buyResult?: any;
}
type TokenCallback = (event: NewTokenEvent) => void;
type SnipeCallback = (candidate: SnipeCandidate) => void;
/**
 * WebSocket-based pump.fun token snipe service
 * Detects new launches and optionally auto-buys high-confidence tokens
 */
declare class SnipeService {
    private connection;
    private wsSubscription;
    private running;
    private tokenCallbacks;
    private snipeCallbacks;
    private processedMints;
    private recentTokens;
    private snipeQueue;
    private analysisQueue;
    private maxSnipePerHour;
    private snipeCountThisHour;
    private lastHourReset;
    private minScoreToBuy;
    private solPerSnipe;
    private cooldownMs;
    private lastSnipeTime;
    private tokenPrices;
    constructor();
    onToken(callback: TokenCallback): void;
    onSnipe(callback: SnipeCallback): void;
    /**
     * Start the WebSocket listener
     */
    start(): Promise<void>;
    /**
     * Subscribe to pump.fun program logs via WebSocket
     * Detects Create event which fires on new token launches
     */
    private subscribeToPumpFunLogs;
    /**
     * Parse a Create event from program logs
     * Extracts token mint, name, symbol from the log data
     */
    private parseCreateEvent;
    /**
     * HTTP polling fallback when WebSocket fails
     * Checks pump.fun frontend API every few seconds
     */
    private startHttpPolling;
    /**
     * Process the analysis queue -- scores tokens and decides whether to snipe
     * Runs in background, processing one token at a time
     */
    private processAnalysisQueue;
    /**
     * Evaluate a token using quick heuristics and decide whether to snipe
     * This is the fast path -- full AI analysis happens in the background pipeline
     */
    private evaluateAndSnipe;
    /**
     * Execute a snipe (buy on bonding curve)
     */
    private executeSnipe;
    /**
     * Process queued snipes (ones that were rate-limited)
     */
    private processSnipeQueue;
    /**
     * Paper mode: simulate price movements for open positions
     * Random walk with drift, checking TP levels
     */
    private startPriceSimulation;
    private resetHourlyCountIfNeeded;
    stop(): void;
    getStatus(): {
        running: boolean;
        recentTokensCount: number;
        openPositions: number;
        snipesThisHour: number;
        maxSnipesPerHour: number;
        mode: string;
        queueDepth: number;
        processedMintsCount: number;
    };
}
declare const snipeService: SnipeService;
export default snipeService;
//# sourceMappingURL=snipe-service.d.ts.map