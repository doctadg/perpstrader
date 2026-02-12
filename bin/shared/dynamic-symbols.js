"use strict";
// Dynamic Symbol Loader
// Fetches all available Hyperliquid markets for trading
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAllTradingSymbols = fetchAllTradingSymbols;
exports.getTopVolumeSymbols = getTopVolumeSymbols;
exports.getExtremeFundingSymbols = getExtremeFundingSymbols;
exports.clearSymbolCache = clearSymbolCache;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("./logger"));
let cachedSymbols = [];
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
/**
 * Fetch all available trading symbols from Hyperliquid
 */
async function fetchAllTradingSymbols() {
    const now = Date.now();
    if (cachedSymbols.length > 0 && now - lastFetch < CACHE_TTL) {
        return cachedSymbols;
    }
    try {
        const response = await axios_1.default.post('https://api.hyperliquid.xyz/info', { type: 'meta' }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
        const symbols = response.data.universe.map((asset) => asset.name);
        cachedSymbols = symbols;
        lastFetch = now;
        logger_1.default.info(`[DynamicSymbols] Loaded ${symbols.length} trading symbols from Hyperliquid`);
        return symbols;
    }
    catch (error) {
        logger_1.default.error('[DynamicSymbols] Failed to fetch symbols:', error);
        // Return default set if fetch fails
        return ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE', 'PEPE', 'WIF'];
    }
}
/**
 * Get top N symbols by 24h volume
 */
async function getTopVolumeSymbols(limit = 50) {
    try {
        const response = await axios_1.default.post('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs' }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
        const [meta, ctxs] = response.data;
        const markets = meta.universe.map((asset, index) => ({
            symbol: asset.name,
            volume: parseFloat(ctxs[index]?.dayNtlVlm || '0'),
        }));
        markets.sort((a, b) => b.volume - a.volume);
        return markets.slice(0, limit).map((m) => m.symbol);
    }
    catch (error) {
        logger_1.default.error('[DynamicSymbols] Failed to fetch top volume:', error);
        return ['BTC', 'ETH', 'SOL'];
    }
}
/**
 * Get symbols with extreme funding rates
 */
async function getExtremeFundingSymbols(threshold = 0.0001) {
    try {
        const response = await axios_1.default.post('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs' }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
        const [meta, ctxs] = response.data;
        const positive = [];
        const negative = [];
        meta.universe.forEach((asset, index) => {
            const funding = parseFloat(ctxs[index]?.funding || '0');
            if (funding >= threshold)
                positive.push(asset.name);
            if (funding <= -threshold)
                negative.push(asset.name);
        });
        return { positive, negative };
    }
    catch (error) {
        logger_1.default.error('[DynamicSymbols] Failed to fetch extreme funding:', error);
        return { positive: [], negative: [] };
    }
}
/**
 * Clear symbol cache
 */
function clearSymbolCache() {
    cachedSymbols = [];
    lastFetch = 0;
    logger_1.default.info('[DynamicSymbols] Cache cleared');
}
//# sourceMappingURL=dynamic-symbols.js.map