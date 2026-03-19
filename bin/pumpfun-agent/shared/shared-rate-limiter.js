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
exports.resetRateLimiter = resetRateLimiter;
const logger_1 = __importDefault(require("./logger"));
const MIN_INTERVAL_MS = 15000; // 15 seconds between API calls (z.ai rate limit)
let lastCallTime = 0;
let waitCount = 0;
/**
 * Wait if necessary to respect the global rate limit (1 call per 10s).
 * Returns immediately if enough time has elapsed since the last call.
 * Logs when a wait is triggered for observability.
 */
async function acquireRateLimitSlot(caller) {
    const now = Date.now();
    const elapsed = now - lastCallTime;
    if (elapsed < MIN_INTERVAL_MS) {
        const wait = MIN_INTERVAL_MS - elapsed;
        waitCount++;
        logger_1.default.info(`[RateLimiter] ${caller}: rate limiting, waiting ${wait}ms (total waits: ${waitCount})`);
        await new Promise((r) => setTimeout(r, wait));
    }
    lastCallTime = Date.now();
}
/**
 * Reset the rate limiter state (useful for testing).
 */
function resetRateLimiter() {
    lastCallTime = 0;
    waitCount = 0;
}
//# sourceMappingURL=shared-rate-limiter.js.map