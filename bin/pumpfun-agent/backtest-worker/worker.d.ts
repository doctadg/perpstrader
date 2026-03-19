/**
 * Backtest Worker
 *
 * BullMQ worker that processes backtest jobs from the 'backtest-queue'.
 * Handles job processing with proper error handling and event reporting.
 */
export interface WorkerStats {
    processed: number;
    failed: number;
    active: number;
    lastProcessedAt?: Date;
    lastFailedAt?: Date;
    averageProcessingTimeMs: number;
}
declare class BacktestWorker {
    private worker;
    private stats;
    private processingTimes;
    private isShuttingDown;
    /**
     * Create and start the backtest worker
     */
    start(): Promise<void>;
    /**
     * Process a single job
     */
    private processJob;
    /**
     * Set up worker event handlers
     */
    private setupEventHandlers;
    /**
     * Publish job completion event to message bus
     */
    private publishJobComplete;
    /**
     * Publish job failure event to message bus
     */
    private publishJobFailed;
    /**
     * Get current worker statistics
     */
    getStats(): WorkerStats;
    /**
     * Pause the worker
     */
    pause(): Promise<void>;
    /**
     * Resume the worker
     */
    resume(): Promise<void>;
    /**
     * Check if worker is running
     */
    isRunning(): boolean;
    /**
     * Gracefully shut down the worker
     */
    stop(): Promise<void>;
}
declare const backtestWorker: BacktestWorker;
export default backtestWorker;
export { BacktestWorker };
//# sourceMappingURL=worker.d.ts.map