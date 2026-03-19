import type { Chain, DEX, Token, PoolOpportunity, LiquidityPosition, AddLiquidityParams, RemoveLiquidityParams, ChainStatus, APRBreakdown, ILCalculation } from '../types';
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
export declare abstract class BaseDEXClient {
    protected readonly chain: Chain;
    protected readonly dex: DEX;
    protected readonly rpcUrl: string;
    protected isConnected: boolean;
    protected lastError?: Error;
    protected connectionLatency: number;
    constructor(chain: Chain, dex: DEX, rpcUrl: string);
    /**
     * Initialize the client connection
     */
    abstract initialize(): Promise<void>;
    /**
     * Fetch pool states for monitored pairs
     */
    abstract fetchPoolStates(pairs?: Array<{
        token0: string;
        token1: string;
    }>): Promise<PoolOpportunity[]>;
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
    abstract getGasPrice(): Promise<{
        gasPrice: number;
        gasPriceUsd: number;
    }>;
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
    /**
     * Check if client is connected and healthy
     */
    checkConnection(): Promise<ChainStatus>;
    /**
     * Health check - implementation specific
     */
    protected abstract healthCheck(): Promise<void>;
    /**
     * Calculate effective APR considering all factors
     */
    protected calculateEffectiveAPR(pool: PoolState, gasCost: number): Promise<APRBreakdown>;
    /**
     * Estimate impermanent loss risk for a pool
     */
    protected abstract estimateImpermanentLossRisk(pool: PoolState): Promise<number>;
    /**
     * Calculate impermanent loss given price change
     */
    calculateIL(priceRatioStart: number, priceRatioEnd: number): ILCalculation;
    /**
     * Validate pool address
     */
    protected isValidPoolAddress(address: string): boolean;
    /**
     * Get chain identifier
     */
    getChain(): Chain;
    /**
     * Get DEX identifier
     */
    getDEX(): DEX;
    /**
     * Check if connected
     */
    getConnectionStatus(): boolean;
    /**
     * Get last error
     */
    getLastError(): Error | undefined;
    /**
     * Get connection latency
     */
    getLatency(): number;
    /**
     * Disconnect and cleanup
     */
    abstract disconnect(): Promise<void>;
    /**
     * Execute with retry logic
     */
    protected executeWithRetry<T>(operation: string, fn: () => Promise<T>, maxRetries?: number, baseDelay?: number): Promise<T>;
}
/**
 * Export utility functions
 */
export declare const DEXUtils: {
    /**
     * Calculate price from sqrtPriceX96 (Uniswap V3 format)
     */
    sqrtPriceX96ToPrice(sqrtPriceX96: bigint, token0Decimals: number, token1Decimals: number): number;
    /**
     * Convert price to sqrtPriceX96
     */
    priceToSqrtPriceX96(price: number, token0Decimals: number, token1Decimals: number): bigint;
    /**
     * Calculate tick from sqrtPriceX96
     */
    sqrtPriceX96ToTick(sqrtPriceX96: bigint): number;
    /**
     * Calculate sqrtPriceX96 from tick
     */
    tickToSqrtPriceX96(tick: number): bigint;
    /**
     * Format token amount with decimals
     */
    formatTokenAmount(amount: bigint, decimals: number): number;
    /**
     * Parse token amount to bigint
     */
    parseTokenAmount(amount: number, decimals: number): bigint;
    /**
     * Calculate minimum amount out with slippage
     */
    calculateMinAmountOut(amountOut: number, slippageTolerance: number): bigint;
    /**
     * Estimate gas cost in USD
     */
    estimateGasCostUsd(gasUsed: number, gasPrice: number, nativeTokenPrice: number): number;
};
//# sourceMappingURL=base-dex-client.d.ts.map