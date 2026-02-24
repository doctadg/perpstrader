/**
 * Backtest Worker Pool Manager
 *
 * Manages multiple backtest workers running in parallel.
 * Provides CLI interface for starting/stopping workers and monitoring status.
 */
import { WorkerStats } from './worker';
import { Strategy } from '../shared/types';
interface PoolConfig {
    numWorkers: number;
    queueName: string;
}
interface PoolStats {
    workers: WorkerStats[];
    queue: {
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
    };
    totalProcessed: number;
    totalFailed: number;
    averageProcessingTimeMs: number;
    uptimeSeconds: number;
}
declare class WorkerPoolManager {
    private workers;
    private queue;
    private startTime;
    private isShuttingDown;
    /**
     * Initialize and start the worker pool
     */
    start(config?: Partial<PoolConfig>): Promise<void>;
    /**
     * Stop all workers
     */
    stop(): Promise<void>;
    /**
     * Get current pool statistics
     */
    getStats(): Promise<PoolStats>;
    /**
     * Add a backtest job to the queue
     */
    addJob(strategy: Strategy, symbol: string, options?: {
        timeframe?: string;
        days?: number;
        priority?: number;
    }): Promise<string>;
    /**
     * Add multiple backtest jobs to the queue
     */
    addBatchJobs(strategies: Strategy[], symbols: string[], options?: {
        timeframe?: string;
        days?: number;
    }): Promise<string[]>;
    /**
     * Pause all workers
     */
    pause(): Promise<void>;
    /**
     * Resume all workers
     */
    resume(): Promise<void>;
    /**
     * Get worker count
     */
    getWorkerCount(): number;
    /**
     * Check if pool is running
     */
    isRunning(): boolean;
    /**
     * Set up graceful shutdown handlers
     */
    private setupShutdownHandlers;
}
declare const workerPool: WorkerPoolManager;
export default workerPool;
export { WorkerPoolManager };
//# sourceMappingURL=index.d.ts.map