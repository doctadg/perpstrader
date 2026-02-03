// Prediction Market Learner Node

import { PredictionAgentState } from '../state';
import logger from '../../shared/logger';

export async function learnerNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info('[PredictionLearner] Updating learning state');

  if (!state.executionResult) {
    return {
      currentStep: 'LEARN_SKIPPED',
      shouldLearn: false,
      thoughts: [...state.thoughts, 'No execution result to learn from'],
    };
  }

  return {
    currentStep: 'LEARN_COMPLETE',
    shouldLearn: false,
    thoughts: [
      ...state.thoughts,
      `Logged trade outcome for ${state.executionResult.marketTitle}`,
    ],
  };
}

export default learnerNode;
