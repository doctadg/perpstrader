/**
 * Order Validator
 * 
 * Pre-flight validation for orders including market condition checks,
 * confidence validation, and market impact estimation.
 */

import logger from '../shared/logger';
import hyperliquidClient from './hyperliquid-client';

export interface MarketConditions {
  symbol: string;
  spread: number;
  spreadPct: number;
  bidDepth: number;
  askDepth: number;
  bestBid: number;
  bestAsk: number;
  volatilityEstimate: number;
  timestamp: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  adjustedConfidence?: number;
  marketImpact?: number;
  conditions?: MarketConditions;
}

export class OrderValidator {
  // Thresholds
  private readonly MAX_SPREAD_PCT = 0.001; // 0.1% max spread
  private readonly MIN_DEPTH_NOTIONAL = 10000; // $10k min depth per side
  private readonly HIGH_VOLATILITY_THRESHOLD = 0.02; // 2% recent volatility
  private readonly MARKET_IMPACT_THRESHOLD = 0.001; // 0.1% max estimated impact
  
  // Confidence decay factors
  private readonly SPREAD_CONFIDENCE_DECAY = 0.15;
  private readonly VOLATILITY_CONFIDENCE_DECAY = 0.20;
  private readonly DEPTH_CONFIDENCE_DECAY = 0.10;
  
  // Cache for market conditions (valid for 5 seconds)
  private conditionsCache: Map<string, { conditions: MarketConditions; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 5000;

  /**
   * Validate market conditions for a symbol
   */
  async validateMarketConditions(symbol: string): Promise<ValidationResult> {
    const symbolKey = symbol.toUpperCase();
    
    try {
      // Check cache first
      const cached = this.conditionsCache.get(symbolKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        return this.evaluateConditions(cached.conditions);
      }

      // Fetch fresh L2 book data
      const book = await hyperliquidClient.getL2Book(symbol);
      
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

      const conditions: MarketConditions = {
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

    } catch (error) {
      logger.error(`[OrderValidator] Failed to validate market conditions for ${symbol}:`, error);
      return { valid: false, reason: `Market data error: ${error}` };
    }
  }

  /**
   * Validate confidence with market condition adjustments
   */
  async validateConfidence(
    symbol: string, 
    baseConfidence: number,
    size: number
  ): Promise<ValidationResult> {
    const marketResult = await this.validateMarketConditions(symbol);
    
    if (!marketResult.valid) {
      return marketResult;
    }

    const conditions = marketResult.conditions!;
    let adjustedConfidence = baseConfidence;
    const decayFactors: string[] = [];

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
      logger.info(`[OrderValidator] Confidence adjusted for ${symbol}: ${baseConfidence.toFixed(2)} -> ${adjustedConfidence.toFixed(2)} [${decayFactors.join(', ')}]`);
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
  quickValidate(symbol: string, baseConfidence: number): ValidationResult {
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
  estimateMarketImpact(conditions: MarketConditions, size: number): number {
    const midPrice = (conditions.bestBid + conditions.bestAsk) / 2;
    const notionalValue = size * midPrice;
    
    // Simple impact model: impact increases with size relative to depth
    const avgDepth = (conditions.bidDepth + conditions.askDepth) / 2;
    if (avgDepth <= 0) return 1; // Max impact if no depth

    const depthRatio = notionalValue / avgDepth;
    
    // Impact is non-linear with size
    return Math.min(1, depthRatio * depthRatio * 0.1);
  }

  private evaluateConditions(conditions: MarketConditions): ValidationResult {
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

  private calculateDepth(levels: any[]): number {
    return levels.reduce((total, level) => {
      const price = parseFloat(level.px);
      const size = parseFloat(level.sz);
      if (isFinite(price) && isFinite(size) && price > 0 && size >= 0) {
        return total + (price * size);
      }
      return total;
    }, 0);
  }

  private estimateVolatility(bids: any[], asks: any[], midPrice: number): number {
    if (bids.length < 2 || asks.length < 2) {
      return 0;
    }

    // Calculate order book imbalance
    const bidSum = bids.slice(0, 5).reduce((sum, b) => sum + parseFloat(b.sz || 0), 0);
    const askSum = asks.slice(0, 5).reduce((sum, a) => sum + parseFloat(a.sz || 0), 0);
    
    if (bidSum + askSum === 0) return 0;
    
    const imbalance = Math.abs(bidSum - askSum) / (bidSum + askSum);
    
    // Estimate volatility from spread and imbalance
    const spreadPct = (parseFloat(asks[0].px) - parseFloat(bids[0].px)) / midPrice;
    
    return spreadPct * (1 + imbalance);
  }

  /**
   * Get cached conditions for a symbol
   */
  getCachedConditions(symbol: string): MarketConditions | undefined {
    const cached = this.conditionsCache.get(symbol.toUpperCase());
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS * 2) {
      return cached.conditions;
    }
    return undefined;
  }

  /**
   * Clear cache for a symbol or all symbols
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      this.conditionsCache.delete(symbol.toUpperCase());
    } else {
      this.conditionsCache.clear();
    }
  }
}

export const orderValidator = new OrderValidator();
export default orderValidator;
