import { BaseDEXClient, DEXOperationResult, PoolState } from './base-dex-client';
import type { Chain, PoolOpportunity, LiquidityPosition, AddLiquidityParams, RemoveLiquidityParams } from '../types';
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
export declare class UniswapV3Client extends BaseDEXClient {
    private publicClient;
    private walletClient;
    private account;
    private positions;
    private poolCache;
    private readonly CACHE_TTL;
    constructor(config: UniswapV3ClientConfig);
    /**
     * Initialize the client connection
     */
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
     * Fetch additional data from Uniswap V3 subgraph
     */
    private fetchSubgraphData;
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
     * Add liquidity to a pool
     */
    addLiquidity(params: AddLiquidityParams): Promise<DEXOperationResult>;
    /**
     * Remove liquidity from a pool
     */
    removeLiquidity(params: RemoveLiquidityParams): Promise<DEXOperationResult>;
    /**
     * Get current liquidity positions
     */
    getPositions(): Promise<LiquidityPosition[]>;
    /**
     * Get current gas price in ETH and USD
     */
    getGasPrice(): Promise<{
        gasPrice: number;
        gasPriceUsd: number;
    }>;
    /**
     * Estimate gas cost for an operation
     */
    estimateGasCost(operation: string, params: unknown): Promise<number>;
    /**
     * Get token balance
     */
    getTokenBalance(tokenAddress: string): Promise<number>;
    /**
     * Approve token for spending
     */
    approveToken(tokenAddress: string, spender: string, amount?: bigint): Promise<DEXOperationResult>;
    /**
     * Ensure token is approved for spending
     */
    private ensureApproval;
    /**
     * Estimate impermanent loss risk for a pool
     */
    protected estimateImpermanentLossRisk(pool: PoolState): Promise<number>;
    /**
     * Get pool address for a token pair and fee tier
     * In production, this would use the CREATE2 formula or subgraph lookup
     */
    private getPoolAddress;
    /**
     * Disconnect and cleanup
     */
    disconnect(): Promise<void>;
}
//# sourceMappingURL=uniswap-v3-client.d.ts.map