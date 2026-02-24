"use strict";
/**
 * Backtest Worker
 *
 * BullMQ worker that processes backtest jobs from the 'backtest-queue'.
 * Handles job processing with proper error handling and event reporting.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BacktestWorker = void 0;
const bullmq_1 = require("bullmq");
const job_processor_1 = require("./job-processor");
const logger_1 = __importDefault(require("../shared/logger"));
const message_bus_1 = __importDefault(require("../shared/message-bus"));
// Queue configuration
const QUEUE_CONFIG = {
    connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number.parseInt(process.env.REDIS_PORT || '6380', 10),
        password: process.env.REDIS_PASSWORD,
        db: Number.parseInt(process.env.REDIS_QUEUE_DB || '2', 10),
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: {
            count: 500,
            age: 86400 * 7, // 7 days
        },
        removeOnFail: {
            count: 1000,
        },
    },
};
// Worker configuration
const WORKER_CONFIG = {
    concurrency: Number.parseInt(process.env.BACKTEST_WORKER_CONCURRENCY || '2', 10),
    lockDuration: 300000, // 5 minutes - backtests can take time
    stalledInterval: 30000,
    maxStalledCount: 2,
};
class BacktestWorker {
    worker = null;
    stats = {
        processed: 0,
        failed: 0,
        active: 0,
        averageProcessingTimeMs: 0,
    };
    processingTimes = [];
    isShuttingDown = false;
    /**
     * Create and start the backtest worker
     */
    async start() {
        if (this.worker) {
            logger_1.default.warn('[BacktestWorker] Worker already running');
            return;
        }
        logger_1.default.info('[BacktestWorker] Starting backtest worker...', {
            concurrency: WORKER_CONFIG.concurrency,
            redis: `${QUEUE_CONFIG.connection.host}:${QUEUE_CONFIG.connection.port}`,
        });
        // Connect to message bus if not already connected
        try {
            await message_bus_1.default.connect();
        }
        catch (error) {
            logger_1.default.warn('[BacktestWorker] Message bus not available, continuing without event publishing');
        }
        // Create BullMQ worker
        this.worker = new bullmq_1.Worker('backtest-queue', this.processJob.bind(this), {
            ...QUEUE_CONFIG,
            concurrency: WORKER_CONFIG.concurrency,
            lockDuration: WORKER_CONFIG.lockDuration,
            stalledInterval: WORKER_CONFIG.stalledInterval,
            maxStalledCount: WORKER_CONFIG.maxStalledCount,
        });
        // Set up event handlers
        this.setupEventHandlers();
        logger_1.default.info('[BacktestWorker] Worker started and waiting for jobs');
    }
    /**
     * Process a single job
     */
    async processJob(job) {
        if (this.isShuttingDown) {
            throw new Error('Worker is shutting down');
        }
        this.stats.active++;
        logger_1.default.info(`[BacktestWorker] Processing job ${job.id}:`, {
            strategyId: job.data.strategy.id,
            symbol: job.data.symbol,
            days: job.data.days,
            attempt: job.attemptsMade + 1,
        });
        try {
            const result = await (0, job_processor_1.processBacktestJob)(job);
            // Track processing time
            if (result.processingTimeMs > 0) {
                this.processingTimes.push(result.processingTimeMs);
                // Keep last 100 processing times
                if (this.processingTimes.length > 100) {
                    this.processingTimes = this.processingTimes.slice(-100);
                }
                this.stats.averageProcessingTimeMs =
                    this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
            }
            // Publish completion event
            await this.publishJobComplete(job, result);
            return result;
        }
        finally {
            this.stats.active = Math.max(0, this.stats.active - 1);
        }
    }
    /**
     * Set up worker event handlers
     */
    setupEventHandlers() {
        if (!this.worker)
            return;
        this.worker.on('ready', () => {
            logger_1.default.info('[BacktestWorker] Worker ready');
        });
        this.worker.on('active', (job) => {
            logger_1.default.debug(`[BacktestWorker] Job ${job.id} is now active`);
        });
        this.worker.on('completed', (job, result) => {
            this.stats.processed++;
            this.stats.lastProcessedAt = new Date();
            if (result.success) {
                logger_1.default.info(`[BacktestWorker] Job ${job.id} completed successfully:`, {
                    strategyId: result.strategyId,
                    symbol: result.symbol,
                    sharpe: result.result?.sharpeRatio?.toFixed(2),
                    winRate: result.result?.winRate?.toFixed(1),
                    viable: result.assessment?.isViable,
                    processingTimeMs: result.processingTimeMs,
                });
            }
            else {
                logger_1.default.warn(`[BacktestWorker] Job ${job.id} completed with failure:`, result.error);
            }
        });
        this.worker.on('failed', (job, error) => {
            this.stats.failed++;
            this.stats.lastFailedAt = new Date();
            const attemptsMade = job?.attemptsMade ?? 0;
            const maxAttempts = job?.opts?.attempts ?? 3;
            logger_1.default.error(`[BacktestWorker] Job ${job?.id} failed:`, {
                error: error.message,
                attempts: attemptsMade,
                willRetry: attemptsMade < maxAttempts,
            });
            // Publish failure event
            this.publishJobFailed(job, error);
        });
        this.worker.on('error', (error) => {
            logger_1.default.error('[BacktestWorker] Worker error:', error);
        });
        this.worker.on('stalled', (jobId) => {
            logger_1.default.warn(`[BacktestWorker] Job ${jobId} stalled`);
        });
        this.worker.on('progress', (job, progress) => {
            logger_1.default.debug(`[BacktestWorker] Job ${job.id} progress:`, progress);
        });
    }
    /**
     * Publish job completion event to message bus
     */
    async publishJobComplete(job, result) {
        try {
            await message_bus_1.default.publish('system:metrics', {
                event: 'backtest:complete',
                jobId: job.id,
                strategyId: result.strategyId,
                symbol: result.symbol,
                success: result.success,
                metrics: result.success ? {
                    totalReturn: result.result?.totalReturn,
                    sharpeRatio: result.result?.sharpeRatio,
                    winRate: result.result?.winRate,
                    maxDrawdown: result.result?.maxDrawdown,
                    totalTrades: result.result?.totalTrades,
                } : null,
                assessment: result.assessment ? {
                    isViable: result.assessment.isViable,
                    performanceTier: result.assessment.performanceTier,
                    shouldActivate: result.assessment.shouldActivate,
                } : null,
                processingTimeMs: result.processingTimeMs,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            logger_1.default.debug('[BacktestWorker] Failed to publish job complete event:', error);
        }
    }
    /**
     * Publish job failure event to message bus
     */
    async publishJobFailed(job, error) {
        try {
            await message_bus_1.default.publish('system:metrics', {
                event: 'backtest:failed',
                jobId: job?.id,
                strategyId: job?.data?.strategy?.id,
                symbol: job?.data?.symbol,
                error: error.message,
                attempts: job?.attemptsMade,
                timestamp: new Date().toISOString(),
            });
        }
        catch (err) {
            logger_1.default.debug('[BacktestWorker] Failed to publish job failed event:', err);
        }
    }
    /**
     * Get current worker statistics
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Pause the worker
     */
    async pause() {
        if (this.worker) {
            await this.worker.pause();
            logger_1.default.info('[BacktestWorker] Worker paused');
        }
    }
    /**
     * Resume the worker
     */
    async resume() {
        if (this.worker) {
            await this.worker.resume();
            logger_1.default.info('[BacktestWorker] Worker resumed');
        }
    }
    /**
     * Check if worker is running
     */
    isRunning() {
        return this.worker !== null && !this.isShuttingDown;
    }
    /**
     * Gracefully shut down the worker
     */
    async stop() {
        if (!this.worker || this.isShuttingDown) {
            return;
        }
        this.isShuttingDown = true;
        logger_1.default.info('[BacktestWorker] Shutting down...');
        // Close the worker
        await this.worker.close();
        this.worker = null;
        logger_1.default.info('[BacktestWorker] Worker stopped');
    }
}
exports.BacktestWorker = BacktestWorker;
// Singleton instance
const backtestWorker = new BacktestWorker();
exports.default = backtestWorker;
//# sourceMappingURL=worker.js.map