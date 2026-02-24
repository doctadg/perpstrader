"use strict";
// Enhanced Dashboard API Routes
// Adds all 10 enhancement endpoints to dashboard
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
var story_cluster_store_enhanced_1 = require("../data/story-cluster-store-enhanced");
var user_personalization_store_1 = require("../data/user-personalization-store");
var heat_predictor_1 = require("../news-agent/heat-predictor");
var anomaly_detector_1 = require("../news-agent/anomaly-detector");
var logger_1 = require("../shared/logger");
var router = express_1.default.Router();
// ============================================================
// ENHANCEMENT 2: Heat History & Evolution
// ============================================================
/**
 * Get heat history for a cluster
 * GET /api/news/clusters/:id/heat-history
 */
router.get('/news/clusters/:id/heat-history', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, limit, history_1, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params.id;
                limit = Math.min(Number.parseInt(req.query.limit) || 100, 500);
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHeatHistory(id, limit)];
            case 1:
                history_1 = _a.sent();
                res.json({
                    clusterId: id,
                    history: history_1,
                    count: history_1.length
                });
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Heat history error:', error_1);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Analyze cluster heat trend
 * GET /api/news/clusters/:id/trend-analysis
 */
router.get('/news/clusters/:id/trend-analysis', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, windowHours, analysis, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params.id;
                windowHours = Number.parseInt(req.query.window) || 6;
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.analyzeHeatTrend(id, windowHours)];
            case 1:
                analysis = _a.sent();
                res.json(analysis);
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Trend analysis error:', error_2);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get heat history for multiple clusters
 * GET /api/news/heat-history-batch
 */
router.get('/news/heat-history-batch', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var ids, clusterIds, limit, histories, _i, clusterIds_1, id, history_2, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 5, , 6]);
                ids = req.query.ids;
                if (!ids || typeof ids !== 'string') {
                    return [2 /*return*/, res.status(400).json({ error: 'ids parameter required' })];
                }
                clusterIds = ids.split(',');
                limit = Math.min(Number.parseInt(req.query.limit) || 50, 100);
                histories = new Map();
                _i = 0, clusterIds_1 = clusterIds;
                _a.label = 1;
            case 1:
                if (!(_i < clusterIds_1.length)) return [3 /*break*/, 4];
                id = clusterIds_1[_i];
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHeatHistory(id, limit)];
            case 2:
                history_2 = _a.sent();
                histories.set(id, history_2);
                _a.label = 3;
            case 3:
                _i++;
                return [3 /*break*/, 1];
            case 4:
                res.json({
                    clusterIds: clusterIds,
                    histories: Object.fromEntries(histories)
                });
                return [3 /*break*/, 6];
            case 5:
                error_3 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Batch heat history error:', error_3);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// ENHANCEMENT 1: Heat Decay Configuration
// ============================================================
/**
 * Get heat decay configuration for all categories
 * GET /api/news/decay-config
 */
router.get('/news/decay-config', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var categories, configs, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                categories = ['CRYPTO', 'STOCKS', 'ECONOMICS', 'GEOPOLITICS', 'TECH',
                    'COMMODITIES', 'SPORTS', 'FOOTBALL', 'BASKETBALL', 'TENNIS', 'MMA', 'GOLF', 'GENERAL'];
                return [4 /*yield*/, Promise.all(categories.map(function (cat) { return story_cluster_store_enhanced_1.default.getDecayConfig(cat); }))];
            case 1:
                configs = _a.sent();
                res.json(configs);
                return [3 /*break*/, 3];
            case 2:
                error_4 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Decay config error:', error_4);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Update heat decay configuration
 * PUT /api/news/decay-config/:category
 */
router.put('/news/decay-config/:category', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var category, config, existing, updated, error_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                category = req.params.category;
                config = req.body;
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getDecayConfig(category)];
            case 1:
                existing = _a.sent();
                updated = __assign(__assign(__assign({}, existing), config), { updatedAt: new Date() });
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.saveDecayConfig(updated)];
            case 2:
                _a.sent();
                res.json({ success: true, config: updated });
                return [3 /*break*/, 4];
            case 3:
                error_5 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Update decay config error:', error_5);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// ENHANCEMENT 5: Entity Extraction & Tracking
