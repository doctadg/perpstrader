// pump.fun Agent State Management
// Manages the state of the pump.fun token analysis pipeline

import { v4 as uuidv4 } from 'uuid';
import { PumpFunAgentState, TokenRecommendation } from '../shared/types';

// Re-export for convenience
export type { PumpFunAgentState, TokenRecommendation };

/**
 * Create initial state for a pump.fun analysis cycle
 */
export function createInitialPumpFunState(): PumpFunAgentState {
  return {
    cycleId: uuidv4(),
    cycleStartTime: new Date(),
    currentStep: 'INIT',

    discoveredTokens: [],
    queuedTokens: [],

    analyzedTokens: [],
    highConfidenceTokens: [],
    storedCount: 0,
    duplicateCount: 0,

    thoughts: [],
    errors: [],

    stats: {
      totalDiscovered: 0,
      totalAnalyzed: 0,
      totalStored: 0,
      totalDuplicates: 0,
      averageScore: 0,
      byRecommendation: {
        STRONG_BUY: 0,
        BUY: 0,
        HOLD: 0,
        AVOID: 0,
        STRONG_AVOID: 0,
      },
    },
  };
}

/**
 * Validate that the state is properly structured
 */
export function validateState(state: PumpFunAgentState): boolean {
  return !!(
    state.cycleId &&
    state.cycleStartTime &&
    state.stats &&
    Array.isArray(state.discoveredTokens) &&
    Array.isArray(state.analyzedTokens)
  );
}

/**
 * Calculate average score from analyzed tokens
 */
export function calculateAverageScore(state: PumpFunAgentState): number {
  if (state.analyzedTokens.length === 0) return 0;
  const sum = state.analyzedTokens.reduce((acc, t) => acc + t.overallScore, 0);
  return sum / state.analyzedTokens.length;
}

/**
 * Update statistics based on current state
 */
export function updateStats(state: PumpFunAgentState): PumpFunAgentState {
  const analyzedTokens = state.analyzedTokens;

  // Count by recommendation
  const byRecommendation: Record<TokenRecommendation, number> = {
    STRONG_BUY: 0,
    BUY: 0,
    HOLD: 0,
    AVOID: 0,
    STRONG_AVOID: 0,
  };

  for (const token of analyzedTokens) {
    byRecommendation[token.recommendation]++;
  }

  // Calculate high confidence tokens
  const highConfidenceTokens = analyzedTokens.filter(t => t.overallScore >= 0.7);

  return {
    ...state,
    highConfidenceTokens,
    stats: {
      ...state.stats,
      totalAnalyzed: analyzedTokens.length,
      averageScore: calculateAverageScore(state),
      byRecommendation,
    },
  };
}

/**
 * Add a thought to the state
 */
export function addThought(state: PumpFunAgentState, thought: string): PumpFunAgentState {
  return {
    ...state,
    thoughts: [...state.thoughts, thought],
  };
}

/**
 * Add an error to the state
 */
export function addError(state: PumpFunAgentState, error: string): PumpFunAgentState {
  return {
    ...state,
    errors: [...state.errors, error],
  };
}

/**
 * Update current step
 */
export function updateStep(state: PumpFunAgentState, step: string): PumpFunAgentState {
  return {
    ...state,
    currentStep: step,
  };
}
