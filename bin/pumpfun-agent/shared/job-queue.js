"use strict";
// Job Queue Service - BullMQ for Async Background Processing
// Handles LLM batching, news clustering, and other async tasks
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobQueueManager = exports.JobType = void 0;
exports.getQueue = getQueue;
exports.createWorker = createWorker;
const bullmq_1 = require("bullmq");
const logger_1 = __importDefault(require("./logger"));
const message_bus_1 = __importDefault(require("./message-bus"));
// Job types
var JobType;
(function (JobType) {
    // News processing jobs
    JobType["NEWS_CATEGORIZE"] = "news:categorize";
    JobType["NEWS_LABEL"] = "news:label";
    JobType["NEWS_CLUSTER"] = "news:cluster";
    JobType["NEWS_EMBED"] = "news:embed";
    // LLM jobs
    JobType["LLM_CATEGORIZE_BATCH"] = "llm:categorize-batch";
    JobType["LLM_LABEL_BATCH"] = "llm:label-batch";
    JobType["LLM_EMBED_BATCH"] = "llm:embed-batch";
    // Trading jobs
    JobType["STRATEGY_BACKTEST"] = "trading:backtest";
    JobType["STRATEGY_GENERATE"] = "trading:generate-strategy";
    JobType["PATTERN_SEARCH"] = "trading:pattern-search";
    // Analysis jobs
    JobType["TRACE_ANALYZE"] = "analysis:trace-analyze";
    JobType["PERFORMANCE_CALCULATE"] = "analysis:performance";
})(JobType || (exports.JobType = JobType = {}));
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
const queues = new Map();
const workers = new Map();
/**
 * Get or create a queue
 */
function getQueue(name) {
    if (!queues.has(name)) {
        const queue = new bullmq_1.Queue(name, QUEUE_CONFIG);
        queues.set(name, queue);
        // Set up event listeners
        queue.on('error', (error) => {
            logger_1.default.error(`[Queue ${name}] Error:`, error);
        });
        queue.on('waiting', (job) => {
            logger_1.default.debug(`[Queue ${name}] Job ${job?.id} waiting`);
        });
    }
    return queues.get(name);
}
/**
 * Create a worker for processing jobs
 */
function createWorker(queueName, processor, options = {}) {
    const workerKey = `${queueName}-worker`;
    if (workers.has(workerKey)) {
        logger_1.default.warn(`[JobQueue] Worker for ${queueName} already exists`);
        return workers.get(workerKey);
    }
    const worker = new bullmq_1.Worker(queueName, processor, {
        ...QUEUE_CONFIG,
        concurrency: options.concurrency || 1,
        limiter: options.limiter,
    });
    // Worker event handlers
    worker.on('completed', (job) => {
        logger_1.default.debug(`[Worker ${queueName}] Completed job ${job.id}`);
        // Publish completion to message bus
        void message_bus_1.default.publish('job:complete', {
            queue: queueName,
            jobId: job.id,
            type: job.name,
        });
    });
    worker.on('failed', (job, error) => {
        logger_1.default.error(`[Worker ${queueName}] Failed job ${job?.id}:`, error);
        // Publish failure to message bus
        void message_bus_1.default.publish('job:failed', {
            queue: queueName,
            jobId: job?.id,
            type: job?.name,
            error: error.message,
        });
    });
    worker.on('error', (error) => {
        logger_1.default.error(`[Worker ${queueName}] Error:`, error);
    });
    workers.set(workerKey, worker);
    logger_1.default.info(`[JobQueue] Created worker for ${queueName}`);
    return worker;
}
/**
 * Job Queue Manager
 */
class JobQueueManager {
    /**
     * Add a categorization batch job
     */
    async addCategorizeJob(data, options) {
        const queue = getQueue('categorization');
        return queue.add(JobType.NEWS_CATEGORIZE, data, {
            priority: options?.priority || 5,
        });
    }
    /**
     * Add a labeling batch job
     */
    async addLabelJob(data, options) {
        const queue = getQueue('labeling');
        return queue.add(JobType.NEWS_LABEL, data, {
            priority: options?.priority || 5,
        });
    }
    /**
     * Add an embedding batch job
     */
    async addEmbedJob(data, options) {
        const queue = getQueue('embeddings');
        return queue.add(JobType.NEWS_EMBED, data, {
            priority: options?.priority || 5,
        });
    }
    /**
     * Add a backtest job
     */
    async addBacktestJob(data) {
        const queue = getQueue('backtesting');
        return queue.add(JobType.STRATEGY_BACKTEST, data);
    }
    /**
     * Add a pattern search job
     */
    async addPatternSearchJob(data) {
        const queue = getQueue('pattern-search');
        return queue.add(JobType.PATTERN_SEARCH, data);
    }
    /**
     * Add bulk jobs (for batch processing)
     */
    async addBulkJobs(queueName, jobType, items, options) {
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
    async getQueueStats(queueName) {
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
    async getAllStats() {
        const stats = {};
        for (const [name] of queues) {
            stats[name] = await this.getQueueStats(name);
        }
        return stats;
    }
    /**
     * Pause a queue
     */
    async pauseQueue(queueName) {
        const queue = getQueue(queueName);
        await queue.pause();
        logger_1.default.info(`[JobQueue] Paused queue: ${queueName}`);
    }
    /**
     * Resume a queue
     */
    async resumeQueue(queueName) {
        const queue = getQueue(queueName);
        await queue.resume();
        logger_1.default.info(`[JobQueue] Resumed queue: ${queueName}`);
    }
    /**
     * Drain a queue (remove all jobs)
     */
    async drainQueue(queueName) {
        const queue = getQueue(queueName);
        await queue.drain();
        logger_1.default.info(`[JobQueue] Drained queue: ${queueName}`);
    }
    /**
     * Close all queues and workers
     */
    async close() {
        const closePromises = [];
        for (const [name, worker] of workers) {
            closePromises.push(worker.close().then(() => {
                logger_1.default.debug(`[JobQueue] Closed worker: ${name}`);
            }));
        }
        for (const [name, queue] of queues) {
            closePromises.push(queue.close().then(() => {
                logger_1.default.debug(`[JobQueue] Closed queue: ${name}`);
            }));
        }
        await Promise.all(closePromises);
        workers.clear();
        queues.clear();
        logger_1.default.info('[JobQueue] All queues and workers closed');
    }
}
exports.JobQueueManager = JobQueueManager;
// Singleton instance
const jobQueueManager = new JobQueueManager();
// Graceful shutdown
process.on('SIGTERM', async () => {
    logger_1.default.info('[JobQueue] SIGTERM received, closing queues...');
    await jobQueueManager.close();
});
process.on('SIGINT', async () => {
    logger_1.default.info('[JobQueue] SIGINT received, closing queues...');
    await jobQueueManager.close();
});
exports.default = jobQueueManager;
//# sourceMappingURL=job-queue.js.map