import type { Chain, DEX, PoolOpportunity } from './types';
declare class DefiLlamaYields {
    private cache;
    private readonly CACHE_TTL;
    /**
     * Fetch all relevant pool data from DefiLlama
     */
    fetchPools(): Promise<PoolOpportunity[]>;
    /**
     * Fetch pools for a specific DEX
     */
    fetchPoolsByDEX(dex: DEX): Promise<PoolOpportunity[]>;
    /**
     * Fetch pools for a specific chain
     */
    fetchPoolsByChain(chain: Chain): Promise<PoolOpportunity[]>;
    /**
     * Fetch only stablecoin pairs (lowest risk)
     */
    fetchStablePools(): Promise<PoolOpportunity[]>;
    /**
     * Get summary statistics
     */
    getSummary(): Promise<{
        totalPools: number;
        avgAPR: number;
        bestAPR: number;
        byDEX: Record<string, {
            count: number;
            avgAPR: number;
            bestAPR: number;
            totalTVL: number;
        }>;
        byChain: Record<string, {
            count: number;
            avgAPR: number;
            totalTVL: number;
        }>;
    }>;
    /**
     * Convert DefiLlama pool to our PoolOpportunity format
     */
    private toPoolOpportunity;
    /**
     * Parse a DefiLlama symbol into token pair
     */
    private parseSymbol;
    /**
     * Get token decimals
     */
    private getDecimals;
    /**
     * Estimate fee tier based on pool data
     */
    private estimateFeeTier;
    /**
     * Estimate gas cost based on chain
     */
    private estimateGasCost;
    /**
     * Calculate risk score from pool data
     */
    private calculateRiskScore;
}
export declare const defiLlamaYields: DefiLlamaYields;
export default defiLlamaYields;
//# sourceMappingURL=defillama-yields.d.ts.map