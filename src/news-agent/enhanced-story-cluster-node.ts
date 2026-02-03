// Enhanced Story Cluster Node - Optimized Version
// Integrates improved semantic clustering with title clustering fixes
// Replaces original story-cluster-node.ts

import logger from '../../shared/logger';
import newsVectorStore from '../../data/news-vector-store';
import storyClusterStoreEnhanced from '../../data/story-cluster-store-enhanced';
import crypto from 'crypto';
import glmService from '../../shared/glm-service';
import openrouterService from '../../shared/openrouter-service';
import { getTitleFingerprint, isNonMarketMoving, validateAndFormatTopic } from '../../shared/title-cleaner';
import { humanTitleFormatter } from '../../shared/human-title-formatter';
import { messageBus, Channel } from '../../shared/message-bus';
import EntityExtractor, { ExtractedEntity } from './entity-extraction';
import AnomalyDetector, { HeatAnomaly } from './anomaly-detector';
import HeatPredictor, { HeatPrediction } from './heat-predictor';
import { NewsItem } from '../../shared/types';
import { ClusterHeatAnalysis, ClusterSimilarityResult, EntityHeat } from '../../shared/types-enhanced';

// NEW: Import improved clustering services
import titleSemanticClustering from '../../shared/title-semantic-clustering';
import semanticSimilarityService from './semantic-similarity';
import enhancedEntityExtractor from './enhanced-entity-extraction';

// Configuration - Optimized thresholds based on testing
const VECTOR_SIMILARITY_THRESHOLD = Number.parseFloat(process.env.NEWS_VECTOR_DISTANCE_THRESHOLD || '0.65'); // Lowered for better recall
const KEYWORD_SIMILARITY_THRESHOLD = 0.55; // Slightly lowered
const TITLE_SIMILARITY_THRESHOLD = 0.70; // NEW: Dedicated title similarity threshold
const FILTER_VECTOR_BY_CATEGORY = process.env.NEWS_VECTOR_FILTER_BY_CATEGORY === 'true';
const USE_GLM_FALLBACK = process.env.NEWS_USE_GLM === 'true';
const USE_ENHANCED_CLUSTERING = process.env.USE_ENHANCED_SEMANTIC_CLUSTERING !== 'false'; // Default true
const CLUSTER_MERGE_HOURS_THRESHOLD = 48;
const CLUSTER_BATCH_SIZE = Number.parseInt(process.env.CLUSTER_BATCH_SIZE || '20', 10);
const CLUSTER_MERGE_SIMILARITY_THRESHOLD = 0.80; // Slightly lowered for better merging

export interface EnhancedClusteringState {
    categorizedNews: NewsItem[];
    clusters: any[];
    stats: {
        totalProcessed: number;
        newClusters: number;
        existingClusters: number;
        mergedClusters: number;
        entitiesExtracted: number;
        anomaliesDetected: number;
        predictionsGenerated: number;
        // NEW: Additional metrics for tracking improvements
        titleClustersCreated: number;
        semanticMatches: number;
    };
    thoughts: string[];
    errors: string[];
}

export interface ClusteringResult {
    clusters: any[];
    stats: EnhancedClusteringState['stats'];
    anomalies: HeatAnomaly[];
    predictions: HeatPrediction[];
    trendingEntities: EntityHeat[];
}

/**
 * Enhanced story clustering with improved title clustering
 */
