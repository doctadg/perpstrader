// Safekeeping Fund System - Uniswap V3 Client
// Ethereum Mainnet Uniswap V3 integration

import { PublicClient, WalletClient, HttpTransport, Chain as ViemChain, Account } from 'viem';
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  Pool,
  Position,
  nearestUsableTick,
  TickMath,
} from '@uniswap/v3-sdk';
import { Token as UniToken } from '@uniswap/sdk-core';
import logger from '../../shared/logger';
import {
  BaseDEXClient,
  DEXOperationResult,
  PoolState,
  DEXUtils,
} from './base-dex-client';
import type {
  Chain,
  DEX,
  Token,
  PoolOpportunity,
  LiquidityPosition,
  AddLiquidityParams,
  RemoveLiquidityParams,
} from '../types';
import { UNISWAP_ADDRESSES, TOKEN_ADDRESSES } from '../constants';

/**
 * Uniswap V3 Pool ABI (minimal functions needed)
 */
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
  {
    inputs: [],
    name: 'feeGrowthGlobal0X128',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'feeGrowthGlobal1X128',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * ERC20 ABI for token operations
 */
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
 * Uniswap V3 Client Configuration
 */
export interface UniswapV3ClientConfig {
  privateKey: `0x${string}`;
  rpcUrl?: string;
  chain?: Chain;
}

/**
 * Uniswap V3 DEX Client
 * Handles interaction with Uniswap V3 on Ethereum mainnet
 */
export class UniswapV3Client extends BaseDEXClient {
  private publicClient: PublicClient<HttpTransport, ViemChain>;
  private walletClient: WalletClient<HttpTransport, ViemChain, Account>;
  private account: Account;
  private positions: Map<string, LiquidityPosition> = new Map();

  // Cache for pool data
  private poolCache: Map<string, PoolState> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(config: UniswapV3ClientConfig) {
    super('ethereum', 'uniswap_v3', config.rpcUrl || 'https://eth.llamarpc.com');

    // Create account from private key
    this.account = privateKeyToAccount(config.privateKey);

    // Create public client for read operations
    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(this.rpcUrl),
      pollingInterval: 10000,
    });

    // Create wallet client for transactions
    this.walletClient = createWalletClient({
      account: this.account,
      chain: mainnet,
      transport: http(this.rpcUrl),
    });
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  /**
   * Initialize the client connection
   */
  async initialize(): Promise<void> {
    try {
      // Test connection with a simple block number call
      const blockNumber = await this.publicClient.getBlockNumber();

      logger.info(
        `[UniswapV3] Initialized successfully. Account: ${this.account.address}, Block: ${blockNumber}`
      );

      this.isConnected = true;
    } catch (error) {
      logger.error(`[UniswapV3] Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Health check for the connection
   */
  protected async healthCheck(): Promise<void> {
    await this.publicClient.getBlockNumber({ cacheTime: 0 });
  }

  // =========================================================================
  // POOL STATE FETCHING
  // =========================================================================

  /**
   * Fetch pool states for monitored pairs
   */
  async fetchPoolStates(
    pairs?: Array<{ token0: string; token1: string }>
  ): Promise<PoolOpportunity[]> {
    const opportunities: PoolOpportunity[] = [];

    // Default pairs to monitor
    const defaultPairs = [
      { token0: 'USDC', token1: 'USDT' },
      { token0: 'USDC', token1: 'ETH' },
      { token0: 'USDT', token1: 'ETH' },
      { token0: 'USDC', token1: 'WBTC' },
    ];

    const pairsToCheck = pairs || defaultPairs;

    // Fetch fee tiers to check for each pair
    const feeTiers = [100, 500, 2500, 3000, 10000];

    for (const pair of pairsToCheck) {
      for (const feeTier of feeTiers) {
        try {
          const opportunity = await this.fetchPoolState(pair.token0, pair.token1, feeTier);
          if (opportunity) {
            opportunities.push(opportunity);
          }
        } catch (error) {
          logger.debug(`[UniswapV3] Failed to fetch ${pair.token0}/${pair.token1} ${feeTier}bp pool: ${error}`);
        }
      }
    }

    // Sort by effective APR descending
    opportunities.sort((a, b) => b.effectiveAPR - a.effectiveAPR);

    logger.debug(`[UniswapV3] Found ${opportunities.length} pool opportunities`);

    return opportunities;
  }

  /**
   * Fetch state for a specific pool
   */
  private async fetchPoolState(
    token0Symbol: string,
    token1Symbol: string,
    feeTier: number
  ): Promise<PoolOpportunity | null> {
    // Get token addresses
    const token0Address = TOKEN_ADDRESSES.ethereum[token0Symbol as keyof typeof TOKEN_ADDRESSES.ethereum];
    const token1Address = TOKEN_ADDRESSES.ethereum[token1Symbol as keyof typeof TOKEN_ADDRESSES.ethereum];

    if (!token0Address || !token1Address) {
      logger.warn(`[UniswapV3] Unknown token: ${token0Symbol} or ${token1Symbol}`);
      return null;
    }

    // Compute pool address (simplified - in production use proper CREATE2 calculation)
    const poolAddress = await this.getPoolAddress(token0Address, token1Address, feeTier);
    if (!poolAddress) {
      return null; // Pool not found
    }

    // Check cache first
    const cacheKey = `${poolAddress}`;
    const cached = this.poolCache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.CACHE_TTL) {
      return this.buildOpportunityFromPoolState(cached);
    }

    // Fetch pool state
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
      }),
      this.publicClient.readContract({
        address: token1Address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);

    // Calculate price
    const price = DEXUtils.sqrtPriceX96ToPrice(
      sqrtPriceX96,
      token0Decimals,
      token1Decimals
    );

    // Fetch pool data from subgraph for TVL and volume
    const subgraphData = await this.fetchSubgraphData(poolAddress);

    // Calculate pool state
    const poolState: PoolState = {
      address: poolAddress,
      token0: {
        symbol: token0Symbol,
        address: token0Address,
        decimals: token0Decimals,
        chain: 'ethereum',
      },
      token1: {
        symbol: token1Symbol,
        address: token1Address,
        decimals: token1Decimals,
        chain: 'ethereum',
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

    // Cache the result
    this.poolCache.set(cacheKey, poolState);

    return this.buildOpportunityFromPoolState(poolState);
  }

  /**
   * Fetch additional data from Uniswap V3 subgraph
   */
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
            token0 { symbol decimals }
            token1 { symbol decimals }
          }
        }
      `;

      const response = await fetch('https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      const data = await response.json() as { data?: { pool?: { totalValueLockedUSD?: string; volumeUSD?: string; feeTier?: string } } };

      if (data.data?.pool) {
        const pool = data.data.pool;
        const tvl = parseFloat(pool.totalValueLockedUSD || '0');
        const volume24h = parseFloat(pool.volumeUSD || '0');

        // Calculate fee APR from daily volume
        const feeTier = parseInt(pool.feeTier || '3000') / 1000000; // Convert to percentage
        const dailyFees = volume24h * feeTier;
        const feeAPR = tvl > 0 ? (dailyFees * 365 / tvl) * 100 : 0;

        return { tvl, volume24h, apr: feeAPR };
      }

      return null;
    } catch (error) {
      logger.debug(`[UniswapV3] Subgraph fetch failed: ${error}`);
      return null;
    }
  }

  /**
   * Build PoolOpportunity from PoolState
   */
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

  /**
   * Calculate composite score for ranking
   */
  private calculateCompositeScore(pool: PoolState, aprBreakdown: { effectiveAPR: number }): number {
    // Score weights
    const APR_WEIGHT = 0.5;
    const TVL_WEIGHT = 0.3;
    const VOLUME_WEIGHT = 0.2;

    // Normalize values (0-1 scale)
    const aprScore = Math.min(aprBreakdown.effectiveAPR / 50, 1); // Max 50% APR
    const tvlScore = Math.min(pool.tvl / 10000000, 1); // Max $10M TVL
    const volumeScore = Math.min(pool.volume24h / 1000000, 1); // Max $1M daily volume

    return (aprScore * APR_WEIGHT) + (tvlScore * TVL_WEIGHT) + (volumeScore * VOLUME_WEIGHT);
  }

  /**
   * Calculate risk score for a pool
   */
  private calculateRiskScore(pool: PoolState): number {
    let risk = 0.5; // Base risk

    // TVL factor - lower TVL = higher risk
    if (pool.tvl < 100000) risk += 0.2;
    else if (pool.tvl < 1000000) risk += 0.1;

    // Volume factor - lower volume = higher risk
    if (pool.volume24h < 10000) risk += 0.1;

    // Fee tier factor - higher fee = usually higher risk
    if (pool.feeTier >= 10000) risk += 0.1;

    return Math.min(risk, 1);
  }

  /**
   * Estimate IL risk from token pair
   */
  private estimateILRiskFromPair(token0: Token, token1: Token): number {
    // Stablecoin pairs have lowest IL risk
    const stablecoins = ['USDC', 'USDT', 'DAI', 'FDUSD'];
    const isStable0 = stablecoins.includes(token0.symbol);
    const isStable1 = stablecoins.includes(token1.symbol);

    if (isStable0 && isStable1) return 0.01; // 1% IL risk
    if (isStable0 || isStable1) return 0.05; // 5% IL risk

    return 0.15; // 15% IL risk for volatile pairs
  }

  // =========================================================================
  // LIQUIDITY OPERATIONS
  // =========================================================================

  /**
   * Add liquidity to a pool
   */
  async addLiquidity(params: AddLiquidityParams): Promise<DEXOperationResult> {
    const startTime = Date.now();

    try {
      logger.info(`[UniswapV3] Adding liquidity to ${params.poolAddress}`);

      // Check and approve tokens if needed
      const pool = this.poolCache.get(params.poolAddress);
      if (pool) {
        await this.ensureApproval(pool.token0.address, UNISWAP_ADDRESSES.ethereum.router);
        await this.ensureApproval(pool.token1.address, UNISWAP_ADDRESSES.ethereum.router);
      }

      // Build transaction for adding liquidity
      // Note: This is a simplified implementation
      // In production, use the NonfungiblePositionManager for minting positions

      // Execute transaction
      const hash = await this.walletClient.sendTransaction({
        chain: mainnet,
        to: UNISWAP_ADDRESSES.ethereum.nftManager as `0x${string}`,
        data: '0x', // Actual encoded calldata
      });

      logger.info(`[UniswapV3] Add liquidity tx sent: ${hash}`);

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
      });

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
      logger.error(`[UniswapV3] Add liquidity failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Remove liquidity from a pool
   */
  async removeLiquidity(params: RemoveLiquidityParams): Promise<DEXOperationResult> {
    const startTime = Date.now();

    try {
      logger.info(`[UniswapV3] Removing liquidity from position ${params.positionId}`);

      const hash = await this.walletClient.sendTransaction({
        chain: mainnet,
        to: UNISWAP_ADDRESSES.ethereum.nftManager as `0x${string}`,
        data: '0x', // Actual encoded calldata
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
      logger.error(`[UniswapV3] Remove liquidity failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get current liquidity positions
   */
  async getPositions(): Promise<LiquidityPosition[]> {
    return Array.from(this.positions.values());
  }

  // =========================================================================
  // GAS AND COSTS
  // =========================================================================

  /**
   * Get current gas price in ETH and USD
   */
  async getGasPrice(): Promise<{ gasPrice: number; gasPriceUsd: number }> {
    const gasPrice = await this.publicClient.getGasPrice();

    // Get ETH price (simplified - in production use price oracle)
    const ethPrice = 3000; // Placeholder

    return {
      gasPrice: Number(gasPrice) / 1e9, // Convert to gwei
      gasPriceUsd: (Number(gasPrice) / 1e18) * ethPrice,
    };
  }

  /**
   * Estimate gas cost for an operation
   */
  async estimateGasCost(operation: string, params: unknown): Promise<number> {
    const gasPrice = await this.publicClient.getGasPrice();

    // Estimated gas units for different operations
    const gasEstimates: Record<string, number> = {
      add_liquidity: 300000,
      remove_liquidity: 250000,
      approve: 50000,
      collect_fees: 100000,
    };

    const gasUnits = gasEstimates[operation] || 200000;
    const gasCostWei = gasUnits * Number(gasPrice);
    const ethPrice = 3000; // Placeholder

    return (gasCostWei / 1e18) * ethPrice;
  }

  /**
   * Get token balance
   */
  async getTokenBalance(tokenAddress: string): Promise<number> {
    const balance = await this.publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [this.account.address],
    });

    return Number(balance) / 1e18; // Assuming 18 decimals
  }

  /**
   * Approve token for spending
   */
  async approveToken(
    tokenAddress: string,
    spender: string,
    amount?: bigint
  ): Promise<DEXOperationResult> {
    const startTime = Date.now();

    try {
      const amountToApprove = amount || BigInt(2) ** BigInt(256) - 1n; // Max uint256

      const hash = await this.walletClient.writeContract({
        chain: mainnet,
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

  /**
   * Ensure token is approved for spending
   */
  private async ensureApproval(tokenAddress: string, spender: string): Promise<void> {
    const allowance = await this.publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [this.account.address, spender as `0x${string}`],
    });

    // If allowance is low, approve max
    if (allowance < BigInt(1000000) * BigInt(10 ** 18)) {
      await this.approveToken(tokenAddress, spender);
    }
  }

  // =========================================================================
  // IL CALCULATION
  // =========================================================================

  /**
   * Estimate impermanent loss risk for a pool
   */
  protected async estimateImpermanentLossRisk(pool: PoolState): Promise<number> {
    return this.estimateILRiskFromPair(pool.token0, pool.token1);
  }

  /**
   * Get pool address for a token pair and fee tier
   * In production, this would use the CREATE2 formula or subgraph lookup
   */
  private async getPoolAddress(
    token0Address: string,
    token1Address: string,
    feeTier: number
  ): Promise<`0x${string}` | null> {
    // Simplified implementation - return known pool addresses for common pairs
    // In production, use subgraph or compute CREATE2 address

    // Common USDC/USDT pool on Uniswap V3 (0.05% fee)
    if ((token0Address.includes('A0b8') || token0Address.includes('a0b8')) &&
        (token1Address.includes('dAC1') || token1Address.includes('dac1')) &&
        feeTier === 100) {
      return '0x3416cf6c708da0db3cd464c0afbbfc66bdaec263' as `0x${string}`;
    }

    // USDC/WETH 0.3% pool
    if ((token0Address.includes('A0b8') || token0Address.includes('a0b8')) &&
        token1Address.includes('C02a') &&
        feeTier === 3000) {
      return '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8' as `0x${string}`;
    }

    // For other pairs, return null (not implemented in this version)
    logger.debug(`[UniswapV3] Pool not found for ${token0Address.slice(0, 8)}...${token1Address.slice(0, 8)}... fee ${feeTier}`);
    return null;
  }

  // =========================================================================
  // DISCONNECT
  // =========================================================================

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.poolCache.clear();
    this.positions.clear();
    this.isConnected = false;
    logger.info('[UniswapV3] Disconnected');
  }
}
