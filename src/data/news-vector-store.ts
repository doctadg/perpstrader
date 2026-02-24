// News Vector Store Service - Robust ChromaDB Integration with Self-Healing
// Stores and retrieves news article embeddings for semantic clustering

import { ChromaClient, Collection } from 'chromadb';
import { NewsArticle } from '../shared/types';
import logger from '../shared/logger';
import { exec } from 'child_process';
import util from 'util';
import { embedText } from '../shared/local-embeddings';
import { deriveTrend } from '../shared/news-trend';
import openrouterService from '../shared/openrouter-service';

const execAsync = util.promisify(exec);

export interface SimilarArticle {
    id: string;
    score: number; // 0-1 similarity score
    distance: number; // raw distance
    title: string;
    metadata: Record<string, any>;
}

export class NewsVectorStore {
    private client: ChromaClient;
    private newsCollection: Collection | null = null;
    private initialized: boolean = false;
    private consecutiveFailures: number = 0;
    private lastFailureTime: number = 0;
    private circuitOpen: boolean = false;
    private readonly EMBEDDING_DIM = Number.parseInt(process.env.NEWS_EMBEDDING_DIM || '64', 10) || 64;
    private readonly COLLECTION_NAME =
        process.env.CHROMA_NEWS_COLLECTION || `global_news_local_${this.EMBEDDING_DIM}`;

    // Configuration
    private readonly MAX_FAILURES = 3;
    private readonly RESET_TIMEOUT_MS = 60000; // 1 minute
    private readonly RESTART_CMD = process.env.CHROMA_RESTART_CMD || 'sudo -n systemctl restart chromadb';

    constructor() {
        const chromaUrl = process.env.CHROMA_URL || process.env.CHROMADB_URL;
        let urlHost: string | undefined;
        let urlPort: number | undefined;

        if (chromaUrl) {
            try {
                const parsed = new URL(chromaUrl);
                urlHost = parsed.hostname;
                if (parsed.port) {
                    const parsedPort = Number.parseInt(parsed.port, 10);
                    if (Number.isFinite(parsedPort)) {
                        urlPort = parsedPort;
                    }
                }
            } catch {
                // Ignore malformed URL and fall back to explicit host/port vars.
            }
        }

        const host = process.env.CHROMA_HOST || urlHost || '127.0.0.1';
        const port = process.env.CHROMA_PORT ? Number.parseInt(process.env.CHROMA_PORT, 10) : (urlPort ?? 8001);
        const resolvedPort = Number.isFinite(port) ? port : 8001;

        this.client = new ChromaClient({ host, port: resolvedPort });
    }

    /**
     * Check circuit breaker status and attempt to reset if timeout passed
     */
    private checkCircuitBreaker(): boolean {
        if (!this.circuitOpen) return true;

        const now = Date.now();
        if (now - this.lastFailureTime > this.RESET_TIMEOUT_MS) {
            logger.info('[NewsVectorStore] Circuit breaker reset timeout passed, attempting recovery...');
            this.circuitOpen = false;
            this.consecutiveFailures = 0;
            return true;
        }

        return false;
    }

