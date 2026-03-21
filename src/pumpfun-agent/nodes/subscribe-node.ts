// Subscribe Node - Discover new pump.fun tokens via pump.fun API
// Fetches recent tokens from pump.fun platform

import logger from '../../shared/logger';
import { PumpFunAgentState } from '../../shared/types';
import { addThought, updateStep } from '../state';
import axios from 'axios';

// pump.fun API endpoints
const PUMPFUN_API_BASE = 'https://api.pump.fun';
const PUMPFUN_FRONTEND_API_BASE = 'https://frontend-api-v3.pump.fun';

const PUMPFUN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
  'Accept': 'application/json',
  'Origin': 'https://pump.fun',
  'Referer': 'https://pump.fun/',
};

/**
 * Subscribe to pump.fun token creation events via HTTP API
 * Collects tokens over a time window
 */
export async function subscribeNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  logger.info(`[SubscribeNode] Fetching tokens from pump.fun API`);

  const discoveredTokens: any[] = [];
  const seenMints = new Set<string>();

  // Fetch tokens from pump.fun API
  try {
    const apiTokens = await fetchTokensFromPumpFun(20);
    for (const token of apiTokens) {
      if (!seenMints.has(token.mintAddress)) {
        seenMints.add(token.mintAddress);
        discoveredTokens.push(token);
      }
    }
    logger.info(`[SubscribeNode] Discovered ${discoveredTokens.length} tokens`);
  } catch (error: any) {
    logger.error('[SubscribeNode] Failed to fetch tokens:', error?.message || error);
  }

  logger.info(`[SubscribeNode] Total discovered: ${discoveredTokens.length} tokens`);

  return {
    ...addThought(state, `Discovered ${discoveredTokens.length} tokens from pump.fun API`),
    ...updateStep(state, 'SUBSCRIBE_COMPLETE'),
    discoveredTokens,
    stats: {
      ...state.stats,
      totalDiscovered: discoveredTokens.length,
    },
  };
}

/**
 * Fetch recent NEW token launches from pump.fun
 * Prioritizes newest coins, falls back to bonding curve / trending
 */
async function fetchTokensFromPumpFun(limit: number = 20): Promise<any[]> {
  const tokens: any[] = [];

  // Strategy 1 (PRIMARY): New launches via frontend-api-v3 /coins/new
  try {
    const newTokens = await fetchNewLaunchCoins(limit);
    tokens.push(...newTokens);
    logger.info(`[SubscribeNode] New launches (primary): ${newTokens.length} tokens`);
  } catch (error) {
    logger.debug('[SubscribeNode] New launches endpoint failed');
  }

  // Strategy 2: Legacy api.pump.fun new/recent coin endpoints
  try {
    const recentTokens = await fetchLegacyNewCoins(limit);
    for (const token of recentTokens) {
      if (!tokens.find((t: any) => t.mintAddress === token.mintAddress)) {
        tokens.push(token);
      }
    }
    logger.info(`[SubscribeNode] Legacy new coins: ${recentTokens.length} tokens`);
  } catch (error) {
    logger.debug('[SubscribeNode] Legacy new coins endpoint failed');
  }

  // Strategy 3: Bonding curve tokens sorted newest-first
  if (tokens.length < limit) {
    try {
      const bondingTokens = await fetchBondingCurveCoinsSorted(limit);
      for (const token of bondingTokens) {
        if (!tokens.find((t: any) => t.mintAddress === token.mintAddress)) {
          tokens.push(token);
        }
      }
      logger.info(`[SubscribeNode] Bonding curve (sorted newest): additional tokens`);
    } catch (error) {
      logger.debug('[SubscribeNode] Bonding curve sorted endpoint failed');
    }
  }

  // Strategy 4: Collections endpoint sorted by newest
  if (tokens.length < limit) {
    try {
      const collectionTokens = await fetchCollectionsSorted(limit);
      for (const token of collectionTokens) {
        if (!tokens.find((t: any) => t.mintAddress === token.mintAddress)) {
          tokens.push(token);
        }
      }
      logger.info(`[SubscribeNode] Collections (sorted newest): additional tokens`);
    } catch (error) {
      logger.debug('[SubscribeNode] Collections endpoint failed');
    }
  }

  // Strategy 5 (FALLBACK): Trending / recommended endpoints (last resort)
  if (tokens.length < limit) {
    try {
      const trendingTokens = await fetchTrendingFallback(limit);
      for (const token of trendingTokens) {
        if (!tokens.find((t: any) => t.mintAddress === token.mintAddress)) {
          tokens.push(token);
        }
      }
      logger.info(`[SubscribeNode] Trending fallback: additional tokens`);
    } catch (error) {
      logger.debug('[SubscribeNode] Trending fallback endpoint failed');
    }
  }

  // Strategy 6: Optional sample fallback for development.
  if (tokens.length === 0) {
    const allowSampleTokens = process.env.PUMPFUN_ALLOW_SAMPLE_TOKENS === 'true';
    if (allowSampleTokens) {
      logger.warn('[SubscribeNode] No tokens from API, adding sample tokens (PUMPFUN_ALLOW_SAMPLE_TOKENS=true)');
      tokens.push(...getSampleTokens());
    } else {
      logger.warn('[SubscribeNode] No tokens from API and sample fallback disabled');
    }
  }

  return tokens.slice(0, limit);
}

