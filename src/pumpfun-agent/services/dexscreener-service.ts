// DexScreener Service — Real-time market data for Solana tokens
// Free, no API key, ~300 req/min rate limit
// Provides: buy/sell txns, price changes, liquidity, volume, social links

import logger from '../../shared/logger';

const DEXSCREENER_BASE = 'https://api.dexscreener.com';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  info?: {
    imageUrl?: string;
    websites?: { url: string; label: string }[];
    socials?: { url: string; type: string }[];
  };
}

export interface DexScreenerResult {
  sellPressureDetected: boolean;
  dumpDetected: boolean;
  lowLiquidity: boolean;
  socialLinks: { twitter?: string; telegram?: string; discord?: string; website?: string };
  metrics: {
    buySellRatio1h: number;  // buys / (buys + sells) in last hour
    priceChange1h: number;
    volume1h: number;
    liquidityUsd: number;
    pairAgeMinutes: number;
  };
  rejectReasons: string[];
  scorePenalty: number;
}

// ── Thresholds ───────────────────────────────────────────────────────────────

const THRESHOLDS = {
  // Sell pressure: if sells > buys * this multiplier in 1h
  sellPressureMultiplier: 2.0,
  // Price dump: if price dropped more than this % in 1h
  priceDumpPct: -30,
  // Low liquidity: if liquidity below this USD value
  minLiquidityUsd: 3000,
  // Very low volume (dead token)
  minVolume1h: 50,
  // Cache TTL in ms (10 seconds — market data is time-sensitive)
  cacheTtlMs: 10_000,
};

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const pairCache = new Map<string, CacheEntry<DexPair[]>>();

function getCachedPairs(mintAddress: string): DexPair[] | null {
  const entry = pairCache.get(mintAddress);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > THRESHOLDS.cacheTtlMs) {
    pairCache.delete(mintAddress);
    return null;
  }
  return entry.data;
}

