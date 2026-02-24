"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hyperliquidAllMarkets = void 0;
var axios_1 = require("axios");
var logger_1 = require("../shared/logger");
var config_1 = require("../shared/config");
var HyperliquidAllMarkets = /** @class */ (function () {
    function HyperliquidAllMarkets() {
        this.allMarkets = [];
        this.lastUpdate = 0;
        this.updateIntervalMs = 60000; // 1 minute
        var hyperliquidConfig = config_1.default.getSection('hyperliquid');
        this.hyperliquidUrl = hyperliquidConfig.baseUrl || 'https://api.hyperliquid.xyz';
    }
    /**
     * Fetch all available perpetual markets from Hyperliquid
     * Returns ALL markets (100+ if available), not just top 50
     */
    HyperliquidAllMarkets.prototype.fetchAllMarkets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, _a, meta, assetCtxs_1, markets, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        logger_1.default.info('[HyperliquidAllMarkets] Fetching complete market list...');
                        return [4 /*yield*/, axios_1.default.post("".concat(this.hyperliquidUrl, "/info"), { type: 'metaAndAssetCtxs' }, {
                                headers: { 'Content-Type': 'application/json' },
                                timeout: 30000
                            })];
                    case 1:
                        response = _b.sent();
                        _a = response.data, meta = _a[0], assetCtxs_1 = _a[1];
                        if (!meta.universe || !assetCtxs_1) {
                            throw new Error('Invalid Hyperliquid API response structure');
                        }
                        markets = meta.universe
                            .map(function (asset, index) {
                            var ctx = assetCtxs_1[index];
                            if (!ctx) {
                                logger_1.default.warn("[HyperliquidAllMarkets] No context at index ".concat(index, " for ").concat(asset.name));
                                return null;
                            }
                            var funding = parseFloat(ctx.funding) || 0;
                            var markPx = parseFloat(ctx.markPx) || 0;
                            var dayNtlVlm = parseFloat(ctx.dayNtlVlm) || 0;
                            return {
                                coin: asset.name,
                                index: index,
                                maxLeverage: asset.maxLeverage,
                                szDecimals: asset.szDecimals,
                                onlyIsolated: asset.onlyIsolated || false,
                                funding: funding,
                                fundingRate: funding,
                                openInterest: parseFloat(ctx.openInterest) || 0,
                                prevDayPx: parseFloat(ctx.prevDayPx) || 0,
                                dayNtlVlm: dayNtlVlm,
                                markPx: markPx,
                                midPx: parseFloat(ctx.midPx) || 0,
                                oraclePx: parseFloat(ctx.oraclePx) || 0,
                                circulatingSupply: ctx.circulatingSupply ? parseFloat(ctx.circulatingSupply) : undefined,
                                volume24h: dayNtlVlm,
                                markPrice: markPx,
                            };
                        })
                            .filter(function (m) { return m !== null; });
                        this.allMarkets = markets;
                        this.lastUpdate = Date.now();
                        logger_1.default.info("[HyperliquidAllMarkets] Fetched ".concat(markets.length, " total markets from Hyperliquid"));
                        return [2 /*return*/, {
                                markets: markets,
                                count: markets.length,
                                timestamp: this.lastUpdate,
                            }];
                    case 2:
                        error_1 = _b.sent();
                        logger_1.default.error('[HyperliquidAllMarkets] Failed to fetch all markets:', error_1);
                        throw error_1;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get all markets (from cache if recent)
     */
    HyperliquidAllMarkets.prototype.getAllMarkets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = Date.now();
                        if (!(this.allMarkets.length === 0 || now - this.lastUpdate > this.updateIntervalMs)) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.fetchAllMarkets()];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2: return [2 /*return*/, {
                            markets: this.allMarkets,
                            count: this.allMarkets.length,
                            timestamp: this.lastUpdate,
                        }];
                }
            });
        });
    };
    /**
     * Get markets sorted by 24h volume
     */
    HyperliquidAllMarkets.prototype.getMarketsByVolume = function (limit) {
        return __awaiter(this, void 0, void 0, function () {
            var markets, sorted;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAllMarkets()];
                    case 1:
                        markets = (_a.sent()).markets;
                        sorted = __spreadArray([], markets, true).sort(function (a, b) { return b.volume24h - a.volume24h; });
                        return [2 /*return*/, limit ? sorted.slice(0, limit) : sorted];
                }
            });
        });
    };
    /**
     * Get markets sorted by funding rate (absolute value)
     */
    HyperliquidAllMarkets.prototype.getMarketsByFundingRate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var markets;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAllMarkets()];
                    case 1:
                        markets = (_a.sent()).markets;
                        return [2 /*return*/, __spreadArray([], markets, true).sort(function (a, b) { return Math.abs(b.fundingRate) - Math.abs(a.fundingRate); })];
                }
            });
        });
    };
    /**
     * Get markets with extreme funding rates
     */
    HyperliquidAllMarkets.prototype.getExtremeFundingMarkets = function () {
        return __awaiter(this, arguments, void 0, function (threshold) {
            var markets, positive, negative;
            if (threshold === void 0) { threshold = 0.0001; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAllMarkets()];
                    case 1:
                        markets = (_a.sent()).markets;
                        positive = markets.filter(function (m) { return m.fundingRate >= threshold; }).sort(function (a, b) { return b.fundingRate - a.fundingRate; });
                        negative = markets.filter(function (m) { return m.fundingRate <= -threshold; }).sort(function (a, b) { return a.fundingRate - b.fundingRate; });
                        return [2 /*return*/, { positive: positive, negative: negative }];
                }
            });
        });
    };
    /**
     * Get markets by category
     */
    HyperliquidAllMarkets.prototype.getMarketsByCategory = function (markets) {
        var categories = {
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
        for (var _i = 0, markets_1 = markets; _i < markets_1.length; _i++) {
            var market = markets_1[_i];
            var category = this.categorizeCoin(market.coin);
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(market);
        }
        return categories;
    };
    /**
     * Get a specific market by symbol
     */
    HyperliquidAllMarkets.prototype.getMarket = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var markets;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAllMarkets()];
                    case 1:
                        markets = (_a.sent()).markets;
                        return [2 /*return*/, markets.find(function (m) { return m.coin.toUpperCase() === symbol.toUpperCase(); }) || null];
                }
            });
        });
    };
    /**
     * Get all available symbols
     */
    HyperliquidAllMarkets.prototype.getAllSymbols = function () {
        return __awaiter(this, void 0, void 0, function () {
            var markets;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getAllMarkets()];
                    case 1:
                        markets = (_a.sent()).markets;
                        return [2 /*return*/, markets.map(function (m) { return m.coin; }).sort()];
                }
            });
        });
    };
    /**
     * Categorize a coin
     */
    HyperliquidAllMarkets.prototype.categorizeCoin = function (coin) {
        var coinLower = coin.toLowerCase();
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
    };
    /**
     * Clear cache and force refresh
     */
    HyperliquidAllMarkets.prototype.clearCache = function () {
        this.allMarkets = [];
        this.lastUpdate = 0;
        logger_1.default.info('[HyperliquidAllMarkets] Cache cleared');
    };
    return HyperliquidAllMarkets;
}());
exports.hyperliquidAllMarkets = new HyperliquidAllMarkets();
exports.default = exports.hyperliquidAllMarkets;
