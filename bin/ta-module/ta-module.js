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
            // Validate result
            if (!result || result.length === 0) {
                throw new Error('RSI calculation returned empty result');
            }
            // Check for null/NaN values
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
            // Filter out warmup entries that have undefined values
            // The MACD indicator needs a warmup period before values are valid
            const validMacdData = macdData.filter(d => d.MACD !== undefined && d.MACD !== null &&
                d.signal !== undefined && d.signal !== null &&
                d.histogram !== undefined && d.histogram !== null &&
                Number.isFinite(d.MACD) && Number.isFinite(d.signal) && Number.isFinite(d.histogram));
            if (validMacdData.length === 0) {
                throw new Error('MACD calculation returned no valid values after warmup filtering');
            }
            const macdValues = validMacdData.map(d => d.MACD);
            const signalValues = validMacdData.map(d => d.signal);
            const histogramValues = validMacdData.map(d => d.histogram);
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
            // Validate results
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
        try {
            // Use Accumulation/Distribution Line implementation
            const ad = [];
            let adValue = 0;
            for (let i = 0; i < closes.length; i++) {
                const high = highs[i];
                const low = lows[i];
                const close = closes[i];
                const volume = volumes[i];
                if (high === low) {
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
            return new Array(closes.length).fill(0);
        }
    }
    calculateOBV(closes, volumes) {
        try {
            return technicalIndicators.OBV.calculate({
                close: closes,
                volume: volumes
            });
        }
        catch (error) {
            logger_1.default.error('OBV calculation failed:', error);
            return new Array(closes.length).fill(0);
        }
    }
    calculateATR(highs, lows, closes, period = 14) {
        try {
            return technicalIndicators.ATR.calculate({
                high: highs,
                low: lows,
                close: closes,
                period
            });
        }
        catch (error) {
            logger_1.default.error('ATR calculation failed:', error);
            return new Array(closes.length).fill(0);
        }
    }
    calculateStandardDeviation(prices, period = 20) {
        const stdDev = new Array(prices.length).fill(0);
        if (period <= 0 || prices.length === 0)
            return stdDev;
        let sum = 0;
        let sumSq = 0;
        for (let i = 0; i < prices.length; i++) {
            const price = prices[i];
            sum += price;
            sumSq += price * price;
            if (i >= period) {
                const removed = prices[i - period];
                sum -= removed;
                sumSq -= removed * removed;
            }
            if (i >= period - 1) {
                const mean = sum / period;
                const variance = Math.max(0, (sumSq / period) - (mean * mean));
                stdDev[i] = Math.sqrt(variance);
            }
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
        // Detect various patterns
        patterns.push(...this.detectCandlestickPatterns(marketData));
        patterns.push(...this.detectSupportResistance(closes));
        patterns.push(...this.detectTrendLines(closes));
        patterns.push(...this.detectDivergence(closes, this.calculateRSI(closes)));
        return patterns.filter(p => p.confidence > 0.6);
    }
    detectCandlestickPatterns(marketData) {
        const patterns = [];
        for (let i = 2; i < marketData.length; i++) {
            const current = marketData[i];
            const previous = marketData[i - 1];
            // Hammer pattern
            if (this.isHammer(current)) {
                patterns.push({ pattern: 'Hammer', confidence: 0.7 });
            }
            // Doji pattern
            if (this.isDoji(current)) {
                patterns.push({ pattern: 'Doji', confidence: 0.6 });
            }
            // Engulfing pattern
            if (this.isBullishEngulfing(previous, current)) {
                patterns.push({ pattern: 'Bullish Engulfing', confidence: 0.8 });
            }
            else if (this.isBearishEngulfing(previous, current)) {
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
        return prev.close < prev.open && // Previous is red
            curr.close > curr.open && // Current is green
            curr.open < prev.close && // Current opens below previous close
            curr.close > prev.open; // Current closes above previous open
    }
    isBearishEngulfing(prev, curr) {
        return prev.close > prev.open && // Previous is green
            curr.close < curr.open && // Current is red
            curr.open > prev.close && // Current opens above previous close
            curr.close < prev.open; // Current closes below previous open
    }
    detectSupportResistance(closes) {
        const patterns = [];
        // Simple support/resistance detection using price levels
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
            let leftMin = Infinity;
            let leftMax = -Infinity;
            let rightMin = Infinity;
            let rightMax = -Infinity;
            for (let j = i - lookback; j < i; j++) {
                const value = levels[j];
                if (value < leftMin)
                    leftMin = value;
                if (value > leftMax)
                    leftMax = value;
            }
            for (let j = i + 1; j <= i + lookback; j++) {
                const value = levels[j];
                if (value < rightMin)
                    rightMin = value;
                if (value > rightMax)
                    rightMax = value;
            }
            const isLow = current < leftMin && current < rightMin;
            const isHigh = current > leftMax && current > rightMax;
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
        // Simple trend detection using linear regression
        const trend = this.calculateTrend(closes.slice(-20)); // Last 20 periods
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
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        const yMean = sumY / n;
        const ssTotal = values.reduce((sum, val) => sum + Math.pow(val - yMean, 2), 0);
        const ssResidual = values.reduce((sum, val, i) => {
            const predicted = slope * i + intercept;
            return sum + Math.pow(val - predicted, 2);
        }, 0);
        const rSquared = 1 - (ssResidual / ssTotal);
        return { slope, rSquared };
    }
    detectDivergence(prices, rsi) {
        const patterns = [];
        if (prices.length < 20 || rsi.length < 20)
            return patterns;
        const priceTrend = this.calculateTrend(prices.slice(-10));
        const rsiTrend = this.calculateTrend(rsi.slice(-10));
        // Bullish divergence: price making lower lows, RSI making higher lows
        if (priceTrend.slope < -0.1 && rsiTrend.slope > 0.1) {
            patterns.push({ pattern: 'Bullish Divergence', confidence: 0.75 });
        }
        // Bearish divergence: price making higher highs, RSI making lower highs
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
        return Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility
    }
}
exports.TAModule = TAModule;
const taModule = new TAModule();
exports.default = taModule;
//# sourceMappingURL=ta-module.js.map