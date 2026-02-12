"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hyperliquidAllMarkets = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = __importDefault(require("../shared/config"));
class HyperliquidAllMarkets {
    hyperliquidUrl;
    allMarkets = [];
    lastUpdate = 0;
    updateIntervalMs = 60000; // 1 minute
    constructor() {
        const hyperliquidConfig = config_1.default.getSection('hyperliquid');
        this.hyperliquidUrl = hyperliquidConfig.baseUrl || 'https://api.hyperliquid.xyz';
    }
    /**
     * Fetch all available perpetual markets from Hyperliquid
     * Returns ALL markets (100+ if available), not just top 50
     */
    async fetchAllMarkets() {
        try {
            logger_1.default.info('[HyperliquidAllMarkets] Fetching complete market list...');
            // Fetch meta and context
            // metaAndAssetCtxs returns [meta, assetCtxs] as an array
            const response = await axios_1.default.post(`${this.hyperliquidUrl}/info`, { type: 'metaAndAssetCtxs' }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });
            // Response is [meta, assetCtxs]
            const [meta, assetCtxs] = response.data;
            if (!meta.universe || !assetCtxs) {
                throw new Error('Invalid Hyperliquid API response structure');
            }
            // Combine ALL universe and context data (not limited to top 50)
            const markets = meta.universe
                .map((asset, index) => {
                const ctx = assetCtxs[index];
                if (!ctx) {
                    logger_1.default.warn(`[HyperliquidAllMarkets] No context at index ${index} for ${asset.name}`);
                    return null;
                }
                const funding = parseFloat(ctx.funding) || 0;
                const markPx = parseFloat(ctx.markPx) || 0;
                const dayNtlVlm = parseFloat(ctx.dayNtlVlm) || 0;
                return {
                    coin: asset.name,
                    index,
                    maxLeverage: asset.maxLeverage,
                    szDecimals: asset.szDecimals,
                    onlyIsolated: asset.onlyIsolated || false,
                    funding,
                    fundingRate: funding,
                    openInterest: parseFloat(ctx.openInterest) || 0,
                    prevDayPx: parseFloat(ctx.prevDayPx) || 0,
                    dayNtlVlm,
                    markPx,
                    midPx: parseFloat(ctx.midPx) || 0,
                    oraclePx: parseFloat(ctx.oraclePx) || 0,
                    circulatingSupply: ctx.circulatingSupply ? parseFloat(ctx.circulatingSupply) : undefined,
                    volume24h: dayNtlVlm,
                    markPrice: markPx,
                };
            })
                .filter((m) => m !== null);
            this.allMarkets = markets;
            this.lastUpdate = Date.now();
            logger_1.default.info(`[HyperliquidAllMarkets] Fetched ${markets.length} total markets from Hyperliquid`);
            return {
                markets,
                count: markets.length,
                timestamp: this.lastUpdate,
            };
        }
        catch (error) {
            logger_1.default.error('[HyperliquidAllMarkets] Failed to fetch all markets:', error);
            throw error;
        }
    }
    /**
     * Get all markets (from cache if recent)
     */
    async getAllMarkets() {
        const now = Date.now();
        if (this.allMarkets.length === 0 || now - this.lastUpdate > this.updateIntervalMs) {
            return await this.fetchAllMarkets();
        }
        return {
            markets: this.allMarkets,
            count: this.allMarkets.length,
            timestamp: this.lastUpdate,
        };
    }
    /**
     * Get markets sorted by 24h volume
     */
    async getMarketsByVolume(limit) {
        const { markets } = await this.getAllMarkets();
        const sorted = [...markets].sort((a, b) => b.volume24h - a.volume24h);
        return limit ? sorted.slice(0, limit) : sorted;
    }
    /**
     * Get markets sorted by funding rate (absolute value)
     */
    async getMarketsByFundingRate() {
        const { markets } = await this.getAllMarkets();
        return [...markets].sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));
    }
    /**
     * Get markets with extreme funding rates
     */
    async getExtremeFundingMarkets(threshold = 0.0001) {
        const { markets } = await this.getAllMarkets();
        const positive = markets.filter(m => m.fundingRate >= threshold).sort((a, b) => b.fundingRate - a.fundingRate);
        const negative = markets.filter(m => m.fundingRate <= -threshold).sort((a, b) => a.fundingRate - b.fundingRate);
        return { positive, negative };
    }
    /**
     * Get markets by category
     */
    getMarketsByCategory(markets) {
        const categories = {
            'Layer 1': [],
            'Layer 2': [],
            'DeFi': [],
            'Meme': [],
            'AI': [],
            'Solana': [],
            'Gaming': [],
            'RWA': [],
            'Infrastructure': [],
            'Altcoin': [],
        };
        for (const market of markets) {
            const category = this.categorizeCoin(market.coin);
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(market);
        }
        return categories;
    }
    /**
     * Get a specific market by symbol
     */
    async getMarket(symbol) {
        const { markets } = await this.getAllMarkets();
        return markets.find(m => m.coin.toUpperCase() === symbol.toUpperCase()) || null;
    }
    /**
     * Get all available symbols
     */
    async getAllSymbols() {
        const { markets } = await this.getAllMarkets();
        return markets.map(m => m.coin).sort();
    }
    /**
     * Categorize a coin
     */
    categorizeCoin(coin) {
        const coinLower = coin.toLowerCase();
        // Layer 1s
        if (['btc', 'eth', 'sol', 'avax', 'near', 'ftm', 'matic', 'sui', 'apt', 'sei', 'inj', 'ada', 'dot', 'bnb'].includes(coinLower)) {
            return 'Layer 1';
        }
        // Layer 2s
        if (['arb', 'op', 'base', 'mnt', 'strk', 'zk', 'metis', 'imx'].includes(coinLower)) {
            return 'Layer 2';
        }
        // DeFi
        if (['uni', 'aave', 'crv', 'comp', 'mkr', 'lido', 'pendle', 'jup', 'ray', 'dydx', 'gmx', 'gns', 'snx', 'yfi', 'sushi', '1inch', 'lend', 'aero', 'eurc'].includes(coinLower)) {
            return 'DeFi';
        }
        // Memes
        if (['doge', 'shib', 'pepe', 'floki', 'bonk', 'wif', 'mog', 'popcat', 'goat', 'mooodeng', 'ai16z', 'zerebro', 'luce', 'fwog', 'spx'].includes(coinLower)) {
            return 'Meme';
        }
        // AI tokens
        if (['render', 'rndr', 'tao', 'fet', 'agix', 'wld', 'arkm', 'ai16z', 'zerebro', 'griffain', 'neur', 'luna', 'vvaifu'].includes(coinLower)) {
            return 'AI';
        }
        // Solana ecosystem
        if (['jto', 'jup', 'ray', 'drift', 'kmno', 'pyth'].includes(coinLower)) {
            return 'Solana';
        }
        // Gaming
        if (['axs', 'sand', 'mana', 'gala', 'enj', 'ilv', 'ron', 'beam', 'imx', 'pyr'].includes(coinLower)) {
            return 'Gaming';
        }
        // RWA (Real World Assets)
        if (['ondo', 'cfg', 'mpl', 'rsr', 'polymesh', 'centrifuge'].includes(coinLower)) {
            return 'RWA';
        }
        // Infrastructure
        if (['link', 'grt', 'band', 'api3', 'pyth', 'dia', 'nest'].includes(coinLower)) {
            return 'Infrastructure';
        }
        return 'Altcoin';
    }
    /**
     * Clear cache and force refresh
     */
    clearCache() {
        this.allMarkets = [];
        this.lastUpdate = 0;
        logger_1.default.info('[HyperliquidAllMarkets] Cache cleared');
    }
}
exports.hyperliquidAllMarkets = new HyperliquidAllMarkets();
exports.default = exports.hyperliquidAllMarkets;
//# sourceMappingURL=hyperliquid-all-markets.js.map