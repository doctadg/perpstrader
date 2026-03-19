/**
 * Backtest Job Processor
 *
 * Processes individual backtest jobs using the existing enhanced-backtest.ts engine.
 * Fetches historical data, runs the backtest, and returns structured results.
 */
import { Job } from 'bullmq';
import { BacktestConfig } from '../backtest/enhanced-backtest';
import { Strategy, BacktestResult } from '../shared/types';
import { StrategyAssessment } from './result-analyzer';
export interface BacktestJobData {
    jobId: string;
    strategy: Strategy;
    symbol: string;
    timeframe: string;
    days: number;
    config?: BacktestConfig;
    priority?: number;
}
export interface BacktestJobResult {
    jobId: string;
    strategyId: string;
    symbol: string;
    success: boolean;
    result?: BacktestResult;
    assessment?: StrategyAssessment;
    error?: string;
    processingTimeMs: number;
    candlesProcessed: number;
}
/**
 * Process a single backtest job
 */
export declare function processBacktestJob(job: Job<BacktestJobData>): Promise<BacktestJobResult>;
declare const _default: {
    processBacktestJob: typeof processBacktestJob;
};
export default _default;
//# sourceMappingURL=job-processor.d.ts.map