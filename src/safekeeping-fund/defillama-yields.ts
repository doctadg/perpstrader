// Safekeeping Fund System - DefiLlama Yields Integration
// Fetches real pool APY/APR data from DefiLlama for PancakeSwap V3 and Meteora pools

import axios from 'axios';
import logger from '../shared/logger';
import type { Chain, DEX, PoolOpportunity, Token } from './types';

const DEFILLAMA_POOLS_URL = 'https://yields.llama.fi/pools';

interface DefiLlamaPool {
  id: string;
  chain: string;
  project: string;        // e.g. "pancakeswap-v3", "meteora-dlmm"
  symbol: string;         // e.g. "USDC-USDT"
  tvlUsd: number;
  apy: number;
  apyMean30d: number;
  apyBase: number;
  apyReward: number;
  apyPct1D: number;
  apyPct7D: number;
  apyPct30D: number;
  volumeUsd1d: number;
  volumeUsd7d: number;
  volumeUsd30d: number;
  liquidityUsd: number;
  stablecoin: boolean;
  listedAt: number;
  rewardTokens: object[];
  ilRisk: string;
  exposure: string;
  confidence: {
    type: string;
    level: string;
  };
  mu: number;
  sigma: number;
  category: string;
  outbreak: boolean;
}

// Mapping from DefiLlama chain names to our Chain type
const CHAIN_MAP: Record<string, Chain> = {
  Ethereum: 'ethereum',
  BSC: 'bsc',
  'BNB Smart Chain': 'bsc',
  Solana: 'solana',
};

// Mapping from DefiLlama project names to our DEX type
const PROJECT_MAP: Record<string, DEX> = {
  'pancakeswap-v3': 'pancakeswap_v3',
  'pancakeswap': 'pancakeswap_v3',
  'pancake-swap': 'pancakeswap_v3',
  'meteora': 'meteora',
  'meteora-dlmm': 'meteora',
  'uniswap-v3': 'uniswap_v3',
  'uniswap': 'uniswap_v3',
};

// Projects we want to monitor
const TARGET_PROJECTS = [
  'pancakeswap-v3',
  'pancakeswap',
  'pancake-swap',
  'meteora',
  'meteora-dlmm',
  'uniswap-v3',
  'uniswap',
];

// Target chains
const TARGET_CHAINS = ['Ethereum', 'BSC', 'BNB Smart Chain', 'Solana'];

// Minimum TVL threshold (USD) to consider a pool
const MIN_TVL = 50_000;

// Minimum volume threshold (24h USD) to consider a pool
const MIN_VOLUME_24H = 10_000;

