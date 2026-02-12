/**
 * Cross-Exchange Arbitrage Detector
 * Compares funding rates between Hyperliquid and Asterdex
 * Identifies arbitrage opportunities for cross-exchange funding rate arbitrage
 */
interface CrossExchangeOpportunity {
    id?: number;
    symbol: string;
    hyperliquidFunding: number;
    asterdexFunding: number;
    spread: number;
    spreadPercent: number;
    annualizedSpread: number;
    recommendedAction: 'long_hl_short_aster' | 'short_hl_long_aster' | null;
    estimatedYearlyYield: number;
    urgency: 'high' | 'medium' | 'low';
    timestamp: number;
    isActive: boolean;
    hyperliquidMarkPrice: number;
    asterdexMarkPrice: number;
    priceDiffPercent: number;
    confidence: number;
}
interface ExchangeInfo {
    name: string;
    connected: boolean;
    lastUpdate: number;
    symbols: string[];
}
interface ArbitrageConfig {
    minSpreadThreshold: number;
    minAnnualizedSpread: number;
    highUrgencyThreshold: number;
    mediumUrgencyThreshold: number;
    priceDiffThreshold: number;
    symbolsToTrack: string[];
}
declare class CrossExchangeArbitrage {
    private db;
    private dbPath;
    private initialized;
    private config;
    constructor();
    /**
     * Initialize database connection
     */
    initialize(): Promise<void>;
    /**
     * Create database tables
     */
    private createTables;
    /**
     * Scan for cross-exchange arbitrage opportunities
     */
    scanForOpportunities(): Promise<CrossExchangeOpportunity[]>;
    /**
     * Fetch Hyperliquid market data
     */
    private fetchHyperliquidData;
    /**
     * Fetch Asterdex funding rates
     */
    private fetchAsterdexData;
    /**
     * Calculate arbitrage opportunity for a symbol
     */
    private calculateOpportunity;
    /**
     * Calculate annualized spread
     * Assumes funding paid 3 times per day (every 8 hours)
     */
    private calculateAnnualizedSpread;
    /**
     * Store opportunities in database
     */
    private storeOpportunities;
    /**
     * Deactivate old opportunities
     */
    private deactivateOldOpportunities;
    /**
     * Update exchange status in database
     */
    private updateExchangeStatus;
    /**
     * Get all active cross-exchange opportunities
     */
    getActiveOpportunities(minSpread?: number): Promise<CrossExchangeOpportunity[]>;
    /**
     * Get opportunities by urgency level
     */
    getOpportunitiesByUrgency(urgency: 'high' | 'medium' | 'low'): Promise<CrossExchangeOpportunity[]>;
    /**
     * Get opportunity by symbol
     */
    getOpportunityBySymbol(symbol: string): Promise<CrossExchangeOpportunity | null>;
    /**
     * Get connected exchanges info
     */
    getExchangeInfo(): Promise<ExchangeInfo[]>;
    /**
     * Get arbitrage statistics
     */
    getStatistics(): Promise<{
        totalOpportunities: number;
        highUrgencyCount: number;
        mediumUrgencyCount: number;
        lowUrgencyCount: number;
        bestSpread: {
            symbol: string;
            spread: number;
        } | null;
        avgSpread: number;
        connectedExchanges: number;
    }>;
    /**
     * Get historical opportunities for a symbol
     */
    getHistoricalOpportunities(symbol: string, hours?: number): Promise<CrossExchangeOpportunity[]>;
    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<ArbitrageConfig>): void;
    /**
     * Clean up old data
     */
    cleanupOldData(days?: number): Promise<void>;
}
export declare const crossExchangeArbitrage: CrossExchangeArbitrage;
export default crossExchangeArbitrage;
export type { CrossExchangeOpportunity, ExchangeInfo, ArbitrageConfig };
//# sourceMappingURL=cross-exchange-arbitrage.d.ts.map