// ============================================================
/**
 * Get trending entities
 * GET /api/news/entities/trending
 */
router.get('/news/entities/trending', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var limit, hours, trending, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                limit = Math.min(Number.parseInt(req.query.limit) || 20, 50);
                hours = Math.min(Number.parseInt(req.query.hours) || 24, 168);
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getTrendingEntities(limit, hours)];
            case 1:
                trending = _a.sent();
                res.json({
                    entities: trending,
                    count: trending.length,
                    window: "".concat(hours, "h")
                });
                return [3 /*break*/, 3];
            case 2:
                error_6 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Trending entities error:', error_6);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get entities for a cluster
 * GET /api/news/clusters/:id/entities
 */
router.get('/news/clusters/:id/entities', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id;
    return __generator(this, function (_a) {
        try {
            id = req.params.id;
            // This would require a new method in store
            // For now, return empty
            res.json({
                clusterId: id,
                entities: [],
                count: 0
            });
        }
        catch (error) {
            logger_1.default.error('[EnhancedAPI] Cluster entities error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
        return [2 /*return*/];
    });
}); });
// ============================================================
// ENHANCEMENT 4: Cross-Category Linking
// ============================================================
/**
 * Get related clusters across categories
 * GET /api/news/clusters/:id/related
 */
router.get('/news/clusters/:id/related', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, limit, related, error_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params.id;
                limit = Math.min(Number.parseInt(req.query.limit) || 10, 20);
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getRelatedClusters(id, limit)];
            case 1:
                related = _a.sent();
                res.json({
                    clusterId: id,
                    related: related,
                    count: related.length
                });
                return [3 /*break*/, 3];
            case 2:
                error_7 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Related clusters error:', error_7);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get cross-category events
 * GET /api/news/cross-events
 */
router.get('/news/cross-events', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var hours, cutoff, clusters, crossEvents, error_8;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                hours = Math.min(Number.parseInt(req.query.hours) || 24, 168);
                cutoff = new Date(Date.now() - hours * 3600000);
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHotClusters(100, hours)];
            case 1:
                clusters = _a.sent();
                crossEvents = anomaly_detector_1.default.detectCrossSyndication(clusters);
                res.json({
                    events: crossEvents,
                    count: crossEvents.length,
                    window: "".concat(hours, "h")
                });
                return [3 /*break*/, 3];
            case 2:
                error_8 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Cross events error:', error_8);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// ENHANCEMENT 6: Predictive Scoring
// ============================================================
/**
 * Get heat prediction for a cluster
 * GET /api/news/clusters/:id/prediction
 */
router.get('/news/clusters/:id/prediction', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, history_3, prediction, error_9;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params.id;
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHeatHistory(id, 48)];
            case 1:
                history_3 = _a.sent();
                prediction = heat_predictor_1.default.predictHeat(id, history_3);
                if (!prediction) {
                    return [2 /*return*/, res.status(404).json({ error: 'Insufficient history for prediction' })];
                }
                res.json(prediction);
                return [3 /*break*/, 3];
            case 2:
                error_9 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Prediction error:', error_9);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Batch heat predictions
 * GET /api/news/predictions
 */
router.get('/news/predictions', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var limit, hours, clusters, heatHistories, _i, clusters_1, cluster, history_4, predictions, error_10;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 6, , 7]);
                limit = Math.min(Number.parseInt(req.query.limit) || 50, 100);
                hours = Math.min(Number.parseInt(req.query.hours) || 24, 168);
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHotClusters(limit, hours)];
            case 1:
                clusters = _a.sent();
                heatHistories = new Map();
                _i = 0, clusters_1 = clusters;
                _a.label = 2;
            case 2:
                if (!(_i < clusters_1.length)) return [3 /*break*/, 5];
                cluster = clusters_1[_i];
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHeatHistory(cluster.id, 48)];
            case 3:
                history_4 = _a.sent();
                heatHistories.set(cluster.id, history_4);
                _a.label = 4;
            case 4:
                _i++;
                return [3 /*break*/, 2];
            case 5:
                predictions = heat_predictor_1.default.batchPredict(heatHistories);
                res.json({
                    predictions: predictions.slice(0, limit),
                    count: predictions.length,
                    window: "".concat(hours, "h")
                });
                return [3 /*break*/, 7];
            case 6:
                error_10 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Batch predictions error:', error_10);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
