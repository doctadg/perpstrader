"use strict";
// Story Cluster Store - SQLite
// Manages metadata for news story clusters/events
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
var StoryClusterStore = /** @class */ (function () {
    function StoryClusterStore() {
        this.db = null;
        this.initialized = false;
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }
    StoryClusterStore.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.initialized)
                    return [2 /*return*/];
                try {
                    this.db = new better_sqlite3_1.default(this.dbPath);
                    this.db.pragma('journal_mode = WAL');
                    this.db.exec("\n                CREATE TABLE IF NOT EXISTS story_clusters (\n                    id TEXT PRIMARY KEY,\n                    topic TEXT NOT NULL,\n                    topic_key TEXT,\n                    summary TEXT,\n                    category TEXT NOT NULL,\n                    keywords TEXT,\n                    heat_score REAL DEFAULT 0,\n                    article_count INTEGER DEFAULT 0,\n                    trend_direction TEXT DEFAULT 'NEUTRAL',\n                    urgency TEXT DEFAULT 'MEDIUM',\n                    sub_event_type TEXT,\n                    first_seen TEXT,\n                    created_at TEXT NOT NULL,\n                    updated_at TEXT NOT NULL\n                )\n            ");
                    this.db.exec("\n                CREATE TABLE IF NOT EXISTS cluster_articles (\n                    cluster_id TEXT NOT NULL,\n                    article_id TEXT NOT NULL,\n                    added_at TEXT NOT NULL,\n                    trend_direction TEXT DEFAULT 'NEUTRAL',\n                    PRIMARY KEY (cluster_id, article_id),\n                    FOREIGN KEY(cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE\n                )\n            ");
                    // Table for tracking title fingerprints within clusters (for duplicate detection)
                    this.db.exec("\n                CREATE TABLE IF NOT EXISTS cluster_title_fingerprints (\n                    cluster_id TEXT NOT NULL,\n                    title_fingerprint TEXT NOT NULL,\n                    count INTEGER DEFAULT 1,\n                    first_seen TEXT NOT NULL,\n                    PRIMARY KEY (cluster_id, title_fingerprint),\n                    FOREIGN KEY(cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE\n                )\n            ");
                    this.db.exec("\n                CREATE INDEX IF NOT EXISTS idx_clusters_heat \n                ON story_clusters(heat_score DESC)\n            ");
                    this.db.exec("\n                CREATE INDEX IF NOT EXISTS idx_clusters_updated \n                ON story_clusters(updated_at DESC)\n            ");
                    this.db.exec("\n                CREATE INDEX IF NOT EXISTS idx_clusters_category\n                ON story_clusters(category)\n            ");
                    this.db.exec("\n                CREATE INDEX IF NOT EXISTS idx_clusters_topic_key\n                ON story_clusters(topic_key)\n            ");
                    this.db.exec("\n                CREATE INDEX IF NOT EXISTS idx_title_fingerprints_cluster\n                ON cluster_title_fingerprints(cluster_id)\n            ");
                    this.ensureColumns();
                    this.initialized = true;
                    logger_1.default.info('[StoryClusterStore] Initialized successfully');
                }
                catch (error) {
                    logger_1.default.error('[StoryClusterStore] Initialization failed:', error);
                    this.db = null;
                }
                return [2 /*return*/];
            });
        });
    };
    StoryClusterStore.prototype.ensureColumns = function () {
        if (!this.db)
            return;
        var columns = new Set(this.db.prepare("PRAGMA table_info('story_clusters')").all()
            .map(function (row) { return row.name; }));
        var newColumns = [
            { name: 'topic_key', type: 'TEXT' },
            { name: 'trend_direction', type: 'TEXT DEFAULT "NEUTRAL"' },
            { name: 'urgency', type: 'TEXT DEFAULT "MEDIUM"' },
            { name: 'sub_event_type', type: 'TEXT' },
            { name: 'first_seen', type: 'TEXT' },
            { name: 'unique_title_count', type: 'INTEGER DEFAULT 0' },
        ];
        for (var _i = 0, newColumns_1 = newColumns; _i < newColumns_1.length; _i++) {
            var col = newColumns_1[_i];
            if (!columns.has(col.name)) {
                try {
                    this.db.exec("ALTER TABLE story_clusters ADD COLUMN ".concat(col.name, " ").concat(col.type));
                }
                catch (error) {
                    logger_1.default.warn("[StoryClusterStore] Failed to add ".concat(col.name, " column:"), error);
                }
            }
        }
        var articleColumns = new Set(this.db.prepare("PRAGMA table_info('cluster_articles')").all()
            .map(function (row) { return row.name; }));
        if (!articleColumns.has('trend_direction')) {
            try {
                this.db.exec('ALTER TABLE cluster_articles ADD COLUMN trend_direction TEXT DEFAULT "NEUTRAL"');
            }
            catch (error) {
                logger_1.default.warn('[StoryClusterStore] Failed to add trend_direction column to cluster_articles:', error);
            }
        }
    };
    /**
     * Normalize topic key for clustering while preserving semantic meaning.
     * Preserves colons, hyphens, and other meaningful separators to prevent
     * different topics from colliding due to over-aggressive normalization.
     */
    StoryClusterStore.prototype.normalizeTopicKey = function (raw) {
        if (!raw)
            return '';
        var normalized = raw.toLowerCase();
        // Replace ampersands
        normalized = normalized.replace(/&/g, ' and ');
        // Replace multiple spaces with single space, then convert to underscores
        normalized = normalized.replace(/\s+/g, ' ').trim();
        // Convert to topic key format: spaces to underscores, preserve meaningful separators
        // Keep: hyphens, colons, periods, plus signs (they often have semantic meaning)
        // Remove: quotes, parentheses, commas, slashes (use for uniformity)
        normalized = normalized
            .replace(/["'()\/\\]/g, '') // Remove quotes, parens, slashes
            .replace(/[,\s]+/g, '_') // Commas and spaces -> underscore
            .replace(/_+/g, '_') // Multiple underscores -> single
            .replace(/^_+|_+$/g, ''); // Trim underscores
        // Limit length but ensure we don't cut mid-word
        var maxLength = 180;
        if (normalized.length > maxLength) {
            // Find the last complete word within limit
            var truncated = normalized.slice(0, maxLength);
            var lastUnderscore = truncated.lastIndexOf('_');
            if (lastUnderscore > maxLength * 0.8) {
                normalized = truncated.slice(0, lastUnderscore);
            }
            else {
                normalized = truncated;
            }
        }
        return normalized;
    };
    StoryClusterStore.prototype.normalizeTopicKeyFromTopic = function (topic) {
        return this.normalizeTopicKey(topic || '');
    };
    StoryClusterStore.prototype.clearAllClusters = function () {
        return __awaiter(this, void 0, void 0, function () {
            var txn;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            txn = this.db.transaction(function () {
                                _this.db.exec('DELETE FROM cluster_articles;');
                                _this.db.exec('DELETE FROM story_clusters;');
                            });
                            txn();
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStore] Failed to clear clusters:', error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.upsertCluster = function (cluster) {
        return __awaiter(this, void 0, void 0, function () {
            var now, existing, createdAt, firstSeen;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            now = new Date().toISOString();
                            existing = this.db.prepare('SELECT created_at, first_seen FROM story_clusters WHERE id = ?').get(cluster.id);
                            createdAt = existing ? existing.created_at : now;
                            firstSeen = (existing === null || existing === void 0 ? void 0 : existing.first_seen) || now;
                            this.db.prepare("\n                INSERT OR REPLACE INTO story_clusters (\n                    id, topic, topic_key, summary, category, keywords,\n                    heat_score, article_count, unique_title_count, trend_direction, urgency,\n                    sub_event_type, first_seen, created_at, updated_at\n                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n            ").run(cluster.id, cluster.topic || 'Untitled Event', this.normalizeTopicKey(cluster.topicKey || this.normalizeTopicKeyFromTopic(cluster.topic || 'Untitled Event')), cluster.summary || null, cluster.category || 'GENERAL', JSON.stringify(cluster.keywords || []), cluster.heatScore || 0, cluster.articleCount || 1, cluster.uniqueTitleCount || cluster.articleCount || 1, cluster.trendDirection || 'NEUTRAL', cluster.urgency || 'MEDIUM', cluster.subEventType || null, firstSeen, createdAt, now);
                        }
                        catch (error) {
                            logger_1.default.error("[StoryClusterStore] Failed to upsert cluster ".concat(cluster.id, ":"), error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.getClusterIdByTopicKey = function (topic) {
        return __awaiter(this, void 0, void 0, function () {
            var key, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, null];
                        key = this.normalizeTopicKey(topic);
                        if (!key)
                            return [2 /*return*/, null];
                        try {
                            row = this.db.prepare("\n                SELECT id FROM story_clusters\n                WHERE topic_key = ?\n                ORDER BY updated_at DESC\n                LIMIT 1\n            ").get(key);
                            return [2 /*return*/, (row === null || row === void 0 ? void 0 : row.id) || null];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStore] Failed to get cluster by topic_key:', error);
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.getClusterById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, null];
                        try {
                            row = this.db.prepare('SELECT * FROM story_clusters WHERE id = ?').get(id);
                            if (!row)
                                return [2 /*return*/, null];
                            return [2 /*return*/, {
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
                                }];
                        }
                        catch (error) {
                            logger_1.default.error("[StoryClusterStore] Failed to get cluster by id ".concat(id, ":"), error);
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.addArticleToCluster = function (clusterId_1, articleId_1, titleFingerprint_1) {
        return __awaiter(this, arguments, void 0, function (clusterId, articleId, titleFingerprint, heatDelta, trendDirection) {
            var now_1, txn;
            var _this = this;
            if (heatDelta === void 0) { heatDelta = 0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, { wasNew: false, duplicateIndex: 0, penaltyMultiplier: 1.0 }];
                        try {
                            now_1 = new Date().toISOString();
                            txn = this.db.transaction(function () {
                                // Link article to cluster
                                var linkResult = _this.db.prepare("\n                    INSERT OR IGNORE INTO cluster_articles (cluster_id, article_id, added_at, trend_direction)\n                    VALUES (?, ?, ?, ?)\n                ").run(clusterId, articleId, now_1, trendDirection || 'NEUTRAL');
                                var wasNew = linkResult.changes > 0;
                                // Track title fingerprint for duplicate detection
                                var duplicateIndex = 0;
                                var penaltyMultiplier = 1.0;
                                if (wasNew && titleFingerprint) {
                                    // Check if this title fingerprint already exists in the cluster
                                    var existing = _this.db.prepare("\n                        SELECT count FROM cluster_title_fingerprints\n                        WHERE cluster_id = ? AND title_fingerprint = ?\n                    ").get(clusterId, titleFingerprint);
                                    if (existing) {
                                        // This is a duplicate title
                                        duplicateIndex = existing.count;
                                        _this.db.prepare("\n                            UPDATE cluster_title_fingerprints\n                            SET count = count + 1\n                            WHERE cluster_id = ? AND title_fingerprint = ?\n                        ").run(clusterId, titleFingerprint);
                                    }
                                    else {
                                        // First time seeing this title in this cluster
                                        _this.db.prepare("\n                            INSERT INTO cluster_title_fingerprints (cluster_id, title_fingerprint, count, first_seen)\n                            VALUES (?, ?, 1, ?)\n                        ").run(clusterId, titleFingerprint, now_1);
                                    }
                                    // Calculate penalty based on duplicate index
                                    // 0 = first unique, 1 = second occurrence, etc.
                                    var penalties = [1.0, 0.15, 0.05, 0.02];
                                    penaltyMultiplier = penalties[Math.min(duplicateIndex, penalties.length - 1)];
                                }
                                // Update cluster stats
                                var shouldBumpHeat = wasNew && penaltyMultiplier > 0.01;
                                var adjustedHeatDelta = heatDelta * penaltyMultiplier;
                                _this.db.prepare("\n                    UPDATE story_clusters\n                    SET article_count = (SELECT COUNT(*) FROM cluster_articles WHERE cluster_id = ?),\n                        unique_title_count = (SELECT COUNT(DISTINCT title_fingerprint) FROM cluster_articles ca\n                            JOIN cluster_title_fingerprints ctf ON ca.cluster_id = ctf.cluster_id\n                            WHERE ca.cluster_id = ?),\n                        updated_at = ?,\n                        heat_score = CASE\n                            WHEN ? THEN heat_score + ?\n                            ELSE heat_score\n                        END\n                    WHERE id = ?\n                ").run(clusterId, clusterId, now_1, shouldBumpHeat ? 1 : 0, adjustedHeatDelta, clusterId);
                                return { wasNew: wasNew, duplicateIndex: duplicateIndex, penaltyMultiplier: penaltyMultiplier };
                            });
                            return [2 /*return*/, txn()];
                        }
                        catch (error) {
                            logger_1.default.error("[StoryClusterStore] Failed to add article ".concat(articleId, " to cluster ").concat(clusterId, ":"), error);
                            return [2 /*return*/, { wasNew: false, duplicateIndex: 0, penaltyMultiplier: 1.0 }];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // Backward compatible method without title fingerprint
    StoryClusterStore.prototype.addArticleToClusterLegacy = function (clusterId_1, articleId_1) {
        return __awaiter(this, arguments, void 0, function (clusterId, articleId, heatDelta, trendDirection) {
            var now_2, txn;
            var _this = this;
            if (heatDelta === void 0) { heatDelta = 0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/];
                        try {
                            now_2 = new Date().toISOString();
                            txn = this.db.transaction(function () {
                                var linkResult = _this.db.prepare("\n                    INSERT OR IGNORE INTO cluster_articles (cluster_id, article_id, added_at, trend_direction)\n                    VALUES (?, ?, ?, ?)\n                ").run(clusterId, articleId, now_2, trendDirection || 'NEUTRAL');
                                var shouldBumpHeat = linkResult.changes > 0;
                                _this.db.prepare("\n                    UPDATE story_clusters\n                    SET article_count = (SELECT COUNT(*) FROM cluster_articles WHERE cluster_id = ?),\n                        updated_at = ?,\n                        heat_score = CASE\n                            WHEN ? THEN heat_score + ?\n                            ELSE heat_score\n                        END\n                    WHERE id = ?\n                ").run(clusterId, now_2, shouldBumpHeat ? 1 : 0, heatDelta, clusterId);
                            });
                            txn();
                        }
                        catch (error) {
                            logger_1.default.error("[StoryClusterStore] Failed to add article ".concat(articleId, " to cluster ").concat(clusterId, ":"), error);
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.getHotClusters = function () {
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
                            logger_1.default.error('[StoryClusterStore] Failed to get hot clusters:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.getClusterDetails = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var row, articleRows, articles;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, null];
                        try {
                            row = this.db.prepare('SELECT * FROM story_clusters WHERE id = ?').get(id);
                            if (!row)
                                return [2 /*return*/, null];
                            articleRows = this.db.prepare("\n                SELECT n.* FROM news_articles n\n                JOIN cluster_articles ca ON n.id = ca.article_id\n                WHERE ca.cluster_id = ?\n                ORDER BY n.created_at DESC\n            ").all(id);
                            articles = articleRows.map(function (r) { return ({
                                id: r.id,
                                title: r.title,
                                content: r.content,
                                summary: r.summary,
                                source: r.source,
                                url: r.url,
                                publishedAt: new Date(r.published_at),
                                categories: JSON.parse(r.categories || '[]'),
                                tags: JSON.parse(r.tags || '[]'),
                                sentiment: r.sentiment,
                                importance: r.importance,
                                snippet: r.snippet,
                                scrapedAt: new Date(r.scraped_at),
                                createdAt: new Date(r.created_at)
                            }); });
                            return [2 /*return*/, {
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
                                    updatedAt: new Date(row.updated_at),
                                    articles: articles
                                }];
                        }
                        catch (error) {
                            logger_1.default.error("[StoryClusterStore] Failed to get cluster details ".concat(id, ":"), error);
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.getClusterSampleTitles = function (clusterId_1) {
        return __awaiter(this, arguments, void 0, function (clusterId, limit) {
            var resolvedLimit, rows;
            if (limit === void 0) { limit = 5; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        if (!clusterId)
                            return [2 /*return*/, []];
                        resolvedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 20) : 5;
                        try {
                            rows = this.db.prepare("\n                SELECT n.title AS title\n                FROM news_articles n\n                JOIN cluster_articles ca ON n.id = ca.article_id\n                WHERE ca.cluster_id = ?\n                ORDER BY COALESCE(n.published_at, n.created_at) DESC\n                LIMIT ?\n            ").all(clusterId, resolvedLimit);
                            return [2 /*return*/, rows.map(function (r) { return r.title; }).filter(Boolean)];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStore] Failed to fetch cluster sample titles:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.mergeClusters = function (targetClusterId, sourceClusterId) {
        return __awaiter(this, void 0, void 0, function () {
            var now_3, txn;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, { moved: 0, deleted: false }];
                        if (!targetClusterId || !sourceClusterId)
                            return [2 /*return*/, { moved: 0, deleted: false }];
                        if (targetClusterId === sourceClusterId)
                            return [2 /*return*/, { moved: 0, deleted: false }];
                        try {
                            now_3 = new Date().toISOString();
                            txn = this.db.transaction(function () {
                                var sourceRow = _this.db.prepare('SELECT heat_score FROM story_clusters WHERE id = ?').get(sourceClusterId);
                                if (!sourceRow)
                                    return { moved: 0, deleted: false };
                                var insert = _this.db.prepare("\n                    INSERT OR IGNORE INTO cluster_articles (cluster_id, article_id, added_at)\n                    SELECT ?, article_id, ?\n                    FROM cluster_articles\n                    WHERE cluster_id = ?\n                ");
                                var insertResult = insert.run(targetClusterId, now_3, sourceClusterId);
                                var del = _this.db.prepare('DELETE FROM story_clusters WHERE id = ?').run(sourceClusterId);
                                _this.db.prepare("\n                    UPDATE story_clusters\n                    SET article_count = (SELECT COUNT(*) FROM cluster_articles WHERE cluster_id = ?),\n                        heat_score = heat_score + ?,\n                        updated_at = ?\n                    WHERE id = ?\n                ").run(targetClusterId, sourceRow.heat_score || 0, now_3, targetClusterId);
                                return { moved: insertResult.changes || 0, deleted: del.changes > 0 };
                            });
                            return [2 /*return*/, txn()];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStore] Failed to merge clusters:', error);
                            return [2 /*return*/, { moved: 0, deleted: false }];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.clusterExists = function (clusterId) {
        return __awaiter(this, void 0, void 0, function () {
            var row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, false];
                        if (!clusterId)
                            return [2 /*return*/, false];
                        try {
                            row = this.db.prepare('SELECT 1 AS ok FROM story_clusters WHERE id = ? LIMIT 1').get(clusterId);
                            return [2 /*return*/, !!(row === null || row === void 0 ? void 0 : row.ok)];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStore] Failed to check cluster existence:', error);
                            return [2 /*return*/, false];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    StoryClusterStore.prototype.findClusterIdsByArticleIds = function (articleIds) {
        return __awaiter(this, void 0, void 0, function () {
            var placeholders, rows;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db)
                            return [2 /*return*/, new Map()];
                        if (!articleIds.length)
                            return [2 /*return*/, new Map()];
                        try {
                            placeholders = articleIds.map(function () { return '?'; }).join(',');
                            rows = (_a = this.db.prepare("\n                SELECT cluster_id, article_id\n                FROM cluster_articles\n                WHERE article_id IN (".concat(placeholders, ")\n            "))).all.apply(_a, articleIds);
                            return [2 /*return*/, new Map(rows.map(function (row) { return [row.article_id, row.cluster_id]; }))];
                        }
                        catch (error) {
                            logger_1.default.error('[StoryClusterStore] Failed to find clusters by article ids:', error);
                            return [2 /*return*/, new Map()];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    return StoryClusterStore;
}());
var storyClusterStore = new StoryClusterStore();
exports.default = storyClusterStore;
