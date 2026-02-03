import { BaseDEXClient, DEXOperationResult, PoolState } from './base-dex-client';
import type { PoolOpportunity, LiquidityPosition, AddLiquidityParams, RemoveLiquidityParams } from '../types';
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
export declare class PancakeswapV3Client extends BaseDEXClient {
    private publicClient;
    private walletClient;
    private account;
    private positions;
    private poolCache;
    private readonly CACHE_TTL;
    constructor(config: PancakeswapV3ClientConfig);
    initialize(): Promise<void>;
    protected healthCheck(): Promise<void>;
    fetchPoolStates(pairs?: Array<{
        token0: string;
        token1: string;
    }>): Promise<PoolOpportunity[]>;
    private fetchPoolState;
    private fetchSubgraphData;
    private buildOpportunityFromPoolState;
    private calculateCompositeScore;
    private calculateRiskScore;
    private estimateILRiskFromPair;
    addLiquidity(params: AddLiquidityParams): Promise<DEXOperationResult>;
    removeLiquidity(params: RemoveLiquidityParams): Promise<DEXOperationResult>;
    getPositions(): Promise<LiquidityPosition[]>;
    getGasPrice(): Promise<{
        gasPrice: number;
        gasPriceUsd: number;
    }>;
    estimateGasCost(operation: string, params: unknown): Promise<number>;
    getTokenBalance(tokenAddress: string): Promise<number>;
    approveToken(tokenAddress: string, spender: string, amount?: bigint): Promise<DEXOperationResult>;
    private ensureApproval;
    protected estimateImpermanentLossRisk(pool: PoolState): Promise<number>;
    /**
     * Get pool address for a token pair and fee tier
     * Simplified implementation - in production use subgraph or compute CREATE2
     */
    private getPoolAddress;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=pancakeswap-v3-client.d.ts.map