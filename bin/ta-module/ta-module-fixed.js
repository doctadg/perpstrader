"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAModule = void 0;
const technicalIndicators = __importStar(require("technicalindicators"));
const logger_1 = __importDefault(require("../shared/logger"));
class TAModule {
    async analyzeMarket(symbol, timeframe, marketData) {
        try {
            if (marketData.length < 50) {
                throw new Error('Insufficient data for technical analysis');
            }
            const closes = marketData.map(d => d.close);
            const highs = marketData.map(d => d.high);
            const lows = marketData.map(d => d.low);
            const volumes = marketData.map(d => d.volume);
            const indicators = {
                rsi: this.calculateRSI(closes),
                macd: this.calculateMACD(closes),
                bollinger: this.calculateBollingerBands(closes),
                sma: this.calculateSMA(closes),
                ema: this.calculateEMA(closes),
                volume: {
                    ad: this.calculateAD(highs, lows, closes, volumes),
                    obv: this.calculateOBV(closes, volumes)
                },
                volatility: {
                    atr: this.calculateATR(highs, lows, closes),
                    standardDeviation: this.calculateStandardDeviation(closes)
                }
            };
            logger_1.default.info(`Technical analysis completed for ${symbol} on ${timeframe}`);
            return indicators;
        }
        catch (error) {
            logger_1.default.error(`Technical analysis failed for ${symbol}:`, error);
            throw error;
        }
    }
    calculateRSI(prices, period = 14) {
        if (!prices || prices.length < period) {
            throw new Error(`Insufficient data for RSI: ${prices?.length || 0} < ${period}`);
        }
        try {
            const result = technicalIndicators.RSI.calculate({ values: prices, period });
            if (!result || result.length === 0) {
                throw new Error('RSI calculation returned empty result');
            }
            const hasInvalid = result.some(v => v === null || v === undefined || !Number.isFinite(v));
            if (hasInvalid) {
                throw new Error('RSI calculation returned invalid values (null/NaN/infinite)');
            }
            return result;
        }
        catch (error) {
            logger_1.default.error('RSI calculation failed:', error);
            throw new Error(`RSI calculation error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (!prices || prices.length < slowPeriod + signalPeriod) {
            throw new Error(`Insufficient data for MACD: ${prices?.length || 0} < ${slowPeriod + signalPeriod}`);
        }
        try {
            const macdData = technicalIndicators.MACD.calculate({
                values: prices,
                fastPeriod,
                slowPeriod,
                signalPeriod,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            });
            if (!macdData || macdData.length === 0) {
                throw new Error('MACD calculation returned empty result');
            }
            const macdValues = macdData.map(d => d.MACD);
            const signalValues = macdData.map(d => d.signal);
            const histogramValues = macdData.map(d => d.histogram);
            const hasInvalidMACD = macdValues.some(v => v === null || v === undefined || !Number.isFinite(v));
            const hasInvalidSignal = signalValues.some(v => v === null || v === undefined || !Number.isFinite(v));
            const hasInvalidHistogram = histogramValues.some(v => v === null || v === undefined || !Number.isFinite(v));
            if (hasInvalidMACD || hasInvalidSignal || hasInvalidHistogram) {
                throw new Error('MACD calculation returned invalid values (null/NaN/infinite)');
            }
            return {
                macd: macdValues,
                signal: signalValues,
                histogram: histogramValues
            };
        }
        catch (error) {
            logger_1.default.error('MACD calculation failed:', error);
            throw new Error(`MACD calculation error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    calculateBollingerBands(prices, period = 20, stdDev = 2) {
        if (!prices || prices.length < period) {
            throw new Error(`Insufficient data for Bollinger Bands: ${prices?.length || 0} < ${period}`);
        }
        try {
            const bbData = technicalIndicators.BollingerBands.calculate({
                values: prices,
                period,
                stdDev
            });
            if (!bbData || bbData.length === 0) {
                throw new Error('Bollinger Bands calculation returned empty result');
            }
            const upperValues = bbData.map(d => d.upper);
            const middleValues = bbData.map(d => d.middle);
            const lowerValues = bbData.map(d => d.lower);
            const hasInvalidUpper = upperValues.some(v => v === null || v === undefined || !Number.isFinite(v));
            const hasInvalidMiddle = middleValues.some(v => v === null || v === undefined || !Number.isFinite(v));
            const hasInvalidLower = lowerValues.some(v => v === null || v === undefined || !Number.isFinite(v));
            if (hasInvalidUpper || hasInvalidMiddle || hasInvalidLower) {
                throw new Error('Bollinger Bands calculation returned invalid values (null/NaN/infinite)');
            }
            return {
                upper: upperValues,
                middle: middleValues,
                lower: lowerValues
            };
        }
        catch (error) {
            logger_1.default.error('Bollinger Bands calculation failed:', error);
            throw new Error(`Bollinger Bands calculation error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    calculateSMA(prices, period = 20) {
        if (!prices || prices.length < period) {
            throw new Error(`Insufficient data for SMA: ${prices?.length || 0} < ${period}`);
        }
        try {
            const result = technicalIndicators.SMA.calculate({ values: prices, period });
            if (!result || result.length === 0) {
                throw new Error('SMA calculation returned empty result');
            }
            const hasInvalid = result.some(v => v === null || v === undefined || !Number.isFinite(v));
            if (hasInvalid) {
                throw new Error('SMA calculation returned invalid values (null/NaN/infinite)');
            }
            return result;
        }
        catch (error) {
            logger_1.default.error('SMA calculation failed:', error);
            throw new Error(`SMA calculation error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    calculateEMA(prices, period = 20) {
        if (!prices || prices.length < period) {
            throw new Error(`Insufficient data for EMA: ${prices?.length || 0} < ${period}`);
        }
        try {
            const result = technicalIndicators.EMA.calculate({ values: prices, period });
            if (!result || result.length === 0) {
                throw new Error('EMA calculation returned empty result');
            }
            const hasInvalid = result.some(v => v === null || v === undefined || !Number.isFinite(v));
            if (hasInvalid) {
                throw new Error('EMA calculation returned invalid values (null/NaN/infinite)');
            }
            return result;
        }
        catch (error) {
            logger_1.default.error('EMA calculation failed:', error);
            throw new Error(`EMA calculation error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    calculateAD(highs, lows, closes, volumes) {
        if (!highs || !lows || !closes || !volumes || highs.length !== closes.length || highs.length !== volumes.length) {
            throw new Error('Invalid or mismatched input arrays for AD calculation');
        }
        try {
            const ad = [];
            let adValue = 0;
            for (let i = 0; i < closes.length; i++) {
                const high = highs[i];
                const low = lows[i];
                const close = closes[i];
                const volume = volumes[i];
                if (high === low || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) || !Number.isFinite(volume)) {
                    ad.push(adValue);
                    continue;
                }
                const moneyFlowMultiplier = ((close - low) - (high - close)) / (high - low);
                const moneyFlowVolume = moneyFlowMultiplier * volume;
                adValue += moneyFlowVolume;
                ad.push(adValue);
            }
            return ad;
        }
        catch (error) {
            logger_1.default.error('AD calculation failed:', error);
            throw new Error(`AD calculation error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    calculateOBV(closes, volumes) {
        if (!closes || !volumes || closes.length !== volumes.length) {
            throw new Error('Invalid or mismatched input arrays for OBV calculation');
        }
        try {
            const result = technicalIndicators.OBV.calculate({
                close: closes,
                volume: volumes
            });
            if (!result || result.length === 0) {
                throw new Error('OBV calculation returned empty result');
            }
            const hasInvalid = result.some(v => v === null || v === undefined || !Number.isFinite(v));
            if (hasInvalid) {
                throw new Error('OBV calculation returned invalid values (null/NaN/infinite)');
            }
            return result;
        }
        catch (error) {
            logger_1.default.error('OBV calculation failed:', error);
            throw new Error(`OBV calculation error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    calculateATR(highs, lows, closes, period = 14) {
        if (!highs || !lows || !closes || highs.length !== closes.length || highs.length !== lows.length) {
            throw new Error('Invalid or mismatched input arrays for ATR calculation');
        }
        try {
            const result = technicalIndicators.ATR.calculate({
                high: highs,
                low: lows,
                close: closes,
                period
            });
            if (!result || result.length === 0) {
                throw new Error('ATR calculation returned empty result');
            }
            const hasInvalid = result.some(v => v === null || v === undefined || !Number.isFinite(v));
            if (hasInvalid) {
                throw new Error('ATR calculation returned invalid values (null/NaN/infinite)');
            }
            return result;
        }
        catch (error) {
            logger_1.default.error('ATR calculation failed:', error);
            throw new Error(`ATR calculation error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    calculateStandardDeviation(prices, period = 20) {
        if (!prices || prices.length < period) {
            throw new Error(`Insufficient data for standard deviation: ${prices?.length || 0} < ${period}`);
        }
        const stdDev = [];
        for (let i = 0; i < prices.length; i++) {
            if (i < period - 1) {
                stdDev.push(0);
                continue;
            }
            const slice = prices.slice(i - period + 1, i + 1);
            const mean = slice.reduce((sum, val) => sum + val, 0) / period;
            const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
            stdDev.push(Math.sqrt(variance));
        }
        return stdDev;
    }
    detectPatterns(marketData) {
        const patterns = [];
        if (marketData.length < 10)
            return patterns;
        const closes = marketData.map(d => d.close);
        const highs = marketData.map(d => d.high);
        const lows = marketData.map(d => d.low);
        try {
            patterns.push(...this.detectCandlestickPatterns(marketData));
            patterns.push(...this.detectSupportResistance(closes));
            patterns.push(...this.detectTrendLines(closes));
            patterns.push(...this.detectDivergence(closes, this.calculateRSI(closes)));
        }
        catch (error) {
            logger_1.default.error('Pattern detection failed:', error);
        }
        return patterns.filter(p => p.confidence > 0.6);
    }
    detectCandlestickPatterns(marketData) {
        const patterns = [];
        for (let i = 2; i < marketData.length; i++) {
            const current = marketData[i];
            const previous = marketData[i - 1];
            const hammer = this.isHammer(current);
            const doji = this.isDoji(current);
            const bullishEngulfing = this.isBullishEngulfing(previous, current);
            const bearishEngulfing = this.isBearishEngulfing(previous, current);
            if (hammer) {
                patterns.push({ pattern: 'Hammer', confidence: 0.7 });
            }
            if (doji) {
                patterns.push({ pattern: 'Doji', confidence: 0.6 });
            }
            if (bullishEngulfing) {
                patterns.push({ pattern: 'Bullish Engulfing', confidence: 0.8 });
            }
            else if (bearishEngulfing) {
                patterns.push({ pattern: 'Bearish Engulfing', confidence: 0.8 });
            }
        }
        return patterns;
    }
    isHammer(candle) {
        const body = Math.abs(candle.close - candle.open);
        const upperShadow = candle.high - Math.max(candle.close, candle.open);
        const lowerShadow = Math.min(candle.close, candle.open) - candle.low;
        return body < (candle.high - candle.low) * 0.3 &&
            lowerShadow > body * 2 &&
            upperShadow < body * 0.5;
    }
    isDoji(candle) {
        const body = Math.abs(candle.close - candle.open);
        const range = candle.high - candle.low;
        return body < range * 0.1;
    }
    isBullishEngulfing(prev, curr) {
        return prev.close < prev.open &&
            curr.close > curr.open &&
            curr.open < prev.close &&
            curr.close > prev.open;
    }
    isBearishEngulfing(prev, curr) {
        return prev.close > prev.open &&
            curr.close < curr.open &&
            curr.open > prev.close &&
            curr.close < prev.open;
    }
    detectSupportResistance(closes) {
        const patterns = [];
        const pivots = this.findPivotPoints(closes);
        pivots.forEach(pivot => {
            if (pivot.type === 'support') {
                patterns.push({ pattern: `Support at ${pivot.value}`, confidence: 0.7 });
            }
            else {
                patterns.push({ pattern: `Resistance at ${pivot.value}`, confidence: 0.7 });
            }
        });
        return patterns;
    }
    findPivotPoints(levels) {
        const pivots = [];
        const lookback = 5;
        for (let i = lookback; i < levels.length - lookback; i++) {
            const current = levels[i];
            const left = levels.slice(i - lookback, i);
            const right = levels.slice(i + 1, i + lookback + 1);
            const isLow = current < Math.min(...left) && current < Math.min(...right);
            const isHigh = current > Math.max(...left) && current > Math.max(...right);
            if (isLow) {
                pivots.push({ type: 'support', value: current });
            }
            else if (isHigh) {
                pivots.push({ type: 'resistance', value: current });
            }
        }
        return pivots;
    }
    detectTrendLines(closes) {
        const patterns = [];
        const trend = this.calculateTrend(closes.slice(-20));
        if (trend.slope > 0.1) {
            patterns.push({ pattern: 'Uptrend', confidence: Math.min(trend.rSquared * 0.8, 0.9) });
        }
        else if (trend.slope < -0.1) {
            patterns.push({ pattern: 'Downtrend', confidence: Math.min(trend.rSquared * 0.8, 0.9) });
        }
        return patterns;
    }
    calculateTrend(values) {
        const n = values.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = values.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * values[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);
        const denominator = n * sumXX - sumX * sumX;
        const slope = Math.abs(denominator) < 0.0001 ? 0 : (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;
        const yMean = sumY / n;
        const ssTotal = values.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
        const ssResidual = values.reduce((sum, val, i) => {
            const predicted = slope * i + intercept;
            return sum + Math.pow(val - predicted, 2);
        }, 0);
        const rSquared = ssTotal < 0.0001 ? 0 : Math.max(0, Math.min(1, 1 - (ssResidual / ssTotal)));
        return { slope, rSquared };
    }
    detectDivergence(prices, rsi) {
        const patterns = [];
        if (prices.length < 20 || rsi.length < 20)
            return patterns;
        const priceTrend = this.calculateTrend(prices.slice(-10));
        const rsiTrend = this.calculateTrend(rsi.slice(-10));
        if (priceTrend.slope < -0.1 && rsiTrend.slope > 0.1) {
            patterns.push({ pattern: 'Bullish Divergence', confidence: 0.75 });
        }
        if (priceTrend.slope > 0.1 && rsiTrend.slope < -0.1) {
            patterns.push({ pattern: 'Bearish Divergence', confidence: 0.75 });
        }
        return patterns;
    }
    calculateVolatility(marketData) {
        if (marketData.length < 2)
            return 0;
        const returns = [];
        for (let i = 1; i < marketData.length; i++) {
            const returnVal = (marketData[i].close - marketData[i - 1].close) / marketData[i - 1].close;
            returns.push(returnVal);
        }
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
        return Math.sqrt(variance) * Math.sqrt(252);
    }
    /**
     * Validate RSI data for quality issues
     */
    validateRSIData(rsi) {
        const issues = [];
        if (!rsi || rsi.length === 0) {
            return { valid: false, issues: ['RSI array is empty'] };
        }
        const validCount = rsi.filter(v => v !== null && v !== undefined && Number.isFinite(v)).length;
        if (validCount < rsi.length * 0.9) {
            issues.push(`RSI contains ${(rsi.length - validCount)} invalid values`);
        }
        const flatSequenceCount = rsi.reduce((count, val, idx, arr) => {
            if (idx > 0 && val === arr[idx - 1])
                count++;
            return count;
        }, 0);
        if (flatSequenceCount > rsi.length * 0.8) {
            issues.push(`RSI is flat: ${flatSequenceCount}/${rsi.length} identical consecutive values`);
        }
        if (rsi.every(v => v === 100)) {
            issues.push('RSI stuck at 100 (all values are 100)');
        }
        if (rsi.every(v => v === 0)) {
            issues.push('RSI stuck at 0 (all values are 0)');
        }
        const stuckAtHigh = rsi.filter(v => v === 100).length > rsi.length * 0.9;
        const stuckAtLow = rsi.filter(v => v === 0).length > rsi.length * 0.9;
        if (stuckAtHigh || stuckAtLow) {
            issues.push(`RSI appears stuck at boundary (${stuckAtHigh ? '100' : '0'})`);
        }
        return { valid: issues.length === 0, issues };
    }
}
exports.TAModule = TAModule;
const taModule = new TAModule();
exports.default = taModule;
//# sourceMappingURL=ta-module-fixed.js.map