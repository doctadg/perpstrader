export declare class RateLimitCircuitOpenError extends Error {
    readonly cooldownRemainingMs: number;
    constructor(cooldownRemainingMs: number);
}
/**
 * Wait if necessary to respect the global rate limit.
 * Returns immediately if enough time has elapsed since the last call.
 * Logs when a wait is triggered for observability.
 * Throws RateLimitCircuitOpenError if circuit breaker is open.
 */
export declare function acquireRateLimitSlot(caller: string): Promise<void>;
/**
 * Report that a 429 was received from the API. This triggers adaptive backoff.
 */
export declare function reportRateLimitHit(caller: string, retryAfterMs?: number): void;
/**
 * Report a successful API call. Resets consecutive 429 counter for circuit breaker.
 */
export declare function reportSuccess(): void;
/**
 * Get current stats for observability.
 */
export declare function getRateLimitStats(): {
    interval: number;
    waitCount: number;
    last429Time: number;
    cbState: {
        consecutive429s: number;
        open: boolean;
        openUntil: number;
    };
};
/**
 * Reset the rate limiter state (useful for testing).
 */
export declare function resetRateLimiter(): void;
