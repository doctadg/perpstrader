"use strict";
// Story Cluster Store - Enhanced Version
// Adds all 10 enhancements to the clustering system
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
var better_sqlite3_1 = require("better-sqlite3");
var logger_1 = require("../shared/logger");
var StoryClusterStoreEnhanced = /** @class */ (function () {
    function StoryClusterStoreEnhanced() {
        this.db = null;
        this.initialized = false;
        this.decayConfigCache = new Map();
        this.lastDecayConfigFetch = 0;
        this.DECAY_CONFIG_CACHE_TTL = 300000; // 5 minutes
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }
    StoryClusterStoreEnhanced.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.initialized)
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        this.db = new better_sqlite3_1.default(this.dbPath);
                        this.db.pragma('journal_mode = WAL');
                        // Run migration if needed
                        return [4 /*yield*/, this.ensureEnhancedSchema()];
                    case 2:
                        // Run migration if needed
                        _a.sent();
                        this.initialized = true;
                        logger_1.default.info('[StoryClusterStoreEnhanced] Initialized successfully');
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        logger_1.default.error('[StoryClusterStoreEnhanced] Initialization failed:', error_1);
                        this.db = null;
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStoreEnhanced.prototype.ensureEnhancedSchema = function () {
        return __awaiter(this, void 0, void 0, function () {
            var tables, migrationPath, fs, migrationSQL;
            return __generator(this, function (_a) {
                if (!this.db)
                    return [2 /*return*/];
                tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='heat_decay_config'").get();
                if (!tables) {
                    logger_1.default.info('[StoryClusterStoreEnhanced] Running enhancement migration...');
                    migrationPath = process.env.MIGRATION_PATH || './migrations/002_cluster_enhancements.sql';
                    try {
                        fs = require('fs');
                        migrationSQL = fs.readFileSync(migrationPath, 'utf8');
                        this.db.exec(migrationSQL);
                        logger_1.default.info('[StoryClusterStoreEnhanced] Migration completed successfully');
                    }
                    catch (error) {
                        logger_1.default.error('[StoryClusterStoreEnhanced] Migration failed:', error);
                        // Don't throw - continue with partial schema
                    }
                }
                // Ensure all new columns exist
                this.ensureEnhancedColumns();
                return [2 /*return*/];
            });
        });
    };
    StoryClusterStoreEnhanced.prototype.ensureEnhancedColumns = function () {
        if (!this.db)
            return;
        var columns = new Set(this.db.prepare("PRAGMA table_info('story_clusters')").all()
            .map(function (row) { return row.name; }));
        var enhancedColumns = [
            'heat_velocity', 'acceleration', 'predicted_heat', 'prediction_confidence',
            'is_cross_category', 'parent_cluster_id', 'entity_heat_score', 'source_authority_score',
            'sentiment_velocity', 'market_correlation_score', 'composite_rank_score',
            'is_anomaly', 'anomaly_type', 'anomaly_score',
            'lifecycle_stage', 'peak_heat', 'peak_time'
        ];
        for (var _i = 0, enhancedColumns_1 = enhancedColumns; _i < enhancedColumns_1.length; _i++) {
            var col = enhancedColumns_1[_i];
            if (!columns.has(col)) {
                try {
                    var columnType = col.includes('time') || col.includes('date') ? 'TEXT' :
                        col.includes('score') || col.includes('velocity') || col.includes('acceleration') ? 'REAL' :
                            col.includes('is_') ? 'BOOLEAN' : 'TEXT';
                    this.db.exec("ALTER TABLE story_clusters ADD COLUMN ".concat(col, " ").concat(columnType));
                    logger_1.default.debug("[StoryClusterStoreEnhanced] Added column: ".concat(col));
                }
                catch (error) {
                    logger_1.default.warn("[StoryClusterStoreEnhanced] Failed to add column ".concat(col, ":"), error);
                }
            }
        }
    };
    // ============================================================
    // ENHANCEMENT 1: Heat Decay Tuning
    // ============================================================
    /**
     * Get heat decay configuration for a category (with caching)
     */
    StoryClusterStoreEnhanced.prototype.getDecayConfig = function (category) {
        return __awaiter(this, void 0, void 0, function () {
            var now, row, config, defaultConfig, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = Date.now();
                        // Check cache
                        if (this.decayConfigCache.has(category) &&
                            (now - this.lastDecayConfigFetch) < this.DECAY_CONFIG_CACHE_TTL) {
                            return [2 /*return*/, this.decayConfigCache.get(category)];
                        }
                        return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db) {
                            return [2 /*return*/, this.getDefaultDecayConfig(category)];
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        row = this.db.prepare('SELECT * FROM heat_decay_config WHERE category = ?').get(category);
                        if (row) {
                            config = {
                                category: row.category,
                                decayConstant: row.decay_constant,
                                activityBoostHours: row.activity_boost_hours,
                                spikeMultiplier: row.spike_multiplier,
                                baseHalfLifeHours: row.base_half_life_hours,
                                description: row.description,
                                updatedAt: new Date(row.updated_at)
                            };
                            this.decayConfigCache.set(category, config);
                            this.lastDecayConfigFetch = now;
                            return [2 /*return*/, config];
                        }
                        defaultConfig = this.getDefaultDecayConfig(category);
                        // Save default to DB
                        return [4 /*yield*/, this.saveDecayConfig(defaultConfig)];
                    case 3:
                        // Save default to DB
                        _a.sent();
                        return [2 /*return*/, defaultConfig];
                    case 4:
                        error_2 = _a.sent();
                        logger_1.default.error('[StoryClusterStoreEnhanced] Failed to get decay config:', error_2);
                        return [2 /*return*/, this.getDefaultDecayConfig(category)];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStoreEnhanced.prototype.getDefaultDecayConfig = function (category) {
        var defaultConfigs = {
            CRYPTO: { decayConstant: 0.25, baseHalfLifeHours: 3.0, description: 'Fast-paced crypto markets' },
            STOCKS: { decayConstant: 0.2, baseHalfLifeHours: 4.0, description: 'Stock market standard decay' },
            ECONOMICS: { decayConstant: 0.15, baseHalfLifeHours: 5.0, description: 'Economic events linger longer' },
            GEOPOLITICS: { decayConstant: 0.1, baseHalfLifeHours: 7.0, description: 'Geopolitical events have long tails' },
            SPORTS: { decayConstant: 0.3, baseHalfLifeHours: 2.0, description: 'Sports news decays fast' }
        };
        var config = defaultConfigs[category] || { decayConstant: 0.2, baseHalfLifeHours: 3.5 };
        return {
            category: category,
            decayConstant: config.decayConstant || 0.2,
            activityBoostHours: 2,
            spikeMultiplier: 1.5,
            baseHalfLifeHours: config.baseHalfLifeHours || 3.5,
            description: config.description || 'Default decay',
            updatedAt: new Date()
        };
    };
    StoryClusterStoreEnhanced.prototype.saveDecayConfig = function (config) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            this.db.prepare("\n                INSERT OR REPLACE INTO heat_decay_config\n                (category, decay_constant, activity_boost_hours, spike_multiplier, base_half_life_hours, description, updated_at)\n                VALUES (?, ?, ?, ?, ?, ?, ?)\n            ").run(config.category, config.decayConstant, config.activityBoostHours, config.spikeMultiplier, config.baseHalfLifeHours, config.description || null, config.updatedAt.toISOString());
                            // Update cache
                            this.decayConfigCache.set(config.category, config);
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to save decay config:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Calculate heat score with category-specific decay
     */
    StoryClusterStoreEnhanced.prototype.calculateEnhancedHeat = function (article_1, clusterDate_1) {
        return __awaiter(this, arguments, void 0, function (article, clusterDate, baseHeat) {
            var category, config, importanceMultipliers, importanceMultiplier, heat, hoursSinceArticle, decayFactor, hoursSinceUpdate, activityBoost;
            var _a, _b;
            if (baseHeat === void 0) { baseHeat = 10; }
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        category = ((_a = article.categories) === null || _a === void 0 ? void 0 : _a[0]) || 'GENERAL';
                        return [4 /*yield*/, this.getDecayConfig(category)];
                    case 1:
                        config = _c.sent();
                        importanceMultipliers = {
                            CRITICAL: config.spikeMultiplier * 3,
                            HIGH: 2,
                            MEDIUM: 1.5,
                            LOW: 1
                        };
                        importanceMultiplier = importanceMultipliers[article.importance || 'MEDIUM'] || 1;
                        heat = baseHeat * importanceMultiplier;
                        // Sentiment boost (non-neutral gets +10%)
                        if (article.sentiment && article.sentiment !== 'NEUTRAL') {
                            heat *= 1.1;
                        }
                        hoursSinceArticle = (Date.now() - (((_b = article.publishedAt) === null || _b === void 0 ? void 0 : _b.getTime()) || Date.now())) / 3600000;
                        decayFactor = Math.exp(-config.decayConstant * hoursSinceArticle);
                        hoursSinceUpdate = (Date.now() - clusterDate.getTime()) / 3600000;
                        activityBoost = hoursSinceUpdate < config.activityBoostHours ? 1.3 : 1.0;
                        return [2 /*return*/, heat * decayFactor * activityBoost];
                }
            });
        });
    };
    // ============================================================
    // ENHANCEMENT 2: Cluster Evolution Tracking
    // ============================================================
    /**
     * Record heat history point for a cluster
     */
    StoryClusterStoreEnhanced.prototype.recordHeatHistory = function (clusterId, heatScore, articleCount, uniqueTitleCount) {
        return __awaiter(this, void 0, void 0, function () {
            var now, lastHistory, velocity;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            now = new Date().toISOString();
                            lastHistory = this.db.prepare("\n                SELECT heat_score FROM cluster_heat_history\n                WHERE cluster_id = ?\n                ORDER BY timestamp DESC LIMIT 1\n            ").get(clusterId);
                            velocity = lastHistory ? heatScore - lastHistory.heat_score : 0;
                            this.db.prepare("\n                INSERT INTO cluster_heat_history\n                (cluster_id, heat_score, article_count, unique_title_count, velocity, timestamp)\n                VALUES (?, ?, ?, ?, ?, ?)\n            ").run(clusterId, heatScore, articleCount, uniqueTitleCount, velocity, now);
                            // Update cluster with current velocity
                            this.db.prepare("\n                UPDATE story_clusters\n                SET heat_velocity = ?,\n                    updated_at = ?\n                WHERE id = ?\n            ").run(velocity, now, clusterId);
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to record heat history:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get heat history for a cluster
     */
    StoryClusterStoreEnhanced.prototype.getHeatHistory = function (clusterId_1) {
        return __awaiter(this, arguments, void 0, function (clusterId, limit) {
            var rows;
            if (limit === void 0) { limit = 100; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            rows = this.db.prepare("\n                SELECT * FROM cluster_heat_history\n                WHERE cluster_id = ?\n                ORDER BY timestamp DESC\n                LIMIT ?\n            ").all(clusterId, limit);
                            return [2 /*return*/, rows.map(function (row) { return ({
                                    id: row.id,
                                    clusterId: row.cluster_id,
                                    heatScore: row.heat_score,
                                    articleCount: row.article_count,
                                    uniqueTitleCount: row.unique_title_count,
                                    velocity: row.velocity,
                                    timestamp: new Date(row.timestamp)
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to get heat history:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Analyze cluster heat trajectory
     */
    StoryClusterStoreEnhanced.prototype.analyzeHeatTrend = function (clusterId_1) {
        return __awaiter(this, arguments, void 0, function (clusterId, windowHours) {
            var cutoff, rows, velocities, acceleration, recentVelocity, avgVelocity, trend, predictedTrajectory, confidence, currentHeat, maxHeat, heatRatio, lifecycleStage;
            if (windowHours === void 0) { windowHours = 6; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db) {
                            return [2 /*return*/, this.getEmptyHeatAnalysis(clusterId)];
                        }
                        try {
                            cutoff = new Date(Date.now() - (windowHours * 3600000)).toISOString();
                            rows = this.db.prepare("\n                SELECT heat_score, velocity, timestamp\n                FROM cluster_heat_history\n                WHERE cluster_id = ? AND timestamp > ?\n                ORDER BY timestamp ASC\n            ").all(clusterId, cutoff);
                            if (rows.length < 3) {
                                return [2 /*return*/, this.getEmptyHeatAnalysis(clusterId)];
                            }
                            velocities = rows.map(function (r) { return r.velocity; });
                            acceleration = velocities.length > 1 ?
                                (velocities[velocities.length - 1] - velocities[0]) / velocities.length : 0;
                            recentVelocity = velocities[velocities.length - 1];
                            avgVelocity = velocities.reduce(function (a, b) { return a + b; }, 0) / velocities.length;
                            trend = void 0;
                            if (acceleration > 0.5) {
                                trend = 'ACCELERATING';
                            }
                            else if (acceleration < -0.5) {
                                trend = 'DECELERATING';
                            }
                            else {
                                trend = 'STABLE';
                            }
                            predictedTrajectory = void 0;
                            confidence = Math.min(1, velocities.length / 24);
                            if (acceleration > 2 && recentVelocity > 10) {
                                predictedTrajectory = 'SPIKE';
                            }
                            else if (acceleration > 0 && recentVelocity > 0) {
                                predictedTrajectory = 'SUSTAINED';
                            }
                            else {
                                predictedTrajectory = 'DECAY';
                            }
                            currentHeat = rows[rows.length - 1].heat_score;
                            maxHeat = Math.max.apply(Math, rows.map(function (r) { return r.heat_score; }));
                            heatRatio = currentHeat / (maxHeat || 1);
                            lifecycleStage = void 0;
                            if (heatRatio < 0.3 && trend === 'ACCELERATING') {
                                lifecycleStage = 'EMERGING';
                            }
                            else if (heatRatio >= 0.7 && trend === 'STABLE') {
                                lifecycleStage = 'SUSTAINED';
                            }
                            else if (trend === 'DECELERATING') {
                                lifecycleStage = 'DECAYING';
                            }
                            else if (currentHeat < 5) {
                                lifecycleStage = 'DEAD';
                            }
                            else {
                                lifecycleStage = 'SUSTAINED';
                            }
                            return [2 /*return*/, {
                                    clusterId: clusterId,
                                    currentHeat: currentHeat,
                                    velocity: recentVelocity,
                                    acceleration: acceleration,
                                    trend: trend,
                                    predictedTrajectory: predictedTrajectory,
                                    confidence: confidence,
                                    lifecycleStage: lifecycleStage
                                }];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to analyze heat trend:', error);
                            return [2 /*return*/, this.getEmptyHeatAnalysis(clusterId)];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStoreEnhanced.prototype.getEmptyHeatAnalysis = function (clusterId) {
        return {
            clusterId: clusterId,
            currentHeat: 0,
            velocity: 0,
            acceleration: 0,
            trend: 'STABLE',
            predictedTrajectory: 'SUSTAINED',
            confidence: 0,
            lifecycleStage: 'SUSTAINED'
        };
    };
    // ============================================================
    // ENHANCEMENT 5: Entity Extraction & Linking
    // ============================================================
    /**
     * Find or create entity
     */
    StoryClusterStoreEnhanced.prototype.findOrCreateEntity = function (entityName, entityType) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizedName, now, existing, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, 0];
                        try {
                            normalizedName = entityName.toLowerCase().trim();
                            now = new Date().toISOString();
                            existing = this.db.prepare('SELECT id, occurrence_count FROM named_entities WHERE normalized_name = ?')
                                .get(normalizedName);
                            if (existing) {
                                // Update last_seen and count
                                this.db.prepare("\n                    UPDATE named_entities\n                    SET last_seen = ?,\n                        occurrence_count = occurrence_count + 1\n                    WHERE id = ?\n                ").run(now, existing.id);
                                return [2 /*return*/, existing.id];
                            }
                            result = this.db.prepare("\n                INSERT INTO named_entities\n                (entity_name, entity_type, normalized_name, first_seen, last_seen, occurrence_count)\n                VALUES (?, ?, ?, ?, ?, 1)\n            ").run(entityName, entityType, normalizedName, now, now);
                            return [2 /*return*/, result.lastInsertRowid];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to find/create entity:', error);
                            return [2 /*return*/, 0];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Link entity to article
     */
    StoryClusterStoreEnhanced.prototype.linkEntityToArticle = function (entityId_1, articleId_1) {
        return __awaiter(this, arguments, void 0, function (entityId, articleId, confidence) {
            var now;
            if (confidence === void 0) { confidence = 1.0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            now = new Date().toISOString();
                            this.db.prepare("\n                INSERT OR IGNORE INTO entity_article_links\n                (entity_id, article_id, confidence, extracted_at)\n                VALUES (?, ?, ?, ?)\n            ").run(entityId, articleId, confidence, now);
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to link entity to article:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Update entity-cluster heat contribution
     */
    StoryClusterStoreEnhanced.prototype.updateEntityClusterHeat = function (entityId, clusterId, heatContribution) {
        return __awaiter(this, void 0, void 0, function () {
            var now, existing;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            now = new Date().toISOString();
                            existing = this.db.prepare("\n                SELECT article_count, heat_contribution FROM entity_cluster_links\n                WHERE entity_id = ? AND cluster_id = ?\n            ").get(entityId, clusterId);
                            if (existing) {
                                this.db.prepare("\n                    UPDATE entity_cluster_links\n                    SET article_count = article_count + 1,\n                        heat_contribution = heat_contribution + ?,\n                        last_linked = ?\n                    WHERE entity_id = ? AND cluster_id = ?\n                ").run(heatContribution, now, entityId, clusterId);
                            }
                            else {
                                this.db.prepare("\n                    INSERT INTO entity_cluster_links\n                    (entity_id, cluster_id, article_count, heat_contribution, first_linked, last_linked)\n                    VALUES (?, ?, 1, ?, ?, ?)\n                ").run(entityId, clusterId, heatContribution, now, now);
                            }
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to update entity cluster heat:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get trending entities
     */
    StoryClusterStoreEnhanced.prototype.getTrendingEntities = function () {
        return __awaiter(this, arguments, void 0, function (limit, hours) {
            var cutoff_1, rows;
            var _this = this;
            if (limit === void 0) { limit = 20; }
            if (hours === void 0) { hours = 24; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            cutoff_1 = new Date(Date.now() - (hours * 3600000)).toISOString();
                            rows = this.db.prepare("\n                SELECT\n                    e.id as entity_id,\n                    e.entity_name,\n                    e.entity_type,\n                    SUM(ecl.heat_contribution) as total_heat,\n                    COUNT(DISTINCT ecl.cluster_id) as cluster_count\n                FROM named_entities e\n                JOIN entity_cluster_links ecl ON e.id = ecl.entity_id\n                JOIN story_clusters sc ON ecl.cluster_id = sc.id\n                WHERE sc.updated_at > ?\n                GROUP BY e.id\n                ORDER BY total_heat DESC\n                LIMIT ?\n            ").all(cutoff_1, limit);
                            return [2 /*return*/, rows.map(function (row) {
                                    // Determine trending direction based on recent activity
                                    var recentRows = _this.db.prepare("\n                    SELECT COUNT(*) as count\n                    FROM entity_cluster_links ecl\n                    JOIN story_clusters sc ON ecl.cluster_id = sc.id\n                    WHERE ecl.entity_id = ? AND sc.updated_at > ?\n                ").get(row.entity_id, cutoff_1);
                                    var trendingDirection = ((recentRows === null || recentRows === void 0 ? void 0 : recentRows.count) || 0) > 5 ? 'UP' : 'NEUTRAL';
                                    return {
                                        entityId: row.entity_id,
                                        entityName: row.entity_name,
                                        entityType: row.entity_type,
                                        totalHeat: row.total_heat,
                                        clusterCount: row.cluster_count,
                                        trendingDirection: trendingDirection,
                                        lastUpdated: new Date()
                                    };
                                })];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to get trending entities:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================
    // ENHANCEMENT 4: Cross-category Linking
    // ============================================================
    /**
     * Create cross-reference between clusters
     */
    StoryClusterStoreEnhanced.prototype.createCrossRef = function (sourceClusterId_1, targetClusterId_1, referenceType_1) {
        return __awaiter(this, arguments, void 0, function (sourceClusterId, targetClusterId, referenceType, confidence) {
            var now;
            if (confidence === void 0) { confidence = 0.5; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        if (sourceClusterId === targetClusterId)
                            return [2 /*return*/];
                        try {
                            now = new Date().toISOString();
                            this.db.prepare("\n                INSERT OR IGNORE INTO cluster_cross_refs\n                (source_cluster_id, target_cluster_id, reference_type, confidence, created_at)\n                VALUES (?, ?, ?, ?, ?)\n            ").run(sourceClusterId, targetClusterId, referenceType, confidence, now);
                            // Mark clusters as cross-category
                            this.db.prepare("\n                UPDATE story_clusters\n                SET is_cross_category = 1\n                WHERE id IN (?, ?)\n            ").run(sourceClusterId, targetClusterId);
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to create cross-ref:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Create parent-child hierarchy
     */
    StoryClusterStoreEnhanced.prototype.createHierarchy = function (parentClusterId, childClusterId, relationshipType) {
        return __awaiter(this, void 0, void 0, function () {
            var now;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        if (parentClusterId === childClusterId)
                            return [2 /*return*/];
                        try {
                            now = new Date().toISOString();
                            this.db.prepare("\n                INSERT OR IGNORE INTO cluster_hierarchy\n                (parent_cluster_id, child_cluster_id, relationship_type, created_at)\n                VALUES (?, ?, ?, ?)\n            ").run(parentClusterId, childClusterId, relationshipType, now);
                            // Update child cluster parent reference
                            this.db.prepare("\n                UPDATE story_clusters\n                SET parent_cluster_id = ?\n                WHERE id = ?\n            ").run(parentClusterId, childClusterId);
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to create hierarchy:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get related clusters across categories
     */
    StoryClusterStoreEnhanced.prototype.getRelatedClusters = function (clusterId_1) {
        return __awaiter(this, arguments, void 0, function (clusterId, limit) {
            var rows;
            if (limit === void 0) { limit = 10; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            rows = this.db.prepare("\n                SELECT * FROM cluster_cross_refs\n                WHERE source_cluster_id = ? OR target_cluster_id = ?\n                ORDER BY confidence DESC\n                LIMIT ?\n            ").all(clusterId, clusterId, limit);
                            return [2 /*return*/, rows.map(function (row) { return ({
                                    id: row.id,
                                    sourceClusterId: row.source_cluster_id,
                                    targetClusterId: row.target_cluster_id,
                                    referenceType: row.reference_type,
                                    confidence: row.confidence,
                                    createdAt: new Date(row.created_at)
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to get related clusters:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================
    // ENHANCEMENT 3: Multi-dimensional Ranking
    // ============================================================
    /**
     * Calculate composite rank score for cluster
     */
    StoryClusterStoreEnhanced.prototype.calculateCompositeRank = function (clusterId) {
        return __awaiter(this, void 0, void 0, function () {
            var row, maxHeat, maxArticleCount, maxVelocity, heatNorm, countNorm, velocityNorm, entityNorm, authorityNorm, compositeScore;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, null];
                        try {
                            row = this.db.prepare("\n                SELECT\n                    sc.*,\n                    (SELECT SUM(heat_contribution) FROM entity_cluster_links WHERE cluster_id = sc.id) as entity_heat\n                FROM story_clusters sc\n                WHERE sc.id = ?\n            ").get(clusterId);
                            if (!row)
                                return [2 /*return*/, null];
                            maxHeat = 1000;
                            maxArticleCount = 50;
                            maxVelocity = 100;
                            heatNorm = Math.min(1, row.heat_score / maxHeat);
                            countNorm = Math.min(1, row.article_count / maxArticleCount);
                            velocityNorm = Math.min(1, Math.abs(row.heat_velocity || 0) / maxVelocity);
                            entityNorm = Math.min(1, (row.entity_heat || 0) / 100);
                            authorityNorm = row.source_authority_score || 1;
                            compositeScore = (heatNorm * 0.30 + // Heat is most important
                                countNorm * 0.25 + // Article count matters
                                velocityNorm * 0.15 + // Trending velocity
                                entityNorm * 0.15 + // Entity relevance
                                authorityNorm * 0.15 // Source authority
                            );
                            // Save composite score
                            this.db.prepare("\n                UPDATE story_clusters\n                SET composite_rank_score = ?\n                WHERE id = ?\n            ").run(compositeScore, clusterId);
                            return [2 /*return*/, {
                                    clusterId: clusterId,
                                    heatScore: row.heat_score,
                                    articleCount: row.article_count,
                                    sentimentVelocity: row.sentiment_velocity || 0,
                                    sourceAuthorityScore: authorityNorm,
                                    marketCorrelationScore: row.market_correlation_score,
                                    entityHeatScore: row.entity_heat || 0,
                                    compositeScore: compositeScore,
                                    category: row.category
                                }];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to calculate composite rank:', error);
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================
    // ENHANCEMENT 9: Anomaly Detection
    // ============================================================
    /**
     * Detect anomalies in cluster heat patterns
     */
    StoryClusterStoreEnhanced.prototype.detectHeatAnomalies = function (clusterId) {
        return __awaiter(this, void 0, void 0, function () {
            var history_1, heats, mean_1, stdDev, currentHeat, zScore, isAnomaly, anomalyType, anomalyScore, velocities, avgVelocity, currentVelocity, detection, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db) {
                            return [2 /*return*/, { clusterId: clusterId, isAnomaly: false, anomalyScore: 0, detectedAt: new Date() }];
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.getHeatHistory(clusterId, 24)];
                    case 3:
                        history_1 = _a.sent();
                        if (history_1.length < 5) {
                            return [2 /*return*/, { clusterId: clusterId, isAnomaly: false, anomalyScore: 0, detectedAt: new Date() }];
                        }
                        heats = history_1.map(function (h) { return h.heatScore; });
                        mean_1 = heats.reduce(function (a, b) { return a + b; }, 0) / heats.length;
                        stdDev = Math.sqrt(heats.reduce(function (sq, n) { return sq + Math.pow(n - mean_1, 2); }, 0) / heats.length);
                        currentHeat = heats[0];
                        zScore = stdDev > 0 ? (currentHeat - mean_1) / stdDev : 0;
                        isAnomaly = false;
                        anomalyType = void 0;
                        anomalyScore = Math.abs(zScore);
                        if (zScore > 3) {
                            isAnomaly = true;
                            anomalyType = 'SUDDEN_SPIKE';
                        }
                        else if (zScore < -3) {
                            isAnomaly = true;
                            anomalyType = 'SUDDEN_DROP';
                        }
                        velocities = history_1.map(function (h) { return h.velocity; });
                        avgVelocity = velocities.reduce(function (a, b) { return a + b; }, 0) / velocities.length;
                        currentVelocity = velocities[0];
                        if (Math.abs(currentVelocity - avgVelocity) > 2 * stdDev) {
                            isAnomaly = true;
                            anomalyType = (anomalyType || 'VELOCITY_ANOMALY');
                            anomalyScore = Math.max(anomalyScore, Math.abs(currentVelocity - avgVelocity) / stdDev);
                        }
                        detection = {
                            clusterId: clusterId,
                            isAnomaly: isAnomaly,
                            anomalyType: anomalyType,
                            anomalyScore: anomalyScore,
                            detectedAt: new Date()
                        };
                        // Update cluster
                        if (isAnomaly) {
                            this.db.prepare("\n                    UPDATE story_clusters\n                    SET is_anomaly = 1,\n                        anomaly_type = ?,\n                        anomaly_score = ?\n                    WHERE id = ?\n                ").run(anomalyType, anomalyScore, clusterId);
                        }
                        else {
                            this.db.prepare("\n                    UPDATE story_clusters\n                    SET is_anomaly = 0,\n                        anomaly_type = NULL,\n                        anomaly_score = 0\n                    WHERE id = ?\n                ").run(clusterId);
                        }
                        return [2 /*return*/, detection];
                    case 4:
                        error_3 = _a.sent();
                        logger_1.default.error('[StoryClusterStoreEnhanced] Failed to detect anomalies:', error_3);
                        return [2 /*return*/, { clusterId: clusterId, isAnomaly: false, anomalyScore: 0, detectedAt: new Date() }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    // ============================================================
    // ENHANCEMENT 10: Performance Monitoring
    // ============================================================
    /**
     * Record clustering metric
     */
    StoryClusterStoreEnhanced.prototype.recordClusteringMetric = function (metricType, value, category, sampleSize, notes) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            this.db.prepare("\n                INSERT INTO clustering_metrics\n                (metric_type, category, value, sample_size, calculated_at, notes)\n                VALUES (?, ?, ?, ?, ?, ?)\n            ").run(metricType, category, value, sampleSize, new Date().toISOString(), notes || null);
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to record clustering metric:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Record label quality feedback
     */
    StoryClusterStoreEnhanced.prototype.recordLabelQuality = function (articleId, labelType, originalLabel, correctedLabel, accuracyScore, feedbackSource) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            this.db.prepare("\n                INSERT INTO label_quality_tracking\n                (article_id, label_type, original_label, corrected_label, accuracy_score, feedback_source, created_at)\n                VALUES (?, ?, ?, ?, ?, ?, ?)\n            ").run(articleId, labelType, originalLabel, correctedLabel, accuracyScore, feedbackSource, new Date().toISOString());
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to record label quality:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get clustering quality summary
     */
    StoryClusterStoreEnhanced.prototype.getClusteringQualitySummary = function () {
        return __awaiter(this, arguments, void 0, function (hours) {
            var cutoff, rows, summary_1;
            if (hours === void 0) { hours = 24; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, {}];
                        try {
                            cutoff = new Date(Date.now() - (hours * 3600000)).toISOString();
                            rows = this.db.prepare("\n                SELECT\n                    metric_type,\n                    AVG(value) as avg_value,\n                    COUNT(*) as sample_count\n                FROM clustering_metrics\n                WHERE calculated_at > ?\n                GROUP BY metric_type\n            ").all(cutoff);
                            summary_1 = {};
                            rows.forEach(function (row) {
                                summary_1[row.metric_type] = {
                                    average: row.avg_value,
                                    sampleCount: row.sample_count
                                };
                            });
                            return [2 /*return*/, summary_1];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to get quality summary:', error);
                            return [2 /*return*/, {}];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get hot clusters (copied from original store for API compatibility)
     */
    StoryClusterStoreEnhanced.prototype.getHotClusters = function () {
        return __awaiter(this, arguments, void 0, function (limit, sinceHours, category) {
            var cutoff, query, params, rows;
            var _a;
            if (limit === void 0) { limit = 20; }
            if (sinceHours === void 0) { sinceHours = 24; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            cutoff = new Date(Date.now() - (sinceHours * 60 * 60 * 1000)).toISOString();
                            query = "\n                SELECT * FROM story_clusters \n                WHERE updated_at > ?\n            ";
                            params = [cutoff];
                            if (category && category !== 'ALL') {
                                query += " AND category = ?";
                                params.push(category);
                            }
                            query += " ORDER BY heat_score DESC LIMIT ?";
                            params.push(limit);
                            rows = (_a = this.db.prepare(query)).all.apply(_a, params);
                            return [2 /*return*/, rows.map(function (row) { return ({
                                    id: row.id,
                                    topic: row.topic,
                                    topicKey: row.topic_key || undefined,
                                    summary: row.summary,
                                    category: row.category,
                                    keywords: JSON.parse(row.keywords || '[]'),
                                    heatScore: row.heat_score,
                                    articleCount: row.article_count,
                                    uniqueTitleCount: row.unique_title_count || row.article_count,
                                    trendDirection: row.trend_direction || 'NEUTRAL',
                                    urgency: row.urgency || 'MEDIUM',
                                    subEventType: row.sub_event_type || undefined,
                                    firstSeen: row.first_seen ? new Date(row.first_seen) : undefined,
                                    createdAt: new Date(row.created_at),
                                    updatedAt: new Date(row.updated_at)
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStoreEnhanced] Failed to get hot clusters:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    return StoryClusterStoreEnhanced;
}());
var storyClusterStoreEnhanced = new StoryClusterStoreEnhanced();
exports.default = storyClusterStoreEnhanced;
