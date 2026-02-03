import { Queue, Worker, Job } from 'bullmq';
export declare enum JobType {
    NEWS_CATEGORIZE = "news:categorize",
    NEWS_LABEL = "news:label",
    NEWS_CLUSTER = "news:cluster",
    NEWS_EMBED = "news:embed",
    LLM_CATEGORIZE_BATCH = "llm:categorize-batch",
    LLM_LABEL_BATCH = "llm:label-batch",
    LLM_EMBED_BATCH = "llm:embed-batch",
    STRATEGY_BACKTEST = "trading:backtest",
    STRATEGY_GENERATE = "trading:generate-strategy",
    PATTERN_SEARCH = "trading:pattern-search",
    TRACE_ANALYZE = "analysis:trace-analyze",
    PERFORMANCE_CALCULATE = "analysis:performance"
}
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
/**
 * Get or create a queue
 */
declare function getQueue(name: string): Queue;
/**
 * Create a worker for processing jobs
 */
declare function createWorker(queueName: string, processor: (job: Job) => Promise<any>, options?: {
    concurrency?: number;
    limiter?: {
        max: number;
        duration: number;
    };
}): Worker;
/**
 * Job Queue Manager
 */
declare class JobQueueManager {
    /**
     * Add a categorization batch job
     */
    addCategorizeJob(data: CategorizeBatchJob, options?: {
        priority?: number;
    }): Promise<Job>;
    /**
     * Add a labeling batch job
     */
    addLabelJob(data: LabelBatchJob, options?: {
        priority?: number;
    }): Promise<Job>;
    /**
     * Add an embedding batch job
     */
    addEmbedJob(data: EmbedBatchJob, options?: {
        priority?: number;
    }): Promise<Job>;
    /**
     * Add a backtest job
     */
    addBacktestJob(data: BacktestJob): Promise<Job>;
    /**
     * Add a pattern search job
     */
    addPatternSearchJob(data: PatternSearchJob): Promise<Job>;
    /**
     * Add bulk jobs (for batch processing)
     */
    addBulkJobs(queueName: string, jobType: string, items: any[], options?: {
        priority?: number;
    }): Promise<Job[]>;
    /**
     * Get queue statistics
     */
    getQueueStats(queueName: string): Promise<{
        waiting: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
    }>;
    /**
     * Get all queue stats
     */
    getAllStats(): Promise<Record<string, any>>;
    /**
     * Pause a queue
     */
    pauseQueue(queueName: string): Promise<void>;
    /**
     * Resume a queue
     */
    resumeQueue(queueName: string): Promise<void>;
    /**
     * Drain a queue (remove all jobs)
     */
    drainQueue(queueName: string): Promise<void>;
    /**
     * Close all queues and workers
     */
    close(): Promise<void>;
}
declare const jobQueueManager: JobQueueManager;
export default jobQueueManager;
export { getQueue, createWorker, JobQueueManager };
//# sourceMappingURL=job-queue.d.ts.map