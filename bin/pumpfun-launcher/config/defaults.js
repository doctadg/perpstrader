"use strict";
// Default configuration for pumpfun-launcher
Object.defineProperty(exports, "__esModule", { value: true });
exports.POSITION_DEFAULTS = exports.ORCHESTRATOR_DEFAULTS = exports.DEFAULT_FEES_PROFILE = exports.DEFAULT_LAUNCHER_CONFIG = void 0;
exports.DEFAULT_LAUNCHER_CONFIG = {
    maxConcurrentRuns: 3,
    commitment: 'confirmed',
    blockhashStaleSlots: 120,
    autoFeeProfile: {
        microLamportsPerCU: 1_500_000,
        computeUnitLimit: 400_000,
    },
    slotPollIntervalMs: 400,
    planTimeoutMs: 5 * 60 * 1000, // 5 min
    stepSendRetries: 3,
    stepRetryDelayMs: 1000,
    jitoTipFloorSol: 0.001,
    jitoTipCeilSol: 0.01,
};
exports.DEFAULT_FEES_PROFILE = {
    mode: 'auto',
    microLamportsPerCU: 1_500_000,
    computeUnitLimit: 400_000,
    burstBlock0: false,
    jitoTipSol: 0.001,
};
// ===== Orchestrator defaults =====
exports.ORCHESTRATOR_DEFAULTS = {
    launchIntervalMs: 30 * 60 * 1000, // 30 min
    dailyBudgetSol: 2.0,
    buyAmountSolPerWallet: 0.05,
    numBuyerWallets: 10,
    jitoTipSol: 0.005,
    targetMcapUsd: 5000,
    printterminalUrl: 'http://localhost:3001',
    narrativeCooldownMs: 24 * 60 * 60 * 1000, // 24h
    dataDir: './data/pumpfun-launcher',
    minNarrativeScore: 30,
};
// ===== Position Manager defaults =====
exports.POSITION_DEFAULTS = {
    targetMcapUsd: 5000,
    extendedTargetMcapUsd: 10000,
    maxHoldTimeMs: 30 * 60 * 1000, // 30 min
    stopLossPct: 0.5,
    momentumMultiplier: 2.0,
    momentumWindowMs: 5 * 60 * 1000, // 5 min
    sweepAfterSell: true,
    sellSlippageBps: 1000,
    pollIntervalMs: 5000,
};
//# sourceMappingURL=defaults.js.map