export interface MarketHeatData {
    marketId: string;
    marketName: string;
    marketType: 'hyperliquid' | 'polymarket';
    category: string;
    heatScore: number;
    articleCount: number;
    mentionCount: number;
    uniqueArticleCount: number;
    avgSentiment: number;
    sentimentDistribution: {
        very_positive: number;
        positive: number;
        neutral: number;
        negative: number;
        very_negative: number;
    };
    trendDirection: 'SPIKING' | 'RISING' | 'STABLE' | 'FALLING' | 'CRASHING';
    velocity: number;
    relatedClusterIds: string[];
}
declare class MarketHeatCalculator {
    private db;
    private initialized;
    private dbPath;
    constructor();
    initialize(): Promise<void>;
    /**
     * Calculate heat for all markets in a given timeframe
     */
    calculateMarketHeat(periodType?: '1h' | '4h' | '24h' | '7d', hours?: number): Promise<MarketHeatData[]>;
    /**
     * Store heat calculations
     */
    storeHeatCalculations(heatData: MarketHeatData[], periodType: '1h' | '4h' | '24h' | '7d'): Promise<number>;
    /**
     * Get heat history for a market
     */
    getHeatHistory(marketId: string, periodType?: '1h' | '4h' | '24h' | '7d', limit?: number): Promise<Array<{
        heatScore: number;
        articleCount: number;
        periodStart: Date;
        trendDirection: string;
    }>>;
    /**
     * Get heat snapshot for all markets (for bubble map)
     */
    getHeatSnapshot(category?: string, minHeatScore?: number): Promise<MarketHeatData[]>;
    /**
     * Get heat grid data (for heatmap grid visualization)
     */
    getHeatGridData(periodTypes?: Array<'1h' | '4h' | '24h' | '7d'>): Promise<Array<{
        marketId: string;
        marketName: string;
        marketType: string;
        category: string;
        volume24h: number;
        periods: Record<string, {
            heatScore: number;
            articleCount: number;
            trendDirection: string;
            avgSentiment: number;
        }>;
    }>>;
    private calculateBaseHeatScore;
    private calculateTrend;
    private getPreviousHeatScores;
    private getPeriodStart;
}
export declare const marketHeatCalculator: MarketHeatCalculator;
export default marketHeatCalculator;
//# sourceMappingURL=market-heat-calculator.d.ts.map