/**
 * Get clusters with predicted spikes
 * GET /api/news/predictions/spikes
 */
router.get('/news/predictions/spikes', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var limit, hours, threshold, clusters, heatHistories, _i, clusters_2, cluster, history_5, predictions, spikes, error_11;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 6, , 7]);
                limit = Math.min(Number.parseInt(req.query.limit) || 20, 50);
                hours = Math.min(Number.parseInt(req.query.hours) || 24, 168);
                threshold = Number.parseFloat(req.query.threshold) || 0.3;
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHotClusters(100, hours)];
            case 1:
                clusters = _a.sent();
                heatHistories = new Map();
                _i = 0, clusters_2 = clusters;
                _a.label = 2;
            case 2:
                if (!(_i < clusters_2.length)) return [3 /*break*/, 5];
                cluster = clusters_2[_i];
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHeatHistory(cluster.id, 48)];
            case 3:
                history_5 = _a.sent();
                heatHistories.set(cluster.id, history_5);
                _a.label = 4;
            case 4:
                _i++;
                return [3 /*break*/, 2];
            case 5:
                predictions = heat_predictor_1.default.batchPredict(heatHistories);
                spikes = heat_predictor_1.default.findPredictedSpikes(predictions, threshold);
                res.json({
                    spikes: spikes.slice(0, limit),
                    count: spikes.length,
                    threshold: threshold,
                    window: "".concat(hours, "h")
                });
                return [3 /*break*/, 7];
            case 6:
                error_11 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Spikes prediction error:', error_11);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// ENHANCEMENT 3: Multi-dimensional Ranking
// ============================================================
/**
 * Get clusters with composite ranking
 * GET /api/news/clusters/ranked
 */
router.get('/news/clusters/ranked', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var limit, hours, clusters, rankings, error_12;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                limit = Math.min(Number.parseInt(req.query.limit) || 50, 100);
                hours = Math.min(Number.parseInt(req.query.hours) || 24, 168);
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHotClusters(limit, hours)];
            case 1:
                clusters = _a.sent();
                return [4 /*yield*/, Promise.all(clusters.map(function (cluster) { return story_cluster_store_enhanced_1.default.calculateCompositeRank(cluster.id); }))];
            case 2:
                rankings = _a.sent();
                // Sort by composite score
                rankings.sort(function (a, b) { return ((b === null || b === void 0 ? void 0 : b.compositeScore) || 0) - ((a === null || a === void 0 ? void 0 : a.compositeScore) || 0); });
                res.json({
                    rankings: rankings.slice(0, limit),
                    count: rankings.length,
                    window: "".concat(hours, "h")
                });
                return [3 /*break*/, 4];
            case 3:
                error_12 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Ranked clusters error:', error_12);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * Get composite rank for specific cluster
 * GET /api/news/clusters/:id/composite-rank
 */
router.get('/news/clusters/:id/composite-rank', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, ranking, error_13;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params.id;
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.calculateCompositeRank(id)];
            case 1:
                ranking = _a.sent();
                if (!ranking) {
                    return [2 /*return*/, res.status(404).json({ error: 'Cluster not found' })];
                }
                res.json(ranking);
                return [3 /*break*/, 3];
            case 2:
                error_13 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Composite rank error:', error_13);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// ENHANCEMENT 9: Anomaly Detection
// ============================================================
/**
 * Get anomalies across all clusters
 * GET /api/news/anomalies
 */
