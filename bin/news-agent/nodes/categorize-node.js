"use strict";
// Categorize Node
// Uses LLM (gpt-oss-20b) to categorize, tag, and analyze news
// Enhanced with strict filtering for perpetual traders
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.categorizeNode = categorizeNode;
const state_1 = require("../state");
const logger_1 = __importDefault(require("../../shared/logger"));
const config_1 = __importDefault(require("../../shared/config"));
const news_trend_1 = require("../../shared/news-trend");
const openrouter_service_1 = __importDefault(require("../../shared/openrouter-service"));
const market_title_generator_1 = require("../../shared/market-title-generator");
const config = config_1.default.get();
const CATEGORY_KEYWORDS = {
    CRYPTO: ['bitcoin', 'ethereum', 'crypto', 'defi', 'blockchain', 'altcoin', 'stablecoin', 'token', 'btc', 'eth', 'sol', 'xrp'],
    STOCKS: ['nasdaq', 's&p 500', 'earnings', 'ipo', 'shares', 'sec', 'sec approves', 'stock market', 'wall street'],
    ECONOMICS: ['inflation', 'cpi', 'gdp', 'fed', 'interest rate', 'interest rates', 'central bank', 'jobs report', 'treasury'],
    GEOPOLITICS: ['sanction', 'sanctions', 'war', 'conflict', 'diplomacy', 'election', 'trade war', 'summit', 'treaty'],
};
// System prompt for categorization (gpt-oss-20b)
const CATEGORIZATION_SYSTEM_PROMPT = `You are an expert news categorizer for a PERPETUAL TRADING platform.

Your job is to categorize news articles for cryptocurrency and financial traders.

CATEGORIES:
- CRYPTO: Bitcoin, Ethereum, DeFi, exchanges, tokens, regulations, hacks
- STOCKS: Equities markets, earnings, IPOs, SEC actions, stock splits
- ECONOMICS: Fed decisions, inflation data, GDP, jobs reports, central banks
- GEOPOLITICS: Trade policies, sanctions, conflicts affecting markets

CRITICAL RULES:
1. Only assign TRADING-RELEVANT categories (CRYPTO, STOCKS, ECONOMICS, GEOPOLITICS)
2. Do NOT assign sports categories (MMA, tennis, etc.) to financial news
3. Be specific with tags (token names, company names, event types)
4. Sentiment should reflect market impact (bullish = positive for price, bearish = negative)

Respond with valid JSON only.`;
/**
 * Categorize Node
 * Uses gpt-oss-20b to categorize filtered articles
 */