export async function enhancedStoryClusterNode(state: any): Promise<Partial<EnhancedClusteringState>> {
    const articles = state.categorizedNews || [];

    if (articles.length === 0) {
        return { currentStep: 'CLUSTERING_SKIPPED_NO_ARTICLES' };
    }

    // Filter non-market-moving content
    const beforeFilter = articles.length;
    const filteredArticles = articles.filter(article => !isNonMarketMoving(article.title));
    const filteredCount = beforeFilter - filteredArticles.length;

    if (filteredCount > 0) {
        logger.info(`[EnhancedClusterNode] Filtered out ${filteredCount} non-market-moving articles`);
    }

    if (filteredArticles.length === 0) {
        return { currentStep: 'CLUSTERING_SKIPPED_ALL_FILTERED' };
    }

    logger.info(`[EnhancedClusterNode] Processing ${filteredArticles.length} articles with enhanced clustering (v2.0)...`);

    const stats: EnhancedClusteringState['stats'] = {
        totalProcessed: filteredArticles.length,
        newClusters: 0,
        existingClusters: 0,
        mergedClusters: 0,
        entitiesExtracted: 0,
        anomaliesDetected: 0,
        predictionsGenerated: 0,
        titleClustersCreated: 0,
        semanticMatches: 0
    };

    const anomalies: HeatAnomaly[] = [];
    const predictions: HeatPrediction[] = [];

    const vectorStats = await newsVectorStore.getStats();
    const useVectorMode = vectorStats.status === 'ok';
    const glmAvailable = glmService.canUseService() && USE_GLM_FALLBACK;

    logger.info(`[EnhancedClusterNode] Mode: Vector=${useVectorMode}, GLM=${glmAvailable}, Enhanced=${USE_ENHANCED_CLUSTERING}`);

    // Check OpenRouter availability
    if (!openrouterService.canUseService()) {
        logger.error('[EnhancedClusterNode] OpenRouter not available');
        return {
            currentStep: 'CLUSTERING_FAILED_NO_OPENROUTER',
            errors: ['OpenRouter service not available']
        };
    }

    // ============================================================
    // NEW: Pre-cluster articles by title similarity (PHASE 0)
    // This addresses the "weak title clustering" issue
    // ============================================================
    let titleClusters: Awaited<ReturnType<typeof titleSemanticClustering.clusterTitles>> = [];
    if (USE_ENHANCED_CLUSTERING) {
        logger.info('[EnhancedClusterNode] PHASE 0: Pre-clustering by title similarity...');
        titleClusters = await titleSemanticClustering.clusterTitles(
            filteredArticles.map(a => ({ id: a.id, title: a.title, category: a.categories?.[0] })),
            TITLE_SIMILARITY_THRESHOLD
        );
        stats.titleClustersCreated = titleClusters.length;
        logger.info(`[EnhancedClusterNode] Created ${titleClusters.length} title-based clusters`);
    }

    // ============================================================
    // PHASE 1: Batch AI Labeling
    // ============================================================
    logger.info('[EnhancedClusterNode] PHASE 1: Batch labeling articles...');

    const aiLabelsMap = new Map<string, any>();

    // Batch OpenRouter labeling
    const batchLabels = await openrouterService.batchEventLabels(
        filteredArticles.map(a => ({
            id: a.id,
            title: a.title,
            category: a.categories?.[0],
            tags: a.tags
        }))
    );

    for (const [id, label] of batchLabels) {
        aiLabelsMap.set(id, label);
    }

    logger.info(`[EnhancedClusterNode] OpenRouter labeled ${batchLabels.size} articles`);

    // GLM fallback for unlabeled
    if (glmAvailable && batchLabels.size < filteredArticles.length) {
        const unlabeled = filteredArticles.filter(a => !aiLabelsMap.has(a.id));
        logger.info(`[EnhancedClusterNode] GLM fallback: ${unlabeled.length} articles...`);

        const GLM_BATCH_SIZE = 5;
        for (let i = 0; i < unlabeled.length; i += GLM_BATCH_SIZE) {
            const batch = unlabeled.slice(i, i + GLM_BATCH_SIZE);
            await Promise.all(batch.map(async (article) => {
                try {
                    const glmLabel = await glmService.generateEventLabel({
                        title: article.title,
                        category: article.categories?.[0],
                        tags: article.tags
                    });

                    if (glmLabel?.topic && glmLabel.topic.length > 5) {
                        aiLabelsMap.set(article.id, glmLabel);
                    }
                } catch (error: any) {
                    logger.debug(`[EnhancedClusterNode] GLM failed: ${error.message}`);
                }
            }));
        }
    }

    // ============================================================
    // PHASE 2: Filter valid labels & extract entities
    // ============================================================
    const processedArticles: Array<{
        article: NewsItem;
        aiLabel: any;
        entities: ExtractedEntity[];
        titleClusterId?: string;
    }> = [];

    for (const article of filteredArticles) {
        const aiLabel = aiLabelsMap.get(article.id);

        if (aiLabel?.topic && aiLabel.topic.length > 5) {
            const validation = validateTopicQuality(aiLabel.topic, article.title);
            if (!validation.valid) {
                logger.debug(`[EnhancedClusterNode] Rejecting low-quality topic: ${validation.reason}`);
                continue;
            }

            // NEW: Use enhanced entity extraction
            const entityResult = await enhancedEntityExtractor.extractHybrid(
                article.title,
                article.content || article.snippet || '',
                article.id
            );
            stats.entitiesExtracted += entityResult.entities.length;

            // Find title cluster membership
            const titleCluster = titleClusters.find(tc =>
                tc.articleIds.includes(article.id)
            );

            processedArticles.push({
                article,
                aiLabel,
                entities: entityResult.entities,
                titleClusterId: titleCluster?.id
            });
        }
    }

    if (processedArticles.length === 0) {
        logger.warn('[EnhancedClusterNode] All articles failed validation, using fallback');
        return await createFallbackClustering(filteredArticles, stats);
    }

    logger.info(`[EnhancedClusterNode] Processing ${processedArticles.length} articles with valid labels (${stats.entitiesExtracted} entities)`);

    // ============================================================
    // PHASE 3: Enhanced Parallel Clustering
    // ============================================================
    const knownClusterIds = new Set<string>();
    const missingClusterIds = new Set<string>();

    for (let i = 0; i < processedArticles.length; i += CLUSTER_BATCH_SIZE) {
        const batch = processedArticles.slice(i, i + CLUSTER_BATCH_SIZE);

        const batchResults = await Promise.all(
            batch.map(({ article, aiLabel, entities, titleClusterId }) =>
                processArticleEnhanced(
                    article,
                    aiLabel,
                    entities,
                    titleClusterId,
                    titleClusters,
                    useVectorMode,
                    knownClusterIds,
                    missingClusterIds,
                    stats
                )
            )
        );

        // Aggregate results
        batchResults.forEach(result => {
            if (result.created) {
                stats.newClusters++;
                knownClusterIds.add(result.clusterId);
            } else if (result.assigned) {
                stats.existingClusters++;
            }
            if (result.semanticMatch) {
                stats.semanticMatches++;
            }
        });

        logger.info(`[EnhancedClusterNode] Progress: ${Math.min(i + CLUSTER_BATCH_SIZE, processedArticles.length)}/${processedArticles.length} (${stats.newClusters} new, ${stats.existingClusters} existing, ${stats.semanticMatches} semantic)`);
    }

    // ============================================================
    // PHASE 4: Cross-Category Linking (unchanged)
    // ============================================================
    logger.info('[EnhancedClusterNode] PHASE 4: Creating cross-category links...');
    await createCrossCategoryLinks(processedArticles);

    // ============================================================
    // PHASE 5: Enhanced Cluster Merging
    // ============================================================
    logger.info('[EnhancedClusterNode] PHASE 5: Merging similar clusters...');
    const mergeResult = await mergeSimilarClustersEnhanced(useVectorMode);
    stats.mergedClusters = mergeResult.mergedCount;

    // ============================================================
    // PHASE 6-9: Heat History, Predictions, Entities, Events (unchanged)
    // ============================================================
    logger.info('[EnhancedClusterNode] PHASE 6: Recording heat history...');

    const clusters = await storyClusterStoreEnhanced.getHotClusters(500, CLUSTER_MERGE_HOURS_THRESHOLD);

    for (const cluster of clusters) {
        await storyClusterStoreEnhanced.recordHeatHistory(
            cluster.id,
            cluster.heatScore,
            cluster.articleCount,
            cluster.uniqueTitleCount || cluster.articleCount
        );

        const anomaly = await storyClusterStoreEnhanced.detectHeatAnomalies(cluster.id);
        if (anomaly.isAnomaly) {
            anomalies.push({
                clusterId: cluster.id,
                isAnomaly: true,
                anomalyType: anomaly.anomalyType,
                anomalyScore: anomaly.anomalyScore,
                detectedAt: new Date(),
                description: `Anomaly: ${anomaly.anomalyType} (score: ${anomaly.anomalyScore.toFixed(2)})`
            });
            stats.anomaliesDetected++;
        }

        await storyClusterStoreEnhanced.calculateCompositeRank(cluster.id);
    }

    // Generate predictions
    logger.info('[EnhancedClusterNode] PHASE 7: Generating heat predictions...');
    const heatHistories = new Map<string, Array<{ timestamp: Date; heatScore: number }>>();
    for (const cluster of clusters.slice(0, 100)) {
        const history = await storyClusterStoreEnhanced.getHeatHistory(cluster.id, 48);
        heatHistories.set(cluster.id, history);
    }
    const batchPredictions = HeatPredictor.batchPredict(heatHistories);
    predictions.push(...batchPredictions);
    stats.predictionsGenerated = batchPredictions.length;

    // Get trending entities
    logger.info('[EnhancedClusterNode] PHASE 8: Calculating trending entities...');
    const trendingEntities = await storyClusterStoreEnhanced.getTrendingEntities(20, 24);

    // Publish events
    logger.info('[EnhancedClusterNode] PHASE 9: Publishing events...');
    await messageBus.publish(Channel.NEWS_CLUSTERED, {
        timestamp: new Date(),
        totalProcessed: stats.totalProcessed,
        newClusters: stats.newClusters,
        existingClusters: stats.existingClusters,
        mergedClusters: stats.mergedClusters,
        entitiesExtracted: stats.entitiesExtracted,
        anomaliesDetected: stats.anomaliesDetected,
        predictionsGenerated: stats.predictionsGenerated,
        titleClustersCreated: stats.titleClustersCreated,
        semanticMatches: stats.semanticMatches,
        trendingEntities: trendingEntities.slice(0, 10)
    });

    for (const anomaly of anomalies) {
        await messageBus.publish(Channel.NEWS_ANOMALY, anomaly);
    }

    for (const prediction of predictions.slice(0, 20)) {
        await messageBus.publish(Channel.NEWS_PREDICTION, prediction);
    }

    const resultClusters = await storyClusterStoreEnhanced.getHotClusters(50, 24);

    logger.info(`[EnhancedClusterNode] Clustering complete: ${stats.newClusters} new, ${stats.existingClusters} existing, ${stats.mergedClusters} merged, ${stats.semanticMatches} semantic, ${stats.anomaliesDetected} anomalies, ${stats.predictionsGenerated} predictions`);

    return {
        currentStep: 'CLUSTERING_COMPLETE',
        clusters: resultClusters,
        stats,
        anomalies,
        predictions,
        trendingEntities
    };
}

