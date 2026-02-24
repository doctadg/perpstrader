"use strict";
// User Personalization Store
// Manages user preferences and engagement tracking
// Supports ENHANCEMENT 7: User Personalization
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
var better_sqlite3_1 = require("better-sqlite3");
var logger_1 = require("../shared/logger");
var UserPersonalizationStore = /** @class */ (function () {
    function UserPersonalizationStore() {
        this.db = null;
        this.initialized = false;
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }
    UserPersonalizationStore.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.initialized)
                    return [2 /*return*/];
                try {
                    this.db = new better_sqlite3_1.default(this.dbPath);
                    this.db.pragma('journal_mode = WAL');
                    // Tables should already exist from migration, just verify
                    this.initialized = true;
                    logger_1.default.info('[UserPersonalizationStore] Initialized successfully');
                }
                catch (error) {
                    logger_1.default.error('[UserPersonalizationStore] Initialization failed:', error);
                    this.db = null;
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Record user engagement with a cluster
     */
    UserPersonalizationStore.prototype.recordEngagement = function (userId, clusterId, engagementType, durationMs) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            this.db.prepare("\n                INSERT INTO user_engagement\n                (user_id, cluster_id, engagement_type, duration_ms, timestamp)\n                VALUES (?, ?, ?, ?, ?)\n            ").run(userId, clusterId, engagementType, durationMs || null, new Date().toISOString());
                        }
                        catch (error) {
                            logger_1.default.error('[UserPersonalizationStore] Failed to record engagement:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get user's engagement history
     */
    UserPersonalizationStore.prototype.getUserEngagement = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, limit, clusterId) {
            var query, params, rows;
            var _a;
            if (limit === void 0) { limit = 100; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            query = 'SELECT * FROM user_engagement WHERE user_id = ?';
                            params = [userId];
                            if (clusterId) {
                                query += ' AND cluster_id = ?';
                                params.push(clusterId);
                            }
                            query += ' ORDER BY timestamp DESC LIMIT ?';
                            params.push(limit);
                            rows = (_a = this.db.prepare(query)).all.apply(_a, params);
                            return [2 /*return*/, rows.map(function (row) { return ({
                                    id: row.id,
                                    userId: row.user_id,
                                    clusterId: row.cluster_id,
                                    engagementType: row.engagement_type,
                                    durationMs: row.duration_ms,
                                    timestamp: new Date(row.timestamp)
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[UserPersonalizationStore] Failed to get user engagement:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get user's category preferences
     */
    UserPersonalizationStore.prototype.getCategoryPreferences = function (userId) {
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
                            rows = this.db.prepare("\n                SELECT * FROM user_category_preferences\n                WHERE user_id = ?\n                ORDER BY weight DESC\n            ").all(userId);
                            return [2 /*return*/, rows.map(function (row) { return ({
                                    userId: row.user_id,
                                    category: row.category,
                                    weight: row.weight,
                                    lastUpdated: new Date(row.last_updated)
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[UserPersonalizationStore] Failed to get category preferences:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Update category weight
     */
    UserPersonalizationStore.prototype.updateCategoryWeight = function (userId, category, weight) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            this.db.prepare("\n                INSERT OR REPLACE INTO user_category_preferences\n                (user_id, category, weight, last_updated)\n                VALUES (?, ?, ?, ?)\n            ").run(userId, category, weight, new Date().toISOString());
                        }
                        catch (error) {
                            logger_1.default.error('[UserPersonalizationStore] Failed to update category weight:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Calculate personalized cluster weights based on user history
     */
    UserPersonalizationStore.prototype.calculatePersonalizedWeights = function (userId, clusterIds) {
        return __awaiter(this, void 0, void 0, function () {
            var weights, categoryPrefs, categoryWeightMap, recentEngagements, engagementFreq, _i, recentEngagements_1, eng, count, typeBoost, boost, currentWeight, _a, clusterIds_1, clusterId, weight, cluster, categoryWeight, freq, error_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db) {
                            // Return neutral weights if DB unavailable
                            return [2 /*return*/, new Map(clusterIds.map(function (id) { return [id, 1.0]; }))];
                        }
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 9, , 10]);
                        weights = new Map();
                        return [4 /*yield*/, this.getCategoryPreferences(userId)];
                    case 3:
                        categoryPrefs = _b.sent();
                        categoryWeightMap = new Map(categoryPrefs.map(function (p) { return [p.category, p.weight]; }));
                        return [4 /*yield*/, this.getUserEngagement(userId, 500)];
                    case 4:
                        recentEngagements = _b.sent();
                        engagementFreq = new Map();
                        for (_i = 0, recentEngagements_1 = recentEngagements; _i < recentEngagements_1.length; _i++) {
                            eng = recentEngagements_1[_i];
                            count = engagementFreq.get(eng.clusterId) || 0;
                            engagementFreq.set(eng.clusterId, count + 1);
                            typeBoost = {
                                VIEW: 0.01,
                                CLICK: 0.05,
                                SHARE: 0.1,
                                SAVE: 0.15,
                                DISMISS: -0.1
                            };
                            boost = typeBoost[eng.engagementType] || 0;
                            currentWeight = categoryWeightMap.get(eng.clusterId) || 1.0;
                            categoryWeightMap.set(eng.clusterId, Math.max(0.1, currentWeight + boost));
                        }
                        _a = 0, clusterIds_1 = clusterIds;
                        _b.label = 5;
                    case 5:
                        if (!(_a < clusterIds_1.length)) return [3 /*break*/, 8];
                        clusterId = clusterIds_1[_a];
                        weight = 1.0;
                        return [4 /*yield*/, this.db.prepare('SELECT category FROM story_clusters WHERE id = ?')
                                .get(clusterId)];
                    case 6:
                        cluster = _b.sent();
                        if (cluster) {
                            categoryWeight = categoryWeightMap.get(cluster.category) || 1.0;
                            weight *= categoryWeight;
                        }
                        freq = engagementFreq.get(clusterId) || 0;
                        weight *= 1 + (freq * 0.1);
                        // Normalize
                        weights.set(clusterId, weight);
                        _b.label = 7;
                    case 7:
                        _a++;
                        return [3 /*break*/, 5];
                    case 8: return [2 /*return*/, weights];
                    case 9:
                        error_1 = _b.sent();
                        logger_1.default.error('[UserPersonalizationStore] Failed to calculate personalized weights:', error_1);
                        return [2 /*return*/, new Map(clusterIds.map(function (id) { return [id, 1.0]; }))];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get recommended clusters for user
     */
    UserPersonalizationStore.prototype.getRecommendedClusters = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, limit, hours) {
            var categoryPrefs, clusters, categoryWeights, query, rows, error_2;
            if (limit === void 0) { limit = 20; }
            if (hours === void 0) { hours = 24; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, , 7]);
                        return [4 /*yield*/, this.getCategoryPreferences(userId)];
                    case 3:
                        categoryPrefs = _a.sent();
                        if (!(categoryPrefs.length === 0)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.db.prepare("\n                    SELECT id FROM story_clusters\n                    WHERE updated_at > ?\n                    ORDER BY heat_score DESC\n                    LIMIT ?\n                ").all(new Date(Date.now() - hours * 3600000).toISOString(), limit)];
                    case 4:
                        clusters = _a.sent();
                        return [2 /*return*/, clusters.map(function (c) { return c.id; })];
                    case 5:
                        categoryWeights = categoryPrefs.map(function (p) {
                            return "(category = '".concat(p.category, "' * ").concat(p.weight, ")");
                        }).join(' + ');
                        query = "\n                SELECT id FROM story_clusters\n                WHERE updated_at > ?\n                ORDER BY (".concat(categoryWeights, ") * heat_score DESC\n                LIMIT ?\n            ");
                        rows = this.db.prepare(query).all(new Date(Date.now() - hours * 3600000).toISOString(), limit);
                        return [2 /*return*/, rows.map(function (r) { return r.id; })];
                    case 6:
                        error_2 = _a.sent();
                        logger_1.default.error('[UserPersonalizationStore] Failed to get recommended clusters:', error_2);
                        return [2 /*return*/, []];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Train category weights from user behavior
     */
    UserPersonalizationStore.prototype.trainCategoryWeights = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var cutoff, rows, categoryScores, _i, rows_1, row, currentScore, typeWeights, weight, scores, maxScore, minScore, _a, categoryScores_1, _b, category, score, normalizedScore, weight, error_3;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _c.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 7, , 8]);
                        cutoff = new Date(Date.now() - 30 * 24 * 3600000).toISOString();
                        rows = this.db.prepare("\n                SELECT\n                    sc.category,\n                    ue.engagement_type,\n                    COUNT(*) as count\n                FROM user_engagement ue\n                JOIN story_clusters sc ON ue.cluster_id = sc.id\n                WHERE ue.user_id = ? AND ue.timestamp > ?\n                GROUP BY sc.category, ue.engagement_type\n            ").all(userId, cutoff);
                        categoryScores = new Map();
                        for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                            row = rows_1[_i];
                            currentScore = categoryScores.get(row.category) || 0;
                            typeWeights = {
                                VIEW: 1,
                                CLICK: 3,
                                SHARE: 5,
                                SAVE: 7,
                                DISMISS: -10
                            };
                            weight = typeWeights[row.engagement_type] || 0;
                            categoryScores.set(row.category, currentScore + (weight * row.count));
                        }
                        scores = Array.from(categoryScores.values());
                        maxScore = Math.max.apply(Math, __spreadArray(__spreadArray([], scores, false), [1], false));
                        minScore = Math.min.apply(Math, __spreadArray(__spreadArray([], scores, false), [-10], false));
                        _a = 0, categoryScores_1 = categoryScores;
                        _c.label = 3;
                    case 3:
                        if (!(_a < categoryScores_1.length)) return [3 /*break*/, 6];
                        _b = categoryScores_1[_a], category = _b[0], score = _b[1];
                        normalizedScore = (score - minScore) / (maxScore - minScore);
                        weight = 0.1 + (normalizedScore * 1.9);
                        return [4 /*yield*/, this.updateCategoryWeight(userId, category, weight)];
                    case 4:
                        _c.sent();
                        _c.label = 5;
                    case 5:
                        _a++;
                        return [3 /*break*/, 3];
                    case 6:
                        logger_1.default.info("[UserPersonalizationStore] Trained category weights for user ".concat(userId));
                        return [3 /*break*/, 8];
                    case 7:
                        error_3 = _c.sent();
                        logger_1.default.error('[UserPersonalizationStore] Failed to train category weights:', error_3);
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get user engagement statistics
     */
    UserPersonalizationStore.prototype.getUserStats = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, days) {
            var cutoff, rows, stats, _i, rows_2, row, durationRows, categoryRows;
            if (days === void 0) { days = 7; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, {}];
                        try {
                            cutoff = new Date(Date.now() - days * 24 * 3600000).toISOString();
                            rows = this.db.prepare("\n                SELECT\n                    engagement_type,\n                    COUNT(*) as count,\n                    SUM(COALESCE(duration_ms, 0)) as total_duration_ms\n                FROM user_engagement\n                WHERE user_id = ? AND timestamp > ?\n                GROUP BY engagement_type\n            ").all(userId, cutoff);
                            stats = {
                                totalEngagements: 0,
                                byType: {},
                                totalDurationMs: 0,
                                avgDurationMs: 0,
                                topCategories: []
                            };
                            for (_i = 0, rows_2 = rows; _i < rows_2.length; _i++) {
                                row = rows_2[_i];
                                stats.byType[row.engagement_type] = {
                                    count: row.count,
                                    totalDurationMs: row.total_duration_ms
                                };
                                stats.totalEngagements += row.count;
                                stats.totalDurationMs += row.total_duration_ms || 0;
                            }
                            durationRows = rows.filter(function (r) { return r.total_duration_ms > 0; });
                            if (durationRows.length > 0) {
                                stats.avgDurationMs = stats.totalDurationMs / stats.totalEngagements;
                            }
                            categoryRows = this.db.prepare("\n                SELECT\n                    sc.category,\n                    COUNT(*) as count\n                FROM user_engagement ue\n                JOIN story_clusters sc ON ue.cluster_id = sc.id\n                WHERE ue.user_id = ? AND ue.timestamp > ?\n                GROUP BY sc.category\n                ORDER BY count DESC\n                LIMIT 5\n            ").all(userId, cutoff);
                            stats.topCategories = categoryRows;
                            return [2 /*return*/, stats];
                        }
                        catch (error) {
                            logger_1.default.error('[UserPersonalizationStore] Failed to get user stats:', error);
                            return [2 /*return*/, {}];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    return UserPersonalizationStore;
}());
var userPersonalizationStore = new UserPersonalizationStore();
exports.default = userPersonalizationStore;
