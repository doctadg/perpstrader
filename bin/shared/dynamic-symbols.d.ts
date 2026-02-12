/**
 * Fetch all available trading symbols from Hyperliquid
 */
export declare function fetchAllTradingSymbols(): Promise<string[]>;
/**
 * Get top N symbols by 24h volume
 */
export declare function getTopVolumeSymbols(limit?: number): Promise<string[]>;
/**
 * Get symbols with extreme funding rates
 */
export declare function getExtremeFundingSymbols(threshold?: number): Promise<{
    positive: string[];
    negative: string[];
}>;
/**
 * Clear symbol cache
 */
export declare function clearSymbolCache(): void;
//# sourceMappingURL=dynamic-symbols.d.ts.map