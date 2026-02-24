/**
 * Backtest Worker Pool Manager
 * 
 * Manages multiple backtest workers running in parallel.
 * Provides CLI interface for starting/stopping workers and monitoring status.
 */

import { Queue } from 'bullmq';
import { BacktestWorker, WorkerStats } from './worker';
import logger from '../shared/logger';
import { Strategy } from '../shared/types';
import { BacktestJobData } from './job-processor';

// Queue configuration
const QUEUE_CONFIG = {
  connection: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.REDIS_PORT || '6380', 10),
    password: process.env.REDIS_PASSWORD,
    db: Number.parseInt(process.env.REDIS_QUEUE_DB || '2', 10),
  },
};

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

class WorkerPoolManager {
  private workers: BacktestWorker[] = [];
  private queue: Queue | null = null;
  private startTime: Date = new Date();
  private isShuttingDown = false;

  /**
   * Initialize and start the worker pool
   */
  async start(config: Partial<PoolConfig> = {}): Promise<void> {
    const {
      numWorkers = Number.parseInt(process.env.BACKTEST_WORKER_COUNT || '2', 10),
      queueName = 'backtest-queue',
    } = config;

    if (this.workers.length > 0) {
      logger.warn('[WorkerPool] Pool already initialized');
      return;
    }

    logger.info('[WorkerPool] Starting worker pool...', { numWorkers, queueName });

    // Initialize queue
    this.queue = new Queue(queueName, QUEUE_CONFIG);

    // Create and start workers
    for (let i = 0; i < numWorkers; i++) {
      const worker = new BacktestWorker();
      await worker.start();
      this.workers.push(worker);
      logger.info(`[WorkerPool] Worker ${i + 1}/${numWorkers} started`);
    }

    // Set up graceful shutdown
    this.setupShutdownHandlers();

    logger.info(`[WorkerPool] Pool initialized with ${numWorkers} workers`);
  }

  /**
   * Stop all workers
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown || this.workers.length === 0) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('[WorkerPool] Stopping all workers...');

    // Stop all workers in parallel
    await Promise.all(this.workers.map((worker, index) => {
      logger.debug(`[WorkerPool] Stopping worker ${index + 1}...`);
      return worker.stop();
    }));

    this.workers = [];

    // Close queue connection
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }

    logger.info('[WorkerPool] All workers stopped');
  }

  /**
   * Get current pool statistics
   */
  async getStats(): Promise<PoolStats> {
    const workerStats = this.workers.map(w => w.getStats());
    
    const totalProcessed = workerStats.reduce((sum, s) => sum + s.processed, 0);
    const totalFailed = workerStats.reduce((sum, s) => sum + s.failed, 0);
    const avgProcessingTime = workerStats.length > 0
      ? workerStats.reduce((sum, s) => sum + s.averageProcessingTimeMs, 0) / workerStats.length
      : 0;

    let queueStats = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    };

