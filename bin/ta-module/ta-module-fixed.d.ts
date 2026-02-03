import { MarketData, TechnicalIndicators } from '../shared/types';
export declare class TAModule {
    analyzeMarket(symbol: string, timeframe: string, marketData: MarketData[]): Promise<TechnicalIndicators>;
    private calculateRSI;
    private calculateMACD;
    private calculateBollingerBands;
    private calculateSMA;
    private calculateEMA;
    private calculateAD;
    private calculateOBV;
    private calculateATR;
    private calculateStandardDeviation;
    detectPatterns(marketData: MarketData[]): {
        pattern: string;
        confidence: number;
    }[];
    private detectCandlestickPatterns;
    private isHammer;
    private isDoji;
    private isBullishEngulfing;
    private isBearishEngulfing;
    private detectSupportResistance;
    private findPivotPoints;
    private detectTrendLines;
    private calculateTrend;
    private detectDivergence;
    calculateVolatility(marketData: MarketData[]): number;
    /**
     * Validate RSI data for quality issues
     */
    validateRSIData(rsi: number[]): {
        valid: boolean;
        issues: string[];
    };
}
declare const taModule: TAModule;
export default taModule;
//# sourceMappingURL=ta-module-fixed.d.ts.map