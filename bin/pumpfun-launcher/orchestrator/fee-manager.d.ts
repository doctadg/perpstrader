import { FeesProfile, FeePriorityEstimate } from '../../shared/types';
export interface FeeResolution {
    microLamportsPerCU: number;
    computeUnitLimit: number;
    jitoTipSol?: number;
    totalEstimatedFeeLamports: number;
}
/**
 * Resolve a FeesProfile into concrete fee values
 */
export declare function resolveFees(profile: FeesProfile, priorityEstimate?: FeePriorityEstimate): FeeResolution;
/**
 * Calculate burst fee — higher CU limit and priority for block0 race
 */
export declare function resolveBurstFees(profile: FeesProfile, priorityEstimate?: FeePriorityEstimate): FeeResolution;
/**
 * Estimate total fees for an entire plan (sum of all steps)
 */
export declare function estimatePlanFees(profile: FeesProfile, stepCount: number, isBurst: boolean, priorityEstimate?: FeePriorityEstimate): number;
//# sourceMappingURL=fee-manager.d.ts.map