/**
 * Position Manager Types
 * Tracks open token positions and manages exit strategies for pump.fun launcher
 */
export interface Position {
    /** Token mint address */
    mint: string;
    /** Token symbol */
    symbol: string;
    /** Market cap at buy time in USD */
    buyMcap: number;
    /** Current market cap in USD (updated via WebSocket) */
    currentMcap: number;
    /** Target market cap for exit in USD */
    targetMcap: number;
    /** Extended target for momentum hold */
    extendedTargetMcap: number;
    /** Timestamp when position was opened */
    buyTimestamp: number;
    /** Wallet addresses holding tokens */
    walletAddresses: string[];
    /** Token amounts per wallet */
    tokenAmounts: Map<string, bigint>;
    /** Peak market cap seen (for stop loss) */
    peakMcap: number;
    /** SOL price at entry (for mcap calc) */
    solPriceAtEntry: number;
    /** Current exit strategy in effect */
    exitStrategy: ExitStrategy;
    /** Price history for momentum detection: { timestamp, mcap } */
    priceHistory: Array<{
        timestamp: number;
        mcap: number;
    }>;
    /** Whether position is being closed */
    closing: boolean;
}
export declare enum ExitStrategy {
    /** Default: sell at target mcap */
    FAST_DUMP = "FAST_DUMP",
    /** Price still climbing fast — extend target */
    MOMENTUM_HOLD = "MOMENTUM_HOLD",
    /** Time exceeded — force sell */
    TIME_STOP = "TIME_STOP",
    /** Mcap dropped 50% from peak — emergency sell */
    STOP_LOSS = "STOP_LOSS"
}
export interface PositionConfig {
    /** Target market cap in USD for exit (default 5000) */
    targetMcapUsd: number;
    /** Extended target for momentum holds (default 10000) */
    extendedTargetMcapUsd: number;
    /** Maximum hold time in ms (default 30 min) */
    maxHoldTimeMs: number;
    /** Stop loss: sell if mcap drops this % from peak (default 0.5 = 50%) */
    stopLossPct: number;
    /** Momentum threshold: if price 2x'd in 5 min, extend target */
    momentumMultiplier: number;
    /** Momentum lookback window in ms */
    momentumWindowMs: number;
    /** Whether to sweep SOL back to main wallet after sell */
    sweepAfterSell: boolean;
    /** Main wallet to sweep SOL to */
    mainWalletAddress: string;
    /** Slippage for sells in bps (default 1000 = 10%) */
    sellSlippageBps: number;
    /** Priority fee in microLamports */
    priorityFeeMicroLamports: number;
    /** Poll interval for checking positions in ms */
    pollIntervalMs: number;
}
export interface SellResult {
    success: boolean;
    mint: string;
    symbol: string;
    walletResults: Array<{
        walletAddress: string;
        success: boolean;
        signature?: string;
        tokensSold: bigint;
        solReceived?: number;
        error?: string;
    }>;
    totalSolReceived: number;
    exitStrategy: ExitStrategy;
    timestamp: number;
    /** Bundle ID if submitted via Jito */
    bundleId?: string;
}
export interface TradeEvent {
    signature: string;
    mint: string;
    traderPublicKey: string;
    txType: 'buy' | 'sell';
    tokenAmount?: number;
    solAmount?: number;
    bondingCurveKey?: string;
    vTokensInBondingCurve?: number;
    vSolInBondingCurve?: number;
    marketCapSol?: number;
}
export interface BondingCurveState {
    virtualTokenReserves: bigint;
    virtualSolReserves: bigint;
    realTokenReserves: bigint;
    realSolReserves: bigint;
    tokenTotalSupply: bigint;
    complete: boolean;
}
//# sourceMappingURL=types.d.ts.map