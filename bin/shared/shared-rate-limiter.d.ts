/**
 * Wait if necessary to respect the global rate limit.
 * Returns immediately if enough time has elapsed since the last call.
 * Logs when a wait is triggered for observability.
 */
export declare function acquireRateLimitSlot(caller: string): Promise<void>;
/**
 * Report that a 429 was received from the API. This triggers adaptive backoff.
 */
export declare function reportRateLimitHit(caller: string, retryAfterMs?: number): void;
/**
 * Get current stats for observability.
 */
export declare function getRateLimitStats(): {
    interval: number;
    waitCount: number;
    last429Time: number;
};
/**
 * Reset the rate limiter state (useful for testing).
 */
export declare function resetRateLimiter(): void;
//# sourceMappingURL=shared-rate-limiter.d.ts.map