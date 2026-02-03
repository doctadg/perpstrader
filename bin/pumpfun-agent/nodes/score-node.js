"use strict";
// Score Node - Calculate final confidence scores
// Combines all analysis components into weighted confidence scores
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
    const weights = config.pumpfun?.weights || {
        website: 0.25,
        social: 0.25,
        security: 0.35,
        glm: 0.15,
    };
    const scoredTokens = state.analyzedTokens.map(token => {
        // Calculate GLM score from recommendation
        const glmScore = recommendationToScore(token.recommendation);
        // Calculate weighted overall score
        const overallScore = token.websiteScore * (weights.website || 0.25) +
            token.socialScore * (weights.social || 0.25) +
            token.securityScore * (weights.security || 0.35) +
            glmScore * (weights.glm || 0.15);
        return {
            ...token,
            overallScore: Math.min(1, Math.max(0, overallScore)),
        };
    });
    // Get high confidence tokens
    const highConfidenceTokens = scoredTokens.filter(t => t.overallScore >= 0.7);
    logger_1.default.info(`[ScoreNode] Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} high confidence`);
    return {
        ...(0, state_1.addThought)(state, `Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} with >=0.7 confidence`),
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