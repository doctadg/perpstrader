"use strict";
// Search Node
// Searches for news across all categories
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchNode = searchNode;
const news_search_1 = __importDefault(require("../../news-ingester/news-search"));
const logger_1 = __importDefault(require("../../shared/logger"));
async function searchNode(state) {
    logger_1.default.info('[SearchNode] Starting news search across all categories');
    try {
        const categories = state.categories.length > 0 ? state.categories : news_search_1.default.getAvailableCategories();
        const searchResults = await news_search_1.default.searchAllCategories(categories);
        let totalFound = 0;
        const rawNews = [];
        for (const [category, results] of searchResults.entries()) {
            for (const result of results) {
                if (!result.link)
                    continue;
                const title = result.title || result.link || 'Untitled';
                const snippet = result.snippet || (result.content ? result.content.slice(0, 200) : '');
                let source = 'unknown';
                try {
                    source = new URL(result.link).hostname;
                }
                catch (error) {
                    logger_1.default.debug(`[SearchNode] Failed to parse source for ${result.link}`);
                }
                rawNews.push({
                    id: crypto.randomUUID(),
                    title,
                    content: result.content,
                    source,
                    url: result.link,
                    publishedAt: result.date ? new Date(result.date) : new Date(),
                    categories: [category],
                    tags: [],
                    sentiment: 'NEUTRAL',
                    importance: 'MEDIUM',
                    snippet,
                    scrapedAt: new Date(),
                    createdAt: new Date(),
                });
            }
            totalFound += results.length;
            logger_1.default.info(`[SearchNode] ${category}: Found ${results.length} results`);
        }
        const byCategory = {
            ...state.stats.byCategory,
        };
        for (const category of categories) {
            byCategory[category] = searchResults.get(category)?.length || 0;
        }
        const queryPlan = news_search_1.default.getLastQueryPlan();
        const querySummary = Array.from(queryPlan.entries())
            .map(([category, queries]) => `${category}: ${queries.join(' | ')}`)
            .join(' ; ');
        const trimmedSummary = querySummary.length > 400 ? `${querySummary.slice(0, 400)}...` : querySummary;
        const thoughts = [
            ...state.thoughts,
            `Searched ${categories.length} categories, found ${totalFound} total results`,
            `Results by category: ${Array.from(searchResults.entries()).map(([k, v]) => `${k}: ${v.length}`).join(', ')}`,
            trimmedSummary ? `Queries used: ${trimmedSummary}` : '',
        ].filter(Boolean);
        return {
            currentStep: 'SEARCH_COMPLETE',
            searchResults,
            rawNews,
            stats: {
                ...state.stats,
                totalFound,
                byCategory,
            },
            thoughts,
        };
    }
    catch (error) {
        logger_1.default.error('[SearchNode] Failed to search news:', error);
        return {
            currentStep: 'SEARCH_ERROR',
            errors: [
                ...state.errors,
                `Search failed: ${error}`,
            ],
        };
    }
}
//# sourceMappingURL=search-node.js.map