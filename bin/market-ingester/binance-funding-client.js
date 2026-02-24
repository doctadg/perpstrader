"use strict";
/**
 * Binance Futures Funding Client
 * Public REST client used for cross-exchange funding arbitrage comparisons.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.binanceFundingClient = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../shared/logger"));
class BinanceFundingClient {
    baseUrl;
    cache = [];
    lastCacheUpdate = 0;
    cacheTtlMs = 15_000;
    requestTimeoutMs = 20_000;
    quoteSuffixes = ['USDT', 'USD', 'USDC', 'FDUSD', 'BUSD'];
    constructor() {
        this.baseUrl = process.env.BINANCE_FUTURES_BASE_URL || 'https://fapi.binance.com/fapi/v1';
    }
    async getFundingRates() {
        if (Date.now() - this.lastCacheUpdate < this.cacheTtlMs && this.cache.length > 0) {
            return this.cache;
        }
        try {
            const [premiumIndexResponse, tickerResponse] = await Promise.all([
                axios_1.default.get(`${this.baseUrl}/premiumIndex`, { timeout: this.requestTimeoutMs }),
                axios_1.default.get(`${this.baseUrl}/ticker/24hr`, { timeout: this.requestTimeoutMs }),
            ]);
            const premiumIndex = Array.isArray(premiumIndexResponse.data)
                ? premiumIndexResponse.data
                : [premiumIndexResponse.data];
            const ticker24h = Array.isArray(tickerResponse.data) ? tickerResponse.data : [tickerResponse.data];
            const volumeBySymbol = new Map();
            for (const ticker of ticker24h) {
                const normalized = this.normalizeSymbol(String(ticker.symbol || ''));
                if (!normalized)
                    continue;
                const quoteVolume = parseFloat(ticker.quoteVolume || ticker.volume || 0);
                if (Number.isFinite(quoteVolume) && quoteVolume > 0) {
                    volumeBySymbol.set(normalized, quoteVolume);
                }
            }
            const now = Date.now();
            const parsed = [];
            for (const item of premiumIndex) {
                const normalizedSymbol = this.normalizeSymbol(String(item.symbol || ''));
                if (!normalizedSymbol)
                    continue;
                const fundingRate = parseFloat(item.lastFundingRate || item.fundingRate || 0);
                const markPrice = parseFloat(item.markPrice || 0);
                const indexPrice = parseFloat(item.indexPrice || 0);
                const nextFundingTime = Number(item.nextFundingTime || now + (8 * 60 * 60 * 1000));
                const timestamp = Number(item.time || item.timestamp || now);
                parsed.push({
                    symbol: normalizedSymbol,
                    fundingRate: Number.isFinite(fundingRate) ? fundingRate : 0,
                    annualizedRate: this.calculateAnnualizedRate(fundingRate),
                    nextFundingTime: Number.isFinite(nextFundingTime) ? nextFundingTime : now + (8 * 60 * 60 * 1000),
                    markPrice: Number.isFinite(markPrice) ? markPrice : 0,
                    indexPrice: Number.isFinite(indexPrice) ? indexPrice : 0,
                    volume24h: volumeBySymbol.get(normalizedSymbol) || 0,
                    timestamp: Number.isFinite(timestamp) ? timestamp : now,
                });
            }
            this.cache = parsed;
            this.lastCacheUpdate = now;
            return parsed;
        }
        catch (error) {
            logger_1.default.error('[BinanceFundingClient] Failed to fetch funding rates:', error);
            return this.cache;
        }
    }
    calculateAnnualizedRate(fundingRate) {
        return (Number.isFinite(fundingRate) ? fundingRate : 0) * 3 * 365;
    }
    normalizeSymbol(symbol) {
        const cleaned = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!cleaned)
            return '';
        for (const suffix of this.quoteSuffixes) {
            if (cleaned.endsWith(suffix) && cleaned.length > suffix.length) {
                return cleaned.slice(0, -suffix.length);
            }
        }
        return cleaned;
    }
}
exports.binanceFundingClient = new BinanceFundingClient();
exports.default = exports.binanceFundingClient;
//# sourceMappingURL=binance-funding-client.js.map