// Polymarket client for public market data

import axios from 'axios';
import logger from '../shared/logger';
import { PredictionMarket, PredictionOutcome } from '../shared/types';

const DEFAULT_BASE_URL = process.env.POLYMARKET_API_BASE || 'https://gamma-api.polymarket.com';
const DEFAULT_MARKETS_URL = process.env.POLYMARKET_MARKETS_URL || `${DEFAULT_BASE_URL}/markets`;
const LATEST_WINDOW_DAYS = Number.parseInt(process.env.PREDICTION_MARKET_MAX_AGE_DAYS || '30', 10) || 30;
const DEFAULT_ORDER = process.env.POLYMARKET_MARKETS_ORDER || 'volume24hr';
const DEFAULT_ASCENDING = process.env.POLYMARKET_MARKETS_ASCENDING || 'false';
const DEFAULT_ACTIVE = process.env.POLYMARKET_MARKETS_ACTIVE || 'true';
const DEFAULT_CLOSED = process.env.POLYMARKET_MARKETS_CLOSED || 'false';
const DEFAULT_ARCHIVED = process.env.POLYMARKET_MARKETS_ARCHIVED || 'false';

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

function parseOutcomes(raw: any): PredictionOutcome[] {
  // Parse JSON strings if needed (Polymarket API returns stringified arrays)
  let outcomes = raw?.outcomes;
  let outcomePrices = raw?.outcomePrices;
  let clobTokenIds = raw?.clobTokenIds;

  if (typeof outcomes === 'string') {
    try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
  }
  if (typeof outcomePrices === 'string') {
    try { outcomePrices = JSON.parse(outcomePrices); } catch { outcomePrices = null; }
  }
  if (typeof clobTokenIds === 'string') {
    try { clobTokenIds = JSON.parse(clobTokenIds); } catch { clobTokenIds = null; }
  }

  if (Array.isArray(outcomes) && Array.isArray(outcomePrices)) {
    return outcomes.map((name: string, idx: number) => ({
      id: Array.isArray(clobTokenIds) ? clobTokenIds[idx] : undefined,
      name,
      price: Number(outcomePrices[idx] ?? 0),
    }));
  }

  if (Array.isArray(outcomes) && outcomes.length && typeof outcomes[0] === 'object') {
    return outcomes.map((item: any) => ({
      id: item?.id || item?.token_id,
      name: item?.name || item?.outcome || 'UNKNOWN',
      price: Number(item?.price ?? item?.last_price ?? 0),
    }));
  }

  if (Array.isArray(raw?.tokens)) {
    return raw.tokens.map((item: any) => ({
      id: item?.token_id || item?.id,
      name: item?.outcome || item?.name || 'UNKNOWN',
      price: Number(item?.price ?? item?.last_price ?? 0),
    }));
  }

  return [];
}

function inferYesNo(outcomes: PredictionOutcome[]): { yesPrice?: number; noPrice?: number } {
  if (!outcomes.length) return {};

  const yes = outcomes.find(o => o.name.toLowerCase() === 'yes');
  const no = outcomes.find(o => o.name.toLowerCase() === 'no');

  if (yes && no) {
    return { yesPrice: yes.price, noPrice: no.price };
  }

  if (outcomes.length >= 2) {
    return { yesPrice: outcomes[0].price, noPrice: outcomes[1].price };
  }

  if (outcomes.length === 1) {
    const yesPrice = outcomes[0].price;
    if (Number.isFinite(yesPrice)) {
      return { yesPrice, noPrice: Math.max(0, Math.min(1, 1 - yesPrice)) };
    }
  }

  return {};
}

function normalizeStatus(raw: any): PredictionMarket['status'] {
  if (raw?.closed === true || raw?.archived === true) return 'CLOSED';
  // Check boolean flags first (most reliable for Gamma API where status is null)
  // Note: resolvedBy is the oracle address, not an indication the market is resolved
  if (raw?.closed === false && raw?.active === true) return 'OPEN';
  if (raw?.resolved === true) return 'RESOLVED';
  if (raw?.status) {
    const status = String(raw.status).toUpperCase();
    if (status.includes('OPEN')) return 'OPEN';
    if (status.includes('CLOSED')) return 'CLOSED';
    if (status.includes('RESOLVED')) return 'RESOLVED';
  }
  if (raw?.active === true) return 'OPEN';
  if (raw?.active === false) return 'CLOSED';
  return 'UNKNOWN';
}

