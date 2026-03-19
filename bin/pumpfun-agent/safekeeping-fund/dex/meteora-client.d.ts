import { BaseDEXClient, DEXOperationResult, PoolState } from './base-dex-client';
import type { PoolOpportunity, LiquidityPosition, AddLiquidityParams, RemoveLiquidityParams } from '../types';
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
export declare class MeteoraClient extends BaseDEXClient {
    private connection;
    private keypair;
    private commitment;
    private positions;
    private poolCache;
    private readonly CACHE_TTL;
    constructor(config: MeteoraClientConfig);
    initialize(): Promise<void>;
    /**
     * Health check for the connection
     */
    protected healthCheck(): Promise<void>;
    /**
     * Fetch pool states for monitored pairs
     */
    fetchPoolStates(pairs?: Array<{
        token0: string;
        token1: string;
    }>): Promise<PoolOpportunity[]>;
    /**
     * Fetch state for a specific pool
     */
    private fetchPoolState;
    /**
     * Find Meteora pool address for a token pair
     */
    private findPoolAddress;
    /**
     * Fetch Meteora pool state
     */
    private fetchMeteoraPoolState;
    /**
     * Build PoolOpportunity from PoolState
     */
    private buildOpportunityFromPoolState;
    /**
     * Calculate composite score for ranking
     */
    private calculateCompositeScore;
    /**
     * Calculate risk score for a pool
     */
    private calculateRiskScore;
    /**
     * Estimate IL risk from token pair
     */
    private estimateILRiskFromPair;
    /**
     * Add liquidity to a Meteora pool
     */
    addLiquidity(params: AddLiquidityParams): Promise<DEXOperationResult>;
    /**
     * Remove liquidity from a Meteora pool
     */
    removeLiquidity(params: RemoveLiquidityParams): Promise<DEXOperationResult>;
    /**
     * Get current liquidity positions
     */
    getPositions(): Promise<LiquidityPosition[]>;
    /**
     * Get current fee rate in SOL and USD
     */
    getGasPrice(): Promise<{
        gasPrice: number;
        gasPriceUsd: number;
    }>;
    /**
     * Estimate transaction cost for an operation
     */
    estimateGasCost(operation: string, params: unknown): Promise<number>;
    /**
     * Get token balance
     */
    getTokenBalance(tokenAddress: string): Promise<number>;
    /**
     * Approve token for spending (Solana uses delegate approval)
     */
    approveToken(tokenAddress: string, spender: string, amount?: bigint): Promise<DEXOperationResult>;
    /**
     * Estimate impermanent loss risk for a pool
     */
    protected estimateImpermanentLossRisk(pool: PoolState): Promise<number>;
    /**
     * Get token price (simplified)
     */
    private getTokenPrice;
    /**
     * Get token decimals
     */
    private getTokenDecimals;
    /**
     * Get token symbol from mint address
     */
    private getTokenSymbol;
    /**
     * Disconnect and cleanup
     */
    disconnect(): Promise<void>;
}
//# sourceMappingURL=meteora-client.d.ts.map