async function categorizeNode(state) {
    const startTime = Date.now();
    logger_1.default.info(`[CategorizeNode] Categorizing ${state.filteredArticles.length} filtered articles`);
    if (state.filteredArticles.length === 0) {
        return {
            currentStep: 'CATEGORIZE_SKIPPED',
            labeledArticles: [],
            categorizedNews: [], // For backward compatibility
            stats: {
                ...state.stats,
                categorized: 0,
                totalCategorized: 0,
            },
            thoughts: [...state.thoughts, 'No articles to categorize'],
        };
    }
    // Use OpenRouter with gpt-oss-20b
    if (openrouter_service_1.default.canUseService()) {
        try {
            const categorization = await openrouter_service_1.default.categorizeArticles(state.filteredArticles.map(a => ({
                id: a.id,
                title: a.title,
                content: a.content,
                snippet: a.snippet,
                source: a.source,
            })));
            if (categorization.size > 0) {
                const labeledArticles = state.filteredArticles.map(article => {
                    const catResult = categorization.get(article.id);
                    if (catResult) {
                        // Filter to only trading categories
                        const tradingCategories = (catResult.categories || []).filter((c) => state_1.TRADING_CATEGORIES.includes(c));
                        // If no trading categories found, try to infer from content
                        const finalCategories = tradingCategories.length > 0
                            ? tradingCategories
                            : inferTradingCategory(article.title, article.content);
                        if (finalCategories.length === 0) {
                            // Article doesn't belong in trading categories
                            return null;
                        }
                        const derivedTrend = (0, news_trend_1.deriveTrend)({ title: article.title, category: finalCategories[0], tags: catResult.tags });
                        const trend = catResult.trendTopic
                            ? { topic: catResult.trendTopic, keywords: (catResult.trendKeywords || []).slice(0, 8) }
                            : (0, news_trend_1.deriveTrendTopic)({ title: article.title, category: finalCategories[0], tags: catResult.tags });
                        // Generate enhanced title with market context
                        const enhancedTitle = (0, market_title_generator_1.generateEnhancedTitle)(article);
                        const labeledArticle = {
                            ...article,
                            categories: finalCategories,
                            tags: catResult.tags || [],
                            sentiment: catResult.sentiment || 'NEUTRAL',
                            importance: catResult.importance || 'MEDIUM',
                            summary: catResult.summary || '',
                            // Topic/label fields (from categorization)
                            topic: catResult.trendTopic || enhancedTitle.enhanced.split(':')[0],
                            subEventType: enhancedTitle.subEventType || 'other',
                            trendDirection: 'NEUTRAL', // Will be determined by topic generation node
                            urgency: catResult.importance === 'CRITICAL' ? 'CRITICAL' :
                                catResult.importance === 'HIGH' ? 'HIGH' : 'MEDIUM',
                            keywords: (catResult.trendKeywords || catResult.tags || []).slice(0, 7),
                        };
                        return labeledArticle;
                    }
                    // No categorization result - use fallback
                    const inferredCategories = inferTradingCategory(article.title, article.content);
                    if (inferredCategories.length === 0) {
                        return null; // Filter out non-trading articles
                    }
                    const enhancedTitle = (0, market_title_generator_1.generateEnhancedTitle)(article);
                    const derivedTrend = (0, news_trend_1.deriveTrend)({ title: article.title, category: inferredCategories[0], tags: [] });
                    return {
                        ...article,
                        categories: inferredCategories,
                        tags: [],
                        sentiment: 'NEUTRAL',
                        importance: 'MEDIUM',
                        summary: '',
                        topic: enhancedTitle.enhanced.split(':')[0],
                        subEventType: enhancedTitle.subEventType || 'other',
                        trendDirection: 'NEUTRAL',
                        urgency: 'MEDIUM',
                        keywords: [],
                    };
                }).filter(a => a !== null);
                // Also create categorizedNews for backward compatibility (without metadata)
                const categorizedNews = labeledArticles.map(a => ({
                    id: a.id,
                    title: a.title,
                    content: a.content,
                    source: a.source,
                    url: a.url,
                    publishedAt: a.publishedAt,
                    categories: a.categories,
                    tags: a.tags,
                    sentiment: a.sentiment,
                    importance: a.importance,
                    snippet: a.snippet,
                    summary: a.summary,
                }));
                const elapsed = Date.now() - startTime;
                logger_1.default.info(`[CategorizeNode] Completed in ${elapsed}ms. ` +
                    `Categorized: ${labeledArticles.length}/${state.filteredArticles.length} articles`);
                return {
                    currentStep: 'CATEGORIZE_COMPLETE',
                    labeledArticles,
                    categorizedNews,
                    stats: {
                        ...state.stats,
                        categorized: labeledArticles.length,
                        totalCategorized: labeledArticles.length,
                    },
                    thoughts: [
                        ...state.thoughts,
                        `Categorized ${labeledArticles.length} articles using gpt-oss-20b`,
                    ],
                };
            }
        }
        catch (error) {
            logger_1.default.warn('[CategorizeNode] OpenRouter categorization failed, trying fallback:', error);
        }
    }
    // Fallback: Keyword-based categorization
    logger_1.default.info('[CategorizeNode] Using keyword-based categorization fallback');
    const labeledArticles = state.filteredArticles
        .map(article => {
        const categories = inferTradingCategory(article.title, article.content);
        if (categories.length === 0) {
            return null;
        }
        const enhancedTitle = (0, market_title_generator_1.generateEnhancedTitle)(article);
        return {
            ...article,
            categories,
            tags: extractKeywords(article.title),
            sentiment: 'NEUTRAL',
            importance: 'MEDIUM',
            summary: '',
            topic: enhancedTitle.enhanced.split(':')[0],
            subEventType: enhancedTitle.subEventType || 'other',
            trendDirection: 'NEUTRAL',
            urgency: 'MEDIUM',
            keywords: extractKeywords(article.title),
        };
    })
        .filter(a => a !== null);
    const elapsed = Date.now() - startTime;
    logger_1.default.info(`[CategorizeNode] Completed in ${elapsed}ms using fallback. Categorized: ${labeledArticles.length}`);
    return {
        currentStep: 'CATEGORIZE_COMPLETE_FALLBACK',
        labeledArticles,
        categorizedNews: labeledArticles,
        stats: {
            ...state.stats,
            categorized: labeledArticles.length,
            totalCategorized: labeledArticles.length,
        },
        thoughts: [
            ...state.thoughts,
            `Categorized ${labeledArticles.length} articles using keyword fallback`,
        ],
    };
}
/**
 * Infer trading category from title and content
 */
function inferTradingCategory(title, content) {
    const text = (title + ' ' + (content || '')).toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        const matchCount = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
        if (matchCount >= 2) {
            return [category];
        }
    }
    // No clear category match
    return [];
}
/**
 * Extract keywords from title
 */
function extractKeywords(title) {
    const words = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);
    const counts = new Map();
    for (const word of words) {
        counts.set(word, (counts.get(word) || 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
}
//# sourceMappingURL=categorize-node.js.map