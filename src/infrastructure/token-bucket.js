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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.polymarketRateLimiter = exports.hyperliquidRateLimiter = exports.PolymarketRateLimiter = exports.HyperliquidRateLimiter = exports.TokenBucket = void 0;
var TokenBucket = /** @class */ (function () {
    function TokenBucket(config) {
        var _a;
        this.config = config;
        this.tokens = (_a = config.initialTokens) !== null && _a !== void 0 ? _a : config.capacity;
        this.lastRefill = Date.now();
        this.maxBurst = config.capacity;
    }
    /**
     * Refill tokens based on elapsed time
     */
    TokenBucket.prototype.refill = function () {
        var now = Date.now();
        var elapsed = now - this.lastRefill;
        if (elapsed > 0) {
            // Calculate tokens to add based on elapsed time
            var intervals = elapsed / this.config.refillIntervalMs;
            var tokensToAdd = Math.floor(intervals * this.config.refillRate);
            if (tokensToAdd > 0) {
                this.tokens = Math.min(this.maxBurst, this.tokens + tokensToAdd);
                this.lastRefill = now - (elapsed % this.config.refillIntervalMs);
            }
        }
    };
    /**
     * Attempt to consume the specified number of tokens
     * @param tokens Number of tokens to consume
     * @param blocking If true, calculate wait time instead of returning false
     */
    TokenBucket.prototype.consume = function (tokens, blocking) {
        if (blocking === void 0) { blocking = false; }
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
            var tokensNeeded = tokens - this.tokens;
            var intervalsNeeded = Math.ceil(tokensNeeded / this.config.refillRate);
            var waitTimeMs = intervalsNeeded * this.config.refillIntervalMs;
            return {
                allowed: false,
                tokensRemaining: this.tokens,
                waitTimeMs: waitTimeMs,
            };
        }
        return {
            allowed: false,
            tokensRemaining: this.tokens,
        };
    };
    /**
     * Consume tokens with automatic waiting (async)
     * Implements exponential backoff with jitter for rate limit recovery
     */
    TokenBucket.prototype.consumeAndWait = function (tokens_1) {
        return __awaiter(this, arguments, void 0, function (tokens, maxWaitMs) {
            var result, waitTime, jitter, actualWait;
            if (maxWaitMs === void 0) { maxWaitMs = 60000; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        result = this.consume(tokens, true);
                        if (result.allowed) {
                            return [2 /*return*/, result];
                        }
                        waitTime = Math.min(result.waitTimeMs || 1000, maxWaitMs);
                        jitter = waitTime * 0.1 * (Math.random() * 2 - 1);
                        actualWait = Math.max(0, waitTime + jitter);
                        return [4 /*yield*/, this.sleep(actualWait)];
                    case 1:
                        _a.sent();
                        // Retry after waiting
                        return [2 /*return*/, this.consume(tokens)];
                }
            });
        });
    };
    /**
     * Get current token count without refilling
     */
    TokenBucket.prototype.peekTokens = function () {
        return this.tokens;
    };
    /**
     * Get current token count with refill
     */
    TokenBucket.prototype.getAvailableTokens = function () {
        this.refill();
        return this.tokens;
    };
    /**
     * Reset the bucket to full capacity
     */
    TokenBucket.prototype.reset = function () {
        this.tokens = this.maxBurst;
        this.lastRefill = Date.now();
    };
    /**
     * Add tokens manually (for adjustments)
     */
    TokenBucket.prototype.addTokens = function (tokens) {
        this.tokens = Math.min(this.maxBurst, this.tokens + tokens);
    };
    /**
     * Get bucket configuration and state
     */
    TokenBucket.prototype.getState = function () {
        this.refill();
        return {
            capacity: this.maxBurst,
            availableTokens: this.tokens,
            refillRate: this.config.refillRate,
            refillIntervalMs: this.config.refillIntervalMs,
            utilization: 1 - (this.tokens / this.maxBurst),
        };
    };
    TokenBucket.prototype.sleep = function (ms) {
        return new Promise(function (resolve) { return setTimeout(resolve, ms); });
    };
    return TokenBucket;
}());
exports.TokenBucket = TokenBucket;
/**
 * Hyperliquid-specific rate limiter using token buckets
 *
 * Hyperliquid rate limits (approximate):
 * - Info endpoints: 1200 requests/minute (20/sec)
 * - Exchange endpoints: 120 requests/minute with batch optimization
 * - Batch orders: 1 + floor(batch_size/40) weight per request
 */
var HyperliquidRateLimiter = /** @class */ (function () {
    function HyperliquidRateLimiter() {
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
    HyperliquidRateLimiter.prototype.throttleInfoRequest = function () {
        return __awaiter(this, arguments, void 0, function (weight) {
            if (weight === void 0) { weight = 2; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.infoBucket.consumeAndWait(weight)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Throttle an exchange endpoint request
     * @param orderCount Number of orders in the batch
     */
    HyperliquidRateLimiter.prototype.throttleExchangeRequest = function () {
        return __awaiter(this, arguments, void 0, function (orderCount) {
            var weight;
            if (orderCount === void 0) { orderCount = 1; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        weight = 1 + Math.floor(orderCount / 40);
                        return [4 /*yield*/, this.exchangeBucket.consumeAndWait(weight)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get current state of both buckets
     */
    HyperliquidRateLimiter.prototype.getState = function () {
        return {
            info: this.infoBucket.getState(),
            exchange: this.exchangeBucket.getState(),
        };
    };
    /**
     * Reset all buckets
     */
    HyperliquidRateLimiter.prototype.reset = function () {
        this.infoBucket.reset();
        this.exchangeBucket.reset();
    };
    return HyperliquidRateLimiter;
}());
exports.HyperliquidRateLimiter = HyperliquidRateLimiter;
/**
 * Polymarket rate limiter
 */
var PolymarketRateLimiter = /** @class */ (function () {
    function PolymarketRateLimiter() {
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
    PolymarketRateLimiter.prototype.throttleInfoRequest = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.infoBucket.consumeAndWait(1)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    PolymarketRateLimiter.prototype.throttleOrderRequest = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.orderBucket.consumeAndWait(1)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    return PolymarketRateLimiter;
}());
exports.PolymarketRateLimiter = PolymarketRateLimiter;
// Singleton instances
var hyperliquidRateLimiter = new HyperliquidRateLimiter();
exports.hyperliquidRateLimiter = hyperliquidRateLimiter;
var polymarketRateLimiter = new PolymarketRateLimiter();
exports.polymarketRateLimiter = polymarketRateLimiter;
exports.default = hyperliquidRateLimiter;
