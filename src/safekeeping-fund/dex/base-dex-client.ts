// Safekeeping Fund System - Base DEX Client
// Abstract base class for all DEX client implementations

import type {
  Chain,
  DEX,
  Token,
  PoolOpportunity,
  LiquidityPosition,
  AddLiquidityParams,
  RemoveLiquidityParams,
  ChainStatus,
  APRBreakdown,
  ILCalculation,
} from '../types';
import logger from '../../shared/logger';

/**
 * Result of a DEX operation
 */
export interface DEXOperationResult {
  success: boolean;
  txHash?: string;
  actualAmount?: number;
  gasUsed?: number;
  gasCost?: number;
  error?: string;
  duration: number;
}

/**
 * Pool state information
 */
export interface PoolState {
  address: string;
  token0: Token;
  token1: Token;
  feeTier: number;
  sqrtPriceX96?: string;
  tick?: number;
  liquidity: bigint;
  tvl: number;
  volume24h: number;
  feeAPR: number;
  lastUpdated: Date;
}

/**
 * Abstract base class for DEX clients
 * All DEX-specific clients should extend this class
 */
export abstract class BaseDEXClient {
  protected readonly chain: Chain;
  protected readonly dex: DEX;
  protected readonly rpcUrl: string;
  protected isConnected: boolean;
  protected lastError?: Error;
  protected connectionLatency: number;

  constructor(chain: Chain, dex: DEX, rpcUrl: string) {
    this.chain = chain;
    this.dex = dex;
    this.rpcUrl = rpcUrl;
    this.isConnected = false;
    this.connectionLatency = 0;
  }

  // =========================================================================
  // ABSTRACT METHODS - Must be implemented by subclasses
  // =========================================================================

  /**
   * Initialize the client connection
   */
  abstract initialize(): Promise<void>;

  /**
   * Fetch pool states for monitored pairs
   */
  abstract fetchPoolStates(pairs?: Array<{ token0: string; token1: string }>): Promise<PoolOpportunity[]>;

  /**
   * Add liquidity to a pool
   */
  abstract addLiquidity(params: AddLiquidityParams): Promise<DEXOperationResult>;

  /**
   * Remove liquidity from a pool
   */
  abstract removeLiquidity(params: RemoveLiquidityParams): Promise<DEXOperationResult>;

  /**
   * Get current liquidity positions
   */
  abstract getPositions(): Promise<LiquidityPosition[]>;

  /**
   * Get current gas price in native token and USD
   */
  abstract getGasPrice(): Promise<{ gasPrice: number; gasPriceUsd: number }>;

  /**
   * Estimate gas cost for an operation
   */
  abstract estimateGasCost(operation: string, params: unknown): Promise<number>;

  /**
   * Get token balance
   */
  abstract getTokenBalance(tokenAddress: string): Promise<number>;

  /**
   * Approve token for spending
   */
  abstract approveToken(tokenAddress: string, spender: string, amount?: bigint): Promise<DEXOperationResult>;

  // =========================================================================
  // COMMON METHODS - Shared across all DEX clients
  // =========================================================================

  /**
   * Check if client is connected and healthy
   */
  async checkConnection(): Promise<ChainStatus> {
    const startTime = Date.now();

    try {
      await this.healthCheck();
      this.isConnected = true;
      this.connectionLatency = Date.now() - startTime;

      const gasData = await this.getGasPrice().catch(() => ({ gasPrice: 0, gasPriceUsd: 0 }));

      return {
        chain: this.chain,
        isConnected: true,
        gasPrice: gasData.gasPrice,
        gasPriceUsd: gasData.gasPriceUsd,
        latency: this.connectionLatency,
        lastUpdated: new Date(),
      };
    } catch (error) {
      this.isConnected = false;
      this.lastError = error as Error;
      this.connectionLatency = Date.now() - startTime;

      logger.error(`[DEX:${this.chain}] Connection check failed: ${error}`);

      return {
        chain: this.chain,
        isConnected: false,
        latency: this.connectionLatency,
        lastUpdated: new Date(),
      };
    }
  }

  /**
   * Health check - implementation specific
   */
  protected abstract healthCheck(): Promise<void>;

  /**
   * Calculate effective APR considering all factors
   */
  protected async calculateEffectiveAPR(
    pool: PoolState,
    gasCost: number
  ): Promise<APRBreakdown> {
    // Trading fee APR (from pool fees)
    const tradingFeeAPR = pool.feeAPR;

    // Calculate impermanent loss risk based on pool volatility
    const ilRisk = await this.estimateImpermanentLossRisk(pool);

    // Annualized gas cost impact
    const gasCostAPR = pool.tvl > 0 ? (gasCost / pool.tvl) * 365 : 0;

    // Effective APR after all costs
    const effectiveAPR = Math.max(0, tradingFeeAPR - ilRisk - gasCostAPR);

    return {
      tradingFeeAPR,
      rewardAPR: 0, // Most pools don't have additional rewards
      impermanentLoss: ilRisk,
      gasCostAPR,
      effectiveAPR,
    };
  }

