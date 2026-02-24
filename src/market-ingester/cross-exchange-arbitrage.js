"use strict";
/**
 * Cross-Exchange Arbitrage Detector
 * Compares funding rates pairwise across Hyperliquid, Asterdex, and Binance.
 */
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
exports.crossExchangeArbitrage = void 0;
var better_sqlite3_1 = require("better-sqlite3");
var logger_1 = require("../shared/logger");
var config_1 = require("../shared/config");
var hyperliquid_all_markets_1 = require("./hyperliquid-all-markets");
var asterdex_client_1 = require("./asterdex-client");
var binance_funding_client_1 = require("./binance-funding-client");
var CrossExchangeArbitrage = /** @class */ (function () {
    function CrossExchangeArbitrage() {
        this.opportunitiesTable = 'cross_exchange_opportunities_v2';
        this.db = null;
        this.initialized = false;
        this.exchangeOrder = ['hyperliquid', 'asterdex', 'binance'];
        this.dbPath = process.env.FUNDING_DB_PATH || './data/funding.db';
        var arbConfig = config_1.default.getSection('crossExchangeArbitrage') || {};
        this.config = {
            minSpreadThreshold: arbConfig.minSpreadThreshold || 0.0001,
            minAnnualizedSpread: arbConfig.minAnnualizedSpread || 10,
            highUrgencyThreshold: arbConfig.highUrgencyThreshold || 50,
            mediumUrgencyThreshold: arbConfig.mediumUrgencyThreshold || 25,
            priceDiffThreshold: arbConfig.priceDiffThreshold || 0.5,
            symbolsToTrack: arbConfig.symbolsToTrack || ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP'],
        };
    }
    CrossExchangeArbitrage.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.initialized)
                    return [2 /*return*/];
                try {
                    this.db = new better_sqlite3_1.default(this.dbPath);
                    this.db.pragma('journal_mode = WAL');
                    this.createTables();
                    this.initialized = true;
                    logger_1.default.info('[CrossExchangeArbitrage] Initialized successfully');
                }
                catch (error) {
                    logger_1.default.error('[CrossExchangeArbitrage] Initialization failed:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    CrossExchangeArbitrage.prototype.createTables = function () {
        if (!this.db)
            return;
        this.db.exec("\n      CREATE TABLE IF NOT EXISTS ".concat(this.opportunitiesTable, " (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        symbol TEXT NOT NULL,\n        exchangeA TEXT NOT NULL,\n        exchangeB TEXT NOT NULL,\n        exchangeAFunding REAL NOT NULL,\n        exchangeBFunding REAL NOT NULL,\n        spread REAL NOT NULL,\n        spreadPercent REAL NOT NULL,\n        annualizedSpread REAL NOT NULL,\n        recommendedAction TEXT,\n        longExchange TEXT,\n        shortExchange TEXT,\n        estimatedYearlyYield REAL,\n        urgency TEXT CHECK(urgency IN ('high', 'medium', 'low')),\n        timestamp INTEGER NOT NULL,\n        isActive INTEGER DEFAULT 1,\n        exchangeAMarkPrice REAL DEFAULT 0,\n        exchangeBMarkPrice REAL DEFAULT 0,\n        priceDiffPercent REAL DEFAULT 0,\n        confidence REAL DEFAULT 100\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_symbol\n        ON ").concat(this.opportunitiesTable, "(symbol);\n      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_active\n        ON ").concat(this.opportunitiesTable, "(isActive);\n      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_timestamp\n        ON ").concat(this.opportunitiesTable, "(timestamp);\n      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_spread\n        ON ").concat(this.opportunitiesTable, "(annualizedSpread);\n      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_urgency\n        ON ").concat(this.opportunitiesTable, "(urgency);\n      CREATE INDEX IF NOT EXISTS idx_cross_exchange_v2_pair\n        ON ").concat(this.opportunitiesTable, "(exchangeA, exchangeB);\n    "));
        this.db.exec("\n      CREATE TABLE IF NOT EXISTS exchange_status (\n        exchange TEXT PRIMARY KEY,\n        connected INTEGER DEFAULT 0,\n        lastUpdate INTEGER DEFAULT 0,\n        symbols TEXT,\n        errorMessage TEXT\n      );\n    ");
        logger_1.default.info('[CrossExchangeArbitrage] Database tables created');
    };
    CrossExchangeArbitrage.prototype.scanForOpportunities = function () {
        return __awaiter(this, void 0, void 0, function () {
            var timestamp, _a, hlMap, asterMap, binanceMap, fundingBook_1, allSymbols, _i, _b, ex, _c, _d, symbol, opportunities, _loop_1, this_1, _e, allSymbols_1, symbol, error_1;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _f.sent();
                        _f.label = 2;
                    case 2:
                        _f.trys.push([2, 6, , 7]);
                        timestamp = Date.now();
                        logger_1.default.info('[CrossExchangeArbitrage] Starting cross-exchange scan...');
                        return [4 /*yield*/, Promise.all([
                                this.fetchHyperliquidData(),
                                this.fetchAsterdexData(),
                                this.fetchBinanceData(),
                            ])];
                    case 3:
                        _a = _f.sent(), hlMap = _a[0], asterMap = _a[1], binanceMap = _a[2];
                        this.updateExchangeStatus('hyperliquid', hlMap.size > 0, __spreadArray([], hlMap.keys(), true));
                        this.updateExchangeStatus('asterdex', asterMap.size > 0, __spreadArray([], asterMap.keys(), true));
                        this.updateExchangeStatus('binance', binanceMap.size > 0, __spreadArray([], binanceMap.keys(), true));
                        fundingBook_1 = {
                            hyperliquid: hlMap,
                            asterdex: asterMap,
                            binance: binanceMap,
                        };
                        allSymbols = new Set();
                        for (_i = 0, _b = this.exchangeOrder; _i < _b.length; _i++) {
                            ex = _b[_i];
                            for (_c = 0, _d = fundingBook_1[ex].keys(); _c < _d.length; _c++) {
                                symbol = _d[_c];
                                allSymbols.add(symbol);
                            }
                        }
                        opportunities = [];
                        _loop_1 = function (symbol) {
                            var availableExchanges = this_1.exchangeOrder.filter(function (ex) { return fundingBook_1[ex].has(symbol); });
                            if (availableExchanges.length < 2)
                                return "continue";
                            for (var i = 0; i < availableExchanges.length; i++) {
                                for (var j = i + 1; j < availableExchanges.length; j++) {
                                    var exchangeA = availableExchanges[i];
                                    var exchangeB = availableExchanges[j];
                                    var dataA = fundingBook_1[exchangeA].get(symbol);
                                    var dataB = fundingBook_1[exchangeB].get(symbol);
                                    if (!dataA || !dataB)
                                        continue;
                                    var opportunity = this_1.calculateOpportunity(symbol, exchangeA, dataA, exchangeB, dataB, timestamp);
                                    if (opportunity) {
                                        opportunities.push(opportunity);
                                    }
                                }
                            }
                        };
                        this_1 = this;
                        for (_e = 0, allSymbols_1 = allSymbols; _e < allSymbols_1.length; _e++) {
                            symbol = allSymbols_1[_e];
                            _loop_1(symbol);
                        }
                        if (!(opportunities.length > 0)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.storeOpportunities(opportunities)];
                    case 4:
                        _f.sent();
                        _f.label = 5;
                    case 5:
                        this.deactivateOldOpportunities(timestamp);
                        logger_1.default.info("[CrossExchangeArbitrage] Found ".concat(opportunities.length, " cross-exchange opportunities"));
                        return [2 /*return*/, opportunities.sort(function (a, b) { return Math.abs(b.annualizedSpread) - Math.abs(a.annualizedSpread); })];
                    case 6:
                        error_1 = _f.sent();
                        logger_1.default.error('[CrossExchangeArbitrage] Failed to scan for opportunities:', error_1);
                        throw error_1;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.fetchHyperliquidData = function () {
        return __awaiter(this, void 0, void 0, function () {
            var markets, map, _i, markets_1, market, symbol, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, hyperliquid_all_markets_1.default.getAllMarkets()];
                    case 1:
                        markets = (_a.sent()).markets;
                        map = new Map();
                        for (_i = 0, markets_1 = markets; _i < markets_1.length; _i++) {
                            market = markets_1[_i];
                            symbol = String(market.coin || '').toUpperCase();
                            if (!symbol)
                                continue;
                            map.set(symbol, {
                                symbol: symbol,
                                fundingRate: Number(market.fundingRate || 0),
                                markPrice: Number(market.markPx || market.markPrice || 0),
                                volume24h: Number(market.volume24h || 0),
                                timestamp: Date.now(),
                            });
                        }
                        return [2 /*return*/, map];
                    case 2:
                        error_2 = _a.sent();
                        logger_1.default.error('[CrossExchangeArbitrage] Failed to fetch Hyperliquid data:', error_2);
                        return [2 /*return*/, new Map()];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.fetchAsterdexData = function () {
        return __awaiter(this, void 0, void 0, function () {
            var rates, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, asterdex_client_1.default.getFundingRates()];
                    case 1:
                        rates = _a.sent();
                        return [2 /*return*/, this.mapAsterdexFundingRates(rates)];
                    case 2:
                        error_3 = _a.sent();
                        logger_1.default.error('[CrossExchangeArbitrage] Failed to fetch Asterdex data:', error_3);
                        return [2 /*return*/, new Map()];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.fetchBinanceData = function () {
        return __awaiter(this, void 0, void 0, function () {
            var rates, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, binance_funding_client_1.default.getFundingRates()];
                    case 1:
                        rates = _a.sent();
                        return [2 /*return*/, this.mapBinanceFundingRates(rates)];
                    case 2:
                        error_4 = _a.sent();
                        logger_1.default.error('[CrossExchangeArbitrage] Failed to fetch Binance data:', error_4);
                        return [2 /*return*/, new Map()];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.mapAsterdexFundingRates = function (rates) {
        var map = new Map();
        for (var _i = 0, rates_1 = rates; _i < rates_1.length; _i++) {
            var rate = rates_1[_i];
            var symbol = this.normalizeSymbol(rate.symbol);
            if (!symbol)
                continue;
            map.set(symbol, {
                symbol: symbol,
                fundingRate: Number(rate.fundingRate || 0),
                markPrice: Number(rate.markPrice || 0),
                volume24h: Number(rate.volume24h || 0),
                timestamp: Number(rate.timestamp || Date.now()),
            });
        }
        return map;
    };
    CrossExchangeArbitrage.prototype.mapBinanceFundingRates = function (rates) {
        var map = new Map();
        for (var _i = 0, rates_2 = rates; _i < rates_2.length; _i++) {
            var rate = rates_2[_i];
            var symbol = this.normalizeSymbol(rate.symbol);
            if (!symbol)
                continue;
            map.set(symbol, {
                symbol: symbol,
                fundingRate: Number(rate.fundingRate || 0),
                markPrice: Number(rate.markPrice || 0),
                volume24h: Number(rate.volume24h || 0),
                timestamp: Number(rate.timestamp || Date.now()),
            });
        }
        return map;
    };
    CrossExchangeArbitrage.prototype.normalizeSymbol = function (raw) {
        var symbol = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!symbol)
            return '';
        var suffixes = ['USDT', 'USD', 'USDC', 'FDUSD', 'BUSD'];
        for (var _i = 0, suffixes_1 = suffixes; _i < suffixes_1.length; _i++) {
            var suffix = suffixes_1[_i];
            if (symbol.endsWith(suffix) && symbol.length > suffix.length) {
                return symbol.slice(0, -suffix.length);
            }
        }
        return symbol;
    };
    CrossExchangeArbitrage.prototype.calculateOpportunity = function (symbol, exchangeA, dataA, exchangeB, dataB, timestamp) {
        var spread = dataA.fundingRate - dataB.fundingRate;
        var spreadPercent = Math.abs(spread) * 100;
        var annualizedSpread = this.calculateAnnualizedSpread(spread);
        if (Math.abs(spread) < this.config.minSpreadThreshold) {
            return null;
        }
        if (Math.abs(annualizedSpread) < this.config.minAnnualizedSpread) {
            return null;
        }
        var priceDiffPercent = 0;
        if (dataA.markPrice > 0 && dataB.markPrice > 0) {
            var avgPrice = (dataA.markPrice + dataB.markPrice) / 2;
            if (avgPrice > 0) {
                priceDiffPercent = Math.abs(dataA.markPrice - dataB.markPrice) / avgPrice * 100;
            }
        }
        if (priceDiffPercent > this.config.priceDiffThreshold) {
            return null;
        }
        var shortExchange = spread > 0 ? exchangeA : exchangeB;
        var longExchange = spread > 0 ? exchangeB : exchangeA;
        var recommendedAction = "short_".concat(shortExchange, "_long_").concat(longExchange);
        var urgency = 'low';
        var absAnnualized = Math.abs(annualizedSpread);
        if (absAnnualized >= this.config.highUrgencyThreshold)
            urgency = 'high';
        else if (absAnnualized >= this.config.mediumUrgencyThreshold)
            urgency = 'medium';
        var confidence = 100;
        if (priceDiffPercent > 0.1)
            confidence -= 10;
        if (priceDiffPercent > 0.3)
            confidence -= 15;
        if (dataA.volume24h > 0 && dataA.volume24h < 1000000)
            confidence -= 10;
        if (dataB.volume24h > 0 && dataB.volume24h < 1000000)
            confidence -= 10;
        if (dataA.markPrice <= 0 || dataB.markPrice <= 0)
            confidence -= 15;
        var now = Date.now();
        if (now - dataA.timestamp > 5 * 60 * 1000)
            confidence -= 10;
        if (now - dataB.timestamp > 5 * 60 * 1000)
            confidence -= 10;
        return {
            symbol: symbol,
            exchangeA: exchangeA,
            exchangeB: exchangeB,
            exchangeAFunding: dataA.fundingRate,
            exchangeBFunding: dataB.fundingRate,
            spread: spread,
            spreadPercent: spreadPercent,
            annualizedSpread: annualizedSpread,
            recommendedAction: recommendedAction,
            longExchange: longExchange,
            shortExchange: shortExchange,
            estimatedYearlyYield: absAnnualized,
            urgency: urgency,
            timestamp: timestamp,
            isActive: true,
            exchangeAMarkPrice: dataA.markPrice,
            exchangeBMarkPrice: dataB.markPrice,
            priceDiffPercent: priceDiffPercent,
            confidence: Math.max(0, confidence),
        };
    };
    CrossExchangeArbitrage.prototype.calculateAnnualizedSpread = function (spread) {
        return spread * 3 * 365 * 100;
    };
    CrossExchangeArbitrage.prototype.storeOpportunities = function (opportunities) {
        return __awaiter(this, void 0, void 0, function () {
            var deactivateForPair, insert, txn;
            return __generator(this, function (_a) {
                if (!this.db || opportunities.length === 0)
                    return [2 /*return*/];
                deactivateForPair = this.db.prepare("\n      UPDATE ".concat(this.opportunitiesTable, "\n      SET isActive = 0\n      WHERE symbol = ? AND exchangeA = ? AND exchangeB = ? AND isActive = 1\n    "));
                insert = this.db.prepare("\n      INSERT INTO ".concat(this.opportunitiesTable, "\n      (symbol, exchangeA, exchangeB, exchangeAFunding, exchangeBFunding, spread, spreadPercent,\n       annualizedSpread, recommendedAction, longExchange, shortExchange, estimatedYearlyYield,\n       urgency, timestamp, isActive, exchangeAMarkPrice, exchangeBMarkPrice, priceDiffPercent, confidence)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)\n    "));
                txn = this.db.transaction(function (ops) {
                    for (var _i = 0, ops_1 = ops; _i < ops_1.length; _i++) {
                        var opp = ops_1[_i];
                        deactivateForPair.run(opp.symbol, opp.exchangeA, opp.exchangeB);
                        insert.run(opp.symbol, opp.exchangeA, opp.exchangeB, opp.exchangeAFunding, opp.exchangeBFunding, opp.spread, opp.spreadPercent, opp.annualizedSpread, opp.recommendedAction, opp.longExchange, opp.shortExchange, opp.estimatedYearlyYield, opp.urgency, opp.timestamp, opp.exchangeAMarkPrice, opp.exchangeBMarkPrice, opp.priceDiffPercent, opp.confidence);
                    }
                });
                txn(opportunities);
                logger_1.default.info("[CrossExchangeArbitrage] Stored ".concat(opportunities.length, " opportunities"));
                return [2 /*return*/];
            });
        });
    };
    CrossExchangeArbitrage.prototype.deactivateOldOpportunities = function (currentTimestamp) {
        if (!this.db)
            return;
        var cutoffTime = currentTimestamp - (30 * 60 * 1000);
        var result = this.db.prepare("\n      UPDATE ".concat(this.opportunitiesTable, "\n      SET isActive = 0\n      WHERE isActive = 1 AND timestamp < ?\n    ")).run(cutoffTime);
        if (result.changes > 0) {
            logger_1.default.info("[CrossExchangeArbitrage] Deactivated ".concat(result.changes, " old opportunities"));
        }
    };
    CrossExchangeArbitrage.prototype.updateExchangeStatus = function (exchange, connected, symbols) {
        if (!this.db)
            return;
        this.db.prepare("\n      INSERT INTO exchange_status (exchange, connected, lastUpdate, symbols)\n      VALUES (?, ?, ?, ?)\n      ON CONFLICT(exchange) DO UPDATE SET\n        connected = excluded.connected,\n        lastUpdate = excluded.lastUpdate,\n        symbols = excluded.symbols\n    ").run(exchange, connected ? 1 : 0, Date.now(), JSON.stringify(symbols));
    };
    CrossExchangeArbitrage.prototype.getActiveOpportunities = function (minSpread) {
        return __awaiter(this, void 0, void 0, function () {
            var query, params, rows;
            var _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        try {
                            if (!this.db)
                                return [2 /*return*/, []];
                            query = "\n        SELECT *\n        FROM ".concat(this.opportunitiesTable, "\n        WHERE isActive = 1\n      ");
                            params = [];
                            if (minSpread !== undefined) {
                                query += ' AND ABS(annualizedSpread) >= ?';
                                params.push(minSpread);
                            }
                            query += ' ORDER BY ABS(annualizedSpread) DESC';
                            rows = (_a = this.db.prepare(query)).all.apply(_a, params);
                            return [2 /*return*/, rows.map(function (row) { return _this.mapRowToOpportunity(row); })];
                        }
                        catch (error) {
                            logger_1.default.error('[CrossExchangeArbitrage] Failed to get active opportunities:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.getOpportunitiesByUrgency = function (urgency) {
        return __awaiter(this, void 0, void 0, function () {
            var rows;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        try {
                            if (!this.db)
                                return [2 /*return*/, []];
                            rows = this.db.prepare("\n        SELECT *\n        FROM ".concat(this.opportunitiesTable, "\n        WHERE isActive = 1 AND urgency = ?\n        ORDER BY ABS(annualizedSpread) DESC\n      ")).all(urgency);
                            return [2 /*return*/, rows.map(function (row) { return _this.mapRowToOpportunity(row); })];
                        }
                        catch (error) {
                            logger_1.default.error('[CrossExchangeArbitrage] Failed to get opportunities by urgency:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.getOpportunityBySymbol = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        try {
                            if (!this.db)
                                return [2 /*return*/, null];
                            row = this.db.prepare("\n        SELECT *\n        FROM ".concat(this.opportunitiesTable, "\n        WHERE symbol = ? AND isActive = 1\n        ORDER BY ABS(annualizedSpread) DESC, timestamp DESC\n        LIMIT 1\n      ")).get(symbol.toUpperCase());
                            if (!row)
                                return [2 /*return*/, null];
                            return [2 /*return*/, this.mapRowToOpportunity(row)];
                        }
                        catch (error) {
                            logger_1.default.error("[CrossExchangeArbitrage] Failed to get opportunity for ".concat(symbol, ":"), error);
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.getExchangeInfo = function () {
        return __awaiter(this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        try {
                            if (!this.db)
                                return [2 /*return*/, []];
                            rows = this.db.prepare('SELECT * FROM exchange_status').all();
                            return [2 /*return*/, rows.map(function (row) { return ({
                                    name: row.exchange,
                                    connected: row.connected === 1,
                                    lastUpdate: row.lastUpdate,
                                    symbols: row.symbols ? JSON.parse(row.symbols) : [],
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[CrossExchangeArbitrage] Failed to get exchange info:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.getStatistics = function () {
        return __awaiter(this, void 0, void 0, function () {
            var total, high, medium, low, bestRow, avg, connected;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        try {
                            if (!this.db) {
                                return [2 /*return*/, {
                                        totalOpportunities: 0,
                                        highUrgencyCount: 0,
                                        mediumUrgencyCount: 0,
                                        lowUrgencyCount: 0,
                                        bestSpread: null,
                                        avgSpread: 0,
                                        connectedExchanges: 0,
                                    }];
                            }
                            total = this.db.prepare("\n        SELECT COUNT(*) as count FROM ".concat(this.opportunitiesTable, " WHERE isActive = 1\n      ")).get();
                            high = this.db.prepare("\n        SELECT COUNT(*) as count FROM ".concat(this.opportunitiesTable, " WHERE isActive = 1 AND urgency = 'high'\n      ")).get();
                            medium = this.db.prepare("\n        SELECT COUNT(*) as count FROM ".concat(this.opportunitiesTable, " WHERE isActive = 1 AND urgency = 'medium'\n      ")).get();
                            low = this.db.prepare("\n        SELECT COUNT(*) as count FROM ".concat(this.opportunitiesTable, " WHERE isActive = 1 AND urgency = 'low'\n      ")).get();
                            bestRow = this.db.prepare("\n        SELECT symbol, exchangeA, exchangeB, ABS(annualizedSpread) as spread\n        FROM ".concat(this.opportunitiesTable, "\n        WHERE isActive = 1\n        ORDER BY ABS(annualizedSpread) DESC\n        LIMIT 1\n      ")).get();
                            avg = this.db.prepare("\n        SELECT AVG(ABS(annualizedSpread)) as avg\n        FROM ".concat(this.opportunitiesTable, "\n        WHERE isActive = 1\n      ")).get();
                            connected = this.db.prepare("\n        SELECT COUNT(*) as count FROM exchange_status WHERE connected = 1\n      ").get();
                            return [2 /*return*/, {
                                    totalOpportunities: total.count,
                                    highUrgencyCount: high.count,
                                    mediumUrgencyCount: medium.count,
                                    lowUrgencyCount: low.count,
                                    bestSpread: bestRow ? { symbol: "".concat(bestRow.symbol, " (").concat(bestRow.exchangeA, "/").concat(bestRow.exchangeB, ")"), spread: bestRow.spread } : null,
                                    avgSpread: (avg === null || avg === void 0 ? void 0 : avg.avg) || 0,
                                    connectedExchanges: connected.count,
                                }];
                        }
                        catch (error) {
                            logger_1.default.error('[CrossExchangeArbitrage] Failed to get statistics:', error);
                            return [2 /*return*/, {
                                    totalOpportunities: 0,
                                    highUrgencyCount: 0,
                                    mediumUrgencyCount: 0,
                                    lowUrgencyCount: 0,
                                    bestSpread: null,
                                    avgSpread: 0,
                                    connectedExchanges: 0,
                                }];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.getHistoricalOpportunities = function (symbol_1) {
        return __awaiter(this, arguments, void 0, function (symbol, hours) {
            var cutoffTime, rows;
            var _this = this;
            if (hours === void 0) { hours = 24; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        try {
                            if (!this.db)
                                return [2 /*return*/, []];
                            cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
                            rows = this.db.prepare("\n        SELECT *\n        FROM ".concat(this.opportunitiesTable, "\n        WHERE symbol = ? AND timestamp >= ?\n        ORDER BY timestamp DESC\n      ")).all(symbol.toUpperCase(), cutoffTime);
                            return [2 /*return*/, rows.map(function (row) { return _this.mapRowToOpportunity(row); })];
                        }
                        catch (error) {
                            logger_1.default.error("[CrossExchangeArbitrage] Failed to get historical opportunities for ".concat(symbol, ":"), error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    CrossExchangeArbitrage.prototype.updateConfig = function (newConfig) {
        this.config = __assign(__assign({}, this.config), newConfig);
        logger_1.default.info('[CrossExchangeArbitrage] Configuration updated');
    };
    CrossExchangeArbitrage.prototype.cleanupOldData = function () {
        return __awaiter(this, arguments, void 0, function (days) {
            var cutoffTime, result;
            if (days === void 0) { days = 7; }
            return __generator(this, function (_a) {
                if (!this.db)
                    return [2 /*return*/];
                try {
                    cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
                    result = this.db.prepare("\n        DELETE FROM ".concat(this.opportunitiesTable, "\n        WHERE timestamp < ?\n      ")).run(cutoffTime);
                    logger_1.default.info("[CrossExchangeArbitrage] Cleaned up ".concat(result.changes, " old records"));
                }
                catch (error) {
                    logger_1.default.error('[CrossExchangeArbitrage] Cleanup failed:', error);
                }
                return [2 /*return*/];
            });
        });
    };
    CrossExchangeArbitrage.prototype.mapRowToOpportunity = function (row) {
        return {
            id: row.id,
            symbol: row.symbol,
            exchangeA: row.exchangeA,
            exchangeB: row.exchangeB,
            exchangeAFunding: row.exchangeAFunding,
            exchangeBFunding: row.exchangeBFunding,
            spread: row.spread,
            spreadPercent: row.spreadPercent,
            annualizedSpread: row.annualizedSpread,
            recommendedAction: row.recommendedAction,
            longExchange: row.longExchange,
            shortExchange: row.shortExchange,
            estimatedYearlyYield: row.estimatedYearlyYield,
            urgency: row.urgency,
            timestamp: row.timestamp,
            isActive: row.isActive === 1,
            exchangeAMarkPrice: row.exchangeAMarkPrice,
            exchangeBMarkPrice: row.exchangeBMarkPrice,
            priceDiffPercent: row.priceDiffPercent,
            confidence: row.confidence,
        };
    };
    return CrossExchangeArbitrage;
}());
exports.crossExchangeArbitrage = new CrossExchangeArbitrage();
exports.default = exports.crossExchangeArbitrage;
