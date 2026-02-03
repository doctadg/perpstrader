/**
 * Validate RSI data for quality issues
 */
export declare function validateRSIData(rsi: number[]): {
    valid: boolean;
    issues: string[];
};
/**
 * Validate candle data for quality issues
 */
export declare function validateCandle(candle: {
    time: any;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}): boolean;
//# sourceMappingURL=data-validation.d.ts.map