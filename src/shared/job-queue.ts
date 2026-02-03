// Job Queue Service - BullMQ for Async Background Processing
// Handles LLM batching, news clustering, and other async tasks

import { Queue, Worker, Job } from 'bullmq';
import logger from './logger';
import messageBus from './message-bus';

// Job types
export enum JobType {
  // News processing jobs
  NEWS_CATEGORIZE = 'news:categorize',
  NEWS_LABEL = 'news:label',
  NEWS_CLUSTER = 'news:cluster',
  NEWS_EMBED = 'news:embed',

  // LLM jobs
  LLM_CATEGORIZE_BATCH = 'llm:categorize-batch',
  LLM_LABEL_BATCH = 'llm:label-batch',
  LLM_EMBED_BATCH = 'llm:embed-batch',

  // Trading jobs
  STRATEGY_BACKTEST = 'trading:backtest',
  STRATEGY_GENERATE = 'trading:generate-strategy',
  PATTERN_SEARCH = 'trading:pattern-search',

  // Analysis jobs
  TRACE_ANALYZE = 'analysis:trace-analyze',
  PERFORMANCE_CALCULATE = 'analysis:performance',
}

// Job data interfaces
export interface CategorizeBatchJob {
  articles: Array<{
    id: string;
    title: string;
    content?: string;
    snippet?: string;
    source?: string;
  }>;
  priority?: number;
}

export interface LabelBatchJob {
  articles: Array<{
    id: string;
    title: string;
    category?: string;
    tags?: string[];
  }>;
  priority?: number;
}

export interface EmbedBatchJob {
  texts: Array<{
    id: string;
    text: string;
  }>;
  priority?: number;
}

export interface BacktestJob {
  strategy: any;
  symbol: string;
  timeframe: string;
  from: number;
  to: number;
}

export interface PatternSearchJob {
  query: {
    symbol: string;
    regime?: string;
    indicators?: any;
  };
  limit?: number;
}

// Queue configuration
const QUEUE_CONFIG = {
  connection: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.REDIS_PORT || '6380', 10),
    password: process.env.REDIS_PASSWORD,
    db: Number.parseInt(process.env.REDIS_QUEUE_DB || '2', 10), // DB 2 for queues
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 86400, // or 1 day old
    },
    removeOnFail: {
      count: 5000, // Keep last 5000 failed jobs
    },
  },
};

// Queue registry
const queues = new Map<string, Queue>();
const workers = new Map<string, Worker>();

/**
 * Get or create a queue
 */
function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    const queue = new Queue(name, QUEUE_CONFIG);
    queues.set(name, queue);

    // Set up event listeners
    queue.on('error', (error) => {
      logger.error(`[Queue ${name}] Error:`, error);
    });

    queue.on('waiting', (job) => {
      logger.debug(`[Queue ${name}] Job ${job?.id} waiting`);
    });
  }
  return queues.get(name)!;
}

/**
 * Create a worker for processing jobs
 */
