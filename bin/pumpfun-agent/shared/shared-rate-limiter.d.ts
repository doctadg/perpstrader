/**
 * Wait if necessary to respect the global rate limit (1 call per 10s).
 * Returns immediately if enough time has elapsed since the last call.
 * Logs when a wait is triggered for observability.
 */
export declare function acquireRateLimitSlot(caller: string): Promise<void>;
/**
 * Reset the rate limiter state (useful for testing).
 */
export declare function resetRateLimiter(): void;
//# sourceMappingURL=shared-rate-limiter.d.ts.map