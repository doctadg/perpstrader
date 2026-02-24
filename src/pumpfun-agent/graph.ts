// pump.fun Agent Graph Orchestrator
// Coordinates all nodes in the pump.fun token analysis pipeline

import { PumpFunAgentState, createInitialPumpFunState } from './state';
import {
  subscribeNode,
  fetchMetadataNode,
  analyzeNode,
  scoreNode,
  storeNode,
  cleanupNode,
} from './nodes';
import logger from '../shared/logger';

export { PumpFunAgentState, createInitialPumpFunState };

/**
 * pump.fun Agent Orchestrator
 * Runs the complete analysis pipeline for pump.fun tokens
 */
export class PumpFunOrchestrator {
  async invoke(initialState: PumpFunAgentState): Promise<PumpFunAgentState> {
    let state = { ...initialState };

    try {
      logger.info(`[PumpFunOrchestrator] Starting pump.fun cycle ${state.cycleId}`);

      // Step 1: Subscribe to pump.fun token launches
      state = { ...state, ...await subscribeNode(state) };

      if (state.discoveredTokens.length === 0) {
        logger.warn('[PumpFunOrchestrator] No tokens discovered, ending cycle');
        return {
          ...state,
          currentStep: 'NO_TOKENS_FOUND',
        };
      }

      // Step 2: Fetch metadata for discovered tokens
      state = { ...state, ...await fetchMetadataNode(state) };

      if (state.queuedTokens.length === 0) {
        logger.warn('[PumpFunOrchestrator] No tokens with metadata, ending cycle');
        return {
          ...state,
          currentStep: 'NO_METADATA',
        };
      }

      // Step 3: Run OpenRouter website-first analysis
      state = { ...state, ...await analyzeNode(state) };

      if (state.analyzedTokens.length === 0) {
        logger.warn('[PumpFunOrchestrator] No tokens analyzed, ending cycle');
        return {
          ...state,
          currentStep: 'NO_ANALYSIS',
        };
      }

      // Step 4: Calculate confidence scores
      state = { ...state, ...await scoreNode(state) };

      // Step 5: Store results to database
      state = { ...state, ...await storeNode(state) };

      // Step 6: Cleanup and publish events
      state = { ...state, ...await cleanupNode(state) };

      return state;
    } catch (error) {
      logger.error('[PumpFunOrchestrator] Cycle failed:', error);
      return {
        ...state,
        errors: [...state.errors, `Orchestrator error: ${error}`],
        currentStep: 'ERROR',
      };
    }
  }
}

// Singleton instance
const orchestrator = new PumpFunOrchestrator();

export function buildPumpFunGraph(): PumpFunOrchestrator {
  return orchestrator;
}

/**
 * Run a single pump.fun analysis cycle
 */
export async function runPumpFunCycle(): Promise<PumpFunAgentState> {
  logger.info('[PumpFunOrchestrator] Starting pump.fun cycle');

  const initialState = createInitialPumpFunState();
  const result = await orchestrator.invoke(initialState);

  logger.info(
    `[PumpFunOrchestrator] Cycle completed. ` +
    `Discovered: ${result.stats.totalDiscovered}, ` +
    `Analyzed: ${result.stats.totalAnalyzed}, ` +
    `Stored: ${result.stats.totalStored}, ` +
    `High Confidence: ${result.highConfidenceTokens.length}`
  );

  return result;
}

export default buildPumpFunGraph;