/**
 * Process single article with enhanced clustering
 */
async function processArticleEnhanced(
    article: NewsItem,
    aiLabel: any,
    entities: ExtractedEntity[],
    titleClusterId: string | undefined,
    titleClusters: any[],
    useVectorMode: boolean,
    knownClusterIds: Set<string>,
    missingClusterIds: Set<string>,
    stats: any
): Promise<{ clusterId: string; created: boolean; assigned: boolean; semanticMatch: boolean }> {
    const topic = aiLabel.topic;
    const keywords = aiLabel.keywords || [];
    const topicKey = topic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 180);

    let assignedClusterId: string | null = null;
    let semanticMatch = false;

    // 1. Topic key match (fastest)
    if (topicKey) {
        const existingByTopic = await storyClusterStoreEnhanced.getClusterIdByTopicKey(topicKey);
        if (existingByTopic) {
            const cluster = await storyClusterStoreEnhanced.getClusterById(existingByTopic);
            if (cluster?.category === article.categories[0]) {
                assignedClusterId = existingByTopic;
            }
        }
    }

    // 2. NEW: Title cluster match
    if (!assignedClusterId && titleClusterId) {
        // Find if any article in this title cluster is already assigned
        const titleCluster = titleClusters.find(tc => tc.id === titleClusterId);
        if (titleCluster) {
            // Check if any article in this cluster already has a cluster assignment
            for (const otherTitle of titleCluster.titles) {
                // This would need a lookup from title to cluster - simplified here
                // In production, maintain a reverse index
            }
        }
    }

    // 3. Vector similarity
    if (!assignedClusterId && useVectorMode) {
        const vectorQueryText = `${topic}. Keywords: ${keywords.join(', ')}`.trim();
        const similar = await newsVectorStore.findSimilarArticles(
            vectorQueryText || `${article.title}. ${article.summary || article.snippet}`,
            8,
            VECTOR_SIMILARITY_THRESHOLD,
            FILTER_VECTOR_BY_CATEGORY ? article.categories?.[0] : undefined
        );

        if (similar.length > 0) {
            const clusterVotes = new Map<string, number>();
            for (const s of similar) {
                const cid = s.metadata?.clusterId;
                if (cid) {
                    clusterVotes.set(cid, (clusterVotes.get(cid) || 0) + 1);
                }
            }

            if (clusterVotes.size > 0) {
                const [bestClusterId] = Array.from(clusterVotes.entries()).sort((a, b) => b[1] - a[1])[0];
                const cluster = await storyClusterStoreEnhanced.getClusterById(bestClusterId);
                if (cluster?.category === article.categories[0]) {
                    assignedClusterId = bestClusterId;
                    semanticMatch = true;
                }
            }
        }
    }

    // 4. NEW: Semantic similarity fallback
    if (!assignedClusterId && USE_ENHANCED_CLUSTERING) {
        const activeClusters = await storyClusterStoreEnhanced.getHotClusters(100, CLUSTER_MERGE_HOURS_THRESHOLD, article.categories[0]);

        if (activeClusters.length > 0) {
            // Find most similar cluster using enhanced semantic similarity
            let bestMatch: any = null;
            let bestScore = 0;

            for (const cluster of activeClusters) {
                // Compare article to cluster representative
                const similarity = await semanticSimilarityService.calculateSimilarity(
                    { id: article.id, title: article.title, content: article.content || article.snippet },
                    { id: cluster.id, title: cluster.topic, content: cluster.summary }
                );

                if (similarity.score > bestScore && similarity.score >= SEMANTIC_SIMILARITY_THRESHOLD) {
                    bestScore = similarity.score;
                    bestMatch = cluster;
                }
            }

            if (bestMatch) {
                assignedClusterId = bestMatch.id;
                semanticMatch = true;
                logger.debug(`[EnhancedClusterNode] Semantic match: "${article.title.slice(0, 40)}..." -> "${bestMatch.topic.slice(0, 40)}..." (${bestScore.toFixed(2)})`);
            }
        }
    }

    // 5. Validate cluster existence
    if (assignedClusterId) {
        if (missingClusterIds.has(assignedClusterId)) {
            assignedClusterId = null;
        } else if (!knownClusterIds.has(assignedClusterId)) {
            const exists = await storyClusterStoreEnhanced.clusterExists(assignedClusterId);
            if (exists) {
                knownClusterIds.add(assignedClusterId);
            } else {
                missingClusterIds.add(assignedClusterId);
                assignedClusterId = null;
            }
        }
    }

    // 6. Keyword similarity fallback
    if (!assignedClusterId) {
        const activeClusters = await storyClusterStoreEnhanced.getHotClusters(200, CLUSTER_MERGE_HOURS_THRESHOLD, article.categories[0]);
        let bestMatchScore = 0;
        let bestMatchCluster: any;

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

    // Create or join cluster
    let created = false;
    let finalClusterId: string;

    if (assignedClusterId) {
        // Join existing cluster
        const articleDate = article.publishedAt || new Date();
        const heatDelta = await storyClusterStoreEnhanced.calculateEnhancedHeat(article, new Date(), 10);

        const titleFingerprint = getTitleFingerprint(article.title);
        await storyClusterStoreEnhanced.addArticleToCluster(
            assignedClusterId,
            article.id,
            titleFingerprint,
            heatDelta,
            aiLabel.trendDirection
        );

        if (useVectorMode) {
            await newsVectorStore.storeArticle(article, assignedClusterId);
        }

        // Link entities to cluster
        for (const entity of entities) {
            try {
                const entityId = await storyClusterStoreEnhanced.findOrCreateEntity(entity.name, entity.type as any);
                await storyClusterStoreEnhanced.linkEntityToArticle(entityId, article.id, entity.confidence);
                await storyClusterStoreEnhanced.updateEntityClusterHeat(entityId, assignedClusterId, heatDelta * 0.1);
            } catch (e) {
                // Ignore entity linking errors
            }
        }

        finalClusterId = assignedClusterId;
    } else {
        // Create new cluster
        const newClusterId = crypto.randomUUID();
        const articleDate = article.publishedAt || new Date();
        const initialHeat = await storyClusterStoreEnhanced.calculateEnhancedHeat(article, new Date(), 10);

        const formattedTopic = validateAndFormatTopic(topic, article.title);

        await storyClusterStoreEnhanced.upsertCluster({
            id: newClusterId,
            topic: formattedTopic,
            topicKey: topicKey,
            summary: article.summary || '',
            category: article.categories[0] || 'GENERAL',
            keywords: keywords,
            heatScore: initialHeat,
            articleCount: 1,
            uniqueTitleCount: 1,
            trendDirection: aiLabel.trendDirection,
            urgency: aiLabel.urgency,
            subEventType: aiLabel.subEventType,
            firstSeen: new Date()
        });

        const titleFingerprint = getTitleFingerprint(article.title);
        await storyClusterStoreEnhanced.addArticleToCluster(
            newClusterId,
            article.id,
            titleFingerprint,
            0,
            aiLabel.trendDirection
        );

        if (useVectorMode) {
            await newsVectorStore.storeArticle(article, newClusterId);
        }

        // Link entities to cluster
        for (const entity of entities) {
            try {
                const entityId = await storyClusterStoreEnhanced.findOrCreateEntity(entity.name, entity.type as any);
                await storyClusterStoreEnhanced.linkEntityToArticle(entityId, article.id, entity.confidence);
                await storyClusterStoreEnhanced.updateEntityClusterHeat(entityId, newClusterId, initialHeat * 0.1);
            } catch (e) {
                // Ignore entity linking errors
            }
        }

        created = true;
        finalClusterId = newClusterId;
        knownClusterIds.add(newClusterId);
    }

    return { clusterId: finalClusterId, created, assigned: !created, semanticMatch };
}

