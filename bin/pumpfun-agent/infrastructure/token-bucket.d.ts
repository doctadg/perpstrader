/**
 * Token Bucket Rate Limiter
 *
 * Implements the token bucket algorithm for rate limiting, inspired by Nautilus Trader.
 * This provides more sophisticated rate limiting than simple delays.
 *
 * Features:
 * - Configurable token capacity and refill rate
 * - Burst allowance
 * - Accurate rate limit tracking
 * - Multiple independent buckets (e.g., for info vs exchange endpoints)
 */
export interface TokenBucketConfig {
    /** Maximum number of tokens the bucket can hold */
    capacity: number;
    /** Number of tokens to add per interval */
    refillRate: number;
    /** Refill interval in milliseconds */
    refillIntervalMs: number;
    /** Initial tokens (defaults to capacity) */
    initialTokens?: number;
}
export interface ConsumeResult {
    allowed: boolean;
    tokensRemaining: number;
    waitTimeMs?: number;
}
export declare class TokenBucket {
    private config;
    private tokens;
    private lastRefill;
    private maxBurst;
    constructor(config: TokenBucketConfig);
    /**
     * Refill tokens based on elapsed time
     */
    private refill;
    /**
     * Attempt to consume the specified number of tokens
     * @param tokens Number of tokens to consume
     * @param blocking If true, calculate wait time instead of returning false
     */
    consume(tokens: number, blocking?: boolean): ConsumeResult;
    /**
     * Consume tokens with automatic waiting (async)
     * Implements exponential backoff with jitter for rate limit recovery
     */
    consumeAndWait(tokens: number, maxWaitMs?: number): Promise<ConsumeResult>;
    /**
     * Get current token count without refilling
     */
    peekTokens(): number;
    /**
     * Get current token count with refill
     */
    getAvailableTokens(): number;
    /**
     * Reset the bucket to full capacity
     */
    reset(): void;
    /**
     * Add tokens manually (for adjustments)
     */
    addTokens(tokens: number): void;
    /**
     * Get bucket configuration and state
     */
    getState(): {
        capacity: number;
        availableTokens: number;
        refillRate: number;
        refillIntervalMs: number;
        utilization: number;
    };
    private sleep;
}
/**
 * Hyperliquid-specific rate limiter using token buckets
 *
 * Hyperliquid rate limits (approximate):
 * - Info endpoints: 1200 requests/minute (20/sec)
 * - Exchange endpoints: 120 requests/minute with batch optimization
 * - Batch orders: 1 + floor(batch_size/40) weight per request
 */
export declare class HyperliquidRateLimiter {
    private infoBucket;
    private exchangeBucket;
    constructor();
    /**
     * Throttle an info endpoint request
     * @param weight Request weight (1-60 depending on endpoint)
     */
    throttleInfoRequest(weight?: number): Promise<void>;
    /**
     * Throttle an exchange endpoint request
     * @param orderCount Number of orders in the batch
     */
    throttleExchangeRequest(orderCount?: number): Promise<void>;
    /**
     * Get current state of both buckets
     */
    getState(): {
        info: ReturnType<TokenBucket['getState']>;
        exchange: ReturnType<TokenBucket['getState']>;
    };
    /**
     * Reset all buckets
     */
    reset(): void;
}
/**
 * Polymarket rate limiter
 */
export declare class PolymarketRateLimiter {
    private infoBucket;
    private orderBucket;
    constructor();
    throttleInfoRequest(): Promise<void>;
    throttleOrderRequest(): Promise<void>;
}
declare const hyperliquidRateLimiter: HyperliquidRateLimiter;
declare const polymarketRateLimiter: PolymarketRateLimiter;
export { hyperliquidRateLimiter, polymarketRateLimiter };
export default hyperliquidRateLimiter;
//# sourceMappingURL=token-bucket.d.ts.map