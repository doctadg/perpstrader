"use strict";
/**
 * Orchestrator Configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ORCHESTRATOR_CONFIG = void 0;
exports.DEFAULT_ORCHESTRATOR_CONFIG = {
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
//# sourceMappingURL=config.js.map