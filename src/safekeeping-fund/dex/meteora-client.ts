// Safekeeping Fund System - Meteora Client
// Solana Meteora DLMM (Dynamic Liquidity Market Maker) integration

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
  approve,
} from '@solana/spl-token';
import logger from '../../shared/logger';
import {
  BaseDEXClient,
  DEXOperationResult,
  PoolState,
} from './base-dex-client';
import type {
  Token,
  PoolOpportunity,
  LiquidityPosition,
  AddLiquidityParams,
  RemoveLiquidityParams,
} from '../types';
import { METEORA_ADDRESSES, TOKEN_ADDRESSES } from '../constants';

/**
 * Meteora DLMM Pool State (on-chain)
 */
interface MeteoraPoolState {
  poolAddress: PublicKey;
  tokenMint0: PublicKey;
  tokenMint1: PublicKey;
  reserve0: bigint;
  reserve1: bigint;
  lpSupply: bigint;
  binStep: number;
  activeBinId: number;
  lastUpdated: Date;
}

/**
 * Meteora Client Configuration
 */
export interface MeteoraClientConfig {
  secretKey: Uint8Array;
  rpcUrl?: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
}

/**
 * Meteora DEX Client
 * Handles interaction with Meteora DLMM on Solana
 */
export class MeteoraClient extends BaseDEXClient {
  private connection: Connection;
  private keypair: Keypair;
  private commitment: 'processed' | 'confirmed' | 'finalized';
  private positions: Map<string, LiquidityPosition> = new Map();

  // Cache for pool data
  private poolCache: Map<string, PoolState> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds

  constructor(config: MeteoraClientConfig) {
    super('solana', 'meteora', config.rpcUrl || 'https://api.mainnet-beta.solana.com');

    this.keypair = Keypair.fromSecretKey(config.secretKey);
    this.connection = new Connection(this.rpcUrl, {
      commitment: config.commitment || 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });
    this.commitment = config.commitment || 'confirmed';
  }

  // =========================================================================
  // INITIALIZATION
  // =========================================================================

  async initialize(): Promise<void> {
    try {
      // Test connection
      const version = await this.connection.getVersion();

      logger.info(
        `[Meteora] Initialized successfully. Address: ${this.keypair.publicKey.toBase58()}, ` +
        `RPC: ${this.rpcUrl}, Solana Version: ${version['solana-core']}`
      );

      this.isConnected = true;
    } catch (error) {
      logger.error(`[Meteora] Initialization failed: ${error}`);
      throw error;
    }
  }

  /**
   * Health check for the connection
   */
  protected async healthCheck(): Promise<void> {
    const slot = await this.connection.getSlot();
    if (!slot || slot === 0) {
      throw new Error('Invalid slot number');
    }
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

    // Default pairs for Solana
    const defaultPairs = [
      { token0: 'USDC', token1: 'USDT' },
      { token0: 'USDC', token1: 'SOL' },
      { token0: 'USDT', token1: 'SOL' },
      { token0: 'USDC', token1: 'RAY' },
    ];

    const pairsToCheck = pairs || defaultPairs;

    for (const pair of pairsToCheck) {
      try {
        const opportunity = await this.fetchPoolState(pair.token0, pair.token1);
        if (opportunity) {
          opportunities.push(opportunity);
        }
      } catch (error) {
        logger.debug(`[Meteora] Failed to fetch ${pair.token0}/${pair.token1} pool: ${error}`);
      }
    }

    // Sort by effective APR descending
    opportunities.sort((a, b) => b.effectiveAPR - a.effectiveAPR);

    logger.debug(`[Meteora] Found ${opportunities.length} pool opportunities`);

    return opportunities;
  }

  /**
   * Fetch state for a specific pool
   */
  private async fetchPoolState(
    token0Symbol: string,
    token1Symbol: string
  ): Promise<PoolOpportunity | null> {
    const token0Address = TOKEN_ADDRESSES.solana[token0Symbol as keyof typeof TOKEN_ADDRESSES.solana];
    const token1Address = TOKEN_ADDRESSES.solana[token1Symbol as keyof typeof TOKEN_ADDRESSES.solana];

    if (!token0Address || !token1Address) {
      logger.warn(`[Meteora] Unknown token: ${token0Symbol} or ${token1Symbol}`);
      return null;
    }

    // For Meteora, we would query the DLMM program for pool addresses
    // This is a simplified implementation
    const poolAddress = await this.findPoolAddress(token0Address, token1Address);

    if (!poolAddress) {
      return null;
    }

    // Check cache first
    const cacheKey = `${token0Address}-${token1Address}`;
    const cached = this.poolCache.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.CACHE_TTL) {
      return this.buildOpportunityFromPoolState(cached);
    }

    // Fetch pool state from Meteora
    const poolState = await this.fetchMeteoraPoolState(poolAddress, token0Address, token1Address);