router.get('/news/anomalies', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var hours, minSeverity, clusters, anomalies, _i, clusters_3, cluster, history_6, detected, _a, detected_1, anomaly, severityOrder, severityLevel, minLevel, error_14;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 6, , 7]);
                hours = Math.min(Number.parseInt(req.query.hours) || 24, 168);
                minSeverity = req.query.severity || 'LOW';
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHotClusters(100, hours)];
            case 1:
                clusters = _b.sent();
                anomalies = [];
                _i = 0, clusters_3 = clusters;
                _b.label = 2;
            case 2:
                if (!(_i < clusters_3.length)) return [3 /*break*/, 5];
                cluster = clusters_3[_i];
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHeatHistory(cluster.id, 24)];
            case 3:
                history_6 = _b.sent();
                detected = anomaly_detector_1.default.detectHeatAnomalies(cluster.id, history_6);
                for (_a = 0, detected_1 = detected; _a < detected_1.length; _a++) {
                    anomaly = detected_1[_a];
                    severityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
                    severityLevel = severityOrder.indexOf(anomaly.severity || 'LOW');
                    minLevel = severityOrder.indexOf(minSeverity);
                    if (severityLevel >= minLevel) {
                        anomalies.push(anomaly);
                    }
                }
                _b.label = 4;
            case 4:
                _i++;
                return [3 /*break*/, 2];
            case 5:
                res.json({
                    anomalies: anomalies.slice(0, 50),
                    count: anomalies.length,
                    window: "".concat(hours, "h")
                });
                return [3 /*break*/, 7];
            case 6:
                error_14 = _b.sent();
                logger_1.default.error('[EnhancedAPI] Anomalies error:', error_14);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
/**
 * Get anomalies for specific cluster
 * GET /api/news/clusters/:id/anomalies
 */
router.get('/news/clusters/:id/anomalies', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var id, history_7, anomalies, error_15;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                id = req.params.id;
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getHeatHistory(id, 24)];
            case 1:
                history_7 = _a.sent();
                anomalies = anomaly_detector_1.default.detectHeatAnomalies(id, history_7);
                res.json({
                    clusterId: id,
                    anomalies: anomalies,
                    count: anomalies.length
                });
                return [3 /*break*/, 3];
            case 2:
                error_15 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Cluster anomalies error:', error_15);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// ENHANCEMENT 7: User Personalization
// ============================================================
/**
 * Record user engagement
 * POST /api/user/engagement
 */
router.post('/user/engagement', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, userId, clusterId, engagementType, durationMs, error_16;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 2, , 3]);
                _a = req.body, userId = _a.userId, clusterId = _a.clusterId, engagementType = _a.engagementType, durationMs = _a.durationMs;
                if (!userId || !clusterId || !engagementType) {
                    return [2 /*return*/, res.status(400).json({ error: 'userId, clusterId, and engagementType required' })];
                }
                return [4 /*yield*/, user_personalization_store_1.default.recordEngagement(userId, clusterId, engagementType, durationMs)];
            case 1:
                _b.sent();
                res.json({ success: true });
                return [3 /*break*/, 3];
            case 2:
                error_16 = _b.sent();
                logger_1.default.error('[EnhancedAPI] Record engagement error:', error_16);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get user engagement history
 * GET /api/user/:userId/engagement
 */
