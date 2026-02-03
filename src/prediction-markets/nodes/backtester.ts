// Prediction Market Backtester Node

import { PredictionAgentState } from '../state';
import { PredictionBacktestResult } from '../../shared/types';
import predictionStore from '../../data/prediction-store';
import logger from '../../shared/logger';

const MIN_HISTORY = Number.parseInt(process.env.PREDICTION_MIN_HISTORY || '20', 10) || 20;
const HORIZON = Number.parseInt(process.env.PREDICTION_BACKTEST_HORIZON || '5', 10) || 5;

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(returns: number[]): number {
  let peak = 0;
  let drawdown = 0;
  let cumulative = 0;
  for (const r of returns) {
    cumulative += r;
    peak = Math.max(peak, cumulative);
    drawdown = Math.min(drawdown, cumulative - peak);
  }
  return Math.abs(drawdown);
}

export async function backtesterNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info(`[PredictionBacktester] Backtesting ${state.ideas.length} ideas`);

  if (!state.ideas.length) {
    return {
      currentStep: 'BACKTEST_SKIPPED',
      backtestResults: [],
      thoughts: [...state.thoughts, 'No prediction ideas to backtest'],
    };
  }

  const results: PredictionBacktestResult[] = [];

  for (const idea of state.ideas) {
    let series: number[] = [];
    const localHistory = predictionStore.getMarketPrices(idea.marketId, 200);

    // Prefer local if enough data
    if (localHistory.length >= MIN_HISTORY) {
      series = localHistory
        .map(point => idea.outcome === 'YES' ? point.yesPrice : point.noPrice)
        .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0);
    }

    // Fallback to API if we don't have enough local history
    if (series.length < MIN_HISTORY) {
      import('../polymarket-client').then(async (mod) => {
        // This is tricky because we're inside a sync loop, but backtesterNode is async
        // We need to refactor the loop to be async-friendly or structure this differently
        // Since the function is async, we can await inside the loop if we change it to 'for ... of'
      });
      // Note: The loop below needs to be awaited. 
      // Checking file structure: it's a 'for (const idea of state.ideas)' loop inside 'async function'.
      // So we can await directly.
    }

    // NOTE: Splitting this replacement to avoid complexity with imports. 
    // I will replace the LOGIC block.
    // Assuming 'polymarketClient' is imported or I can import it.
    // 'polymarket-client' is NOT imported in original file.
    // I need to add the import first!


    const returns: number[] = [];
    for (let i = 0; i + HORIZON < series.length; i++) {
      const entry = series[i];
      const exit = series[i + HORIZON];
      returns.push((exit - entry) / entry);
    }

    const avgReturn = mean(returns);
    const totalReturn = returns.reduce((sum, r) => sum + r, 0) * 100;
    const winRate = returns.length ? (returns.filter(r => r > 0).length / returns.length) * 100 : 0;
    const sharpe = stdDev(returns) ? (avgReturn / stdDev(returns)) * Math.sqrt(252) : 0;

    const result: PredictionBacktestResult = {
      ideaId: idea.id,
      marketId: idea.marketId,
      period: {
        start: localHistory.length > 0 ? localHistory[0].timestamp : new Date(),
        end: localHistory.length > 0 ? localHistory[localHistory.length - 1].timestamp : new Date(),
      },
      totalReturn,
      averageReturn: avgReturn * 100,
      winRate,
      maxDrawdown: maxDrawdown(returns) * 100,
      tradesSimulated: returns.length,
      sharpeRatio: sharpe,
    };

    predictionStore.storeBacktest(result);
    results.push(result);
  }

  return {
    currentStep: results.length ? 'BACKTEST_COMPLETE' : 'BACKTEST_EMPTY',
    backtestResults: results,
    thoughts: [
      ...state.thoughts,
      `Backtested ${results.length} prediction ideas`,
    ],
  };
}

export default backtesterNode;
