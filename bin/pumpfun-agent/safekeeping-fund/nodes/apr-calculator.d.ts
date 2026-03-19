import type { SafekeepingFundState } from '../state';
import type { PoolOpportunity, APRBreakdown } from '../types';
/**
 * APR Calculator Node
 * Processes raw pool data and calculates effective APRs
 */
export declare function aprCalculatorNode(state: SafekeepingFundState): Promise<Partial<SafekeepingFundState>>;
/**
 * Create APR breakdown for a pool
 */
export declare function createAPRBreakdown(pool: PoolOpportunity): APRBreakdown;
//# sourceMappingURL=apr-calculator.d.ts.map