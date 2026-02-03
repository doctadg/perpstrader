// Prediction Market Data Node

import { PredictionAgentState } from '../state';
import polymarketClient from '../polymarket-client';
import predictionStore from '../../data/prediction-store';
import predictionExecutionEngine from '../execution-engine';
import logger from '../../shared/logger';

const DEFAULT_MARKET_LIMIT = Number.parseInt(process.env.PREDICTION_MARKET_LIMIT || '40', 10) || 40;
const MIN_VOLUME = Number.parseFloat(process.env.PREDICTION_MIN_VOLUME || '10000');
const MAX_AGE_DAYS = Number.parseInt(process.env.PREDICTION_MARKET_MAX_AGE_DAYS || '30', 10) || 30;

function isTradable(market: PredictionAgentState['marketUniverse'][number]): boolean {
  if (!market) return false;
  // Explicitly reject closed/resolved markets instead of requiring OPEN
  if (market.status === 'CLOSED' || market.status === 'RESOLVED') return false;
  const hasBinary = Number.isFinite(market.yesPrice) && Number.isFinite(market.noPrice);
  // Ensure prices are meaningful (not both 0, which happens on closed markets)
  const hasMeaningfulPrices = (market.yesPrice ?? 0) > 0 || (market.noPrice ?? 0) > 0;
  return hasBinary && hasMeaningfulPrices;
}

function marketVolumeScore(market: PredictionAgentState['marketUniverse'][number]): number {
  return Number.isFinite(market.volume) ? (market.volume as number) : 0;
}

function marketRecency(market: PredictionAgentState['marketUniverse'][number]): number {
  const meta = market.metadata as Record<string, any> | undefined;
  const metaTimestamp = meta?.marketTimestamp;
  if (typeof metaTimestamp === 'number' && Number.isFinite(metaTimestamp)) {
    return metaTimestamp > 1e12 ? metaTimestamp : metaTimestamp * 1000;
  }
  if (typeof metaTimestamp === 'string') {
    const parsed = Date.parse(metaTimestamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (market.closeTime) return market.closeTime.getTime();
  return market.updatedAt?.getTime?.() || 0;
}

export async function marketDataNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info('[PredictionMarketData] Fetching Polymarket markets');

  const markets = await polymarketClient.fetchMarkets(DEFAULT_MARKET_LIMIT * 3);

  if (!markets.length) {
    return {
      currentStep: 'MARKET_DATA_EMPTY',
      marketUniverse: [],
      activeMarkets: [],
      thoughts: [...state.thoughts, 'No prediction markets available'],
      errors: [...state.errors, 'Prediction market data unavailable'],
    };
  }

  const tradable = markets.filter(isTradable).filter(market => marketVolumeScore(market) >= MIN_VOLUME);
  tradable.sort((a, b) => {
    const volumeDelta = marketVolumeScore(b) - marketVolumeScore(a);
    if (volumeDelta !== 0) return volumeDelta;
    return marketRecency(b) - marketRecency(a);
  });
  const activeMarkets = tradable.slice(0, DEFAULT_MARKET_LIMIT);

  for (const market of activeMarkets) {
    predictionStore.recordMarketSnapshot({
      marketId: market.id,
      timestamp: new Date(),
      yesPrice: market.yesPrice ?? null,
      noPrice: market.noPrice ?? null,
      volume: market.volume ?? null,
      liquidity: market.liquidity ?? null,
    });
    predictionExecutionEngine.updateMarketPrice(market.id, market.yesPrice, market.noPrice);
  }

  return {
    currentStep: 'MARKET_DATA_READY',
    marketUniverse: markets,
    activeMarkets,
    portfolio: predictionExecutionEngine.getPortfolio(),
    thoughts: [
      ...state.thoughts,
      `Loaded ${markets.length} markets`,
      `Active markets: ${activeMarkets.length}`,
    ],
  };
}

export default marketDataNode;