router.get('/user/:userId/engagement', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, limit, clusterId, engagement, error_17;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                userId = req.params.userId;
                limit = Math.min(Number.parseInt(req.query.limit) || 100, 500);
                clusterId = req.query.clusterId;
                return [4 /*yield*/, user_personalization_store_1.default.getUserEngagement(userId, limit, clusterId)];
            case 1:
                engagement = _a.sent();
                res.json({
                    userId: userId,
                    engagement: engagement,
                    count: engagement.length
                });
                return [3 /*break*/, 3];
            case 2:
                error_17 = _a.sent();
                logger_1.default.error('[EnhancedAPI] User engagement error:', error_17);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get user's category preferences
 * GET /api/user/:userId/preferences
 */
router.get('/user/:userId/preferences', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, preferences, error_18;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                userId = req.params.userId;
                return [4 /*yield*/, user_personalization_store_1.default.getCategoryPreferences(userId)];
            case 1:
                preferences = _a.sent();
                res.json({
                    userId: userId,
                    preferences: preferences,
                    count: preferences.length
                });
                return [3 /*break*/, 3];
            case 2:
                error_18 = _a.sent();
                logger_1.default.error('[EnhancedAPI] User preferences error:', error_18);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get personalized cluster recommendations
 * GET /api/user/:userId/recommendations
 */
router.get('/user/:userId/recommendations', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, limit, hours, recommendations, clusters, error_19;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                userId = req.params.userId;
                limit = Math.min(Number.parseInt(req.query.limit) || 20, 50);
                hours = Math.min(Number.parseInt(req.query.hours) || 24, 168);
                return [4 /*yield*/, user_personalization_store_1.default.getRecommendedClusters(userId, limit, hours)];
            case 1:
                recommendations = _a.sent();
                return [4 /*yield*/, Promise.all(recommendations.map(function (id) { return story_cluster_store_enhanced_1.default.getClusterById(id); }))];
            case 2:
                clusters = _a.sent();
                res.json({
                    userId: userId,
                    clusters: clusters.filter(function (c) { return c !== null; }),
                    count: clusters.length,
                    window: "".concat(hours, "h")
                });
                return [3 /*break*/, 4];
            case 3:
                error_19 = _a.sent();
                logger_1.default.error('[EnhancedAPI] User recommendations error:', error_19);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * Train user preferences from engagement history
 * POST /api/user/:userId/train
 */
router.post('/user/:userId/train', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, error_20;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                userId = req.params.userId;
                return [4 /*yield*/, user_personalization_store_1.default.trainCategoryWeights(userId)];
            case 1:
                _a.sent();
                res.json({ success: true, message: 'Category preferences trained' });
                return [3 /*break*/, 3];
            case 2:
                error_20 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Train preferences error:', error_20);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get user statistics
 * GET /api/user/:userId/stats
 */
router.get('/user/:userId/stats', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, days, stats, error_21;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                userId = req.params.userId;
                days = Math.min(Number.parseInt(req.query.days) || 7, 90);
                return [4 /*yield*/, user_personalization_store_1.default.getUserStats(userId, days)];
            case 1:
                stats = _a.sent();
                res.json({
                    userId: userId,
                    window: "".concat(days, "d"),
                    stats: stats
                });
                return [3 /*break*/, 3];
            case 2:
                error_21 = _a.sent();
                logger_1.default.error('[EnhancedAPI] User stats error:', error_21);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
// ============================================================
// ENHANCEMENT 10: Performance Monitoring
// ============================================================
/**
 * Get clustering quality metrics
 * GET /api/news/quality-metrics
 */
router.get('/news/quality-metrics', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var hours, quality, error_22;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                hours = Math.min(Number.parseInt(req.query.hours) || 24, 168);
                return [4 /*yield*/, story_cluster_store_enhanced_1.default.getClusteringQualitySummary(hours)];
            case 1:
                quality = _a.sent();
                res.json({
                    window: "".concat(hours, "h"),
                    metrics: quality
                });
                return [3 /*break*/, 3];
            case 2:
                error_22 = _a.sent();
                logger_1.default.error('[EnhancedAPI] Quality metrics error:', error_22);
                res.status(500).json({ error: 'Internal server error' });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * Get circuit breaker health
 * GET /api/news/circuit-breakers-health
 */
router.get('/news/circuit-breakers-health', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var circuitBreaker, breakers, health, _i, _a, _b, name_1, status_1;
    return __generator(this, function (_c) {
        try {
            circuitBreaker = require('../shared/circuit-breaker').default;
            breakers = circuitBreaker.getAllBreakerStatuses();
            health = {
                overall: 'HEALTHY',
                breakers: [],
                openCount: 0,
                totalCount: breakers.length
            };
            for (_i = 0, _a = Object.entries(breakers); _i < _a.length; _i++) {
                _b = _a[_i], name_1 = _b[0], status_1 = _b[1];
                if (status_1.isOpen) {
                    health.openCount++;
                }
                health.breakers.push({
                    name: name_1,
                    state: status_1.isOpen ? 'OPEN' : 'CLOSED',
                    lastFailureAt: status_1.lastFailureAt,
                    failureCount: status_1.failureCount
                });
            }
            if (health.openCount > 0) {
                health.overall = 'DEGRADED';
            }
            if (health.openCount > breakers.length / 2) {
                health.overall = 'CRITICAL';
            }
            res.json(health);
        }
        catch (error) {
            logger_1.default.error('[EnhancedAPI] Circuit breakers health error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
        return [2 /*return*/];
    });
}); });
exports.default = router;
