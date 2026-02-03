// Score Node - Calculate final confidence scores
// Combines all analysis components into weighted confidence scores

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
    const overallScore =
      token.websiteScore * (weights.website || 0.25) +
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

  logger.info(`[ScoreNode] Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} high confidence`);

  return {
    ...addThought(state, `Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} with >=0.7 confidence`),
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
