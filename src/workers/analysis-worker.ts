import { parentPort } from 'worker_threads';
import taModule from '../ta-module/ta-module';
import { vectorizedBacktest } from '../langgraph/nodes/backtester';
import type { StrategyIdea } from '../langgraph/state';
import type { BacktestResult, MarketData } from '../shared/types';

type AnalysisTaskType = 'backtestBatch' | 'ta';

type AnalysisTask = {
  id: string;
  type: AnalysisTaskType;
  payload: any;
};

function buildCloseSeries(candles: MarketData[]): Float64Array {
  const closes = new Float64Array(candles.length);
  for (let i = 0; i < candles.length; i++) {
    closes[i] = candles[i].close;
  }
  return closes;
}

async function runBacktestBatch(payload: { ideas: StrategyIdea[]; candles: MarketData[] }) {
  const { ideas, candles } = payload;
  const closeSeries = buildCloseSeries(candles);
  const results: BacktestResult[] = [];

  for (const idea of ideas) {
    const result = await vectorizedBacktest(idea, candles, closeSeries);
    results.push(result);
  }

  return results;
}

async function runTaAnalysis(payload: { symbol: string; timeframe: string; candles: MarketData[] }) {
  const { symbol, timeframe, candles } = payload;
  return taModule.analyzeMarket(symbol, timeframe, candles);
}

parentPort?.on('message', async (task: AnalysisTask) => {
  const { id, type, payload } = task || {};

  try {
    if (!id || !type) {
      throw new Error('Invalid task payload');
    }

    if (type === 'backtestBatch') {
      const result = await runBacktestBatch(payload);
      parentPort?.postMessage({ id, result });
      return;
    }

    if (type === 'ta') {
      const result = await runTaAnalysis(payload);
      parentPort?.postMessage({ id, result });
      return;
    }

    throw new Error(`Unsupported task type: ${type}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort?.postMessage({ id, error: message });
  }
});
