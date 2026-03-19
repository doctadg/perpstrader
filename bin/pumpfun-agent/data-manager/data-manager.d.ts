import { Trade, Strategy, MarketData, BacktestResult, AIInsight, ResearchData } from '../shared/types';
export declare class DataManager {
    private db;
    private dbPath;
    constructor();
    private initializeDatabase;
    saveStrategy(strategy: Strategy): Promise<void>;
    getStrategy(id: string): Promise<Strategy | null>;
    getAllStrategies(): Promise<Strategy[]>;
    deleteStrategy(id: string): Promise<boolean>;
    saveTrade(trade: Trade): Promise<void>;
    getTrades(strategyId?: string, symbol?: string, limit?: number): Promise<Trade[]>;
    clearAllTrades(): Promise<number>;
    saveMarketData(marketData: MarketData[]): Promise<void>;
    getMarketData(symbol: string, startTime?: Date, endTime?: Date, limit?: number): Promise<MarketData[]>;
    saveBacktestResult(result: BacktestResult): Promise<void>;
    saveAIInsight(insight: AIInsight): Promise<void>;
    getAIInsights(type?: string, limit?: number): Promise<AIInsight[]>;
    saveResearchData(research: ResearchData): Promise<void>;
    getPortfolioPerformance(timeframe?: string): Promise<any>;
    cleanupOldData(daysToKeep?: number): Promise<void>;
    close(): void;
    private mapRowToStrategy;
    private mapRowToTrade;
    private mapRowToMarketData;
    private mapRowToAIInsight;
    saveSystemStatus(status: any): Promise<void>;
    getSystemStatus(): Promise<any | null>;
    cleanupOldStatusEntries(maxAge?: number): Promise<void>;
}
declare const _default: DataManager;
export default _default;
//# sourceMappingURL=data-manager.d.ts.map