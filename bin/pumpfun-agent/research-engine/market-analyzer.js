"use strict";
// Market Analyzer - Analyzes current market regime, volatility, and trends
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketAnalyzer = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = __importDefault(require("../shared/config"));
class MarketAnalyzer {
    baseUrl;
    symbols;
    cache = new Map();
    CACHE_TTL_MS = 60000; // 1 minute cache
    constructor() {
        const hlConfig = config_1.default.getSection('hyperliquid');
        this.baseUrl = hlConfig.baseUrl || 'https://api.hyperliquid.xyz';
        this.symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'LINK', 'DOGE', 'ADA', 'AVAX', 'LTC', 'DOT'];
    }
    /**
     * Analyze current market conditions and return regime classification
     */
    async analyze() {
        logger_1.default.info('[MarketAnalyzer] Analyzing market conditions...');
        try {
            // Fetch data for all major symbols
            const symbolData = await this.fetchSymbolData();
            // Calculate volatility across market
            const volatility = this.calculateMarketVolatility(symbolData);
            // Calculate trend strength
            const trendStrength = this.calculateTrendStrength(symbolData);
            // Classify regime
            const regime = this.classifyRegime(volatility, trendStrength);
            // Get volume profile
            const volumeProfile = this.classifyVolumeProfile(symbolData);
            // Get top movers
            const topMovers = this.getTopMovers(symbolData, 5);
            const result = {
                regime,
                volatility,
                trendStrength,
                volumeProfile,
                topMovers,
                timestamp: new Date(),
            };
            logger_1.default.info(`[MarketAnalyzer] Regime: ${regime}, Volatility: ${volatility.toFixed(2)}, Trend: ${trendStrength.toFixed(2)}`);
            return result;
        }
        catch (error) {
            logger_1.default.error('[MarketAnalyzer] Analysis failed:', error);
            return this.getDefaultRegime();
        }
    }
    /**
     * Fetch candle and market data for symbols
     */
    async fetchSymbolData() {
        const data = new Map();
        const now = Date.now();
        for (const symbol of this.symbols) {
            try {
                // Check cache first
                const cached = this.cache.get(symbol);
                if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
                    data.set(symbol, cached.data);
                    continue;
                }
                // Fetch candles for 24h
                const endTime = now;
                const startTime = now - (24 * 60 * 60 * 1000); // 24 hours ago
                const response = await axios_1.default.post(`${this.baseUrl}/info`, {
                    type: 'candleSnapshot',
                    req: {
                        coin: symbol,
                        interval: '1h',
                        startTime,
                        endTime,
                    },
                }, { timeout: 10000 });
                const candles = Array.isArray(response.data) ? response.data : [];
                // Calculate 24h change
                const change24h = candles.length >= 2
                    ? ((candles[candles.length - 1].c - candles[0].o) / candles[0].o) * 100
                    : 0;
                // Calculate volume
                const volume24h = candles.reduce((sum, c) => sum + (c.v || 0), 0);
                const symbolInfo = {
                    candles,
                    meta: {
                        change24h,
                        volume24h,
                    },
                };
                // Cache the data
                this.cache.set(symbol, { data: symbolInfo, timestamp: now });
                data.set(symbol, symbolInfo);
            }
            catch (error) {
                logger_1.default.warn(`[MarketAnalyzer] Failed to fetch data for ${symbol}:`, error);
            }
        }
        return data;
    }
    /**
     * Calculate overall market volatility (0-1 scale)
     */
    calculateMarketVolatility(symbolData) {
        const volatilities = [];
        for (const [symbol, data] of symbolData) {
            if (data.candles.length < 2)
                continue;
            // Calculate returns
            const returns = [];
            for (let i = 1; i < data.candles.length; i++) {
                const prev = data.candles[i - 1].c;
                const curr = data.candles[i].c;
                returns.push((curr - prev) / prev);
            }
            // Calculate standard deviation of returns (volatility)
            const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
            const stdDev = Math.sqrt(variance);
            // Normalize to 0-1 scale (assuming max daily vol ~10%)
            volatilities.push(Math.min(stdDev * Math.sqrt(24) * 100, 1));
        }
        if (volatilities.length === 0)
            return 0.5;
        // Return average volatility
        const avgVol = volatilities.reduce((a, b) => a + b, 0) / volatilities.length;
        return Math.min(avgVol, 1);
    }
    /**
     * Calculate trend strength (-1 to 1 scale)
     */
    calculateTrendStrength(symbolData) {
        let totalStrength = 0;
        let count = 0;
        for (const [symbol, data] of symbolData) {
            if (data.candles.length < 10)
                continue;
            // Simple trend strength using linear regression slope
            const n = Math.min(data.candles.length, 24);
            const prices = data.candles.slice(-n).map(c => c.c);
            // Calculate EMA trend
            const ema12 = this.calculateEMA(prices, 12);
            const ema26 = this.calculateEMA(prices, 26);
            if (ema12.length > 0 && ema26.length > 0) {
                const trend = (ema12[ema12.length - 1] - ema26[ema26.length - 1]) / ema26[ema26.length - 1];
                // Normalize to -1 to 1
                const normalizedTrend = Math.max(-1, Math.min(1, trend * 10));
                totalStrength += normalizedTrend;
                count++;
            }
        }
        if (count === 0)
            return 0;
        return totalStrength / count;
    }
    /**
     * Classify market regime based on volatility and trend
     */
    classifyRegime(volatility, trendStrength) {
        // High volatility regime
        if (volatility > 0.7) {
            return 'VOLATILE';
        }
        // Trending regimes (moderate/low volatility with strong trend)
        if (Math.abs(trendStrength) > 0.3) {
            return trendStrength > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN';
        }
        // Ranging regime (low volatility, weak trend)
        if (volatility < 0.4 && Math.abs(trendStrength) < 0.2) {
            return 'RANGING';
        }
        return 'UNKNOWN';
    }
    /**
     * Classify volume profile
     */
    classifyVolumeProfile(symbolData) {
        let totalVolume = 0;
        let count = 0;
        for (const [symbol, data] of symbolData) {
            if (data.meta.volume24h > 0) {
                totalVolume += data.meta.volume24h;
                count++;
            }
        }
        if (count === 0)
            return 'NORMAL';
        const avgVolume = totalVolume / count;
        // Very rough classification - would need historical baselines for accuracy
        if (avgVolume > 1e9)
            return 'EXTREME';
        if (avgVolume > 5e8)
            return 'HIGH';
        if (avgVolume < 1e8)
            return 'LOW';
        return 'NORMAL';
    }
    /**
     * Get top movers by 24h change
     */
    getTopMovers(symbolData, limit) {
        const movers = Array.from(symbolData.entries())
            .filter(([_, data]) => data.meta.change24h !== undefined)
            .map(([symbol, data]) => ({
            symbol,
            change24h: data.meta.change24h,
            volume24h: data.meta.volume24h,
        }))
            .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
            .slice(0, limit);
        return movers;
    }
    /**
     * Calculate Exponential Moving Average
     */
    calculateEMA(prices, period) {
        if (prices.length < period)
            return [];
        const multiplier = 2 / (period + 1);
        const ema = [];
        // Start with SMA
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += prices[i];
        }
        ema.push(sum / period);
        // Calculate EMA for rest
        for (let i = period; i < prices.length; i++) {
            const newEma = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
            ema.push(newEma);
        }
        return ema;
    }
    /**
     * Get default regime when analysis fails
     */
    getDefaultRegime() {
        return {
            regime: 'UNKNOWN',
            volatility: 0.5,
            trendStrength: 0,
            volumeProfile: 'NORMAL',
            topMovers: [],
            timestamp: new Date(),
        };
    }
    /**
     * Get quick market snapshot for external use
     */
    async getMarketSnapshot() {
        try {
            // Try to get BTC and ETH prices
            const btcData = this.cache.get('BTC');
            const ethData = this.cache.get('ETH');
            const btcPrice = btcData?.data.candles[btcData.data.candles.length - 1]?.c || 0;
            const ethPrice = ethData?.data.candles[ethData.data.candles.length - 1]?.c || 0;
            return {
                btcPrice,
                ethPrice,
                marketCap: 0, // Would need external API
                fearGreed: 50, // Would need external API
            };
        }
        catch (error) {
            logger_1.default.error('[MarketAnalyzer] Failed to get market snapshot:', error);
            return {
                btcPrice: 0,
                ethPrice: 0,
                marketCap: 0,
                fearGreed: 50,
            };
        }
    }
}
exports.MarketAnalyzer = MarketAnalyzer;
exports.default = MarketAnalyzer;
//# sourceMappingURL=market-analyzer.js.map