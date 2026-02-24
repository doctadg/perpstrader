"use strict";
// Funding Arbitrage API Routes
// Express routes for funding rate data and arbitrage opportunities
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
var express_1 = require("express");
var funding_arbitrage_scanner_1 = require("../market-ingester/funding-arbitrage-scanner");
var hyperliquid_all_markets_1 = require("../market-ingester/hyperliquid-all-markets");
var logger_1 = require("../shared/logger");
var router = (0, express_1.Router)();
var initialized = false;
function ensureInitialized() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (initialized)
                        return [2 /*return*/];
                    return [4 /*yield*/, funding_arbitrage_scanner_1.default.initialize()];
                case 1:
                    _a.sent();
                    initialized = true;
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * GET /api/funding/rates
 * Get all current funding rates
 * Query params:
 *   - sort: 'rate' | 'opportunity' | 'trend'
 *   - minApr: minimum annualized rate
 *   - maxApr: maximum annualized rate
 *   - limit: max results
 */
router.get('/rates', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, sort, minApr_1, maxApr_1, limit, rates, trendOrder_1, error_1;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _c.sent();
                _a = req.query, _b = _a.sort, sort = _b === void 0 ? 'rate' : _b, minApr_1 = _a.minApr, maxApr_1 = _a.maxApr, limit = _a.limit;
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.getAllCurrentRates()];
            case 2:
                rates = _c.sent();
                // Apply filters
                if (minApr_1 !== undefined) {
                    rates = rates.filter(function (r) { return r.annualizedRate >= parseFloat(minApr_1); });
                }
                if (maxApr_1 !== undefined) {
                    rates = rates.filter(function (r) { return r.annualizedRate <= parseFloat(maxApr_1); });
                }
                // Apply sorting
                switch (sort) {
                    case 'opportunity':
                        rates.sort(function (a, b) { return b.opportunityScore - a.opportunityScore; });
                        break;
                    case 'trend':
                        trendOrder_1 = { increasing: 0, stable: 1, decreasing: 2 };
                        rates.sort(function (a, b) { return trendOrder_1[a.trend] - trendOrder_1[b.trend]; });
                        break;
                    case 'rate':
                    default:
                        rates.sort(function (a, b) { return Math.abs(b.annualizedRate) - Math.abs(a.annualizedRate); });
                        break;
                }
                // Apply limit
                if (limit) {
                    rates = rates.slice(0, parseInt(limit));
                }
                res.json({
                    success: true,
                    count: rates.length,
                    rates: rates,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_1 = _c.sent();
                logger_1.default.error('[FundingAPI] Failed to get rates:', error_1);
                res.status(500).json({
                    success: false,
                    error: error_1 instanceof Error ? error_1.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/opportunities
 * Get top arbitrage opportunities
 * Query params:
 *   - threshold: minimum APR for extreme funding (default: 50)
 *   - limit: max results (default: 20)
 */
router.get('/opportunities', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, threshold, _c, limit, opportunities, limited, error_2;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _d.sent();
                _a = req.query, _b = _a.threshold, threshold = _b === void 0 ? '50' : _b, _c = _a.limit, limit = _c === void 0 ? '20' : _c;
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.identifyOpportunities(parseFloat(threshold) / 100)];
            case 2:
                opportunities = _d.sent();
                limited = opportunities.slice(0, parseInt(limit));
                res.json({
                    success: true,
                    count: limited.length,
                    opportunities: limited,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_2 = _d.sent();
                logger_1.default.error('[FundingAPI] Failed to get opportunities:', error_2);
                res.status(500).json({
                    success: false,
                    error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/history/:symbol
 * Get historical funding data for a symbol
 * Query params:
 *   - hours: number of hours of history (default: 24)
 */
router.get('/history/:symbol', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, _a, hours, history_1, error_3;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _b.sent();
                symbol = req.params.symbol;
                _a = req.query.hours, hours = _a === void 0 ? '24' : _a;
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.getFundingHistory(symbol.toUpperCase(), parseInt(hours))];
            case 2:
                history_1 = _b.sent();
                res.json({
                    success: true,
                    symbol: symbol.toUpperCase(),
                    count: history_1.length,
                    history: history_1,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_3 = _b.sent();
                logger_1.default.error("[FundingAPI] Failed to get history for ".concat(req.params.symbol, ":"), error_3);
                res.status(500).json({
                    success: false,
                    error: error_3 instanceof Error ? error_3.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/stats
 * Get summary statistics
 */
router.get('/stats', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var stats, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.getFundingStats()];
            case 2:
                stats = _a.sent();
                res.json({
                    success: true,
                    stats: stats,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_4 = _a.sent();
                logger_1.default.error('[FundingAPI] Failed to get stats:', error_4);
                res.status(500).json({
                    success: false,
                    error: error_4 instanceof Error ? error_4.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/compare
 * Compare funding rates between similar assets
 */
router.get('/compare', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.compareSimilarAssets()];
            case 2:
                _a.sent();
                res.json({
                    success: true,
                    message: 'Comparison completed',
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_5 = _a.sent();
                logger_1.default.error('[FundingAPI] Failed to compare assets:', error_5);
                res.status(500).json({
                    success: false,
                    error: error_5 instanceof Error ? error_5.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * POST /api/funding/refresh
 * Trigger manual refresh of funding data
 */
router.post('/refresh', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var rates, opportunities, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, , 5]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                logger_1.default.info('[FundingAPI] Manual refresh triggered');
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.scanAllFundingRates()];
            case 2:
                rates = _a.sent();
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.identifyOpportunities()];
            case 3:
                opportunities = _a.sent();
                res.json({
                    success: true,
                    ratesCount: rates.length,
                    opportunitiesCount: opportunities.length,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 5];
            case 4:
                error_6 = _a.sent();
                logger_1.default.error('[FundingAPI] Refresh failed:', error_6);
                res.status(500).json({
                    success: false,
                    error: error_6 instanceof Error ? error_6.message : 'Unknown error',
                });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/alert
 * Check for extreme funding events that should trigger alerts
 * Query params:
 *   - threshold: minimum APR for alerts (default: 100)
 */
router.get('/alert', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, threshold, minApr_2, rates, alerts, error_7;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _b.sent();
                _a = req.query.threshold, threshold = _a === void 0 ? '100' : _a;
                minApr_2 = parseFloat(threshold);
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.getAllCurrentRates()];
            case 2:
                rates = _b.sent();
                alerts = rates.filter(function (r) {
                    return Math.abs(r.annualizedRate) >= minApr_2;
                }).map(function (r) { return ({
                    symbol: r.symbol,
                    type: r.annualizedRate > 0 ? 'short' : 'long',
                    annualizedRate: r.annualizedRate,
                    urgency: Math.abs(r.annualizedRate) > 200 ? 'high' :
                        Math.abs(r.annualizedRate) > 150 ? 'medium' : 'low',
                    message: r.annualizedRate > 0
                        ? "".concat(r.symbol, " has extreme positive funding (").concat(r.annualizedRate.toFixed(2), "% APR). Consider shorting.")
                        : "".concat(r.symbol, " has extreme negative funding (").concat(r.annualizedRate.toFixed(2), "% APR). Consider longing."),
                }); });
                res.json({
                    success: true,
                    alertCount: alerts.length,
                    alerts: alerts,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_7 = _b.sent();
                logger_1.default.error('[FundingAPI] Alert check failed:', error_7);
                res.status(500).json({
                    success: false,
                    error: error_7 instanceof Error ? error_7.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ==========================================
// CROSS-EXCHANGE ARBITRAGE ROUTES
// ==========================================
/**
 * GET /api/funding/cross-exchange
 * Get cross-exchange arbitrage opportunities (pairwise across Hyperliquid, Asterdex, Binance)
 * Query params:
 *   - minSpread: minimum annualized spread percentage (default: 10)
 *   - urgency: filter by urgency level ('high', 'medium', 'low')
 *   - limit: max results (default: 50)
 */
router.get('/cross-exchange', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, minSpread, urgency_1, _c, limit, _d, refresh, minSpreadValue, staleThresholdMs, opportunities, forceRefresh, isStale, limited, error_8;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _e.trys.push([0, 6, , 7]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _e.sent();
                _a = req.query, _b = _a.minSpread, minSpread = _b === void 0 ? '10' : _b, urgency_1 = _a.urgency, _c = _a.limit, limit = _c === void 0 ? '50' : _c, _d = _a.refresh, refresh = _d === void 0 ? 'false' : _d;
                minSpreadValue = parseFloat(minSpread);
                staleThresholdMs = 3 * 60 * 1000;
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.getCrossExchangeOpportunities(minSpreadValue)];
            case 2:
                opportunities = _e.sent();
                forceRefresh = refresh === 'true';
                isStale = opportunities.length > 0
                    ? Date.now() - opportunities[0].timestamp > staleThresholdMs
                    : false;
                if (!(forceRefresh || opportunities.length === 0 || isStale)) return [3 /*break*/, 5];
                logger_1.default.info("[FundingAPI] Running live cross-exchange scan (force=".concat(forceRefresh, ", empty=").concat(opportunities.length === 0, ", stale=").concat(isStale, ")"));
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.scanCrossExchangeArbitrage()];
            case 3:
                _e.sent();
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.getCrossExchangeOpportunities(minSpreadValue)];
            case 4:
                opportunities = _e.sent();
                _e.label = 5;
            case 5:
                // Filter by urgency if specified
                if (urgency_1) {
                    opportunities = opportunities.filter(function (o) { return o.urgency === urgency_1; });
                }
                limited = opportunities.slice(0, parseInt(limit));
                res.json({
                    success: true,
                    count: limited.length,
                    opportunities: limited,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 7];
            case 6:
                error_8 = _e.sent();
                logger_1.default.error('[FundingAPI] Failed to get cross-exchange opportunities:', error_8);
                res.status(500).json({
                    success: false,
                    error: error_8 instanceof Error ? error_8.message : 'Unknown error',
                });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/cross-exchange/stats
 * Get cross-exchange arbitrage statistics
 */
router.get('/cross-exchange/stats', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var stats, error_9;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.getCrossExchangeStats()];
            case 2:
                stats = _a.sent();
                res.json({
                    success: true,
                    stats: stats,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_9 = _a.sent();
                logger_1.default.error('[FundingAPI] Failed to get cross-exchange stats:', error_9);
                res.status(500).json({
                    success: false,
                    error: error_9 instanceof Error ? error_9.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/cross-exchange/:symbol
 * Get cross-exchange opportunity for a specific symbol
 */
router.get('/cross-exchange/:symbol', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, opportunity, error_10;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                symbol = req.params.symbol;
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.getCrossExchangeOpportunity(symbol.toUpperCase())];
            case 2:
                opportunity = _a.sent();
                if (!opportunity) {
                    return [2 /*return*/, res.status(404).json({
                            success: false,
                            error: "No cross-exchange opportunity found for ".concat(symbol.toUpperCase()),
                        })];
                }
                res.json({
                    success: true,
                    opportunity: opportunity,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_10 = _a.sent();
                logger_1.default.error("[FundingAPI] Failed to get cross-exchange opportunity for ".concat(req.params.symbol, ":"), error_10);
                res.status(500).json({
                    success: false,
                    error: error_10 instanceof Error ? error_10.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/exchanges
 * Get status of connected exchanges
 */
router.get('/exchanges', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var exchanges, error_11;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.getExchangeInfo()];
            case 2:
                exchanges = _a.sent();
                res.json({
                    success: true,
                    exchanges: exchanges,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_11 = _a.sent();
                logger_1.default.error('[FundingAPI] Failed to get exchange info:', error_11);
                res.status(500).json({
                    success: false,
                    error: error_11 instanceof Error ? error_11.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * POST /api/funding/cross-exchange/scan
 * Trigger manual cross-exchange arbitrage scan
 */
router.post('/cross-exchange/scan', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var opportunities, error_12;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                logger_1.default.info('[FundingAPI] Manual cross-exchange scan triggered');
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.scanCrossExchangeArbitrage()];
            case 2:
                opportunities = _a.sent();
                res.json({
                    success: true,
                    count: opportunities.length,
                    opportunities: opportunities,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_12 = _a.sent();
                logger_1.default.error('[FundingAPI] Cross-exchange scan failed:', error_12);
                res.status(500).json({
                    success: false,
                    error: error_12 instanceof Error ? error_12.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * POST /api/funding/refresh-all
 * Trigger complete scan (single-exchange + cross-exchange)
 */
router.post('/refresh-all', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var result, error_13;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                logger_1.default.info('[FundingAPI] Complete refresh triggered');
                return [4 /*yield*/, funding_arbitrage_scanner_1.default.runCompleteScan()];
            case 2:
                result = _a.sent();
                res.json(__assign({ success: true }, result));
                return [3 /*break*/, 4];
            case 3:
                error_13 = _a.sent();
                logger_1.default.error('[FundingAPI] Complete refresh failed:', error_13);
                res.status(500).json({
                    success: false,
                    error: error_13 instanceof Error ? error_13.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ==========================================
// LIVE HYPERLIQUID FUNDING ROUTES
// ==========================================
/**
 * GET /api/funding/hyperliquid/live
 * Get live funding rates directly from Hyperliquid API (all 228+ markets)
 * Query params:
 *   - sort: 'volume' | 'funding' | 'apr'
 *   - limit: max results (default: 50)
 *   - category: filter by category (Layer 1, Layer 2, DeFi, Meme, AI, etc.)
 */
router.get('/hyperliquid/live', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, sort, _c, limit, category, _d, markets, count, filtered, categories, limited, rates, error_14;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _e.trys.push([0, 2, , 3]);
                _a = req.query, _b = _a.sort, sort = _b === void 0 ? 'volume' : _b, _c = _a.limit, limit = _c === void 0 ? '50' : _c, category = _a.category;
                logger_1.default.info('[FundingAPI] Fetching live Hyperliquid funding rates...');
                return [4 /*yield*/, hyperliquid_all_markets_1.default.fetchAllMarkets()];
            case 1:
                _d = _e.sent(), markets = _d.markets, count = _d.count;
                filtered = markets;
                // Filter by category if specified
                if (category) {
                    categories = hyperliquid_all_markets_1.default.getMarketsByCategory(markets);
                    filtered = categories[category] || [];
                }
                // Apply sorting
                switch (sort) {
                    case 'funding':
                        filtered.sort(function (a, b) { return Math.abs(b.fundingRate) - Math.abs(a.fundingRate); });
                        break;
                    case 'apr':
                        filtered.sort(function (a, b) { return Math.abs(b.fundingRate * 3 * 365) - Math.abs(a.fundingRate * 3 * 365); });
                        break;
                    case 'volume':
                    default:
                        filtered.sort(function (a, b) { return b.volume24h - a.volume24h; });
                        break;
                }
                limited = filtered.slice(0, parseInt(limit));
                rates = limited.map(function (m) { return ({
                    symbol: m.coin,
                    fundingRate: m.fundingRate,
                    annualizedRate: m.fundingRate * 3 * 365 * 100, // Convert to percentage
                    markPrice: m.markPrice,
                    volume24h: m.volume24h,
                    openInterest: m.openInterest,
                    category: hyperliquid_all_markets_1.default.getMarketsByCategory([m]),
                }); });
                res.json({
                    success: true,
                    count: rates.length,
                    totalMarkets: count,
                    rates: rates,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 3];
            case 2:
                error_14 = _e.sent();
                logger_1.default.error('[FundingAPI] Failed to get live Hyperliquid rates:', error_14);
                res.status(500).json({
                    success: false,
                    error: error_14 instanceof Error ? error_14.message : 'Unknown error',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/hyperliquid/extreme
 * Get markets with extreme funding rates (best opportunities)
 * Query params:
 *   - threshold: minimum absolute funding rate (default: 0.01%)
 *   - limit: max results per side (default: 20)
 */
router.get('/hyperliquid/extreme', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, threshold, _c, limit, minThreshold, _d, positive, negative, formatMarket_1, error_15;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _e.trys.push([0, 2, , 3]);
                _a = req.query, _b = _a.threshold, threshold = _b === void 0 ? '0.0001' : _b, _c = _a.limit, limit = _c === void 0 ? '20' : _c;
                minThreshold = parseFloat(threshold);
                logger_1.default.info('[FundingAPI] Fetching extreme funding opportunities...');
                return [4 /*yield*/, hyperliquid_all_markets_1.default.getExtremeFundingMarkets(minThreshold)];
            case 1:
                _d = _e.sent(), positive = _d.positive, negative = _d.negative;
                formatMarket_1 = function (m, type) { return ({
                    symbol: m.coin,
                    fundingRate: m.fundingRate,
                    annualizedRate: m.fundingRate * 3 * 365 * 100,
                    markPrice: m.markPrice,
                    volume24h: m.volume24h,
                    openInterest: m.openInterest,
                    recommendation: type === 'long' ? 'Long (negative funding = get paid)' : 'Short (positive funding = get paid)',
                }); };
                res.json({
                    success: true,
                    longOpportunities: negative.slice(0, parseInt(limit)).map(function (m) { return formatMarket_1(m, 'long'); }),
                    shortOpportunities: positive.slice(0, parseInt(limit)).map(function (m) { return formatMarket_1(m, 'short'); }),
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 3];
            case 2:
                error_15 = _e.sent();
                logger_1.default.error('[FundingAPI] Failed to get extreme funding rates:', error_15);
                res.status(500).json({
                    success: false,
                    error: error_15 instanceof Error ? error_15.message : 'Unknown error',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/funding/hyperliquid/categories
 * Get markets grouped by category
 */
router.get('/hyperliquid/categories', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var markets, categories, result, _i, _a, _b, cat, catMarkets, error_16;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 2, , 3]);
                logger_1.default.info('[FundingAPI] Fetching markets by category...');
                return [4 /*yield*/, hyperliquid_all_markets_1.default.fetchAllMarkets()];
            case 1:
                markets = (_c.sent()).markets;
                categories = hyperliquid_all_markets_1.default.getMarketsByCategory(markets);
                result = {};
                for (_i = 0, _a = Object.entries(categories); _i < _a.length; _i++) {
                    _b = _a[_i], cat = _b[0], catMarkets = _b[1];
                    if (catMarkets.length > 0) {
                        result[cat] = {
                            count: catMarkets.length,
                            topMarkets: catMarkets
                                .sort(function (a, b) { return b.volume24h - a.volume24h; })
                                .slice(0, 5)
                                .map(function (m) { return ({
                                symbol: m.coin,
                                fundingRate: m.fundingRate,
                                annualizedRate: m.fundingRate * 3 * 365 * 100,
                                volume24h: m.volume24h,
                            }); }),
                        };
                    }
                }
                res.json({
                    success: true,
                    categories: result,
                    timestamp: Date.now(),
                });
                return [3 /*break*/, 3];
            case 2:
                error_16 = _c.sent();
                logger_1.default.error('[FundingAPI] Failed to get categories:', error_16);
                res.status(500).json({
                    success: false,
                    error: error_16 instanceof Error ? error_16.message : 'Unknown error',
                });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
exports.default = router;