    /**
     * Report a failure and potentially trip circuit breaker or trigger self-healing
     */
    private async reportFailure(error: any): Promise<void> {
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();

        logger.warn(`[NewsVectorStore] Operation failed (${this.consecutiveFailures}/${this.MAX_FAILURES}): ${error.message}`);

        if (this.consecutiveFailures >= this.MAX_FAILURES) {
            if (!this.circuitOpen) {
                logger.error('[NewsVectorStore] Circuit breaker TRIPPED. Vector operations disabled for 60s.');
                this.circuitOpen = true;

                // Trigger self-healing restart if it looks like a connection issue
                if (error.message && (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED'))) {
                    await this.attemptSelfHealing();
                }
            }
        }
    }

    /**
     * Attempt to restart the ChromaDB service
     */
    private async attemptSelfHealing(): Promise<void> {
        if (!this.RESTART_CMD) {
            logger.warn('[NewsVectorStore] Self-healing disabled (CHROMA_RESTART_CMD empty)');
            return;
        }
        logger.info('[NewsVectorStore] 🚑 ATTEMPTING SELF-HEALING: Restarting ChromaDB service...');
        try {
            await execAsync(this.RESTART_CMD, { timeout: 10000 });
            logger.info('[NewsVectorStore] ✅ Service restart command executed. Waiting for service to stabilize...');
            // Wait 5 seconds for service to come up
            await new Promise(resolve => setTimeout(resolve, 5000));
            // Reset initialization to force reconnection
            this.initialized = false;
            this.newsCollection = null;
        } catch (error: any) {
            logger.error(`[NewsVectorStore] ❌ Self-healing failed: ${error.message}`);
        }
    }

    /**
     * Ensure connection and collection exist
     */
    private async ensureReady(): Promise<boolean> {
        if (!this.checkCircuitBreaker()) return false;
        if (this.initialized && this.newsCollection) return true;

        try {
            logger.info('[NewsVectorStore] Connecting to ChromaDB...');
            await this.client.heartbeat(); // Test connection

            // Get or create collection
            this.newsCollection = await this.client.getOrCreateCollection({
                name: this.COLLECTION_NAME,
                metadata: { description: 'Global news articles for semantic clustering' },
                embeddingFunction: null,
            });

            this.initialized = true;
            this.consecutiveFailures = 0; // Reset failure count on success
            logger.info(`[NewsVectorStore] ✅ Connected to collection: ${this.COLLECTION_NAME}`);
            return true;
        } catch (error: any) {
            await this.reportFailure(error);
            return false;
        }
    }

    /**
     * Generate embedding for article text
     * Tries OpenRouter first (semantic), falls back to local (feature hashing)
     */
    private async generateEmbedding(text: string): Promise<number[] | null> {
        const safeText = (text || '').slice(0, 8000);

        // Try OpenRouter embeddings first (better semantic quality)
        try {
            const openrouterEmbedding = await openrouterService.generateEmbedding(safeText);
            if (openrouterEmbedding && openrouterEmbedding.length > 0) {
                logger.debug('[NewsVectorStore] Using OpenRouter embedding');
                return openrouterEmbedding;
            }
        } catch (error) {
            logger.debug('[NewsVectorStore] OpenRouter embedding failed, falling back to local');
        }

        // Fallback to local embeddings
        try {
            return embedText(safeText, this.EMBEDDING_DIM);
        } catch (error) {
            logger.error('[NewsVectorStore] Failed to generate embedding:', error);
            return null;
        }
    }

    /**
     * Store article embedding
     */
    async storeArticle(article: NewsArticle, clusterId?: string): Promise<boolean> {
        const ready = await this.ensureReady();
        if (!ready || !this.newsCollection) return false;

        try {
            const meta = (article.metadata as any) || {};
            const derived = deriveTrend({ title: article.title, category: article.categories?.[0], tags: article.tags });
            const topic = meta.trendTopic || derived.topic;
            const keywords = (meta.trendKeywords && Array.isArray(meta.trendKeywords) ? meta.trendKeywords : derived.keywords) as string[];
            const topicKey = meta.trendTopicKey || derived.topicKey;

            // Embed a compact, topic-focused representation (reduces noisy clustering)
            const textToEmbed = `${topicKey} ${topic} ${keywords.join(' ')}`.trim();

            // Get embedding (with retry logic handled inside glmService if added)
            // For this implementation, we need to add embedding support to GLM service
            // Creating a placeholder call for now
            const embedding = await this.generateEmbedding(textToEmbed);

            if (!embedding) {
                // Without embedding, we can't store in vector DB
                // Use keyword clustering fallback downstream
                return false;
            }

            await this.newsCollection.add({
                ids: [article.id],
                embeddings: [embedding],
                metadatas: [{
                    title: article.title,
                    source: article.source,
                    publishedAt: article.publishedAt ? article.publishedAt.toISOString() : new Date().toISOString(),
                    category: article.categories[0] || 'GENERAL',
                    clusterId: clusterId || null,
                    topicKey: topicKey || null,
                }],
                documents: [textToEmbed.substring(0, 1000)] // Store truncated text for context
            });

            this.consecutiveFailures = 0;
            return true;
        } catch (error) {
            await this.reportFailure(error);
            return false;
        }
    }

    /**
     * Store multiple articles with embeddings in a batch
     * Parallelizes embedding generation and batch inserts into ChromaDB
     */
    async storeArticlesBatch(articles: Array<{ article: NewsArticle; clusterId?: string }>): Promise<number> {
        if (articles.length === 0) return 0;

        const ready = await this.ensureReady();
        if (!ready || !this.newsCollection) return 0;

        try {
            // Prepare all embeddings in parallel
            const embeddingsWithIndex = await Promise.all(
                articles.map(async (item, index) => {
                    const meta = (item.article.metadata as any) || {};
                    const derived = deriveTrend({ title: item.article.title, category: item.article.categories?.[0], tags: item.article.tags });
                    const topic = meta.trendTopic || derived.topic;
                    const keywords = (meta.trendKeywords && Array.isArray(meta.trendKeywords) ? meta.trendKeywords : derived.keywords) as string[];
                    const topicKey = meta.trendTopicKey || derived.topicKey;
                    const textToEmbed = `${topicKey} ${topic} ${keywords.join(' ')}`.trim();

                    const embedding = await this.generateEmbedding(textToEmbed);

                    return {
                        index,
                        embedding,
                        id: item.article.id,
                        title: item.article.title,
                        source: item.article.source,
                        publishedAt: item.article.publishedAt,
                        category: item.article.categories?.[0] || 'GENERAL',
                        clusterId: item.clusterId || null,
                        topicKey: topicKey || null,
                        textToEmbed: textToEmbed.substring(0, 1000),
                    };
                })
            );

            // Filter out failed embeddings
            const validItems = embeddingsWithIndex.filter(item => item.embedding !== null);

            if (validItems.length === 0) {
                logger.warn('[NewsVectorStore] No valid embeddings generated for batch');
                return 0;
            }

            // Batch insert into ChromaDB
            await this.newsCollection.add({
                ids: validItems.map(item => item.id),
                embeddings: validItems.map(item => item.embedding!),
                metadatas: validItems.map(item => ({
                    title: item.title,
                    source: item.source,
                    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : new Date().toISOString(),
                    category: item.category,
                    clusterId: item.clusterId,
                    topicKey: item.topicKey,
                })),
                documents: validItems.map(item => item.textToEmbed),
            });

            this.consecutiveFailures = 0;
            logger.info(`[NewsVectorStore] Batch stored ${validItems.length}/${articles.length} articles`);
            return validItems.length;
        } catch (error) {
            await this.reportFailure(error);
            return 0;
        }
    }

    /**
     * Find similar articles by semantic search
     * @param text Text to search for (or use existing article content)
     * @param limit Max results
     * @param threshold Distance threshold (lower is closer)
     */
    async findSimilarArticles(
        text: string,
        limit: number = 5,
        threshold: number = 0.4,
        categoryFilter?: string
    ): Promise<SimilarArticle[]> {
        const ready = await this.ensureReady();
        if (!ready || !this.newsCollection) return [];

        try {
            const embedding = await this.generateEmbedding(text);
            if (!embedding) return [];

            const results = await this.newsCollection.query({
                queryEmbeddings: [embedding],
                nResults: limit,
                where: categoryFilter ? { category: { $eq: categoryFilter } } as any : undefined,
                // ChromaDB doesn't support threshold filtering natively in query
                // We'll filter results manually
            });

            if (!results.ids || !results.ids[0]) return [];

            const matches: SimilarArticle[] = [];
            const ids = results.ids[0];
            const distances = results.distances?.[0] || [];
            const metadatas = results.metadatas?.[0] || [];

            for (let i = 0; i < ids.length; i++) {
                const dist = distances[i];
                // Filter by threshold if distance is available and valid
                if (dist !== null && dist !== undefined && dist <= threshold) {
                    matches.push({
                        id: ids[i],
                        distance: dist,
                        score: 1 - Math.min(dist, 1),
                        title: (metadatas[i] as any)?.title || 'Unknown',
                        metadata: metadatas[i] || {}
                    });
                }
            }

            this.consecutiveFailures = 0;
            return matches;
        } catch (error) {
            await this.reportFailure(error);
            return [];
        }
    }

    /**
     * Get collection stats
     */
    async getStats(): Promise<{ count: number; status: 'ok' | 'degraded' | 'down' }> {
        const ready = await this.ensureReady();
        if (!ready) return { count: 0, status: 'down' };

        try {
            const count = await this.newsCollection?.count() || 0;
            return { count, status: 'ok' };
        } catch (error) {
            return { count: 0, status: 'degraded' };
        }
    }
}

// Singleton instance
const newsVectorStore = new NewsVectorStore();
export default newsVectorStore;
