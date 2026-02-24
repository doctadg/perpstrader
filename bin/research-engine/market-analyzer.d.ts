export interface MarketRegime {
    regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'UNKNOWN';
    volatility: number;
    trendStrength: number;
    volumeProfile: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
    topMovers: Array<{
        symbol: string;
        change24h: number;
        volume24h: number;
    }>;
    timestamp: Date;
}
export declare class MarketAnalyzer {
    private baseUrl;
    private symbols;
    private cache;
    private readonly CACHE_TTL_MS;
    constructor();
    /**
     * Analyze current market conditions and return regime classification
     */
    analyze(): Promise<MarketRegime>;
    /**
     * Fetch candle and market data for symbols
     */
    private fetchSymbolData;
    /**
     * Calculate overall market volatility (0-1 scale)
     */
    private calculateMarketVolatility;
    /**
     * Calculate trend strength (-1 to 1 scale)
     */
    private calculateTrendStrength;
    /**
     * Classify market regime based on volatility and trend
     */
    private classifyRegime;
    /**
     * Classify volume profile
     */
    private classifyVolumeProfile;
    /**
     * Get top movers by 24h change
     */
    private getTopMovers;
    /**
     * Calculate Exponential Moving Average
     */
    private calculateEMA;
    /**
     * Get default regime when analysis fails
     */
    private getDefaultRegime;
    /**
     * Get quick market snapshot for external use
     */
    getMarketSnapshot(): Promise<{
        btcPrice: number;
        ethPrice: number;
        marketCap: number;
        fearGreed: number;
    }>;
}
export default MarketAnalyzer;
//# sourceMappingURL=market-analyzer.d.ts.map