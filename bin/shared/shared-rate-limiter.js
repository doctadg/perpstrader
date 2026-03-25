"use strict";
// Shared Rate Limiter for OpenRouter API calls
// All LLM calls (GLM, labeling, embeddings) go through OpenRouter.
// This module provides a single global rate limiter to prevent 429 errors.
// Enhanced with circuit breaker mode to fully block calls under sustained 429 storms.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitCircuitOpenError = void 0;
exports.acquireRateLimitSlot = acquireRateLimitSlot;
exports.reportRateLimitHit = reportRateLimitHit;
exports.reportSuccess = reportSuccess;
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
// Circuit breaker: if we receive this many 429s within the tracking window,
// enter circuit-breaker mode where acquireRateLimitSlot throws instead of waiting.
const CB_FAILURE_THRESHOLD = 10; // consecutive 429s to trip breaker
const CB_COOLDOWN_MS = 60_000; // 60s cooldown before allowing probe call
const CB_MAX_COOLDOWN_MS = 300_000; // max 5 min cooldown
let lastCallTime = 0;
let currentInterval = MIN_INTERVAL_MS;
let last429Time = 0;
let waitCount = 0;
// Circuit breaker state
let cbConsecutive429s = 0;
let cbOpenUntil = 0;
class RateLimitCircuitOpenError extends Error {
    cooldownRemainingMs;
    constructor(cooldownRemainingMs) {
        super(`Rate limit circuit breaker OPEN — blocked for ${Math.round(cooldownRemainingMs / 1000)}s`);
        this.cooldownRemainingMs = cooldownRemainingMs;
        this.name = 'RateLimitCircuitOpenError';
    }
}
exports.RateLimitCircuitOpenError = RateLimitCircuitOpenError;
/**
 * Wait if necessary to respect the global rate limit.
 * Returns immediately if enough time has elapsed since the last call.
 * Logs when a wait is triggered for observability.
 * Throws RateLimitCircuitOpenError if circuit breaker is open.
 */
async function acquireRateLimitSlot(caller) {
    // Circuit breaker check
    if (cbConsecutive429s >= CB_FAILURE_THRESHOLD && Date.now() < cbOpenUntil) {
        const remaining = cbOpenUntil - Date.now();
        logger_1.default.warn(`[RateLimiter] ${caller}: circuit breaker OPEN — blocked (remaining: ${Math.round(remaining / 1000)}s, consecutive 429s: ${cbConsecutive429s})`);
        throw new RateLimitCircuitOpenError(remaining);
    }
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
    // Track consecutive 429s for circuit breaker
    cbConsecutive429s++;
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
    // Trip circuit breaker if threshold reached
    if (cbConsecutive429s === CB_FAILURE_THRESHOLD) {
        const cooldown = Math.min(CB_COOLDOWN_MS * Math.pow(2, Math.floor((cbConsecutive429s - CB_FAILURE_THRESHOLD) / CB_FAILURE_THRESHOLD)), CB_MAX_COOLDOWN_MS);
        cbOpenUntil = Date.now() + cooldown;
        logger_1.default.warn(`[RateLimiter] CIRCUIT BREAKER TRIPPED after ${cbConsecutive429s} consecutive 429s — blocking all calls for ${Math.round(cooldown / 1000)}s`);
    }
}
/**
 * Report a successful API call. Resets consecutive 429 counter for circuit breaker.
 */
function reportSuccess() {
    if (cbConsecutive429s > 0) {
        logger_1.default.info(`[RateLimiter] Success reported, resetting circuit breaker counter (was ${cbConsecutive429s} consecutive 429s)`);
    }
    cbConsecutive429s = 0;
    cbOpenUntil = 0;
}
/**
 * Get current stats for observability.
 */
function getRateLimitStats() {
    return {
        interval: currentInterval,
        waitCount,
        last429Time,
        cbState: {
            consecutive429s: cbConsecutive429s,
            open: cbConsecutive429s >= CB_FAILURE_THRESHOLD && Date.now() < cbOpenUntil,
            openUntil: cbOpenUntil,
        },
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
    cbConsecutive429s = 0;
    cbOpenUntil = 0;
}
//# sourceMappingURL=shared-rate-limiter.js.map