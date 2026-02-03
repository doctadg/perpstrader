// Story Cluster Node
// Analyzes new articles and groups them into specific event clusters
// Uses OpenRouter (required) > GLM (optional fallback)
// Enhanced with Redis message bus and parallel clustering

import { NewsAgentState } from '../state';
import { NewsArticle, NewsCategory } from '../../shared/types';
import logger from '../../shared/logger';
import newsVectorStore from '../../data/news-vector-store';
import storyClusterStore, { StoryCluster } from '../../data/story-cluster-store';
import crypto from 'crypto';
import glmService from '../../shared/glm-service';
import openrouterService from '../../shared/openrouter-service';
import { getTitleFingerprint, isNonMarketMoving } from '../../shared/title-cleaner';
import { validateAndFormatTopic } from '../../shared/human-title-formatter';
import messageBus, { Channel } from '../../shared/message-bus';
import redisCache from '../../shared/redis-cache';

// Thresholds - increased for more precise clustering
const VECTOR_SIMILARITY_THRESHOLD = Number.isFinite(Number.parseFloat(process.env.NEWS_VECTOR_DISTANCE_THRESHOLD || ''))
    ? Number.parseFloat(process.env.NEWS_VECTOR_DISTANCE_THRESHOLD as string)
    : 0.70;
const KEYWORD_SIMILARITY_THRESHOLD = 0.60;
const FILTER_VECTOR_BY_CATEGORY = process.env.NEWS_VECTOR_FILTER_BY_CATEGORY === 'true';
const USE_GLM_FALLBACK = process.env.NEWS_USE_GLM === 'true';
const CLUSTER_MERGE_HOURS_THRESHOLD = 48; // Only consider clusters within 48 hours for matching

// Parallel processing batch size for clustering
const CLUSTER_BATCH_SIZE = Number.parseInt(process.env.CLUSTER_BATCH_SIZE || '20', 10);

// Heat decay: 3.5 hour half-life
const HEAT_DECAY_CONSTANT = 0.2;
const ACTIVITY_BOOST_HOURS = 2;

