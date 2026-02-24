"use strict";
// Market Heatmap API Routes
// Express routes for market-based heatmap data
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
var market_data_sync_1 = require("../shared/market-data-sync");
var market_mention_extractor_1 = require("../shared/market-mention-extractor");
var market_heat_calculator_1 = require("../shared/market-heat-calculator");
var logger_1 = require("../shared/logger");
var router = (0, express_1.Router)();
// Initialize services
var initialized = false;
function ensureInitialized() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (initialized)
                        return [2 /*return*/];
                    return [4 /*yield*/, Promise.all([
                            market_data_sync_1.default.initialize(),
                            market_mention_extractor_1.default.initialize(),
                            market_heat_calculator_1.default.initialize(),
                        ])];
                case 1:
                    _a.sent();
                    initialized = true;
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * GET /api/heatmap/markets
 * Get all active markets with optional filtering
 */
router.get('/markets', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, type_1, category_1, _b, active, markets, error_1;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _c.sent();
                _a = req.query, type_1 = _a.type, category_1 = _a.category, _b = _a.active, active = _b === void 0 ? 'true' : _b;
                return [4 /*yield*/, market_data_sync_1.default.getActiveMarkets()];
            case 2:
                markets = _c.sent();
                // Apply filters
                if (type_1) {
                    markets = markets.filter(function (m) { return m.type === type_1; });
                }
                if (category_1) {
                    markets = markets.filter(function (m) { return m.category === category_1; });
                }
                if (active === 'false') {
                    // Return all markets including inactive
                    // For now, getActiveMarkets only returns active ones
                }
                res.json({
                    success: true,
                    count: markets.length,
                    markets: markets,
                });
                return [3 /*break*/, 4];
            case 3:
                error_1 = _c.sent();
                logger_1.default.error('[HeatmapAPI] Failed to get markets:', error_1);
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
 * POST /api/heatmap/sync
 * Trigger market data sync from Hyperliquid and Polymarket
 */
router.post('/sync', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var result, deactivated, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, , 5]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                logger_1.default.info('[HeatmapAPI] Starting market data sync...');
                return [4 /*yield*/, market_data_sync_1.default.syncAllMarkets()];
            case 2:
                result = _a.sent();
                return [4 /*yield*/, market_data_sync_1.default.deactivateStaleMarkets(24)];
            case 3:
                deactivated = _a.sent();
                res.json({
                    success: true,
                    synced: result,
                    deactivated: deactivated,
                    timestamp: new Date().toISOString(),
                });
                return [3 /*break*/, 5];
            case 4:
                error_2 = _a.sent();
                logger_1.default.error('[HeatmapAPI] Market sync failed:', error_2);
                res.status(500).json({
                    success: false,
                    error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/heatmap/bubbles
 * Get bubble map data
 * X-axis: Market categories, Y-axis: Volume/Activity,
 * Bubble size: Article count, Color: Sentiment
 */
router.get('/bubbles', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, category, _b, minHeat, heatData, bubbles, error_3;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _c.sent();
                _a = req.query, category = _a.category, _b = _a.minHeat, minHeat = _b === void 0 ? '0' : _b;
                return [4 /*yield*/, market_heat_calculator_1.default.getHeatSnapshot(category, parseFloat(minHeat))];
            case 2:
                heatData = _c.sent();
                bubbles = heatData.map(function (h) { return ({
                    id: h.marketId,
                    name: h.marketName,
                    type: h.marketType,
                    category: h.category,
                    x: h.category, // X-axis: category
                    y: h.heatScore, // Y-axis: heat score
                    volume: 0, // Would need to fetch from markets table
                    size: Math.sqrt(h.articleCount) * 5 + 10, // Bubble size based on article count
                    color: h.avgSentiment > 0.2 ? '#00ff9d' : // Positive = green
                        h.avgSentiment < -0.2 ? '#ff3e3e' : // Negative = red
                            '#ffb300', // Neutral = amber
                    sentiment: h.avgSentiment,
                    articleCount: h.articleCount,
                    mentionCount: h.mentionCount,
                    trendDirection: h.trendDirection,
                    velocity: h.velocity,
                }); });
                res.json({
                    success: true,
                    count: bubbles.length,
                    bubbles: bubbles,
                    timestamp: new Date().toISOString(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_3 = _c.sent();
                logger_1.default.error('[HeatmapAPI] Failed to get bubble data:', error_3);
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
 * GET /api/heatmap/grid
 * Get heatmap grid data
 * Rows: Markets, Columns: Time periods (1h, 4h, 24h)
 * Cell color intensity: Article volume + sentiment
 */
router.get('/grid', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, periods, periodTypes, gridData, error_4;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _b.sent();
                _a = req.query.periods, periods = _a === void 0 ? '1h,4h,24h' : _a;
                periodTypes = periods.split(',');
                return [4 /*yield*/, market_heat_calculator_1.default.getHeatGridData(periodTypes)];
            case 2:
                gridData = _b.sent();
                res.json({
                    success: true,
                    count: gridData.length,
                    periods: periodTypes,
                    grid: gridData,
                    timestamp: new Date().toISOString(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_4 = _b.sent();
                logger_1.default.error('[HeatmapAPI] Failed to get grid data:', error_4);
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
 * GET /api/heatmap/market/:marketId
 * Get detailed heat data for a specific market
 */
router.get('/market/:marketId', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var marketId_1, _a, _b, history_1, _c, periods, snapshot, marketData, result, _d, _e, error_5;
    return __generator(this, function (_f) {
        switch (_f.label) {
            case 0:
                _f.trys.push([0, 6, , 7]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _f.sent();
                marketId_1 = req.params.marketId;
                _a = req.query, _b = _a.history, history_1 = _b === void 0 ? 'false' : _b, _c = _a.periods, periods = _c === void 0 ? '30' : _c;
                return [4 /*yield*/, market_heat_calculator_1.default.getHeatSnapshot()];
            case 2:
                snapshot = _f.sent();
                marketData = snapshot.find(function (m) { return m.marketId === marketId_1; });
                if (!marketData) {
                    res.status(404).json({
                        success: false,
                        error: 'Market not found',
                    });
                    return [2 /*return*/];
                }
                result = __assign({}, marketData);
                if (!(history_1 === 'true')) return [3 /*break*/, 4];
                _d = result;
                return [4 /*yield*/, market_heat_calculator_1.default.getHeatHistory(marketId_1, '24h', parseInt(periods))];
            case 3:
                _d.history = _f.sent();
                _f.label = 4;
            case 4:
                // Get recent mentions
                _e = result;
                return [4 /*yield*/, market_mention_extractor_1.default.getMentionsForMarket(marketId_1, 24, 30)];
            case 5:
                // Get recent mentions
                _e.recentMentions = _f.sent();
                res.json({
                    success: true,
                    market: result,
                });
                return [3 /*break*/, 7];
            case 6:
                error_5 = _f.sent();
                logger_1.default.error("[HeatmapAPI] Failed to get market data for ".concat(req.params.marketId, ":"), error_5);
                res.status(500).json({
                    success: false,
                    error: error_5 instanceof Error ? error_5.message : 'Unknown error',
                });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/heatmap/top
 * Get top mentioned markets
 */
router.get('/top', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, _b, hours, _c, limit, topMarkets, error_6;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _d.sent();
                _a = req.query, _b = _a.hours, hours = _b === void 0 ? '24' : _b, _c = _a.limit, limit = _c === void 0 ? '20' : _c;
                return [4 /*yield*/, market_mention_extractor_1.default.getTopMentionedMarkets(parseInt(hours), parseInt(limit))];
            case 2:
                topMarkets = _d.sent();
                res.json({
                    success: true,
                    count: topMarkets.length,
                    markets: topMarkets,
                    timestamp: new Date().toISOString(),
                });
                return [3 /*break*/, 4];
            case 3:
                error_6 = _d.sent();
                logger_1.default.error('[HeatmapAPI] Failed to get top markets:', error_6);
                res.status(500).json({
                    success: false,
                    error: error_6 instanceof Error ? error_6.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /api/heatmap/categories
 * Get all unique categories with counts
 */
router.get('/categories', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var markets, categoryCounts, _i, markets_1, m, categories, error_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _a.sent();
                return [4 /*yield*/, market_data_sync_1.default.getActiveMarkets()];
            case 2:
                markets = _a.sent();
                categoryCounts = {};
                for (_i = 0, markets_1 = markets; _i < markets_1.length; _i++) {
                    m = markets_1[_i];
                    if (!categoryCounts[m.category]) {
                        categoryCounts[m.category] = { count: 0, volume: 0 };
                    }
                    categoryCounts[m.category].count++;
                    categoryCounts[m.category].volume += m.volume24h;
                }
                categories = Object.entries(categoryCounts)
                    .map(function (_a) {
                    var name = _a[0], stats = _a[1];
                    return ({
                        name: name,
                        count: stats.count,
                        totalVolume: stats.volume,
                    });
                })
                    .sort(function (a, b) { return b.count - a.count; });
                res.json({
                    success: true,
                    count: categories.length,
                    categories: categories,
                });
                return [3 /*break*/, 4];
            case 3:
                error_7 = _a.sent();
                logger_1.default.error('[HeatmapAPI] Failed to get categories:', error_7);
                res.status(500).json({
                    success: false,
                    error: error_7 instanceof Error ? error_7.message : 'Unknown error',
                });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * POST /api/heatmap/calculate
 * Trigger heat calculation for all markets
 */
router.post('/calculate', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, periods, periodTypes, hoursMap, results, _i, periodTypes_1, periodType, hours, heatData, stored, error_8;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 7, , 8]);
                return [4 /*yield*/, ensureInitialized()];
            case 1:
                _b.sent();
                _a = req.query.periods, periods = _a === void 0 ? '1h,4h,24h' : _a;
                periodTypes = periods.split(',');
                hoursMap = {
                    '1h': 1,
                    '4h': 4,
                    '24h': 24,
                    '7d': 168,
                };
                results = {};
                _i = 0, periodTypes_1 = periodTypes;
                _b.label = 2;
            case 2:
                if (!(_i < periodTypes_1.length)) return [3 /*break*/, 6];
                periodType = periodTypes_1[_i];
                hours = hoursMap[periodType] || 24;
                logger_1.default.info("[HeatmapAPI] Calculating ".concat(periodType, " heat..."));
                return [4 /*yield*/, market_heat_calculator_1.default.calculateMarketHeat(periodType, hours)];
            case 3:
                heatData = _b.sent();
                return [4 /*yield*/, market_heat_calculator_1.default.storeHeatCalculations(heatData, periodType)];
            case 4:
                stored = _b.sent();
                results[periodType] = stored;
                _b.label = 5;
            case 5:
                _i++;
                return [3 /*break*/, 2];
            case 6:
                res.json({
                    success: true,
                    calculated: results,
                    timestamp: new Date().toISOString(),
                });
                return [3 /*break*/, 8];
            case 7:
                error_8 = _b.sent();
                logger_1.default.error('[HeatmapAPI] Heat calculation failed:', error_8);
                res.status(500).json({
                    success: false,
                    error: error_8 instanceof Error ? error_8.message : 'Unknown error',
                });
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
exports.default = router;
