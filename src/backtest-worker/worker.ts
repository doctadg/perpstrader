/**
 * Backtest Worker
 * 
 * BullMQ worker that processes backtest jobs from the 'backtest-queue'.
 * Handles job processing with proper error handling and event reporting.
 */

import { Worker, Job } from 'bullmq';
import { processBacktestJob, BacktestJobData, BacktestJobResult } from './job-processor';
import logger from '../shared/logger';
import messageBus from '../shared/message-bus';

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

export interface WorkerStats {
  processed: number;
  failed: number;
  active: number;
  lastProcessedAt?: Date;
  lastFailedAt?: Date;
  averageProcessingTimeMs: number;
}

class BacktestWorker {
  private worker: Worker | null = null;
  private stats: WorkerStats = {
    processed: 0,
    failed: 0,
    active: 0,
    averageProcessingTimeMs: 0,
  };
  private processingTimes: number[] = [];
  private isShuttingDown = false;

  /**
   * Create and start the backtest worker
   */
  async start(): Promise<void> {
    if (this.worker) {
      logger.warn('[BacktestWorker] Worker already running');
      return;
    }

    logger.info('[BacktestWorker] Starting backtest worker...', {
      concurrency: WORKER_CONFIG.concurrency,
      redis: `${QUEUE_CONFIG.connection.host}:${QUEUE_CONFIG.connection.port}`,
    });

    // Connect to message bus if not already connected
    try {
      await messageBus.connect();
    } catch (error) {
      logger.warn('[BacktestWorker] Message bus not available, continuing without event publishing');
    }

    // Create BullMQ worker
    this.worker = new Worker(
      'backtest-queue',
      this.processJob.bind(this),
      {
        ...QUEUE_CONFIG,
        concurrency: WORKER_CONFIG.concurrency,
        lockDuration: WORKER_CONFIG.lockDuration,
        stalledInterval: WORKER_CONFIG.stalledInterval,
        maxStalledCount: WORKER_CONFIG.maxStalledCount,
      }
    );

    // Set up event handlers
    this.setupEventHandlers();

    logger.info('[BacktestWorker] Worker started and waiting for jobs');
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job<BacktestJobData>): Promise<BacktestJobResult> {
    if (this.isShuttingDown) {
      throw new Error('Worker is shutting down');
    }

    this.stats.active++;
    
    logger.info(`[BacktestWorker] Processing job ${job.id}:`, {
      strategyId: job.data.strategy.id,
      symbol: job.data.symbol,
      days: job.data.days,
      attempt: job.attemptsMade + 1,
    });

    try {
      const result = await processBacktestJob(job);
      
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
      
    } finally {
      this.stats.active = Math.max(0, this.stats.active - 1);
    }
  }

  /**
   * Set up worker event handlers
   */
  private setupEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on('ready', () => {
      logger.info('[BacktestWorker] Worker ready');
    });

    this.worker.on('active', (job) => {
      logger.debug(`[BacktestWorker] Job ${job.id} is now active`);
    });

    this.worker.on('completed', (job, result: BacktestJobResult) => {
      this.stats.processed++;
      this.stats.lastProcessedAt = new Date();
      
      if (result.success) {
        logger.info(`[BacktestWorker] Job ${job.id} completed successfully:`, {
          strategyId: result.strategyId,
          symbol: result.symbol,
          sharpe: result.result?.sharpeRatio?.toFixed(2),
          winRate: result.result?.winRate?.toFixed(1),
          viable: result.assessment?.isViable,
          processingTimeMs: result.processingTimeMs,
        });
      } else {
        logger.warn(`[BacktestWorker] Job ${job.id} completed with failure:`, result.error);
      }
    });

    this.worker.on('failed', (job, error) => {
      this.stats.failed++;
      this.stats.lastFailedAt = new Date();
      
      const attemptsMade = job?.attemptsMade ?? 0;
      const maxAttempts = job?.opts?.attempts ?? 3;
      
      logger.error(`[BacktestWorker] Job ${job?.id} failed:`, {
        error: error.message,
        attempts: attemptsMade,
        willRetry: attemptsMade < maxAttempts,
      });

      // Publish failure event
      this.publishJobFailed(job, error);
    });

    this.worker.on('error', (error) => {
      logger.error('[BacktestWorker] Worker error:', error);
    });

    this.worker.on('stalled', (jobId) => {
      logger.warn(`[BacktestWorker] Job ${jobId} stalled`);
    });

    this.worker.on('progress', (job, progress) => {
      logger.debug(`[BacktestWorker] Job ${job.id} progress:`, progress);
    });
  }

  /**
   * Publish job completion event to message bus
   */
  private async publishJobComplete(
    job: Job<BacktestJobData>,
    result: BacktestJobResult
  ): Promise<void> {
    try {
      await messageBus.publish('system:metrics' as any, {
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
    } catch (error) {
      logger.debug('[BacktestWorker] Failed to publish job complete event:', error);
    }
  }

  /**
   * Publish job failure event to message bus
   */
  private async publishJobFailed(
    job: Job<BacktestJobData> | undefined,
    error: Error
  ): Promise<void> {
    try {
      await messageBus.publish('system:metrics' as any, {
        event: 'backtest:failed',
        jobId: job?.id,
        strategyId: job?.data?.strategy?.id,
        symbol: job?.data?.symbol,
        error: error.message,
        attempts: job?.attemptsMade,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.debug('[BacktestWorker] Failed to publish job failed event:', err);
    }
  }

  /**
   * Get current worker statistics
   */
  getStats(): WorkerStats {
    return { ...this.stats };
  }

  /**
   * Pause the worker
   */
  async pause(): Promise<void> {
    if (this.worker) {
      await this.worker.pause();
      logger.info('[BacktestWorker] Worker paused');
    }
  }

  /**
   * Resume the worker
   */
  async resume(): Promise<void> {
    if (this.worker) {
      await this.worker.resume();
      logger.info('[BacktestWorker] Worker resumed');
    }
  }

  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.worker !== null && !this.isShuttingDown;
  }

  /**
   * Gracefully shut down the worker
   */
  async stop(): Promise<void> {
    if (!this.worker || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('[BacktestWorker] Shutting down...');

    // Close the worker
    await this.worker.close();
    this.worker = null;

    logger.info('[BacktestWorker] Worker stopped');
  }
}

// Singleton instance
const backtestWorker = new BacktestWorker();

export default backtestWorker;
export { BacktestWorker };
