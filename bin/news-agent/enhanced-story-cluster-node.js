"use strict";
// Enhanced Story Cluster Node - Optimized Version
// Integrates improved semantic clustering with title clustering fixes
// Replaces original story-cluster-node.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedStoryClusterNode = enhancedStoryClusterNode;
const logger_1 = __importDefault(require("../shared/logger"));
const news_vector_store_1 = __importDefault(require("../data/news-vector-store"));
const story_cluster_store_enhanced_1 = __importDefault(require("../data/story-cluster-store-enhanced"));
const story_cluster_store_1 = __importDefault(require("../data/story-cluster-store"));
const crypto_1 = __importDefault(require("crypto"));
const glm_service_1 = __importDefault(require("../../shared/glm-service"));
const openrouter_service_1 = __importDefault(require("../../shared/openrouter-service"));
const title_cleaner_1 = require("../../shared/title-cleaner");
const human_title_formatter_1 = require("../../shared/human-title-formatter");
const message_bus_1 = require("../../shared/message-bus");
const heat_predictor_1 = __importDefault(require("./heat-predictor"));
// NEW: Import improved clustering services
const title_semantic_clustering_1 = __importDefault(require("../../shared/title-semantic-clustering"));
const semantic_similarity_1 = __importDefault(require("./semantic-similarity"));
const enhanced_entity_extraction_1 = __importDefault(require("./enhanced-entity-extraction"));
// Configuration - Optimized thresholds based on testing
const VECTOR_SIMILARITY_THRESHOLD = Number.parseFloat(process.env.NEWS_VECTOR_DISTANCE_THRESHOLD || '0.50'); // Aggressively lowered for recall
const KEYWORD_SIMILARITY_THRESHOLD = 0.35; // Lowered from 0.40 — entity overlap validates merges
const TITLE_SIMILARITY_THRESHOLD = 0.55; // Lowered from 0.70 — more title-based grouping
const FILTER_VECTOR_BY_CATEGORY = process.env.NEWS_VECTOR_FILTER_BY_CATEGORY === 'true';
const USE_GLM_FALLBACK = process.env.NEWS_USE_GLM === 'true';
const USE_ENHANCED_CLUSTERING = process.env.USE_ENHANCED_SEMANTIC_CLUSTERING !== 'false'; // Default true
const CLUSTER_MERGE_HOURS_THRESHOLD = 48;
const CLUSTER_BATCH_SIZE = Number.parseInt(process.env.CLUSTER_BATCH_SIZE || '50', 10); // Increased from 20 to process more articles per cycle
const CLUSTER_MERGE_SIMILARITY_THRESHOLD = 0.40; // Lowered from 0.55 — entity overlap now drives most merges, threshold is secondary
const ANTI_SPAM_HOURS = 48; // Extended from 2 hours to match merge window for better cross-run dedup
const MAX_ENTITY_CLUSTER_LINKS = 200; // Cap entity links per cluster to prevent gravity wells
const ENTITY_RELEVANCE_MIN_MATCH = 3; // Min chars of entity name that must appear in topic/keywords to be linked
const MAX_CLUSTER_ARTICLES = 500; // Cap articles per cluster to prevent gravity wells (22k+ is too big)
/**
 * Enhanced story clustering with improved title clustering
 */