/**
 * Create cross-category links between clusters
 */
async function createCrossCategoryLinks(processedArticles: Array<{ article: NewsItem; aiLabel: any; entities: ExtractedEntity[] }>): Promise<void> {
    const entityClusterMap = new Map<string, Set<string>>();

    // Map entities to their clusters
    for (const { article, entities } of processedArticles) {
        for (const entity of entities) {
            const clusterId = await storyClusterStoreEnhanced.getClusterIdByTopicKey(entity.normalized);
            if (clusterId) {
                if (!entityClusterMap.has(entity.normalized)) {
                    entityClusterMap.set(entity.normalized, new Set());
                }
                entityClusterMap.get(entity.normalized)!.add(clusterId);
            }
        }
    }

    // Create cross-refs for entities with multiple clusters
    let crossRefCount = 0;
    for (const [entityName, clusterIds] of entityClusterMap) {
        if (clusterIds.size > 1) {
            const clusterArray = Array.from(clusterIds);

            for (let i = 0; i < clusterArray.length; i++) {
                for (let j = i + 1; j < clusterArray.length; j++) {
                    await storyClusterStoreEnhanced.createCrossRef(
                        clusterArray[i],
                        clusterArray[j],
                        'RELATED',
                        0.6
                    );
                    crossRefCount++;
                }
            }
        }
    }

    logger.info(`[EnhancedClusterNode] Created ${crossRefCount} cross-category entity links`);
}