function setCachedPairs(mintAddress: string, pairs: DexPair[]): void {
  pairCache.set(mintAddress, { data: pairs, timestamp: Date.now() });
  // Evict old entries
  if (pairCache.size > 300) {
    const now = Date.now();
    for (const [k, v] of pairCache) {
      if (now - v.timestamp > THRESHOLDS.cacheTtlMs) pairCache.delete(k);
    }
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PerpsTrader/2.0',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get all trading pairs for a token across all DEXes
 */
export async function getPairs(mintAddress: string): Promise<DexPair[]> {
  const cached = getCachedPairs(mintAddress);
  if (cached) return cached;

  try {
    const resp = await fetchWithTimeout(`${DEXSCREENER_BASE}/latest/dex/tokens/${mintAddress}`);

    if (!resp.ok) {
      // DexScreener returns 200 with empty pairs array for unknown tokens
      if (resp.status === 429) {
        logger.warn('[DexScreener] Rate limited');
      }
      return [];
    }

    const data = await resp.json();
    const pairs: DexPair[] = data.pairs || [];
    setCachedPairs(mintAddress, pairs);
    return pairs;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.debug(`[DexScreener] Timeout for ${mintAddress.slice(0, 8)}`);
    } else {
      logger.debug(`[DexScreener] Error for ${mintAddress.slice(0, 8)}: ${err.message}`);
    }
    return [];
  }
}

/**
 * Get the primary Solana pair for a token (highest liquidity)
 */
export async function getPrimaryPair(mintAddress: string): Promise<DexPair | null> {
  const pairs = await getPairs(mintAddress);
  if (pairs.length === 0) return null;

  // Filter for Solana pairs, prefer pump.fun pairs
  const solanaPairs = pairs.filter(p => p.chainId === 'solana');
  if (solanaPairs.length === 0) return pairs[0]; // fallback to any chain

  // Sort by liquidity descending, return top
  solanaPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  return solanaPairs[0];
}

/**
 * Evaluate token market data for sell pressure, dumps, low liquidity
 */
export async function evaluateMarket(mintAddress: string): Promise<DexScreenerResult> {
  const emptyResult: DexScreenerResult = {
    sellPressureDetected: false,
    dumpDetected: false,
    lowLiquidity: false,
    socialLinks: {},
    metrics: {
      buySellRatio1h: 0.5,
      priceChange1h: 0,
      volume1h: 0,
      liquidityUsd: 0,
      pairAgeMinutes: 0,
    },
    rejectReasons: [],
    scorePenalty: 0,
  };

  const pair = await getPrimaryPair(mintAddress);
  if (!pair) {
    // No pair yet — token too new, not a rejection signal
    return emptyResult;
  }

  const rejectReasons: string[] = [];
  let scorePenalty = 0;
  let sellPressureDetected = false;
  let dumpDetected = false;
  let lowLiquidity = false;

  // ── TRANSACTION ANALYSIS ─────────────────────────────────────────────────
  const txns1h = pair.txns?.h1 || { buys: 0, sells: 0 };
  const totalTxns1h = txns1h.buys + txns1h.sells;
  const buySellRatio1h = totalTxns1h > 0 ? txns1h.buys / totalTxns1h : 0.5;

  // Sell pressure: sells significantly outnumber buys
  if (totalTxns1h > 5 && txns1h.sells > txns1h.buys * THRESHOLDS.sellPressureMultiplier) {
    sellPressureDetected = true;
    rejectReasons.push(
      `SELL_PRESSURE: ${txns1h.sells} sells vs ${txns1h.buys} buys in 1h ` +
      `(ratio: ${(buySellRatio1h * 100).toFixed(0)}%)`
    );
    scorePenalty += 0.3;
  }

  // ── PRICE CHANGE ────────────────────────────────────────────────────────
  const priceChange1h = pair.priceChange?.h1 || 0;

  if (priceChange1h < THRESHOLDS.priceDumpPct) {
    dumpDetected = true;
    rejectReasons.push(`PRICE_DUMP: ${priceChange1h.toFixed(1)}% in 1h`);
    scorePenalty += 0.4;
  } else if (priceChange1h < -15) {
    rejectReasons.push(`PRICE_DECLINE: ${priceChange1h.toFixed(1)}% in 1h`);
    scorePenalty += 0.15;
  }

  // ── LIQUIDITY ───────────────────────────────────────────────────────────
  const liquidityUsd = pair.liquidity?.usd || 0;

  if (liquidityUsd < THRESHOLDS.minLiquidityUsd) {
    lowLiquidity = true;
    rejectReasons.push(`LOW_LIQUIDITY: $${liquidityUsd.toFixed(0)} (<$${THRESHOLDS.minLiquidityUsd})`);
    scorePenalty += 0.25;
  }

  // ── VOLUME (dead token check) ───────────────────────────────────────────
  const volume1h = pair.volume?.h1 || 0;
  const pairAgeMinutes = pair.pairCreatedAt
    ? (Date.now() - pair.pairCreatedAt) / 60_000
    : 0;

  // If token is older than 30 min and has zero volume, it's likely dead
  if (pairAgeMinutes > 30 && volume1h < THRESHOLDS.minVolume1h) {
    rejectReasons.push(`ZERO_VOLUME: $${volume1h.toFixed(0)} in 1h (age: ${pairAgeMinutes.toFixed(0)}min)`);
    scorePenalty += 0.2;
  }

  // ── SOCIAL LINKS (cross-verification) ───────────────────────────────────
  const socialLinks: DexScreenerResult['socialLinks'] = {};

  for (const social of pair.info?.socials || []) {
    if (social.type === 'twitter' || social.url?.includes('twitter.com') || social.url?.includes('x.com')) {
      socialLinks.twitter = social.url;
    } else if (social.type === 'telegram' || social.url?.includes('t.me')) {
      socialLinks.telegram = social.url;
    } else if (social.type === 'discord' || social.url?.includes('discord.gg')) {
      socialLinks.discord = social.url;
    }
  }

  for (const website of pair.info?.websites || []) {
    if (website.label === 'Website' || !socialLinks.website) {
      socialLinks.website = website.url;
    }
  }

  return {
    sellPressureDetected,
    dumpDetected,
    lowLiquidity,
    socialLinks,
    metrics: {
      buySellRatio1h,
      priceChange1h,
      volume1h,
      liquidityUsd,
      pairAgeMinutes,
    },
    rejectReasons,
    scorePenalty: Math.min(1.0, scorePenalty),
  };
}

/**
 * Check if a token has any DexScreener data at all
 * Returns true if the token has at least one trading pair
 */
export async function hasPairData(mintAddress: string): Promise<boolean> {
  const pairs = await getPairs(mintAddress);
  return pairs.length > 0;
}

// ── Gate function for security-node integration ──────────────────────────────

export interface DexScreenerGateResult {
  pass: boolean;
  reason: string;
}

/**
 * DexScreener gate — quick pass/fail for security-node pipeline.
 * Checks for sell pressure, price dumps, and liquidity issues.
 */
export async function dexScreenerGate(
  mintAddress: string,
  symbol: string = 'UNKNOWN'
): Promise<DexScreenerGateResult> {
  const eval_ = await evaluateMarket(mintAddress);

  // If no data at all, let it pass (token too new for market data)
  if (eval_.rejectReasons.length === 0 && eval_.metrics.liquidityUsd === 0) {
    return { pass: true, reason: '' };
  }

  // Auto-reject: sell pressure + dump = almost certainly a rug in progress
  if (eval_.sellPressureDetected && eval_.dumpDetected) {
    return {
      pass: false,
      reason: `SELL_PRESSURE + PRICE_DUMP: ${eval_.rejectReasons.slice(0, 3).join('; ')}`,
    };
  }

  // Auto-reject: significant dump
  if (eval_.dumpDetected) {
    return {
      pass: false,
      reason: `PRICE_DUMP: ${eval_.rejectReasons.join('; ')}`,
    };
  }

  // Auto-reject: severe sell pressure
  if (eval_.sellPressureDetected) {
    return {
      pass: false,
      reason: `SELL_PRESSURE: ${eval_.rejectReasons.join('; ')}`,
    };
  }

  // Let it pass but with warnings logged
  if (eval_.rejectReasons.length > 0) {
    logger.debug(`[DexScreener] Warnings for ${symbol}: ${eval_.rejectReasons.join('; ')}`);
  }

  return { pass: true, reason: '' };
}

export default {
  getPairs,
  getPrimaryPair,
  evaluateMarket,
  hasPairData,
  dexScreenerGate,
};