export async function storyClusterNode(state: NewsAgentState): Promise<Partial<NewsAgentState>> {
    let articles = state.categorizedNews;

    if (articles.length === 0) {
        return { currentStep: 'CLUSTERING_SKIPPED_NO_ARTICLES' };
    }

    // Filter out non-market-moving content (e.g., "Fact Check Team: Exploring...")
    const beforeFilter = articles.length;
    articles = articles.filter(article => !isNonMarketMoving(article.title));
    const filteredCount = beforeFilter - articles.length;

    if (filteredCount > 0) {
        logger.info(`[StoryClusterNode] Filtered out ${filteredCount} non-market-moving articles`);
    }

    if (articles.length === 0) {
        return { currentStep: 'CLUSTERING_SKIPPED_ALL_FILTERED' };
    }

    logger.info(`[StoryClusterNode] Processing ${articles.length} articles for event clustering...`);
    let newClusters = 0;
    let existingClusters = 0;
    let aiLabeled = 0;
    let skippedNoLabel = 0;

    const vectorStats = await newsVectorStore.getStats();
    const useVectorMode = vectorStats.status === 'ok';

    const glmAvailable = glmService.canUseService() && USE_GLM_FALLBACK;

    if (useVectorMode) {
        logger.info(`[StoryClusterNode] Mode: OpenRouter Only${glmAvailable ? ' + GLM Fallback' : ''} (Vector)`);
    } else {
        logger.warn(`[StoryClusterNode] Mode: OpenRouter Only${glmAvailable ? ' + GLM Fallback' : ''} (Keyword Match)`);
    }

    // Check if OpenRouter is available - if not, we can't proceed
    if (!openrouterService.canUseService()) {
        logger.error('[StoryClusterNode] OpenRouter is not configured. Cannot cluster without AI labels.');
        return {
            currentStep: 'CLUSTERING_FAILED_NO_OPENROUTER',
            errors: [...state.errors, 'OpenRouter service not available for topic generation']
        };
    }

    // === PHASE 1: Batch AI labeling for all articles ===
    const aiLabelsMap = new Map<string, {
        topic: string;
        subEventType?: string;
        trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
        urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
        keywords: string[];
    }>();

    // Batch OpenRouter labeling (required)
    logger.info('[StoryClusterNode] Batch labeling articles with OpenRouter...');
    const batchLabels = await openrouterService.batchEventLabels(
        articles.map(a => ({
            id: a.id,
            title: a.title,
            category: a.categories?.[0],
            tags: a.tags,
        }))
    );
    for (const [id, label] of batchLabels) {
        aiLabelsMap.set(id, label);
        aiLabeled++;
    }
    logger.info(`[StoryClusterNode] OpenRouter labeled ${batchLabels.size} articles`);

    // Optional GLM fallback for unlabeled articles
    if (glmAvailable && batchLabels.size < articles.length) {
        const unlabeled = articles.filter(a => !aiLabelsMap.has(a.id));
        if (unlabeled.length > 0) {
            logger.info(`[StoryClusterNode] GLM fallback: labeling ${unlabeled.length} articles...`);
            // Process GLM in parallel batches
            const GLM_BATCH_SIZE = 5;
            for (let i = 0; i < unlabeled.length; i += GLM_BATCH_SIZE) {
                const batch = unlabeled.slice(i, i + GLM_BATCH_SIZE);
                await Promise.all(
                    batch.map(async (article) => {
                        try {
                            const glmLabel = await glmService.generateEventLabel({
                                title: article.title,
                                category: article.categories?.[0],
                                tags: article.tags,
                            });
                            if (glmLabel?.topic && glmLabel.topic.length > 5) {
                                aiLabelsMap.set(article.id, {
                                    topic: glmLabel.topic,
                                    subEventType: glmLabel.subEventType,
                                    trendDirection: glmLabel.trendDirection || 'NEUTRAL',
                                    urgency: glmLabel.urgency || 'MEDIUM',
                                    keywords: glmLabel.keywords || []
                                });
                                aiLabeled++;
                            }
                        } catch (error: any) {
                            logger.debug(`[StoryClusterNode] GLM classification failed: ${error.message}`);
                        }
                    })
                );
            }
        }
    }

    // === PHASE 2: Filter articles with valid AI labels ===
    const processedArticles: Array<{
        article: NewsArticle;
        aiLabel: { topic: string; subEventType?: string; trendDirection: 'UP' | 'DOWN' | 'NEUTRAL'; urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; keywords: string[] };
    }> = [];

    for (const article of articles) {
        const aiLabel = aiLabelsMap.get(article.id);
        if (aiLabel && aiLabel.topic && aiLabel.topic.length > 5) {
            // Validate topic quality
            const validation = validateTopicQuality(aiLabel.topic, article.title);
            if (!validation.valid) {
                logger.debug(`[StoryClusterNode] Rejecting low-quality topic "${aiLabel.topic}" for article "${article.title}": ${validation.reason}`);
                skippedNoLabel++;
                continue;
            }
            processedArticles.push({ article, aiLabel });
        } else {
            skippedNoLabel++;
        }
    }

    if (skippedNoLabel > 0) {
        logger.warn(`[StoryClusterNode] Skipped ${skippedNoLabel} articles without valid AI labels`);
    }

    // === FALLBACK: Create basic clusters when AI labeling fails ===
    if (processedArticles.length === 0) {
        logger.warn(`[StoryClusterNode] All AI labels failed, using fallback clustering for ${articles.length} articles`);

        // Create fallback labels from article titles
        const fallbackKnownIds = new Set<string>();
        const fallbackMissingIds = new Set<string>();
        const fallbackResults = await createFallbackClusters(articles, useVectorMode, fallbackKnownIds, fallbackMissingIds);

        return {
            currentStep: 'CLUSTERING_COMPLETE_FALLBACK',
            thoughts: [
                ...state.thoughts,
                `Fallback clustering: ${fallbackResults.newClusters} basic events from ${fallbackResults.processed} articles`,
                `AI labeling failed completely - using title-based grouping`
            ]
        };
    }

    logger.info(`[StoryClusterNode] Clustering ${processedArticles.length} articles with valid AI labels (parallel batch size: ${CLUSTER_BATCH_SIZE})...`);

    // === PHASE 3: PARALLEL Clustering logic ===
    const knownClusterIds = new Set<string>();
    const missingClusterIds = new Set<string>();

    try {
        // Process in parallel batches for ultra-fast clustering
        for (let i = 0; i < processedArticles.length; i += CLUSTER_BATCH_SIZE) {
            const batch = processedArticles.slice(i, i + CLUSTER_BATCH_SIZE);

            // Process all articles in this batch in parallel
            const batchResults = await Promise.all(
                batch.map(({ article, aiLabel }) => processSingleArticle(
                    article,
                    aiLabel,
                    useVectorMode,
                    knownClusterIds,
                    missingClusterIds
                ))
            );

            // Aggregate results
            for (const result of batchResults) {
                if (result.created) {
                    newClusters++;
                    knownClusterIds.add(result.clusterId);
                } else if (result.assigned) {
                    existingClusters++;
                }
            }

            logger.info(`[StoryClusterNode] Processed ${Math.min(i + CLUSTER_BATCH_SIZE, processedArticles.length)}/${processedArticles.length} articles (${newClusters} new, ${existingClusters} existing)`);
        }

        // Publish clustering completion event to message bus
        await messageBus.publish(Channel.NEWS_CLUSTERED, {
            timestamp: new Date(),
            totalProcessed: processedArticles.length,
            newClusters,
            existingClusters,
            filtered: filteredCount,
            cacheStats: openrouterService.getCacheStats(),
        });

        logger.info(`[StoryClusterNode] Published NEWS_CLUSTERED event to message bus`);

        // === PHASE 4: Merge similar clusters ===
        // This helps consolidate clusters that were created separately but represent the same event
        if (newClusters > 0) {
            const mergeResult = await mergeSimilarClusters(useVectorMode);
            if (mergeResult.mergedCount > 0) {
                logger.info(`[StoryClusterNode] Merged ${mergeResult.mergedCount} cluster pairs into ${mergeResult.targetCount} consolidated clusters`);
            }
        }

    } catch (error) {
        logger.error('[StoryClusterNode] Clustering process failed:', error);
        return {
            currentStep: 'CLUSTERING_FAILED_PARTIAL',
            errors: [...state.errors, `Clustering error: ${(error as Error).message}`]
        };
    }

    return {
        currentStep: 'CLUSTERING_COMPLETE',
        thoughts: [
            ...state.thoughts,
            `Clustered ${processedArticles.length} articles: ${newClusters} new events, ${existingClusters} joined`,
            `Filtered ${filteredCount} non-market articles`,
            `Skipped ${skippedNoLabel} articles without valid AI labels`,
            `AI labels: ${aiLabeled}`
        ]
    };
}

