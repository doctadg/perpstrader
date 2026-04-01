interface BondingCurveState {
    virtualTokenReserves: bigint;
    virtualSolReserves: bigint;
    realTokenReserves: bigint;
    realSolReserves: bigint;
    tokenTotalSupply: bigint;
    complete: boolean;
}
interface BuyQuote {
    solAmount: number;
    tokenAmount: number;
    pricePerToken: number;
    marketCapSol: number;
    bondingCurveProgress: number;
}
interface SellQuote {
    tokenAmount: number;
    solAmount: number;
    pricePerToken: number;
}
export interface SnipeResult {
    success: boolean;
    tokenAddress: string;
    txSignature?: string;
    solSpent: number;
    tokensReceived: number;
    error?: string;
    paperMode: boolean;
    timestamp: Date;
}
export interface SellResult {
    success: boolean;
    tokenAddress: string;
    txSignature?: string;
    tokensSold: number;
    solReceived: number;
    error?: string;
    paperMode: boolean;
    timestamp: Date;
}
type PaperPosition = {
    tokenMint: string;
    tokenSymbol: string;
    tokensOwned: number;
    solSpent: number;
    entryPrice: number;
    buyTimestamp: Date;
    tpLevels: TpLevel[];
    partialSells: {
        tokensSold: number;
        solReceived: number;
        tpLevel: string;
        timestamp: Date;
    }[];
};
export interface TpLevel {
    name: string;
    multiplier: number;
    pctToSell: number;
    triggered: boolean;
}
export declare const TIME_EXIT_MINUTES = 45;
declare class BondingCurveService {
    private connection;
    private wallet;
    private paperMode;
    private paperPositions;
    private paperSolBalance;
    private initialized;
    private entryScores;
    private maxMultipliers;
    private dailyPnl;
    private lastDailyReset;
    private killSwitchTriggered;
    constructor();
    initialize(): Promise<void>;
    isPaperMode(): boolean;
    isInitialized(): boolean;
    isKillSwitchActive(): boolean;
    getOpenPositionCount(): number;
    getDailyPnl(): number;
    private resetDailyIfNeeded;
    private recordDailyPnl;
    /**
     * Lazy-import pumpfunStore (may not be available if module loaded standalone)
     */
    private getStore;
    /**
     * Derive the bonding curve PDA for a token
     */
    private getBondingCurvePDA;
    /**
     * Derive the associated bonding curve token account
     */
    private getAssociatedBondingCurve;
    /**
     * Read bonding curve state from on-chain
     */
    readBondingCurveState(tokenMint: string): Promise<BondingCurveState | null>;
    /**
     * Calculate buy quote (constant product AMM)
     */
    getBuyQuote(state: BondingCurveState, solAmount: number): BuyQuote | null;
    /**
     * Calculate sell quote
     */
    getSellQuote(state: BondingCurveState, tokenAmount: number): SellQuote | null;
    /**
     * Execute a buy on the bonding curve
     */
    buy(tokenMint: string, tokenSymbol: string, solAmount: number, tpLevels?: TpLevel[], entryScore?: number): Promise<SnipeResult>;
    /**
     * Paper mode buy
     */
    private paperBuy;
    /**
     * Live buy: execute a real pump.fun bonding curve buy transaction.
     * Builds the transaction with compute budget, Jito tip, and pump.fun buy instruction.
     */
    private liveBuy;
    /**
     * Live sell: execute a real pump.fun bonding curve sell transaction.
     */
    private liveSellAll;
    /**
     * Sell tokens (or partial) from a position
     * Checks TP levels and sells the appropriate portion
     */
    checkAndSell(tokenMint: string, currentPriceMultiplier: number): Promise<SellResult[]>;
    /**
     * Force sell entire position (emergency exit / stop loss / time-based exit)
     * @param reason - 'STOP_LOSS' | 'TIME_EXIT' | 'STALE_EXIT' | 'TAKE_PROFIT'
     */
    emergencySell(tokenMint: string, currentPriceMultiplier: number, reason?: string): Promise<SellResult | null>;
    /**
     * Get all open positions
     */
    getPositions(): PaperPosition[];
    /**
     * Get portfolio summary
     */
    getPortfolioSummary(): {
        mode: string;
        solBalance: number;
        openPositions: number;
        totalInvested: number;
        totalRealized: number;
        unrealizedPnl: number;
    };
    /**
     * Sample real on-chain bonding curve prices for all open positions.
     * Updates maxMultipliers, persists price samples to DB, and returns
     * a map of tokenMint -> currentMultiplier for use by TP/SL logic.
     */
    sampleAndUpdatePositions(): Promise<Map<string, number>>;
    /**
     * Emergency close ALL open positions (used by kill switch)
     */
    private emergencyCloseAll;
    private persistBuyToDb;
    private persistSellToDb;
    private persistPositionUpdate;
    private persistOutcomeToDb;
}
declare const DEFAULT_TP_LEVELS: TpLevel[];
export { DEFAULT_TP_LEVELS };
export declare const bondingCurveService: BondingCurveService;
export default bondingCurveService;
//# sourceMappingURL=bonding-curve.d.ts.map