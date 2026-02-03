// Cleanup Node - Finalize cycle and publish events
// Publishes results to Redis message bus and finalizes state

import logger from '../../shared/logger';
import { PumpFunAgentState } from '../../shared/types';
import { addThought, updateStep, updateStats } from '../state';

/**
 * Cleanup and publish results
 */
export async function cleanupNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  logger.info('[CleanupNode] Finalizing cycle');

  // Update stats
  const updatedState = updateStats(state);

  // Publish high confidence tokens to message bus
  await publishHighConfidenceTokens(updatedState.highConfidenceTokens);

  // Publish cycle complete event
  await publishCycleComplete(updatedState);

  const summary = buildCycleSummary(updatedState);

  return {
    ...addThought(updatedState, `Cycle complete: ${summary}`),
    ...updateStep(updatedState, 'CYCLE_COMPLETE'),
  };
}

/**
 * Publish high confidence tokens to message bus
 */
async function publishHighConfidenceTokens(tokens: any[]): Promise<void> {
  if (tokens.length === 0) {
    return;
  }

  try {
    // Import message bus (TypeScript module)
    const messageBus = (await import('../../shared/message-bus')).default;

    // Ensure connected
    if (!messageBus.isConnected) {
      await messageBus.connect();
    }

    // Publish each high confidence token
    for (const token of tokens) {
      await messageBus.publish('pumpfun:high:confidence', {
        mintAddress: token.token.mintAddress,
        symbol: token.token.symbol,
        name: token.token.name,
        overallScore: token.overallScore,
        recommendation: token.recommendation,
        rationale: token.rationale,
      });
    }

    logger.info(`[CleanupNode] Published ${tokens.length} high confidence tokens`);
  } catch (error) {
    logger.warn('[CleanupNode] Failed to publish high confidence tokens:', error);
  }
}

/**
 * Publish cycle complete event
 */
async function publishCycleComplete(state: PumpFunAgentState): Promise<void> {
  try {
    const messageBus = (await import('../../shared/message-bus')).default;

    if (!messageBus.isConnected) {
      await messageBus.connect();
    }

    await messageBus.publish('pumpfun:cycle:complete', {
      cycleId: state.cycleId,
      stats: state.stats,
      highConfidenceCount: state.highConfidenceTokens.length,
    });

    logger.info('[CleanupNode] Published cycle complete event');
  } catch (error) {
    logger.warn('[CleanupNode] Failed to publish cycle complete:', error);
  }
}

/**
 * Build cycle summary string
 */
function buildCycleSummary(state: PumpFunAgentState): string {
  const tokens = state.analyzedTokens.length;
  const highConf = state.highConfidenceTokens.length;
  const avgScore = state.stats.averageScore.toFixed(2);

  const byRec = state.stats.byRecommendation;
  const breakdown = `STRONG_BUY:${byRec.STRONG_BUY} BUY:${byRec.BUY} HOLD:${byRec.HOLD} AVOID:${byRec.AVOID} STRONG_AVOID:${byRec.STRONG_AVOID}`;

  return `${tokens} analyzed, ${highConf} high confidence, avg ${avgScore} (${breakdown})`;
}

export { addThought, updateStep } from '../state';