/**
 * Process a single article for clustering
 * This is now called in parallel batches instead of sequentially
 */
async function processSingleArticle(
    article: NewsArticle,
    aiLabel: { topic: string; subEventType?: string; trendDirection: 'UP' | 'DOWN' | 'NEUTRAL'; urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; keywords: string[] },
    useVectorMode: boolean,
    knownClusterIds: Set<string>,
    missingClusterIds: Set<string>
): Promise<{ clusterId: string; created: boolean; assigned: boolean }> {

    const titleFingerprint = getTitleFingerprint(article.title);
    let assignedClusterId: string | null = null;

    // Use AI-generated values only
    const topic = aiLabel.topic;
    const keywords = aiLabel.keywords || [];
    const subEventType = aiLabel.subEventType;
    const trendDirection = aiLabel.trendDirection;
    const urgency = aiLabel.urgency;

    // Generate a simple topicKey from the topic (for cluster matching)
    const trendTopicKey = topic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 180);

    const vectorQueryText = `${topic}. Keywords: ${keywords.join(', ')}`.trim();

    // --- 1. Find best matching cluster by topicKey ---
    if (trendTopicKey) {
        const existingByTopic = await storyClusterStore.getClusterIdByTopicKey(trendTopicKey);
        if (existingByTopic) {
            const cluster = await storyClusterStore.getClusterById(existingByTopic);
            if (cluster && cluster.category === article.categories[0]) {
                assignedClusterId = existingByTopic;
            }
        }
    }

    if (!assignedClusterId && useVectorMode) {
        const similar = await newsVectorStore.findSimilarArticles(
            vectorQueryText || `${article.title}. ${article.summary || article.snippet}`,
            8,
            VECTOR_SIMILARITY_THRESHOLD,
            FILTER_VECTOR_BY_CATEGORY ? article.categories?.[0] : undefined
        );

        if (similar.length > 0) {
            const clusterVotes = new Map<string, number>();
            for (const s of similar) {
                const cid = (s.metadata as any)?.clusterId as string | undefined | null;
                if (!cid) continue;
                clusterVotes.set(cid, (clusterVotes.get(cid) || 0) + 1);
            }

            if (clusterVotes.size > 0) {
                const best = Array.from(clusterVotes.entries()).sort((a, b) => b[1] - a[1])[0];
                const cluster = await storyClusterStore.getClusterById(best[0]);
                if (cluster && cluster.category === article.categories[0]) {
                    assignedClusterId = best[0];
                }
            }
        }
    }

    // Validate cluster existence
    if (assignedClusterId) {
        if (missingClusterIds.has(assignedClusterId)) {
            assignedClusterId = null;
        } else if (!knownClusterIds.has(assignedClusterId)) {
            const exists = await storyClusterStore.clusterExists(assignedClusterId);
            if (exists) {
                knownClusterIds.add(assignedClusterId);
            } else {
                missingClusterIds.add(assignedClusterId);
                assignedClusterId = null;
            }
        }
    }

    // Fallback: Keyword similarity with stricter threshold
    // Only consider clusters within CLUSTER_MERGE_HOURS_THRESHOLD (48h default)
    if (!assignedClusterId) {
        const compareLimit = Number.parseInt(process.env.NEWS_CLUSTER_COMPARE_LIMIT || '500', 10) || 500;
        const activeClusters = await storyClusterStore.getHotClusters(compareLimit, CLUSTER_MERGE_HOURS_THRESHOLD, article.categories[0]);

        let bestMatchScore = 0;
        let bestMatchCluster: StoryCluster | undefined;

        for (const cluster of activeClusters) {
            const score = calculateKeywordSimilarity(article, cluster);
            if (score > bestMatchScore) {
                bestMatchScore = score;
                bestMatchCluster = cluster;
            }
        }

        if (bestMatchScore > KEYWORD_SIMILARITY_THRESHOLD && bestMatchCluster) {
            assignedClusterId = bestMatchCluster.id;
        }
    }

    // --- 2. Action: Join existing or create new ---
    let created = false;
    let finalClusterId: string;

    if (assignedClusterId) {
        const articleDate = article.publishedAt || new Date();
        const clusterDate = new Date();
        const increment = calculateHeatIncrement(article, articleDate, clusterDate);
        const result = await storyClusterStore.addArticleToCluster(assignedClusterId, article.id, titleFingerprint, increment, trendDirection);
        if (useVectorMode) await newsVectorStore.storeArticle(article, assignedClusterId);

        // Log if duplicate was penalized
        if (result.duplicateIndex > 0) {
            logger.debug(`[StoryClusterNode] Duplicate title penalized: cluster=${assignedClusterId.slice(0, 8)}..., duplicateIndex=${result.duplicateIndex}, penalty=${result.penaltyMultiplier}`);
        }
        finalClusterId = assignedClusterId;
    } else {
        // Create New Event Cluster
        const newClusterId = crypto.randomUUID();
        const articleDate = article.publishedAt || new Date();
        const initialHeat = calculateInitialHeat(article, articleDate, new Date());

        // Format topic to be human-readable before storage
        const formattedTopic = validateAndFormatTopic(topic, article.title);

        await storyClusterStore.upsertCluster({
            id: newClusterId,
            topic: formattedTopic,
            topicKey: trendTopicKey,
            summary: article.summary || '',
            category: article.categories[0] || 'GENERAL',
            keywords: keywords,
            heatScore: initialHeat,
            articleCount: 1,
            uniqueTitleCount: 1,
            trendDirection: trendDirection,
            urgency: urgency,
            subEventType: subEventType,
            firstSeen: new Date(),
        });

        await storyClusterStore.addArticleToCluster(newClusterId, article.id, titleFingerprint, 0, trendDirection);
        if (useVectorMode) await newsVectorStore.storeArticle(article, newClusterId);

        created = true;
        finalClusterId = newClusterId;
        knownClusterIds.add(newClusterId);
    }

    return { clusterId: finalClusterId, created, assigned: !created };
}

