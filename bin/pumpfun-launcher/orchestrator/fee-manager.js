"use strict";
// Fee Manager
// Resolves fee profiles, estimates priority fees, and configures Jito tips
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFees = resolveFees;
exports.resolveBurstFees = resolveBurstFees;
exports.estimatePlanFees = estimatePlanFees;
const defaults_1 = require("../config/defaults");
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * Resolve a FeesProfile into concrete fee values
 */
function resolveFees(profile, priorityEstimate) {
    if (profile.mode === 'custom') {
        const microLamports = profile.microLamportsPerCU ?? defaults_1.DEFAULT_LAUNCHER_CONFIG.autoFeeProfile.microLamportsPerCU;
        const cuLimit = profile.computeUnitLimit ?? defaults_1.DEFAULT_LAUNCHER_CONFIG.autoFeeProfile.computeUnitLimit;
        const totalFee = (microLamports * cuLimit) / 1_000_000;
        return {
            microLamportsPerCU: microLamports,
            computeUnitLimit: cuLimit,
            jitoTipSol: profile.jitoTipSol,
            totalEstimatedFeeLamports: totalFee,
        };
    }
    // Auto mode — use priority estimate if available, otherwise defaults
    const defaults = defaults_1.DEFAULT_LAUNCHER_CONFIG.autoFeeProfile;
    let microLamports = defaults.microLamportsPerCU;
    let cuLimit = defaults.computeUnitLimit;
    if (priorityEstimate) {
        microLamports = Math.max(microLamports, priorityEstimate.medium);
        logger_1.default.debug(`[FeeManager] Auto-resolved to medium priority: ${microLamports} microLamports/CU`);
    }
    const totalFee = (microLamports * cuLimit) / 1_000_000;
    return {
        microLamportsPerCU: microLamports,
        computeUnitLimit: cuLimit,
        jitoTipSol: profile.jitoTipSol ?? defaults_1.DEFAULT_LAUNCHER_CONFIG.jitoTipFloorSol,
        totalEstimatedFeeLamports: totalFee,
    };
}
/**
 * Calculate burst fee — higher CU limit and priority for block0 race
 */
function resolveBurstFees(profile, priorityEstimate) {
    const base = resolveFees(profile, priorityEstimate);
    if (!profile.burstBlock0)
        return base;
    // Burst: max out CU and use very high priority
    const cuLimit = Math.min(profile.computeUnitLimit ?? 1_400_000, 1_400_000);
    const microLamports = priorityEstimate
        ? priorityEstimate.veryHigh
        : base.microLamportsPerCU * 3;
    const jitoTip = profile.jitoTipSol ?? defaults_1.DEFAULT_LAUNCHER_CONFIG.jitoTipCeilSol;
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
function estimatePlanFees(profile, stepCount, isBurst, priorityEstimate) {
    const feeFn = isBurst ? resolveBurstFees : resolveFees;
    const perStep = feeFn(profile, priorityEstimate);
    return perStep.totalEstimatedFeeLamports * stepCount;
}
//# sourceMappingURL=fee-manager.js.map