    if (!poolState) {
      return null;
    }

    // Cache the result
    this.poolCache.set(cacheKey, poolState);

    return this.buildOpportunityFromPoolState(poolState);
  }

  /**
   * Find Meteora pool address for a token pair
   */
  private async findPoolAddress(
    tokenMint0: string,
    tokenMint1: string
  ): Promise<PublicKey | null> {
    try {
      // Meteora uses a PDA derivation for pool addresses
      const dlmmProgram = new PublicKey(METEORA_ADDRESSES.dlmmProgram);

      // Sort mints (Meteora convention)
      const mintA = new PublicKey(tokenMint0);
      const mintB = new PublicKey(tokenMint1);
      const [mint0, mint1] = mintA.toBuffer().compare(mintB.toBuffer()) < 0
        ? [mintA, mintB]
        : [mintB, mintA];

      // This is a simplified implementation
      // In production, you'd use Meteora's SDK to find the pool
      return null; // Placeholder - would return actual pool address
    } catch {
      return null;
    }
  }

  /**
   * Fetch Meteora pool state
   */
  private async fetchMeteoraPoolState(
    poolAddress: PublicKey,
    tokenMint0: string,
    tokenMint1: string
  ): Promise<PoolState | null> {
    try {
      // Fetch pool account data
      const accountInfo = await this.connection.getAccountInfo(poolAddress);

      if (!accountInfo) {
        return null;
      }

      // Parse pool data (simplified - Meteora has complex bin structure)
      const data = accountInfo.data;

      // Get token prices for valuation
      const [price0, price1] = await Promise.all([
        this.getTokenPrice(tokenMint0),
        this.getTokenPrice(tokenMint1),
      ]);

      // Calculate pool metrics
      // Note: This is a simplified implementation
      // Meteora DLMM has complex bin-based liquidity distribution
      const tvl = 100000; // Placeholder - would calculate from reserves
      const volume24h = 50000; // Placeholder - would fetch from API
      const feeAPR = 15; // Placeholder - would calculate from fees

      return {
        address: poolAddress.toBase58(),
        token0: {
          symbol: this.getTokenSymbol(tokenMint0),
          address: tokenMint0,
          decimals: await this.getTokenDecimals(tokenMint0),
          chain: 'solana',
        },
        token1: {
          symbol: this.getTokenSymbol(tokenMint1),
          address: tokenMint1,
          decimals: await this.getTokenDecimals(tokenMint1),
          chain: 'solana',
        },
        feeTier: 0, // Meteora uses bin steps instead of fixed fee tiers
        sqrtPriceX96: undefined,
        tick: undefined,
        liquidity: BigInt(1_000_000),
        tvl,
        volume24h,
        feeAPR,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.debug(`[Meteora] Failed to fetch pool state: ${error}`);
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
    const APR_WEIGHT = 0.5;
    const TVL_WEIGHT = 0.3;
    const VOLUME_WEIGHT = 0.2;

    const aprScore = Math.min(aprBreakdown.effectiveAPR / 50, 1);
    const tvlScore = Math.min(pool.tvl / 5000000, 1);
    const volumeScore = Math.min(pool.volume24h / 500000, 1);

    return (aprScore * APR_WEIGHT) + (tvlScore * TVL_WEIGHT) + (volumeScore * VOLUME_WEIGHT);
  }

  /**
   * Calculate risk score for a pool
   */
  private calculateRiskScore(pool: PoolState): number {
    let risk = 0.3; // Solana generally has good liquidity

    if (pool.tvl < 50000) risk += 0.2;
    else if (pool.tvl < 500000) risk += 0.1;

    if (pool.volume24h < 10000) risk += 0.1;

    return Math.min(risk, 1);
  }

  /**
   * Estimate IL risk from token pair
   */
  private estimateILRiskFromPair(token0: Token, token1: Token): number {
    const stablecoins = ['USDC', 'USDT', 'PYUSD'];
    const isStable0 = stablecoins.includes(token0.symbol);
    const isStable1 = stablecoins.includes(token1.symbol);

    if (isStable0 && isStable1) return 0.005;
    if (isStable0 || isStable1) return 0.04;

    return 0.15; // Higher IL risk on Solana due to volatility
  }

  // =========================================================================
  // LIQUIDITY OPERATIONS
  // =========================================================================

  /**
   * Add liquidity to a Meteora pool
   */
  async addLiquidity(params: AddLiquidityParams): Promise<DEXOperationResult> {
    const startTime = Date.now();

    try {
      logger.info(`[Meteora] Adding liquidity to ${params.poolAddress}`);

      const transaction = new Transaction();

      // Add liquidity instructions
      // Note: This is a simplified implementation
      // In production, use Meteora SDK to properly construct transactions

      const signature = await this.connection.sendTransaction(
        transaction,
        [this.keypair]
      );

      logger.info(`[Meteora] Add liquidity tx sent: ${signature}`);

      const confirmation = await this.connection.confirmTransaction(
        signature,
        this.commitment
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      const gasCost = await this.estimateGasCost('add_liquidity', params);

      return {
        success: true,
        txHash: signature,
        actualAmount: params.token0Amount + params.token1Amount,
        gasCost,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[Meteora] Add liquidity failed: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Remove liquidity from a Meteora pool
   */
  async removeLiquidity(params: RemoveLiquidityParams): Promise<DEXOperationResult> {
    const startTime = Date.now();

    try {
      logger.info(`[Meteora] Removing liquidity from position ${params.positionId}`);

      const transaction = new Transaction();

      const signature = await this.connection.sendTransaction(
        transaction,
        [this.keypair]
      );

      const confirmation = await this.connection.confirmTransaction(
        signature,
        this.commitment
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      return {
        success: true,
        txHash: signature,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[Meteora] Remove liquidity failed: ${error}`);
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
   * Get current fee rate in SOL and USD
   */
  async getGasPrice(): Promise<{ gasPrice: number; gasPriceUsd: number }> {
    try {
      const feeCalculator = await this.connection.getRecentBlockhashAndContext();
      const lamportsPerSignature = feeCalculator.value.feeCalculator.lamportsPerSignature;

      const solPrice = 150; // Placeholder SOL price

      return {
        gasPrice: lamportsPerSignature,
        gasPriceUsd: (lamportsPerSignature / LAMPORTS_PER_SOL) * solPrice,
      };
    } catch {
      return {
        gasPrice: 5000, // Default fee
        gasPriceUsd: (5000 / LAMPORTS_PER_SOL) * 150,
      };
    }
  }

  /**
   * Estimate transaction cost for an operation
   */
  async estimateGasCost(operation: string, params: unknown): Promise<number> {
    // Estimate compute units and fee
    const computeUnitEstimates: Record<string, number> = {
      add_liquidity: 200000,
      remove_liquidity: 150000,
      create_position: 250000,
      collect_fees: 100000,
    };

    const computeUnits = computeUnitEstimates[operation] || 100000;

    // Prioritization fee (in lamports per compute unit)
    const priorityFee = 1000; // Micro-lamports

    const totalFee = computeUnits * priorityFee;
    const solPrice = 150;

    return (totalFee / LAMPORTS_PER_SOL) * solPrice;
  }

  /**
   * Get token balance
   */
  async getTokenBalance(tokenAddress: string): Promise<number> {
    try {
      const mint = new PublicKey(tokenAddress);
      const ata = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.keypair,
        mint,
        this.keypair.publicKey
      );

      const balance = await this.connection.getTokenAccountBalance(ata.address);
      return parseFloat(balance.value.amount || '0');
    } catch {
      return 0;
    }
  }

  /**
   * Approve token for spending (Solana uses delegate approval)
   */
  async approveToken(
    tokenAddress: string,
    spender: string,
    amount?: bigint
  ): Promise<DEXOperationResult> {
    const startTime = Date.now();

    try {
      const mint = new PublicKey(tokenAddress);
      const spenderPubkey = new PublicKey(spender);

      const signature = await approve(
        this.connection,
        this.keypair,
        mint,
        this.keypair.publicKey,
        spenderPubkey,
        amount || BigInt(1000000) * BigInt(10 ** 18)
      );

      return {
        success: true,
        txHash: signature,
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

  // =========================================================================
  // IL CALCULATION
  // =========================================================================

  /**
   * Estimate impermanent loss risk for a pool
   */
  protected async estimateImpermanentLossRisk(pool: PoolState): Promise<number> {
    return this.estimateILRiskFromPair(pool.token0, pool.token1);
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  /**
   * Get token price (simplified)
   */
  private async getTokenPrice(tokenMint: string): Promise<number> {
    // In production, use Jupiter API or Pyth for price feeds
    const knownPrices: Record<string, number> = {
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1, // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 1, // USDT
      'So11111111111111111111111111111111111111112': 150, // SOL
    };

    return knownPrices[tokenMint] || 0;
  }

  /**
   * Get token decimals
   */
  private async getTokenDecimals(tokenMint: string): Promise<number> {
    try {
      const mintInfo = await this.connection.getTokenSupply(new PublicKey(tokenMint));
      return mintInfo.value.decimals;
    } catch {
      return 9; // Default for Solana tokens
    }
  }

  /**
   * Get token symbol from mint address
   */
  private getTokenSymbol(tokenMint: string): string {
    const knownSymbols: Record<string, string> = {
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
      'So11111111111111111111111111111111111111112': 'SOL',
      '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
    };

    return knownSymbols[tokenMint] || 'UNKNOWN';
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
    logger.info('[Meteora] Disconnected');
  }
}
