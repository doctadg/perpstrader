/**
 * Order Validator
 *
 * Pre-flight validation for orders including market condition checks,
 * confidence validation, and market impact estimation.
 */
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
export declare class OrderValidator {
    private readonly MAX_SPREAD_PCT;
    private readonly MIN_DEPTH_NOTIONAL;
    private readonly HIGH_VOLATILITY_THRESHOLD;
    private readonly MARKET_IMPACT_THRESHOLD;
    private readonly SPREAD_CONFIDENCE_DECAY;
    private readonly VOLATILITY_CONFIDENCE_DECAY;
    private readonly DEPTH_CONFIDENCE_DECAY;
    private conditionsCache;
    private readonly CACHE_TTL_MS;
    /**
     * Validate market conditions for a symbol
     */
    validateMarketConditions(symbol: string): Promise<ValidationResult>;
    /**
     * Validate confidence with market condition adjustments
     */
    validateConfidence(symbol: string, baseConfidence: number, size: number): Promise<ValidationResult>;
    /**
     * Quick validation without fetching new data
     */
    quickValidate(symbol: string, baseConfidence: number): ValidationResult;
    /**
     * Estimate market impact for a given order size
     */
    estimateMarketImpact(conditions: MarketConditions, size: number): number;
    private evaluateConditions;
    private calculateDepth;
    private estimateVolatility;
    /**
     * Get cached conditions for a symbol
     */
    getCachedConditions(symbol: string): MarketConditions | undefined;
    /**
     * Clear cache for a symbol or all symbols
     */
    clearCache(symbol?: string): void;
}
export declare const orderValidator: OrderValidator;
export default orderValidator;
//# sourceMappingURL=order-validator.d.ts.map