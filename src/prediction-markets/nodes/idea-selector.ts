// Prediction Idea Selector Node

import { PredictionAgentState } from '../state';
import logger from '../../shared/logger';

const MIN_WIN_RATE = Number.parseFloat(process.env.PREDICTION_MIN_WIN_RATE || '55');
const MIN_AVG_RETURN = Number.parseFloat(process.env.PREDICTION_MIN_AVG_RETURN || '0.1');

export async function ideaSelectorNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info(`[PredictionSelector] Selecting from ${state.ideas.length} ideas`);

  if (!state.ideas.length) {
    return {
      currentStep: 'IDEA_SELECTION_NONE',
      selectedIdea: null,
      shouldExecute: false,
      thoughts: [...state.thoughts, 'No prediction ideas to select'],
    };
  }

  const backtestMap = new Map(state.backtestResults.map(result => [result.ideaId, result]));

  const scored = state.ideas.map(idea => {
    const backtest = backtestMap.get(idea.id);
    const winRate = backtest?.winRate ?? 50;
    const avgReturn = backtest?.averageReturn ?? 0;
    const sharpe = backtest?.sharpeRatio ?? 0;
    const edgePct = Math.abs(idea.edge || 0) * 100;
    const heatScore = idea.heatScore ?? state.marketIntel[idea.marketId]?.avgClusterHeat ?? 0;
    const score = (winRate * 0.45)
      + (avgReturn * 0.2)
      + (sharpe * 4 * 0.1)
      + (edgePct * 0.15)
      + (heatScore * 0.1);
    return { idea, backtest, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (!best) {
    return {
      currentStep: 'IDEA_SELECTION_ERROR',
      selectedIdea: null,
      shouldExecute: false,
      thoughts: [...state.thoughts, 'Unable to score prediction ideas'],
    };
  }

  const winRate = best.backtest?.winRate ?? 50;
  const avgReturn = best.backtest?.averageReturn ?? 0;
  const eligible = winRate >= MIN_WIN_RATE && avgReturn >= MIN_AVG_RETURN;

  return {
    currentStep: eligible ? 'IDEA_SELECTED' : 'IDEA_SELECTION_HELD',
    selectedIdea: eligible ? best.idea : null,
    shouldExecute: eligible,
    thoughts: [
      ...state.thoughts,
      `Top idea: ${best.idea.marketTitle} (${best.idea.outcome})`,
      `Score ${best.score.toFixed(2)} | WinRate ${winRate.toFixed(1)}% | AvgRet ${avgReturn.toFixed(2)}% | Heat ${(best.idea.heatScore ?? 0).toFixed(1)}`,
      eligible ? 'Idea approved for risk check' : 'Idea held due to backtest thresholds',
    ],
  };
}

export default ideaSelectorNode;
