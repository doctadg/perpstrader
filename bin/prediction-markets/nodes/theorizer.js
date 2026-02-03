"use strict";
// Prediction Market Theorizer Node
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theorizerNode = theorizerNode;
const uuid_1 = require("uuid");
const glm_service_1 = __importDefault(require("../../shared/glm-service"));
const logger_1 = __importDefault(require("../../shared/logger"));
const MIN_EDGE = Number.parseFloat(process.env.PREDICTION_MIN_EDGE || '0.04');
const IMPORTANCE_WEIGHT = {
    LOW: 0.5,
    MEDIUM: 1,
    HIGH: 1.5,
    CRITICAL: 2,
};
function scoreNewsSentiment(news) {
    if (!news.length)
        return 0;
    let score = 0;
    let weightTotal = 0;
    for (const item of news) {
        const weight = IMPORTANCE_WEIGHT[item.importance] || 1;
        weightTotal += weight;
        if (item.sentiment === 'BULLISH')
            score += 1 * weight;
        if (item.sentiment === 'BEARISH')
            score -= 1 * weight;
    }
    if (weightTotal === 0)
        return 0;
    return score / weightTotal;
}
function buildFallbackIdea(market, news) {
    if (!Number.isFinite(market.yesPrice))
        return null;
    const implied = market.yesPrice;
    const sentimentScore = scoreNewsSentiment(news);
    if (Math.abs(sentimentScore) < 0.15)
        return null;
    const delta = Math.min(0.2, 0.05 + Math.abs(sentimentScore) * 0.1);
    const predicted = Math.max(0.02, Math.min(0.98, implied + (sentimentScore > 0 ? delta : -delta)));
    const edge = predicted - implied;
    if (Math.abs(edge) < MIN_EDGE)
        return null;
    const outcome = edge > 0 ? 'YES' : 'NO';
    const catalysts = news.slice(0, 2).map(item => item.title);
    return {
        id: (0, uuid_1.v4)(),
        marketId: market.id,
        marketTitle: market.title,
        outcome,
        impliedProbability: implied,
        predictedProbability: predicted,
        edge,
        confidence: Math.min(0.95, 0.5 + Math.abs(edge) * 2),
        timeHorizon: '7d',
        catalysts,
        rationale: `${outcome} bias from ${news.length} linked headlines (score ${sentimentScore.toFixed(2)})`,
    };
}
async function theorizerNode(state) {
    logger_1.default.info('[PredictionTheorizer] Generating prediction ideas');
    if (!state.activeMarkets.length) {
        return {
            currentStep: 'THEORIZER_SKIPPED',
            ideas: [],
            thoughts: [...state.thoughts, 'No markets available for theorizing'],
        };
    }
    try {
        if (glm_service_1.default.canUseService()) {
            const ideas = await glm_service_1.default.generatePredictionIdeas({
                markets: state.activeMarkets,
                marketNews: state.marketNews,
            });
            if (ideas.length) {
                return {
                    currentStep: 'THEORIZER_COMPLETE',
                    ideas,
                    thoughts: [
                        ...state.thoughts,
                        `Generated ${ideas.length} LLM prediction ideas`,
                    ],
                };
            }
        }
    }
    catch (error) {
        logger_1.default.warn('[PredictionTheorizer] LLM generation failed, falling back:', error);
    }
    const ideas = [];
    for (const market of state.activeMarkets) {
        const news = state.marketNews[market.id] || [];
        const idea = buildFallbackIdea(market, news);
        if (idea)
            ideas.push(idea);
    }
    return {
        currentStep: ideas.length ? 'THEORIZER_FALLBACK' : 'THEORIZER_EMPTY',
        ideas,
        thoughts: [
            ...state.thoughts,
            `Generated ${ideas.length} fallback prediction ideas`,
        ],
    };
}
exports.default = theorizerNode;
//# sourceMappingURL=theorizer.js.map