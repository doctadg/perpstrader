"use strict";
/**
 * Position Manager — Module exports and configuration
 *
 * Config defaults:
 *   TARGET_MCAP_USD: 5000       — Sell when mcap hits $5k
 *   EXTENDED_TARGET_MCAP_USD: 10000 — Momentum hold extends to $10k
 *   MAX_HOLD_TIME_MS: 1_800_000   — Force sell after 30 minutes
 *   STOP_LOSS_PCT: 0.5            — Emergency sell if mcap drops 50% from peak
 *   MOMENTUM_MULTIPLIER: 2.0      — Extend target if price 2x'd in 5 min
 *   MOMENTUM_WINDOW_MS: 300_000   — 5 minute lookback for momentum
 *   SWEEP_AFTER_SELL: true        — Sweep SOL back to main wallet after sell
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.POLL_INTERVAL_MS = exports.PRIORITY_FEE_MICROLAMPORTS = exports.SELL_SLIPPAGE_BPS = exports.SWEEP_AFTER_SELL = exports.MOMENTUM_WINDOW_MS = exports.MOMENTUM_MULTIPLIER = exports.STOP_LOSS_PCT = exports.MAX_HOLD_TIME_MS = exports.EXTENDED_TARGET_MCAP_USD = exports.TARGET_MCAP_USD = exports.SellExecutor = exports.BondingCurveTracker = exports.DEFAULT_CONFIG = exports.PositionManager = void 0;
var position_manager_1 = require("./position-manager");
Object.defineProperty(exports, "PositionManager", { enumerable: true, get: function () { return position_manager_1.PositionManager; } });
Object.defineProperty(exports, "DEFAULT_CONFIG", { enumerable: true, get: function () { return position_manager_1.DEFAULT_CONFIG; } });
var bonding_curve_tracker_1 = require("./bonding-curve-tracker");
Object.defineProperty(exports, "BondingCurveTracker", { enumerable: true, get: function () { return bonding_curve_tracker_1.BondingCurveTracker; } });
var sell_executor_1 = require("./sell-executor");
Object.defineProperty(exports, "SellExecutor", { enumerable: true, get: function () { return sell_executor_1.SellExecutor; } });
__exportStar(require("./types"), exports);
// ─── Configuration Constants ──────────────────────────
exports.TARGET_MCAP_USD = 5000;
exports.EXTENDED_TARGET_MCAP_USD = 10000;
exports.MAX_HOLD_TIME_MS = 30 * 60 * 1000; // 30 min
exports.STOP_LOSS_PCT = 0.5; // 50%
exports.MOMENTUM_MULTIPLIER = 2.0;
exports.MOMENTUM_WINDOW_MS = 5 * 60 * 1000; // 5 min
exports.SWEEP_AFTER_SELL = true;
exports.SELL_SLIPPAGE_BPS = 1000; // 10%
exports.PRIORITY_FEE_MICROLAMPORTS = 250_000;
exports.POLL_INTERVAL_MS = 10_000; // 10s fallback poll
//# sourceMappingURL=index.js.map