/**
 * PRIMARY: Fetch brand new token launches from frontend-api-v3
 * Uses /coins/new which returns the newest created tokens
 */
async function fetchNewLaunchCoins(limit: number = 20): Promise<any[]> {
  const endpoints = [
    // Best endpoint for newest launches
    `${PUMPFUN_FRONTEND_API_BASE}/coins/new?offset=0&limit=${limit}`,
    // Bonding curve tokens sorted by creation time (newest first)
    `${PUMPFUN_FRONTEND_API_BASE}/coins/with-bonding-curve?sort=created_at&order=desc&offset=0&limit=${limit}`,
  ];

  const merged: any[] = [];
  const seenMints = new Set<string>();

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint, {
        timeout: 10000,
        headers: PUMPFUN_HEADERS,
      });

      const payload = normalizeFrontendPayload(response.data);
      if (payload.length > 0) {
        const parsed = payload
          .map((item: any) => unwrapFrontendToken(item))
          .slice(0, limit)
          .map((item: any) => parsePumpFunToken(item))
          .filter((t: any) => t !== null);

        for (const token of parsed) {
          if (!seenMints.has(token.mintAddress)) {
            seenMints.add(token.mintAddress);
            merged.push(token);
          }
        }

        logger.info(`[SubscribeNode] /coins/new endpoint returned ${parsed.length} tokens`);
        // If first endpoint returned results, prefer those and skip second
        if (merged.length >= limit) break;
      }
    } catch (error: any) {
      logger.debug(`[SubscribeNode] New launch endpoint ${endpoint} failed: ${error.message}`);
    }
  }

  return merged.slice(0, limit);
}

/**
 * Legacy api.pump.fun new/recent coin endpoints
 */
async function fetchLegacyNewCoins(limit: number = 20): Promise<any[]> {
  const endpoints = [
    `${PUMPFUN_API_BASE}/new`,
    `${PUMPFUN_API_BASE}/coins/new`,
    `${PUMPFUN_API_BASE}/coins/created`,
    `${PUMPFUN_API_BASE}/recent`,
  ];

  for (const endpoint of endpoints) {
    try {
      logger.debug(`[SubscribeNode] Trying legacy endpoint: ${endpoint}`);
      const response = await axios.get(endpoint, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
          'Accept': 'application/json',
        },
      });

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const parsed = response.data
          .slice(0, limit)
          .map((item: any) => parsePumpFunToken(item))
          .filter((t: any) => t !== null);

        if (parsed.length > 0) {
          logger.info(`[SubscribeNode] Legacy endpoint ${endpoint} returned ${parsed.length} tokens`);
          return parsed;
        }
      }
    } catch (error: any) {
      logger.debug(`[SubscribeNode] Legacy endpoint ${endpoint} failed: ${error.message}`);
    }
  }

  return [];
}

/**
 * Fetch bonding curve tokens sorted by creation time (newest first)
 */