/**
 * Validate topic quality to ensure precise clustering
 * Rejects generic, low-quality, or non-specific topics
 */
function validateTopicQuality(topic: string, articleTitle: string): { valid: boolean; reason?: string } {
    if (!topic || topic.length < 5) {
        return { valid: false, reason: 'Topic too short' };
    }

    const topicLower = topic.toLowerCase();

    // Generic patterns that indicate poor quality
    const genericPatterns = [
        'price action',
        'market update',
        'latest news',
        'breaking news',
        'crypto news',
        'trading volume',
        'technical analysis',
        'market watch',
        'daily update',
        'weekly recap',
        'price chart',
        'live coverage',
        'watch live',
        'live stream',
        'price today',
        'what to know',
        'things to know',
    ];

    for (const pattern of genericPatterns) {
        if (topicLower.includes(pattern)) {
            return { valid: false, reason: `Generic pattern: ${pattern}` };
        }
    }

    // Check for proper entity + action structure
    // A good topic should have at least 2 words with proper capitalization (entity + action)
    const words = topic.split(/\s+/);
    const properNouns = words.filter(w => /^[A-Z][a-z]/.test(w) || /^[A-Z]{2,}/.test(w));

    if (words.length < 3) {
        return { valid: false, reason: 'Topic too short (< 3 words)' };
    }

    if (properNouns.length < 1) {
        return { valid: false, reason: 'No proper nouns (entity names) found' };
    }

    // Reject if topic is just a list of tags
    if (topic.includes('_') || topic.includes('/') || topic.includes('\\')) {
        return { valid: false, reason: 'Topic contains invalid characters (_ or /)' };
    }

    // Reject if topic doesn't share meaningful words with article title
    const titleWords = new Set(articleTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const overlap = topicWords.filter(w => titleWords.has(w));

    if (overlap.length === 0 && topicWords.length > 0) {
        // Topic might be hallucinated - but allow if it's a well-formed entity+action
        // This is a soft check - only log, don't reject
        logger.debug(`[StoryClusterNode] Topic "${topic}" shares no words with title "${articleTitle}" - may be hallucinated`);
    }

    return { valid: true };
}

function calculateKeywordSimilarity(article: NewsArticle, cluster: StoryCluster): number {
    const articleTags = new Set(article.tags.map(t => t.toLowerCase()));
    const clusterTags = new Set(cluster.keywords.map(t => t.toLowerCase()));

    article.title.toLowerCase().split(/\s+/).forEach(w => {
        if (w.length > 3) articleTags.add(w);
    });

    cluster.topic.toLowerCase().split(/\s+/).forEach(w => {
        if (w.length > 3) clusterTags.add(w);
    });

    if (articleTags.size === 0 || clusterTags.size === 0) return 0;

    let intersection = 0;
    for (const tag of articleTags) {
        if (clusterTags.has(tag)) intersection++;
    }

    const union = articleTags.size + clusterTags.size - intersection;
    return intersection / union;
}

function calculateInitialHeat(article: NewsArticle, articleDate: Date, clusterDate: Date): number {
    let score = 10;

    switch (article.importance) {
        case 'CRITICAL': score *= 3; break;
        case 'HIGH': score *= 2; break;
        case 'MEDIUM': score *= 1.5; break;
        case 'LOW': score *= 1; break;
    }

    if (article.sentiment !== 'NEUTRAL') score *= 1.1;

    const hoursSinceArticle = (Date.now() - articleDate.getTime()) / 3600000;
    const decayFactor = Math.exp(-HEAT_DECAY_CONSTANT * hoursSinceArticle);

    const hoursSinceUpdate = (Date.now() - clusterDate.getTime()) / 3600000;
    const activityBoost = hoursSinceUpdate < ACTIVITY_BOOST_HOURS ? 1.3 : 1.0;

    return score * decayFactor * activityBoost;
}

function calculateHeatIncrement(article: NewsArticle, articleDate: Date, clusterDate: Date): number {
    const baseIncrement = calculateInitialHeat(article, articleDate, clusterDate);
    return Math.max(1, baseIncrement * 0.6);
}

/**
 * Merge similar clusters that were created separately but represent the same event
 * Uses semantic similarity and keyword overlap to identify merge candidates
 */
async function mergeSimilarClusters(useVectorMode: boolean): Promise<{ mergedCount: number; targetCount: number }> {
    const CLUSTER_MERGE_SIMILARITY_THRESHOLD = 0.85; // High threshold for merging
    const MERGE_CANDIDATE_LIMIT = 50; // Only check top N clusters by heat

    const mergedCount = { value: 0 };
    const targetCount = { value: 0 };

    try {
        // Get recent hot clusters as potential merge candidates
        const hotClusters = await storyClusterStore.getHotClusters(MERGE_CANDIDATE_LIMIT, CLUSTER_MERGE_HOURS_THRESHOLD);
        if (hotClusters.length < 2) {
            return { mergedCount: 0, targetCount: 0 };
        }

        logger.debug(`[StoryClusterNode] Checking ${hotClusters.length} clusters for merging...`);

        // Group clusters by category to reduce comparisons
        const byCategory = new Map<string, StoryCluster[]>();
        for (const cluster of hotClusters) {
            if (!byCategory.has(cluster.category)) {
                byCategory.set(cluster.category, []);
            }
            byCategory.get(cluster.category)!.push(cluster);
        }

        // Check each category for similar clusters
        for (const [category, clusters] of byCategory.entries()) {
            if (clusters.length < 2) continue;

            // Compare all pairs within the category
            for (let i = 0; i < clusters.length; i++) {
                for (let j = i + 1; j < clusters.length; j++) {
                    const c1 = clusters[i];
                    const c2 = clusters[j];

                    // Skip if either cluster was already merged in this pass
                    if (!(await storyClusterStore.clusterExists(c1.id)) || !(await storyClusterStore.clusterExists(c2.id))) {
                        continue;
                    }

                    const similarity = calculateClusterSimilarity(c1, c2);

                    if (similarity >= CLUSTER_MERGE_SIMILARITY_THRESHOLD) {
                        // Merge c2 into c1 (keep the higher heat score cluster as target)
                        const target = c1.heatScore >= c2.heatScore ? c1 : c2;
                        const source = c1.heatScore >= c2.heatScore ? c2 : c1;

                        logger.info(`[StoryClusterNode] Merging similar clusters: "${source.topic}" -> "${target.topic}" (similarity: ${similarity.toFixed(2)})`);

                        const result = await storyClusterStore.mergeClusters(target.id, source.id);
                        if (result.moved > 0) {
                            mergedCount.value++;
                            targetCount.value++;

                            // Update vector store to point to new cluster
                            if (useVectorMode) {
                                // Vector store updates would be handled by article re-linking
                                // The merge operation should handle article reassignment
                            }
                        }
                    }
                }
            }
        }

    } catch (error) {
        logger.error('[StoryClusterNode] Cluster merging failed:', error);
    }

    return { mergedCount: mergedCount.value, targetCount: targetCount.value };
}

/**
 * Create fallback clusters when AI labeling completely fails
 * Extracts basic topics from article titles and groups by category
 */
async function createFallbackClusters(
    articles: NewsArticle[],
    useVectorMode: boolean,
    knownClusterIds: Set<string>,
    missingClusterIds: Set<string>
): Promise<{ processed: number; newClusters: number }> {
    let newClusters = 0;
    let processed = 0;
    const categoryGroups = new Map<string, NewsArticle[]>();

    // Group by category
    for (const article of articles) {
        const category = article.categories?.[0] || 'GENERAL';
        if (!categoryGroups.has(category)) {
            categoryGroups.set(category, []);
        }
        categoryGroups.get(category)!.push(article);
    }

    // Create simple topic-based clusters within each category
    for (const [category, categoryArticles] of categoryGroups.entries()) {
        // Group by title similarity (simple keyword matching)
        const processedInCategory = await createFallbackClustersForCategory(
            categoryArticles,
            category,
            useVectorMode,
            knownClusterIds,
            missingClusterIds
        );
        newClusters += processedInCategory.newClusters;
        processed += processedInCategory.processed;
    }

    logger.info(`[StoryClusterNode] Fallback clustering created ${newClusters} clusters from ${processed} articles`);
    return { processed, newClusters };
}

/**
 * Create fallback clusters for articles within a single category
 * Groups articles by title keyword similarity
 */
async function createFallbackClustersForCategory(
    articles: NewsArticle[],
    category: string,
    useVectorMode: boolean,
    knownClusterIds: Set<string>,
    missingClusterIds: Set<string>
): Promise<{ processed: number; newClusters: number }> {
    const clustered = new Set<string>();
    let newClusters = 0;

    // Extract key terms from titles for grouping
    const titleKeyTerms = new Map<string, { terms: string[]; article: NewsArticle }>();
    for (const article of articles) {
        const terms = extractKeyTerms(article.title);
        titleKeyTerms.set(article.id, { terms, article });
    }

    // Group by similar key terms
    for (const [id, { terms, article }] of titleKeyTerms.entries()) {
        if (clustered.has(id)) continue;

        clustered.add(id);

        // Find articles with similar key terms
        const similarArticles = [article];
        for (const [otherId, { terms: otherTerms }] of titleKeyTerms.entries()) {
            if (id === otherId || clustered.has(otherId)) continue;

            // Check if terms overlap significantly
            const overlap = calculateTermOverlap(terms, otherTerms);
            if (overlap >= 0.4) { // 40% overlap threshold
                similarArticles.push(titleKeyTerms.get(otherId)!.article);
                clustered.add(otherId);
            }
        }

        // Create a cluster from the group
        if (similarArticles.length > 0) {
            const topic = generateFallbackTopic(similarArticles[0].title, category);
            const keywords = terms.slice(0, 5);

            const newClusterId = crypto.randomUUID();
            const initialHeat = 10; // Base heat for fallback clusters

            await storyClusterStore.upsertCluster({
                id: newClusterId,
                topic,
                topicKey: terms.join('_').toLowerCase(),
                summary: `Auto-generated cluster from ${similarArticles.length} articles`,
                category: category as any,
                keywords,
                heatScore: initialHeat,
                articleCount: 0,
                uniqueTitleCount: 0,
                trendDirection: 'NEUTRAL',
                urgency: 'MEDIUM',
                subEventType: 'other',
                firstSeen: new Date(),
            });

            // Add articles to the cluster
            for (const art of similarArticles) {
                const titleFingerprint = getTitleFingerprint(art.title);
                await storyClusterStore.addArticleToCluster(newClusterId, art.id, titleFingerprint, 0, 'NEUTRAL');
                if (useVectorMode) {
                    await newsVectorStore.storeArticle(art, newClusterId);
                }
            }

            newClusters++;
            knownClusterIds.add(newClusterId);
        }
    }

    return { processed: clustered.size, newClusters };
}

/**
 * Extract key terms from a title for fallback clustering
 */
function extractKeyTerms(title: string): string[] {
    const words = title
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !isStopWord(w));

    // Unique terms
    return [...new Set(words)];
}

