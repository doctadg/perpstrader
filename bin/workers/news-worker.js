"use strict";
// News Processing Worker - Background jobs for news clustering and labeling
// Runs as a separate process to handle CPU-intensive tasks
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNewsWorker = createNewsWorker;
const bullmq_1 = require("bullmq");
const redis_cache_1 = __importDefault(require("../shared/redis-cache"));
const openrouter_service_1 = __importDefault(require("../shared/openrouter-service"));
const title_cleaner_1 = require("../shared/title-cleaner");
const logger_1 = __importDefault(require("../shared/logger"));
const message_bus_1 = __importStar(require("../shared/message-bus"));
const news_vector_store_1 = __importDefault(require("../data/news-vector-store"));
const story_cluster_store_1 = __importDefault(require("../data/story-cluster-store"));
const crypto_1 = __importDefault(require("crypto"));
// Configuration
const QUEUE_CONFIG = {
    connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number.parseInt(process.env.REDIS_PORT || '6380', 10),
        password: process.env.REDIS_PASSWORD,
        db: Number.parseInt(process.env.REDIS_QUEUE_DB || '2', 10),
    },
};
/**
 * Process categorization batch job
 */
async function processCategorizeBatch(job) {
    const { articles } = job.data;
    logger_1.default.info(`[NewsWorker] Processing categorization batch: ${articles.length} articles`);
    // Check cache first for each article
    const uncached = [];
    const cachedResults = new Map();
    for (const article of articles) {
        const fingerprint = (0, title_cleaner_1.getTitleFingerprint)(article.title);
        const cached = await redis_cache_1.default.getCategorization(fingerprint);
        if (cached) {
            cachedResults.set(article.id, cached);
        }
        else {
            uncached.push(article);
        }
    }
    logger_1.default.info(`[NewsWorker] Cache hit: ${cachedResults.size}/${articles.length}`);
    // Process uncached articles with OpenRouter
    let results = new Map(cachedResults);
    if (uncached.length > 0) {
        const llmResults = await openrouter_service_1.default.categorizeArticles(uncached);
        // Store results in cache
        for (const [id, result] of llmResults) {
            const fingerprint = (0, title_cleaner_1.getTitleFingerprint)(uncached.find(a => a.id === id)?.title || '');
            await redis_cache_1.default.setCategorization(fingerprint, result);
            results.set(id, result);
        }
    }
    return {
        categorized: results.size,
        fromCache: cachedResults.size,
        fromLLM: uncached.length,
        results: Object.fromEntries(results),
    };
}
/**
 * Process event label batch job
 */
async function processLabelBatch(job) {
    const { articles } = job.data;
    logger_1.default.info(`[NewsWorker] Processing label batch: ${articles.length} articles`);
    // Check cache first
    const uncached = [];
    const cachedResults = new Map();
    for (const article of articles) {
        const fingerprint = (0, title_cleaner_1.getTitleFingerprint)(article.title);
        const cached = await redis_cache_1.default.getEventLabel(fingerprint);
        if (cached) {
            cachedResults.set(article.id, cached);
        }
        else {
            uncached.push(article);
        }
    }
    logger_1.default.info(`[NewsWorker] Label cache hit: ${cachedResults.size}/${articles.length}`);
    // Process uncached articles
    let results = new Map(cachedResults);
    if (uncached.length > 0) {
        const llmResults = await openrouter_service_1.default.batchEventLabels(uncached);
        // Store results in cache
        for (const [id, result] of llmResults) {
            const fingerprint = (0, title_cleaner_1.getTitleFingerprint)(uncached.find(a => a.id === id)?.title || '');
            await redis_cache_1.default.setEventLabel(fingerprint, result);
            results.set(id, result);
        }
    }
    return {
        labeled: results.size,
        fromCache: cachedResults.size,
        fromLLM: uncached.length,
        results: Object.fromEntries(results),
    };
}
/**
 * Process embedding batch job
 */
async function processEmbedBatch(job) {
    const { texts } = job.data;
    logger_1.default.info(`[NewsWorker] Processing embedding batch: ${texts.length} texts`);
    // Check cache first
    const uncached = [];
    const cachedResults = new Map();
    for (const item of texts) {
        const cached = await redis_cache_1.default.getEmbedding(item.text);
        if (cached) {
            cachedResults.set(item.id, cached);
        }
        else {
            uncached.push(item);
        }
    }
    logger_1.default.info(`[NewsWorker] Embedding cache hit: ${cachedResults.size}/${texts.length}`);
    // Process uncached texts
    let results = new Map(cachedResults);
    if (uncached.length > 0) {
        // Generate embeddings in parallel
        const embeddings = await Promise.all(uncached.map(async (item) => {
            const embedding = await openrouter_service_1.default.generateEmbedding(item.text);
            if (embedding) {
                await redis_cache_1.default.setEmbedding(item.text, embedding);
            }
            return { id: item.id, embedding };
        }));
        for (const { id, embedding } of embeddings) {
            if (embedding) {
                results.set(id, embedding);
            }
        }
    }
    return {
        embedded: results.size,
        fromCache: cachedResults.size,
        generated: uncached.length,
        results: Object.fromEntries(results),
    };
}
/**
 * Process cluster assignment batch job
 * This replaces the sequential clustering in story-cluster-node.ts
 */
