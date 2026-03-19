import type { SafekeepingFundState } from '../state';
import type { PoolOpportunity } from '../types';
/**
 * Rebalance Planner Node
 * Generates rebalance actions based on opportunities and market conditions
 */
export declare function rebalancePlannerNode(state: SafekeepingFundState): Promise<Partial<SafekeepingFundState>>;
/**
 * Calculate optimal allocation across top pools
 */
export declare function calculateOptimalAllocation(opportunities: PoolOpportunity[], totalValue: number, maxPositions?: number): Map<string, number>;
//# sourceMappingURL=rebalance-planner.d.ts.map