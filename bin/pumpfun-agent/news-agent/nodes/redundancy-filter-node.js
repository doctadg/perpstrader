"use strict";
// Redundancy Filter Node
// Removes duplicate and near-duplicate articles using vector similarity
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redundancyFilterNode = redundancyFilterNode;
exports.calculateArticleSimilarity = calculateArticleSimilarity;
exports.areDuplicates = areDuplicates;
const logger_1 = __importDefault(require("../../shared/logger"));
const news_vector_store_1 = __importDefault(require("../../data/news-vector-store"));
/**
 * Similarity threshold for considering articles as duplicates
 * 0.85 = 85% similarity means they're essentially the same content
 */
const DUPLICATE_THRESHOLD = 0.85;
/**
 * Maximum number of articles on the same topic to keep
 */
const MAX_PER_TOPIC = 5;
/**
 * Redundancy Filter Node
 * Removes near-duplicate articles using vector similarity
 */
async function redundancyFilterNode(state) {
    const startTime = Date.now();
    logger_1.default.info(`[RedundancyFilterNode] Starting redundancy filter for ${state.labeledArticles.length} articles`);
    if (state.labeledArticles.length === 0) {
        return {
            currentStep: 'REDUNDANCY_FILTER_COMPLETE',
            labeledArticles: [],
            thoughts: [...state.thoughts, 'No articles to filter for redundancy'],
        };
    }
    const uniqueArticles = [];
    const seenFingerprints = new Set();
    const topicCounts = new Map();
    let duplicatesRemoved = 0;
    for (const article of state.labeledArticles) {
        try {
            // Step 1: Title-based deduplication (fast)
            const titleFingerprint = getTitleFingerprint(article.title);
            if (seenFingerprints.has(titleFingerprint)) {
                duplicatesRemoved++;
                logger_1.default.debug(`[RedundancyFilterNode] Duplicate title: "${article.title}"`);
                continue;
            }
            // Step 2: Topic count limiting (prevent spam on same topic)
            const topicKey = article.topic.toLowerCase().replace(/\s+/g, ' ');
            const topicCount = topicCounts.get(topicKey) || 0;
            if (topicCount >= MAX_PER_TOPIC) {
                duplicatesRemoved++;
                logger_1.default.debug(`[RedundancyFilterNode] Too many articles on topic: "${article.topic}" (${topicCount}/${MAX_PER_TOPIC})`);
                continue;
            }
            // Step 3: Vector similarity check (if vector store is available)
            let isSimilar = false;
            try {
                const similar = await news_vector_store_1.default.findSimilarArticles(article.title + ' ' + (article.content?.slice(0, 500) || article.snippet), 1, DUPLICATE_THRESHOLD);
                if (similar && similar.length > 0) {
                    const existingFingerprints = new Set(uniqueArticles.map(a => getTitleFingerprint(a.title)));
                    for (const sim of similar) {
                        if (existingFingerprints.has(getTitleFingerprint(sim.title || ''))) {
                            isSimilar = true;
                            duplicatesRemoved++;
                            logger_1.default.debug(`[RedundancyFilterNode] Similar article found: "${article.title}"`);
                            break;
                        }
                    }
                }
            }
            catch (vectorError) {
                logger_1.default.debug(`[RedundancyFilterNode] Vector check failed: ${vectorError}`);
                // Continue without vector check
            }
            if (!isSimilar) {
                uniqueArticles.push(article);
                seenFingerprints.add(titleFingerprint);
                topicCounts.set(topicKey, topicCount + 1);
            }
        }
        catch (error) {
            logger_1.default.debug(`[RedundancyFilterNode] Error processing article: ${error}`);
            // On error, include the article
            uniqueArticles.push(article);
        }
    }
    const elapsed = Date.now() - startTime;
    logger_1.default.info(`[RedundancyFilterNode] Completed in ${elapsed}ms. ` +
        `Kept: ${uniqueArticles.length}/${state.labeledArticles.length}, Removed: ${duplicatesRemoved}`);
    return {
        currentStep: 'REDUNDANCY_FILTER_COMPLETE',
        labeledArticles: uniqueArticles,
        stats: {
            ...state.stats,
            filteredRedundant: duplicatesRemoved,
        },
        thoughts: [
            ...state.thoughts,
            `Redundancy filter: ${uniqueArticles.length} unique articles, ${duplicatesRemoved} duplicates removed`,
        ],
    };
}
/**
 * Generate a fingerprint for deduplication
 * Normalizes title for comparison
 */
function getTitleFingerprint(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove special chars
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
}
/**
 * Calculate similarity between two articles based on title and content
 * Returns 0-1 score where 1 is identical
 */
function calculateArticleSimilarity(article1, article2) {
    // Title similarity (weighted more heavily)
    const titleSimilarity = stringSimilarity(article1.title, article2.title);
    // Content similarity (if available)
    let contentSimilarity = 0;
    if (article1.content && article2.content) {
        const content1 = article1.content.slice(0, 500); // Compare first 500 chars
        const content2 = article2.content.slice(0, 500);
        contentSimilarity = stringSimilarity(content1, content2);
    }
    // Weighted combination: 70% title, 30% content
    return titleSimilarity * 0.7 + contentSimilarity * 0.3;
}
/**
 * Calculate similarity between two strings using Jaccard similarity
 */
function stringSimilarity(str1, str2) {
    const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const words1 = new Set(normalize(str1));
    const words2 = new Set(normalize(str2));
    if (words1.size === 0 && words2.size === 0)
        return 1;
    if (words1.size === 0 || words2.size === 0)
        return 0;
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return union.size > 0 ? intersection.size / union.size : 0;
}
/**
 * Check if two articles are considered duplicates
 */
function areDuplicates(article1, article2) {
    return calculateArticleSimilarity(article1, article2) >= DUPLICATE_THRESHOLD;
}
//# sourceMappingURL=redundancy-filter-node.js.map