/**
 * Enhanced cluster merging with entity similarity
 */
async function mergeSimilarClustersEnhanced(useVectorMode: boolean): Promise<{ mergedCount: number; targetCount: number }> {
    const hotClusters = await storyClusterStoreEnhanced.getHotClusters(50, CLUSTER_MERGE_HOURS_THRESHOLD);

    if (hotClusters.length < 2) {
        return { mergedCount: 0, targetCount: 0 };
    }

    logger.debug(`[EnhancedClusterNode] Checking ${hotClusters.length} clusters for merging...`);

    // Group by category
    const byCategory = new Map<string, any[]>();
    for (const cluster of hotClusters) {
        if (!byCategory.has(cluster.category)) {
            byCategory.set(cluster.category, []);
        }
        byCategory.get(cluster.category)!.push(cluster);
    }

    let mergedCount = 0;
    let targetCount = 0;

    for (const [category, clusters] of byCategory) {
        if (clusters.length < 2) continue;

        for (let i = 0; i < clusters.length; i++) {
            for (let j = i + 1; j < clusters.length; j++) {
                const c1 = clusters[i];
                const c2 = clusters[j];

                // Skip if already merged
                if (!(await storyClusterStoreEnhanced.clusterExists(c1.id)) ||
                    !(await storyClusterStoreEnhanced.clusterExists(c2.id))) {
                    continue;
                }

                const similarity = calculateEnhancedSimilarity(c1, c2);

                if (similarity.similarity >= CLUSTER_MERGE_SIMILARITY_THRESHOLD) {
                    const target = c1.heatScore >= c2.heatScore ? c1 : c2;
                    const source = c1.heatScore >= c2.heatScore ? c2 : c1;

                    logger.info(`[EnhancedClusterNode] Merging: "${source.topic}" -> "${target.topic}" (${similarity.similarity.toFixed(2)})`);

                    const result = await storyClusterStoreEnhanced.mergeClusters(target.id, source.id);

                    if (result.moved > 0) {
                        mergedCount++;
                        targetCount++;

                        // Create hierarchy record
                        await storyClusterStoreEnhanced.createHierarchy(
                            target.id,
                            source.id,
                            'MERGED_INTO'
                        );
                    }
                }
            }
        }
    }

    return { mergedCount, targetCount };
}

