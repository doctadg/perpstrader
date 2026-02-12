export interface MarketData {
    id: string;
    type: 'hyperliquid' | 'polymarket';
    symbol?: string;
    name: string;
    description?: string;
    category: string;
    subCategory?: string;
    volume24h: number;
    priority: number;
    hlCoin?: string;
    hlIndex?: number;
    pmMarketSlug?: string;
    pmConditionId?: string;
    pmQuestionId?: string;
    pmResolutionDate?: string;
    pmVolumeUsd?: number;
    pmLiquidity?: number;
    pmProbability?: number;
    pmOutcomes?: string[];
}
declare class MarketDataSync {
    private db;
    private dbPath;
    private initialized;
    constructor();
    initialize(): Promise<void>;
    /**
     * Fetch top coins from Hyperliquid
     * Returns top 50 by 24h volume
     */
    fetchHyperliquidMarkets(): Promise<MarketData[]>;
    /**
     * Fetch active markets from Polymarket
     */
    fetchPolymarketMarkets(): Promise<MarketData[]>;
    /**
     * Sync all markets to database
     */
    syncAllMarkets(): Promise<{
        hyperliquid: number;
        polymarket: number;
        total: number;
    }>;
    /**
     * Deactivate markets not seen in last sync
     */
    deactivateStaleMarkets(hours?: number): Promise<number>;
    /**
     * Get all active markets
     */
    getActiveMarkets(): Promise<MarketData[]>;
    private categorizeCrypto;
    private categorizePolymarket;
    private extractPoliticalSubcategory;
    private extractSportsSubcategory;
    private calculatePriority;
    private generateKeywords;
}
export declare const marketDataSync: MarketDataSync;
export default marketDataSync;
//# sourceMappingURL=market-data-sync.d.ts.map