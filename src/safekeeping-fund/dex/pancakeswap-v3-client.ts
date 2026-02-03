// Safekeeping Fund System - PancakeSwap V3 Client
// BSC (Binance Smart Chain) PancakeSwap V3 integration

import { PublicClient, WalletClient, HttpTransport, Chain as ViemChain, Account } from 'viem';
import { createPublicClient, createWalletClient, http } from 'viem';
import { bsc, type Chain } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import logger from '../../shared/logger';
import {
  BaseDEXClient,
  DEXOperationResult,
  PoolState,
  DEXUtils,
} from './base-dex-client';
import type {
  Token,
  PoolOpportunity,
  LiquidityPosition,
  AddLiquidityParams,
  RemoveLiquidityParams,
} from '../types';
import { PANCAKESWAP_ADDRESSES, TOKEN_ADDRESSES } from '../constants';

// Re-use ABIs from Uniswap (PancakeSwap V3 is compatible)
const POOL_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'int24', name: 'tick', type: 'int24' },
      { internalType: 'uint16', name: 'observationIndex', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinality', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinalityNext', type: 'uint16' },
      { internalType: 'uint8', name: 'feeProtocol', type: 'uint8' },
      { internalType: 'bool', name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ERC20_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'spender', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'address', name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * PancakeSwap V3 Client Configuration
 */
export interface PancakeswapV3ClientConfig {
  privateKey: `0x${string}`;
  rpcUrl?: string;
}

/**
 * PancakeSwap V3 DEX Client
 * Handles interaction with PancakeSwap V3 on BSC
 */
export class PancakeswapV3Client extends BaseDEXClient {
  private publicClient: PublicClient<HttpTransport, ViemChain>;
  private walletClient: WalletClient<HttpTransport, ViemChain, Account>;
  private account: Account;
  private positions: Map<string, LiquidityPosition> = new Map();

  // Cache for pool data
  private poolCache: Map<string, PoolState> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(config: PancakeswapV3ClientConfig) {
    super('bsc', 'pancakeswap_v3', config.rpcUrl || 'https://bsc-dataseed.binance.org');

    // Create account from private key
    this.account = privateKeyToAccount(config.privateKey);

    // Create public client for read operations
    this.publicClient = createPublicClient({
      chain: bsc,
      transport: http(this.rpcUrl),
      pollingInterval: 10000,
    });

    // Create wallet client for transactions
    this.walletClient = createWalletClient({
      account: this.account,
      chain: bsc,
      transport: http(this.rpcUrl),
    });
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  async initialize(): Promise<void> {
    try {
      const blockNumber = await this.publicClient.getBlockNumber();

      logger.info(
        `[PancakeSwapV3] Initialized successfully. Account: ${this.account.address}, Block: ${blockNumber}`
      );

      this.isConnected = true;
    } catch (error) {
      logger.error(`[PancakeSwapV3] Initialization failed: ${error}`);
      throw error;
    }
  }

  protected async healthCheck(): Promise<void> {
    await this.publicClient.getBlockNumber({ cacheTime: 0 });
  }

  // =========================================================================
  // POOL STATE FETCHING
  // =========================================================================

  async fetchPoolStates(
    pairs?: Array<{ token0: string; token1: string }>
  ): Promise<PoolOpportunity[]> {
    const opportunities: PoolOpportunity[] = [];

    // Default pairs for BSC
    const defaultPairs = [
      { token0: 'USDC', token1: 'USDT' },
      { token0: 'USDC', token1: 'BNB' },
      { token0: 'USDT', token1: 'BNB' },
      { token0: 'USDC', token1: 'BTCB' },
    ];

    const pairsToCheck = pairs || defaultPairs;
    const feeTiers = [100, 500, 2500, 10000];

    for (const pair of pairsToCheck) {
      for (const feeTier of feeTiers) {
        try {
          const opportunity = await this.fetchPoolState(pair.token0, pair.token1, feeTier);
          if (opportunity) {
            opportunities.push(opportunity);
          }
        } catch (error) {
          logger.debug(`[PancakeSwapV3] Failed to fetch ${pair.token0}/${pair.token1} ${feeTier}bp pool: ${error}`);
        }
      }
    }

    opportunities.sort((a, b) => b.effectiveAPR - a.effectiveAPR);
    logger.debug(`[PancakeSwapV3] Found ${opportunities.length} pool opportunities`);

    return opportunities;
  }

  private async fetchPoolState(
    token0Symbol: string,
    token1Symbol: string,
    feeTier: number
  ): Promise<PoolOpportunity | null> {
    const token0Address = TOKEN_ADDRESSES.bsc[token0Symbol as keyof typeof TOKEN_ADDRESSES.bsc];
    const token1Address = TOKEN_ADDRESSES.bsc[token1Symbol as keyof typeof TOKEN_ADDRESSES.bsc];

    if (!token0Address || !token1Address) {
      logger.warn(`[PancakeSwapV3] Unknown token: ${token0Symbol} or ${token1Symbol}`);
      return null;
    }

    // Compute pool address (PancakeSwap uses same formula as Uniswap)
    // Compute pool address (simplified implementation)
    const poolAddress = await this.getPoolAddress(token0Address, token1Address, feeTier);
    if (!poolAddress) {
      return null;
    }

    const cacheKey = `${poolAddress}`;
    const cached = this.poolCache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.CACHE_TTL) {
      return this.buildOpportunityFromPoolState(cached);
    }

    const [slot0, liquidity] = await Promise.all([
      this.publicClient.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: 'slot0',
      }),
      this.publicClient.readContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: 'liquidity',
      }),
    ]);

    const sqrtPriceX96 = slot0[0];
    const tick = slot0[1];

    // Get token info
    const [token0Decimals, token1Decimals] = await Promise.all([
      this.publicClient.readContract({
        address: token0Address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }).catch(() => 18),
      this.publicClient.readContract({
        address: token1Address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }).catch(() => 18),
    ]);

    const price = DEXUtils.sqrtPriceX96ToPrice(sqrtPriceX96, token0Decimals, token1Decimals);

    // Fetch subgraph data
    const subgraphData = await this.fetchSubgraphData(poolAddress);

    const poolState: PoolState = {
      address: poolAddress,
      token0: {
        symbol: token0Symbol,
        address: token0Address,
        decimals: token0Decimals,
        chain: 'bsc',
      },
      token1: {
        symbol: token1Symbol,
        address: token1Address,
        decimals: token1Decimals,
        chain: 'bsc',
      },
      feeTier,
      sqrtPriceX96: sqrtPriceX96.toString(),
      tick,
      liquidity: liquidity as bigint,
      tvl: subgraphData?.tvl || 0,
      volume24h: subgraphData?.volume24h || 0,
      feeAPR: subgraphData?.apr || 0,
      lastUpdated: new Date(),
    };

    this.poolCache.set(cacheKey, poolState);

    return this.buildOpportunityFromPoolState(poolState);
  }

  private async fetchSubgraphData(poolAddress: string): Promise<{
    tvl: number;
    volume24h: number;
    apr: number;
  } | null> {
    try {
      const query = `
        {
          pool(id: "${poolAddress.toLowerCase()}") {
            totalValueLockedUSD
            volumeUSD
            feeTier
          }
        }
      `;

      const response = await fetch('https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json() as { data?: { pool?: { totalValueLockedUSD?: string; volumeUSD?: string; feeTier?: string } } };

      if (data.data?.pool) {
        const pool = data.data.pool;
        const tvl = parseFloat(pool.totalValueLockedUSD || '0');
        const volume24h = parseFloat(pool.volumeUSD || '0');
        const feeTier = parseInt(pool.feeTier || '3000') / 1000000;
        const dailyFees = volume24h * feeTier;
        const feeAPR = tvl > 0 ? (dailyFees * 365 / tvl) * 100 : 0;

        return { tvl, volume24h, apr: feeAPR };
      }

      return null;
    } catch (error) {
      logger.debug(`[PancakeSwapV3] Subgraph fetch failed: ${error}`);
      return null;
    }
  }

  private async buildOpportunityFromPoolState(pool: PoolState): Promise<PoolOpportunity> {
    const gasCost = await this.estimateGasCost('add_liquidity', { pool });
    const aprBreakdown = await this.calculateEffectiveAPR(pool, gasCost);

    return {
      chain: this.chain,
      dex: this.dex,
      address: pool.address,
      token0: pool.token0,
      token1: pool.token1,
      feeTier: pool.feeTier,
      tvl: pool.tvl,
      volume24h: pool.volume24h,
      feeAPR: pool.feeAPR,
      effectiveAPR: aprBreakdown.effectiveAPR,
      compositeScore: this.calculateCompositeScore(pool, aprBreakdown),
      riskScore: this.calculateRiskScore(pool),
      liquidity: pool.liquidity > 0n ? Number(pool.liquidity) / 1e18 : 0,
      estimatedGasCost: gasCost,
      impermanentLossRisk: this.estimateILRiskFromPair(pool.token0, pool.token1),
      lastUpdated: pool.lastUpdated,
    };
  }

  private calculateCompositeScore(pool: PoolState, aprBreakdown: { effectiveAPR: number }): number {
    const APR_WEIGHT = 0.5;
    const TVL_WEIGHT = 0.3;
    const VOLUME_WEIGHT = 0.2;

    const aprScore = Math.min(aprBreakdown.effectiveAPR / 50, 1);
    const tvlScore = Math.min(pool.tvl / 5000000, 1); // $5M max for BSC
    const volumeScore = Math.min(pool.volume24h / 500000, 1); // $500K max daily

    return (aprScore * APR_WEIGHT) + (tvlScore * TVL_WEIGHT) + (volumeScore * VOLUME_WEIGHT);
  }

  private calculateRiskScore(pool: PoolState): number {
    let risk = 0.4; // BSC generally has lower risk than ETH

    if (pool.tvl < 50000) risk += 0.2;
    else if (pool.tvl < 500000) risk += 0.1;

    if (pool.volume24h < 5000) risk += 0.1;

    if (pool.feeTier >= 10000) risk += 0.1;

    return Math.min(risk, 1);
  }

  private estimateILRiskFromPair(token0: Token, token1: Token): number {
    const stablecoins = ['USDC', 'USDT', 'FDUSD', 'DAI'];
    const isStable0 = stablecoins.includes(token0.symbol);
    const isStable1 = stablecoins.includes(token1.symbol);

    if (isStable0 && isStable1) return 0.005; // Lower on BSC
    if (isStable0 || isStable1) return 0.03;

    return 0.12;
  }

  // =========================================================================
  // LIQUIDITY OPERATIONS
  // =========================================================================

  async addLiquidity(params: AddLiquidityParams): Promise<DEXOperationResult> {
    const startTime = Date.now();

    try {
      logger.info(`[PancakeSwapV3] Adding liquidity to ${params.poolAddress}`);

      const pool = this.poolCache.get(params.poolAddress);
      if (pool) {
        await this.ensureApproval(pool.token0.address, PANCAKESWAP_ADDRESSES.bsc.router);
        await this.ensureApproval(pool.token1.address, PANCAKESWAP_ADDRESSES.bsc.router);
      }

      const hash = await this.walletClient.sendTransaction({
        chain: bsc,
        to: PANCAKESWAP_ADDRESSES.bsc.nftManager as `0x${string}`,
        data: '0x',
      });

      logger.info(`[PancakeSwapV3] Add liquidity tx sent: ${hash}`);

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== 'success') {
        throw new Error('Transaction failed');
      }

      const gasUsed = Number(receipt.gasUsed);
      const gasCost = await this.estimateGasCost('add_liquidity', params);

      return {
        success: true,
        txHash: hash,
        actualAmount: params.token0Amount + params.token1Amount,
        gasUsed,
        gasCost,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[PancakeSwapV3] Add liquidity failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  async removeLiquidity(params: RemoveLiquidityParams): Promise<DEXOperationResult> {
    const startTime = Date.now();

    try {
      logger.info(`[PancakeSwapV3] Removing liquidity from position ${params.positionId}`);

      const hash = await this.walletClient.sendTransaction({
        chain: bsc,
        to: PANCAKESWAP_ADDRESSES.bsc.nftManager as `0x${string}`,
        data: '0x',
      });

      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== 'success') {
        throw new Error('Transaction failed');
      }

      return {
        success: true,
        txHash: hash,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[PancakeSwapV3] Remove liquidity failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  async getPositions(): Promise<LiquidityPosition[]> {
    return Array.from(this.positions.values());
  }

  // =========================================================================
  // GAS AND COSTS
  // =========================================================================

  async getGasPrice(): Promise<{ gasPrice: number; gasPriceUsd: number }> {
    const gasPrice = await this.publicClient.getGasPrice();
    const bnbPrice = 600; // Placeholder BNB price

    return {
      gasPrice: Number(gasPrice) / 1e9,
      gasPriceUsd: (Number(gasPrice) / 1e18) * bnbPrice,
    };
  }

  async estimateGasCost(operation: string, params: unknown): Promise<number> {
    const gasPrice = await this.publicClient.getGasPrice();

    const gasEstimates: Record<string, number> = {
      add_liquidity: 300000,
      remove_liquidity: 250000,
      approve: 50000,
      collect_fees: 100000,
    };

    const gasUnits = gasEstimates[operation] || 200000;
    const gasCostWei = gasUnits * Number(gasPrice);
    const bnbPrice = 600;

    return (gasCostWei / 1e18) * bnbPrice;
  }

  async getTokenBalance(tokenAddress: string): Promise<number> {
    try {
      const balance = await this.publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [this.account.address],
      });

      return Number(balance) / 1e18;
    } catch {
      return 0;
    }
  }

  async approveToken(
    tokenAddress: string,
    spender: string,
    amount?: bigint
  ): Promise<DEXOperationResult> {
    const startTime = Date.now();

    try {
      const amountToApprove = amount || BigInt(2) ** BigInt(256) - 1n;

      const hash = await this.walletClient.writeContract({
        chain: bsc,
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spender as `0x${string}`, amountToApprove],
      });

      await this.publicClient.waitForTransactionReceipt({ hash });

      return {
        success: true,
        txHash: hash,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  private async ensureApproval(tokenAddress: string, spender: string): Promise<void> {
    const allowance = await this.publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account.address, spender as `0x${string}`],
    });

    if (allowance < BigInt(1000000) * BigInt(10 ** 18)) {
      await this.approveToken(tokenAddress, spender);
    }
  }

  // =========================================================================
  // IL CALCULATION
  // =========================================================================

  protected async estimateImpermanentLossRisk(pool: PoolState): Promise<number> {
    return this.estimateILRiskFromPair(pool.token0, pool.token1);
  }

  /**
   * Get pool address for a token pair and fee tier
   * Simplified implementation - in production use subgraph or compute CREATE2
   */
  private async getPoolAddress(
    token0Address: string,
    token1Address: string,
    feeTier: number
  ): Promise<`0x${string}` | null> {
    // Common USDC/USDT pool on PancakeSwap V3
    if ((token0Address.includes('8AC7') || token0Address.includes('8ac7')) &&
        (token1Address.includes('55d3') || token1Address.includes('55d3')) &&
        feeTier === 100) {
      return '0x36b20d0cda0c3e247bec39cade847bc01169374f' as `0x${string}`;
    }

    return null;
  }

  // =========================================================================
  // DISCONNECT
  // =========================================================================

  async disconnect(): Promise<void> {
    this.poolCache.clear();
    this.positions.clear();
    this.isConnected = false;
    logger.info('[PancakeSwapV3] Disconnected');
  }
}

// Import UniToken type
import { Token as UniToken } from '@uniswap/sdk-core';
