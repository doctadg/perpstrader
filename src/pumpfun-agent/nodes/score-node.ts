// Score Node - Calculate final confidence scores
// Combines website quality and AI recommendation into confidence scores

import configManager from '../../shared/config';
import logger from '../../shared/logger';
import { PumpFunAgentState, TokenAnalysis, TokenRecommendation } from '../../shared/types';
import { updateStats, addThought, updateStep } from '../state';

/**
 * Calculate final confidence scores for all analyzed tokens
 */
export async function scoreNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  if (state.analyzedTokens.length === 0) {
    logger.warn('[ScoreNode] No tokens to score');
    return {
      ...addThought(state, 'No tokens to score'),
      ...updateStep(state, 'NO_TOKENS'),
    };
  }

  logger.info(`[ScoreNode] Calculating scores for ${state.analyzedTokens.length} tokens`);

  const config = configManager.get();
  const minScoreThreshold = config.pumpfun?.minScoreThreshold ?? 0.7;
  const configuredWeights = config.pumpfun?.weights || {};
  const websiteWeight = Math.max(0, configuredWeights.website ?? 0.7);
  const aiWeight = Math.max(0, configuredWeights.glm ?? 0.3);
  const totalWeight = websiteWeight + aiWeight || 1;

  const scoredTokens = state.analyzedTokens.map(token => {
    // Convert AI recommendation to numeric score.
    const aiScore = recommendationToScore(token.recommendation);

    // Security and social checks are intentionally not used in score calculation.
    const overallScore =
      (
        token.websiteScore * websiteWeight +
        aiScore * aiWeight
      ) / totalWeight;

    return {
      ...token,
      overallScore: Math.min(1, Math.max(0, overallScore)),
    };
  });

  // Get high confidence tokens
  const highConfidenceTokens = scoredTokens.filter(t => t.overallScore >= minScoreThreshold);

  logger.info(`[ScoreNode] Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} high confidence`);

  return {
    ...addThought(state, `Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} with >=${minScoreThreshold.toFixed(2)} confidence`),
    ...updateStep(state, 'SCORING_COMPLETE'),
    analyzedTokens: scoredTokens,
    highConfidenceTokens,
  };
}

/**
 * Convert recommendation to numeric score
 */
function recommendationToScore(recommendation: TokenRecommendation): number {
  const scores: Record<TokenRecommendation, number> = {
    STRONG_BUY: 0.95,
    BUY: 0.75,
    HOLD: 0.50,
    AVOID: 0.25,
    STRONG_AVOID: 0.05,
  };
  return scores[recommendation] || 0.5;
}

export { addThought, updateStep } from '../state';
