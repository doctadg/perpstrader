// News Processing Worker - Background jobs for news clustering and labeling
// Runs as a separate process to handle CPU-intensive tasks

import { Worker, Job } from 'bullmq';
import redisCache from '../shared/redis-cache';
import openrouterService from '../shared/openrouter-service';
import glmService from '../shared/glm-service';
import { getTitleFingerprint } from '../shared/title-cleaner';
import logger from '../shared/logger';
import messageBus, { Channel } from '../shared/message-bus';
import newsVectorStore from '../data/news-vector-store';
import storyClusterStore from '../data/story-cluster-store';
import { NewsArticle } from '../shared/types';
import crypto from 'crypto';

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
async function processCategorizeBatch(job: Job): Promise<any> {
  const { articles } = job.data;

  logger.info(`[NewsWorker] Processing categorization batch: ${articles.length} articles`);

  // Check cache first for each article
  const uncached: typeof articles = [];
  const cachedResults = new Map<string, any>();

  for (const article of articles) {
    const fingerprint = getTitleFingerprint(article.title);
    const cached = await redisCache.getCategorization(fingerprint);

    if (cached) {
      cachedResults.set(article.id, cached);
    } else {
      uncached.push(article);
    }
  }

  logger.info(`[NewsWorker] Cache hit: ${cachedResults.size}/${articles.length}`);

  // Process uncached articles with OpenRouter
  let results = new Map(cachedResults);

  if (uncached.length > 0) {
    const llmResults = await openrouterService.categorizeArticles(uncached);

    // Store results in cache
    for (const [id, result] of llmResults) {
      const fingerprint = getTitleFingerprint(
        uncached.find(a => a.id === id)?.title || ''
      );
      await redisCache.setCategorization(fingerprint, result);
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
async function processLabelBatch(job: Job): Promise<any> {
  const { articles } = job.data;

  logger.info(`[NewsWorker] Processing label batch: ${articles.length} articles`);

  // Check cache first
  const uncached: typeof articles = [];
  const cachedResults = new Map<string, any>();

  for (const article of articles) {
    const fingerprint = getTitleFingerprint(article.title);
    const cached = await redisCache.getEventLabel(fingerprint);

    if (cached) {
      cachedResults.set(article.id, cached);
    } else {
      uncached.push(article);
    }
  }

  logger.info(`[NewsWorker] Label cache hit: ${cachedResults.size}/${articles.length}`);

  // Process uncached articles
  let results = new Map(cachedResults);

  if (uncached.length > 0) {
    const llmResults = await openrouterService.batchEventLabels(uncached);

    // Store results in cache
    for (const [id, result] of llmResults) {
      const fingerprint = getTitleFingerprint(
        uncached.find(a => a.id === id)?.title || ''
      );
      await redisCache.setEventLabel(fingerprint, result);
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
async function processEmbedBatch(job: Job): Promise<any> {
  const { texts } = job.data;

  logger.info(`[NewsWorker] Processing embedding batch: ${texts.length} texts`);

  // Check cache first
  const uncached: typeof texts = [];
  const cachedResults = new Map<string, number[]>();

  for (const item of texts) {
    const cached = await redisCache.getEmbedding(item.text);

    if (cached) {
      cachedResults.set(item.id, cached);
    } else {
      uncached.push(item);
    }
  }

  logger.info(`[NewsWorker] Embedding cache hit: ${cachedResults.size}/${texts.length}`);

  // Process uncached texts
  let results = new Map(cachedResults);

  if (uncached.length > 0) {
    // Generate embeddings in parallel
    const embeddings = await Promise.all(
      uncached.map(async (item) => {
        const embedding = await openrouterService.generateEmbedding(item.text);
        if (embedding) {
          await redisCache.setEmbedding(item.text, embedding);
        }
        return { id: item.id, embedding };
      })
    );

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
async function processClusterBatch(job: Job): Promise<any> {
  const { articles } = job.data; // Array of { article, aiLabel }

  logger.info(`[NewsWorker] Processing cluster batch: ${articles.length} articles`);

  const BATCH_SIZE = 20;
  const results = {
    newClusters: 0,
    existingClusters: 0,
    errors: 0,
  };

  // Process in parallel batches
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async ({ article, aiLabel }) => {
        try {
          const titleFingerprint = getTitleFingerprint(article.title);
          const topic = aiLabel.topic;
          const topicKey = topic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 180);

          // Try to find existing cluster
          let assignedClusterId: string | null = null;

          // 1. Check by topic key
          const existingByTopic = await storyClusterStore.getClusterIdByTopicKey(topicKey);
          if (existingByTopic) {
            const cluster = await storyClusterStore.getClusterById(existingByTopic);
            if (cluster && cluster.category === article.categories[0]) {
              assignedClusterId = existingByTopic;
            }
          }

          // 2. Create new cluster if not found
          if (!assignedClusterId) {
            const newClusterId = crypto.randomUUID();
            await storyClusterStore.upsertCluster({
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

            await storyClusterStore.addArticleToCluster(newClusterId, article.id, titleFingerprint, 0, aiLabel.trendDirection);
            results.newClusters++;

            // Store vector embedding
            await newsVectorStore.storeArticle(article, newClusterId);
          } else {
            // Add to existing cluster
            await storyClusterStore.addArticleToCluster(assignedClusterId, article.id, titleFingerprint, 0, aiLabel.trendDirection);
            await newsVectorStore.storeArticle(article, assignedClusterId);
            results.existingClusters++;
          }

        } catch (error) {
          logger.error(`[NewsWorker] Error processing article ${article.id}:`, error);
          results.errors++;
        }
      })
    );
  }

  // Publish hot clusters update
  messageBus.publish(Channel.NEWS_HOT_CLUSTERS, {
    newClusters: results.newClusters,
    totalProcessed: articles.length,
  });

  return results;
}

/**
 * Create and start the news worker
 */
export async function createNewsWorker(): Promise<Worker> {
  const worker = new Worker(
    'news-processing',
    async (job: Job) => {
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
    },
    {
      ...QUEUE_CONFIG,
      concurrency: Number.parseInt(process.env.NEWS_WORKER_CONCURRENCY || '5', 10),
      limiter: {
        max: 100,
        duration: 60000, // 100 jobs per minute per worker
      },
    }
  );

  worker.on('ready', () => {
    logger.info('[NewsWorker] Ready to process jobs');
  });

  worker.on('error', (error) => {
    logger.error('[NewsWorker] Error:', error);
  });

  worker.on('completed', (job) => {
    logger.debug(`[NewsWorker] Completed job ${job.id}: ${job.name}`);
  });

  worker.on('failed', (job, error) => {
    logger.error(`[NewsWorker] Failed job ${job?.id}:`, error);
  });

  return worker;
}

// Start worker if run directly
if (require.main === module) {
  (async () => {
    logger.info('[NewsWorker] Starting news processing worker...');

    // Connect to Redis cache
    await redisCache.connect();

    // Connect to message bus
    await messageBus.connect();

    // Start worker
    const worker = await createNewsWorker();

    logger.info('[NewsWorker] Worker started');

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('[NewsWorker] Shutting down...');
      await worker.close();
      await redisCache.disconnect();
      await messageBus.disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })();
}

export default createNewsWorker;
