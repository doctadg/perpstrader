import { StrategyIdea } from './idea-queue';
interface ResearchEngineConfig {
    intervalMinutes: number;
    ideasPerRun: number;
    minConfidence: number;
    maxQueueSize: number;
}
export declare class ResearchEngine {
    private marketAnalyzer;
    private ideaQueue;
    private strategyGenerator;
    private config;
    private isRunning;
    private cronJob;
    constructor(config?: Partial<ResearchEngineConfig>);
    /**
     * Start the research engine with cron scheduling
     */
    start(): Promise<void>;
    /**
     * Stop the research engine
     */
    stop(): void;
    /**
     * Run a single research cycle
     */
    runResearchCycle(): Promise<void>;
    /**
     * Process pending backtest jobs
     */
    private processPendingBacktests;
    /**
     * Simulate a backtest (placeholder for actual backtest integration)
     */
    private simulateBacktest;
    /**
     * Get current research engine status
     */
    getStatus(): Promise<{
        isRunning: boolean;
        queueSize: number;
        pendingBacktests: number;
        completedBacktests: number;
    }>;
    /**
     * Get pending ideas from the queue
     */
    getPendingIdeas(limit?: number): Promise<StrategyIdea[]>;
    /**
     * Get top performing strategies
     */
    getTopStrategies(limit?: number): Promise<any[]>;
}
export declare const researchEngine: ResearchEngine;
export default researchEngine;
//# sourceMappingURL=index.d.ts.map