async function enhancedStoryClusterNode(state) {
    let articles = state.categorizedNews || [];
    if (articles.length === 0) {
        logger_1.default.info('[EnhancedClusterNode] No new articles from pipeline, fetching unclustered articles from DB...');
        articles = await story_cluster_store_1.default.getUnclusteredArticles(CLUSTER_BATCH_SIZE);
        if (articles.length === 0) {
            return { currentStep: 'CLUSTERING_SKIPPED_NO_ARTICLES' };
        }
        logger_1.default.info(`[EnhancedClusterNode] Found ${articles.length} unclustered articles from DB`);
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
    logger_1.default.info(`[EnhancedClusterNode] Processing ${filteredArticles.length} articles with enhanced clustering (v2.0)...`);
    const stats = {
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
    const anomalies = [];
    const predictions = [];
    const vectorStats = await news_vector_store_1.default.getStats();
    const useVectorMode = vectorStats.status === 'ok';
    const glmAvailable = glm_service_1.default.canUseService() && USE_GLM_FALLBACK;
    logger_1.default.info(`[EnhancedClusterNode] Mode: Vector=${useVectorMode}, GLM=${glmAvailable}, Enhanced=${USE_ENHANCED_CLUSTERING}`);
    // Check OpenRouter availability
    if (!openrouter_service_1.default.canUseService()) {
        logger_1.default.error('[EnhancedClusterNode] OpenRouter not available');
        return {
            currentStep: 'CLUSTERING_FAILED_NO_OPENROUTER',
            errors: ['OpenRouter service not available']
        };
    }
    // ============================================================
    // NEW: Pre-cluster articles by title similarity (PHASE 0)
    // This addresses the "weak title clustering" issue
    // ============================================================
    let titleClusters = [];
    if (USE_ENHANCED_CLUSTERING) {
        logger_1.default.info('[EnhancedClusterNode] PHASE 0: Pre-clustering by title similarity...');
        titleClusters = await title_semantic_clustering_1.default.clusterTitles(filteredArticles.map(a => ({ id: a.id, title: a.title, category: a.categories?.[0] })), TITLE_SIMILARITY_THRESHOLD);
        stats.titleClustersCreated = titleClusters.length;
        logger_1.default.info(`[EnhancedClusterNode] Created ${titleClusters.length} title-based clusters`);
        // FIX 7: Cross-batch dedup - check recent DB clusters (last 24h) for title matches
        if (titleClusters.length > 0) {
            const recentClusters = await story_cluster_store_enhanced_1.default.getHotClusters(200, 24);
            let crossBatchMerged = 0;
            for (const titleCluster of titleClusters) {
                const repTitle = titleCluster.representativeTitle;
                let bestMatchCluster = null;
                let bestMatchScore = 0;
                for (const dbCluster of recentClusters) {
                    // Compare title similarity using the semantic clustering service
                    const titleSim = await title_semantic_clustering_1.default.calculateSimilarity(repTitle, dbCluster.topic);
                    if (titleSim.similarityScore > bestMatchScore && titleSim.similarityScore > 0.75) {
                        bestMatchScore = titleSim.similarityScore;
                        bestMatchCluster = dbCluster;
                    }
                }
                if (bestMatchCluster) {
                    // SIZE CAP: Check target cluster has room for all articles in this title cluster
                    const titleClusterSize = titleCluster.articleIds.length;
                    if (bestMatchCluster.article_count + titleClusterSize > MAX_CLUSTER_ARTICLES) {
                        logger_1.default.info(`[EnhancedClusterNode] Cross-batch dedup: target cluster ${bestMatchCluster.id.slice(0, 8)} would exceed capacity (${bestMatchCluster.article_count}+${titleClusterSize}>${MAX_CLUSTER_ARTICLES}), skipping pre-assignment`);
                    }
                    else {
                        // Pre-assign all articles in this title cluster to the existing DB cluster
                        // by marking them so processArticleEnhanced will find them via the title reverse index
                        for (const articleId of titleCluster.articleIds) {
                            // Store the article-to-cluster mapping so the title reverse index can find it
                            await story_cluster_store_enhanced_1.default.addArticleToCluster(bestMatchCluster.id, articleId, (0, title_cleaner_1.getTitleFingerprint)(repTitle), 0, 'NEUTRAL');
                            crossBatchMerged++;
                        }
                        logger_1.default.info(`[EnhancedClusterNode] Cross-batch dedup: "${repTitle.slice(0, 50)}..." -> existing cluster "${bestMatchCluster.topic.slice(0, 50)}..." (${bestMatchScore.toFixed(2)})`);
                    }
                }
            }
            if (crossBatchMerged > 0) {
                logger_1.default.info(`[EnhancedClusterNode] Cross-batch dedup: pre-assigned ${crossBatchMerged} articles to existing clusters`);
            }
        }
    }
    // ============================================================
    // PHASE 1: Batch AI Labeling
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] PHASE 1: Batch labeling articles...');
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
        // FIX: Always extract entities regardless of AI label quality.
        // Entity extraction is regex-based (fast) and must run on every article
        // so that entity_cluster_links gets populated for future matching.
        let entities = [];
        try {
            const entityResult = await enhanced_entity_extraction_1.default.extractHybrid(article.title, article.content || article.snippet || '', article.id);
            entities = entityResult.entities;
            stats.entitiesExtracted += entities.length;
        }
        catch (e) {
            logger_1.default.warn(`[EnhancedClusterNode] Entity extraction failed for "${article.title.slice(0, 50)}":`, e);
        }
        // Find title cluster membership
        const titleCluster = titleClusters.find(tc => tc.articleIds.includes(article.id));
        if (aiLabel?.topic && aiLabel.topic.length > 5) {
            const validation = validateTopicQuality(aiLabel.topic, article.title);
            if (!validation.valid) {
                logger_1.default.debug(`[EnhancedClusterNode] Rejecting low-quality topic: ${validation.reason}`);
                // FIX: Still add article with entities even if topic is rejected,
                // using a fallback label so entity extraction runs
                processedArticles.push({
                    article,
                    aiLabel: {
                        ...aiLabel,
                        topic: generateFallbackTopic(article.title, article.categories[0] || 'GENERAL'),
                        keywords: extractKeyTerms(article.title),
                        trendDirection: 'NEUTRAL',
                        urgency: 'MEDIUM',
                        subEventType: 'other',
                    },
                    entities,
                    titleClusterId: titleCluster?.id
                });
                continue;
            }
            processedArticles.push({
                article,
                aiLabel,
                entities,
                titleClusterId: titleCluster?.id
            });
        }
        else {
            // FIX: When OpenRouter labeling fails entirely, use fallback label
            // but still process the article with extracted entities
            processedArticles.push({
                article,
                aiLabel: {
                    topic: generateFallbackTopic(article.title, article.categories[0] || 'GENERAL'),
                    keywords: extractKeyTerms(article.title),
                    trendDirection: 'NEUTRAL',
                    urgency: 'MEDIUM',
                    subEventType: 'other',
                },
                entities,
                titleClusterId: titleCluster?.id
            });
        }
    }
    if (processedArticles.length === 0) {
        logger_1.default.warn('[EnhancedClusterNode] All articles failed validation, using fallback');
        return await createFallbackClustering(filteredArticles, stats);
    }
    logger_1.default.info(`[EnhancedClusterNode] Processing ${processedArticles.length} articles with valid labels (${stats.entitiesExtracted} entities)`);
    // ============================================================
    // PHASE 3: Enhanced Parallel Clustering
    // ============================================================
    const knownClusterIds = new Set();
    const missingClusterIds = new Set();
    for (let i = 0; i < processedArticles.length; i += CLUSTER_BATCH_SIZE) {
        const batch = processedArticles.slice(i, i + CLUSTER_BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(({ article, aiLabel, entities, titleClusterId }) => processArticleEnhanced(article, aiLabel, entities, titleClusterId, titleClusters, useVectorMode, knownClusterIds, missingClusterIds, stats)));
        // Aggregate results
        batchResults.forEach(result => {
            if (result.created) {
                stats.newClusters++;
                knownClusterIds.add(result.clusterId);
            }
            else if (result.assigned) {
                stats.existingClusters++;
            }
            if (result.semanticMatch) {
                stats.semanticMatches++;
            }
        });
        logger_1.default.info(`[EnhancedClusterNode] Progress: ${Math.min(i + CLUSTER_BATCH_SIZE, processedArticles.length)}/${processedArticles.length} (${stats.newClusters} new, ${stats.existingClusters} existing, ${stats.semanticMatches} semantic)`);
    }
    // ============================================================
    // PHASE 4: Cross-Category Linking (unchanged)
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] PHASE 4: Creating cross-category links...');
    await createCrossCategoryLinks(processedArticles);
    // ============================================================
    // PHASE 5: Enhanced Cluster Merging
    // FIX: Increased from 50 to 500 clusters to catch more singleton merges
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] PHASE 5: Merging similar clusters...');
    const mergeResult = await mergeSimilarClustersEnhanced(useVectorMode);
    stats.mergedClusters = mergeResult.mergedCount;
    // ============================================================
    // PHASE 5b: NEW — Singleton Re-clustering Pass
    // Explicitly target singleton clusters and try harder to merge them
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] PHASE 5b: Singleton re-clustering pass...');
    const singletonMergeResult = await mergeSingletonClusters();
    stats.mergedClusters += singletonMergeResult.mergedCount;
    // ============================================================
    // PHASE 6-9: Heat History, Predictions, Entities, Events (unchanged)
    // ============================================================
    logger_1.default.info('[EnhancedClusterNode] PHASE 6: Recording heat history...');
    const clusters = await story_cluster_store_enhanced_1.default.getHotClusters(500, CLUSTER_MERGE_HOURS_THRESHOLD);
    for (const cluster of clusters) {
        await story_cluster_store_enhanced_1.default.recordHeatHistory(cluster.id, cluster.heatScore, cluster.articleCount, cluster.uniqueTitleCount || cluster.articleCount);
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
        await story_cluster_store_enhanced_1.default.calculateCompositeRank(cluster.id);
    }
    // Generate predictions
    logger_1.default.info('[EnhancedClusterNode] PHASE 7: Generating heat predictions...');
    const heatHistories = new Map();
    for (const cluster of clusters.slice(0, 100)) {
        const history = await story_cluster_store_enhanced_1.default.getHeatHistory(cluster.id, 48);
        heatHistories.set(cluster.id, history);
    }
    const batchPredictions = heat_predictor_1.default.batchPredict(heatHistories);
    predictions.push(...batchPredictions);
    stats.predictionsGenerated = batchPredictions.length;
    // Get trending entities
    logger_1.default.info('[EnhancedClusterNode] PHASE 8: Calculating trending entities...');
    const trendingEntities = await story_cluster_store_enhanced_1.default.getTrendingEntities(20, 24);
    // Publish events
    logger_1.default.info('[EnhancedClusterNode] PHASE 9: Publishing events...');
    await message_bus_1.messageBus.publish(message_bus_1.Channel.NEWS_CLUSTERED, {
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
        await message_bus_1.messageBus.publish(message_bus_1.Channel.NEWS_ANOMALY, anomaly);
    }
    for (const prediction of predictions.slice(0, 20)) {
        await message_bus_1.messageBus.publish(message_bus_1.Channel.NEWS_PREDICTION, prediction);
    }
    const resultClusters = await story_cluster_store_enhanced_1.default.getHotClusters(50, 24);
    logger_1.default.info(`[EnhancedClusterNode] Clustering complete: ${stats.newClusters} new, ${stats.existingClusters} existing, ${stats.mergedClusters} merged, ${stats.semanticMatches} semantic, ${stats.anomaliesDetected} anomalies, ${stats.predictionsGenerated} predictions`);
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
async function processArticleEnhanced(article, aiLabel, entities, titleClusterId, titleClusters, useVectorMode, knownClusterIds, missingClusterIds, stats) {
    const topic = aiLabel.topic;
    const keywords = aiLabel.keywords || [];
    const topicKey = topic.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 180);
    let assignedClusterId = null;
    let semanticMatch = false;
    // ============================================================
    // FIX 3: Entity-first matching cascade (BEFORE topicKey lookup)
    // Extract entities from the article and find clusters sharing them
    // FIX: Relaxed category requirement — entity match is strong signal, don't require exact category
    // ============================================================
    if (USE_ENHANCED_CLUSTERING && entities.length > 0) {
        const articleEntityNames = entities.map(e => e.normalized || e.name.toLowerCase());
        const entityClusterMap = await story_cluster_store_enhanced_1.default.findClustersByEntities(articleEntityNames);
        if (entityClusterMap.size > 0) {
            const articleEntitySet = new Set(articleEntityNames);
            let bestEntityCluster = null;
            let bestEntityOverlap = 0;
            for (const [clusterId, matchingEntities] of entityClusterMap) {
                // Skip known missing clusters
                if (missingClusterIds.has(clusterId))
                    continue;
                // Skip mega-clusters early — don't waste time scoring them
                const sizeInfo = knownClusterIds.has(clusterId)
                    ? await story_cluster_store_enhanced_1.default.getClusterById(clusterId)
                    : null;
                if (sizeInfo && sizeInfo.article_count >= MAX_CLUSTER_ARTICLES)
                    continue;
                // Calculate Jaccard overlap: intersection / union
                const intersection = [...matchingEntities].filter(e => articleEntitySet.has(e)).length;
                const unionSet = new Set([...articleEntitySet, ...matchingEntities]);
                const jaccard = intersection / unionSet.size;
                if (jaccard > bestEntityOverlap) {
                    bestEntityOverlap = jaccard;
                    bestEntityCluster = clusterId;
                }
            }
            // Size-aware entity overlap threshold:
            // - Small clusters (<50 articles): 0.20 — absorb freely
            // - Medium clusters (50-200): 0.30 — require stronger entity signal
            // - Large clusters (200-500): 0.40 — must share significant entities
            // - Mega clusters (>500): 0.50 — only highly-specific entity matches
            // This prevents catch-all clusters from absorbing every article in their category.
            let entityOverlapThreshold = 0.20;
            if (knownClusterIds.has(bestEntityCluster)) {
                const sizeCheck = await story_cluster_store_enhanced_1.default.getClusterById(bestEntityCluster);
                if (sizeCheck) {
                    const size = sizeCheck.article_count || 0;
                    if (size >= 500)
                        entityOverlapThreshold = 0.50;
                    else if (size >= 200)
                        entityOverlapThreshold = 0.40;
                    else if (size >= 50)
                        entityOverlapThreshold = 0.30;
                }
            }
            if (bestEntityCluster && bestEntityOverlap >= entityOverlapThreshold) {
                // Verify cluster exists — category check relaxed for entity matches
                if (knownClusterIds.has(bestEntityCluster)) {
                    const cluster = await story_cluster_store_enhanced_1.default.getClusterById(bestEntityCluster);
                    // FIX: Allow entity matches across compatible categories (e.g. CRYPTO↔STOCKS for BTC)
                    if (cluster && (cluster.category === article.categories[0] || bestEntityOverlap >= 0.40)) {
                        assignedClusterId = bestEntityCluster;
                        semanticMatch = true;
                        logger_1.default.debug(`[EnhancedClusterNode] Entity-first match: "${article.title.slice(0, 40)}..." -> cluster ${bestEntityCluster.slice(0, 8)}... (overlap: ${bestEntityOverlap.toFixed(2)}, threshold: ${entityOverlapThreshold}, cat: ${cluster.category})`);
                    }
                }
                else if (!missingClusterIds.has(bestEntityCluster)) {
                    const exists = await story_cluster_store_enhanced_1.default.clusterExists(bestEntityCluster);
                    if (exists) {
                        const cluster = await story_cluster_store_enhanced_1.default.getClusterById(bestEntityCluster);
                        if (cluster && (cluster.category === article.categories[0] || bestEntityOverlap >= 0.40)) {
                            assignedClusterId = bestEntityCluster;
                            semanticMatch = true;
                            knownClusterIds.add(bestEntityCluster);
                            logger_1.default.debug(`[EnhancedClusterNode] Entity-first match: "${article.title.slice(0, 40)}..." -> cluster ${bestEntityCluster.slice(0, 8)}... (overlap: ${bestEntityOverlap.toFixed(2)}, threshold: ${entityOverlapThreshold}, cat: ${cluster.category})`);
                        }
                    }
                    else {
                        missingClusterIds.add(bestEntityCluster);
                    }
                }
            }
        }
    }
    // 1. Topic key match (fastest)
    // FIX: Removed category gate — topicKey is a strong dedup signal.
    // Different categories assigning the same topicKey is a categorization error,
    // not a reason to create duplicate clusters. Cross-category dedup is handled later.
    if (topicKey) {
        const existingByTopic = await story_cluster_store_enhanced_1.default.getClusterIdByTopicKey(topicKey);
        if (existingByTopic) {
            assignedClusterId = existingByTopic;
        }
    }
    // 2. NEW: Title cluster match
    if (!assignedClusterId && titleClusterId) {
        // Find if any article in this title cluster is already assigned to a DB cluster
        const titleCluster = titleClusters.find(tc => tc.id === titleClusterId);
        if (titleCluster) {
            // FIX 2: Build a reverse index from article IDs in this title cluster to DB cluster IDs
            // Check each article in the title cluster for an existing cluster assignment
            for (const articleId of titleCluster.articleIds) {
                if (articleId === article.id)
                    continue; // Skip the current article
                const existingClusterId = await story_cluster_store_enhanced_1.default.getClusterIdByArticleId(articleId);
                if (existingClusterId) {
                    // Validate the cluster exists and matches category
                    if (missingClusterIds.has(existingClusterId))
                        continue;
                    if (!knownClusterIds.has(existingClusterId)) {
                        const exists = await story_cluster_store_enhanced_1.default.clusterExists(existingClusterId);
                        if (exists) {
                            knownClusterIds.add(existingClusterId);
                        }
                        else {
                            missingClusterIds.add(existingClusterId);
                            continue;
                        }
                    }
                    const cluster = await story_cluster_store_enhanced_1.default.getClusterById(existingClusterId);
                    if (cluster?.category === article.categories[0]) {
                        assignedClusterId = existingClusterId;
                        logger_1.default.debug(`[EnhancedClusterNode] Title cluster reverse index match: article ${articleId.slice(0, 8)}... -> cluster ${existingClusterId.slice(0, 8)}...`);
                        break;
                    }
                }
            }
        }
    }
    // 3. Vector similarity
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
                    semanticMatch = true;
                }
            }
        }
    }
    // 4. NEW: Semantic similarity fallback
    if (!assignedClusterId && USE_ENHANCED_CLUSTERING) {
        const activeClusters = await story_cluster_store_enhanced_1.default.getHotClusters(100, CLUSTER_MERGE_HOURS_THRESHOLD, article.categories[0]);
        if (activeClusters.length > 0) {
            // Find most similar cluster using enhanced semantic similarity
            let bestMatch = null;
            let bestScore = 0;
            for (const cluster of activeClusters) {
                // Compare article to cluster representative
                const similarity = await semantic_similarity_1.default.calculateSimilarity({ id: article.id, title: article.title, content: article.content || article.snippet }, { id: cluster.id, title: cluster.topic, content: cluster.summary });
                if (similarity.score > bestScore && similarity.score >= SEMANTIC_SIMILARITY_THRESHOLD) {
                    bestScore = similarity.score;
                    bestMatch = cluster;
                }
            }
            if (bestMatch) {
                assignedClusterId = bestMatch.id;
                semanticMatch = true;
                logger_1.default.debug(`[EnhancedClusterNode] Semantic match: "${article.title.slice(0, 40)}..." -> "${bestMatch.topic.slice(0, 40)}..." (${bestScore.toFixed(2)})`);
            }
        }
    }
    // 5. Validate cluster existence
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
    // 6. Keyword similarity fallback
    if (!assignedClusterId) {
        const activeClusters = await story_cluster_store_enhanced_1.default.getHotClusters(200, CLUSTER_MERGE_HOURS_THRESHOLD, article.categories[0]);
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
        // SIZE CAP: Check cluster isn't already at max capacity
        const existingClusterForSize = await story_cluster_store_enhanced_1.default.getClusterById(assignedClusterId);
        if (existingClusterForSize && existingClusterForSize.article_count >= MAX_CLUSTER_ARTICLES) {
            logger_1.default.info(`[EnhancedClusterNode] Cluster ${assignedClusterId.slice(0, 8)} at capacity (${existingClusterForSize.article_count}/${MAX_CLUSTER_ARTICLES}), creating new cluster instead`);
            assignedClusterId = null; // Force new cluster creation
        }
    }
    if (assignedClusterId) {
        // Join existing cluster
        const articleDate = article.publishedAt || new Date();
        const heatDelta = await story_cluster_store_enhanced_1.default.calculateEnhancedHeat(article, new Date(), 10);
        const titleFingerprint = (0, title_cleaner_1.getTitleFingerprint)(article.title);
        await story_cluster_store_enhanced_1.default.addArticleToCluster(assignedClusterId, article.id, titleFingerprint, heatDelta, aiLabel.trendDirection);
        if (useVectorMode) {
            await news_vector_store_1.default.storeArticle(article, assignedClusterId);
        }
        // Link entities to cluster (FIX 8: filtered by relevance to prevent gravity wells)
        const existingCluster = await story_cluster_store_enhanced_1.default.getClusterById(assignedClusterId);
        const clusterTopic = existingCluster?.topic || '';
        const clusterKeywords = existingCluster?.keywords || [];
        for (const entity of entities) {
            try {
                const entityId = await story_cluster_store_enhanced_1.default.findOrCreateEntity(entity.name, entity.type);
                await story_cluster_store_enhanced_1.default.linkEntityToArticle(entityId, article.id, entity.confidence);
                // Only link entity to cluster if it's relevant to the cluster topic/keywords
                if (isEntityRelevantToCluster(entity.name, entity.normalized || entity.name.toLowerCase(), clusterTopic, clusterKeywords)) {
                    await story_cluster_store_enhanced_1.default.updateEntityClusterHeat(entityId, assignedClusterId, heatDelta * 0.1);
                }
            }
            catch (e) {
                logger_1.default.warn(`[EnhancedClusterNode] Entity linking failed: ${entity.name} -> ${assignedClusterId.slice(0, 8)}`, e);
            }
        }
        finalClusterId = assignedClusterId;
    }
    else {
        // FIX 6: Anti-spam dedup - check for recent cluster with same primary entity
        if (entities.length > 0) {
            // Find the primary entity (highest confidence TOKEN or ORGANIZATION)
            const primaryEntities = entities
                .filter(e => e.type === 'TOKEN' || e.type === 'ORGANIZATION' || e.type === 'GOVERNMENT_BODY')
                .sort((a, b) => b.confidence - a.confidence);
            if (primaryEntities.length > 0) {
                const primaryEntity = primaryEntities[0];
                const recentClusters = await story_cluster_store_enhanced_1.default.findRecentClustersByPrimaryEntity(primaryEntity.normalized || primaryEntity.name, ANTI_SPAM_HOURS, // Extended from 2 hours to 48 for better cross-run dedup
                article.categories[0]);
                if (recentClusters.length > 0) {
                    // Merge into the most recent/highest-heat cluster instead of creating new
                    const target = recentClusters[0];
                    // SIZE CAP: Check target cluster isn't at max capacity
                    if (target.article_count >= MAX_CLUSTER_ARTICLES) {
                        logger_1.default.info(`[EnhancedClusterNode] Anti-spam target cluster ${target.id.slice(0, 8)} at capacity (${target.article_count}/${MAX_CLUSTER_ARTICLES}), creating new cluster instead`);
                        // Fall through to create new cluster below
                    }
                    else {
                        logger_1.default.info(`[EnhancedClusterNode] Anti-spam: merging into existing cluster "${target.topic.slice(0, 40)}..." (primary entity: ${primaryEntity.name})`);
                        const heatDelta = await story_cluster_store_enhanced_1.default.calculateEnhancedHeat(article, new Date(), 10);
                        const titleFingerprint = (0, title_cleaner_1.getTitleFingerprint)(article.title);
                        await story_cluster_store_enhanced_1.default.addArticleToCluster(target.id, article.id, titleFingerprint, heatDelta, aiLabel.trendDirection);
                        if (useVectorMode) {
                            await news_vector_store_1.default.storeArticle(article, target.id);
                        }
                        // Link entities (FIX 8: filtered by relevance)
                        for (const entity of entities) {
                            try {
                                const entityId = await story_cluster_store_enhanced_1.default.findOrCreateEntity(entity.name, entity.type);
                                await story_cluster_store_enhanced_1.default.linkEntityToArticle(entityId, article.id, entity.confidence);
                                if (isEntityRelevantToCluster(entity.name, entity.normalized || entity.name.toLowerCase(), target.topic, target.keywords || [])) {
                                    await story_cluster_store_enhanced_1.default.updateEntityClusterHeat(entityId, target.id, heatDelta * 0.1);
                                }
                            }
                            catch (e) {
                                logger_1.default.warn(`[EnhancedClusterNode] Anti-spam entity linking failed: ${entity.name} -> ${target.id.slice(0, 8)}`, e);
                            }
                        }
                        return { clusterId: target.id, created: false, assigned: true, semanticMatch: false };
                    }
                }
            }
        }
        // Create new cluster
        const newClusterId = crypto_1.default.randomUUID();
        const articleDate = article.publishedAt || new Date();
        const initialHeat = await story_cluster_store_enhanced_1.default.calculateEnhancedHeat(article, new Date(), 10);
        const formattedTopic = (0, human_title_formatter_1.validateAndFormatTopic)(topic, article.title);
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
        // Link entities to cluster (FIX 8: filtered by relevance — for new clusters, all entities from the article ARE relevant since topic was generated from the article)
        for (const entity of entities) {
            try {
                const entityId = await story_cluster_store_enhanced_1.default.findOrCreateEntity(entity.name, entity.type);
                await story_cluster_store_enhanced_1.default.linkEntityToArticle(entityId, article.id, entity.confidence);
                // For NEW clusters, entity relevance is implicit (topic derived from article)
                // but still apply the filter to prevent noise entities (LOCATION, DATE) from accumulating
                if (entity.type === 'TOKEN' || entity.type === 'ORGANIZATION' || entity.type === 'GOVERNMENT_BODY' ||
                    entity.type === 'PROTOCOL' || entity.type === 'PERSON') {
                    await story_cluster_store_enhanced_1.default.updateEntityClusterHeat(entityId, newClusterId, initialHeat * 0.1);
                }
            }
            catch (e) {
                logger_1.default.warn(`[EnhancedClusterNode] New cluster entity linking failed: ${entity.name} -> ${newClusterId.slice(0, 8)}`, e);
            }
        }
        created = true;
        finalClusterId = newClusterId;
        knownClusterIds.add(newClusterId);
    }
    return { clusterId: finalClusterId, created, assigned: !created, semanticMatch };
}
/**
 * PHASE 4: Create cross-category links between clusters that share entities
 * but live in different categories (e.g., "Bitcoin" in CRYPTO + "Fed rate" in ECONOMICS).
 * Uses entity_cluster_links table directly instead of topic_key lookup (which was broken).
 */
