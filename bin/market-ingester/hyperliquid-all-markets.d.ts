interface HyperliquidMarket {
    coin: string;
    index: number;
    maxLeverage: number;
    szDecimals: number;
    onlyIsolated: boolean;
    funding: number;
    fundingRate: number;
    openInterest: number;
    prevDayPx: number;
    dayNtlVlm: number;
    markPx: number;
    midPx: number;
    oraclePx: number;
    circulatingSupply?: number;
    volume24h: number;
    markPrice: number;
}
interface AllMarketsResponse {
    markets: HyperliquidMarket[];
    count: number;
    timestamp: number;
}
declare class HyperliquidAllMarkets {
    private hyperliquidUrl;
    private allMarkets;
    private lastUpdate;
    private updateIntervalMs;
    constructor();
    /**
     * Fetch all available perpetual markets from Hyperliquid
     * Returns ALL markets (100+ if available), not just top 50
     */
    fetchAllMarkets(): Promise<AllMarketsResponse>;
    /**
     * Get all markets (from cache if recent)
     */
    getAllMarkets(): Promise<AllMarketsResponse>;
    /**
     * Get markets sorted by 24h volume
     */
    getMarketsByVolume(limit?: number): Promise<HyperliquidMarket[]>;
    /**
     * Get markets sorted by funding rate (absolute value)
     */
    getMarketsByFundingRate(): Promise<HyperliquidMarket[]>;
    /**
     * Get markets with extreme funding rates
     */
    getExtremeFundingMarkets(threshold?: number): Promise<{
        positive: HyperliquidMarket[];
        negative: HyperliquidMarket[];
    }>;
    /**
     * Get markets by category
     */
    getMarketsByCategory(markets: HyperliquidMarket[]): Record<string, HyperliquidMarket[]>;
    /**
     * Get a specific market by symbol
     */
    getMarket(symbol: string): Promise<HyperliquidMarket | null>;
    /**
     * Get all available symbols
     */
    getAllSymbols(): Promise<string[]>;
    /**
     * Categorize a coin
     */
    private categorizeCoin;
    /**
     * Clear cache and force refresh
     */
    clearCache(): void;
}
export declare const hyperliquidAllMarkets: HyperliquidAllMarkets;
export default hyperliquidAllMarkets;
export type { HyperliquidMarket, AllMarketsResponse };
//# sourceMappingURL=hyperliquid-all-markets.d.ts.map