/**
 * Check if a word is a common stop word
 */
function isStopWord(word: string): boolean {
    const stopWords = new Set([
        'THIS', 'THAT', 'WITH', 'FROM', 'HAVE', 'THEY', 'WHAT', 'WHEN',
        'WHICH', 'THEIR', 'ABOUT', 'AFTER', 'BEFORE', 'BEING', 'BETWEEN',
        'UNDER', 'OVER', 'SUCH', 'THESE', 'THOSE', 'WOULD', 'COULD',
        'SHOULD', 'EVERY', 'EITHER', 'NEITHER', 'EACH', 'SOME', 'MORE',
        'MOST', 'OTHER', 'ONLY', 'OWN', 'SAME', 'THAN', 'TOO', 'VERY',
        'JUST', 'INTO', 'YOUR', 'THESE', 'THAT', 'THOSE', 'EVEN'
    ]);
    return stopWords.has(word);
}

/**
 * Calculate overlap between two term arrays
 */
function calculateTermOverlap(terms1: string[], terms2: string[]): number {
    if (terms1.length === 0 || terms2.length === 0) return 0;

    const set1 = new Set(terms1);
    const set2 = new Set(terms2);

    let intersection = 0;
    for (const term of set1) {
        if (set2.has(term)) intersection++;
    }

    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection / union.size : 0;
}

