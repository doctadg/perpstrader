"use strict";
// Market Heat Calculator
// Calculates heat scores for markets based on mentions, sentiment, and volume
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
exports.marketHeatCalculator = void 0;
var better_sqlite3_1 = require("better-sqlite3");
var logger_1 = require("../shared/logger");
var MarketHeatCalculator = /** @class */ (function () {
    function MarketHeatCalculator() {
        this.db = null;
        this.initialized = false;
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }
    MarketHeatCalculator.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.initialized)
                    return [2 /*return*/];
                try {
                    this.db = new better_sqlite3_1.default(this.dbPath);
                    this.db.pragma('journal_mode = WAL');
                    this.initialized = true;
                    logger_1.default.info('[MarketHeatCalculator] Initialized successfully');
                }
                catch (error) {
                    logger_1.default.error('[MarketHeatCalculator] Initialization failed:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Calculate heat for all markets in a given timeframe
     */
    MarketHeatCalculator.prototype.calculateMarketHeat = function () {
        return __awaiter(this, arguments, void 0, function (periodType, hours) {
            var marketRows, clusterRows, marketClusters, _i, clusterRows_1, row, previousHeat, results, _a, marketRows_1, row, baseHeat, prevHeat, _b, trendDirection, velocity, marketData, error_1;
            if (periodType === void 0) { periodType = '24h'; }
            if (hours === void 0) { hours = 24; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _c.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        logger_1.default.info("[MarketHeatCalculator] Calculating ".concat(periodType, " heat for last ").concat(hours, "h..."));
                        marketRows = this.db.prepare("\n        SELECT \n          m.id as market_id,\n          m.name as market_name,\n          m.type as market_type,\n          m.category,\n          m.volume_24h,\n          m.pm_probability,\n          m.pm_liquidity,\n          COUNT(DISTINCT mm.article_id) as unique_article_count,\n          COUNT(mm.id) as total_mentions,\n          AVG(mm.relevance_score) as avg_relevance,\n          AVG(mm.sentiment_score) as avg_sentiment,\n          SUM(CASE WHEN mm.mention_sentiment = 'very_positive' THEN 1 ELSE 0 END) as vp_count,\n          SUM(CASE WHEN mm.mention_sentiment = 'positive' THEN 1 ELSE 0 END) as p_count,\n          SUM(CASE WHEN mm.mention_sentiment = 'neutral' THEN 1 ELSE 0 END) as n_count,\n          SUM(CASE WHEN mm.mention_sentiment = 'negative' THEN 1 ELSE 0 END) as neg_count,\n          SUM(CASE WHEN mm.mention_sentiment = 'very_negative' THEN 1 ELSE 0 END) as vn_count\n        FROM markets m\n        LEFT JOIN market_mentions mm ON m.id = mm.market_id\n          AND mm.extracted_at > datetime('now', '-".concat(hours, " hours')\n        WHERE m.active = 1\n        GROUP BY m.id\n        HAVING total_mentions > 0\n        ORDER BY total_mentions DESC\n      ")).all();
                        clusterRows = this.db.prepare("\n        SELECT DISTINCT\n          mm.market_id,\n          ca.cluster_id\n        FROM market_mentions mm\n        JOIN cluster_articles ca ON mm.article_id = ca.article_id\n        WHERE mm.extracted_at > datetime('now', '-".concat(hours, " hours')\n      ")).all();
                        marketClusters = new Map();
                        for (_i = 0, clusterRows_1 = clusterRows; _i < clusterRows_1.length; _i++) {
                            row = clusterRows_1[_i];
                            if (!marketClusters.has(row.market_id)) {
                                marketClusters.set(row.market_id, []);
                            }
                            marketClusters.get(row.market_id).push(row.cluster_id);
                        }
                        return [4 /*yield*/, this.getPreviousHeatScores(periodType)];
                    case 3:
                        previousHeat = _c.sent();
                        results = [];
                        for (_a = 0, marketRows_1 = marketRows; _a < marketRows_1.length; _a++) {
                            row = marketRows_1[_a];
                            baseHeat = this.calculateBaseHeatScore({
                                uniqueArticleCount: row.unique_article_count,
                                totalMentions: row.total_mentions,
                                avgRelevance: row.avg_relevance || 50,
                                avgSentiment: Math.abs(row.avg_sentiment || 0), // Higher absolute sentiment = more heat
                                marketVolume: row.volume_24h || 0,
                                marketLiquidity: row.pm_liquidity || 0,
                                marketProbability: row.pm_probability,
                            });
                            prevHeat = previousHeat.get(row.market_id);
                            _b = this.calculateTrend(baseHeat, (prevHeat === null || prevHeat === void 0 ? void 0 : prevHeat.heatScore) || null), trendDirection = _b.trendDirection, velocity = _b.velocity;
                            marketData = {
                                marketId: row.market_id,
                                marketName: row.market_name,
                                marketType: row.market_type,
                                category: row.category,
                                heatScore: baseHeat,
                                articleCount: row.unique_article_count,
                                mentionCount: row.total_mentions,
                                uniqueArticleCount: row.unique_article_count,
                                avgSentiment: row.avg_sentiment || 0,
                                sentimentDistribution: {
                                    very_positive: row.vp_count || 0,
                                    positive: row.p_count || 0,
                                    neutral: row.n_count || 0,
                                    negative: row.neg_count || 0,
                                    very_negative: row.vn_count || 0,
                                },
                                trendDirection: trendDirection,
                                velocity: velocity,
                                relatedClusterIds: marketClusters.get(row.market_id) || [],
                            };
                            results.push(marketData);
                        }
                        // Sort by heat score
                        results.sort(function (a, b) { return b.heatScore - a.heatScore; });
                        logger_1.default.info("[MarketHeatCalculator] Calculated heat for ".concat(results.length, " markets"));
                        return [2 /*return*/, results];
                    case 4:
                        error_1 = _c.sent();
                        logger_1.default.error('[MarketHeatCalculator] Failed to calculate market heat:', error_1);
                        return [2 /*return*/, []];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Store heat calculations
     */
    MarketHeatCalculator.prototype.storeHeatCalculations = function (heatData, periodType) {
        return __awaiter(this, void 0, void 0, function () {
            var now, periodStart_1, periodEnd_1, insertStmt_1, txn, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db || heatData.length === 0)
                            return [2 /*return*/, 0];
                        try {
                            now = new Date();
                            periodStart_1 = this.getPeriodStart(now, periodType);
                            periodEnd_1 = now.toISOString();
                            insertStmt_1 = this.db.prepare("\n        INSERT INTO market_heat (\n          market_id, heat_score, article_count, mention_count, unique_article_count,\n          avg_sentiment, sentiment_distribution, period_start, period_end, period_type,\n          trend_direction, velocity, related_cluster_ids\n        ) VALUES (\n          @marketId, @heatScore, @articleCount, @mentionCount, @uniqueArticleCount,\n          @avgSentiment, @sentimentDistribution, @periodStart, @periodEnd, @periodType,\n          @trendDirection, @velocity, @relatedClusterIds\n        )\n        ON CONFLICT(market_id, period_type, period_start) DO UPDATE SET\n          heat_score = @heatScore,\n          article_count = @articleCount,\n          mention_count = @mentionCount,\n          unique_article_count = @uniqueArticleCount,\n          avg_sentiment = @avgSentiment,\n          sentiment_distribution = @sentimentDistribution,\n          period_end = @periodEnd,\n          trend_direction = @trendDirection,\n          velocity = @velocity,\n          related_cluster_ids = @relatedClusterIds\n      ");
                            txn = this.db.transaction(function () {
                                var count = 0;
                                for (var _i = 0, heatData_1 = heatData; _i < heatData_1.length; _i++) {
                                    var data = heatData_1[_i];
                                    insertStmt_1.run({
                                        marketId: data.marketId,
                                        heatScore: data.heatScore,
                                        articleCount: data.articleCount,
                                        mentionCount: data.mentionCount,
                                        uniqueArticleCount: data.uniqueArticleCount,
                                        avgSentiment: data.avgSentiment,
                                        sentimentDistribution: JSON.stringify(data.sentimentDistribution),
                                        periodStart: periodStart_1,
                                        periodEnd: periodEnd_1,
                                        periodType: periodType,
                                        trendDirection: data.trendDirection,
                                        velocity: data.velocity,
                                        relatedClusterIds: JSON.stringify(data.relatedClusterIds),
                                    });
                                    count++;
                                }
                                return count;
                            });
                            result = txn();
                            logger_1.default.info("[MarketHeatCalculator] Stored ".concat(result, " heat calculations"));
                            return [2 /*return*/, result];
                        }
                        catch (error) {
                            logger_1.default.error('[MarketHeatCalculator] Failed to store heat calculations:', error);
                            return [2 /*return*/, 0];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get heat history for a market
     */
    MarketHeatCalculator.prototype.getHeatHistory = function (marketId_1) {
        return __awaiter(this, arguments, void 0, function (marketId, periodType, limit) {
            var rows;
            if (periodType === void 0) { periodType = '24h'; }
            if (limit === void 0) { limit = 30; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            rows = this.db.prepare("\n        SELECT \n          heat_score,\n          article_count,\n          period_start,\n          trend_direction\n        FROM market_heat\n        WHERE market_id = ?\n        AND period_type = ?\n        ORDER BY period_start DESC\n        LIMIT ?\n      ").all(marketId, periodType, limit);
                            return [2 /*return*/, rows.map(function (r) { return ({
                                    heatScore: r.heat_score,
                                    articleCount: r.article_count,
                                    periodStart: new Date(r.period_start),
                                    trendDirection: r.trend_direction,
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error("[MarketHeatCalculator] Failed to get heat history for ".concat(marketId, ":"), error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get heat snapshot for all markets (for bubble map)
     */
    MarketHeatCalculator.prototype.getHeatSnapshot = function (category_1) {
        return __awaiter(this, arguments, void 0, function (category, minHeatScore) {
            var query, params, rows;
            var _a;
            if (minHeatScore === void 0) { minHeatScore = 0; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            query = "\n        SELECT \n          m.id as market_id,\n          m.name as market_name,\n          m.type as market_type,\n          m.category,\n          m.volume_24h,\n          m.pm_probability,\n          mh.heat_score,\n          mh.article_count,\n          mh.mention_count,\n          mh.unique_article_count,\n          mh.avg_sentiment,\n          mh.sentiment_distribution,\n          mh.trend_direction,\n          mh.velocity,\n          mh.related_cluster_ids\n        FROM markets m\n        LEFT JOIN market_heat mh ON m.id = mh.market_id\n          AND mh.period_type = '24h'\n          AND mh.period_start = (\n            SELECT MAX(period_start) \n            FROM market_heat \n            WHERE market_id = m.id AND period_type = '24h'\n          )\n        WHERE m.active = 1\n      ";
                            params = [];
                            if (category) {
                                query += " AND m.category = ?";
                                params.push(category);
                            }
                            query += " ORDER BY COALESCE(mh.heat_score, 0) DESC";
                            rows = (_a = this.db.prepare(query)).all.apply(_a, params);
                            return [2 /*return*/, rows.map(function (r) {
                                    var sentimentDist = r.sentiment_distribution ?
                                        JSON.parse(r.sentiment_distribution) :
                                        { very_positive: 0, positive: 0, neutral: 0, negative: 0, very_negative: 0 };
                                    return {
                                        marketId: r.market_id,
                                        marketName: r.market_name,
                                        marketType: r.market_type,
                                        category: r.category,
                                        heatScore: r.heat_score || 0,
                                        articleCount: r.article_count || 0,
                                        mentionCount: r.mention_count || 0,
                                        uniqueArticleCount: r.unique_article_count || 0,
                                        avgSentiment: r.avg_sentiment || 0,
                                        sentimentDistribution: sentimentDist,
                                        trendDirection: r.trend_direction || 'STABLE',
                                        velocity: r.velocity || 0,
                                        relatedClusterIds: r.related_cluster_ids ? JSON.parse(r.related_cluster_ids) : [],
                                    };
                                }).filter(function (m) { return m.heatScore >= minHeatScore; })];
                        }
                        catch (error) {
                            logger_1.default.error('[MarketHeatCalculator] Failed to get heat snapshot:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get heat grid data (for heatmap grid visualization)
     */
    MarketHeatCalculator.prototype.getHeatGridData = function () {
        return __awaiter(this, arguments, void 0, function (periodTypes) {
            var markets, results, _i, markets_1, market, periods, _a, periodTypes_1, periodType, row;
            if (periodTypes === void 0) { periodTypes = ['1h', '4h', '24h']; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            markets = this.db.prepare("\n        SELECT id, name, type, category, volume_24h\n        FROM markets\n        WHERE active = 1\n        ORDER BY priority DESC, volume_24h DESC\n        LIMIT 100\n      ").all();
                            results = [];
                            for (_i = 0, markets_1 = markets; _i < markets_1.length; _i++) {
                                market = markets_1[_i];
                                periods = {};
                                for (_a = 0, periodTypes_1 = periodTypes; _a < periodTypes_1.length; _a++) {
                                    periodType = periodTypes_1[_a];
                                    row = this.db.prepare("\n            SELECT heat_score, article_count, trend_direction, avg_sentiment\n            FROM market_heat\n            WHERE market_id = ? AND period_type = ?\n            ORDER BY period_start DESC\n            LIMIT 1\n          ").get(market.id, periodType);
                                    if (row) {
                                        periods[periodType] = {
                                            heatScore: row.heat_score,
                                            articleCount: row.article_count,
                                            trendDirection: row.trend_direction,
                                            avgSentiment: row.avg_sentiment,
                                        };
                                    }
                                }
                                // Only include markets with at least some data
                                if (Object.keys(periods).length > 0) {
                                    results.push({
                                        marketId: market.id,
                                        marketName: market.name,
                                        marketType: market.type,
                                        category: market.category,
                                        volume24h: market.volume_24h,
                                        periods: periods,
                                    });
                                }
                            }
                            return [2 /*return*/, results];
                        }
                        catch (error) {
                            logger_1.default.error('[MarketHeatCalculator] Failed to get heat grid data:', error);
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
    MarketHeatCalculator.prototype.calculateBaseHeatScore = function (params) {
        // Base score from article and mention count
        // Log scale to prevent single viral article from dominating
        var articleScore = Math.log10(Math.max(1, params.uniqueArticleCount)) * 15;
        var mentionScore = Math.log10(Math.max(1, params.totalMentions)) * 10;
        // Relevance factor (0-1 scaled from avg 0-100)
        var relevanceFactor = params.avgRelevance / 100;
        // Sentiment intensity factor (0-1)
        // Both very positive and very negative sentiment create heat
        var sentimentIntensity = params.avgSentiment;
        // Market volume factor (log scale, normalized)
        // High volume markets get a boost
        var volumeFactor = Math.min(1, Math.log10(Math.max(1, params.marketVolume)) / 12);
        // Liquidity factor for Polymarket (0-1)
        var liquidityFactor = Math.min(1, Math.log10(Math.max(1, params.marketLiquidity)) / 8);
        // Probability uncertainty factor for Polymarket
        // Markets near 50% are more interesting (uncertainty)
        var uncertaintyFactor = 0.5;
        if (params.marketProbability !== undefined) {
            var distanceFrom50 = Math.abs(params.marketProbability - 0.5);
            uncertaintyFactor = 1 - (distanceFrom50 * 1.5); // Higher when near 50%
        }
        // Combine factors
        var baseHeat = articleScore + mentionScore;
        var multiplier = (0.3 * relevanceFactor +
            0.2 * sentimentIntensity +
            0.2 * volumeFactor +
            0.15 * liquidityFactor +
            0.15 * uncertaintyFactor);
        var finalScore = baseHeat * (0.5 + multiplier);
        // Cap at 100
        return Math.min(100, Math.round(finalScore * 10) / 10);
    };
    MarketHeatCalculator.prototype.calculateTrend = function (currentHeat, previousHeat) {
        if (previousHeat === null) {
            return { trendDirection: 'STABLE', velocity: 0 };
        }
        var delta = currentHeat - previousHeat;
        var percentChange = previousHeat > 0 ? (delta / previousHeat) * 100 : 0;
        var trendDirection;
        if (percentChange >= 50)
            trendDirection = 'SPIKING';
        else if (percentChange >= 20)
            trendDirection = 'RISING';
        else if (percentChange <= -50)
            trendDirection = 'CRASHING';
        else if (percentChange <= -20)
            trendDirection = 'FALLING';
        else
            trendDirection = 'STABLE';
        return {
            trendDirection: trendDirection,
            velocity: Math.round(percentChange * 10) / 10,
        };
    };
    MarketHeatCalculator.prototype.getPreviousHeatScores = function (periodType) {
        return __awaiter(this, void 0, void 0, function () {
            var rows, result, _i, rows_1, row;
            return __generator(this, function (_a) {
                if (!this.db)
                    return [2 /*return*/, new Map()];
                try {
                    rows = this.db.prepare("\n        SELECT market_id, heat_score, period_start\n        FROM market_heat\n        WHERE period_type = ?\n        AND period_start = (\n          SELECT MAX(period_start)\n          FROM market_heat AS sub\n          WHERE sub.market_id = market_heat.market_id\n          AND sub.period_type = ?\n        )\n      ").all(periodType, periodType);
                    result = new Map();
                    for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                        row = rows_1[_i];
                        result.set(row.market_id, {
                            heatScore: row.heat_score,
                            timestamp: new Date(row.period_start),
                        });
                    }
                    return [2 /*return*/, result];
                }
                catch (error) {
                    logger_1.default.error('[MarketHeatCalculator] Failed to get previous heat scores:', error);
                    return [2 /*return*/, new Map()];
                }
                return [2 /*return*/];
            });
        });
    };
    MarketHeatCalculator.prototype.getPeriodStart = function (now, periodType) {
        var start = new Date(now);
        switch (periodType) {
            case '1h':
                start.setMinutes(0, 0, 0);
                break;
            case '4h':
                start.setHours(Math.floor(start.getHours() / 4) * 4, 0, 0, 0);
                break;
            case '24h':
                start.setHours(0, 0, 0, 0);
                break;
            case '7d':
                // Start of week (Sunday)
                start.setDate(start.getDate() - start.getDay());
                start.setHours(0, 0, 0, 0);
                break;
        }
        return start.toISOString();
    };
    return MarketHeatCalculator;
}());
exports.marketHeatCalculator = new MarketHeatCalculator();
exports.default = exports.marketHeatCalculator;
