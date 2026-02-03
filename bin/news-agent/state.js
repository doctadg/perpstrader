"use strict";
// News Agent State Definition
// Defines the shared state that flows through the newsfeed agent
// Rebuilt with layered filtering for real-time quality control
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXCLUDED_CATEGORIES = exports.TRADING_CATEGORIES = void 0;
exports.createInitialNewsState = createInitialNewsState;
/**
 * Trading-focused categories for perpetual traders
 */
exports.TRADING_CATEGORIES = [
    'CRYPTO',
    'STOCKS',
    'ECONOMICS',
    'GEOPOLITICS',
];
/**
 * Categories to exclude from news processing
 */
exports.EXCLUDED_CATEGORIES = [
    'SPORTS',
    'FOOTBALL',
    'BASKETBALL',
    'TENNIS',
    'MMA',
    'GOLF',
];
function createInitialNewsState() {
    const allCategories = [...exports.TRADING_CATEGORIES, ...exports.EXCLUDED_CATEGORIES, 'TECH', 'COMMODITIES'];
    return {
        cycleId: crypto.randomUUID(),
        cycleStartTime: new Date(),
        currentStep: 'INIT',
        categories: exports.TRADING_CATEGORIES, // Only process trading categories
        searchResults: new Map(),
        rawNews: [],
        scrapedArticles: [],
        categorizedNews: [],
        storedCount: 0,
        duplicateCount: 0,
        rawArticles: [],
        filteredArticles: [],
        labeledArticles: [],
        clusters: [],
        thoughts: [],
        errors: [],
        stats: {
            searched: 0,
            scraped: 0,
            filteredLanguage: 0,
            filteredQuality: 0,
            filteredCategory: 0,
            filteredRedundant: 0,
            categorized: 0,
            labeled: 0,
            clustered: 0,
            totalRejected: 0,
            // Legacy stats
            totalFound: 0,
            totalScraped: 0,
            totalCategorized: 0,
            totalStored: 0,
            totalDuplicates: 0,
            byCategory: Object.fromEntries(allCategories.map(c => [c, 0])),
        },
    };
}
//# sourceMappingURL=state.js.map