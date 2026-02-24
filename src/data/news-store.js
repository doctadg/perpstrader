"use strict";
// News Store Service - SQLite (FTS5-backed keyword search)
// Stores and retrieves global news articles for autonomous newsfeed
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
var crypto_1 = require("crypto");
var NewsStore = /** @class */ (function () {
    function NewsStore() {
        this.db = null;
        this.initialized = false;
        this.ftsEnabled = false;
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }
    NewsStore.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.initialized)
                    return [2 /*return*/];
                try {
                    logger_1.default.info('Initializing news database...');
                    this.db = new better_sqlite3_1.default(this.dbPath);
                    this.db.pragma('journal_mode = WAL');
                    this.db.exec("\n        CREATE TABLE IF NOT EXISTS news_articles (\n          id TEXT PRIMARY KEY,\n          title TEXT NOT NULL,\n          content TEXT,\n          source TEXT NOT NULL,\n          url TEXT NOT NULL,\n          published_at TEXT,\n          categories TEXT NOT NULL,\n          categories_flat TEXT NOT NULL,\n          tags TEXT NOT NULL,\n          tags_flat TEXT NOT NULL,\n          market_links TEXT,\n          market_links_flat TEXT,\n          sentiment TEXT NOT NULL,\n          importance TEXT NOT NULL,\n          snippet TEXT,\n          summary TEXT,\n          scraped_at TEXT NOT NULL,\n          created_at TEXT NOT NULL,\n          url_hash TEXT NOT NULL UNIQUE,\n          metadata TEXT\n        )\n      ");
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_news_created_at\n        ON news_articles(created_at)\n      ");
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_news_published_at\n        ON news_articles(published_at)\n      ");
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_news_url_hash\n        ON news_articles(url_hash)\n      ");
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_news_categories_flat\n        ON news_articles(categories_flat)\n      ");
                    this.ensureMarketLinkColumns();
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_news_market_links_flat\n        ON news_articles(market_links_flat)\n      ");
                    this.setupFts();
                    this.initialized = true;
                    logger_1.default.info('News database initialized successfully');
                }
                catch (error) {
                    logger_1.default.error('Failed to initialize news database:', (error === null || error === void 0 ? void 0 : error.message) || error);
                    this.db = null;
                }
                return [2 /*return*/];
            });
        });
    };
    NewsStore.prototype.setupFts = function () {
        if (!this.db)
            return;
        try {
            this.db.exec("\n        CREATE VIRTUAL TABLE IF NOT EXISTS news_articles_fts\n        USING fts5(\n          title,\n          content,\n          snippet,\n          summary,\n          tags,\n          categories,\n          id UNINDEXED\n        )\n      ");
            this.ftsEnabled = true;
        }
        catch (error) {
            this.ftsEnabled = false;
            logger_1.default.warn('[NewsStore] FTS5 not available, falling back to LIKE search');
        }
    };
    NewsStore.prototype.createUrlHash = function (url) {
        return crypto_1.default.createHash('md5').update(url).digest('hex');
    };
    NewsStore.prototype.formatFlat = function (values) {
        return values.length ? "|".concat(values.join('|'), "|") : '|';
    };
    NewsStore.prototype.parseJsonArray = function (value) {
        if (!value)
            return [];
        try {
            return JSON.parse(value);
        }
        catch (error) {
            return [];
        }
    };
    NewsStore.prototype.sanitizeFtsQuery = function (query) {
        var tokens = query
            .replace(/["'`]/g, ' ')
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .map(function (token) { return token.trim(); })
            .filter(Boolean);
        if (!tokens.length)
            return '';
        return tokens.map(function (token) { return "\"".concat(token, "\""); }).join(' OR ');
    };
    NewsStore.prototype.ensureMarketLinkColumns = function () {
        if (!this.db)
            return;
        var columns = new Set(this.db.prepare("PRAGMA table_info('news_articles')").all()
            .map(function (row) { return row.name; }));
        if (!columns.has('market_links')) {
            try {
                this.db.exec('ALTER TABLE news_articles ADD COLUMN market_links TEXT');
            }
            catch (error) {
                logger_1.default.warn('[NewsStore] Failed to add market_links column:', error);
            }
        }
        if (!columns.has('market_links_flat')) {
            try {
                this.db.exec('ALTER TABLE news_articles ADD COLUMN market_links_flat TEXT');
            }
            catch (error) {
                logger_1.default.warn('[NewsStore] Failed to add market_links_flat column:', error);
            }
        }
    };
    NewsStore.prototype.toNewsItem = function (row) {
        var categories = this.parseJsonArray(row.categories);
        var tags = this.parseJsonArray(row.tags);
        var marketLinks = this.parseJsonArray(row.market_links);
        var metadata;
        if (row.metadata) {
            try {
                metadata = JSON.parse(row.metadata);
            }
            catch (error) {
                metadata = undefined;
            }
        }
        return {
            id: row.id,
            title: row.title,
            content: row.content || undefined,
            summary: row.summary || undefined,
            source: row.source,
            url: row.url,
            publishedAt: row.published_at ? new Date(row.published_at) : undefined,
            categories: categories,
            tags: tags,
            sentiment: row.sentiment,
            importance: row.importance,
            snippet: row.snippet || row.title,
            scrapedAt: new Date(row.scraped_at),
            createdAt: new Date(row.created_at),
            marketLinks: marketLinks,
            metadata: metadata,
        };
    };
    NewsStore.prototype.storeNews = function (articles) {
        return __awaiter(this, void 0, void 0, function () {
            var storedIds, duplicateUrls, insert, insertFts, insertBatch;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            throw new Error('News database not initialized');
                        storedIds = [];
                        duplicateUrls = [];
                        insert = this.db.prepare("\n      INSERT OR IGNORE INTO news_articles (\n        id,\n        title,\n        content,\n        source,\n        url,\n        published_at,\n        categories,\n        categories_flat,\n        tags,\n        tags_flat,\n        market_links,\n        market_links_flat,\n        sentiment,\n        importance,\n        snippet,\n        summary,\n        scraped_at,\n        created_at,\n        url_hash,\n        metadata\n      ) VALUES (\n        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?\n      )\n    ");
                        insertFts = this.ftsEnabled
                            ? this.db.prepare("\n        INSERT INTO news_articles_fts (\n          title,\n          content,\n          snippet,\n          summary,\n          tags,\n          categories,\n          id\n        ) VALUES (?, ?, ?, ?, ?, ?, ?)\n      ")
                            : null;
                        insertBatch = this.db.transaction(function (items) {
                            var _a;
                            for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                                var article = items_1[_i];
                                try {
                                    var id = article.id || crypto_1.default.randomUUID();
                                    var urlHash = _this.createUrlHash(article.url);
                                    var categories = article.categories || [];
                                    var tags = article.tags || [];
                                    var categoriesJson = JSON.stringify(categories);
                                    var tagsJson = JSON.stringify(tags);
                                    var categoriesFlat = _this.formatFlat(categories);
                                    var tagsFlat = _this.formatFlat(tags);
                                    var marketLinks = article.marketLinks || ((_a = article.metadata) === null || _a === void 0 ? void 0 : _a.marketLinks) || [];
                                    var marketLinksJson = JSON.stringify(marketLinks);
                                    var marketLinkTokens = marketLinks
                                        .flatMap(function (link) { return [link.marketId, link.marketSlug]; })
                                        .filter(function (value) { return !!value; });
                                    var marketLinksFlat = _this.formatFlat(marketLinkTokens);
                                    // Safely convert dates to ISO strings - handle undefined/null
                                    var publishedAtIso = null;
                                    if (article.publishedAt instanceof Date && !isNaN(article.publishedAt.getTime())) {
                                        publishedAtIso = article.publishedAt.toISOString();
                                    }
                                    else if (typeof article.publishedAt === 'string' && article.publishedAt.length > 0) {
                                        publishedAtIso = article.publishedAt;
                                    }
                                    var scrapedAtIso = void 0;
                                    if (article.scrapedAt instanceof Date && !isNaN(article.scrapedAt.getTime())) {
                                        scrapedAtIso = article.scrapedAt.toISOString();
                                    }
                                    else if (typeof article.scrapedAt === 'string' && article.scrapedAt.length > 0) {
                                        scrapedAtIso = article.scrapedAt;
                                    }
                                    else {
                                        scrapedAtIso = new Date().toISOString();
                                    }
                                    var createdAtIso = void 0;
                                    if (article.createdAt instanceof Date && !isNaN(article.createdAt.getTime())) {
                                        createdAtIso = article.createdAt.toISOString();
                                    }
                                    else if (typeof article.createdAt === 'string' && article.createdAt.length > 0) {
                                        createdAtIso = article.createdAt;
                                    }
                                    else {
                                        createdAtIso = new Date().toISOString();
                                    }
                                    var result = insert.run(id, article.title, article.content || '', article.source, article.url, publishedAtIso, categoriesJson, categoriesFlat, tagsJson, tagsFlat, marketLinksJson, marketLinksFlat, article.sentiment, article.importance, article.snippet || '', article.summary || '', scrapedAtIso, createdAtIso, urlHash, article.metadata ? JSON.stringify(article.metadata) : null);
                                    if (result.changes === 0) {
                                        duplicateUrls.push(article.url);
                                        continue;
                                    }
                                    storedIds.push(id);
                                    if (insertFts) {
                                        insertFts.run(article.title, article.content || '', article.snippet || '', article.summary || '', tags.join(' '), categories.join(' '), id);
                                    }
                                }
                                catch (error) {
                                    logger_1.default.error("Failed to store article: ".concat(article.title), error);
                                }
                            }
                        });
                        insertBatch(articles);
                        if (storedIds.length > 0) {
                            logger_1.default.info("Stored ".concat(storedIds.length, " news articles, skipped ").concat(duplicateUrls.length, " duplicates"));
                        }
                        return [2 /*return*/, { stored: storedIds, duplicates: duplicateUrls }];
                }
            });
        });
    };
    NewsStore.prototype.getNewsSince = function (since_1) {
        return __awaiter(this, arguments, void 0, function (since, limit) {
            var resolvedLimit, sinceIso, rows;
            var _this = this;
            if (limit === void 0) { limit = 5000; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            resolvedLimit = Number.isFinite(limit) ? limit : 5000;
                            sinceIso = since.toISOString();
                            rows = this.db.prepare("\n        SELECT * FROM news_articles\n        WHERE created_at >= ?\n        ORDER BY created_at DESC\n        LIMIT ?\n      ").all(sinceIso, resolvedLimit);
                            return [2 /*return*/, rows.map(function (row) { return _this.toNewsItem(row); })];
                        }
                        catch (error) {
                            logger_1.default.error('Failed to get news since:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    NewsStore.prototype.getRecentNews = function () {
        return __awaiter(this, arguments, void 0, function (limit, category) {
            var resolvedLimit, rows;
            var _this = this;
            if (limit === void 0) { limit = 50; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            resolvedLimit = Number.isFinite(limit) ? limit : 50;
                            rows = (category
                                ? this.db.prepare("\n            SELECT * FROM news_articles\n            WHERE categories_flat LIKE ?\n            ORDER BY created_at DESC\n            LIMIT ?\n          ").all("%|".concat(category, "|%"), resolvedLimit)
                                : this.db.prepare("\n            SELECT * FROM news_articles\n            ORDER BY created_at DESC\n            LIMIT ?\n          ").all(resolvedLimit));
                            return [2 /*return*/, rows.map(function (row) { return _this.toNewsItem(row); })];
                        }
                        catch (error) {
                            logger_1.default.error('Failed to get recent news:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    NewsStore.prototype.getNewsByCategory = function (category_1) {
        return __awaiter(this, arguments, void 0, function (category, limit) {
            if (limit === void 0) { limit = 50; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.getRecentNews(limit, category)];
            });
        });
    };
    NewsStore.prototype.getNewsByMarket = function (marketId_1, marketSlug_1) {
        return __awaiter(this, arguments, void 0, function (marketId, marketSlug, limit) {
            var resolvedLimit, tokens, clauses, values, rows;
            var _a;
            var _this = this;
            if (limit === void 0) { limit = 30; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        resolvedLimit = Number.isFinite(limit) ? limit : 30;
                        tokens = [marketId, marketSlug].filter(Boolean);
                        if (tokens.length === 0)
                            return [2 /*return*/, []];
                        try {
                            clauses = tokens.map(function () { return 'market_links_flat LIKE ?'; }).join(' OR ');
                            values = tokens.map(function (token) { return "%|".concat(token, "|%"); });
                            rows = (_a = this.db.prepare("\n        SELECT * FROM news_articles\n        WHERE ".concat(clauses, "\n        ORDER BY created_at DESC\n        LIMIT ?\n      "))).all.apply(_a, __spreadArray(__spreadArray([], values, false), [resolvedLimit], false));
                            return [2 /*return*/, rows.map(function (row) { return _this.toNewsItem(row); })];
                        }
                        catch (error) {
                            logger_1.default.error('Failed to get news by market:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    NewsStore.prototype.searchNews = function (query_1) {
        return __awaiter(this, arguments, void 0, function (query, limit) {
            var trimmed, resolvedLimit, safeQuery, hits, ids, rows_1, rowMap_1, like, rows;
            var _a;
            var _this = this;
            if (limit === void 0) { limit = 20; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        trimmed = query.trim();
                        if (!trimmed)
                            return [2 /*return*/, []];
                        try {
                            resolvedLimit = Number.isFinite(limit) ? limit : 20;
                            if (this.ftsEnabled) {
                                safeQuery = this.sanitizeFtsQuery(trimmed);
                                if (safeQuery) {
                                    try {
                                        hits = this.db.prepare("\n              SELECT id FROM news_articles_fts\n              WHERE news_articles_fts MATCH ?\n              ORDER BY bm25(news_articles_fts)\n              LIMIT ?\n            ").all(safeQuery, resolvedLimit);
                                        if (!hits.length)
                                            return [2 /*return*/, []];
                                        ids = hits.map(function (hit) { return hit.id; });
                                        rows_1 = (_a = this.db.prepare("\n              SELECT * FROM news_articles\n              WHERE id IN (".concat(ids.map(function () { return '?'; }).join(','), ")\n            "))).all.apply(_a, ids);
                                        rowMap_1 = new Map(rows_1.map(function (row) { return [row.id, row]; }));
                                        return [2 /*return*/, ids.map(function (id) { return rowMap_1.get(id); }).filter(Boolean).map(function (row) { return _this.toNewsItem(row); })];
                                    }
                                    catch (error) {
                                        logger_1.default.warn('[NewsStore] FTS search failed, falling back to LIKE search');
                                    }
                                }
                            }
                            like = "%".concat(trimmed, "%");
                            rows = this.db.prepare("\n        SELECT * FROM news_articles\n        WHERE title LIKE ?\n          OR content LIKE ?\n          OR snippet LIKE ?\n          OR summary LIKE ?\n          OR tags_flat LIKE ?\n          OR categories_flat LIKE ?\n        ORDER BY created_at DESC\n        LIMIT ?\n      ").all(like, like, like, like, like, like, resolvedLimit);
                            return [2 /*return*/, rows.map(function (row) { return _this.toNewsItem(row); })];
                        }
                        catch (error) {
                            logger_1.default.error('Failed to search news:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    NewsStore.prototype.getTags = function () {
        return __awaiter(this, void 0, void 0, function () {
            var rows, tagSet_1, _i, rows_2, row, tags;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            rows = this.db.prepare("\n        SELECT tags FROM news_articles\n      ").all();
                            tagSet_1 = new Set();
                            for (_i = 0, rows_2 = rows; _i < rows_2.length; _i++) {
                                row = rows_2[_i];
                                tags = this.parseJsonArray(row.tags);
                                tags.forEach(function (tag) { return tagSet_1.add(tag); });
                            }
                            return [2 /*return*/, Array.from(tagSet_1).sort()];
                        }
                        catch (error) {
                            logger_1.default.error('Failed to get tags:', error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    NewsStore.prototype.getStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var rows, stats_1, tagSet_2, latestDate, _i, rows_3, row, categories, tags, dateValue, parsedDate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db) {
                            return [2 /*return*/, {
                                    total: 0,
                                    byCategory: {},
                                    byImportance: {},
                                    bySentiment: {},
                                    latestArticle: null,
                                    totalTags: 0,
                                }];
                        }
                        try {
                            rows = this.db.prepare("\n        SELECT categories, tags, importance, sentiment, published_at, created_at\n        FROM news_articles\n      ").all();
                            stats_1 = {
                                total: rows.length,
                                byCategory: {},
                                byImportance: {},
                                bySentiment: {},
                                latestArticle: null,
                                totalTags: 0,
                            };
                            tagSet_2 = new Set();
                            latestDate = null;
                            for (_i = 0, rows_3 = rows; _i < rows_3.length; _i++) {
                                row = rows_3[_i];
                                categories = this.parseJsonArray(row.categories);
                                tags = this.parseJsonArray(row.tags);
                                categories.forEach(function (category) {
                                    stats_1.byCategory[category] = (stats_1.byCategory[category] || 0) + 1;
                                });
                                stats_1.byImportance[row.importance] =
                                    (stats_1.byImportance[row.importance] || 0) + 1;
                                stats_1.bySentiment[row.sentiment] =
                                    (stats_1.bySentiment[row.sentiment] || 0) + 1;
                                tags.forEach(function (tag) { return tagSet_2.add(tag); });
                                dateValue = row.published_at || row.created_at;
                                parsedDate = new Date(dateValue);
                                if (!latestDate || parsedDate > latestDate) {
                                    latestDate = parsedDate;
                                }
                            }
                            stats_1.latestArticle = latestDate;
                            stats_1.totalTags = tagSet_2.size;
                            return [2 /*return*/, stats_1];
                        }
                        catch (error) {
                            logger_1.default.error('Failed to get stats:', error);
                            return [2 /*return*/, {
                                    total: 0,
                                    byCategory: {},
                                    byImportance: {},
                                    bySentiment: {},
                                    latestArticle: null,
                                    totalTags: 0,
                                }];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    NewsStore.prototype.getCount = function () {
        return __awaiter(this, void 0, void 0, function () {
            var row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, 0];
                        row = this.db.prepare('SELECT COUNT(*) as total FROM news_articles').get();
                        return [2 /*return*/, (row === null || row === void 0 ? void 0 : row.total) || 0];
                }
            });
        });
    };
    NewsStore.prototype.getArticleById = function (id) {
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
                            row = this.db.prepare('SELECT * FROM news_articles WHERE id = ?').get(id);
                            if (!row)
                                return [2 /*return*/, null];
                            return [2 /*return*/, this.toNewsItem(row)];
                        }
                        catch (error) {
                            logger_1.default.error("Failed to get article by id ".concat(id, ":"), error);
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    NewsStore.prototype.updateArticleSummary = function (id, summary) {
        return __awaiter(this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, false];
                        try {
                            result = this.db.prepare("\n        UPDATE news_articles \n        SET summary = ? \n        WHERE id = ?\n      ").run(summary, id);
                            if (this.ftsEnabled && result.changes > 0) {
                                this.db.prepare("\n          UPDATE news_articles_fts \n          SET summary = ? \n          WHERE id = ?\n        ").run(summary, id);
                            }
                            return [2 /*return*/, result.changes > 0];
                        }
                        catch (error) {
                            logger_1.default.error("Failed to update article summary for ".concat(id, ":"), error);
                            return [2 /*return*/, false];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    return NewsStore;
}());
var newsStore = new NewsStore();
exports.default = newsStore;
