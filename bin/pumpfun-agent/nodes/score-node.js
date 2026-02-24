"use strict";
// Score Node - Calculate final confidence scores
// Combines website quality and AI recommendation into confidence scores
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStep = exports.addThought = void 0;
exports.scoreNode = scoreNode;
const config_1 = __importDefault(require("../../shared/config"));
const logger_1 = __importDefault(require("../../shared/logger"));
const state_1 = require("../state");
/**
 * Calculate final confidence scores for all analyzed tokens
 */
async function scoreNode(state) {
    if (state.analyzedTokens.length === 0) {
        logger_1.default.warn('[ScoreNode] No tokens to score');
        return {
            ...(0, state_1.addThought)(state, 'No tokens to score'),
            ...(0, state_1.updateStep)(state, 'NO_TOKENS'),
        };
    }
    logger_1.default.info(`[ScoreNode] Calculating scores for ${state.analyzedTokens.length} tokens`);
    const config = config_1.default.get();
    const minScoreThreshold = config.pumpfun?.minScoreThreshold ?? 0.7;
    const configuredWeights = config.pumpfun?.weights || {};
    const websiteWeight = Math.max(0, configuredWeights.website ?? 0.7);
    const aiWeight = Math.max(0, configuredWeights.glm ?? 0.3);
    const totalWeight = websiteWeight + aiWeight || 1;
    const scoredTokens = state.analyzedTokens.map(token => {
        // Convert AI recommendation to numeric score.
        const aiScore = recommendationToScore(token.recommendation);
        // Security and social checks are intentionally not used in score calculation.
        const overallScore = (token.websiteScore * websiteWeight +
            aiScore * aiWeight) / totalWeight;
        return {
            ...token,
            overallScore: Math.min(1, Math.max(0, overallScore)),
        };
    });
    // Get high confidence tokens
    const highConfidenceTokens = scoredTokens.filter(t => t.overallScore >= minScoreThreshold);
    logger_1.default.info(`[ScoreNode] Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} high confidence`);
    return {
        ...(0, state_1.addThought)(state, `Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} with >=${minScoreThreshold.toFixed(2)} confidence`),
        ...(0, state_1.updateStep)(state, 'SCORING_COMPLETE'),
        analyzedTokens: scoredTokens,
        highConfidenceTokens,
    };
}
/**
 * Convert recommendation to numeric score
 */
function recommendationToScore(recommendation) {
    const scores = {
        STRONG_BUY: 0.95,
        BUY: 0.75,
        HOLD: 0.50,
        AVOID: 0.25,
        STRONG_AVOID: 0.05,
    };
    return scores[recommendation] || 0.5;
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=score-node.js.map