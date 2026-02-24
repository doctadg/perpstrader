"use strict";
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
var better_sqlite3_1 = require("better-sqlite3");
var crypto_1 = require("crypto");
var config_1 = require("../shared/config");
var logger_1 = require("../shared/logger");
var openrouter_service_1 = require("../shared/openrouter-service");
var CATEGORY_SET = new Set([
    'CRYPTO',
    'STOCKS',
    'ECONOMICS',
    'GEOPOLITICS',
    'TECH',
    'COMMODITIES',
    'SPORTS',
    'FOOTBALL',
    'BASKETBALL',
    'TENNIS',
    'MMA',
    'GOLF',
]);
var HIGH_SIGNAL_TOKENS = new Set([
    'btc', 'eth', 'sol', 'xrp', 'ada', 'dot', 'avax', 'link', 'arb', 'op',
    'fed', 'fomc', 'cpi', 'pce', 'ppi', 'powell', 'ecb', 'boj', 'sec', 'etf',
    'nasdaq', 'spx', 'spy', 'dxy', 'oil', 'gold', 'silver', 'treasury', 'yield',
    'trump', 'china', 'us', 'uk', 'eu', 'opec', 'nvidia', 'tesla', 'apple',
]);
var STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'for', 'from',
    'has', 'have', 'had', 'he', 'her', 'his', 'i', 'if', 'in', 'into', 'is', 'it',
    'its', 'of', 'on', 'or', 's', 'she', 'that', 'the', 'their', 'them', 'they',
    'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your', 'new', 'latest',
    'update', 'updates', 'news', 'report', 'reports', 'says', 'say', 'amid', 'after',
    'before', 'over', 'under', 'during', 'about', 'market', 'markets', 'analysis',
]);
var NewsHeatmapService = /** @class */ (function () {
    function NewsHeatmapService() {
        this.db = null;
        this.initialized = false;
        this.cache = new Map();
        this.inFlight = new Map();
        this.clusterDetailCache = new Map();
        this.llmBlockedUntil = 0;
        this.llmConsecutiveEmpty = 0;
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
        this.cacheTtlMs = Number.parseInt(process.env.NEWS_HEATMAP_CACHE_MS || '15000', 10);
        this.maxArticleScan = Number.parseInt(process.env.NEWS_HEATMAP_MAX_ARTICLES || '1200', 10);
        this.maxLlmLabelArticles = Number.parseInt(process.env.NEWS_HEATMAP_MAX_LLM_ARTICLES || '450', 10);
        this.llmTimeoutMs = Math.max(1000, Number.parseInt(process.env.NEWS_HEATMAP_LLM_TIMEOUT_MS || '8000', 10));
        this.configuredLabelingModel = config_1.default.get().openrouter.labelingModel;
    }
    NewsHeatmapService.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.initialized)
                    return [2 /*return*/];
                try {
                    this.db = new better_sqlite3_1.default(this.dbPath);
                    this.db.pragma('journal_mode = WAL');
                    this.db.pragma('busy_timeout = 5000');
                    this.ensureSchema();
                    this.initialized = true;
                    logger_1.default.info('[NewsHeatmapService] Initialized');
                }
                catch (error) {
                    logger_1.default.error('[NewsHeatmapService] Initialization failed:', error);
                    this.db = null;
                }
                return [2 /*return*/];
            });
        });
    };
    NewsHeatmapService.prototype.ensureSchema = function () {
        if (!this.db)
            return;
        this.db.exec("\n      CREATE TABLE IF NOT EXISTS news_heatmap_state (\n        cluster_key TEXT PRIMARY KEY,\n        cluster_id TEXT NOT NULL,\n        category TEXT NOT NULL,\n        topic TEXT NOT NULL,\n        last_heat_score REAL NOT NULL,\n        last_article_count INTEGER NOT NULL,\n        last_velocity REAL NOT NULL,\n        last_sentiment_score REAL NOT NULL,\n        llm_coverage REAL NOT NULL,\n        updated_at TEXT NOT NULL\n      )\n    ");
        this.db.exec("\n      CREATE TABLE IF NOT EXISTS news_heatmap_history (\n        id INTEGER PRIMARY KEY AUTOINCREMENT,\n        cluster_key TEXT NOT NULL,\n        category TEXT NOT NULL,\n        topic TEXT NOT NULL,\n        heat_score REAL NOT NULL,\n        article_count INTEGER NOT NULL,\n        sentiment_score REAL NOT NULL,\n        velocity REAL NOT NULL,\n        llm_coverage REAL NOT NULL,\n        timestamp TEXT NOT NULL\n      )\n    ");
        this.db.exec("\n      CREATE INDEX IF NOT EXISTS idx_news_heatmap_state_updated\n      ON news_heatmap_state(updated_at DESC)\n    ");
        this.db.exec("\n      CREATE INDEX IF NOT EXISTS idx_news_heatmap_history_time\n      ON news_heatmap_history(timestamp DESC)\n    ");
        this.db.exec("\n      CREATE INDEX IF NOT EXISTS idx_news_heatmap_history_category\n      ON news_heatmap_history(category, timestamp DESC)\n    ");
    };
    NewsHeatmapService.prototype.normalizeCategory = function (rawCategory) {
        if (!rawCategory)
            return 'GENERAL';
        var normalized = rawCategory.toUpperCase();
        if (CATEGORY_SET.has(normalized)) {
            return normalized;
        }
        if (normalized === 'POLITICS')
            return 'GEOPOLITICS';
        if (normalized === 'FX' || normalized === 'RATES')
            return 'ECONOMICS';
        return 'GENERAL';
    };
    NewsHeatmapService.prototype.parseDate = function (value) {
        if (!value)
            return null;
        var parsed = new Date(value);
        if (Number.isNaN(parsed.getTime()))
            return null;
        return parsed;
    };
    NewsHeatmapService.prototype.parseJsonArray = function (value) {
        if (!value)
            return [];
        try {
            var parsed = JSON.parse(value);
            if (!Array.isArray(parsed))
                return [];
            return parsed.map(function (v) { return String(v); }).filter(Boolean);
        }
        catch (_a) {
            return [];
        }
    };
    NewsHeatmapService.prototype.normalizeToken = function (rawToken) {
        return rawToken
            .toLowerCase()
            .replace(/^[^a-z0-9#+-]+|[^a-z0-9#+-]+$/g, '')
            .replace(/['"]/g, '');
    };
    NewsHeatmapService.prototype.extractTokens = function (article) {
        var _this = this;
        var tokenSet = new Set();
        var pushToken = function (token) {
            var normalized = _this.normalizeToken(token);
            if (!normalized)
                return;
            if (/^\d+$/.test(normalized))
                return;
            if (normalized.length < 3 && !HIGH_SIGNAL_TOKENS.has(normalized))
                return;
            if (STOP_WORDS.has(normalized) && !HIGH_SIGNAL_TOKENS.has(normalized))
                return;
            tokenSet.add(normalized);
        };
        var rawText = "".concat(article.title, " ").concat(article.snippet, " ").concat(article.summary).trim();
        var parts = rawText
            .split(/[\s/,:;()[\]{}"'`~!?<>|]+/)
            .filter(Boolean);
        for (var _i = 0, parts_1 = parts; _i < parts_1.length; _i++) {
            var part = parts_1[_i];
            pushToken(part);
        }
        for (var _a = 0, _b = article.tags; _a < _b.length; _a++) {
            var tag = _b[_a];
            pushToken(tag);
        }
        var tickerMatches = article.title.match(/\b[A-Z]{2,8}\b/g) || [];
        for (var _c = 0, tickerMatches_1 = tickerMatches; _c < tickerMatches_1.length; _c++) {
            var ticker = tickerMatches_1[_c];
            pushToken(ticker);
        }
        if (tokenSet.size === 0) {
            article.title
                .split(/\s+/)
                .filter(function (token) { return token.length > 3; })
                .slice(0, 6)
                .forEach(pushToken);
        }
        return Array.from(tokenSet).slice(0, 30);
    };
    NewsHeatmapService.prototype.normalizeTopicKey = function (topic) {
        return topic
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 180);
    };
    NewsHeatmapService.prototype.jaccardSimilarity = function (a, b) {
        if (!a.size || !b.size)
            return 0;
        var _a = a.size < b.size ? [a, b] : [b, a], small = _a[0], large = _a[1];
        var intersection = 0;
        for (var _i = 0, small_1 = small; _i < small_1.length; _i++) {
            var token = small_1[_i];
            if (large.has(token))
                intersection++;
        }
        var union = a.size + b.size - intersection;
        return union > 0 ? intersection / union : 0;
    };
    NewsHeatmapService.prototype.sentimentToScore = function (sentiment) {
        if (sentiment === 'BULLISH')
            return 1;
        if (sentiment === 'BEARISH')
            return -1;
        return 0;
    };
    NewsHeatmapService.prototype.importanceWeight = function (importance) {
        switch (importance) {
            case 'CRITICAL':
                return 2.4;
            case 'HIGH':
                return 1.65;
            case 'MEDIUM':
                return 1.0;
            case 'LOW':
            default:
                return 0.8;
        }
    };
    NewsHeatmapService.prototype.calculateArticleWeight = function (article, nowMs) {
        var ageHours = Math.max(0, (nowMs - article.eventTime.getTime()) / 3600000);
        var recencyWeight = Math.exp(-ageHours / 9);
        var importanceWeight = this.importanceWeight(article.importance);
        var sentimentBoost = 1 + Math.abs(this.sentimentToScore(article.sentiment)) * 0.22;
        return recencyWeight * importanceWeight * sentimentBoost;
    };
    NewsHeatmapService.prototype.chooseTopic = function (acc) {
        var _a, _b;
        if (acc.topicVotes.size > 0) {
            var topTopic = (_a = Array.from(acc.topicVotes.entries())
                .sort(function (a, b) { return b[1] - a[1]; })[0]) === null || _a === void 0 ? void 0 : _a[0];
            if (topTopic && topTopic.length > 5)
                return topTopic;
        }
        var latestArticle = (_b = __spreadArray([], acc.articles, true).sort(function (a, b) { return b.article.eventTime.getTime() - a.article.eventTime.getTime(); })[0]) === null || _b === void 0 ? void 0 : _b.article;
        if (!latestArticle)
            return 'Unlabeled Market Event';
        return latestArticle.title
            .replace(/\s*[-|]\s*(Reuters|Bloomberg|CoinDesk|Cointelegraph|AP|AFP).*$/i, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
    };
    NewsHeatmapService.prototype.chooseKeywords = function (acc) {
        var weightedKeywords = new Map();
        for (var _i = 0, _a = acc.keywordWeights; _i < _a.length; _i++) {
            var _b = _a[_i], k = _b[0], v = _b[1];
            weightedKeywords.set(k, (weightedKeywords.get(k) || 0) + v * 1.35);
        }
        for (var _c = 0, _d = acc.tokenWeights; _c < _d.length; _c++) {
            var _e = _d[_c], k = _e[0], v = _e[1];
            weightedKeywords.set(k, (weightedKeywords.get(k) || 0) + v);
        }
        return Array.from(weightedKeywords.entries())
            .sort(function (a, b) { return b[1] - a[1]; })
            .map(function (_a) {
            var token = _a[0];
            return token;
        })
            .filter(function (token) { return token.length >= 3; })
            .slice(0, 8);
    };
    NewsHeatmapService.prototype.toSentimentLabel = function (score) {
        if (score >= 0.15)
            return 'BULLISH';
        if (score <= -0.15)
            return 'BEARISH';
        return 'NEUTRAL';
    };
    NewsHeatmapService.prototype.resolveTrendDirection = function (acc, velocity) {
        var voteDelta = acc.trendVotes.UP - acc.trendVotes.DOWN;
        if (voteDelta >= 2)
            return 'UP';
        if (voteDelta <= -2)
            return 'DOWN';
        if (velocity >= 3)
            return 'UP';
        if (velocity <= -3)
            return 'DOWN';
        return 'NEUTRAL';
    };
    NewsHeatmapService.prototype.resolveUrgency = function (acc, heatScore) {
        var urgencyRanking = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        var voted = urgencyRanking
            .map(function (level) { return ({ level: level, count: acc.urgencyVotes[level] }); })
            .sort(function (a, b) { return b.count - a.count; })[0];
        if (heatScore >= 85 || acc.importanceVotes.CRITICAL >= 2)
            return 'CRITICAL';
        if (heatScore >= 65 || acc.importanceVotes.CRITICAL >= 1 || acc.importanceVotes.HIGH >= 4)
            return 'HIGH';
        if (heatScore >= 35)
            return 'MEDIUM';
        if (voted && voted.count > 0)
            return voted.level;
        return 'LOW';
    };
    NewsHeatmapService.prototype.stableFallbackKey = function (acc) {
        var _a;
        var primaryTopic = this.chooseTopic(acc);
        var topicKey = this.normalizeTopicKey(primaryTopic);
        if (topicKey)
            return "".concat(acc.category, ":").concat(topicKey);
        var topTokens = Array.from(acc.tokenWeights.entries())
            .sort(function (a, b) { return b[1] - a[1]; })
            .map(function (_a) {
            var token = _a[0];
            return token;
        })
            .slice(0, 6)
            .sort();
        if (topTokens.length === 0) {
            var fallbackHash = crypto_1.default.createHash('sha1').update(((_a = acc.articles[0]) === null || _a === void 0 ? void 0 : _a.article.id) || crypto_1.default.randomUUID()).digest('hex').slice(0, 16);
            return "".concat(acc.category, ":cluster:").concat(fallbackHash);
        }
        return "".concat(acc.category, ":").concat(topTokens.join('|'));
    };
    NewsHeatmapService.prototype.createAccumulator = function (key, category, firstArticle) {
        return {
            key: key,
            category: category,
            topicVotes: new Map(),
            tokenWeights: new Map(),
            keywordWeights: new Map(),
            tokenSet: new Set(),
            articles: [],
            sourceSet: new Set(),
            weightSum: 0,
            weightedSentimentSum: 0,
            trendVotes: { UP: 0, DOWN: 0, NEUTRAL: 0 },
            urgencyVotes: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
            importanceVotes: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
            labeledCount: 0,
            firstSeen: firstArticle.eventTime,
            lastSeen: firstArticle.eventTime,
        };
    };
    NewsHeatmapService.prototype.addArticleToAccumulator = function (acc, article, tokenSet, weight, label) {
        acc.articles.push({ article: article, tokenSet: tokenSet, weight: weight, label: label });
        acc.sourceSet.add(article.source || 'Unknown');
        acc.weightSum += weight;
        acc.weightedSentimentSum += this.sentimentToScore(article.sentiment) * weight;
        acc.importanceVotes[article.importance] += 1;
        if (article.eventTime.getTime() < acc.firstSeen.getTime())
            acc.firstSeen = article.eventTime;
        if (article.eventTime.getTime() > acc.lastSeen.getTime())
            acc.lastSeen = article.eventTime;
        for (var _i = 0, tokenSet_1 = tokenSet; _i < tokenSet_1.length; _i++) {
            var token = tokenSet_1[_i];
            acc.tokenSet.add(token);
            acc.tokenWeights.set(token, (acc.tokenWeights.get(token) || 0) + weight);
        }
        if (label) {
            acc.labeledCount += 1;
            acc.topicVotes.set(label.topic, (acc.topicVotes.get(label.topic) || 0) + 1.3);
            acc.trendVotes[label.trendDirection] += 1;
            acc.urgencyVotes[label.urgency] += 1;
            for (var _a = 0, _b = label.keywords; _a < _b.length; _a++) {
                var keyword = _b[_a];
                var normalized = this.normalizeToken(keyword);
                if (!normalized || normalized.length < 3)
                    continue;
                acc.tokenSet.add(normalized);
                acc.keywordWeights.set(normalized, (acc.keywordWeights.get(normalized) || 0) + weight * 1.15);
            }
        }
    };
    NewsHeatmapService.prototype.findBestCluster = function (clusters, category, tokenSet, label) {
        var _this = this;
        var best = null;
        var bestScore = 0;
        for (var _i = 0, clusters_1 = clusters; _i < clusters_1.length; _i++) {
            var cluster = clusters_1[_i];
            if (cluster.category !== category)
                continue;
            var lexical = this.jaccardSimilarity(tokenSet, cluster.tokenSet);
            var labelScore = 0;
            if (label) {
                var labelTokenSet = new Set(__spreadArray(__spreadArray([], label.keywords.map(function (keyword) { return _this.normalizeToken(keyword); }).filter(Boolean), true), this.normalizeTopicKey(label.topic).split('_').filter(function (token) { return token.length >= 3; }), true));
                labelScore = this.jaccardSimilarity(labelTokenSet, cluster.tokenSet);
            }
            var score = Math.max(lexical, labelScore * 1.1);
            if (score > bestScore) {
                bestScore = score;
                best = cluster;
            }
        }
        var threshold = label ? 0.26 : 0.34;
        return bestScore >= threshold ? best : null;
    };
    NewsHeatmapService.prototype.mergeAccumulators = function (target, source) {
        for (var _i = 0, _a = source.articles; _i < _a.length; _i++) {
            var article = _a[_i];
            target.articles.push(article);
        }
        for (var _b = 0, _c = source.sourceSet; _b < _c.length; _b++) {
            var sourceName = _c[_b];
            target.sourceSet.add(sourceName);
        }
        for (var _d = 0, _e = source.tokenSet; _d < _e.length; _d++) {
            var token = _e[_d];
            target.tokenSet.add(token);
        }
        for (var _f = 0, _g = source.tokenWeights; _f < _g.length; _f++) {
            var _h = _g[_f], token = _h[0], weight = _h[1];
            target.tokenWeights.set(token, (target.tokenWeights.get(token) || 0) + weight);
        }
        for (var _j = 0, _k = source.keywordWeights; _j < _k.length; _j++) {
            var _l = _k[_j], token = _l[0], weight = _l[1];
            target.keywordWeights.set(token, (target.keywordWeights.get(token) || 0) + weight);
        }
        for (var _m = 0, _o = source.topicVotes; _m < _o.length; _m++) {
            var _p = _o[_m], topic = _p[0], weight = _p[1];
            target.topicVotes.set(topic, (target.topicVotes.get(topic) || 0) + weight);
        }
        target.weightSum += source.weightSum;
        target.weightedSentimentSum += source.weightedSentimentSum;
        target.labeledCount += source.labeledCount;
        target.trendVotes.UP += source.trendVotes.UP;
        target.trendVotes.DOWN += source.trendVotes.DOWN;
        target.trendVotes.NEUTRAL += source.trendVotes.NEUTRAL;
        target.urgencyVotes.CRITICAL += source.urgencyVotes.CRITICAL;
        target.urgencyVotes.HIGH += source.urgencyVotes.HIGH;
        target.urgencyVotes.MEDIUM += source.urgencyVotes.MEDIUM;
        target.urgencyVotes.LOW += source.urgencyVotes.LOW;
        target.importanceVotes.CRITICAL += source.importanceVotes.CRITICAL;
        target.importanceVotes.HIGH += source.importanceVotes.HIGH;
        target.importanceVotes.MEDIUM += source.importanceVotes.MEDIUM;
        target.importanceVotes.LOW += source.importanceVotes.LOW;
        if (source.firstSeen.getTime() < target.firstSeen.getTime())
            target.firstSeen = source.firstSeen;
        if (source.lastSeen.getTime() > target.lastSeen.getTime())
            target.lastSeen = source.lastSeen;
    };
    NewsHeatmapService.prototype.getRecentArticles = function (hours, limit) {
        return __awaiter(this, void 0, void 0, function () {
            var hasNewsTable, cutoff, rows;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        hasNewsTable = this.db
                            .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'news_articles'")
                            .get();
                        if (!(hasNewsTable === null || hasNewsTable === void 0 ? void 0 : hasNewsTable.ok))
                            return [2 /*return*/, []];
                        cutoff = new Date(Date.now() - hours * 3600000).toISOString();
                        rows = this.db.prepare("\n      WITH candidates AS (\n        SELECT id, published_at AS event_time\n        FROM news_articles\n        WHERE published_at IS NOT NULL AND published_at != '' AND published_at >= ?\n        UNION ALL\n        SELECT id, created_at AS event_time\n        FROM news_articles\n        WHERE (published_at IS NULL OR published_at = '') AND created_at >= ?\n      ),\n      ranked AS (\n        SELECT id, event_time\n        FROM candidates\n        ORDER BY event_time DESC\n        LIMIT ?\n      )\n      SELECT\n        n.id,\n        n.title,\n        '' AS content,\n        n.summary,\n        n.snippet,\n        n.source,\n        n.url,\n        n.published_at,\n        n.created_at,\n        n.categories,\n        n.tags,\n        n.sentiment,\n        n.importance\n      FROM ranked r\n      JOIN news_articles n ON n.id = r.id\n      ORDER BY r.event_time DESC\n    ").all(cutoff, cutoff, limit);
                        return [2 /*return*/, rows
                                .map(function (row) {
                                var createdAt = _this.parseDate(row.created_at);
                                if (!createdAt)
                                    return null;
                                var publishedAt = _this.parseDate(row.published_at);
                                var eventTime = publishedAt || createdAt;
                                var categories = _this.parseJsonArray(row.categories)
                                    .map(function (category) { return _this.normalizeCategory(category); })
                                    .filter(function (category) { return category !== 'GENERAL'; });
                                var categoryList = categories.length > 0 ? categories : ['CRYPTO'];
                                var tags = _this.parseJsonArray(row.tags).slice(0, 12);
                                var sentiment = ['BULLISH', 'BEARISH', 'NEUTRAL'].includes(row.sentiment)
                                    ? row.sentiment
                                    : 'NEUTRAL';
                                var importance = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(row.importance)
                                    ? row.importance
                                    : 'MEDIUM';
                                return {
                                    id: String(row.id),
                                    title: String(row.title || 'Untitled'),
                                    content: String(row.content || ''),
                                    summary: String(row.summary || ''),
                                    snippet: String(row.snippet || ''),
                                    source: String(row.source || 'Unknown'),
                                    url: String(row.url || ''),
                                    publishedAt: publishedAt,
                                    createdAt: createdAt,
                                    eventTime: eventTime,
                                    categories: categoryList,
                                    tags: tags,
                                    sentiment: sentiment,
                                    importance: importance,
                                };
                            })
                                .filter(function (article) { return article !== null; })];
                }
            });
        });
    };
    NewsHeatmapService.prototype.labelArticlesWithLlm = function (articles) {
        return __awaiter(this, void 0, void 0, function () {
            var labels, labelInputs, llmLabels, _i, _a, _b, id, rawLabel, topic, trendDirection, urgency, keywords, error_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        labels = new Map();
                        if (!openrouter_service_1.default.canUseService())
                            return [2 /*return*/, labels];
                        if (Date.now() < this.llmBlockedUntil)
                            return [2 /*return*/, labels];
                        labelInputs = articles.slice(0, this.maxLlmLabelArticles).map(function (article) { return ({
                            id: article.id,
                            title: article.title,
                            category: article.categories[0],
                            tags: article.tags,
                        }); });
                        if (labelInputs.length === 0)
                            return [2 /*return*/, labels];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.withTimeout(openrouter_service_1.default.batchEventLabels(labelInputs), this.llmTimeoutMs, "LLM labeling timed out after ".concat(this.llmTimeoutMs, "ms"))];
                    case 2:
                        llmLabels = _c.sent();
                        for (_i = 0, _a = llmLabels; _i < _a.length; _i++) {
                            _b = _a[_i], id = _b[0], rawLabel = _b[1];
                            topic = String((rawLabel === null || rawLabel === void 0 ? void 0 : rawLabel.topic) || '').trim();
                            if (!topic)
                                continue;
                            trendDirection = ['UP', 'DOWN', 'NEUTRAL'].includes(rawLabel === null || rawLabel === void 0 ? void 0 : rawLabel.trendDirection)
                                ? rawLabel.trendDirection
                                : 'NEUTRAL';
                            urgency = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(rawLabel === null || rawLabel === void 0 ? void 0 : rawLabel.urgency)
                                ? rawLabel.urgency
                                : 'MEDIUM';
                            keywords = Array.isArray(rawLabel === null || rawLabel === void 0 ? void 0 : rawLabel.keywords)
                                ? rawLabel.keywords.map(function (keyword) { return String(keyword); }).filter(Boolean).slice(0, 8)
                                : [];
                            labels.set(id, { topic: topic, trendDirection: trendDirection, urgency: urgency, keywords: keywords });
                        }
                        if (labels.size === 0) {
                            this.llmConsecutiveEmpty += 1;
                            if (this.llmConsecutiveEmpty >= 2) {
                                this.llmBlockedUntil = Date.now() + (10 * 60 * 1000);
                                logger_1.default.warn('[NewsHeatmapService] OpenRouter returned zero labels repeatedly; disabling LLM labeling for 10 minutes');
                                this.llmConsecutiveEmpty = 0;
                            }
                        }
                        else {
                            this.llmConsecutiveEmpty = 0;
                            this.llmBlockedUntil = 0;
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _c.sent();
                        this.llmConsecutiveEmpty += 1;
                        if (this.llmConsecutiveEmpty >= 2) {
                            this.llmBlockedUntil = Date.now() + (10 * 60 * 1000);
                            this.llmConsecutiveEmpty = 0;
                        }
                        logger_1.default.warn('[NewsHeatmapService] LLM labeling failed, continuing with lexical fallback:', error_1);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/, labels];
                }
            });
        });
    };
    NewsHeatmapService.prototype.withTimeout = function (promise, timeoutMs, errorMessage) {
        return __awaiter(this, void 0, void 0, function () {
            var timeoutHandle, timeoutPromise;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        timeoutHandle = null;
                        timeoutPromise = new Promise(function (_, reject) {
                            timeoutHandle = setTimeout(function () { return reject(new Error(errorMessage)); }, timeoutMs);
                        });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 3, 4]);
                        return [4 /*yield*/, Promise.race([promise, timeoutPromise])];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        if (timeoutHandle)
                            clearTimeout(timeoutHandle);
                        return [7 /*endfinally*/];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    NewsHeatmapService.prototype.getPreviousState = function (hours) {
        return __awaiter(this, void 0, void 0, function () {
            var cutoff, rows, result, _i, rows_1, row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, new Map()];
                        cutoff = new Date(Date.now() - hours * 3600000).toISOString();
                        rows = this.db.prepare("\n      SELECT cluster_key, cluster_id, last_heat_score\n      FROM news_heatmap_state\n      WHERE updated_at >= ?\n    ").all(cutoff);
                        result = new Map();
                        for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
                            row = rows_1[_i];
                            result.set(row.cluster_key, {
                                clusterKey: row.cluster_key,
                                clusterId: row.cluster_id,
                                lastHeatScore: row.last_heat_score,
                            });
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    NewsHeatmapService.prototype.buildClusters = function (articles, llmLabels, previousState, now) {
        var _a;
        var nowMs = now.getTime();
        var workingClusters = [];
        var byLlmTopicKey = new Map();
        var sortedArticles = __spreadArray([], articles, true).sort(function (a, b) { return b.eventTime.getTime() - a.eventTime.getTime(); });
        for (var _i = 0, sortedArticles_1 = sortedArticles; _i < sortedArticles_1.length; _i++) {
            var article = sortedArticles_1[_i];
            var category = this.normalizeCategory(article.categories[0]);
            var tokens = new Set(this.extractTokens(article));
            var weight = this.calculateArticleWeight(article, nowMs);
            var label = llmLabels.get(article.id);
            var llmTopicKey = label ? "".concat(category, ":").concat(this.normalizeTopicKey(label.topic)) : '';
            var assignedCluster = null;
            if (llmTopicKey) {
                assignedCluster = byLlmTopicKey.get(llmTopicKey) || null;
            }
            if (!assignedCluster) {
                assignedCluster = this.findBestCluster(workingClusters, category, tokens, label);
            }
            if (!assignedCluster) {
                var seedKey = llmTopicKey || "".concat(category, ":seed:").concat(crypto_1.default.randomUUID());
                assignedCluster = this.createAccumulator(seedKey, category, article);
                workingClusters.push(assignedCluster);
                if (llmTopicKey)
                    byLlmTopicKey.set(llmTopicKey, assignedCluster);
            }
            this.addArticleToAccumulator(assignedCluster, article, tokens, weight, label);
        }
        // Stabilize keys and merge duplicates from lexical seeds.
        var stableClusterMap = new Map();
        for (var _b = 0, workingClusters_1 = workingClusters; _b < workingClusters_1.length; _b++) {
            var cluster = workingClusters_1[_b];
            var stableKey = cluster.key.includes(':seed:')
                ? this.stableFallbackKey(cluster)
                : cluster.key;
            if (!stableClusterMap.has(stableKey)) {
                cluster.key = stableKey;
                stableClusterMap.set(stableKey, cluster);
            }
            else {
                this.mergeAccumulators(stableClusterMap.get(stableKey), cluster);
            }
        }
        var finalizedClusters = [];
        for (var _c = 0, _d = stableClusterMap.values(); _c < _d.length; _c++) {
            var cluster = _d[_c];
            if (cluster.articles.length === 0)
                continue;
            var articlesByRecency = __spreadArray([], cluster.articles, true).sort(function (a, b) { return b.article.eventTime.getTime() - a.article.eventTime.getTime(); });
            var topic = this.chooseTopic(cluster);
            var keywords = this.chooseKeywords(cluster);
            var topicKey = this.normalizeTopicKey(topic) || crypto_1.default.createHash('sha1').update(cluster.key).digest('hex').slice(0, 24);
            var sourceDiversityBoost = Math.log2(cluster.sourceSet.size + 1) * 3.4;
            var concentrationPenalty = Math.max(0, cluster.articles.length - cluster.sourceSet.size) * 0.35;
            var rawHeat = cluster.weightSum * 19 + sourceDiversityBoost + Math.sqrt(cluster.articles.length) * 4 - concentrationPenalty;
            var heatScore = Number((100 * (1 - Math.exp(-rawHeat / 26))).toFixed(2));
            var stableKey = "".concat(cluster.category, ":").concat(topicKey);
            var previous = previousState.get(stableKey) || previousState.get(cluster.key);
            var velocity = Number((heatScore - ((previous === null || previous === void 0 ? void 0 : previous.lastHeatScore) || 0)).toFixed(2));
            var sentimentScore = cluster.weightSum > 0
                ? Number((cluster.weightedSentimentSum / cluster.weightSum).toFixed(3))
                : 0;
            var trendDirection = this.resolveTrendDirection(cluster, velocity);
            var urgency = this.resolveUrgency(cluster, heatScore);
            var clusterId = (previous === null || previous === void 0 ? void 0 : previous.clusterId) || "nh_".concat(crypto_1.default.createHash('sha1').update(stableKey).digest('hex').slice(0, 18));
            var freshnessMinutes = Math.max(0, Math.round((nowMs - cluster.lastSeen.getTime()) / 60000));
            var llmCoverage = Number((cluster.labeledCount / Math.max(1, cluster.articles.length)).toFixed(3));
            var latestTitle = ((_a = articlesByRecency[0]) === null || _a === void 0 ? void 0 : _a.article.title) || topic;
            var spanHours = Math.max(0.1, (cluster.lastSeen.getTime() - cluster.firstSeen.getTime()) / 3600000);
            var summary = "".concat(cluster.articles.length, " articles across ").concat(cluster.sourceSet.size, " sources over ").concat(spanHours.toFixed(1), "h. Latest: ").concat(latestTitle);
            finalizedClusters.push({
                id: clusterId,
                topic: topic,
                topicKey: topicKey,
                summary: summary,
                category: cluster.category,
                keywords: keywords,
                heatScore: heatScore,
                articleCount: cluster.articles.length,
                sourceCount: cluster.sourceSet.size,
                sentimentScore: sentimentScore,
                sentiment: this.toSentimentLabel(sentimentScore),
                trendDirection: trendDirection,
                urgency: urgency,
                velocity: velocity,
                freshnessMinutes: freshnessMinutes,
                llmCoverage: llmCoverage,
                firstSeen: cluster.firstSeen.toISOString(),
                updatedAt: cluster.lastSeen.toISOString(),
                articles: articlesByRecency.slice(0, 12).map(function (entry) { return ({
                    id: entry.article.id,
                    title: entry.article.title,
                    source: entry.article.source,
                    url: entry.article.url,
                    publishedAt: entry.article.publishedAt ? entry.article.publishedAt.toISOString() : null,
                    sentiment: entry.article.sentiment,
                    importance: entry.article.importance,
                    snippet: entry.article.snippet,
                    summary: entry.article.summary,
                }); }),
            });
        }
        return finalizedClusters
            .sort(function (a, b) {
            if (b.heatScore !== a.heatScore)
                return b.heatScore - a.heatScore;
            if (b.velocity !== a.velocity)
                return b.velocity - a.velocity;
            return b.articleCount - a.articleCount;
        });
    };
    NewsHeatmapService.prototype.persistState = function (clusters, timestamp) {
        return __awaiter(this, void 0, void 0, function () {
            var upsertState, insertHistory, cleanupState, cleanupHistory, retainStateCutoff, retainHistoryCutoff, tx;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db || clusters.length === 0)
                            return [2 /*return*/];
                        upsertState = this.db.prepare("\n      INSERT INTO news_heatmap_state (\n        cluster_key,\n        cluster_id,\n        category,\n        topic,\n        last_heat_score,\n        last_article_count,\n        last_velocity,\n        last_sentiment_score,\n        llm_coverage,\n        updated_at\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ON CONFLICT(cluster_key) DO UPDATE SET\n        cluster_id = excluded.cluster_id,\n        category = excluded.category,\n        topic = excluded.topic,\n        last_heat_score = excluded.last_heat_score,\n        last_article_count = excluded.last_article_count,\n        last_velocity = excluded.last_velocity,\n        last_sentiment_score = excluded.last_sentiment_score,\n        llm_coverage = excluded.llm_coverage,\n        updated_at = excluded.updated_at\n    ");
                        insertHistory = this.db.prepare("\n      INSERT INTO news_heatmap_history (\n        cluster_key,\n        category,\n        topic,\n        heat_score,\n        article_count,\n        sentiment_score,\n        velocity,\n        llm_coverage,\n        timestamp\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ");
                        cleanupState = this.db.prepare("\n      DELETE FROM news_heatmap_state\n      WHERE updated_at < ?\n    ");
                        cleanupHistory = this.db.prepare("\n      DELETE FROM news_heatmap_history\n      WHERE timestamp < ?\n    ");
                        retainStateCutoff = new Date(Date.now() - 10 * 24 * 3600000).toISOString();
                        retainHistoryCutoff = new Date(Date.now() - 14 * 24 * 3600000).toISOString();
                        tx = this.db.transaction(function (items) {
                            for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                                var cluster = items_1[_i];
                                var key = "".concat(cluster.category, ":").concat(cluster.topicKey);
                                upsertState.run(key, cluster.id, cluster.category, cluster.topic, cluster.heatScore, cluster.articleCount, cluster.velocity, cluster.sentimentScore, cluster.llmCoverage, timestamp);
                                insertHistory.run(key, cluster.category, cluster.topic, cluster.heatScore, cluster.articleCount, cluster.sentimentScore, cluster.velocity, cluster.llmCoverage, timestamp);
                            }
                            cleanupState.run(retainStateCutoff);
                            cleanupHistory.run(retainHistoryCutoff);
                        });
                        tx(clusters);
                        return [2 /*return*/];
                }
            });
        });
    };
    NewsHeatmapService.prototype.normalizeOptions = function (options) {
        var hours = Math.max(1, Math.min(168, Number(options.hours) || 24));
        var limit = Math.max(1, Math.min(300, Number(options.limit) || 60));
        var articleLimit = Math.max(50, Math.min(this.maxArticleScan, Number(options.articleLimit) || this.maxArticleScan));
        var rawCategory = String(options.category || 'ALL').toUpperCase();
        var category = rawCategory === 'ALL'
            ? 'ALL'
            : this.normalizeCategory(rawCategory);
        return {
            hours: hours,
            category: category,
            limit: limit,
            force: Boolean(options.force),
            articleLimit: articleLimit,
        };
    };
    NewsHeatmapService.prototype.buildCacheKey = function (hours, category, articleLimit) {
        return "".concat(hours, ":").concat(category, ":").concat(articleLimit);
    };
    NewsHeatmapService.prototype.projectResult = function (raw, limit) {
        var visibleClusters = raw.clusters.slice(0, limit);
        var byCategory = {};
        for (var _i = 0, visibleClusters_1 = visibleClusters; _i < visibleClusters_1.length; _i++) {
            var cluster = visibleClusters_1[_i];
            if (!byCategory[cluster.category])
                byCategory[cluster.category] = [];
            byCategory[cluster.category].push(cluster);
        }
        return {
            generatedAt: raw.generatedAt,
            hours: raw.hours,
            category: raw.category,
            totalArticles: raw.totalArticles,
            totalClusters: raw.totalClusters,
            clusters: visibleClusters,
            byCategory: byCategory,
            llm: raw.llm,
        };
    };
    NewsHeatmapService.prototype.buildInternal = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var now, articles, llmLabels, previousState, allClusters, timestamp, filteredClusters, _i, filteredClusters_1, cluster, llmCoverage, llmEnabled;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        now = new Date();
                        return [4 /*yield*/, this.getRecentArticles(options.hours, options.articleLimit)];
                    case 1:
                        articles = _a.sent();
                        return [4 /*yield*/, this.labelArticlesWithLlm(articles)];
                    case 2:
                        llmLabels = _a.sent();
                        return [4 /*yield*/, this.getPreviousState(96)];
                    case 3:
                        previousState = _a.sent();
                        allClusters = this.buildClusters(articles, llmLabels, previousState, now);
                        timestamp = now.toISOString();
                        return [4 /*yield*/, this.persistState(allClusters, timestamp)];
                    case 4:
                        _a.sent();
                        filteredClusters = options.category === 'ALL'
                            ? allClusters
                            : allClusters.filter(function (cluster) { return cluster.category === options.category; });
                        this.clusterDetailCache.clear();
                        for (_i = 0, filteredClusters_1 = filteredClusters; _i < filteredClusters_1.length; _i++) {
                            cluster = filteredClusters_1[_i];
                            this.clusterDetailCache.set(cluster.id, cluster);
                        }
                        llmCoverage = articles.length > 0
                            ? llmLabels.size / Math.min(articles.length, this.maxLlmLabelArticles)
                            : 0;
                        llmEnabled = openrouter_service_1.default.canUseService() && Date.now() >= this.llmBlockedUntil;
                        return [2 /*return*/, {
                                generatedAt: timestamp,
                                hours: options.hours,
                                category: options.category,
                                totalArticles: articles.length,
                                totalClusters: filteredClusters.length,
                                clusters: filteredClusters,
                                llm: {
                                    enabled: llmEnabled,
                                    model: this.configuredLabelingModel,
                                    labeledArticles: llmLabels.size,
                                    coverage: Number(llmCoverage.toFixed(3)),
                                },
                            }];
                }
            });
        });
    };
    NewsHeatmapService.prototype.getHeatmap = function () {
        return __awaiter(this, arguments, void 0, function (options) {
            var normalized, cacheKey, now, cached, inFlightResult, buildPromise, result;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        normalized = this.normalizeOptions(options);
                        cacheKey = this.buildCacheKey(normalized.hours, normalized.category, normalized.articleLimit);
                        now = Date.now();
                        if (!normalized.force) {
                            cached = this.cache.get(cacheKey);
                            if (cached && (now - cached.createdAt) < this.cacheTtlMs) {
                                return [2 /*return*/, this.projectResult(cached.result, normalized.limit)];
                            }
                        }
                        if (!(!normalized.force && this.inFlight.has(cacheKey))) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.inFlight.get(cacheKey)];
                    case 1:
                        inFlightResult = _a.sent();
                        return [2 /*return*/, this.projectResult(inFlightResult, normalized.limit)];
                    case 2:
                        buildPromise = this.buildInternal({
                            hours: normalized.hours,
                            category: normalized.category,
                            articleLimit: normalized.articleLimit,
                        });
                        this.inFlight.set(cacheKey, buildPromise);
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, , 5, 6]);
                        return [4 /*yield*/, buildPromise];
                    case 4:
                        result = _a.sent();
                        this.cache.set(cacheKey, { createdAt: Date.now(), result: result });
                        return [2 /*return*/, this.projectResult(result, normalized.limit)];
                    case 5:
                        this.inFlight.delete(cacheKey);
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    NewsHeatmapService.prototype.rebuild = function () {
        return __awaiter(this, arguments, void 0, function (options) {
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.getHeatmap(__assign(__assign({}, options), { force: true }))];
            });
        });
    };
    NewsHeatmapService.prototype.getClusterDetails = function (clusterId_1) {
        return __awaiter(this, arguments, void 0, function (clusterId, hours) {
            var cached, rebuilt;
            if (hours === void 0) { hours = 48; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!clusterId)
                            return [2 /*return*/, null];
                        cached = this.clusterDetailCache.get(clusterId);
                        if (cached)
                            return [2 /*return*/, cached];
                        return [4 /*yield*/, this.getHeatmap({ hours: hours, limit: 250, force: true })];
                    case 1:
                        rebuilt = _a.sent();
                        return [2 /*return*/, rebuilt.clusters.find(function (cluster) { return cluster.id === clusterId; }) || null];
                }
            });
        });
    };
    NewsHeatmapService.prototype.getTimeline = function () {
        return __awaiter(this, arguments, void 0, function (hours, bucketHours, category) {
            var resolvedHours, resolvedBucketHours, categoryFilter, cutoff, readRows, rows, bucketMs, nowMs, startMs, alignedStart, buckets, ts, _i, rows_2, row, rowCategory, ts, bucketStart, bucket, points;
            var _this = this;
            var _a;
            if (hours === void 0) { hours = 24; }
            if (bucketHours === void 0) { bucketHours = 2; }
            if (category === void 0) { category = 'ALL'; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _b.sent();
                        if (!this.db) {
                            return [2 /*return*/, {
                                    generatedAt: new Date().toISOString(),
                                    hours: hours,
                                    bucketHours: bucketHours,
                                    points: [],
                                }];
                        }
                        resolvedHours = Math.max(1, Math.min(168, Number(hours) || 24));
                        resolvedBucketHours = Math.max(1, Math.min(24, Number(bucketHours) || 2));
                        categoryFilter = String(category || 'ALL').toUpperCase();
                        cutoff = new Date(Date.now() - resolvedHours * 3600000).toISOString();
                        readRows = function () { return _this.db.prepare("\n      SELECT category, heat_score, article_count, timestamp\n      FROM news_heatmap_history\n      WHERE timestamp >= ?\n      ORDER BY timestamp ASC\n    ").all(cutoff); };
                        rows = readRows();
                        if (!(rows.length === 0)) return [3 /*break*/, 3];
                        // Build one snapshot if history is empty, but do not recurse indefinitely
                        // if there is still no data after rebuild.
                        return [4 /*yield*/, this.getHeatmap({ hours: resolvedHours, limit: 80, force: true })];
                    case 2:
                        // Build one snapshot if history is empty, but do not recurse indefinitely
                        // if there is still no data after rebuild.
                        _b.sent();
                        rows = readRows();
                        if (rows.length === 0) {
                            return [2 /*return*/, {
                                    generatedAt: new Date().toISOString(),
                                    hours: resolvedHours,
                                    bucketHours: resolvedBucketHours,
                                    points: [],
                                }];
                        }
                        _b.label = 3;
                    case 3:
                        bucketMs = resolvedBucketHours * 3600000;
                        nowMs = Date.now();
                        startMs = nowMs - resolvedHours * 3600000;
                        alignedStart = Math.floor(startMs / bucketMs) * bucketMs;
                        buckets = new Map();
                        for (ts = alignedStart; ts <= nowMs; ts += bucketMs) {
                            buckets.set(ts, {
                                heatSum: 0,
                                articleSum: 0,
                                observations: 0,
                                byCategoryHeat: new Map(),
                                byCategoryObs: new Map(),
                            });
                        }
                        for (_i = 0, rows_2 = rows; _i < rows_2.length; _i++) {
                            row = rows_2[_i];
                            rowCategory = String(row.category || 'GENERAL').toUpperCase();
                            if (categoryFilter !== 'ALL' && rowCategory !== categoryFilter)
                                continue;
                            ts = (_a = this.parseDate(row.timestamp)) === null || _a === void 0 ? void 0 : _a.getTime();
                            if (!ts)
                                continue;
                            if (ts < alignedStart)
                                continue;
                            bucketStart = Math.floor(ts / bucketMs) * bucketMs;
                            bucket = buckets.get(bucketStart);
                            if (!bucket)
                                continue;
                            bucket.heatSum += row.heat_score;
                            bucket.articleSum += row.article_count;
                            bucket.observations += 1;
                            bucket.byCategoryHeat.set(rowCategory, (bucket.byCategoryHeat.get(rowCategory) || 0) + row.heat_score);
                            bucket.byCategoryObs.set(rowCategory, (bucket.byCategoryObs.get(rowCategory) || 0) + 1);
                        }
                        points = Array.from(buckets.entries())
                            .sort(function (a, b) { return a[0] - b[0]; })
                            .map(function (_a) {
                            var bucketStart = _a[0], bucket = _a[1];
                            var byCategory = {};
                            for (var _i = 0, _b = bucket.byCategoryHeat.entries(); _i < _b.length; _i++) {
                                var _c = _b[_i], cat = _c[0], heat = _c[1];
                                var count = bucket.byCategoryObs.get(cat) || 1;
                                byCategory[cat] = Number((heat / count).toFixed(2));
                            }
                            return {
                                bucketStart: new Date(bucketStart).toISOString(),
                                bucketEnd: new Date(bucketStart + bucketMs).toISOString(),
                                avgHeat: bucket.observations > 0 ? Number((bucket.heatSum / bucket.observations).toFixed(2)) : 0,
                                articleCount: bucket.articleSum,
                                clusterObservations: bucket.observations,
                                byCategory: byCategory,
                            };
                        });
                        return [2 /*return*/, {
                                generatedAt: new Date().toISOString(),
                                hours: resolvedHours,
                                bucketHours: resolvedBucketHours,
                                points: points,
                            }];
                }
            });
        });
    };
    return NewsHeatmapService;
}());
var newsHeatmapService = new NewsHeatmapService();
exports.default = newsHeatmapService;
