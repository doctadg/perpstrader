"use strict";
/**
 * Order Validator
 *
 * Pre-flight validation for orders including market condition checks,
 * confidence validation, and market impact estimation.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderValidator = exports.OrderValidator = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const hyperliquid_client_1 = __importDefault(require("./hyperliquid-client"));
class OrderValidator {
    // CRITICAL FIX: Relaxed thresholds for crypto markets
    MAX_SPREAD_PCT = 0.01; // 1% max spread (was 0.3% - too strict)
    MIN_DEPTH_NOTIONAL = 5000; // $5k min depth per side (was $10k)
    HIGH_VOLATILITY_THRESHOLD = 0.05; // 5% recent volatility (was 2%)
    MARKET_IMPACT_THRESHOLD = 0.005; // 0.5% max estimated impact (was 0.1%)
    // Confidence decay factors
    SPREAD_CONFIDENCE_DECAY = 0.15;
    VOLATILITY_CONFIDENCE_DECAY = 0.20;
    DEPTH_CONFIDENCE_DECAY = 0.10;
    // Cache for market conditions (valid for 5 seconds)
    conditionsCache = new Map();
    CACHE_TTL_MS = 5000;
    /**
     * Validate market conditions for a symbol
     */
    async validateMarketConditions(symbol) {
        const symbolKey = symbol.toUpperCase();
        try {
            // Check cache first
            const cached = this.conditionsCache.get(symbolKey);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
                return this.evaluateConditions(cached.conditions);
            }
            // Fetch fresh L2 book data
            const book = await hyperliquid_client_1.default.getL2Book(symbol);
            if (!book || !book.levels || book.levels.length < 2) {
                return { valid: false, reason: 'Invalid order book data' };
            }
            const bids = book.levels[0] || [];
            const asks = book.levels[1] || [];
            if (bids.length === 0 || asks.length === 0) {
                return { valid: false, reason: 'Empty order book' };
            }
            const bestBid = parseFloat(bids[0].px);
            const bestAsk = parseFloat(asks[0].px);
            if (!isFinite(bestBid) || !isFinite(bestAsk) || bestBid <= 0 || bestAsk <= 0) {
                return { valid: false, reason: 'Invalid bid/ask prices' };
            }
            const midPrice = (bestBid + bestAsk) / 2;
            const spread = bestAsk - bestBid;
            const spreadPct = spread / midPrice;
            // Calculate depth (top 5 levels)
            const bidDepth = this.calculateDepth(bids.slice(0, 5));
            const askDepth = this.calculateDepth(asks.slice(0, 5));
            // Estimate volatility from order book imbalance and spread
            const volatilityEstimate = this.estimateVolatility(bids, asks, midPrice);
            const conditions = {
                symbol: symbolKey,
                spread,
                spreadPct,
                bidDepth,
                askDepth,
                bestBid,
                bestAsk,
                volatilityEstimate,
                timestamp: Date.now()
            };
            // Cache the conditions
            this.conditionsCache.set(symbolKey, { conditions, timestamp: Date.now() });
            return this.evaluateConditions(conditions);
        }
        catch (error) {
            logger_1.default.error(`[OrderValidator] Failed to validate market conditions for ${symbol}:`, error);
            return { valid: false, reason: `Market data error: ${error}` };
        }
    }
    /**
     * Validate confidence with market condition adjustments
     */
    async validateConfidence(symbol, baseConfidence, size) {
        const marketResult = await this.validateMarketConditions(symbol);
        if (!marketResult.valid) {
            return marketResult;
        }
        const conditions = marketResult.conditions;
        let adjustedConfidence = baseConfidence;
        const decayFactors = [];
        // Apply spread-based confidence decay
        if (conditions.spreadPct > this.MAX_SPREAD_PCT * 0.5) {
            const spreadFactor = Math.min(1, (conditions.spreadPct - this.MAX_SPREAD_PCT * 0.5) / this.MAX_SPREAD_PCT);
            adjustedConfidence -= spreadFactor * this.SPREAD_CONFIDENCE_DECAY;
            decayFactors.push(`spread:${(spreadFactor * this.SPREAD_CONFIDENCE_DECAY).toFixed(2)}`);
        }
        // Apply volatility-based confidence decay
        if (conditions.volatilityEstimate > this.HIGH_VOLATILITY_THRESHOLD * 0.5) {
            const volFactor = Math.min(1, conditions.volatilityEstimate / this.HIGH_VOLATILITY_THRESHOLD);
            adjustedConfidence -= volFactor * this.VOLATILITY_CONFIDENCE_DECAY;
            decayFactors.push(`vol:${(volFactor * this.VOLATILITY_CONFIDENCE_DECAY).toFixed(2)}`);
        }
        // Apply depth-based confidence decay
        const minDepth = Math.min(conditions.bidDepth, conditions.askDepth);
        if (minDepth < this.MIN_DEPTH_NOTIONAL) {
            const depthFactor = 1 - (minDepth / this.MIN_DEPTH_NOTIONAL);
            adjustedConfidence -= depthFactor * this.DEPTH_CONFIDENCE_DECAY;
            decayFactors.push(`depth:${(depthFactor * this.DEPTH_CONFIDENCE_DECAY).toFixed(2)}`);
        }
        // Estimate market impact
        const marketImpact = this.estimateMarketImpact(conditions, size);
        if (marketImpact > this.MARKET_IMPACT_THRESHOLD) {
            const impactFactor = Math.min(1, (marketImpact - this.MARKET_IMPACT_THRESHOLD) / this.MARKET_IMPACT_THRESHOLD);
            adjustedConfidence -= impactFactor * 0.25;
            decayFactors.push(`impact:${(impactFactor * 0.25).toFixed(2)}`);
        }
        adjustedConfidence = Math.max(0, Math.min(1, adjustedConfidence));
        if (decayFactors.length > 0) {
            logger_1.default.info(`[OrderValidator] Confidence adjusted for ${symbol}: ${baseConfidence.toFixed(2)} -> ${adjustedConfidence.toFixed(2)} [${decayFactors.join(', ')}]`);
        }
        return {
            valid: true,
            adjustedConfidence,
            marketImpact,
            conditions
        };
    }
    /**
     * Quick validation without fetching new data
     */
    quickValidate(symbol, baseConfidence) {
        const symbolKey = symbol.toUpperCase();
        const cached = this.conditionsCache.get(symbolKey);
        if (!cached) {
            return { valid: false, reason: 'No cached market data available' };
        }
        const ageMs = Date.now() - cached.timestamp;
        if (ageMs > this.CACHE_TTL_MS * 2) {
            return { valid: false, reason: 'Cached market data too stale' };
        }
        return this.evaluateConditions(cached.conditions);
    }
    /**
     * Estimate market impact for a given order size
     */
    estimateMarketImpact(conditions, size) {
        const midPrice = (conditions.bestBid + conditions.bestAsk) / 2;
        const notionalValue = size * midPrice;
        // Simple impact model: impact increases with size relative to depth
        const avgDepth = (conditions.bidDepth + conditions.askDepth) / 2;
        if (avgDepth <= 0)
            return 1; // Max impact if no depth
        const depthRatio = notionalValue / avgDepth;
        // Impact is non-linear with size
        return Math.min(1, depthRatio * depthRatio * 0.1);
    }
    evaluateConditions(conditions) {
        // Check spread
        if (conditions.spreadPct > this.MAX_SPREAD_PCT) {
            return {
                valid: false,
                reason: `Spread too wide: ${(conditions.spreadPct * 100).toFixed(3)}% > ${(this.MAX_SPREAD_PCT * 100).toFixed(3)}%`,
                conditions
            };
        }
        // Check depth
        const minDepth = Math.min(conditions.bidDepth, conditions.askDepth);
        if (minDepth < this.MIN_DEPTH_NOTIONAL * 0.5) {
            return {
                valid: false,
                reason: `Insufficient depth: $${minDepth.toFixed(0)} < $${(this.MIN_DEPTH_NOTIONAL * 0.5).toFixed(0)}`,
                conditions
            };
        }
        // Check for extreme volatility
        if (conditions.volatilityEstimate > this.HIGH_VOLATILITY_THRESHOLD * 2) {
            return {
                valid: false,
                reason: `Extreme volatility detected: ${(conditions.volatilityEstimate * 100).toFixed(2)}%`,
                conditions
            };
        }
        return { valid: true, conditions };
    }
    calculateDepth(levels) {
        return levels.reduce((total, level) => {
            const price = parseFloat(level.px);
            const size = parseFloat(level.sz);
            if (isFinite(price) && isFinite(size) && price > 0 && size >= 0) {
                return total + (price * size);
            }
            return total;
        }, 0);
    }
    estimateVolatility(bids, asks, midPrice) {
        if (bids.length < 2 || asks.length < 2) {
            return 0;
        }
        // Calculate order book imbalance
        const bidSum = bids.slice(0, 5).reduce((sum, b) => sum + parseFloat(b.sz || 0), 0);
        const askSum = asks.slice(0, 5).reduce((sum, a) => sum + parseFloat(a.sz || 0), 0);
        if (bidSum + askSum === 0)
            return 0;
        const imbalance = Math.abs(bidSum - askSum) / (bidSum + askSum);
        // Estimate volatility from spread and imbalance
        const spreadPct = (parseFloat(asks[0].px) - parseFloat(bids[0].px)) / midPrice;
        return spreadPct * (1 + imbalance);
    }
    /**
     * Get cached conditions for a symbol
     */
    getCachedConditions(symbol) {
        const cached = this.conditionsCache.get(symbol.toUpperCase());
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS * 2) {
            return cached.conditions;
        }
        return undefined;
    }
    /**
     * Clear cache for a symbol or all symbols
     */
    clearCache(symbol) {
        if (symbol) {
            this.conditionsCache.delete(symbol.toUpperCase());
        }
        else {
            this.conditionsCache.clear();
        }
    }
}
exports.OrderValidator = OrderValidator;
exports.orderValidator = new OrderValidator();
exports.default = exports.orderValidator;
//# sourceMappingURL=order-validator.js.map