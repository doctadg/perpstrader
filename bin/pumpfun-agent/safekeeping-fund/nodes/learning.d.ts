import type { SafekeepingFundState } from '../state';
/**
 * Learning Node
 * Analyzes execution results and updates learning metrics
 */
export declare function learningNode(state: SafekeepingFundState): Promise<Partial<SafekeepingFundState>>;
/**
 * Calculate performance score for the cycle
 */
export declare function calculateCycleScore(state: SafekeepingFundState): number;
/**
 * Get learning summary for logging
 */
export declare function getLearningSummary(state: SafekeepingFundState): string;
//# sourceMappingURL=learning.d.ts.map