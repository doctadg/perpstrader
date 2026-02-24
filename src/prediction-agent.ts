// Main Entry Point - Prediction Markets Agent
// Runs the autonomous prediction trading system (paper trading)

import { runPredictionCycle } from './prediction-markets';
import predictionStore from './data/prediction-store';
import traceStore from './data/trace-store';
import logger from './shared/logger';
import { PredictionBacktestResult, PredictionIdea, PredictionMarketIntel } from './shared/types';
import * as technicalIndicators from 'technicalindicators';

const CYCLE_INTERVAL_MS = Number.parseInt(process.env.PREDICTION_CYCLE_INTERVAL_MS || '90000', 10) || 90000;
const INDICATOR_LOOKBACK = Number.parseInt(process.env.PREDICTION_TRACE_INDICATOR_LOOKBACK || '240', 10) || 240;

type NormalizedStrategyIdea = PredictionIdea & {
  name: string;
  type: string;
  strategyId: string;
  description: string;
};

type NormalizedBacktestResult = PredictionBacktestResult & {
  strategyId: string;
  strategyName: string;
  totalTrades: number;
};

function safeNumber(value: unknown, fallback: number = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeStrategyIdea(idea: PredictionIdea, intel?: PredictionMarketIntel): NormalizedStrategyIdea {
  const name = idea.name || `${idea.marketTitle} (${idea.outcome})`;
  const type = idea.type || 'PREDICTION_MARKET';
  const strategyId = idea.strategyId || idea.id;
  const linkedNewsCount = idea.linkedNewsCount ?? intel?.linkedNewsCount ?? 0;
  const linkedClusterCount = idea.linkedClusterCount ?? intel?.linkedClusterCount ?? 0;
  const heatScore = idea.heatScore ?? intel?.avgClusterHeat ?? 0;
  const sentimentScore = idea.sentimentScore ?? intel?.sentimentScore ?? 0;
  const summary = idea.summary
    || `${type} | Edge ${(safeNumber(idea.edge) * 100).toFixed(1)}% | Heat ${safeNumber(heatScore).toFixed(1)} | News ${linkedNewsCount}`;

  return {
    ...idea,
    name,
    type,
    strategyId,
    summary,
    linkedNewsCount,
    linkedClusterCount,
    heatScore: Number(safeNumber(heatScore).toFixed(2)),
    sentimentScore: Number(safeNumber(sentimentScore).toFixed(3)),
    description: idea.rationale,
  };
}

function normalizeBacktestResult(
  result: PredictionBacktestResult,
  ideasById: Map<string, NormalizedStrategyIdea>,
): NormalizedBacktestResult {
  const idea = ideasById.get(result.ideaId);
  const strategyId = result.strategyId || idea?.strategyId || result.ideaId;
  const strategyName = result.strategyName || idea?.name || `${idea?.marketTitle || result.marketId} (${idea?.outcome || 'YES'})`;
  const totalTrades = Number.isFinite(result.totalTrades) ? Number(result.totalTrades) : result.tradesSimulated;

  return {
    ...result,
    strategyId,
    strategyName,
    totalTrades,
    tradesSimulated: totalTrades,
  };
}

function getPredictionPriceSeries(idea: PredictionIdea): number[] {
  const history = predictionStore.getMarketPrices(idea.marketId, INDICATOR_LOOKBACK);
  return history
    .map(point => idea.outcome === 'YES' ? point.yesPrice : point.noPrice)
    .filter((value): value is number => Number.isFinite(value) && (value as number) > 0)
    .slice(-INDICATOR_LOOKBACK);
}

function buildPredictionIndicators(selectedIdea: PredictionIdea | null, selectedIntel?: PredictionMarketIntel): Record<string, any> | null {
  if (!selectedIdea) return null;

  const prices = getPredictionPriceSeries(selectedIdea);
  const edge = safeNumber(selectedIdea.edge);
  const sentiment = safeNumber(selectedIntel?.sentimentScore, safeNumber(selectedIdea.sentimentScore));
  const heat = safeNumber(selectedIntel?.avgClusterHeat, safeNumber(selectedIdea.heatScore));

  const indicators = {
    rsi: [] as number[],
    macd: {
      macd: [] as number[],
      signal: [] as number[],
      histogram: [] as number[],
    },
    bollinger: {
      upper: [] as number[],
      middle: [] as number[],
      lower: [] as number[],
    },
    volatility: {
      atr: [] as number[],
      standardDeviation: [] as number[],
    },
  };

  try {
    if (prices.length >= 15) {
      indicators.rsi = technicalIndicators.RSI.calculate({ values: prices, period: 14 });
    }
  } catch (error) {
    logger.debug('[PredictionMain] RSI calculation failed, using fallback');
  }

  try {
    if (prices.length >= 35) {
      const macdRaw = technicalIndicators.MACD.calculate({
        values: prices,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });
      for (const point of macdRaw) {
        if (!Number.isFinite(point.MACD) || !Number.isFinite(point.signal) || !Number.isFinite(point.histogram)) continue;
        indicators.macd.macd.push(point.MACD as number);
        indicators.macd.signal.push(point.signal as number);
        indicators.macd.histogram.push(point.histogram as number);
      }
    }
  } catch (error) {
    logger.debug('[PredictionMain] MACD calculation failed, using fallback');
  }

  try {
    if (prices.length >= 20) {
      const bands = technicalIndicators.BollingerBands.calculate({
        values: prices,
        period: 20,
        stdDev: 2,
      });
      indicators.bollinger.upper = bands.map(band => band.upper);
      indicators.bollinger.middle = bands.map(band => band.middle);
      indicators.bollinger.lower = bands.map(band => band.lower);
    }
  } catch (error) {
    logger.debug('[PredictionMain] Bollinger calculation failed, using fallback');
  }

  try {
    if (prices.length >= 15) {
      const highs = prices.map((price, index) => {
        const previous = index > 0 ? prices[index - 1] : price;
        const range = Math.max(0.002, Math.abs(price - previous));
        return Math.min(0.999, price + range * 0.5);
      });
      const lows = prices.map((price, index) => {
        const previous = index > 0 ? prices[index - 1] : price;
        const range = Math.max(0.002, Math.abs(price - previous));
        return Math.max(0.001, price - range * 0.5);
      });
      indicators.volatility.atr = technicalIndicators.ATR.calculate({
        high: highs,
        low: lows,
        close: prices,
        period: 14,
      });
    }
  } catch (error) {
    logger.debug('[PredictionMain] ATR calculation failed, using fallback');
  }

  if (!indicators.rsi.length) {
    const fallbackRsi = 50 + (sentiment * 26) + (edge * 120);
    indicators.rsi = [Math.max(5, Math.min(95, fallbackRsi))];
  }

  if (!indicators.macd.macd.length) {
    const fallbackMacd = (edge * 2) + (sentiment * 0.4);
    indicators.macd.macd = [fallbackMacd];
    indicators.macd.signal = [fallbackMacd * 0.65];
    indicators.macd.histogram = [fallbackMacd * 0.35];
  }

  if (!indicators.bollinger.upper.length) {
    const base = safeNumber(selectedIdea.impliedProbability, 0.5);
    const spread = Math.max(0.03, Math.min(0.2, Math.abs(edge) * 1.2 + (heat / 100) * 0.04));
    indicators.bollinger.upper = [Math.min(0.999, base + spread)];
    indicators.bollinger.middle = [base];
    indicators.bollinger.lower = [Math.max(0.001, base - spread)];
  }

  if (!indicators.volatility.atr.length) {
    indicators.volatility.atr = [Math.max(0.005, Math.min(0.3, Math.abs(edge) * 0.8 + Math.abs(sentiment) * 0.05))];
  }

  return indicators;
}

function buildTraceMarketIntel(
  marketIntel: Record<string, PredictionMarketIntel> | undefined,
  selectedMarketId?: string,
): Record<string, any> | null {
  if (!marketIntel) return null;

  const intelList = Object.values(marketIntel);
  const marketsWithNews = intelList.filter(intel => intel.linkedNewsCount > 0).length;
  const marketsWithHeat = intelList.filter(intel => intel.linkedClusterCount > 0).length;
  const avgHeat = marketsWithHeat > 0
    ? intelList.filter(intel => intel.linkedClusterCount > 0).reduce((sum, intel) => sum + intel.avgClusterHeat, 0) / marketsWithHeat
    : 0;

  return {
    selected: selectedMarketId ? (marketIntel[selectedMarketId] || null) : null,
    byMarket: marketIntel,
    summary: {
      marketsTracked: intelList.length,
      marketsWithNews,
      marketsWithHeat,
      avgHeat: Number(avgHeat.toFixed(2)),
    },
  };
}

async function main() {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('  Prediction Markets Agent - Starting');
  logger.info('═══════════════════════════════════════════════════════════');

  predictionStore.initialize();
  traceStore.initialize();

  let cycleCount = 0;
  while (true) {
    cycleCount++;
    logger.info(`\n╔══════════════════════════════════════════════════════════╗`);
    logger.info(`║  PREDICTION CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
    logger.info(`╚══════════════════════════════════════════════════════════╝`);

    try {
      const result = await runPredictionCycle();
      const intelByMarket = result.marketIntel || {};
      const normalizedIdeas = result.ideas.map(idea => normalizeStrategyIdea(idea, intelByMarket[idea.marketId]));
      const ideasById = new Map(normalizedIdeas.map(idea => [idea.id, idea]));
      const normalizedBacktests = result.backtestResults.map(backtest => normalizeBacktestResult(backtest, ideasById));
      const selectedIdea = result.selectedIdea ? normalizeStrategyIdea(result.selectedIdea, intelByMarket[result.selectedIdea.marketId]) : null;
      const selectedIntel = selectedIdea ? intelByMarket[selectedIdea.marketId] : undefined;
      const indicators = buildPredictionIndicators(selectedIdea, selectedIntel);
      const marketIntelPayload = buildTraceMarketIntel(intelByMarket, selectedIdea?.marketId);
      const signal = result.signal
        ? { ...result.signal, strategyId: selectedIdea?.strategyId || result.signal.id }
        : null;

      const tradeExecuted = !!result.executionResult;
      traceStore.storeTrace({
        cycleId: result.cycleId,
        startTime: result.cycleStartTime,
        endTime: new Date(),
        symbol: selectedIdea?.name || result.selectedIdea?.marketTitle || result.selectedIdea?.marketId || 'PREDICTION_MARKETS',
        timeframe: selectedIdea?.timeHorizon || result.selectedIdea?.timeHorizon || 'prediction',
        success: result.errors.length === 0,
        tradeExecuted,
        regime: selectedIntel ? `${selectedIntel.trendDirection}_${selectedIntel.urgency}` : null,
        indicators,
        marketIntel: marketIntelPayload,
        candles: [],
        similarPatternsCount: selectedIntel?.linkedClusterCount || 0,
        strategyIdeas: normalizedIdeas,
        backtestResults: normalizedBacktests,
        selectedStrategy: selectedIdea,
        signal,
        riskAssessment: result.riskAssessment,
        executionResult: result.executionResult,
        thoughts: result.thoughts,
        errors: result.errors,
        agentType: 'PREDICTION',
      });

      logger.info(`[PredictionMain] Cycle complete: Ideas ${result.ideas.length}, Executed ${tradeExecuted ? 'yes' : 'no'}`);
    } catch (error) {
      logger.error('[PredictionMain] Cycle failed:', error);
    }

    logger.info(`[PredictionMain] Waiting ${CYCLE_INTERVAL_MS / 1000}s before next cycle...`);
    await sleep(CYCLE_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch((error) => {
  logger.error('[PredictionMain] Fatal error:', error);
  process.exit(1);
});
