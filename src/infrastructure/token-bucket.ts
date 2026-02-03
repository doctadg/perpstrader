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

export class TokenBucket {
    private config: TokenBucketConfig;
    private tokens: number;
    private lastRefill: number;
    private maxBurst: number;

    constructor(config: TokenBucketConfig) {
        this.config = config;
        this.tokens = config.initialTokens ?? config.capacity;
        this.lastRefill = Date.now();
        this.maxBurst = config.capacity;
    }

    /**
     * Refill tokens based on elapsed time
     */
    private refill(): void {
        const now = Date.now();
        const elapsed = now - this.lastRefill;

        if (elapsed > 0) {
            // Calculate tokens to add based on elapsed time
            const intervals = elapsed / this.config.refillIntervalMs;
            const tokensToAdd = Math.floor(intervals * this.config.refillRate);

            if (tokensToAdd > 0) {
                this.tokens = Math.min(this.maxBurst, this.tokens + tokensToAdd);
                this.lastRefill = now - (elapsed % this.config.refillIntervalMs);
            }
        }
    }

    /**
     * Attempt to consume the specified number of tokens
     * @param tokens Number of tokens to consume
     * @param blocking If true, calculate wait time instead of returning false
     */
    consume(tokens: number, blocking: boolean = false): ConsumeResult {
        this.refill();

        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return {
                allowed: true,
                tokensRemaining: this.tokens,
            };
        }

        if (blocking) {
            // Calculate wait time for remaining tokens
            const tokensNeeded = tokens - this.tokens;
            const intervalsNeeded = Math.ceil(tokensNeeded / this.config.refillRate);
            const waitTimeMs = intervalsNeeded * this.config.refillIntervalMs;

            return {
                allowed: false,
                tokensRemaining: this.tokens,
                waitTimeMs,
            };
        }

        return {
            allowed: false,
            tokensRemaining: this.tokens,
        };
    }

    /**
     * Consume tokens with automatic waiting (async)
     * Implements exponential backoff with jitter for rate limit recovery
     */
    async consumeAndWait(tokens: number, maxWaitMs: number = 60000): Promise<ConsumeResult> {
        const result = this.consume(tokens, true);

        if (result.allowed) {
            return result;
        }

        const waitTime = Math.min(result.waitTimeMs || 1000, maxWaitMs);

        // Add jitter (±10% of wait time)
        const jitter = waitTime * 0.1 * (Math.random() * 2 - 1);
        const actualWait = Math.max(0, waitTime + jitter);

        await this.sleep(actualWait);

        // Retry after waiting
        return this.consume(tokens);
    }

    /**
     * Get current token count without refilling
     */
    peekTokens(): number {
        return this.tokens;
    }

    /**
     * Get current token count with refill
     */
    getAvailableTokens(): number {
        this.refill();
        return this.tokens;
    }

    /**
     * Reset the bucket to full capacity
     */
    reset(): void {
        this.tokens = this.maxBurst;
        this.lastRefill = Date.now();
    }

    /**
     * Add tokens manually (for adjustments)
     */
    addTokens(tokens: number): void {
        this.tokens = Math.min(this.maxBurst, this.tokens + tokens);
    }

    /**
     * Get bucket configuration and state
     */
    getState(): {
        capacity: number;
        availableTokens: number;
        refillRate: number;
        refillIntervalMs: number;
        utilization: number; // 0-1, 1 = full
    } {
        this.refill();
        return {
            capacity: this.maxBurst,
            availableTokens: this.tokens,
            refillRate: this.config.refillRate,
            refillIntervalMs: this.config.refillIntervalMs,
            utilization: 1 - (this.tokens / this.maxBurst),
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Hyperliquid-specific rate limiter using token buckets
 *
 * Hyperliquid rate limits (approximate):
 * - Info endpoints: 1200 requests/minute (20/sec)
 * - Exchange endpoints: 120 requests/minute with batch optimization
 * - Batch orders: 1 + floor(batch_size/40) weight per request
 */
export class HyperliquidRateLimiter {
    private infoBucket: TokenBucket;
    private exchangeBucket: TokenBucket;

    constructor() {
        // Info bucket: 1200 requests/minute = 20 requests/second
        // Allow burst up to 100
        this.infoBucket = new TokenBucket({
            capacity: 100,
            refillRate: 20,
            refillIntervalMs: 1000,
        });

        // Exchange bucket: 120 requests/minute = 2 requests/second
        // Allow burst up to 40
        this.exchangeBucket = new TokenBucket({
            capacity: 40,
            refillRate: 2,
            refillIntervalMs: 1000,
        });
    }

    /**
     * Throttle an info endpoint request
     * @param weight Request weight (1-60 depending on endpoint)
     */
    async throttleInfoRequest(weight: number = 2): Promise<void> {
        await this.infoBucket.consumeAndWait(weight);
    }

    /**
     * Throttle an exchange endpoint request
     * @param orderCount Number of orders in the batch
     */
    async throttleExchangeRequest(orderCount: number = 1): Promise<void> {
        // Hyperliquid batch formula: 1 + floor(batch_size/40)
        const weight = 1 + Math.floor(orderCount / 40);
        await this.exchangeBucket.consumeAndWait(weight);
    }

    /**
     * Get current state of both buckets
     */
    getState(): {
        info: ReturnType<TokenBucket['getState']>;
        exchange: ReturnType<TokenBucket['getState']>;
    } {
        return {
            info: this.infoBucket.getState(),
            exchange: this.exchangeBucket.getState(),
        };
    }

    /**
     * Reset all buckets
     */
    reset(): void {
        this.infoBucket.reset();
        this.exchangeBucket.reset();
    }
}

/**
 * Polymarket rate limiter
 */
export class PolymarketRateLimiter {
    private infoBucket: TokenBucket;
    private orderBucket: TokenBucket;

    constructor() {
        // Polymarket approximate limits
        this.infoBucket = new TokenBucket({
            capacity: 50,
            refillRate: 10,
            refillIntervalMs: 1000,
        });

        this.orderBucket = new TokenBucket({
            capacity: 20,
            refillRate: 2,
            refillIntervalMs: 1000,
        });
    }

    async throttleInfoRequest(): Promise<void> {
        await this.infoBucket.consumeAndWait(1);
    }

    async throttleOrderRequest(): Promise<void> {
        await this.orderBucket.consumeAndWait(1);
    }
}

// Singleton instances
const hyperliquidRateLimiter = new HyperliquidRateLimiter();
const polymarketRateLimiter = new PolymarketRateLimiter();

export { hyperliquidRateLimiter, polymarketRateLimiter };
export default hyperliquidRateLimiter;
