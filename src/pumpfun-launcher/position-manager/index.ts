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

// ─── Configuration Constants ──────────────────────────
export const TARGET_MCAP_USD = 5000;
export const EXTENDED_TARGET_MCAP_USD = 10000;
export const MAX_HOLD_TIME_MS = 30 * 60 * 1000; // 30 min
export const STOP_LOSS_PCT = 0.5; // 50%
export const MOMENTUM_MULTIPLIER = 2.0;
export const MOMENTUM_WINDOW_MS = 5 * 60 * 1000; // 5 min
export const SWEEP_AFTER_SELL = true;
export const SELL_SLIPPAGE_BPS = 1000; // 10%
export const PRIORITY_FEE_MICROLAMPORTS = 250_000;
export const POLL_INTERVAL_MS = 10_000; // 10s fallback poll