function createWorker(
  queueName: string,
  processor: (job: Job) => Promise<any>,
  options: {
    concurrency?: number;
    limiter?: {
      max: number;
      duration: number;
    };
  } = {}
): Worker {
  const workerKey = `${queueName}-worker`;

  if (workers.has(workerKey)) {
    logger.warn(`[JobQueue] Worker for ${queueName} already exists`);
    return workers.get(workerKey)!;
  }

  const worker = new Worker(
    queueName,
    processor,
    {
      ...QUEUE_CONFIG,
      concurrency: options.concurrency || 1,
      limiter: options.limiter,
    }
  );

  // Worker event handlers
  worker.on('completed', (job) => {
    logger.debug(`[Worker ${queueName}] Completed job ${job.id}`);

    // Publish completion to message bus
    void messageBus.publish('job:complete', {
      queue: queueName,
      jobId: job.id,
      type: job.name,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error(`[Worker ${queueName}] Failed job ${job?.id}:`, error);

    // Publish failure to message bus
    void messageBus.publish('job:failed', {
      queue: queueName,
      jobId: job?.id,
      type: job?.name,
      error: error.message,
    });
  });

  worker.on('error', (error) => {
    logger.error(`[Worker ${queueName}] Error:`, error);
  });

  workers.set(workerKey, worker);
  logger.info(`[JobQueue] Created worker for ${queueName}`);

  return worker;
}

/**
 * Job Queue Manager
 */
class JobQueueManager {
  /**
   * Add a categorization batch job
   */
  async addCategorizeJob(data: CategorizeBatchJob, options?: { priority?: number }): Promise<Job> {
    const queue = getQueue('categorization');
    return queue.add(JobType.NEWS_CATEGORIZE, data, {
      priority: options?.priority || 5,
    });
  }

  /**
   * Add a labeling batch job
   */
  async addLabelJob(data: LabelBatchJob, options?: { priority?: number }): Promise<Job> {
    const queue = getQueue('labeling');
    return queue.add(JobType.NEWS_LABEL, data, {
      priority: options?.priority || 5,
    });
  }

  /**
   * Add an embedding batch job
   */
  async addEmbedJob(data: EmbedBatchJob, options?: { priority?: number }): Promise<Job> {
    const queue = getQueue('embeddings');
    return queue.add(JobType.NEWS_EMBED, data, {
      priority: options?.priority || 5,
    });
  }

  /**
   * Add a backtest job
   */
  async addBacktestJob(data: BacktestJob): Promise<Job> {
    const queue = getQueue('backtesting');
    return queue.add(JobType.STRATEGY_BACKTEST, data);
  }

  /**
   * Add a pattern search job
   */
  async addPatternSearchJob(data: PatternSearchJob): Promise<Job> {
    const queue = getQueue('pattern-search');
    return queue.add(JobType.PATTERN_SEARCH, data);
  }

  /**
   * Add bulk jobs (for batch processing)
   */
  async addBulkJobs(
    queueName: string,
    jobType: string,
    items: any[],
    options?: { priority?: number }
  ): Promise<Job[]> {
    const queue = getQueue(queueName);
    const jobs = items.map(item => ({
      name: jobType,
      data: item,
      opts: { priority: options?.priority || 5 },
    }));

    return queue.addBulk(jobs);
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const queue = getQueue(queueName);

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Get all queue stats
   */
  async getAllStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};

    for (const [name] of queues) {
      stats[name] = await this.getQueueStats(name);
    }

    return stats;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = getQueue(queueName);
    await queue.pause();
    logger.info(`[JobQueue] Paused queue: ${queueName}`);
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = getQueue(queueName);
    await queue.resume();
    logger.info(`[JobQueue] Resumed queue: ${queueName}`);
  }

  /**
   * Drain a queue (remove all jobs)
   */
  async drainQueue(queueName: string): Promise<void> {
    const queue = getQueue(queueName);
    await queue.drain();
    logger.info(`[JobQueue] Drained queue: ${queueName}`);
  }

  /**
   * Close all queues and workers
   */
  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const [name, worker] of workers) {
      closePromises.push(worker.close().then(() => {
        logger.debug(`[JobQueue] Closed worker: ${name}`);
      }));
    }

    for (const [name, queue] of queues) {
      closePromises.push(queue.close().then(() => {
        logger.debug(`[JobQueue] Closed queue: ${name}`);
      }));
    }

    await Promise.all(closePromises);
    workers.clear();
    queues.clear();
    logger.info('[JobQueue] All queues and workers closed');
  }
}

// Singleton instance
const jobQueueManager = new JobQueueManager();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('[JobQueue] SIGTERM received, closing queues...');
  await jobQueueManager.close();
});

process.on('SIGINT', async () => {
  logger.info('[JobQueue] SIGINT received, closing queues...');
  await jobQueueManager.close();
});

export default jobQueueManager;
export { getQueue, createWorker, JobQueueManager };