class DefiLlamaYields {
  private cache: Map<string, { pools: PoolOpportunity[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Fetch all relevant pool data from DefiLlama
   */
  async fetchPools(): Promise<PoolOpportunity[]> {
    const cacheKey = 'all-pools';
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.debug('[DefiLlama] Returning cached pool data');
      return cached.pools;
    }

    try {
      logger.info('[DefiLlama] Fetching pool yields from DefiLlama...');

      const response = await axios.get(DEFILLAMA_POOLS_URL, {
        timeout: 30_000,
        headers: {
          'User-Agent': 'PerpsTrader-SafekeepingFund/1.0',
        },
      });

      const data = response.data;

      if (!data || !data.data) {
        logger.warn('[DefiLlama] No data in response');
        return cached?.pools || [];
      }

      const rawPools: DefiLlamaPool[] = data.data;

      // Filter for our target DEXs and chains
      const filtered = rawPools.filter(pool => {
        const isTargetChain = TARGET_CHAINS.includes(pool.chain);
        const isTargetProject = TARGET_PROJECTS.includes(pool.project.toLowerCase());
        return isTargetChain && isTargetProject;
      });

      logger.info(
        `[DefiLlama] Found ${filtered.length} pools across target DEXs ` +
        `(from ${rawPools.length} total)`
      );

      // Filter by minimum TVL and volume
      const qualified = filtered.filter(
        pool => pool.tvlUsd >= MIN_TVL && pool.volumeUsd1d >= MIN_VOLUME_24H
      );

      logger.info(`[DefiLlama] ${qualified.length} pools meet TVL/volume thresholds`);

      // Convert to our PoolOpportunity format
      const opportunities = qualified.map(pool => this.toPoolOpportunity(pool));

      // Sort by effective APR descending
      opportunities.sort((a, b) => b.effectiveAPR - a.effectiveAPR);

      // Cache the result
      this.cache.set(cacheKey, { pools: opportunities, timestamp: Date.now() });

      // Log top pools
      const top5 = opportunities.slice(0, 5);
      for (const opp of top5) {
        logger.info(
          `[DefiLlama] ${opp.dex} ${opp.chain}: ${opp.token0.symbol}/${opp.token1.symbol} ` +
          `APR: ${opp.effectiveAPR.toFixed(2)}% TVL: $${(opp.tvl / 1e6).toFixed(2)}M ` +
          `Volume24h: $${(opp.volume24h / 1e3).toFixed(0)}K`
        );
      }

      return opportunities;
    } catch (error) {
      logger.error(`[DefiLlama] Failed to fetch pools: ${error}`);

      // Return stale cache if available
      if (cached) {
        logger.warn('[DefiLlama] Using stale cache data');
        return cached.pools;
      }

      return [];
    }
  }

  /**
   * Fetch pools for a specific DEX
   */
  async fetchPoolsByDEX(dex: DEX): Promise<PoolOpportunity[]> {
    const allPools = await this.fetchPools();
    return allPools.filter(p => p.dex === dex);
  }

  /**
   * Fetch pools for a specific chain
   */
  async fetchPoolsByChain(chain: Chain): Promise<PoolOpportunity[]> {
    const allPools = await this.fetchPools();
    return allPools.filter(p => p.chain === chain);
  }

  /**
   * Fetch only stablecoin pairs (lowest risk)
   */
  async fetchStablePools(): Promise<PoolOpportunity[]> {
    const allPools = await this.fetchPools();
    const stablecoins = ['USDC', 'USDT', 'DAI', 'FDUSD', 'BUSD', 'TUSD'];
    return allPools.filter(
      p => stablecoins.includes(p.token0.symbol) && stablecoins.includes(p.token1.symbol)
    );
  }

  /**
   * Get summary statistics
   */
  async getSummary(): Promise<{
    totalPools: number;
    avgAPR: number;
    bestAPR: number;
    byDEX: Record<string, { count: number; avgAPR: number; bestAPR: number; totalTVL: number }>;
    byChain: Record<string, { count: number; avgAPR: number; totalTVL: number }>;
  }> {
    const pools = await this.fetchPools();

    const byDEX: Record<string, { count: number; avgAPR: number; bestAPR: number; totalTVL: number }> = {};
    const byChain: Record<string, { count: number; avgAPR: number; totalTVL: number }> = {};

    let totalAPR = 0;
    let bestAPR = 0;

    for (const pool of pools) {
      totalAPR += pool.effectiveAPR;
      if (pool.effectiveAPR > bestAPR) bestAPR = pool.effectiveAPR;

      // By DEX
      if (!byDEX[pool.dex]) {
        byDEX[pool.dex] = { count: 0, avgAPR: 0, bestAPR: 0, totalTVL: 0 };
      }
      byDEX[pool.dex].count++;
      byDEX[pool.dex].avgAPR += pool.effectiveAPR;
      byDEX[pool.dex].totalTVL += pool.tvl;
      if (pool.effectiveAPR > byDEX[pool.dex].bestAPR) {
        byDEX[pool.dex].bestAPR = pool.effectiveAPR;
      }

      // By chain
      if (!byChain[pool.chain]) {
        byChain[pool.chain] = { count: 0, avgAPR: 0, totalTVL: 0 };
      }
      byChain[pool.chain].count++;
      byChain[pool.chain].avgAPR += pool.effectiveAPR;
      byChain[pool.chain].totalTVL += pool.tvl;
    }

    // Calculate averages
    for (const dex of Object.keys(byDEX)) {
      if (byDEX[dex].count > 0) {
        byDEX[dex].avgAPR /= byDEX[dex].count;
      }
    }
    for (const chain of Object.keys(byChain)) {
      if (byChain[chain].count > 0) {
        byChain[chain].avgAPR /= byChain[chain].count;
      }
    }

    return {
      totalPools: pools.length,
      avgAPR: pools.length > 0 ? totalAPR / pools.length : 0,
      bestAPR,
      byDEX,
      byChain,
    };
  }

  /**
   * Convert DefiLlama pool to our PoolOpportunity format
   */
  private toPoolOpportunity(pool: DefiLlamaPool): PoolOpportunity {
    const chain = CHAIN_MAP[pool.chain] || 'ethereum';
    const dex = PROJECT_MAP[pool.project.toLowerCase()] || 'uniswap_v3';

    // Parse symbol (e.g., "USDC-USDT" or "WETH-USDC")
    const tokens = this.parseSymbol(pool.symbol, chain);

    // Calculate gas estimate based on chain
    const estimatedGasCost = this.estimateGasCost(chain);

    // Risk score based on volatility indicators
    const riskScore = this.calculateRiskScore(pool);

    // Use APY as effective APR (DefiLlama reports APY which accounts for compounding)
    const effectiveAPR = pool.apy || 0;

    return {
      chain,
      dex,
      address: pool.id,
      token0: tokens.token0,
      token1: tokens.token1,
      feeTier: this.estimateFeeTier(pool, dex),
      tvl: pool.tvlUsd,
      volume24h: pool.volumeUsd1d,
      feeAPR: pool.apyBase || 0,
      effectiveAPR,
      compositeScore: 0, // Will be calculated by APR calculator node
      riskScore,
      liquidity: pool.liquidityUsd || pool.tvlUsd,
      estimatedGasCost,
      impermanentLossRisk: pool.ilRisk === 'none' ? 0 : pool.ilRisk === 'low' ? 0.02 : pool.ilRisk === 'medium' ? 0.05 : 0.1,
      lastUpdated: new Date(),
    };
  }

  /**
   * Parse a DefiLlama symbol into token pair
   */
  private parseSymbol(symbol: string, chain: Chain): { token0: Token; token1: Token } {
    // Handle various formats: "USDC-USDT", "WETH-USDC.1", "SOL-USDC (Meteora)"
    const cleaned = symbol.replace(/\s*\(.*\)/, '').split('.')[0];
    const parts = cleaned.split(/[-/]/);

    const sym0 = parts[0]?.trim() || 'UNKNOWN';
    const sym1 = parts[1]?.trim() || 'UNKNOWN';

    // Get token addresses from our known addresses
    const { TOKEN_ADDRESSES } = require('./constants');

    const chainAddresses = TOKEN_ADDRESSES[chain] || {};
    const addr0 = chainAddresses[sym0] || '0x0000000000000000000000000000000000000000';
    const addr1 = chainAddresses[sym1] || '0x0000000000000000000000000000000000000000';

    return {
      token0: {
        symbol: sym0,
        address: addr0,
        decimals: this.getDecimals(sym0),
        chain,
      },
      token1: {
        symbol: sym1,
        address: addr1,
        decimals: this.getDecimals(sym1),
        chain,
      },
    };
  }

  /**
   * Get token decimals
   */
  private getDecimals(symbol: string): number {
    const map: Record<string, number> = {
      USDC: 6, USDT: 6, DAI: 18, FDUSD: 6, BUSD: 18,
      WETH: 18, ETH: 18, WBTC: 8, BTCB: 18,
      SOL: 9, BNB: 18, WBNB: 18,
      RAY: 6, JUP: 6, JTO: 6,
    };
    return map[symbol] || 18;
  }

  /**
   * Estimate fee tier based on pool data
   */
  private estimateFeeTier(pool: DefiLlamaPool, dex: DEX): number {
    // Common fee tiers by DEX
    // PancakeSwap V3: 100, 500, 2500, 10000 bps
    // Uniswap V3: 100, 500, 3000, 10000 bps
    // Meteora: varies (bin step)

    // Estimate based on APY and TVL (higher APY pools tend to have wider fee tiers)
    if (pool.tvlUsd > 1_000_000 && pool.apy < 10) return 100;    // 0.01%
    if (pool.tvlUsd > 500_000 && pool.apy < 20) return 500;      // 0.05%
    if (pool.tvlUsd > 100_000) return dex === 'pancakeswap_v3' ? 2500 : 3000; // 0.25% or 0.3%
    return 10000; // 1%
  }

  /**
   * Estimate gas cost based on chain
   */
  private estimateGasCost(chain: Chain): number {
    const gasEstimates: Record<Chain, number> = {
      ethereum: 3.50,   // ~$3-5 for a position operation
      bsc: 0.15,        // ~$0.10-0.20
      solana: 0.01,     // ~$0.01
    };
    return gasEstimates[chain] || 1.0;
  }

  /**
   * Calculate risk score from pool data
   */
  private calculateRiskScore(pool: DefiLlamaPool): number {
    let risk = 0.3; // Base risk

    // IL risk
    if (pool.ilRisk === 'none') risk -= 0.1;
    else if (pool.ilRisk === 'high') risk += 0.2;
    else if (pool.ilRisk === 'medium') risk += 0.1;

    // Outbreak (sudden APY spike)
    if (pool.outbreak) risk += 0.15;

    // Volatility (sigma)
    if (pool.sigma > 0.5) risk += 0.1;
    if (pool.sigma > 1.0) risk += 0.1;

    // Stablecoin pools are lower risk
    if (pool.stablecoin) risk -= 0.15;

    // Confidence level
    if (pool.confidence?.level === 'high') risk -= 0.05;
    else if (pool.confidence?.level === 'low') risk += 0.1;

    // Category
    if (pool.category === 'Stableswap') risk -= 0.1;

    // TVL (more TVL = less risk)
    if (pool.tvlUsd > 10_000_000) risk -= 0.05;
    if (pool.tvlUsd < 100_000) risk += 0.1;

    return Math.max(0, Math.min(1, risk));
  }
}

// Singleton export
export const defiLlamaYields = new DefiLlamaYields();
export default defiLlamaYields;
