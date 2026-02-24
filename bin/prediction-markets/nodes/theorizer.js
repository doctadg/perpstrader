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
const MIN_SENTIMENT = Number.parseFloat(process.env.PREDICTION_MIN_SENTIMENT || '0.15');
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
function classifyIdeaType(idea, intel) {
    const heat = intel?.avgClusterHeat || 0;
    const sentiment = Math.abs(intel?.sentimentScore ?? idea.sentimentScore ?? 0);
    const edge = Math.abs(idea.edge || 0);
    if (heat >= 65 && sentiment >= 0.25)
        return 'NEWS_MOMENTUM';
    if (heat >= 45 && (intel?.linkedClusterCount || 0) >= 2)
        return 'EVENT_DRIVEN';
    if (edge >= 0.09)
        return 'PROBABILITY_DISLOCATION';
    return 'MEAN_REVERSION';
}
function buildIdeaName(idea) {
    return `${idea.marketTitle} (${idea.outcome})`;
}
function enrichIdea(idea, intel) {
    const linkedNewsCount = intel?.linkedNewsCount ?? idea.linkedNewsCount ?? 0;
    const linkedClusterCount = intel?.linkedClusterCount ?? idea.linkedClusterCount ?? 0;
    const heatScore = intel?.avgClusterHeat ?? idea.heatScore ?? 0;
    const sentimentScore = intel?.sentimentScore ?? idea.sentimentScore ?? 0;
    const catalysts = Array.from(new Set([
        ...(intel?.catalysts || []),
        ...(idea.catalysts || []),
    ])).slice(0, 4);
    const type = classifyIdeaType(idea, intel);
    const name = buildIdeaName(idea);
    const strategyId = idea.strategyId || idea.id;
    const summary = `${type} | Edge ${(idea.edge * 100).toFixed(1)}% | Heat ${heatScore.toFixed(1)} | News ${linkedNewsCount}`;
    const rationaleSuffix = linkedClusterCount > 0
        ? ` Heat ${heatScore.toFixed(1)} across ${linkedClusterCount} clusters; sentiment ${sentimentScore.toFixed(2)}.`
        : linkedNewsCount > 0
            ? ` News-linked sentiment ${sentimentScore.toFixed(2)} from ${linkedNewsCount} articles.`
            : '';
    return {
        ...idea,
        name,
        type,
        strategyId,
        summary,
        linkedNewsCount,
        linkedClusterCount,
        heatScore: Number(heatScore.toFixed(2)),
        sentimentScore: Number(sentimentScore.toFixed(3)),
        catalysts,
        rationale: `${idea.rationale}${rationaleSuffix}`.trim(),
    };
}
function buildFallbackIdea(market, news, intel) {
    if (!Number.isFinite(market.yesPrice))
        return null;
    const implied = market.yesPrice;
    const sentimentScore = intel?.sentimentScore ?? scoreNewsSentiment(news);
    if (Math.abs(sentimentScore) < MIN_SENTIMENT)
        return null;
    const heatBoost = Math.min(0.08, (intel?.avgClusterHeat || 0) / 100 * 0.08);
    const delta = Math.min(0.24, 0.05 + Math.abs(sentimentScore) * 0.1 + heatBoost);
    const predicted = Math.max(0.02, Math.min(0.98, implied + (sentimentScore > 0 ? delta : -delta)));
    const edge = predicted - implied;
    if (Math.abs(edge) < MIN_EDGE)
        return null;
    const outcome = edge > 0 ? 'YES' : 'NO';
    const catalysts = Array.from(new Set([
        ...(intel?.catalysts || []),
        ...news.map(item => item.title),
    ])).slice(0, 4);
    const confidenceBase = 0.5 + Math.abs(edge) * 1.8;
    const newsBoost = Math.min(0.15, (intel?.linkedNewsCount || news.length) * 0.015);
    const heatConfidenceBoost = Math.min(0.2, (intel?.avgClusterHeat || 0) / 100 * 0.2);
    return enrichIdea({
        id: (0, uuid_1.v4)(),
        marketId: market.id,
        marketTitle: market.title,
        outcome,
        impliedProbability: implied,
        predictedProbability: predicted,
        edge,
        confidence: Math.min(0.95, confidenceBase + newsBoost + heatConfidenceBoost),
        timeHorizon: '7d',
        catalysts,
        rationale: `${outcome} bias from ${news.length} linked headlines (score ${sentimentScore.toFixed(2)})`,
    }, intel);
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
                const enrichedIdeas = ideas.map(idea => enrichIdea(idea, state.marketIntel[idea.marketId]));
                return {
                    currentStep: 'THEORIZER_COMPLETE',
                    ideas: enrichedIdeas,
                    thoughts: [
                        ...state.thoughts,
                        `Generated ${enrichedIdeas.length} LLM prediction ideas`,
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
        const idea = buildFallbackIdea(market, news, state.marketIntel[market.id]);
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