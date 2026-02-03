"use strict";
// Market Link Node
// Attaches prediction market links to news articles
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketLinkNode = marketLinkNode;
const polymarket_client_1 = __importDefault(require("../../prediction-markets/polymarket-client"));
const logger_1 = __importDefault(require("../../shared/logger"));
const MAX_MARKETS = Number.parseInt(process.env.PREDICTION_MARKET_LINK_LIMIT || '200', 10) || 200;
const MIN_SCORE = Number.parseFloat(process.env.PREDICTION_MARKET_LINK_SCORE || '0.22');
const MIN_VOLUME = Number.parseFloat(process.env.PREDICTION_MIN_VOLUME || '10000');
const MAX_AGE_DAYS = Number.parseInt(process.env.PREDICTION_MARKET_MAX_AGE_DAYS || '30', 10) || 30;
const STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'will', 'would', 'could',
    'about', 'into', 'over', 'under', 'after', 'before', 'more', 'less', 'than',
    'news', 'report', 'reports', 'says', 'said', 'update', 'latest', 'breaking',
]);
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token.length > 3 && !STOPWORDS.has(token));
}
function buildMarketIndex(markets) {
    return markets.map(market => {
        const titleTokens = tokenize(market.title);
        const slugTokens = market.slug ? tokenize(market.slug.replace(/-/g, ' ')) : [];
        const keywords = new Set([...titleTokens, ...slugTokens]);
        return { market, keywords };
    });
}
function scoreMatch(tokens, keywords) {
    const matched = [];
    for (const keyword of keywords) {
        if (tokens.has(keyword))
            matched.push(keyword);
    }
    const score = matched.length / Math.max(5, keywords.size);
    return { score, matched };
}
async function marketLinkNode(state) {
    logger_1.default.info('[MarketLinkNode] Linking news to prediction markets');
    if (!state.categorizedNews.length) {
        return {
            currentStep: 'MARKET_LINK_SKIPPED',
            categorizedNews: state.categorizedNews,
            thoughts: [...state.thoughts, 'No news to link to markets'],
        };
    }
    let markets = await polymarket_client_1.default.fetchMarkets(MAX_MARKETS);
    if (!markets.length) {
        return {
            currentStep: 'MARKET_LINK_EMPTY',
            categorizedNews: state.categorizedNews,
            thoughts: [...state.thoughts, 'Prediction market catalog unavailable'],
        };
    }
    const activeMarkets = markets
        .filter(market => market.status === 'OPEN' || market.status === 'UNKNOWN')
        .filter(market => (market.volume ?? 0) >= MIN_VOLUME)
        .filter(market => {
        const updatedAt = market.updatedAt?.getTime?.() ?? 0;
        return updatedAt > 0 && updatedAt >= Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    });
    const index = buildMarketIndex(activeMarkets);
    let linkedCount = 0;
    const linkedNews = state.categorizedNews.map(article => {
        const text = `${article.title} ${article.summary || ''} ${article.snippet || ''} ${article.tags.join(' ')}`;
        const tokens = new Set(tokenize(text));
        const matches = [];
        for (const entry of index) {
            const { score, matched } = scoreMatch(tokens, entry.keywords);
            if (score >= MIN_SCORE && matched.length >= 2) {
                matches.push({
                    marketId: entry.market.id,
                    marketSlug: entry.market.slug,
                    marketTitle: entry.market.title,
                    score,
                    source: 'KEYWORD',
                    matchedTerms: matched.slice(0, 6),
                });
            }
        }
        matches.sort((a, b) => b.score - a.score);
        const topMatches = matches.slice(0, 3);
        if (topMatches.length)
            linkedCount += 1;
        return {
            ...article,
            marketLinks: topMatches,
            metadata: {
                ...(article.metadata || {}),
                marketLinks: topMatches,
            },
        };
    });
    return {
        currentStep: 'MARKET_LINK_COMPLETE',
        categorizedNews: linkedNews,
        thoughts: [
            ...state.thoughts,
            `Linked ${linkedCount} articles to prediction markets`,
        ],
    };
}
exports.default = marketLinkNode;
//# sourceMappingURL=market-link-node.js.map