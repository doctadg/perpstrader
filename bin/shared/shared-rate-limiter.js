"use strict";
// Shared Rate Limiter for z.ai API calls
// Both GLM service and OpenRouter service hit the same z.ai endpoint
// (https://api.z.ai/api/paas/v4) with the same API key.
// This module provides a single global rate limiter to prevent 429 errors.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.acquireRateLimitSlot = acquireRateLimitSlot;
exports.reportRateLimitHit = reportRateLimitHit;
exports.getRateLimitStats = getRateLimitStats;
exports.resetRateLimiter = resetRateLimiter;
const logger_1 = __importDefault(require("./logger"));
// Reduced from 15s to 3s — the old value was far too conservative and caused
// all API consumers to queue up, starving the prediction agent.
const MIN_INTERVAL_MS = 3000; // 3 seconds between API calls
// When a real 429 is received, we ramp up the interval adaptively.
const BACKOFF_MULTIPLIER = 2.0;
const MAX_INTERVAL_MS = 60000; // cap at 60s even under heavy backoff
const BACKOFF_DECAY_MS = 120_000; // decay back to normal over 2 minutes
let lastCallTime = 0;
let currentInterval = MIN_INTERVAL_MS;
let last429Time = 0;
let waitCount = 0;
/**
 * Wait if necessary to respect the global rate limit.
 * Returns immediately if enough time has elapsed since the last call.
 * Logs when a wait is triggered for observability.
 */
async function acquireRateLimitSlot(caller) {
    // Adaptive decay: gradually return to normal interval after 429s stop
    if (currentInterval > MIN_INTERVAL_MS) {
        const elapsedSince429 = Date.now() - last429Time;
        if (elapsedSince429 > BACKOFF_DECAY_MS) {
            currentInterval = MIN_INTERVAL_MS;
            logger_1.default.info('[RateLimiter] Backoff decayed back to normal interval');
        }
        else if (elapsedSince429 > BACKOFF_DECAY_MS / 2) {
            // Half-way through decay, reduce interval by half the excess
            currentInterval = Math.max(MIN_INTERVAL_MS, MIN_INTERVAL_MS + (currentInterval - MIN_INTERVAL_MS) * 0.5);
        }
    }
    const now = Date.now();
    const elapsed = now - lastCallTime;
    if (elapsed < currentInterval) {
        const wait = currentInterval - elapsed;
        waitCount++;
        logger_1.default.info(`[RateLimiter] ${caller}: rate limiting, waiting ${wait}ms (interval=${currentInterval}ms, total waits: ${waitCount})`);
        await new Promise((r) => setTimeout(r, wait));
    }
    lastCallTime = Date.now();
}
/**
 * Report that a 429 was received from the API. This triggers adaptive backoff.
 */
function reportRateLimitHit(caller, retryAfterMs) {
    last429Time = Date.now();
    if (retryAfterMs && retryAfterMs > 0) {
        // Use the server-suggested retry-after if available
        currentInterval = Math.max(currentInterval, retryAfterMs);
        logger_1.default.warn(`[RateLimiter] ${caller}: 429 received, using server Retry-After: ${retryAfterMs}ms`);
    }
    else {
        // Double the current interval
        currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_INTERVAL_MS);
        logger_1.default.warn(`[RateLimiter] ${caller}: 429 received, backing off to ${currentInterval}ms interval`);
    }
}
/**
 * Get current stats for observability.
 */
function getRateLimitStats() {
    return {
        interval: currentInterval,
        waitCount,
        last429Time,
    };
}
/**
 * Reset the rate limiter state (useful for testing).
 */
function resetRateLimiter() {
    lastCallTime = 0;
    last429Time = 0;
    waitCount = 0;
    currentInterval = MIN_INTERVAL_MS;
}
//# sourceMappingURL=shared-rate-limiter.js.map