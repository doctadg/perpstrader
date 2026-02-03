"use strict";
// Enhanced Story Cluster Node
// Integrates all 10 enhancements into clustering pipeline
// Replaces original story-cluster-node.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedStoryClusterNode = enhancedStoryClusterNode;
const logger_1 = __importDefault(require("../../shared/logger"));
const news_vector_store_1 = __importDefault(require("../../data/news-vector-store"));
const story_cluster_store_enhanced_1 = __importDefault(require("../../data/story-cluster-store-enhanced"));
const crypto_1 = __importDefault(require("crypto"));
const glm_service_1 = __importDefault(require("../../shared/glm-service"));
const openrouter_service_1 = __importDefault(require("../../shared/openrouter-service"));
const title_cleaner_1 = require("../../shared/title-cleaner");
const message_bus_1 = require("../../shared/message-bus");
const entity_extraction_1 = __importDefault(require("./entity-extraction"));
const heat_predictor_1 = __importDefault(require("./heat-predictor"));
// Configuration
const VECTOR_SIMILARITY_THRESHOLD = Number.parseFloat(process.env.NEWS_VECTOR_DISTANCE_THRESHOLD || '0.70');
const KEYWORD_SIMILARITY_THRESHOLD = 0.60;
const FILTER_VECTOR_BY_CATEGORY = process.env.NEWS_VECTOR_FILTER_BY_CATEGORY === 'true';
const USE_GLM_FALLBACK = process.env.NEWS_USE_GLM === 'true';
const CLUSTER_MERGE_HOURS_THRESHOLD = 48;
const CLUSTER_BATCH_SIZE = Number.parseInt(process.env.CLUSTER_BATCH_SIZE || '20', 10);
const CLUSTER_MERGE_SIMILARITY_THRESHOLD = 0.85;
/**
 * Enhanced story clustering with all 10 improvements
 */
