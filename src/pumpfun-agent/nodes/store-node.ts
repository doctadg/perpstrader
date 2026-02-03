// Store Node - Persist analyzed tokens to database
// Stores token analysis results in SQLite database

import logger from '../../shared/logger';
import pumpfunStore from '../../data/pumpfun-store';
import { PumpFunAgentState } from '../../shared/types';
import { addThought, updateStep } from '../state';

/**
 * Store analyzed tokens to database
 */
export async function storeNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  if (state.analyzedTokens.length === 0) {
    logger.warn('[StoreNode] No tokens to store');
    return {
      ...addThought(state, 'No tokens to store'),
      ...updateStep(state, 'NO_TOKENS'),
      storedCount: 0,
      duplicateCount: 0,
    };
  }

  logger.info(`[StoreNode] Storing ${state.analyzedTokens.length} tokens to database`);

  try {
    // Ensure database is initialized
    await pumpfunStore.initialize();

    // Store all tokens
    const result = pumpfunStore.storeTokens(state.analyzedTokens);

    logger.info(`[StoreNode] Stored ${result.stored} tokens, ${result.duplicates} duplicates`);

    return {
      ...addThought(state, `Stored ${result.stored} tokens, ${result.duplicates} were duplicates`),
      ...updateStep(state, 'STORE_COMPLETE'),
      storedCount: result.stored,
      duplicateCount: result.duplicates,
      stats: {
        ...state.stats,
        totalStored: (state.stats.totalStored || 0) + result.stored,
        totalDuplicates: (state.stats.totalDuplicates || 0) + result.duplicates,
      },
    };
  } catch (error) {
    logger.error('[StoreNode] Failed to store tokens:', error);
    return {
      ...addThought(state, `Failed to store tokens: ${error}`),
      ...addError(state, `Storage failed: ${error}`),
      ...updateStep(state, 'ERROR'),
      storedCount: 0,
      duplicateCount: 0,
    };
  }
}

function addError(state: PumpFunAgentState, error: string): Partial<PumpFunAgentState> {
  return {
    ...state,
    errors: [...state.errors, error],
  };
}

export { addThought, updateStep } from '../state';