    if (this.queue) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          this.queue.getWaitingCount(),
          this.queue.getActiveCount(),
          this.queue.getCompletedCount(),
          this.queue.getFailedCount(),
          this.queue.getDelayedCount(),
        ]);
        queueStats = { waiting, active, completed, failed, delayed };
      } catch (error) {
        logger.warn('[WorkerPool] Failed to fetch queue stats:', error);
      }
    }

    const uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    return {
      workers: workerStats,
      queue: queueStats,
      totalProcessed,
      totalFailed,
      averageProcessingTimeMs: avgProcessingTime,
      uptimeSeconds,
    };
  }

  /**
   * Add a backtest job to the queue
   */
  async addJob(
    strategy: Strategy,
    symbol: string,
    options: {
      timeframe?: string;
      days?: number;
      priority?: number;
    } = {}
  ): Promise<string> {
    if (!this.queue) {
      throw new Error('Worker pool not initialized');
    }

    const {
      timeframe = '1h',
      days = 30,
      priority = 5,
    } = options;

    const jobId = `backtest-${strategy.id}-${symbol}-${Date.now()}`;
    
    const jobData: BacktestJobData = {
      jobId,
      strategy,
      symbol,
      timeframe,
      days,
      priority,
    };

    const job = await this.queue.add('backtest', jobData, {
      jobId,
      priority,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    logger.info(`[WorkerPool] Added backtest job ${job.id} for strategy ${strategy.id} on ${symbol}`);
    
    return job.id || jobId;
  }

  /**
   * Add multiple backtest jobs to the queue
   */
  async addBatchJobs(
    strategies: Strategy[],
    symbols: string[],
    options: {
      timeframe?: string;
      days?: number;
    } = {}
  ): Promise<string[]> {
    const jobIds: string[] = [];
    
    for (const strategy of strategies) {
      for (const symbol of symbols) {
        const jobId = await this.addJob(strategy, symbol, options);
        jobIds.push(jobId);
      }
    }

    logger.info(`[WorkerPool] Added ${jobIds.length} backtest jobs to queue`);
    return jobIds;
  }

  /**
   * Pause all workers
   */
  async pause(): Promise<void> {
    logger.info('[WorkerPool] Pausing all workers...');
    await Promise.all(this.workers.map(w => w.pause()));
    logger.info('[WorkerPool] All workers paused');
  }

  /**
   * Resume all workers
   */
  async resume(): Promise<void> {
    logger.info('[WorkerPool] Resuming all workers...');
    await Promise.all(this.workers.map(w => w.resume()));
    logger.info('[WorkerPool] All workers resumed');
  }

  /**
   * Get worker count
   */
  getWorkerCount(): number {
    return this.workers.length;
  }

  /**
   * Check if pool is running
   */
  isRunning(): boolean {
    return this.workers.length > 0 && !this.isShuttingDown;
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.info(`[WorkerPool] Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('[WorkerPool] Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('[WorkerPool] Unhandled rejection:', reason);
    });
  }
}

// Singleton instance
const workerPool = new WorkerPoolManager();

/**
 * Start the worker pool from CLI
 */
async function main(): Promise<void> {
  const numWorkers = Number.parseInt(process.env.BACKTEST_WORKER_COUNT || '2', 10);
  
  logger.info('╔════════════════════════════════════════════════════════════╗');
  logger.info('║          PERPSTRADER BACKTEST WORKER POOL                  ║');
  logger.info('╠════════════════════════════════════════════════════════════╣');
  logger.info(`║  Workers: ${numWorkers.toString().padEnd(48)}║`);
  logger.info(`║  Queue: backtest-queue${' '.repeat(34)}║`);
  logger.info(`║  Redis: ${QUEUE_CONFIG.connection.host}:${QUEUE_CONFIG.connection.port.toString().padEnd(42)}║`);
  logger.info('╚════════════════════════════════════════════════════════════╝');

  await workerPool.start({ numWorkers });

  // Print stats periodically
  const statsInterval = setInterval(async () => {
    if (!workerPool.isRunning()) {
      clearInterval(statsInterval);
      return;
    }

    try {
      const stats = await workerPool.getStats();
      
      logger.info('[WorkerPool] Status:', {
        workers: stats.workers.length,
        queue: {
          waiting: stats.queue.waiting,
          active: stats.queue.active,
          completed: stats.queue.completed,
          failed: stats.queue.failed,
        },
        processed: stats.totalProcessed,
        failed: stats.totalFailed,
        avgTimeMs: stats.averageProcessingTimeMs.toFixed(0),
        uptime: formatUptime(stats.uptimeSeconds),
      });
    } catch (error) {
      logger.error('[WorkerPool] Error getting stats:', error);
    }
  }, 30000); // Every 30 seconds

  // Keep process alive
  process.stdin.resume();
}

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    logger.error('[WorkerPool] Fatal error:', error);
    process.exit(1);
  });
}

export default workerPool;
export { WorkerPoolManager };