async function processClusterBatch(job) {
    const { articles } = job.data; // Array of { article, aiLabel }
    logger_1.default.info(`[NewsWorker] Processing cluster batch: ${articles.length} articles`);
    const BATCH_SIZE = 20;
    const results = {
        newClusters: 0,
        existingClusters: 0,
        errors: 0,
    };
    // Process in parallel batches
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
        const batch = articles.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async ({ article, aiLabel }) => {
            try {
                const titleFingerprint = (0, title_cleaner_1.getTitleFingerprint)(article.title);
                const topic = aiLabel.topic;
                const topicKey = topic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 180);
                // Try to find existing cluster
                let assignedClusterId = null;
                // 1. Check by topic key
                const existingByTopic = await story_cluster_store_1.default.getClusterIdByTopicKey(topicKey);
                if (existingByTopic) {
                    const cluster = await story_cluster_store_1.default.getClusterById(existingByTopic);
                    if (cluster && cluster.category === article.categories[0]) {
                        assignedClusterId = existingByTopic;
                    }
                }
                // 2. Create new cluster if not found
                if (!assignedClusterId) {
                    const newClusterId = crypto_1.default.randomUUID();
                    await story_cluster_store_1.default.upsertCluster({
                        id: newClusterId,
                        topic: topic,
                        topicKey: topicKey,
                        summary: article.summary || '',
                        category: article.categories[0] || 'GENERAL',
                        keywords: aiLabel.keywords || [],
                        heatScore: 10,
                        articleCount: 1,
                        uniqueTitleCount: 1,
                        trendDirection: aiLabel.trendDirection,
                        urgency: aiLabel.urgency,
                        subEventType: aiLabel.subEventType,
                        firstSeen: new Date(),
                    });
                    await story_cluster_store_1.default.addArticleToCluster(newClusterId, article.id, titleFingerprint, 0, aiLabel.trendDirection);
                    results.newClusters++;
                    // Store vector embedding
                    await news_vector_store_1.default.storeArticle(article, newClusterId);
                }
                else {
                    // Add to existing cluster
                    await story_cluster_store_1.default.addArticleToCluster(assignedClusterId, article.id, titleFingerprint, 0, aiLabel.trendDirection);
                    await news_vector_store_1.default.storeArticle(article, assignedClusterId);
                    results.existingClusters++;
                }
            }
            catch (error) {
                logger_1.default.error(`[NewsWorker] Error processing article ${article.id}:`, error);
                results.errors++;
            }
        }));
    }
    // Publish hot clusters update
    message_bus_1.default.publish(message_bus_1.Channel.NEWS_HOT_CLUSTERS, {
        newClusters: results.newClusters,
        totalProcessed: articles.length,
    });
    return results;
}
/**
 * Create and start the news worker
 */
async function createNewsWorker() {
    const worker = new bullmq_1.Worker('news-processing', async (job) => {
        switch (job.name) {
            case 'news:categorize':
                return processCategorizeBatch(job);
            case 'news:label':
                return processLabelBatch(job);
            case 'news:embed':
                return processEmbedBatch(job);
            case 'news:cluster':
                return processClusterBatch(job);
            default:
                throw new Error(`Unknown job type: ${job.name}`);
        }
    }, {
        ...QUEUE_CONFIG,
        concurrency: Number.parseInt(process.env.NEWS_WORKER_CONCURRENCY || '5', 10),
        limiter: {
            max: 100,
            duration: 60000, // 100 jobs per minute per worker
        },
    });
    worker.on('ready', () => {
        logger_1.default.info('[NewsWorker] Ready to process jobs');
    });
    worker.on('error', (error) => {
        logger_1.default.error('[NewsWorker] Error:', error);
    });
    worker.on('completed', (job) => {
        logger_1.default.debug(`[NewsWorker] Completed job ${job.id}: ${job.name}`);
    });
    worker.on('failed', (job, error) => {
        logger_1.default.error(`[NewsWorker] Failed job ${job?.id}:`, error);
    });
    return worker;
}
// Start worker if run directly
if (require.main === module) {
    (async () => {
        logger_1.default.info('[NewsWorker] Starting news processing worker...');
        // Connect to Redis cache
        await redis_cache_1.default.connect();
        // Connect to message bus
        await message_bus_1.default.connect();
        // Start worker
        const worker = await createNewsWorker();
        logger_1.default.info('[NewsWorker] Worker started');
        // Graceful shutdown
        const shutdown = async () => {
            logger_1.default.info('[NewsWorker] Shutting down...');
            await worker.close();
            await redis_cache_1.default.disconnect();
            await message_bus_1.default.disconnect();
            process.exit(0);
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    })();
}
exports.default = createNewsWorker;
//# sourceMappingURL=news-worker.js.map