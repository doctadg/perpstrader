"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.polymarketRateLimiter = exports.hyperliquidRateLimiter = exports.PolymarketRateLimiter = exports.HyperliquidRateLimiter = exports.TokenBucket = void 0;
class TokenBucket {
    config;
    tokens;
    lastRefill;
    maxBurst;
    constructor(config) {
        this.config = config;
        this.tokens = config.initialTokens ?? config.capacity;
        this.lastRefill = Date.now();
        this.maxBurst = config.capacity;
    }
    /**
     * Refill tokens based on elapsed time
     */
    refill() {
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
    consume(tokens, blocking = false) {
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
    async consumeAndWait(tokens, maxWaitMs = 60000) {
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
    peekTokens() {
        return this.tokens;
    }
    /**
     * Get current token count with refill
     */
    getAvailableTokens() {
        this.refill();
        return this.tokens;
    }
    /**
     * Reset the bucket to full capacity
     */
    reset() {
        this.tokens = this.maxBurst;
        this.lastRefill = Date.now();
    }
    /**
     * Add tokens manually (for adjustments)
     */
    addTokens(tokens) {
        this.tokens = Math.min(this.maxBurst, this.tokens + tokens);
    }
    /**
     * Get bucket configuration and state
     */
    getState() {
        this.refill();
        return {
            capacity: this.maxBurst,
            availableTokens: this.tokens,
            refillRate: this.config.refillRate,
            refillIntervalMs: this.config.refillIntervalMs,
            utilization: 1 - (this.tokens / this.maxBurst),
        };
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.TokenBucket = TokenBucket;
/**
 * Hyperliquid-specific rate limiter using token buckets
 *
 * Hyperliquid rate limits (approximate):
 * - Info endpoints: 1200 requests/minute (20/sec)
 * - Exchange endpoints: 120 requests/minute with batch optimization
 * - Batch orders: 1 + floor(batch_size/40) weight per request
 */
class HyperliquidRateLimiter {
    infoBucket;
    exchangeBucket;
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
    async throttleInfoRequest(weight = 2) {
        await this.infoBucket.consumeAndWait(weight);
    }
    /**
     * Throttle an exchange endpoint request
     * @param orderCount Number of orders in the batch
     */
    async throttleExchangeRequest(orderCount = 1) {
        // Hyperliquid batch formula: 1 + floor(batch_size/40)
        const weight = 1 + Math.floor(orderCount / 40);
        await this.exchangeBucket.consumeAndWait(weight);
    }
    /**
     * Get current state of both buckets
     */
    getState() {
        return {
            info: this.infoBucket.getState(),
            exchange: this.exchangeBucket.getState(),
        };
    }
    /**
     * Reset all buckets
     */
    reset() {
        this.infoBucket.reset();
        this.exchangeBucket.reset();
    }
}
exports.HyperliquidRateLimiter = HyperliquidRateLimiter;
/**
 * Polymarket rate limiter
 */
class PolymarketRateLimiter {
    infoBucket;
    orderBucket;
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
    async throttleInfoRequest() {
        await this.infoBucket.consumeAndWait(1);
    }
    async throttleOrderRequest() {
        await this.orderBucket.consumeAndWait(1);
    }
}
exports.PolymarketRateLimiter = PolymarketRateLimiter;
// Singleton instances
const hyperliquidRateLimiter = new HyperliquidRateLimiter();
exports.hyperliquidRateLimiter = hyperliquidRateLimiter;
const polymarketRateLimiter = new PolymarketRateLimiter();
exports.polymarketRateLimiter = polymarketRateLimiter;
exports.default = hyperliquidRateLimiter;
//# sourceMappingURL=token-bucket.js.map