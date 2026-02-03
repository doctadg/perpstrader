// Prediction Market Executor Node

import { PredictionAgentState } from '../state';
import predictionExecutionEngine from '../execution-engine';
import logger from '../../shared/logger';

export async function executorNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info('[PredictionExecutor] Executing prediction trade');

  if (!state.shouldExecute || !state.signal || !state.riskAssessment?.approved) {
    return {
      currentStep: 'EXECUTION_SKIPPED',
      executionResult: null,
      thoughts: [...state.thoughts, 'Execution skipped (no approved signal)'],
    };
  }

  const marketTitle = state.activeMarkets.find(m => m.id === state.signal?.marketId)?.title || 'Unknown Market';

  try {
    const trade = await predictionExecutionEngine.executeSignal(
      state.signal,
      state.riskAssessment,
      marketTitle
    );

    return {
      currentStep: 'EXECUTION_COMPLETE',
      executionResult: trade,
      portfolio: predictionExecutionEngine.getPortfolio(),
      thoughts: [
        ...state.thoughts,
        `Executed ${trade.side} ${trade.outcome} on ${trade.marketTitle}`,
      ],
    };
  } catch (error) {
    logger.error('[PredictionExecutor] Execution failed:', error);
    return {
      currentStep: 'EXECUTION_ERROR',
      executionResult: null,
      errors: [...state.errors, `Execution error: ${error}`],
    };
  }
}

export default executorNode;
