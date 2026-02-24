export type IdeaStatus = 'PENDING' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'REJECTED';
export type BacktestStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export interface StrategyIdea {
    id: string;
    name: string;
    description: string;
    type: 'TREND_FOLLOWING' | 'MEAN_REVERSION' | 'MARKET_MAKING' | 'ARBITRAGE' | 'AI_PREDICTION';
    symbols: string[];
    timeframe: string;
    parameters: Record<string, any>;
    entryConditions: string[];
    exitConditions: string[];
    riskParameters: {
        maxPositionSize: number;
        stopLoss: number;
        takeProfit: number;
        maxLeverage: number;
    };
    confidence: number;
    rationale: string;
    status: IdeaStatus;
    marketContext?: {
        regime: string;
        volatility: number;
        trendStrength: number;
    };
    createdAt: Date;
    updatedAt: Date;
}
export interface BacktestJob {
    id: string;
    strategyId: string;
    status: BacktestStatus;
    results?: any;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
}
export interface StrategyPerformance {
    id: string;
    strategyId: string;
    sharpe: number;
    winRate: number;
    pnl: number;
    maxDrawdown: number;
    totalTrades: number;
    profitFactor: number;
    updatedAt: Date;
}
export declare class IdeaQueue {
    private db;
    private dbPath;
    private initialized;
    constructor();
    /**
     * Initialize database connection and create tables
     */
    initialize(): Promise<void>;
    /**
     * Create database tables
     */
    private createTables;
    /**
     * Add strategy ideas to the queue
     */
    addIdeas(ideas: StrategyIdea[]): Promise<number>;
    /**
     * Get pending ideas
     */
    getPendingIdeas(limit?: number): Promise<StrategyIdea[]>;
    /**
     * Get count of pending ideas
     */
    getPendingCount(): Promise<number>;
    /**
     * Update idea status
     */
    updateIdeaStatus(id: string, status: IdeaStatus): Promise<void>;
    /**
     * Get pending backtest jobs
     */
    getPendingBacktestJobs(limit?: number): Promise<BacktestJob[]>;
    /**
     * Get count of pending backtest jobs
     */
    getPendingBacktestCount(): Promise<number>;
    /**
     * Get count of completed backtest jobs
     */
    getCompletedBacktestCount(): Promise<number>;
    /**
     * Update backtest job status
     */
    updateBacktestJobStatus(id: string, status: BacktestStatus): Promise<void>;
    /**
     * Complete backtest job and save results
     */
    completeBacktestJob(id: string, results: any): Promise<void>;
    /**
     * Save strategy performance metrics
     */
    savePerformanceMetrics(strategyId: string, results: any): Promise<void>;
    /**
     * Get top performing strategies
     */
    getTopStrategies(limit?: number): Promise<StrategyPerformance[]>;
    /**
     * Get ideas by status
     */
    getIdeasByStatus(status: IdeaStatus): Promise<StrategyIdea[]>;
    /**
     * Delete old completed ideas
     */
    cleanupOldIdeas(ageDays?: number): Promise<number>;
    /**
     * Close database connection
     */
    close(): void;
    private rowToIdea;
    private rowToBacktestJob;
}
export declare const ideaQueue: IdeaQueue;
export default ideaQueue;
//# sourceMappingURL=idea-queue.d.ts.map