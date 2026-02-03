"use strict";
// Prediction Market News Context Node
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.newsContextNode = newsContextNode;
const news_store_1 = __importDefault(require("../../data/news-store"));
const logger_1 = __importDefault(require("../../shared/logger"));
const NEWS_PER_MARKET = Number.parseInt(process.env.PREDICTION_NEWS_LIMIT || '8', 10) || 8;
function buildFallbackQuery(title) {
    return title.split(/\s+/).slice(0, 6).join(' ');
}
async function newsContextNode(state) {
    logger_1.default.info('[PredictionNewsContext] Linking news to markets');
    if (!state.activeMarkets.length) {
        return {
            currentStep: 'NEWS_CONTEXT_SKIPPED',
            marketNews: {},
            thoughts: [...state.thoughts, 'No active markets to attach news'],
        };
    }
    const marketNews = {};
    let totalLinked = 0;
    for (const market of state.activeMarkets) {
        let news = await news_store_1.default.getNewsByMarket(market.id, market.slug, NEWS_PER_MARKET);
        if (!news.length) {
            const query = buildFallbackQuery(market.title);
            news = await news_store_1.default.searchNews(query, Math.min(NEWS_PER_MARKET, 5));
        }
        if (news.length) {
            marketNews[market.id] = news;
            totalLinked += news.length;
        }
    }
    return {
        currentStep: totalLinked > 0 ? 'NEWS_CONTEXT_READY' : 'NEWS_CONTEXT_EMPTY',
        marketNews,
        thoughts: [
            ...state.thoughts,
            `Linked ${totalLinked} news items to ${Object.keys(marketNews).length} markets`,
        ],
    };
}
exports.default = newsContextNode;
//# sourceMappingURL=news-context.js.map