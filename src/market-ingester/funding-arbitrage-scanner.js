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
exports.fundingArbitrageScanner = void 0;
var better_sqlite3_1 = require("better-sqlite3");
var logger_1 = require("../shared/logger");
var hyperliquid_all_markets_1 = require("./hyperliquid-all-markets");
var cross_exchange_arbitrage_1 = require("./cross-exchange-arbitrage");
var FundingArbitrageScanner = /** @class */ (function () {
    function FundingArbitrageScanner() {
        this.db = null;
        this.initialized = false;
        this.fundingHistory = new Map();
        this.maxHistoryLength = 100;
        this.FUNDING_PERIODS_PER_DAY = 3; // Hyperliquid pays funding 3x daily
        this.DAYS_PER_YEAR = 365;
        this.dbPath = process.env.FUNDING_DB_PATH || './data/funding.db';
    }
    FundingArbitrageScanner.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.initialized)
                    return [2 /*return*/];
                try {
                    this.db = new better_sqlite3_1.default(this.dbPath);
                    this.db.pragma('journal_mode = WAL');
                    this.createTables();
                    this.initialized = true;
                    logger_1.default.info('[FundingArbitrageScanner] Initialized successfully');
                }
                catch (error) {
                    logger_1.default.error('[FundingArbitrageScanner] Initialization failed:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    FundingArbitrageScanner.prototype.createTables = function () {
        if (!this.db)
            return;
        // Funding rates table - tracks all funding rates over time
        this.db.exec("\n      CREATE TABLE IF NOT EXISTS funding_rates (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        symbol TEXT NOT NULL,\n        timestamp INTEGER NOT NULL,\n        fundingRate REAL NOT NULL,\n        nextFundingTime INTEGER NOT NULL,\n        annualizedRate REAL NOT NULL,\n        rank INTEGER,\n        trend TEXT CHECK(trend IN ('increasing', 'decreasing', 'stable')),\n        opportunityScore REAL DEFAULT 0,\n        volume24h REAL DEFAULT 0,\n        markPrice REAL DEFAULT 0,\n        openInterest REAL DEFAULT 0\n      );\n\n      CREATE UNIQUE INDEX IF NOT EXISTS idx_funding_symbol_time \n        ON funding_rates(symbol, timestamp);\n      CREATE INDEX IF NOT EXISTS idx_funding_timestamp \n        ON funding_rates(timestamp);\n      CREATE INDEX IF NOT EXISTS idx_funding_symbol \n        ON funding_rates(symbol);\n      CREATE INDEX IF NOT EXISTS idx_funding_rate \n        ON funding_rates(fundingRate);\n      CREATE INDEX IF NOT EXISTS idx_funding_annualized \n        ON funding_rates(annualizedRate);\n    ");
        // Arbitrage opportunities table - stores detected opportunities
        this.db.exec("\n      CREATE TABLE IF NOT EXISTS funding_opportunities (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        symbol TEXT NOT NULL,\n        type TEXT CHECK(type IN ('long', 'short')) NOT NULL,\n        currentFunding REAL NOT NULL,\n        annualizedRate REAL NOT NULL,\n        opportunityScore REAL NOT NULL,\n        reason TEXT,\n        urgency TEXT CHECK(urgency IN ('high', 'medium', 'low')),\n        timestamp INTEGER NOT NULL,\n        isActive INTEGER DEFAULT 1,\n        alerted INTEGER DEFAULT 0\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_opportunities_symbol \n        ON funding_opportunities(symbol);\n      CREATE INDEX IF NOT EXISTS idx_opportunities_active \n        ON funding_opportunities(isActive);\n      CREATE INDEX IF NOT EXISTS idx_opportunities_timestamp \n        ON funding_opportunities(timestamp);\n      CREATE INDEX IF NOT EXISTS idx_opportunities_score \n        ON funding_opportunities(opportunityScore);\n    ");
        // Similar assets comparison table
        this.db.exec("\n      CREATE TABLE IF NOT EXISTS funding_comparisons (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        symbol1 TEXT NOT NULL,\n        symbol2 TEXT NOT NULL,\n        fundingDiff REAL NOT NULL,\n        annualizedDiff REAL NOT NULL,\n        correlation TEXT,\n        timestamp INTEGER NOT NULL\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_comparisons_timestamp \n        ON funding_comparisons(timestamp);\n    ");
        logger_1.default.info('[FundingArbitrageScanner] Database tables created');
    };
    /**
     * Calculate annualized funding rate from hourly rate
     * Hyperliquid: funding paid 3 times per day (every 8 hours)
     * Annualized = fundingRate * 3 * 365
     */
    FundingArbitrageScanner.prototype.calculateAnnualizedRate = function (fundingRate) {
        return fundingRate * this.FUNDING_PERIODS_PER_DAY * this.DAYS_PER_YEAR;
    };
    /**
     * Calculate funding rate trend based on recent history
     */
    FundingArbitrageScanner.prototype.calculateTrend = function (symbol, currentRate) {
        var history = this.fundingHistory.get(symbol) || [];
        if (history.length < 3)
            return 'stable';
        // Look at last 3 periods
        var recent = history.slice(-3);
        var avg = recent.reduce(function (sum, h) { return sum + h.fundingRate; }, 0) / recent.length;
        var diff = currentRate - avg;
        var threshold = Math.abs(avg) * 0.1; // 10% of current value
        if (diff > threshold)
            return 'increasing';
        if (diff < -threshold)
            return 'decreasing';
        return 'stable';
    };
    /**
     * Calculate opportunity score (0-100)
     * Higher = better opportunity
     */
    FundingArbitrageScanner.prototype.calculateOpportunityScore = function (fundingRate, volume24h, trend) {
        var annualized = this.calculateAnnualizedRate(fundingRate);
        var absAnnualized = Math.abs(annualized);
        // Base score from annualized rate (up to 60 points)
        var score = Math.min(absAnnualized / 100 * 60, 60);
        // Volume factor (up to 20 points) - higher volume = more liquid = better
        var volumeScore = Math.min(Math.log10(volume24h + 1) / 10 * 20, 20);
        score += volumeScore;
        // Trend factor (up to 20 points)
        // If funding is getting more extreme, that's better for arb
        if (trend === 'increasing' && fundingRate > 0) {
            score += 20; // Getting more positive - good for shorting
        }
        else if (trend === 'decreasing' && fundingRate < 0) {
            score += 20; // Getting more negative - good for longing
        }
        else if (trend === 'stable') {
            score += 10; // Stable is okay
        }
        return Math.min(Math.max(score, 0), 100);
    };
    /**
     * Scan all markets for funding rate data
     */
    FundingArbitrageScanner.prototype.scanAllFundingRates = function () {
        return __awaiter(this, void 0, void 0, function () {
            var timestamp, markets, fundingRates, _i, markets_1, market, trend, annualizedRate, opportunityScore, history_1, sorted, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 6]);
                        timestamp = Date.now();
                        return [4 /*yield*/, hyperliquid_all_markets_1.default.getAllMarkets()];
                    case 3:
                        markets = (_a.sent()).markets;
                        if (!markets || markets.length === 0) {
                            logger_1.default.warn('[FundingArbitrageScanner] No markets found');
                            return [2 /*return*/, []];
                        }
                        fundingRates = [];
                        for (_i = 0, markets_1 = markets; _i < markets_1.length; _i++) {
                            market = markets_1[_i];
                            trend = this.calculateTrend(market.coin, market.fundingRate);
                            annualizedRate = this.calculateAnnualizedRate(market.fundingRate);
                            opportunityScore = this.calculateOpportunityScore(market.fundingRate, market.volume24h, trend);
                            fundingRates.push({
                                symbol: market.coin,
                                timestamp: timestamp,
                                fundingRate: market.fundingRate,
                                nextFundingTime: timestamp + (8 * 60 * 60 * 1000), // 8 hours from now
                                annualizedRate: annualizedRate,
                                rank: 0, // Will be set after sorting
                                trend: trend,
                                opportunityScore: opportunityScore,
                                volume24h: market.volume24h,
                                markPrice: market.markPx,
                                openInterest: market.openInterest,
                            });
                            // Update history
                            if (!this.fundingHistory.has(market.coin)) {
                                this.fundingHistory.set(market.coin, []);
                            }
                            history_1 = this.fundingHistory.get(market.coin);
                            history_1.push({ timestamp: timestamp, fundingRate: market.fundingRate, annualizedRate: annualizedRate });
                            if (history_1.length > this.maxHistoryLength) {
                                history_1.shift();
                            }
                        }
                        sorted = __spreadArray([], fundingRates, true).sort(function (a, b) {
                            return Math.abs(b.annualizedRate) - Math.abs(a.annualizedRate);
                        });
                        sorted.forEach(function (rate, index) {
                            rate.rank = index + 1;
                        });
                        // Store in database
                        return [4 /*yield*/, this.storeFundingRates(fundingRates)];
                    case 4:
                        // Store in database
                        _a.sent();
                        logger_1.default.info("[FundingArbitrageScanner] Scanned ".concat(fundingRates.length, " markets for funding rates"));
                        return [2 /*return*/, fundingRates];
                    case 5:
                        error_1 = _a.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Failed to scan funding rates:', error_1);
                        throw error_1;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Store funding rates in database
     */
    FundingArbitrageScanner.prototype.storeFundingRates = function (rates) {
        return __awaiter(this, void 0, void 0, function () {
            var insert, txn;
            return __generator(this, function (_a) {
                if (!this.db)
                    return [2 /*return*/];
                insert = this.db.prepare("\n      INSERT OR REPLACE INTO funding_rates \n      (symbol, timestamp, fundingRate, nextFundingTime, annualizedRate, rank, trend, opportunityScore, volume24h, markPrice, openInterest)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ");
                txn = this.db.transaction(function (rates) {
                    for (var _i = 0, rates_1 = rates; _i < rates_1.length; _i++) {
                        var rate = rates_1[_i];
                        insert.run(rate.symbol, rate.timestamp, rate.fundingRate, rate.nextFundingTime, rate.annualizedRate, rate.rank, rate.trend, rate.opportunityScore, rate.volume24h, rate.markPrice, rate.openInterest);
                    }
                });
                txn(rates);
                return [2 /*return*/];
            });
        });
    };
    /**
     * Identify funding arbitrage opportunities
     */
    FundingArbitrageScanner.prototype.identifyOpportunities = function () {
        return __awaiter(this, arguments, void 0, function (extremeThreshold // 50% APR
        ) {
            var timestamp, fundingRates, opportunities, _i, fundingRates_1, rate, absAnnualized, opportunity, error_2;
            if (extremeThreshold === void 0) { extremeThreshold = 0.5; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 6]);
                        timestamp = Date.now();
                        return [4 /*yield*/, this.scanAllFundingRates()];
                    case 3:
                        fundingRates = _a.sent();
                        opportunities = [];
                        for (_i = 0, fundingRates_1 = fundingRates; _i < fundingRates_1.length; _i++) {
                            rate = fundingRates_1[_i];
                            absAnnualized = Math.abs(rate.annualizedRate);
                            // Skip if below threshold
                            if (absAnnualized < extremeThreshold * 100)
                                continue;
                            opportunity = null;
                            if (rate.annualizedRate > extremeThreshold * 100) {
                                // Positive funding - opportunity to short (get paid)
                                opportunity = {
                                    symbol: rate.symbol,
                                    type: 'short',
                                    currentFunding: rate.fundingRate,
                                    annualizedRate: rate.annualizedRate,
                                    opportunityScore: rate.opportunityScore,
                                    reason: "High positive funding (".concat(rate.annualizedRate.toFixed(2), "% APR). Short to collect funding payments."),
                                    urgency: rate.annualizedRate > 100 ? 'high' : rate.annualizedRate > 75 ? 'medium' : 'low',
                                    timestamp: timestamp,
                                };
                            }
                            else if (rate.annualizedRate < -extremeThreshold * 100) {
                                // Negative funding - opportunity to long (get paid)
                                opportunity = {
                                    symbol: rate.symbol,
                                    type: 'long',
                                    currentFunding: rate.fundingRate,
                                    annualizedRate: rate.annualizedRate,
                                    opportunityScore: rate.opportunityScore,
                                    reason: "High negative funding (".concat(rate.annualizedRate.toFixed(2), "% APR). Long to collect funding payments."),
                                    urgency: rate.annualizedRate < -100 ? 'high' : rate.annualizedRate < -75 ? 'medium' : 'low',
                                    timestamp: timestamp,
                                };
                            }
                            if (opportunity) {
                                opportunities.push(opportunity);
                            }
                        }
                        // Store opportunities
                        return [4 /*yield*/, this.storeOpportunities(opportunities)];
                    case 4:
                        // Store opportunities
                        _a.sent();
                        logger_1.default.info("[FundingArbitrageScanner] Identified ".concat(opportunities.length, " opportunities"));
                        return [2 /*return*/, opportunities.sort(function (a, b) { return b.opportunityScore - a.opportunityScore; })];
                    case 5:
                        error_2 = _a.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Failed to identify opportunities:', error_2);
                        throw error_2;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Store opportunities in database
     */
    FundingArbitrageScanner.prototype.storeOpportunities = function (opportunities) {
        return __awaiter(this, void 0, void 0, function () {
            var insert, txn;
            return __generator(this, function (_a) {
                if (!this.db)
                    return [2 /*return*/];
                insert = this.db.prepare("\n      INSERT INTO funding_opportunities \n      (symbol, type, currentFunding, annualizedRate, opportunityScore, reason, urgency, timestamp, isActive, alerted)\n      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)\n    ");
                txn = this.db.transaction(function (ops) {
                    for (var _i = 0, ops_1 = ops; _i < ops_1.length; _i++) {
                        var opp = ops_1[_i];
                        insert.run(opp.symbol, opp.type, opp.currentFunding, opp.annualizedRate, opp.opportunityScore, opp.reason, opp.urgency, opp.timestamp);
                    }
                });
                txn(opportunities);
                return [2 /*return*/];
            });
        });
    };
    /**
     * Compare funding rates between similar assets
     */
    FundingArbitrageScanner.prototype.compareSimilarAssets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var markets, categories, timestamp, comparisons_1, _i, _a, _b, category, categoryMarkets, i, j, m1, m2, fundingDiff, annualizedDiff, insert_1, txn, error_3;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _c.sent();
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, hyperliquid_all_markets_1.default.getAllMarkets()];
                    case 3:
                        markets = (_c.sent()).markets;
                        categories = hyperliquid_all_markets_1.default.getMarketsByCategory(markets);
                        timestamp = Date.now();
                        comparisons_1 = [];
                        for (_i = 0, _a = Object.entries(categories); _i < _a.length; _i++) {
                            _b = _a[_i], category = _b[0], categoryMarkets = _b[1];
                            if (categoryMarkets.length < 2)
                                continue;
                            // Compare all pairs in the category
                            for (i = 0; i < categoryMarkets.length; i++) {
                                for (j = i + 1; j < categoryMarkets.length; j++) {
                                    m1 = categoryMarkets[i];
                                    m2 = categoryMarkets[j];
                                    fundingDiff = m1.fundingRate - m2.fundingRate;
                                    annualizedDiff = this.calculateAnnualizedRate(fundingDiff);
                                    // Only store significant differences (>10% APR)
                                    if (Math.abs(annualizedDiff) > 10) {
                                        comparisons_1.push({
                                            symbol1: m1.coin,
                                            symbol2: m2.coin,
                                            fundingDiff: fundingDiff,
                                            annualizedDiff: annualizedDiff,
                                            correlation: category,
                                            timestamp: timestamp,
                                        });
                                    }
                                }
                            }
                        }
                        // Store comparisons
                        if (comparisons_1.length > 0 && this.db) {
                            insert_1 = this.db.prepare("\n          INSERT INTO funding_comparisons \n          (symbol1, symbol2, fundingDiff, annualizedDiff, correlation, timestamp)\n          VALUES (?, ?, ?, ?, ?, ?)\n        ");
                            txn = this.db.transaction(function (comps) {
                                for (var _i = 0, comps_1 = comps; _i < comps_1.length; _i++) {
                                    var comp = comps_1[_i];
                                    insert_1.run(comp.symbol1, comp.symbol2, comp.fundingDiff, comp.annualizedDiff, comp.correlation, comp.timestamp);
                                }
                            });
                            txn(comparisons_1);
                        }
                        logger_1.default.info("[FundingArbitrageScanner] Compared ".concat(comparisons_1.length, " asset pairs"));
                        return [3 /*break*/, 5];
                    case 4:
                        error_3 = _c.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Failed to compare assets:', error_3);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get current funding stats
     */
    FundingArbitrageScanner.prototype.getFundingStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var fundingRates, sortedByRate, bestLong, bestShort, averageFunding, extremeThreshold_1, extremeMarkets, positiveCount, negativeCount, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.scanAllFundingRates()];
                    case 3:
                        fundingRates = _a.sent();
                        if (fundingRates.length === 0) {
                            return [2 /*return*/, {
                                    bestLongFunding: null,
                                    bestShortFunding: null,
                                    averageFunding: 0,
                                    extremeMarketsCount: 0,
                                    totalMarkets: 0,
                                    positiveFundingCount: 0,
                                    negativeFundingCount: 0,
                                    timestamp: Date.now(),
                                }];
                        }
                        sortedByRate = __spreadArray([], fundingRates, true).sort(function (a, b) { return a.annualizedRate - b.annualizedRate; });
                        bestLong = sortedByRate[0];
                        bestShort = sortedByRate[sortedByRate.length - 1];
                        averageFunding = fundingRates.reduce(function (sum, r) { return sum + r.annualizedRate; }, 0) / fundingRates.length;
                        extremeThreshold_1 = 30;
                        extremeMarkets = fundingRates.filter(function (r) { return Math.abs(r.annualizedRate) > extremeThreshold_1; });
                        positiveCount = fundingRates.filter(function (r) { return r.annualizedRate > 0; }).length;
                        negativeCount = fundingRates.filter(function (r) { return r.annualizedRate < 0; }).length;
                        return [2 /*return*/, {
                                bestLongFunding: bestLong ? { symbol: bestLong.symbol, rate: bestLong.annualizedRate } : null,
                                bestShortFunding: bestShort ? { symbol: bestShort.symbol, rate: bestShort.annualizedRate } : null,
                                averageFunding: averageFunding,
                                extremeMarketsCount: extremeMarkets.length,
                                totalMarkets: fundingRates.length,
                                positiveFundingCount: positiveCount,
                                negativeFundingCount: negativeCount,
                                timestamp: Date.now(),
                            }];
                    case 4:
                        error_4 = _a.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Failed to get funding stats:', error_4);
                        throw error_4;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get historical funding data for a symbol
     */
    FundingArbitrageScanner.prototype.getFundingHistory = function (symbol_1) {
        return __awaiter(this, arguments, void 0, function (symbol, hours) {
            var cutoffTime, rows;
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
                            rows = this.db.prepare("\n        SELECT timestamp, fundingRate, annualizedRate\n        FROM funding_rates\n        WHERE symbol = ? AND timestamp >= ?\n        ORDER BY timestamp ASC\n      ").all(symbol, cutoffTime);
                            return [2 /*return*/, rows.map(function (r) { return ({
                                    timestamp: r.timestamp,
                                    fundingRate: r.fundingRate,
                                    annualizedRate: r.annualizedRate,
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error("[FundingArbitrageScanner] Failed to get history for ".concat(symbol, ":"), error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get all current funding rates
     */
    FundingArbitrageScanner.prototype.getAllCurrentRates = function () {
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
                            rows = this.db.prepare("\n        SELECT f.*\n        FROM funding_rates f\n        INNER JOIN (\n          SELECT symbol, MAX(timestamp) as max_ts\n          FROM funding_rates\n          GROUP BY symbol\n        ) latest ON f.symbol = latest.symbol AND f.timestamp = latest.max_ts\n        ORDER BY ABS(f.annualizedRate) DESC\n      ").all();
                            return [2 /*return*/, rows.map(function (r) { return ({
                                    symbol: r.symbol,
                                    timestamp: r.timestamp,
                                    fundingRate: r.fundingRate,
                                    nextFundingTime: r.nextFundingTime,
                                    annualizedRate: r.annualizedRate,
                                    rank: r.rank,
                                    trend: r.trend,
                                    opportunityScore: r.opportunityScore,
                                    volume24h: r.volume24h,
                                    markPrice: r.markPrice,
                                    openInterest: r.openInterest,
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[FundingArbitrageScanner] Failed to get current rates:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get top arbitrage opportunities
     */
    FundingArbitrageScanner.prototype.getTopOpportunities = function () {
        return __awaiter(this, arguments, void 0, function (limit) {
            var rows;
            if (limit === void 0) { limit = 20; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        try {
                            if (!this.db)
                                return [2 /*return*/, []];
                            rows = this.db.prepare("\n        SELECT *\n        FROM funding_opportunities\n        WHERE isActive = 1\n        ORDER BY opportunityScore DESC\n        LIMIT ?\n      ").all(limit);
                            return [2 /*return*/, rows.map(function (r) { return ({
                                    symbol: r.symbol,
                                    type: r.type,
                                    currentFunding: r.currentFunding,
                                    annualizedRate: r.annualizedRate,
                                    opportunityScore: r.opportunityScore,
                                    reason: r.reason,
                                    urgency: r.urgency,
                                    timestamp: r.timestamp,
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[FundingArbitrageScanner] Failed to get top opportunities:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Mark opportunities as alerted
     */
    FundingArbitrageScanner.prototype.markAlerted = function (symbols) {
        return __awaiter(this, void 0, void 0, function () {
            var placeholders;
            var _a;
            return __generator(this, function (_b) {
                if (!this.db || symbols.length === 0)
                    return [2 /*return*/];
                try {
                    placeholders = symbols.map(function () { return '?'; }).join(',');
                    (_a = this.db.prepare("\n        UPDATE funding_opportunities\n        SET alerted = 1\n        WHERE symbol IN (".concat(placeholders, ") AND isActive = 1\n      "))).run.apply(_a, symbols);
                }
                catch (error) {
                    logger_1.default.error('[FundingArbitrageScanner] Failed to mark alerted:', error);
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Clean up old data
     */
    FundingArbitrageScanner.prototype.cleanupOldData = function () {
        return __awaiter(this, arguments, void 0, function (days) {
            var cutoffTime, fundingResult, oppResult, compResult;
            if (days === void 0) { days = 7; }
            return __generator(this, function (_a) {
                if (!this.db)
                    return [2 /*return*/];
                try {
                    cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
                    fundingResult = this.db.prepare('DELETE FROM funding_rates WHERE timestamp < ?').run(cutoffTime);
                    oppResult = this.db.prepare('UPDATE funding_opportunities SET isActive = 0 WHERE timestamp < ?').run(cutoffTime);
                    compResult = this.db.prepare('DELETE FROM funding_comparisons WHERE timestamp < ?').run(cutoffTime);
                    logger_1.default.info("[FundingArbitrageScanner] Cleanup: ".concat(fundingResult.changes, " funding rates, ").concat(oppResult.changes, " opportunities, ").concat(compResult.changes, " comparisons"));
                }
                catch (error) {
                    logger_1.default.error('[FundingArbitrageScanner] Cleanup failed:', error);
                }
                return [2 /*return*/];
            });
        });
    };
    // ==========================================
    // CROSS-EXCHANGE ARBITRAGE METHODS
    // ==========================================
    /**
     * Scan for cross-exchange funding rate arbitrage opportunities
     * Compares Hyperliquid vs Asterdex funding rates
     */
    FundingArbitrageScanner.prototype.scanCrossExchangeArbitrage = function () {
        return __awaiter(this, void 0, void 0, function () {
            var opportunities, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        logger_1.default.info('[FundingArbitrageScanner] Starting cross-exchange arbitrage scan...');
                        return [4 /*yield*/, cross_exchange_arbitrage_1.default.scanForOpportunities()];
                    case 3:
                        opportunities = _a.sent();
                        logger_1.default.info("[FundingArbitrageScanner] Cross-exchange scan complete: ".concat(opportunities.length, " opportunities"));
                        return [2 /*return*/, opportunities];
                    case 4:
                        error_5 = _a.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Cross-exchange scan failed:', error_5);
                        throw error_5;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get active cross-exchange arbitrage opportunities
     */
    FundingArbitrageScanner.prototype.getCrossExchangeOpportunities = function (minSpread) {
        return __awaiter(this, void 0, void 0, function () {
            var error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, cross_exchange_arbitrage_1.default.getActiveOpportunities(minSpread)];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        error_6 = _a.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Failed to get cross-exchange opportunities:', error_6);
                        return [2 /*return*/, []];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get cross-exchange opportunities by urgency level
     */
    FundingArbitrageScanner.prototype.getCrossExchangeOpportunitiesByUrgency = function (urgency) {
        return __awaiter(this, void 0, void 0, function () {
            var error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, cross_exchange_arbitrage_1.default.getOpportunitiesByUrgency(urgency)];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        error_7 = _a.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Failed to get cross-exchange opportunities by urgency:', error_7);
                        return [2 /*return*/, []];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get cross-exchange opportunity for a specific symbol
     */
    FundingArbitrageScanner.prototype.getCrossExchangeOpportunity = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, cross_exchange_arbitrage_1.default.getOpportunityBySymbol(symbol)];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        error_8 = _a.sent();
                        logger_1.default.error("[FundingArbitrageScanner] Failed to get cross-exchange opportunity for ".concat(symbol, ":"), error_8);
                        return [2 /*return*/, null];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get connected exchanges information
     */
    FundingArbitrageScanner.prototype.getExchangeInfo = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, cross_exchange_arbitrage_1.default.getExchangeInfo()];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        error_9 = _a.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Failed to get exchange info:', error_9);
                        return [2 /*return*/, []];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get cross-exchange arbitrage statistics
     */
    FundingArbitrageScanner.prototype.getCrossExchangeStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_10;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, cross_exchange_arbitrage_1.default.getStatistics()];
                    case 3: return [2 /*return*/, _a.sent()];
                    case 4:
                        error_10 = _a.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Failed to get cross-exchange stats:', error_10);
                        return [2 /*return*/, {
                                totalOpportunities: 0,
                                highUrgencyCount: 0,
                                mediumUrgencyCount: 0,
                                lowUrgencyCount: 0,
                                bestSpread: null,
                                avgSpread: 0,
                                connectedExchanges: 0,
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run complete funding arbitrage scan (single-exchange + cross-exchange)
     */
    FundingArbitrageScanner.prototype.runCompleteScan = function () {
        return __awaiter(this, void 0, void 0, function () {
            var timestamp, _a, singleExchange, crossExchange, error_11;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        timestamp = Date.now();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, Promise.all([
                                this.identifyOpportunities(),
                                this.scanCrossExchangeArbitrage(),
                            ])];
                    case 3:
                        _a = _b.sent(), singleExchange = _a[0], crossExchange = _a[1];
                        logger_1.default.info("[FundingArbitrageScanner] Complete scan finished: ".concat(singleExchange.length, " single-exchange, ").concat(crossExchange.length, " cross-exchange opportunities"));
                        return [2 /*return*/, {
                                singleExchangeOpportunities: singleExchange.length,
                                crossExchangeOpportunities: crossExchange.length,
                                timestamp: timestamp,
                            }];
                    case 4:
                        error_11 = _b.sent();
                        logger_1.default.error('[FundingArbitrageScanner] Complete scan failed:', error_11);
                        throw error_11;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return FundingArbitrageScanner;
}());
exports.fundingArbitrageScanner = new FundingArbitrageScanner();
exports.default = exports.fundingArbitrageScanner;
