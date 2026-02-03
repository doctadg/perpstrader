"use strict";
// Store Node
// Stores categorized news articles in the news database
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeNode = storeNode;
const news_store_1 = __importDefault(require("../../data/news-store"));
const logger_1 = __importDefault(require("../../shared/logger"));
async function storeNode(state) {
    logger_1.default.info(`[StoreNode] Storing ${state.categorizedNews.length} articles in news store`);
    if (state.categorizedNews.length === 0) {
        return {
            currentStep: 'STORE_SKIPPED',
            stats: {
                ...state.stats,
                totalStored: 0,
                totalDuplicates: 0,
            },
            thoughts: [...state.thoughts, 'No articles to store'],
        };
    }
    try {
        const { stored, duplicates } = await news_store_1.default.storeNews(state.categorizedNews);
        logger_1.default.info(`[StoreNode] Stored ${stored.length} articles, skipped ${duplicates.length} duplicates`);
        const storedSet = new Set(stored);
        const storedArticles = state.categorizedNews.filter(article => storedSet.has(article.id));
        return {
            currentStep: 'STORE_COMPLETE',
            categorizedNews: storedArticles,
            storedCount: stored.length,
            duplicateCount: duplicates.length,
            stats: {
                ...state.stats,
                totalStored: stored.length,
                totalDuplicates: duplicates.length,
            },
            thoughts: [
                ...state.thoughts,
                `Stored ${stored.length} new articles in news database`,
                duplicates.length > 0 ? `Skipped ${duplicates.length} duplicate URLs` : '',
            ].filter(Boolean),
        };
    }
    catch (error) {
        logger_1.default.error('[StoreNode] Failed to store news:', error);
        return {
            currentStep: 'STORE_ERROR',
            errors: [
                ...state.errors,
                `Store failed: ${error}`,
            ],
        };
    }
}
//# sourceMappingURL=store-node.js.map