"use strict";
// Market Data Sync Service
// Fetches and syncs market data from Hyperliquid and Polymarket
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketDataSync = void 0;
var better_sqlite3_1 = require("better-sqlite3");
var logger_1 = require("../shared/logger");
var MarketDataSync = /** @class */ (function () {
    function MarketDataSync() {
        this.db = null;
        this.initialized = false;
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }
    MarketDataSync.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.initialized)
                    return [2 /*return*/];
                try {
                    this.db = new better_sqlite3_1.default(this.dbPath);
                    this.db.pragma('journal_mode = WAL');
                    this.initialized = true;
                    logger_1.default.info('[MarketDataSync] Initialized successfully');
                }
                catch (error) {
                    logger_1.default.error('[MarketDataSync] Initialization failed:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Fetch top coins from Hyperliquid
     * Returns top 50 by 24h volume
     */
    MarketDataSync.prototype.fetchHyperliquidMarkets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, metaRes, contextRes, meta, context_1, markets, error_1;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 4, , 5]);
                        logger_1.default.info('[MarketDataSync] Fetching Hyperliquid market data...');
                        return [4 /*yield*/, Promise.all([
                                fetch('https://api.hyperliquid.xyz/info', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ type: 'meta' }),
                                }),
                                fetch('https://api.hyperliquid.xyz/info', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
                                }),
                            ])];
                    case 1:
                        _a = _b.sent(), metaRes = _a[0], contextRes = _a[1];
                        if (!metaRes.ok || !contextRes.ok) {
                            throw new Error("HL API error: meta=".concat(metaRes.status, ", context=").concat(contextRes.ok));
                        }
                        return [4 /*yield*/, metaRes.json()];
                    case 2:
                        meta = _b.sent();
                        return [4 /*yield*/, contextRes.json()];
                    case 3:
                        context_1 = _b.sent();
                        if (!meta.universe || !context_1.assetCtxs) {
                            throw new Error('Invalid Hyperliquid API response structure');
                        }
                        markets = meta.universe
                            .map(function (asset, index) {
                            var ctx = context_1.assetCtxs[index];
                            if (!ctx || ctx.coin !== asset.name) {
                                logger_1.default.warn("[MarketDataSync] Mismatch at index ".concat(index, ": ").concat(asset.name, " vs ").concat(ctx === null || ctx === void 0 ? void 0 : ctx.coin));
                                return null;
                            }
                            var volume24h = parseFloat(ctx.dayNtlVlm) || 0;
                            return {
                                id: "hl_".concat(asset.name.toLowerCase()),
                                type: 'hyperliquid',
                                symbol: asset.name,
                                name: asset.name,
                                description: "".concat(asset.name, " perpetual futures on Hyperliquid"),
                                category: 'CRYPTO',
                                subCategory: _this.categorizeCrypto(asset.name),
                                volume24h: volume24h,
                                priority: _this.calculatePriority(volume24h, 'hyperliquid'),
                                hlCoin: asset.name,
                                hlIndex: index,
                            };
                        })
                            .filter(function (m) { return m !== null; })
                            .sort(function (a, b) { return ((b === null || b === void 0 ? void 0 : b.volume24h) || 0) - ((a === null || a === void 0 ? void 0 : a.volume24h) || 0); })
                            .slice(0, 50);
                        logger_1.default.info("[MarketDataSync] Fetched ".concat(markets.length, " Hyperliquid markets"));
                        return [2 /*return*/, markets];
                    case 4:
                        error_1 = _b.sent();
                        logger_1.default.error('[MarketDataSync] Failed to fetch Hyperliquid markets:', error_1);
                        return [2 /*return*/, []];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetch active markets from Polymarket
     */
    MarketDataSync.prototype.fetchPolymarketMarkets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response, markets, activeMarkets, marketData, error_2;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        logger_1.default.info('[MarketDataSync] Fetching Polymarket data...');
                        return [4 /*yield*/, fetch('https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=1000')];
                    case 1:
                        response = _a.sent();
                        if (!response.ok) {
                            throw new Error("Polymarket API error: ".concat(response.status));
                        }
                        return [4 /*yield*/, response.json()];
                    case 2:
                        markets = _a.sent();
                        if (!Array.isArray(markets)) {
                            throw new Error('Invalid Polymarket API response structure');
                        }
                        activeMarkets = markets
                            .filter(function (m) { return m.active && !m.closed; })
                            .sort(function (a, b) { return parseFloat(b.volume || '0') - parseFloat(a.volume || '0'); })
                            .slice(0, 100);
                        marketData = activeMarkets.map(function (m) {
                            var volumeUsd = parseFloat(m.volume || '0');
                            var liquidity = parseFloat(m.liquidity || '0');
                            // Parse outcomes and prices
                            var outcomes = [];
                            var probability;
                            try {
                                outcomes = m.outcomes || [];
                                if (m.outcomePrices) {
                                    var prices = JSON.parse(m.outcomePrices);
                                    if (Array.isArray(prices) && prices.length > 0) {
                                        probability = parseFloat(prices[0]);
                                    }
                                }
                            }
                            catch (e) {
                                // Ignore parsing errors
                            }
                            // Categorize the market
                            var _a = _this.categorizePolymarket(m), category = _a.category, subCategory = _a.subCategory;
                            return {
                                id: "pm_".concat(m.conditionId),
                                type: 'polymarket',
                                name: m.question,
                                description: m.description,
                                category: category,
                                subCategory: subCategory,
                                volume24h: volumeUsd,
                                priority: _this.calculatePriority(volumeUsd, 'polymarket'),
                                pmMarketSlug: m.slug,
                                pmConditionId: m.conditionId,
                                pmQuestionId: m.conditionId, // Using conditionId as questionId
                                pmResolutionDate: m.endDate || undefined,
                                pmVolumeUsd: volumeUsd,
                                pmLiquidity: liquidity,
                                pmProbability: probability,
                                pmOutcomes: outcomes,
                            };
                        });
                        logger_1.default.info("[MarketDataSync] Fetched ".concat(marketData.length, " Polymarket markets"));
                        return [2 /*return*/, marketData];
                    case 3:
                        error_2 = _a.sent();
                        logger_1.default.error('[MarketDataSync] Failed to fetch Polymarket markets:', error_2);
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Sync all markets to database
     */
    MarketDataSync.prototype.syncAllMarkets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, _a, hlMarkets_1, pmMarkets_1, insertMarket_1, insertKeyword_1, txn, result, error_3;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db)
                            throw new Error('Database not initialized');
                        now = new Date().toISOString();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, Promise.all([
                                this.fetchHyperliquidMarkets(),
                                this.fetchPolymarketMarkets(),
                            ])];
                    case 3:
                        _a = _b.sent(), hlMarkets_1 = _a[0], pmMarkets_1 = _a[1];
                        insertMarket_1 = this.db.prepare("\n        INSERT INTO markets (\n          id, type, symbol, name, description, category, sub_category,\n          active, volume_24h, priority,\n          hl_coin, hl_index,\n          pm_market_slug, pm_condition_id, pm_question_id, pm_resolution_date,\n          pm_volume_usd, pm_liquidity, pm_probability, pm_outcomes,\n          first_seen, last_updated\n        ) VALUES (\n          @id, @type, @symbol, @name, @description, @category, @subCategory,\n          1, @volume24h, @priority,\n          @hlCoin, @hlIndex,\n          @pmMarketSlug, @pmConditionId, @pmQuestionId, @pmResolutionDate,\n          @pmVolumeUsd, @pmLiquidity, @pmProbability, @pmOutcomes,\n          @firstSeen, @lastUpdated\n        )\n        ON CONFLICT(id) DO UPDATE SET\n          volume_24h = @volume24h,\n          priority = @priority,\n          last_updated = @lastUpdated,\n          active = 1,\n          pm_volume_usd = COALESCE(@pmVolumeUsd, pm_volume_usd),\n          pm_liquidity = COALESCE(@pmLiquidity, pm_liquidity),\n          pm_probability = COALESCE(@pmProbability, pm_probability)\n      ");
                        insertKeyword_1 = this.db.prepare("\n        INSERT OR IGNORE INTO market_keywords (market_id, keyword, keyword_type, weight)\n        VALUES (@marketId, @keyword, @keywordType, @weight)\n      ");
                        txn = this.db.transaction(function () {
                            var hlCount = 0;
                            var pmCount = 0;
                            // Insert Hyperliquid markets
                            for (var _i = 0, hlMarkets_2 = hlMarkets_1; _i < hlMarkets_2.length; _i++) {
                                var m = hlMarkets_2[_i];
                                insertMarket_1.run(__assign(__assign({}, m), { subCategory: m.subCategory || null, hlCoin: m.hlCoin || null, hlIndex: m.hlIndex || null, pmMarketSlug: null, pmConditionId: null, pmQuestionId: null, pmResolutionDate: null, pmVolumeUsd: null, pmLiquidity: null, pmProbability: null, pmOutcomes: m.pmOutcomes ? JSON.stringify(m.pmOutcomes) : null, firstSeen: now, lastUpdated: now }));
                                // Insert keywords for this market
                                var keywords = _this.generateKeywords(m);
                                for (var _a = 0, keywords_1 = keywords; _a < keywords_1.length; _a++) {
                                    var kw = keywords_1[_a];
                                    insertKeyword_1.run({
                                        marketId: m.id,
                                        keyword: kw.keyword,
                                        keywordType: kw.type,
                                        weight: kw.weight,
                                    });
                                }
                                hlCount++;
                            }
                            // Insert Polymarket markets
                            for (var _b = 0, pmMarkets_2 = pmMarkets_1; _b < pmMarkets_2.length; _b++) {
                                var m = pmMarkets_2[_b];
                                insertMarket_1.run(__assign(__assign({}, m), { symbol: m.symbol || null, subCategory: m.subCategory || null, hlCoin: null, hlIndex: null, pmMarketSlug: m.pmMarketSlug || null, pmConditionId: m.pmConditionId || null, pmQuestionId: m.pmQuestionId || null, pmResolutionDate: m.pmResolutionDate || null, pmVolumeUsd: m.pmVolumeUsd || null, pmLiquidity: m.pmLiquidity || null, pmProbability: m.pmProbability || null, pmOutcomes: m.pmOutcomes ? JSON.stringify(m.pmOutcomes) : null, firstSeen: now, lastUpdated: now }));
                                // Insert keywords for this market
                                var keywords = _this.generateKeywords(m);
                                for (var _c = 0, keywords_2 = keywords; _c < keywords_2.length; _c++) {
                                    var kw = keywords_2[_c];
                                    insertKeyword_1.run({
                                        marketId: m.id,
                                        keyword: kw.keyword,
                                        keywordType: kw.type,
                                        weight: kw.weight,
                                    });
                                }
                                pmCount++;
                            }
                            return { hlCount: hlCount, pmCount: pmCount };
                        });
                        result = txn();
                        logger_1.default.info("[MarketDataSync] Synced ".concat(result.hlCount, " HL + ").concat(result.pmCount, " PM markets"));
                        return [2 /*return*/, {
                                hyperliquid: result.hlCount,
                                polymarket: result.pmCount,
                                total: result.hlCount + result.pmCount,
                            }];
                    case 4:
                        error_3 = _b.sent();
                        logger_1.default.error('[MarketDataSync] Sync failed:', error_3);
                        throw error_3;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Deactivate markets not seen in last sync
     */
    MarketDataSync.prototype.deactivateStaleMarkets = function () {
        return __awaiter(this, arguments, void 0, function (hours) {
            var result;
            if (hours === void 0) { hours = 24; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, 0];
                        try {
                            result = this.db.prepare("\n        UPDATE markets \n        SET active = 0 \n        WHERE active = 1 \n        AND last_updated < datetime('now', '-".concat(hours, " hours')\n      ")).run();
                            if (result.changes > 0) {
                                logger_1.default.info("[MarketDataSync] Deactivated ".concat(result.changes, " stale markets"));
                            }
                            return [2 /*return*/, result.changes];
                        }
                        catch (error) {
                            logger_1.default.error('[MarketDataSync] Failed to deactivate stale markets:', error);
                            return [2 /*return*/, 0];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get all active markets
     */
    MarketDataSync.prototype.getActiveMarkets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            rows = this.db.prepare("\n        SELECT * FROM markets WHERE active = 1 ORDER BY priority DESC, volume_24h DESC\n      ").all();
                            return [2 /*return*/, rows.map(function (r) { return ({
                                    id: r.id,
                                    type: r.type,
                                    symbol: r.symbol,
                                    name: r.name,
                                    description: r.description,
                                    category: r.category,
                                    subCategory: r.sub_category,
                                    volume24h: r.volume_24h,
                                    priority: r.priority,
                                    hlCoin: r.hl_coin,
                                    hlIndex: r.hl_index,
                                    pmMarketSlug: r.pm_market_slug,
                                    pmConditionId: r.pm_condition_id,
                                    pmQuestionId: r.pm_question_id,
                                    pmResolutionDate: r.pm_resolution_date,
                                    pmVolumeUsd: r.pm_volume_usd,
                                    pmLiquidity: r.pm_liquidity,
                                    pmProbability: r.pm_probability,
                                    pmOutcomes: r.pm_outcomes ? JSON.parse(r.pm_outcomes) : undefined,
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[MarketDataSync] Failed to get active markets:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================================
    // Private Helpers
    // ============================================================================
    MarketDataSync.prototype.categorizeCrypto = function (coin) {
        var coinLower = coin.toLowerCase();
        // Major coins
        if (['btc', 'eth'].includes(coinLower))
            return 'Layer 1';
        // L2s
        if (['arb', 'op', 'base', 'mnt', 'strk', 'zk'].includes(coinLower))
            return 'Layer 2';
        // DeFi
        if (['uni', 'aave', 'crv', 'comp', 'mkr', 'lido', 'pendle', 'jup', 'ray'].includes(coinLower)) {
            return 'DeFi';
        }
        // Memes
        if (['doge', 'shib', 'pepe', 'floki', 'bonk', 'wif', 'mog'].includes(coinLower)) {
            return 'Meme';
        }
        // AI tokens
        if (['render', 'tao', 'fet', 'agix', 'wld', 'arkm'].includes(coinLower)) {
            return 'AI';
        }
        // Solana ecosystem
        if (['sol', 'jto', 'jup', 'ray', 'bonk', 'wif', 'popcat'].includes(coinLower)) {
            return 'Solana';
        }
        return 'Altcoin';
    };
    MarketDataSync.prototype.categorizePolymarket = function (market) {
        var _a, _b, _c, _d;
        var question = (market.question || '').toLowerCase();
        var description = (market.description || '').toLowerCase();
        var groupCategory = ((_b = (_a = market.group) === null || _a === void 0 ? void 0 : _a.category) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
        var groupSlug = ((_d = (_c = market.group) === null || _c === void 0 ? void 0 : _c.slug) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || '';
        // Politics
        if (groupCategory.includes('politics') ||
            question.includes('trump') ||
            question.includes('biden') ||
            question.includes('election') ||
            question.includes('president') ||
            question.includes('congress') ||
            question.includes('senate') ||
            question.includes('house')) {
            return { category: 'POLITICS', subCategory: this.extractPoliticalSubcategory(question) };
        }
        // Crypto
        if (groupCategory.includes('crypto') ||
            question.includes('bitcoin') ||
            question.includes('ethereum') ||
            question.includes('etf') ||
            question.includes('sec')) {
            return { category: 'CRYPTO', subCategory: 'Markets' };
        }
        // Sports
        if (groupCategory.includes('sports') ||
            question.includes('nba') ||
            question.includes('nfl') ||
            question.includes('mlb') ||
            question.includes('fifa') ||
            question.includes('world cup') ||
            question.includes('super bowl') ||
            question.includes('championship')) {
            return { category: 'SPORTS', subCategory: this.extractSportsSubcategory(question) };
        }
        // Tech
        if (groupCategory.includes('tech') ||
            question.includes('ai') ||
            question.includes('artificial intelligence') ||
            question.includes('openai') ||
            question.includes('google') ||
            question.includes('apple')) {
            return { category: 'TECH', subCategory: 'AI & Tech' };
        }
        // Economics
        if (question.includes('fed') ||
            question.includes('interest rate') ||
            question.includes('inflation') ||
            question.includes('gdp') ||
            question.includes('recession')) {
            return { category: 'ECONOMICS', subCategory: 'Macro' };
        }
        // Pop Culture
        if (groupCategory.includes('pop culture') ||
            question.includes('oscar') ||
            question.includes('grammy') ||
            question.includes('academy') ||
            question.includes('movie') ||
            question.includes('album')) {
            return { category: 'POP_CULTURE', subCategory: 'Entertainment' };
        }
        return { category: 'GENERAL', subCategory: 'Other' };
    };
    MarketDataSync.prototype.extractPoliticalSubcategory = function (question) {
        if (question.includes('trump'))
            return 'Trump';
        if (question.includes('biden'))
            return 'Biden';
        if (question.includes('election'))
            return 'Elections';
        if (question.includes('congress') || question.includes('senate') || question.includes('house')) {
            return 'Congress';
        }
        if (question.includes('uk ') || question.includes('britain'))
            return 'UK';
        if (question.includes('france') || question.includes('macron'))
            return 'France';
        if (question.includes('germany'))
            return 'Germany';
        return 'General';
    };
    MarketDataSync.prototype.extractSportsSubcategory = function (question) {
        if (question.includes('nba'))
            return 'NBA';
        if (question.includes('nfl'))
            return 'NFL';
        if (question.includes('mlb'))
            return 'MLB';
        if (question.includes('nhl'))
            return 'NHL';
        if (question.includes('soccer') || question.includes('fifa') || question.includes('world cup')) {
            return 'Soccer';
        }
        if (question.includes('ufc') || question.includes('mma'))
            return 'MMA';
        if (question.includes('tennis'))
            return 'Tennis';
        return 'General';
    };
    MarketDataSync.prototype.calculatePriority = function (volume, type) {
        if (type === 'hyperliquid') {
            // Priority based on volume tiers
            if (volume > 1000000000)
                return 100; // $1B+
            if (volume > 500000000)
                return 90;
            if (volume > 100000000)
                return 80;
            if (volume > 50000000)
                return 70;
            if (volume > 10000000)
                return 60;
            if (volume > 1000000)
                return 50;
            return 30;
        }
        else {
            // Polymarket priority based on volume
            if (volume > 100000000)
                return 95;
            if (volume > 50000000)
                return 85;
            if (volume > 10000000)
                return 75;
            if (volume > 1000000)
                return 65;
            if (volume > 100000)
                return 50;
            return 35;
        }
    };
    MarketDataSync.prototype.generateKeywords = function (market) {
        var _a;
        var keywords = [];
        if (market.type === 'hyperliquid') {
            // Primary name
            keywords.push({ keyword: market.name.toLowerCase(), type: 'primary', weight: 2.0 });
            // Ticker
            if (market.symbol) {
                keywords.push({ keyword: market.symbol.toLowerCase(), type: 'ticker', weight: 2.5 });
            }
            // Full name expansions for common coins
            var fullNames = {
                'btc': ['bitcoin'],
                'eth': ['ethereum'],
                'sol': ['solana'],
                'ada': ['cardano'],
                'dot': ['polkadot'],
                'link': ['chainlink'],
                'uni': ['uniswap'],
                'aave': ['aave'],
                'crv': ['curve'],
                'mkr': ['maker'],
                'snx': ['synthetix'],
                'comp': ['compound'],
                'yfi': ['yearn'],
                'sushi': ['sushiswap'],
                '1inch': ['1inch'],
                'lido': ['lido'],
                'pendle': ['pendle'],
                'jup': ['jupiter'],
                'ray': ['raydium'],
                'drift': ['drift'],
                'kmno': ['kamino'],
                'jto': ['jito'],
                'render': ['render', 'rndr'],
                'tao': ['bittensor'],
                'fet': ['fetch.ai'],
                'wld': ['worldcoin'],
                'arkm': ['arkham'],
                'doge': ['dogecoin'],
                'shib': ['shiba inu'],
                'pepe': ['pepe'],
                'bonk': ['bonk'],
                'wif': ['dogwifhat'],
                'mog': ['mog'],
                'floki': ['floki'],
                'popcat': ['popcat'],
                'arb': ['arbitrum'],
                'op': ['optimism'],
                'base': ['base'],
                'mnt': ['mantle'],
                'strk': ['starknet'],
                'zk': ['zksync'],
                'avax': ['avalanche'],
                'near': ['near protocol'],
                'ftm': ['fantom'],
                'matic': ['polygon'],
                'sui': ['sui'],
                'apt': ['aptos'],
                'sei': ['sei'],
                'inj': ['injective'],
                'dydx': ['dydx'],
                'gmx': ['gmx'],
                'gns': ['gains network'],
            };
            var symbol = (_a = market.symbol) === null || _a === void 0 ? void 0 : _a.toLowerCase();
            if (symbol && fullNames[symbol]) {
                for (var _i = 0, _b = fullNames[symbol]; _i < _b.length; _i++) {
                    var name_1 = _b[_i];
                    if (name_1 !== symbol) {
                        keywords.push({ keyword: name_1, type: 'alias', weight: 1.5 });
                    }
                }
            }
        }
        else {
            // Polymarket keywords from question
            var words = market.name.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(function (w) { return w.length > 2 && !['will', 'the', 'and', 'for', 'are', 'was', 'were', 'have', 'has', 'had', 'that', 'this', 'with', 'from', 'they', 'been', 'their', 'said', 'each', 'which', 'what', 'about', 'could', 'would', 'should', 'there', 'where', 'when', 'than', 'them', 'these', 'those', 'being', 'having', 'after', 'before', 'above', 'below', 'under', 'over', 'into', 'onto', 'upon', 'within', 'without', 'through', 'during', 'until', 'while', 'because', 'since', 'until', 'although', 'unless', 'whether', 'either', 'neither', 'both', 'some', 'many', 'most', 'more', 'less', 'much', 'such', 'only', 'also', 'just', 'even', 'back', 'after', 'other', 'many', 'than', 'then', 'now', 'here', 'why', 'how', 'all', 'any', 'both', 'can', 'her', 'his', 'our', 'out', 'day', 'get', 'use', 'man', 'new', 'now', 'way', 'may', 'say', 'she', 'try', 'way', 'own', 'say', 'too', 'old', 'tell', 'very', 'when', 'come', 'here', 'show', 'every', 'good', 'me', 'give', 'our', 'under', 'name', 'very', 'through', 'just', 'form', 'sentence', 'great', 'think', 'where', 'help', 'through', 'much', 'before', 'move', 'right', 'boy', 'old', 'too', 'same', 'she', 'all', 'there', 'when', 'use', 'her', 'would', 'make', 'like', 'into', 'him', 'has', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'people', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part'].includes(w); });
            // Add important words as keywords
            for (var _c = 0, _d = words.slice(0, 10); _c < _d.length; _c++) {
                var word = _d[_c];
                keywords.push({ keyword: word, type: 'related', weight: 1.0 });
            }
            // Add full question as primary
            keywords.push({ keyword: market.name.toLowerCase(), type: 'primary', weight: 2.0 });
        }
        return keywords;
    };
    return MarketDataSync;
}());
exports.marketDataSync = new MarketDataSync();
exports.default = exports.marketDataSync;