  /**
   * Estimate impermanent loss risk for a pool
   */
  protected abstract estimateImpermanentLossRisk(pool: PoolState): Promise<number>;

  /**
   * Calculate impermanent loss given price change
   */
  calculateIL(priceRatioStart: number, priceRatioEnd: number): ILCalculation {
    // Standard IL formula for 50/50 pools
    const priceRatioChange = priceRatioEnd / priceRatioStart;
    const sqrtRatio = Math.sqrt(priceRatioChange);

    const impermanentLoss = (2 * sqrtRatio) / (1 + priceRatioChange) - 1;

    return {
      currentPriceRatio: priceRatioEnd,
      entryPriceRatio: priceRatioStart,
      impermanentLoss,
      hodlValue: priceRatioEnd,
      lpValue: 1 + impermanentLoss,
    };
  }

  /**
   * Validate pool address
   */
  protected isValidPoolAddress(address: string): boolean {
    // EVM address check (0x + 40 hex chars)
    if (this.chain === 'ethereum' || this.chain === 'bsc') {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    // Solana address check (base58, 32-44 chars)
    if (this.chain === 'solana') {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    }
    return false;
  }

  /**
   * Get chain identifier
   */
  getChain(): Chain {
    return this.chain;
  }

  /**
   * Get DEX identifier
   */
  getDEX(): DEX {
    return this.dex;
  }

  /**
   * Check if connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get last error
   */
  getLastError(): Error | undefined {
    return this.lastError;
  }

  /**
   * Get connection latency
   */
  getLatency(): number {
    return this.connectionLatency;
  }

  /**
   * Disconnect and cleanup
   */
  abstract disconnect(): Promise<void>;

  /**
   * Execute with retry logic
   */
  protected async executeWithRetry<T>(
    operation: string,
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const delay = baseDelay * Math.pow(2, attempt);

        logger.warn(
          `[DEX:${this.chain}] ${operation} failed (attempt ${attempt + 1}/${maxRetries}), ` +
          `retrying in ${delay}ms: ${error}`
        );

        if (attempt < maxRetries - 1) {
          await sleep(delay);
        }
      }
    }

    throw new Error(
      `${operation} failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Export utility functions
 */
export const DEXUtils = {
  /**
   * Calculate price from sqrtPriceX96 (Uniswap V3 format)
   */
  sqrtPriceX96ToPrice(sqrtPriceX96: bigint, token0Decimals: number, token1Decimals: number): number {
    const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
    const price = sqrtPrice * sqrtPrice;
    const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);
    return price * decimalAdjustment;
  },

  /**
   * Convert price to sqrtPriceX96
   */
  priceToSqrtPriceX96(price: number, token0Decimals: number, token1Decimals: number): bigint {
    const decimalAdjustment = 10 ** (token0Decimals - token1Decimals);
    const adjustedPrice = price / decimalAdjustment;
    const sqrtPrice = Math.sqrt(adjustedPrice);
    const sqrtPriceX96 = sqrtPrice * (2 ** 96);
    return BigInt(Math.floor(sqrtPriceX96));
  },

  /**
   * Calculate tick from sqrtPriceX96
   */
  sqrtPriceX96ToTick(sqrtPriceX96: bigint): number {
    const sqrtPrice = Number(sqrtPriceX96) / (2 ** 96);
    return Math.floor(Math.log(sqrtPrice) / Math.log(Math.sqrt(1.0001)));
  },

  /**
   * Calculate sqrtPriceX96 from tick
   */
  tickToSqrtPriceX96(tick: number): bigint {
    const sqrtPrice = Math.sqrt(1.0001) ** tick;
    const sqrtPriceX96 = sqrtPrice * (2 ** 96);
    return BigInt(Math.floor(sqrtPriceX96));
  },

  /**
   * Format token amount with decimals
   */
  formatTokenAmount(amount: bigint, decimals: number): number {
    return Number(amount) / (10 ** decimals);
  },

  /**
   * Parse token amount to bigint
   */
  parseTokenAmount(amount: number, decimals: number): bigint {
    return BigInt(Math.floor(amount * (10 ** decimals)));
  },

  /**
   * Calculate minimum amount out with slippage
   */
  calculateMinAmountOut(amountOut: number, slippageTolerance: number): bigint {
    const minAmount = amountOut * (1 - slippageTolerance);
    return BigInt(Math.floor(minAmount * (10 ** 18))); // Assuming 18 decimals
  },

  /**
   * Estimate gas cost in USD
   */
  estimateGasCostUsd(gasUsed: number, gasPrice: number, nativeTokenPrice: number): number {
    const gasCostNative = (gasUsed * gasPrice) / 1e9; // Convert to token units
    return gasCostNative * nativeTokenPrice;
  },
};