/**
 * Generate a fallback topic from a title
 * Cleans up and formats the title as a topic
 */
function generateFallbackTopic(title: string, category: string): string {
    // Remove common prefixes and suffixes
    let clean = title
        .replace(/^(Breaking|UPDATE|JUST IN|ALERT|NEWS):?\s*/i, '')
        .replace(/\s*-\s*(Source|Reuters|Bloomberg|AP|AFP).*$/i, '')
        .replace(/\s*\|.*$/, '')
        .trim();

    // Capitalize properly
    clean = clean.replace(/\b\w+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

    // Capitalize important words
    const importantWords = ['BTC', 'ETH', 'USD', 'Fed', 'SEC', 'ETF', 'CEO', 'CFO', 'AI', 'GDP', 'CPI'];
    for (const word of importantWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        clean = clean.replace(regex, word.toUpperCase());
    }

    // Limit length
    if (clean.length > 80) {
        clean = clean.substring(0, 77) + '...';
    }

    return clean || `${category} Market Event`;
}

/**
 * Calculate similarity between two clusters for merging decisions
 * Combines topic similarity, keyword overlap, and sub-event type matching
 */
function calculateClusterSimilarity(c1: StoryCluster, c2: StoryCluster): number {
    let score = 0;
    let factors = 0;

    // 1. Topic key exact match (highest weight)
    if (c1.topicKey && c2.topicKey && c1.topicKey === c2.topicKey) {
        score += 0.5;
        factors += 0.5;
    }

    // 2. Topic word overlap
    const t1Words = new Set(c1.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const t2Words = new Set(c2.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (t1Words.size > 0 && t2Words.size > 0) {
        const intersection = [...t1Words].filter(w => t2Words.has(w));
        const union = new Set([...t1Words, ...t2Words]);
        const topicSim = intersection.length / union.size;
        score += topicSim * 0.25;
        factors += 0.25;
    }

    // 3. Keyword overlap
    const k1Words = new Set(c1.keywords.map(k => k.toLowerCase()));
    const k2Words = new Set(c2.keywords.map(k => k.toLowerCase()));
    if (k1Words.size > 0 && k2Words.size > 0) {
        const kIntersection = [...k1Words].filter(k => k2Words.has(k));
        const kUnion = new Set([...k1Words, ...k2Words]);
        const keywordSim = kIntersection.length / kUnion.size;
        score += keywordSim * 0.15;
        factors += 0.15;
    }

    // 4. Sub-event type match (boost if same)
    if (c1.subEventType && c2.subEventType && c1.subEventType === c2.subEventType) {
        score += 0.1;
        factors += 0.1;
    }

    // Normalize to 0-1 range
    return factors > 0 ? Math.min(score / factors, 1.0) : 0;
}