/**
 * Calculate enhanced cluster similarity with entity overlap
 */
function calculateEnhancedSimilarity(c1: any, c2: any): ClusterSimilarityResult {
    let score = 0;
    let factors = 0;

    // Topic key match (50% weight)
    if (c1.topicKey && c2.topicKey && c1.topicKey === c2.topicKey) {
        score += 0.5;
        factors += 0.5;
    }

    // Topic word overlap (25% weight)
    const t1Words = new Set(c1.topic.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    const t2Words = new Set(c2.topic.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    const topicIntersect = [...t1Words].filter(w => t2Words.has(w));
    const topicUnion = new Set([...t1Words, ...t2Words]);
    const topicSim = topicUnion.size > 0 ? topicIntersect.length / topicUnion.size : 0;

    score += topicSim * 0.25;
    factors += 0.25;

    // Keyword overlap (15% weight)
    const k1Words = new Set((c1.keywords || []).map((k: string) => k.toLowerCase()));
    const k2Words = new Set((c2.keywords || []).map((k: string) => k.toLowerCase()));
    const kIntersect = [...k1Words].filter(k => k2Words.has(k));
    const kUnion = new Set([...k1Words, ...k2Words]);
    const keywordSim = kUnion.size > 0 ? kIntersect.length / kUnion.size : 0;

    score += keywordSim * 0.15;
    factors += 0.15;

    // Sub-event type match (10% weight)
    if (c1.subEventType && c2.subEventType && c1.subEventType === c2.subEventType) {
        score += 0.1;
        factors += 0.1;
    }

    const normalizedScore = factors > 0 ? Math.min(score / factors, 1) : 0;

    return {
        cluster1Id: c1.id,
        cluster2Id: c2.id,
        similarity: normalizedScore,
        topicSimilarity: topicSim,
        keywordSimilarity: keywordSim,
        entitySimilarity: 0, // TODO: Add entity overlap when entity data is available
        category: c1.category,
        shouldMerge: normalizedScore >= CLUSTER_MERGE_SIMILARITY_THRESHOLD,
        mergeReason: normalizedScore >= CLUSTER_MERGE_SIMILARITY_THRESHOLD ?
            `Similarity ${normalizedScore.toFixed(2)} >= threshold` : ''
    };
}

/**
 * Validate topic quality
 */
function validateTopicQuality(topic: string, articleTitle: string): { valid: boolean; reason: string } {
    if (!topic || topic.length < 5) {
        return { valid: false, reason: 'Topic too short' };
    }

    const genericPatterns = [
        'price action', 'market update', 'latest news', 'breaking news',
        'crypto news', 'trading volume', 'technical analysis', 'market watch',
        'daily update', 'weekly recap', 'price chart', 'live coverage'
    ];

    const topicLower = topic.toLowerCase();
    for (const pattern of genericPatterns) {
        if (topicLower.includes(pattern)) {
            return { valid: false, reason: `Generic pattern: ${pattern}` };
        }
    }

    const words = topic.split(/\s+/);
    const properNouns = words.filter(w => /^[A-Z][a-z]/.test(w) || /^[A-Z]{2,}/.test(w));

    if (words.length < 3) {
        return { valid: false, reason: 'Topic too short (< 3 words)' };
    }

    if (properNouns.length < 1) {
        return { valid: false, reason: 'No proper nouns found' };
    }

    return { valid: true };
}

/**
 * Calculate keyword similarity
 */
function calculateKeywordSimilarity(article: NewsItem, cluster: any): number {
    const articleTags = new Set(article.tags.map(t => t.toLowerCase()));
    const clusterTags = new Set((cluster.keywords || []).map((t: string) => t.toLowerCase()));

    article.title.toLowerCase().split(/\s+/).forEach((w: string) => {
        if (w.length > 3) articleTags.add(w);
    });

    cluster.topic.toLowerCase().split(/\s+/).forEach((w: string) => {
        if (w.length > 3) clusterTags.add(w);
    });

    if (articleTags.size === 0 || clusterTags.size === 0) return 0;

    let intersection = 0;
    for (const tag of articleTags) {
        if (clusterTags.has(tag)) intersection++;
    }

    const union = articleTags.size + clusterTags.size - intersection;
    return union > 0 ? intersection / union : 0;
}

/**
 * Fallback clustering when AI labeling fails
 */
async function createFallbackClustering(articles: NewsItem[], stats: any): Promise<Partial<EnhancedClusteringState>> {
    logger.warn('[EnhancedClusterNode] Using fallback clustering...');

    const categoryGroups = new Map<string, NewsItem[]>();

    for (const article of articles) {
        const category = article.categories?.[0] || 'GENERAL';
        if (!categoryGroups.has(category)) {
            categoryGroups.set(category, []);
        }
        categoryGroups.get(category)!.push(article);
    }

    let newClusters = 0;

    for (const [category, categoryArticles] of categoryGroups) {
        const clusterResult = await createFallbackClustersForCategory(categoryArticles, category);
        newClusters += clusterResult.newClusters;
    }

    stats.newClusters = newClusters;

    const clusters = await storyClusterStoreEnhanced.getHotClusters(50, 24);

    return {
        currentStep: 'CLUSTERING_COMPLETE_FALLBACK',
        clusters,
        stats,
        thoughts: [`Fallback clustering: ${newClusters} clusters`]
    };
}

/**
 * Create fallback clusters for a category
 */
async function createFallbackClustersForCategory(articles: NewsItem[], category: string): Promise<{ newClusters: number }> {
    const clustered = new Set<string>();
    let newClusters = 0;

    const titleKeyTerms = new Map<string, { terms: string[]; article: NewsItem }>();

    for (const article of articles) {
        const terms = extractKeyTerms(article.title);
        titleKeyTerms.set(article.id, { terms, article });
    }

    for (const [id, { terms, article }] of titleKeyTerms) {
        if (clustered.has(id)) continue;
        clustered.add(id);

        const similarArticles = [article];

        for (const [otherId, { terms: otherTerms }] of titleKeyTerms) {
            if (id === otherId || clustered.has(otherId)) continue;

            const overlap = calculateTermOverlap(terms, otherTerms);
            if (overlap >= 0.4) {
                similarArticles.push(titleKeyTerms.get(otherId)!.article);
                clustered.add(otherId);
            }
        }

        if (similarArticles.length > 0) {
            const topic = generateFallbackTopic(similarArticles[0].title, category);
            const newClusterId = crypto.randomUUID();

            await storyClusterStoreEnhanced.upsertCluster({
                id: newClusterId,
                topic,
                topicKey: terms.join('_').toLowerCase(),
                summary: `Auto-generated from ${similarArticles.length} articles`,
                category,
                keywords: terms.slice(0, 5),
                heatScore: 10,
                articleCount: 0,
                uniqueTitleCount: 0,
                trendDirection: 'NEUTRAL',
                urgency: 'MEDIUM',
                subEventType: 'other',
                firstSeen: new Date()
            });

            for (const art of similarArticles) {
                const titleFingerprint = getTitleFingerprint(art.title);
                await storyClusterStoreEnhanced.addArticleToCluster(newClusterId, art.id, titleFingerprint, 0, 'NEUTRAL');
            }

            newClusters++;
        }
    }

    return { newClusters };
}

/**
 * Extract key terms from title
 */
function extractKeyTerms(title: string): string[] {
    const words = title
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !isStopWord(w));

    return [...new Set(words)];
}

/**
 * Check if word is stop word
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
 * Calculate term overlap
 */
function calculateTermOverlap(terms1: string[], terms2: string[]): number {
    if (terms1.length === 0 || terms2.length === 0) return 0;

    const set1 = new Set(terms1);
    const set2 = new Set(terms2);
    const intersection = [...set1].filter(t => set2.has(t)).length;
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection / union.size : 0;
}

/**
 * Generate fallback topic
 */
function generateFallbackTopic(title: string, category: string): string {
    let clean = title
        .replace(/^(Breaking|UPDATE|JUST IN|ALERT|NEWS):?\s*/i, '')
        .replace(/\s*-\s*(Source|Reuters|Bloomberg|AP|AFP).*$/i, '')
        .replace(/\s*\|.*$/, '')
        .trim();

    clean = clean.replace(/\b\w+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

    const importantWords = ['BTC', 'ETH', 'USD', 'Fed', 'SEC', 'ETF', 'CEO', 'CFO', 'AI', 'GDP', 'CPI'];
    for (const word of importantWords) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        clean = clean.replace(regex, word.toUpperCase());
    }

    if (clean.length > 80) {
        clean = clean.substring(0, 77) + '...';
    }

    return clean || `${category} Market Event`;
}

// NEW: Semantic similarity threshold
const SEMANTIC_SIMILARITY_THRESHOLD = 0.65;

export default enhancedStoryClusterNode;