async function fetchBondingCurveCoinsSorted(limit: number = 20): Promise<any[]> {
  const endpoints = [
    `${PUMPFUN_API_BASE}/coins/with-bonding-curve?sort=created_at&order=desc&offset=0&limit=${limit}`,
    `${PUMPFUN_API_BASE}/coins/bonding-curve?sort=created_at&order=desc&offset=0&limit=${limit}`,
    `${PUMPFUN_API_BASE}/coins/active?sort=created_at&order=desc&offset=0&limit=${limit}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
          'Accept': 'application/json',
        },
      });

      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const parsed = response.data
          .slice(0, limit)
          .map((item: any) => parsePumpFunToken(item))
          .filter((t: any) => t !== null);

        if (parsed.length > 0) {
          return parsed;
        }
      }
    } catch (error: any) {
      logger.debug(`[SubscribeNode] Bonding curve sorted endpoint ${endpoint} failed: ${error.message}`);
    }
  }

  return [];
}

/**
 * Fetch from collections endpoint sorted by newest
 */
async function fetchCollectionsSorted(limit: number = 20): Promise<any[]> {
  try {
    const response = await axios.get(
      `${PUMPFUN_API_BASE}/collections?sort=created_at&order=desc&limit=${limit}`,
      {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
          'Accept': 'application/json',
        },
      }
    );

    const payload = normalizeFrontendPayload(response.data);
    if (payload.length > 0) {
      const parsed = payload
        .slice(0, limit)
        .map((item: any) => parsePumpFunToken(item))
        .filter((t: any) => t !== null);

      if (parsed.length > 0) {
        return parsed;
      }
    }
  } catch (error: any) {
    logger.debug(`[SubscribeNode] Collections endpoint failed: ${error.message}`);
  }

  return [];
}

/**
 * FALLBACK: Trending / recommended endpoints (last resort only)
 */
async function fetchTrendingFallback(limit: number = 20): Promise<any[]> {
  const endpoints = [
    `${PUMPFUN_FRONTEND_API_BASE}/coins?offset=0&limit=${limit}`,
    `${PUMPFUN_FRONTEND_API_BASE}/coins/recommended?limit=${limit}`,
    `${PUMPFUN_FRONTEND_API_BASE}/coins/top-runners`,
    `${PUMPFUN_FRONTEND_API_BASE}/coins/trending-search-v2?limit=${limit}`,
  ];

  const merged: any[] = [];
  const seenMints = new Set<string>();

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint, {
        timeout: 10000,
        headers: PUMPFUN_HEADERS,
      });

      const payload = normalizeFrontendPayload(response.data);
      if (payload.length > 0) {
        const parsed = payload
          .map((item: any) => unwrapFrontendToken(item))
          .slice(0, limit)
          .map((item: any) => parsePumpFunToken(item))
          .filter((t: any) => t !== null);

        for (const token of parsed) {
          if (!seenMints.has(token.mintAddress)) {
            seenMints.add(token.mintAddress);
            merged.push(token);
          }
        }
      }
    } catch (error: any) {
      logger.debug(`[SubscribeNode] Trending fallback endpoint ${endpoint} failed: ${error.message}`);
    }
  }

  return merged.slice(0, limit);
}

/**
 * Normalize frontend API payload shape to a flat array.
 */
function normalizeFrontendPayload(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.coins)) return data.coins;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

/**
 * Unwrap alternate frontend endpoint item shapes (e.g. { coin: {...} }).
 */
function unwrapFrontendToken(item: any): any {
  if (item?.coin && typeof item.coin === 'object') {
    return {
      ...item.coin,
      description: item.description || item.coin.description || '',
    };
  }
  return item;
}

/**
 * Parse pump.fun API response to our token format
 */
function parsePumpFunToken(data: any): any {
  if (!data) return null;

  // Extract mint address - could be in different fields
  const mint = data.mint || data.address || data.mint_address || data.token_address || '';
  if (!mint) return null;

  const createdRaw = data.created_at || data.created_timestamp || data.createdAt;
  const createdAt = typeof createdRaw === 'number'
    ? new Date(createdRaw < 1e12 ? createdRaw * 1000 : createdRaw)
    : (createdRaw ? new Date(createdRaw) : new Date());

  return {
    mintAddress: mint,
    name: data.name || data.token_name || 'Unknown',
    symbol: data.symbol || data.ticker || data.token_symbol || 'UNKNOWN',
    metadataUri: data.metadata_uri || data.uri || data.metadata || '',
    bondingCurveKey: data.bonding_curve_key || data.bonding_curve || data.bondingCurve || '',
    createdAt,
    txSignature: data.signature || data.tx_signature || '',
    // Include extra data for analysis
    image: data.image || data.image_uri || data.img || '',
    twitter: data.twitter || data.twitter_handle || data.twitter_username || data.twitter_url || '',
    telegram: data.telegram || data.telegram_url || data.tg || '',
    discord: data.discord || '',
    website: data.website || data.website_url || '',
    description: data.description || data.desc || '',
  };
}

/**
 * Get sample tokens for testing when API fails
 */
function getSampleTokens(): any[] {
  return [
    {
      mintAddress: 'DuFC92DWzBPL3pzpKSBPuMr4cgjiRkUxQkZmGydcKBtm',
      name: 'Test Token Alpha',
      symbol: 'ALPHA',
      metadataUri: 'https://example.com/metadata/alpha',
      bondingCurveKey: '',
      createdAt: new Date(),
      txSignature: '',
      image: '',
      twitter: 'twitter.com',
      telegram: 't.me/test',
      discord: '',
      website: 'https://example.com',
      description: 'A test token for development purposes',
    },
    {
      mintAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      name: 'Beta Coin',
      symbol: 'BETA',
      metadataUri: 'https://example.com/metadata/beta',
      bondingCurveKey: '',
      createdAt: new Date(),
      txSignature: '',
      image: '',
      twitter: '',
      telegram: '',
      discord: 'discord.gg/test',
      website: '',
      description: 'Another test token for analysis pipeline',
    },
    {
      mintAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      name: 'Gamma Token',
      symbol: 'GAMMA',
      metadataUri: 'https://example.com/metadata/gamma',
      bondingCurveKey: '',
      createdAt: new Date(),
      txSignature: '',
      image: '',
      twitter: 'twitter.com/gamma',
      telegram: 't.me/gamma',
      discord: 'discord.gg/gamma',
      website: 'https://gamma.example.com',
      description: 'Test token with full social presence',
    },
  ];
}

function addError(state: PumpFunAgentState, error: string): Partial<PumpFunAgentState> {
  return {
    ...state,
    errors: [...state.errors, error],
  };
}
