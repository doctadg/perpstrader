/**
 * Cross-Exchange Arbitrage Detector
 * Compares funding rates pairwise across Hyperliquid, Asterdex, and Binance.
 */
type ExchangeName = 'hyperliquid' | 'asterdex' | 'binance';
type Urgency = 'high' | 'medium' | 'low';
interface CrossExchangeOpportunity {
    id?: number;
    symbol: string;
    exchangeA: ExchangeName;
    exchangeB: ExchangeName;
    exchangeAFunding: number;
    exchangeBFunding: number;
    spread: number;
    spreadPercent: number;
    annualizedSpread: number;
    recommendedAction: string | null;
    longExchange: ExchangeName | null;
    shortExchange: ExchangeName | null;
    estimatedYearlyYield: number;
    urgency: Urgency;
    timestamp: number;
    isActive: boolean;
    exchangeAMarkPrice: number;
    exchangeBMarkPrice: number;
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
    private readonly opportunitiesTable;
    private db;
    private dbPath;
    private initialized;
    private config;
    private readonly exchangeOrder;
    constructor();
    initialize(): Promise<void>;
    private createTables;
    scanForOpportunities(): Promise<CrossExchangeOpportunity[]>;
    private fetchHyperliquidData;
    private fetchAsterdexData;
    private fetchBinanceData;
    private mapAsterdexFundingRates;
    private mapBinanceFundingRates;
    private normalizeSymbol;
    private calculateOpportunity;
    private calculateAnnualizedSpread;
    private storeOpportunities;
    private deactivateOldOpportunities;
    private updateExchangeStatus;
    getActiveOpportunities(minSpread?: number): Promise<CrossExchangeOpportunity[]>;
    getOpportunitiesByUrgency(urgency: Urgency): Promise<CrossExchangeOpportunity[]>;
    getOpportunityBySymbol(symbol: string): Promise<CrossExchangeOpportunity | null>;
    getExchangeInfo(): Promise<ExchangeInfo[]>;
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
    getHistoricalOpportunities(symbol: string, hours?: number): Promise<CrossExchangeOpportunity[]>;
    updateConfig(newConfig: Partial<ArbitrageConfig>): void;
    cleanupOldData(days?: number): Promise<void>;
    private mapRowToOpportunity;
}
export declare const crossExchangeArbitrage: CrossExchangeArbitrage;
export default crossExchangeArbitrage;
export type { CrossExchangeOpportunity, ExchangeInfo, ArbitrageConfig, ExchangeName, };
//# sourceMappingURL=cross-exchange-arbitrage.d.ts.map