async function enhancedStoryClusterNode(state) {
    const articles = state.categorizedNews || [];
    if (articles.length === 0) {
        return { currentStep: 'CLUSTERING_SKIPPED_NO_ARTICLES' };
    }
    // Filter non-market-moving content
    const beforeFilter = articles.length;
    const filteredArticles = articles.filter(article => !(0, title_cleaner_1.isNonMarketMoving)(article.title));
    const filteredCount = beforeFilter - filteredArticles.length;
    if (filteredCount > 0) {
        logger_1.default.info(`[EnhancedClusterNode] Filtered out ${filteredCount} non-market-moving articles`);
    }
    if (filteredArticles.length === 0) {
        return { currentStep: 'CLUSTERING_SKIPPED_ALL_FILTERED' };
    }
    logger_1.default.info(`[EnhancedClusterNode] Processing ${filteredArticles.length} articles with enhanced clustering...`);
    const stats = {
        totalProcessed: filteredArticles.length,
        newClusters: 0,
        existingClusters: 0,
        mergedClusters: 0,
        entitiesExtracted: 0,
        anomaliesDetected: 0,
        predictionsGenerated: 0
    };
    const anomalies = [];
    const predictions = [];
    const vectorStats = await news_vector_store_1.default.getStats();
    const useVectorMode = vectorStats.status === 'ok';
    const glmAvailable = glm_service_1.default.canUseService() && USE_GLM_FALLBACK;
    logger_1.default.info(`[EnhancedClusterNode] Mode: Vector=${useVectorMode}, GLM=${glmAvailable}`);
    // Check OpenRouter availability
    if (!openrouter_service_1.default.canUseService()) {
        logger_1.default.error('[EnhancedClusterNode] OpenRouter not available');
        return {
            currentStep: 'CLUSTERING_FAILED_NO_OPENROUTER',
            errors: ['OpenRouter service not available']
        };
    }
    // ============================================================
    // PHASE 1: Batch AI Labeling
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] Batch labeling articles...');
    const aiLabelsMap = new Map();
    // Batch OpenRouter labeling
    const batchLabels = await openrouter_service_1.default.batchEventLabels(filteredArticles.map(a => ({
        id: a.id,
        title: a.title,
        category: a.categories?.[0],
        tags: a.tags
    })));
    for (const [id, label] of batchLabels) {
        aiLabelsMap.set(id, label);
    }
    logger_1.default.info(`[EnhancedClusterNode] OpenRouter labeled ${batchLabels.size} articles`);
    // GLM fallback for unlabeled
    if (glmAvailable && batchLabels.size < filteredArticles.length) {
        const unlabeled = filteredArticles.filter(a => !aiLabelsMap.has(a.id));
        logger_1.default.info(`[EnhancedClusterNode] GLM fallback: ${unlabeled.length} articles...`);
        const GLM_BATCH_SIZE = 5;
        for (let i = 0; i < unlabeled.length; i += GLM_BATCH_SIZE) {
            const batch = unlabeled.slice(i, i + GLM_BATCH_SIZE);
            await Promise.all(batch.map(async (article) => {
                try {
                    const glmLabel = await glm_service_1.default.generateEventLabel({
                        title: article.title,
                        category: article.categories?.[0],
                        tags: article.tags
                    });
                    if (glmLabel?.topic && glmLabel.topic.length > 5) {
                        aiLabelsMap.set(article.id, glmLabel);
                    }
                }
                catch (error) {
                    logger_1.default.debug(`[EnhancedClusterNode] GLM failed: ${error.message}`);
                }
            }));
        }
    }
    // ============================================================
    // PHASE 2: Filter valid labels & extract entities
    // ============================================================
    const processedArticles = [];
    for (const article of filteredArticles) {
        const aiLabel = aiLabelsMap.get(article.id);
        if (aiLabel?.topic && aiLabel.topic.length > 5) {
            const validation = validateTopicQuality(aiLabel.topic, article.title);
            if (!validation.valid) {
                logger_1.default.debug(`[EnhancedClusterNode] Rejecting low-quality topic: ${validation.reason}`);
                continue;
            }
            // Extract entities
            const entities = entity_extraction_1.default.extractEntities(article.title, article.content || article.snippet || '');
            stats.entitiesExtracted += entities.length;
            processedArticles.push({ article, aiLabel, entities });
        }
    }
    if (processedArticles.length === 0) {
        logger_1.default.warn('[EnhancedClusterNode] All articles failed validation, using fallback');
        return await createFallbackClustering(filteredArticles, stats);
    }
    logger_1.default.info(`[EnhancedClusterNode] Processing ${processedArticles.length} articles with valid labels (${stats.entitiesExtracted} entities)`);
    // ============================================================
    // PHASE 3: Parallel Clustering
    // ============================================================
    const knownClusterIds = new Set();
    const missingClusterIds = new Set();
    for (let i = 0; i < processedArticles.length; i += CLUSTER_BATCH_SIZE) {
        const batch = processedArticles.slice(i, i + CLUSTER_BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(({ article, aiLabel, entities }) => processArticleEnhanced(article, aiLabel, entities, useVectorMode, knownClusterIds, missingClusterIds, stats)));
        // Aggregate results
        batchResults.forEach(result => {
            if (result.created) {
                stats.newClusters++;
                knownClusterIds.add(result.clusterId);
            }
            else if (result.assigned) {
                stats.existingClusters++;
            }
        });
        logger_1.default.info(`[EnhancedClusterNode] Progress: ${Math.min(i + CLUSTER_BATCH_SIZE, processedArticles.length)}/${processedArticles.length} (${stats.newClusters} new, ${stats.existingClusters} existing)`);
    }
    // ============================================================
    // PHASE 4: Cross-Category Linking
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] Creating cross-category links...');
    await createCrossCategoryLinks(processedArticles);
    // ============================================================
    // PHASE 5: Cluster Merging
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] Merging similar clusters...');
    const mergeResult = await mergeSimilarClustersEnhanced(useVectorMode);
    stats.mergedClusters = mergeResult.mergedCount;
    // ============================================================
    // PHASE 6: Heat History & Analysis
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] Recording heat history...');
    const clusters = await story_cluster_store_enhanced_1.default.getHotClusters(500, CLUSTER_MERGE_HOURS_THRESHOLD);
    for (const cluster of clusters) {
        // Record heat history
        await story_cluster_store_enhanced_1.default.recordHeatHistory(cluster.id, cluster.heatScore, cluster.articleCount, cluster.uniqueTitleCount || cluster.articleCount);
        // Detect anomalies
        const anomaly = await story_cluster_store_enhanced_1.default.detectHeatAnomalies(cluster.id);
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
        // Calculate composite rank
        await story_cluster_store_enhanced_1.default.calculateCompositeRank(cluster.id);
    }
    // ============================================================
    // PHASE 7: Heat Predictions
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] Generating heat predictions...');
    const heatHistories = new Map();
    for (const cluster of clusters.slice(0, 100)) { // Limit to top 100 for performance
        const history = await story_cluster_store_enhanced_1.default.getHeatHistory(cluster.id, 48);
        heatHistories.set(cluster.id, history);
    }
    const batchPredictions = heat_predictor_1.default.batchPredict(heatHistories);
    predictions.push(...batchPredictions);
    stats.predictionsGenerated = batchPredictions.length;
    // ============================================================
    // PHASE 8: Get Trending Entities
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] Calculating trending entities...');
    const trendingEntities = await story_cluster_store_enhanced_1.default.getTrendingEntities(20, 24);
    // ============================================================
    // PHASE 9: Publish Events
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] Publishing events...');
    await message_bus_1.messageBus.publish(message_bus_1.Channel.NEWS_CLUSTERED, {
        timestamp: new Date(),
        totalProcessed: stats.totalProcessed,
        newClusters: stats.newClusters,
        existingClusters: stats.existingClusters,
        mergedClusters: stats.mergedClusters,
        entitiesExtracted: stats.entitiesExtracted,
        anomaliesDetected: stats.anomaliesDetected,
        predictionsGenerated: stats.predictionsGenerated,
        trendingEntities: trendingEntities.slice(0, 10)
    });
    // Publish anomaly alerts
    for (const anomaly of anomalies) {
        await message_bus_1.messageBus.publish(message_bus_1.Channel.NEWS_ANOMALY, anomaly);
    }
    // Publish predictions
    for (const prediction of predictions.slice(0, 20)) {
        await message_bus_1.messageBus.publish(message_bus_1.Channel.NEWS_PREDICTION, prediction);
    }
    const resultClusters = await story_cluster_store_enhanced_1.default.getHotClusters(50, 24);
    logger_1.default.info(`[EnhancedClusterNode] Clustering complete: ${stats.newClusters} new, ${stats.existingClusters} existing, ${stats.mergedClusters} merged, ${stats.anomaliesDetected} anomalies, ${stats.predictionsGenerated} predictions`);
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
async function processArticleEnhanced(article, aiLabel, entities, useVectorMode, knownClusterIds, missingClusterIds, stats) {
    const topic = aiLabel.topic;
    const keywords = aiLabel.keywords || [];
    const topicKey = topic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 180);
    // Find matching cluster
    let assignedClusterId = null;
    // 1. Topic key match
    if (topicKey) {
        const existingByTopic = await story_cluster_store_enhanced_1.default.getClusterIdByTopicKey(topicKey);
        if (existingByTopic) {
            const cluster = await story_cluster_store_enhanced_1.default.getClusterById(existingByTopic);
            if (cluster?.category === article.categories[0]) {
                assignedClusterId = existingByTopic;
            }
        }
    }
    // 2. Vector similarity
    if (!assignedClusterId && useVectorMode) {
        const vectorQueryText = `${topic}. Keywords: ${keywords.join(', ')}`.trim();
        const similar = await news_vector_store_1.default.findSimilarArticles(vectorQueryText || `${article.title}. ${article.summary || article.snippet}`, 8, VECTOR_SIMILARITY_THRESHOLD, FILTER_VECTOR_BY_CATEGORY ? article.categories?.[0] : undefined);
        if (similar.length > 0) {
            const clusterVotes = new Map();
            for (const s of similar) {
                const cid = s.metadata?.clusterId;
                if (cid) {
                    clusterVotes.set(cid, (clusterVotes.get(cid) || 0) + 1);
                }
            }
            if (clusterVotes.size > 0) {
                const [bestClusterId] = Array.from(clusterVotes.entries()).sort((a, b) => b[1] - a[1])[0];
                const cluster = await story_cluster_store_enhanced_1.default.getClusterById(bestClusterId);
                if (cluster?.category === article.categories[0]) {
                    assignedClusterId = bestClusterId;
                }
            }
        }
    }
    // 3. Validate cluster existence
    if (assignedClusterId) {
        if (missingClusterIds.has(assignedClusterId)) {
            assignedClusterId = null;
        }
        else if (!knownClusterIds.has(assignedClusterId)) {
            const exists = await story_cluster_store_enhanced_1.default.clusterExists(assignedClusterId);
            if (exists) {
                knownClusterIds.add(assignedClusterId);
            }
            else {
                missingClusterIds.add(assignedClusterId);
                assignedClusterId = null;
            }
        }
    }
    // 4. Keyword similarity fallback
    if (!assignedClusterId) {
        const activeClusters = await story_cluster_store_enhanced_1.default.getHotClusters(500, CLUSTER_MERGE_HOURS_THRESHOLD, article.categories[0]);
        let bestMatchScore = 0;
        let bestMatchCluster;
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
    let finalClusterId;
    if (assignedClusterId) {
        // Join existing cluster
        const articleDate = article.publishedAt || new Date();
        const heatDelta = await story_cluster_store_enhanced_1.default.calculateEnhancedHeat(article, new Date(), 10);
        const titleFingerprint = (0, title_cleaner_1.getTitleFingerprint)(article.title);
        const result = await story_cluster_store_enhanced_1.default.addArticleToCluster(assignedClusterId, article.id, titleFingerprint, heatDelta, aiLabel.trendDirection);
        if (useVectorMode) {
            await news_vector_store_1.default.storeArticle(article, assignedClusterId);
        }
        // Link entities to cluster
        for (const entity of entities) {
            const entityId = await story_cluster_store_enhanced_1.default.findOrCreateEntity(entity.name, entity.type);
            await story_cluster_store_enhanced_1.default.linkEntityToArticle(entityId, article.id, entity.confidence);
            await story_cluster_store_enhanced_1.default.updateEntityClusterHeat(entityId, assignedClusterId, heatDelta * 0.1);
        }
        finalClusterId = assignedClusterId;
    }
    else {
        // Create new cluster
        const newClusterId = crypto_1.default.randomUUID();
        const articleDate = article.publishedAt || new Date();
        const initialHeat = await story_cluster_store_enhanced_1.default.calculateEnhancedHeat(article, new Date(), 10);
        const formattedTopic = (0, title_cleaner_1.validateAndFormatTopic)(topic, article.title);
        await story_cluster_store_enhanced_1.default.upsertCluster({
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
        const titleFingerprint = (0, title_cleaner_1.getTitleFingerprint)(article.title);
        await story_cluster_store_enhanced_1.default.addArticleToCluster(newClusterId, article.id, titleFingerprint, 0, aiLabel.trendDirection);
        if (useVectorMode) {
            await news_vector_store_1.default.storeArticle(article, newClusterId);
        }
        // Link entities to cluster
        for (const entity of entities) {
            const entityId = await story_cluster_store_enhanced_1.default.findOrCreateEntity(entity.name, entity.type);
            await story_cluster_store_enhanced_1.default.linkEntityToArticle(entityId, article.id, entity.confidence);
            await story_cluster_store_enhanced_1.default.updateEntityClusterHeat(entityId, newClusterId, initialHeat * 0.1);
        }
        created = true;
        finalClusterId = newClusterId;
        knownClusterIds.add(newClusterId);
    }
    return { clusterId: finalClusterId, created, assigned: !created };
}
/**
 * Create cross-category links between clusters
 */
async function createCrossCategoryLinks(processedArticles) {
    const entityClusterMap = new Map();
    // Map entities to their clusters
    for (const { article, entities } of processedArticles) {
        for (const entity of entities) {
            const clusterId = await story_cluster_store_enhanced_1.default.getClusterIdByTopicKey(entity.normalized);
            if (clusterId) {
                if (!entityClusterMap.has(entity.normalized)) {
                    entityClusterMap.set(entity.normalized, new Set());
                }
                entityClusterMap.get(entity.normalized).add(clusterId);
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
                    await story_cluster_store_enhanced_1.default.createCrossRef(clusterArray[i], clusterArray[j], 'RELATED', 0.6);
                    crossRefCount++;
                }
            }
        }
    }
    logger_1.default.info(`[EnhancedClusterNode] Created ${crossRefCount} cross-category entity links`);
}
/**
 * Enhanced cluster merging with entity similarity
 */
async function mergeSimilarClustersEnhanced(useVectorMode) {
    const hotClusters = await story_cluster_store_enhanced_1.default.getHotClusters(50, CLUSTER_MERGE_HOURS_THRESHOLD);
    if (hotClusters.length < 2) {
        return { mergedCount: 0, targetCount: 0 };
    }
    logger_1.default.debug(`[EnhancedClusterNode] Checking ${hotClusters.length} clusters for merging...`);
    // Group by category
    const byCategory = new Map();
    for (const cluster of hotClusters) {
        if (!byCategory.has(cluster.category)) {
            byCategory.set(cluster.category, []);
        }
        byCategory.get(cluster.category).push(cluster);
    }
    let mergedCount = 0;
    let targetCount = 0;
    for (const [category, clusters] of byCategory) {
        if (clusters.length < 2)
            continue;
        for (let i = 0; i < clusters.length; i++) {
            for (let j = i + 1; j < clusters.length; j++) {
                const c1 = clusters[i];
                const c2 = clusters[j];
                // Skip if already merged
                if (!(await story_cluster_store_enhanced_1.default.clusterExists(c1.id)) ||
                    !(await story_cluster_store_enhanced_1.default.clusterExists(c2.id))) {
                    continue;
                }
                const similarity = calculateEnhancedSimilarity(c1, c2);
                if (similarity.similarity >= CLUSTER_MERGE_SIMILARITY_THRESHOLD) {
                    const target = c1.heatScore >= c2.heatScore ? c1 : c2;
                    const source = c1.heatScore >= c2.heatScore ? c2 : c1;
                    logger_1.default.info(`[EnhancedClusterNode] Merging: "${source.topic}" -> "${target.topic}" (${similarity.similarity.toFixed(2)})`);
                    const result = await story_cluster_store_enhanced_1.default.mergeClusters(target.id, source.id);
                    if (result.moved > 0) {
                        mergedCount++;
                        targetCount++;
                        // Create hierarchy record
                        await story_cluster_store_enhanced_1.default.createHierarchy(target.id, source.id, 'MERGED_INTO');
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
function calculateEnhancedSimilarity(c1, c2) {
    let score = 0;
    let factors = 0;
    // Topic key match (50% weight)
    if (c1.topicKey && c2.topicKey && c1.topicKey === c2.topicKey) {
        score += 0.5;
        factors += 0.5;
    }
    // Topic word overlap (25% weight)
    const t1Words = new Set(c1.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const t2Words = new Set(c2.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const topicIntersect = [...t1Words].filter(w => t2Words.has(w));
    const topicUnion = new Set([...t1Words, ...t2Words]);
    const topicSim = topicUnion.size > 0 ? topicIntersect.length / topicUnion.size : 0;
    score += topicSim * 0.25;
    factors += 0.25;
    // Keyword overlap (15% weight)
    const k1Words = new Set((c1.keywords || []).map((k) => k.toLowerCase()));
    const k2Words = new Set((c2.keywords || []).map((k) => k.toLowerCase()));
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
function validateTopicQuality(topic, articleTitle) {
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
function calculateKeywordSimilarity(article, cluster) {
    const articleTags = new Set(article.tags.map(t => t.toLowerCase()));
    const clusterTags = new Set((cluster.keywords || []).map(t => t.toLowerCase()));
    article.title.toLowerCase().split(/\s+/).forEach(w => {
        if (w.length > 3)
            articleTags.add(w);
    });
    cluster.topic.toLowerCase().split(/\s+/).forEach(w => {
        if (w.length > 3)
            clusterTags.add(w);
    });
    if (articleTags.size === 0 || clusterTags.size === 0)
        return 0;
    let intersection = 0;
    for (const tag of articleTags) {
        if (clusterTags.has(tag))
            intersection++;
    }
    const union = articleTags.size + clusterTags.size - intersection;
    return union > 0 ? intersection / union : 0;
}
/**
 * Fallback clustering when AI labeling fails
 */
async function createFallbackClustering(articles, stats) {
    logger_1.default.warn('[EnhancedClusterNode] Using fallback clustering...');
    const categoryGroups = new Map();
    for (const article of articles) {
        const category = article.categories?.[0] || 'GENERAL';
        if (!categoryGroups.has(category)) {
            categoryGroups.set(category, []);
        }
        categoryGroups.get(category).push(article);
    }
    let newClusters = 0;
    for (const [category, categoryArticles] of categoryGroups) {
        const clusterResult = await createFallbackClustersForCategory(categoryArticles, category);
        newClusters += clusterResult.newClusters;
    }
    stats.newClusters = newClusters;
    const clusters = await story_cluster_store_enhanced_1.default.getHotClusters(50, 24);
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
async function createFallbackClustersForCategory(articles, category) {
    const clustered = new Set();
    let newClusters = 0;
    const titleKeyTerms = new Map();
    for (const article of articles) {
        const terms = extractKeyTerms(article.title);
        titleKeyTerms.set(article.id, { terms, article });
    }
    for (const [id, { terms, article }] of titleKeyTerms) {
        if (clustered.has(id))
            continue;
        clustered.add(id);
        const similarArticles = [article];
        for (const [otherId, { terms: otherTerms }] of titleKeyTerms) {
            if (id === otherId || clustered.has(otherId))
                continue;
            const overlap = calculateTermOverlap(terms, otherTerms);
            if (overlap >= 0.4) {
                similarArticles.push(titleKeyTerms.get(otherId).article);
                clustered.add(otherId);
            }
        }
        if (similarArticles.length > 0) {
            const topic = generateFallbackTopic(similarArticles[0].title, category);
            const newClusterId = crypto_1.default.randomUUID();
            await story_cluster_store_enhanced_1.default.upsertCluster({
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
                const titleFingerprint = (0, title_cleaner_1.getTitleFingerprint)(art.title);
                await story_cluster_store_enhanced_1.default.addArticleToCluster(newClusterId, art.id, titleFingerprint, 0, 'NEUTRAL');
            }
            newClusters++;
        }
    }
    return { newClusters };
}
/**
 * Extract key terms from title
 */
function extractKeyTerms(title) {
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
function isStopWord(word) {
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
function calculateTermOverlap(terms1, terms2) {
    if (terms1.length === 0 || terms2.length === 0)
        return 0;
    const set1 = new Set(terms1);
    const set2 = new Set(terms2);
    const intersection = [...set1].filter(t => set2.has(t)).length;
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection / union.size : 0;
}
/**
 * Generate fallback topic
 */
function generateFallbackTopic(title, category) {
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
exports.default = enhancedStoryClusterNode;
//# sourceMappingURL=enhanced-story-cluster-node-original.js.map