async function createCrossCategoryLinks(_processedArticles) {
    try {
        // Find cluster pairs that share entities across category boundaries
        const pairs = await story_cluster_store_enhanced_1.default.getCrossCategoryEntityPairs(CLUSTER_MERGE_HOURS_THRESHOLD);
        if (pairs.length === 0) {
            logger_1.default.info('[EnhancedClusterNode] PHASE 4: No cross-category entity bridges found');
            return;
        }
        let crossRefCount = 0;
        for (const pair of pairs) {
            // Higher confidence for pairs sharing multiple entities
            const confidence = Math.min(0.9, 0.5 + pair.sharedEntityCount * 0.1);
            await story_cluster_store_enhanced_1.default.createCrossRef(pair.sourceClusterId, pair.targetClusterId, 'RELATED', confidence);
            crossRefCount++;
        }
        logger_1.default.info(`[EnhancedClusterNode] Created ${crossRefCount} cross-category entity links`);
    }
    catch (error) {
        logger_1.default.error('[EnhancedClusterNode] PHASE 4 cross-category linking failed:', error);
    }
}
/**
 * Enhanced cluster merging with entity similarity
 */
async function mergeSimilarClustersEnhanced(useVectorMode) {
    const hotClusters = await story_cluster_store_enhanced_1.default.getHotClusters(500, CLUSTER_MERGE_HOURS_THRESHOLD);
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
                const similarity = await calculateEnhancedSimilarityAsync(c1, c2);
                if (similarity.similarity >= CLUSTER_MERGE_SIMILARITY_THRESHOLD) {
                    const target = c1.heatScore >= c2.heatScore ? c1 : c2;
                    const source = c1.heatScore >= c2.heatScore ? c2 : c1;
                    // SIZE CAP: Don't merge if target would exceed max articles
                    if (target.article_count + source.article_count > MAX_CLUSTER_ARTICLES) {
                        logger_1.default.debug(`[EnhancedClusterNode] Skipping merge: would exceed capacity (${target.article_count}+${source.article_count}>${MAX_CLUSTER_ARTICLES})`);
                        continue;
                    }
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
 * PHASE 5b: Singleton Re-clustering (Inverted Index)
 * Uses keyword and entity inverted indexes for O(n) lookup instead of O(n*m) brute force.
 * Processes ALL singletons within the merge window, not just top-200 by heat.
 */
async function mergeSingletonClusters() {
    // Fetch ALL recent singletons — not heat-ranked, just all of them
    const singletons = await story_cluster_store_enhanced_1.default.getRecentSingletons(CLUSTER_MERGE_HOURS_THRESHOLD, 1000);
    if (singletons.length === 0) {
        return { mergedCount: 0 };
    }
    // Get all multi-article clusters as merge targets
    const allClusters = await story_cluster_store_enhanced_1.default.getHotClusters(500, CLUSTER_MERGE_HOURS_THRESHOLD);
    const mergeTargets = allClusters.filter(c => c.articleCount >= 2);
    if (mergeTargets.length === 0) {
        logger_1.default.info('[EnhancedClusterNode] PHASE 5b: No multi-article clusters to merge into');
        return { mergedCount: 0 };
    }
    logger_1.default.info(`[EnhancedClusterNode] PHASE 5b: Found ${singletons.length} singletons, ${mergeTargets.length} merge targets (inverted index mode)`);
    // Crypto token alias map for better matching
    const TOKEN_ALIASES = new Map([
        ['btc', 'bitcoin'], ['eth', 'ethereum'], ['sol', 'solana'], ['bnb', 'binance'],
        ['xrp', 'ripple'], ['ada', 'cardano'], ['doge', 'dogecoin'], ['shib', 'shiba inu'],
        ['avax', 'avalanche'], ['matic', 'polygon'], ['dot', 'polkadot'], ['link', 'chainlink'],
        ['uni', 'uniswap'], ['ftm', 'fantom'], ['arb', 'arbitrum'], ['op', 'optimism'],
        ['near', 'near protocol'], ['atom', 'cosmos'], ['trx', 'tron'], ['xlm', 'stellar'],
        ['algo', 'algorand'], ['inj', 'injective'], ['tia', 'celestia'], ['jup', 'jupiter'],
        ['sui', 'sui'], ['sei', 'sei'], ['ton', 'ton'], ['apt', 'aptos'],
        ['pepe', 'pepeto'], ['pepeto', 'pepe'], ['far', 'fartcoin'], ['fartcoin', 'far'],
        ['wif', 'dogwifhat'], ['pengu', 'pudgy penguins'], ['trump', 'maga'],
    ]);
    const resolveToken = (s) => TOKEN_ALIASES.get(s.toLowerCase()) || s.toLowerCase();
    // === BUILD INVERTED INDEXES for merge targets ===
    // keyword → set of target cluster indices
    const kwIndex = new Map();
    // entity → set of target cluster indices  
    const entityIndex = new Map();
    // category → set of target cluster indices
    const catIndex = new Map();
    // topic words (4+ chars) → set of target cluster indices
    const topicWordIndex = new Map();
    const targetData = mergeTargets.map((t, idx) => {
        const entities = extractEntitiesFromTopicAndKeywords(t.topic || '', t.keywords || []);
        const entitySet = new Set(entities.map(resolveToken));
        const kws = (t.keywords || []).map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const kwSet = new Set(kws.filter((k) => k.length >= 3));
        const cat = t.category || 'UNKNOWN';
        const words = (t.topic || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        for (const kw of kwSet) {
            if (!kwIndex.has(kw))
                kwIndex.set(kw, new Set());
            kwIndex.get(kw).add(idx);
        }
        for (const e of entitySet) {
            if (!entityIndex.has(e))
                entityIndex.set(e, new Set());
            entityIndex.get(e).add(idx);
        }
        if (!catIndex.has(cat))
            catIndex.set(cat, new Set());
        catIndex.get(cat).add(idx);
        for (const w of words) {
            if (!topicWordIndex.has(w))
                topicWordIndex.set(w, new Set());
            topicWordIndex.get(w).add(idx);
        }
        return { cluster: t, entitySet, kwSet, words: new Set(words) };
    });
    // Pre-compute which targets have been merged away
    const mergedAway = new Set();
    let mergedCount = 0;
    for (const singleton of singletons) {
        if (mergedAway.has(singleton.id))
            continue;
        // Extract singleton entities and keywords
        const sEntities = extractEntitiesFromTopicAndKeywords(singleton.topic || '', singleton.keywords || []);
        const sEntitySet = new Set(sEntities.map(resolveToken));
        const sKws = new Set((singleton.keywords || []).map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, '')).filter((k) => k.length >= 3));
        const sCat = singleton.category || 'UNKNOWN';
        const sWords = new Set((singleton.topic || '').toLowerCase().split(/\s+/).filter((w) => w.length > 3));
        // === Inverted index lookup: find candidate targets efficiently ===
        const candidateIdx = new Set();
        // Entity matches (strongest signal)
        for (const e of sEntitySet) {
            const idxs = entityIndex.get(e);
            if (idxs)
                for (const i of idxs)
                    candidateIdx.add(i);
        }
        // Keyword matches
        for (const kw of sKws) {
            const idxs = kwIndex.get(kw);
            if (idxs)
                for (const i of idxs)
                    candidateIdx.add(i);
        }
        // If no candidates from entities/keywords, try topic word overlap
        if (candidateIdx.size === 0) {
            for (const w of sWords) {
                const idxs = topicWordIndex.get(w);
                if (idxs)
                    for (const i of idxs)
                        candidateIdx.add(i);
            }
        }
        if (candidateIdx.size === 0)
            continue;
        // Score candidates
        let bestTarget = null;
        let bestScore = 0;
        for (const idx of candidateIdx) {
            const td = targetData[idx];
            if (td.cluster.id === singleton.id)
                continue;
            if (mergedAway.has(td.cluster.id))
                continue;
            // Entity overlap score
            const sharedEntities = [...sEntitySet].filter(e => td.entitySet.has(e) && e.length >= 2);
            let score = 0;
            if (sharedEntities.length >= 1) {
                score = Math.min(0.55, 0.30 + sharedEntities.length * 0.10);
                if (sCat === td.cluster.category)
                    score += 0.05;
            }
            else {
                // Keyword overlap
                const sharedKw = [...sKws].filter(k => td.kwSet.has(k));
                if (sharedKw.length >= 2) {
                    score = 0.32 + sharedKw.length * 0.04;
                    if (sCat === td.cluster.category)
                        score += 0.05;
                }
                else if (sharedKw.length === 1) {
                    score = 0.25;
                    if (sCat === td.cluster.category)
                        score += 0.05;
                }
                else {
                    // Topic word overlap only
                    const sharedWords = [...sWords].filter(w => td.words.has(w));
                    if (sharedWords.length >= 3) {
                        score = 0.20;
                    }
                    else if (sharedWords.length >= 2 && sCat === td.cluster.category) {
                        score = 0.19;
                    }
                    else {
                        continue; // Not enough signal
                    }
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestTarget = td.cluster;
            }
        }
        // Threshold: 0.18 for entity matches, 0.22 for keyword-only (stricter to avoid false merges)
        const entityThreshold = 0.18;
        const kwThreshold = 0.22;
        const threshold = bestScore >= 0.30 ? entityThreshold : kwThreshold;
        // Skip mega-clusters — don't feed them more articles
        if (bestTarget && bestTarget.article_count >= MAX_CLUSTER_ARTICLES) {
            continue;
        }
        if (bestTarget && bestScore >= threshold) {
            if (!(await story_cluster_store_enhanced_1.default.clusterExists(singleton.id)) ||
                !(await story_cluster_store_enhanced_1.default.clusterExists(bestTarget.id))) {
                continue;
            }
            const result = await story_cluster_store_enhanced_1.default.mergeClusters(bestTarget.id, singleton.id);
            if (result.moved > 0) {
                mergedCount++;
                mergedAway.add(singleton.id);
                // Hierarchy is now created inside mergeClusters before the source is deleted
            }
        }
    }
    if (mergedCount > 0) {
        logger_1.default.info(`[EnhancedClusterNode] PHASE 5b: Merged ${mergedCount}/${singletons.length} singleton clusters (inverted index)`);
    }
    return { mergedCount };
}
/**
 * Calculate enhanced cluster similarity with entity overlap
 * FIX 4: Replaced hardcoded entitySimilarity: 0 with actual Jaccard overlap
 * FIX 5: Reweighted to use entity (0.4), topic (0.3), keywords (0.3)
 * FIX 7: Fallback entity extraction from topic/keywords when DB entity_cluster_links is empty
 *        (only 86/3075 clusters have entity links — 97% were scoring 0 on the entity dimension)
 */
/**
 * FIX 8: Entity Relevance Filter — prevents gravity well super-clusters.
 * Only link entities to a cluster if the entity name appears in the cluster's
 * topic or keywords. This stops clusters from accumulating every common entity
 * (Bitcoin, Nvidia, Interest Rate) and then matching everything new.
 */
function isEntityRelevantToCluster(entityName, normalizedEntity, clusterTopic, clusterKeywords) {
    if (!clusterTopic && (!clusterKeywords || clusterKeywords.length === 0))
        return true; // No topic = no filter
    const topicLower = (clusterTopic || '').toLowerCase();
    const entityLower = normalizedEntity || entityName.toLowerCase();
    // Check if entity name appears in topic
    if (entityLower.length >= ENTITY_RELEVANCE_MIN_MATCH && topicLower.includes(entityLower)) {
        return true;
    }
    // Check if entity name appears in any keyword
    if (clusterKeywords && clusterKeywords.length > 0) {
        for (const kw of clusterKeywords) {
            if (kw.toLowerCase().includes(entityLower) || entityLower.includes(kw.toLowerCase())) {
                return true;
            }
        }
    }
    // Check if any significant word of the entity name (4+ chars) appears in the topic
    const entityWords = entityLower.split(/[\s_\-]+/).filter(w => w.length >= 4);
    for (const word of entityWords) {
        if (topicLower.includes(word))
            return true;
    }
    // TOKEN entities with short names (BTC, ETH, SOL etc) — always allow for CRYPTO clusters
    // since these are the primary identifiers of crypto news
    if (entityLower.length <= 4 && /^[a-z]+$/.test(entityLower)) {
        if (topicLower.includes('crypto') || topicLower.includes('bitcoin') ||
            topicLower.includes('ethereum') || topicLower.includes('token') ||
            topicLower.includes('defi') || topicLower.includes('nft') ||
            topicLower.includes('blockchain')) {
            return true;
        }
    }
    return false;
}
function extractEntitiesFromTopicAndKeywords(topic, keywords) {
    const entities = [];
    // Match known organizations, institutions, and economic entities
    const orgPattern = /\b((?:jpmorgan|goldman|morgan stanley|blackrock|fidelity|binance|coinbase|kraken|openai|google|meta|apple|microsoft|amazon|nvidia|tesla|federal reserve|fed|sec|cftc|imf|world bank|ecb|boj|pboc|trump administration|white house|congress|senate|supreme court|opec|china|russia|iran|ukraine|israel|treasury|dollar|eu|europe|dow jones|s&p|nasdaq|ftse|dax|nikkei|hang seng))\b/gi;
    const orgMatches = topic.match(orgPattern);
    if (orgMatches) {
        for (const m of orgMatches)
            entities.push(m.toLowerCase());
    }
    // Match known commodities and precious metals
    const commodityPattern = /\b((?:gold|silver|copper|platinum|palladium|oil|crude|natural gas|uranium|lithium|cobalt|nickel|bitcoin|ethereum|solana|btc|eth))\b/gi;
    const commodityMatches = topic.match(commodityPattern);
    if (commodityMatches) {
        for (const m of commodityMatches)
            entities.push(m.toLowerCase());
    }
    // Match economic concepts and policy terms (strong merge signal for Economics)
    const econConceptPattern = /\b((?:inflation|deflation|gdp|recession|tariff|sanctions|interest rate|mortgage|yield curve|bond market|stimulus|quantitative easing|rate cut|rate hike|fomc|monetary policy|fiscal policy|trade war|currency war))\b/gi;
    const econMatches = topic.match(econConceptPattern);
    if (econMatches) {
        for (const m of econMatches)
            entities.push(m.toLowerCase());
    }
    // Match key economic figures (Powell, Yellen, Bessent, Lagarde, etc.)
    const econFigurePattern = /\b((?:Powell|Yellen|Bessent|Lagarde|Kuroda|Mishkin|Bernanke|Greenspan))\b/g;
    const econFigureMatches = topic.match(econFigurePattern);
    if (econFigureMatches) {
        for (const m of econFigureMatches)
            entities.push(m.toLowerCase());
    }
    // Extract proper nouns from topic (capitalized words, 2+ chars)
    const properNouns = topic.match(/\b[A-Z][a-z]{2,}\b/g) || [];
    const stopwords = new Set(['this', 'that', 'with', 'from', 'after', 'while', 'when', 'where', 'what', 'which', 'their', 'there', 'they', 'these', 'those', 'than', 'into', 'over', 'under', 'before', 'about', 'between', 'during', 'without', 'within', 'through', 'against', 'first', 'last', 'next', 'best', 'worst', 'some', 'many', 'much', 'more', 'most', 'less', 'very', 'just', 'also', 'even', 'still', 'only', 'then', 'each', 'every', 'both', 'other', 'such', 'being', 'have', 'will', 'would', 'could', 'should', 'might', 'shall', 'can', 'need', 'must', 'news', 'crypto', 'update', 'updates', 'new', 'latest', 'daily', 'weekly', 'what', ' analysts', ' experts', 'powell', 'yellen', 'bessent', 'lagarde', 'kuroda', 'mishkin', 'bernanke', 'greenspan', 'analysis', 'depth', 'rising', 'bullish', 'bearish', 'surge', 'crash', 'slips', 'ahead', 'impact', 'market', 'trends', 'investors', 'headlines', 'central', 'banks', 'face', 'policy', 'trap', 'rate', 'move', 'mortgage', 'interest', 'rates', 'expect', 'remainder', 'price', 'volatile', 'expanded', 'track', 'finally', 'predicts', 'growth', 'easing', 'cycle', 'ended', 'tour', 'statistical', 'agency', 'hiring', 'inflation', 'data', 'decision', 'safe', 'haven', 'jones', 'europe']);
    for (const pn of properNouns) {
        const lower = pn.toLowerCase();
        if (!stopwords.has(lower)) {
            entities.push(lower);
        }
    }
    // Extract keywords as entities (they're already uppercase topic words)
    for (const kw of (keywords || [])) {
        const lower = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (lower.length > 2) {
            entities.push(lower);
        }
    }
    // Deduplicate
    return [...new Set(entities)];
}
async function calculateEnhancedSimilarityAsync(c1, c2) {
    // FIX 4: Fetch entity sets for both clusters and compute Jaccard overlap
    let entities1 = await story_cluster_store_enhanced_1.default.getClusterEntities(c1.id);
    let entities2 = await story_cluster_store_enhanced_1.default.getClusterEntities(c2.id);
    // FIX 7: If DB entities are empty (97% of clusters!), extract from topic/keywords
    const hasDbEntities = entities1.length > 0 || entities2.length > 0;
    if (!hasDbEntities) {
        entities1 = extractEntitiesFromTopicAndKeywords(c1.topic || '', c1.keywords || []);
        entities2 = extractEntitiesFromTopicAndKeywords(c2.topic || '', c2.keywords || []);
    }
    let entityJaccard = 0;
    if (entities1.length > 0 && entities2.length > 0) {
        const set1 = new Set(entities1);
        const set2 = new Set(entities2);
        const intersection = [...set1].filter(e => set2.has(e)).length;
        const union = new Set([...set1, ...set2]);
        entityJaccard = intersection / union.size;
    }
    // Topic word overlap (Jaccard)
    const t1Words = new Set(c1.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const t2Words = new Set(c2.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
    const topicIntersect = [...t1Words].filter(w => t2Words.has(w));
    const topicUnion = new Set([...t1Words, ...t2Words]);
    const topicSim = topicUnion.size > 0 ? topicIntersect.length / topicUnion.size : 0;
    // Keyword overlap (Jaccard)
    const k1Words = new Set((c1.keywords || []).map((k) => k.toLowerCase()));
    const k2Words = new Set((c2.keywords || []).map((k) => k.toLowerCase()));
    const kIntersect = [...k1Words].filter(k => k2Words.has(k));
    const kUnion = new Set([...k1Words, ...k2Words]);
    const keywordSim = kUnion.size > 0 ? kIntersect.length / kUnion.size : 0;
    // Sub-event type match (bonus)
    const subEventBonus = (c1.subEventType && c2.subEventType && c1.subEventType === c2.subEventType) ? 0.05 : 0;
    // FIX 5+7: Weighted combination with dynamic weight redistribution
    // When DB entities are missing, fallback entities fill the gap, so keep entity weight.
    // But if entities are still empty after fallback, redistribute to topic+keyword.
    let entityWeight = 0.4;
    let topicWeight = 0.3;
    let keywordWeight = 0.3;
    if (entityJaccard === 0) {
        // No entities available — shift weight to topic and keywords
        entityWeight = 0;
        topicWeight = 0.5;
        keywordWeight = 0.5;
    }
    const similarity = Math.min(1, entityJaccard * entityWeight + topicSim * topicWeight + keywordSim * keywordWeight + subEventBonus);
    return {
        cluster1Id: c1.id,
        cluster2Id: c2.id,
        similarity,
        topicSimilarity: topicSim,
        keywordSimilarity: keywordSim,
        entitySimilarity: entityJaccard,
        category: c1.category,
        shouldMerge: similarity >= CLUSTER_MERGE_SIMILARITY_THRESHOLD,
        mergeReason: similarity >= CLUSTER_MERGE_SIMILARITY_THRESHOLD ?
            `Weighted similarity ${similarity.toFixed(2)} (entity: ${entityJaccard.toFixed(2)}, topic: ${topicSim.toFixed(2)}, kw: ${keywordSim.toFixed(2)})` : ''
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
    return { valid: true, reason: 'Valid' };
}
/**
 * Calculate keyword similarity
 */
function calculateKeywordSimilarity(article, cluster) {
    const articleTags = new Set(article.tags.map(t => t.toLowerCase()));
    const clusterTags = new Set((cluster.keywords || []).map((t) => t.toLowerCase()));
    article.title.toLowerCase().split(/\s+/).forEach((w) => {
        if (w.length > 3)
            articleTags.add(w);
    });
    cluster.topic.toLowerCase().split(/\s+/).forEach((w) => {
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
            // FIX: Extract and persist entities even in fallback path
            for (const art of similarArticles) {
                try {
                    const entityResult = await enhanced_entity_extraction_1.default.extractHybrid(art.title, art.content || art.snippet || '', art.id);
                    for (const entity of entityResult.entities) {
                        const entityId = await story_cluster_store_enhanced_1.default.findOrCreateEntity(entity.name, entity.type);
                        await story_cluster_store_enhanced_1.default.linkEntityToArticle(entityId, art.id, entity.confidence);
                        await story_cluster_store_enhanced_1.default.updateEntityClusterHeat(entityId, newClusterId, 1.0);
                    }
                }
                catch (e) {
                    logger_1.default.warn(`[EnhancedClusterNode] Fallback entity extraction failed for ${art.id.slice(0, 8)}`, e);
                }
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
// NEW: Semantic similarity threshold
const SEMANTIC_SIMILARITY_THRESHOLD = 0.45; // Lowered from 0.65 — more aggressive semantic merging
exports.default = enhancedStoryClusterNode;
//# sourceMappingURL=enhanced-story-cluster-node.js.map