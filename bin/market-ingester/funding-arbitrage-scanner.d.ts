import { CrossExchangeOpportunity, ExchangeInfo } from './cross-exchange-arbitrage';
interface FundingRate {
    symbol: string;
    timestamp: number;
    fundingRate: number;
    nextFundingTime: number;
    annualizedRate: number;
    rank: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    opportunityScore: number;
    volume24h: number;
    markPrice: number;
    openInterest: number;
}
interface FundingOpportunity {
    symbol: string;
    type: 'long' | 'short';
    currentFunding: number;
    annualizedRate: number;
    opportunityScore: number;
    reason: string;
    urgency: 'high' | 'medium' | 'low';
    timestamp: number;
}
interface FundingStats {
    bestLongFunding: {
        symbol: string;
        rate: number;
    } | null;
    bestShortFunding: {
        symbol: string;
        rate: number;
    } | null;
    averageFunding: number;
    extremeMarketsCount: number;
    totalMarkets: number;
    positiveFundingCount: number;
    negativeFundingCount: number;
    timestamp: number;
}
interface FundingHistory {
    timestamp: number;
    fundingRate: number;
    annualizedRate: number;
}
declare class FundingArbitrageScanner {
    private db;
    private dbPath;
    private initialized;
    private fundingHistory;
    private maxHistoryLength;
    private readonly FUNDING_PERIODS_PER_DAY;
    private readonly DAYS_PER_YEAR;
    constructor();
    initialize(): Promise<void>;
    private createTables;
    /**
     * Calculate annualized funding rate from hourly rate
     * Hyperliquid: funding paid 3 times per day (every 8 hours)
     * Annualized = fundingRate * 3 * 365
     */
    calculateAnnualizedRate(fundingRate: number): number;
    /**
     * Calculate funding rate trend based on recent history
     */
    calculateTrend(symbol: string, currentRate: number): 'increasing' | 'decreasing' | 'stable';
    /**
     * Calculate opportunity score (0-100)
     * Higher = better opportunity
     */
    calculateOpportunityScore(fundingRate: number, volume24h: number, trend: string): number;
    /**
     * Scan all markets for funding rate data
     */
    scanAllFundingRates(): Promise<FundingRate[]>;
    /**
     * Store funding rates in database
     */
    private storeFundingRates;
    /**
     * Identify funding arbitrage opportunities
     */
    identifyOpportunities(extremeThreshold?: number): Promise<FundingOpportunity[]>;
    /**
     * Store opportunities in database
     */
    private storeOpportunities;
    /**
     * Compare funding rates between similar assets
     */
    compareSimilarAssets(): Promise<void>;
    /**
     * Get current funding stats
     */
    getFundingStats(): Promise<FundingStats>;
    /**
     * Get historical funding data for a symbol
     */
    getFundingHistory(symbol: string, hours?: number): Promise<FundingHistory[]>;
    /**
     * Get all current funding rates
     */
    getAllCurrentRates(): Promise<FundingRate[]>;
    /**
     * Get top arbitrage opportunities
     */
    getTopOpportunities(limit?: number): Promise<FundingOpportunity[]>;
    /**
     * Mark opportunities as alerted
     */
    markAlerted(symbols: string[]): Promise<void>;
    /**
     * Clean up old data
     */
    cleanupOldData(days?: number): Promise<void>;
    /**
     * Scan for cross-exchange funding rate arbitrage opportunities
     * Compares Hyperliquid vs Asterdex funding rates
     */
    scanCrossExchangeArbitrage(): Promise<CrossExchangeOpportunity[]>;
    /**
     * Get active cross-exchange arbitrage opportunities
     */
    getCrossExchangeOpportunities(minSpread?: number): Promise<CrossExchangeOpportunity[]>;
    /**
     * Get cross-exchange opportunities by urgency level
     */
    getCrossExchangeOpportunitiesByUrgency(urgency: 'high' | 'medium' | 'low'): Promise<CrossExchangeOpportunity[]>;
    /**
     * Get cross-exchange opportunity for a specific symbol
     */
    getCrossExchangeOpportunity(symbol: string): Promise<CrossExchangeOpportunity | null>;
    /**
     * Get connected exchanges information
     */
    getExchangeInfo(): Promise<ExchangeInfo[]>;
    /**
     * Get cross-exchange arbitrage statistics
     */
    getCrossExchangeStats(): Promise<{
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
     * Run complete funding arbitrage scan (single-exchange + cross-exchange)
     */
    runCompleteScan(): Promise<{
        singleExchangeOpportunities: number;
        crossExchangeOpportunities: number;
        timestamp: number;
    }>;
}
export declare const fundingArbitrageScanner: FundingArbitrageScanner;
export default fundingArbitrageScanner;
export type { FundingRate, FundingOpportunity, FundingStats, FundingHistory };
export type { CrossExchangeOpportunity, ExchangeInfo } from './cross-exchange-arbitrage';
//# sourceMappingURL=funding-arbitrage-scanner.d.ts.map