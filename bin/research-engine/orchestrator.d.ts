import 'dotenv/config';
import { ResearchEngineConfig } from './config';
interface BacktestQueueStatus {
    pending: number;
    running: number;
    completed: number;
    failed: number;
}
export declare class ResearchOrchestrator {
    private config;
    private researchEngine;
    private isRunning;
    private researchTimer;
    private evolutionTimer;
    private lastEvolutionRun;
    private evolutionGeneration;
    private backtestQueueStatus;
    constructor(config?: Partial<ResearchEngineConfig>);
    /**
     * Start the research orchestrator
     * Begins the 15-minute research cycle and 6-hour evolution runs
     */
    start(): Promise<void>;
    /**
     * Stop the research orchestrator gracefully
     */
    stop(): void;
    /**
     * Schedule the research cycle
     * Runs every configured interval (default 15 minutes)
     */
    private scheduleResearchCycle;
    /**
     * Schedule the evolution cycle
     * Runs every configured evolution interval (default 6 hours)
     */
    private scheduleEvolutionCycle;
    /**
     * Get adjusted interval based on backtest queue depth
     * If queue is backing up, slow down research generation
     */
    private getAdjustedInterval;
    /**
     * Run a single research cycle
     */
    private runResearchCycle;
    /**
     * Run evolution cycle
     * Evaluates and evolves top performing strategies
     */
    private runEvolutionCycle;
    /**
     * Update backtest queue status
     */
    private updateQueueStatus;
    /**
     * Get current orchestrator status
     */
    getStatus(): {
        isRunning: boolean;
        evolutionGeneration: number;
        lastEvolutionRun: Date | null;
        backtestQueue: BacktestQueueStatus;
        config: ResearchEngineConfig;
    };
    /**
     * Force trigger an evolution run
     */
    triggerEvolution(): Promise<void>;
    /**
     * Force trigger a research cycle
     */
    triggerResearch(): Promise<void>;
}
export declare const researchOrchestrator: ResearchOrchestrator;
export default researchOrchestrator;
//# sourceMappingURL=orchestrator.d.ts.map