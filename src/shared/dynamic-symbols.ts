// Dynamic Symbol Loader
// Fetches all available Hyperliquid markets for trading

import axios from 'axios';
import logger from './logger';

let cachedSymbols: string[] = [];
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all available trading symbols from Hyperliquid
 */
export async function fetchAllTradingSymbols(): Promise<string[]> {
  const now = Date.now();
  if (cachedSymbols.length > 0 && now - lastFetch < CACHE_TTL) {
    return cachedSymbols;
  }

  try {
    const response = await axios.post('https://api.hyperliquid.xyz/info', 
      { type: 'meta' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    const symbols = response.data.universe.map((asset: any) => asset.name);
    cachedSymbols = symbols;
    lastFetch = now;

    logger.info(`[DynamicSymbols] Loaded ${symbols.length} trading symbols from Hyperliquid`);
    return symbols;
  } catch (error) {
    logger.error('[DynamicSymbols] Failed to fetch symbols:', error);
    // Return default set if fetch fails
    return ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE', 'PEPE', 'WIF'];
  }
}

/**
 * Get top N symbols by 24h volume
 */
export async function getTopVolumeSymbols(limit: number = 50): Promise<string[]> {
  try {
    const response = await axios.post('https://api.hyperliquid.xyz/info',
      { type: 'metaAndAssetCtxs' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    const [meta, ctxs] = response.data;
    
    const markets = meta.universe.map((asset: any, index: number) => ({
      symbol: asset.name,
      volume: parseFloat(ctxs[index]?.dayNtlVlm || '0'),
    }));

    markets.sort((a: any, b: any) => b.volume - a.volume);

    return markets.slice(0, limit).map((m: any) => m.symbol);
  } catch (error) {
    logger.error('[DynamicSymbols] Failed to fetch top volume:', error);
    return ['BTC', 'ETH', 'SOL'];
  }
}

/**
 * Get symbols with extreme funding rates
 */
export async function getExtremeFundingSymbols(threshold: number = 0.0001): Promise<{ positive: string[]; negative: string[] }> {
  try {
    const response = await axios.post('https://api.hyperliquid.xyz/info',
      { type: 'metaAndAssetCtxs' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    const [meta, ctxs] = response.data;

    const positive: string[] = [];
    const negative: string[] = [];

    meta.universe.forEach((asset: any, index: number) => {
      const funding = parseFloat(ctxs[index]?.funding || '0');
      if (funding >= threshold) positive.push(asset.name);
      if (funding <= -threshold) negative.push(asset.name);
    });

    return { positive, negative };
  } catch (error) {
    logger.error('[DynamicSymbols] Failed to fetch extreme funding:', error);
    return { positive: [], negative: [] };
  }
}

/**
 * Clear symbol cache
 */
export function clearSymbolCache(): void {
  cachedSymbols = [];
  lastFetch = 0;
  logger.info('[DynamicSymbols] Cache cleared');
}