function parseNumber(value: any): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeMarket(raw: any): PredictionMarket | null {
  const id = raw?.id || raw?.condition_id || raw?.marketId || raw?.market_id || raw?.slug;
  const title = raw?.title || raw?.question || raw?.name || raw?.description;
  if (!id || !title) return null;

  const outcomes = parseOutcomes(raw);
  const { yesPrice, noPrice } = inferYesNo(outcomes);
  const closeTime = raw?.closeTime
    ? new Date(raw.closeTime)
    : raw?.end_date
      ? new Date(raw.end_date)
      : raw?.resolutionTime
        ? new Date(raw.resolutionTime)
        : null;
  const createdTimestamp = extractTimestamp(raw);
  const fallbackTimestamp = createdTimestamp ?? (closeTime ? closeTime.getTime() : 0);
  const updatedAt = fallbackTimestamp ? new Date(fallbackTimestamp) : new Date(0);
  const volume24hr = parseNumber(raw?.volume24hr ?? raw?.volume24h ?? raw?.volume24hrClob);
  const volume1wk = parseNumber(raw?.volume1wk ?? raw?.volume1wkClob);
  const volume1mo = parseNumber(raw?.volume1mo ?? raw?.volume1moClob);
  const volume1yr = parseNumber(raw?.volume1yr ?? raw?.volume1yrClob);
  const totalVolume = parseNumber(raw?.volume ?? raw?.volumeNum ?? raw?.totalVolume ?? raw?.volumeClob);
  const volume = volume24hr ?? volume1wk ?? volume1mo ?? totalVolume;

  return {
    id: String(id),
    slug: raw?.slug || raw?.market_slug || raw?.question_slug || undefined,
    title: String(title),
    category: raw?.category || raw?.group || raw?.group_title || undefined,
    status: normalizeStatus(raw),
    outcomes,
    yesPrice,
    noPrice,
    volume,
    volume24hr,
    volume1wk,
    volume1mo,
    volume1yr,
    liquidity: Number(raw?.liquidity ?? raw?.liquidity24h) || undefined,
    closeTime,
    source: 'POLYMARKET',
    updatedAt,
    metadata: { ...raw, marketTimestamp: createdTimestamp ?? (closeTime ? closeTime.getTime() : null) },
  };
}

function parseTimestamp(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function extractTimestamp(raw: any): number | null {
  const keys = [
    'updatedAt',
    'updated_at',
    'lastUpdated',
    'last_updated',
    'lastTradeAt',
    'last_trade_at',
    'lastTradeTime',
    'last_trade_time',
    'openTime',
    'start_time',
    'start_date',
    'createdAt',
    'created_at',
    'created',
    'creationTime',
  ];
  for (const key of keys) {
    const value = parseTimestamp(raw?.[key]);
    if (value) return value;
  }
  return null;
}

function marketRecency(market: PredictionMarket): number {
  const meta = market.metadata as Record<string, any> | undefined;
  const metaTs = meta?.marketTimestamp ? parseTimestamp(meta.marketTimestamp) : null;
  if (metaTs) return metaTs;
  if (market.closeTime) return market.closeTime.getTime();
  return market.updatedAt?.getTime?.() || 0;
}

function marketVolumeScore(market: PredictionMarket): number {
  return Number.isFinite(market.volume) ? (market.volume as number) : 0;
}

async function fetchMarkets(limit: number = 100): Promise<PredictionMarket[]> {
  const urls = uniqueUrls([DEFAULT_MARKETS_URL]);
  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        params: {
          limit,
          active: DEFAULT_ACTIVE,
          closed: DEFAULT_CLOSED,
          archived: DEFAULT_ARCHIVED,
          order: DEFAULT_ORDER,
          ascending: DEFAULT_ASCENDING,
        },
        timeout: 30000,
      });

      if (typeof response.data === 'string' && response.data.includes('<html')) {
        logger.warn(`[Polymarket] HTML response from ${url}, skipping`);
        continue;
      }

      const payload = response.data;
      const rawMarkets = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.markets)
            ? payload.markets
            : [];

      const markets = rawMarkets
        .map((raw: any) => normalizeMarket(raw))
        .filter((market: PredictionMarket | null): market is PredictionMarket => !!market);

      const sorted = markets
        .slice()
        .sort((a, b) => {
          const volumeDelta = marketVolumeScore(b) - marketVolumeScore(a);
          if (volumeDelta !== 0) return volumeDelta;
          return marketRecency(b) - marketRecency(a);
        });

      const windowMs = LATEST_WINDOW_DAYS > 0 ? LATEST_WINDOW_DAYS * 24 * 60 * 60 * 1000 : 0;
      const cutoff = windowMs ? Date.now() - windowMs : 0;
      const recent = windowMs
        ? sorted.filter(market => {
          const recency = marketRecency(market);
          return recency > 0 && recency >= cutoff;
        })
        : sorted.filter(market => marketRecency(market) > 0);
      const limited = recent.slice(0, limit);

      logger.info(`[Polymarket] Loaded ${limited.length} latest markets from ${url}`);
      if (limited.length) {
        return limited;
      }
    } catch (error) {
      logger.warn(`[Polymarket] Failed to fetch markets from ${url}:`, error);
    }
  }

  logger.error('[Polymarket] Failed to fetch markets from all endpoints');
  return [];
}

async function fetchCandles(tokenId: string): Promise<{ timestamp: number; price: number }[]> {
  if (!tokenId) return [];
  try {
    const url = `https://clob.polymarket.com/prices-history?interval=1d&market=${tokenId}&fidelity=1`;
    const response = await axios.get(url, { timeout: 10000 });
    const history = response.data?.history || [];
    return history.map((h: any) => ({
      timestamp: h.t * 1000,
      price: Number(h.p)
    }));
  } catch (error: any) {
    logger.warn(`[Polymarket] History fetch failed for ${tokenId}:`, error.message);
    return [];
  }
}

export default {
  fetchMarkets,
  fetchCandles,
};
