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
/**
 * Bonding Curve execution service
 */
declare class BondingCurveService {
    private connection;
    private wallet;
    private paperMode;
    private paperPositions;
    private paperSolBalance;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    isPaperMode(): boolean;
    isInitialized(): boolean;
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
    buy(tokenMint: string, tokenSymbol: string, solAmount: number, tpLevels?: TpLevel[]): Promise<SnipeResult>;
    /**
     * Paper mode buy
     */
    private paperBuy;
    /**
     * Sell tokens (or partial) from a position
     * Checks TP levels and sells the appropriate portion
     */
    checkAndSell(tokenMint: string, currentPriceMultiplier: number): Promise<SellResult[]>;
    /**
     * Force sell entire position (emergency exit / stop loss)
     */
    emergencySell(tokenMint: string, currentPriceMultiplier: number): Promise<SellResult | null>;
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
}
declare const DEFAULT_TP_LEVELS: TpLevel[];
export { DEFAULT_TP_LEVELS };
export declare const bondingCurveService: BondingCurveService;
export default bondingCurveService;
//# sourceMappingURL=bonding-curve.d.ts.map