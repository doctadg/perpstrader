// Fee Manager
// Resolves fee profiles, estimates priority fees, and configures Jito tips

import { FeesProfile, FeePriorityEstimate } from '../../shared/types';
import { DEFAULT_LAUNCHER_CONFIG } from '../config/defaults';
import logger from '../../shared/logger';

export interface FeeResolution {
  microLamportsPerCU: number;
  computeUnitLimit: number;
  jitoTipSol?: number;
  totalEstimatedFeeLamports: number;
}

/**
 * Resolve a FeesProfile into concrete fee values
 */
export function resolveFees(
  profile: FeesProfile,
  priorityEstimate?: FeePriorityEstimate
): FeeResolution {
  if (profile.mode === 'custom') {
    const microLamports = profile.microLamportsPerCU ?? DEFAULT_LAUNCHER_CONFIG.autoFeeProfile.microLamportsPerCU;
    const cuLimit = profile.computeUnitLimit ?? DEFAULT_LAUNCHER_CONFIG.autoFeeProfile.computeUnitLimit;
    const totalFee = (microLamports * cuLimit) / 1_000_000;

    return {
      microLamportsPerCU: microLamports,
      computeUnitLimit: cuLimit,
      jitoTipSol: profile.jitoTipSol,
      totalEstimatedFeeLamports: totalFee,
    };
  }

  // Auto mode — use priority estimate if available, otherwise defaults
  const defaults = DEFAULT_LAUNCHER_CONFIG.autoFeeProfile;

  let microLamports = defaults.microLamportsPerCU;
  let cuLimit = defaults.computeUnitLimit;

  if (priorityEstimate) {
    microLamports = Math.max(microLamports, priorityEstimate.medium);
    logger.debug(`[FeeManager] Auto-resolved to medium priority: ${microLamports} microLamports/CU`);
  }

  const totalFee = (microLamports * cuLimit) / 1_000_000;

  return {
    microLamportsPerCU: microLamports,
    computeUnitLimit: cuLimit,
    jitoTipSol: profile.jitoTipSol ?? DEFAULT_LAUNCHER_CONFIG.jitoTipFloorSol,
    totalEstimatedFeeLamports: totalFee,
  };
}

/**
 * Calculate burst fee — higher CU limit and priority for block0 race
 */
export function resolveBurstFees(
  profile: FeesProfile,
  priorityEstimate?: FeePriorityEstimate
): FeeResolution {
  const base = resolveFees(profile, priorityEstimate);

  if (!profile.burstBlock0) return base;

  // Burst: max out CU and use very high priority
  const cuLimit = Math.min(
    profile.computeUnitLimit ?? 1_400_000,
    1_400_000
  );

  const microLamports = priorityEstimate
    ? priorityEstimate.veryHigh
    : base.microLamportsPerCU * 3;

  const jitoTip = profile.jitoTipSol ?? DEFAULT_LAUNCHER_CONFIG.jitoTipCeilSol;

  return {
    microLamportsPerCU: microLamports,
    computeUnitLimit: cuLimit,
    jitoTipSol: jitoTip,
    totalEstimatedFeeLamports: (microLamports * cuLimit) / 1_000_000,
  };
}

/**
 * Estimate total fees for an entire plan (sum of all steps)
 */
export function estimatePlanFees(
  profile: FeesProfile,
  stepCount: number,
  isBurst: boolean,
  priorityEstimate?: FeePriorityEstimate
): number {
  const feeFn = isBurst ? resolveBurstFees : resolveFees;
  const perStep = feeFn(profile, priorityEstimate);
  return perStep.totalEstimatedFeeLamports * stepCount;
}
