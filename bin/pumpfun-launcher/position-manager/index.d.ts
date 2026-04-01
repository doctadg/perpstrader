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
export { PositionManager, DEFAULT_CONFIG } from './position-manager';
export { BondingCurveTracker } from './bonding-curve-tracker';
export { SellExecutor } from './sell-executor';
export * from './types';
export declare const TARGET_MCAP_USD = 5000;
export declare const EXTENDED_TARGET_MCAP_USD = 10000;
export declare const MAX_HOLD_TIME_MS: number;
export declare const STOP_LOSS_PCT = 0.5;
export declare const MOMENTUM_MULTIPLIER = 2;
export declare const MOMENTUM_WINDOW_MS: number;
export declare const SWEEP_AFTER_SELL = true;
export declare const SELL_SLIPPAGE_BPS = 1000;
export declare const PRIORITY_FEE_MICROLAMPORTS = 250000;
export declare const POLL_INTERVAL_MS = 10000;
//# sourceMappingURL=index.d.ts.map