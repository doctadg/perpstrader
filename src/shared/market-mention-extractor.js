"use strict";
// Market Mention Extractor
// Extracts market mentions from article content using keyword matching and NLP
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
exports.marketMentionExtractor = void 0;
var better_sqlite3_1 = require("better-sqlite3");
var logger_1 = require("../shared/logger");
var MarketMentionExtractor = /** @class */ (function () {
    function MarketMentionExtractor() {
        this.db = null;
        this.initialized = false;
        this.keywordCache = [];
        this.lastKeywordRefresh = 0;
        this.KEYWORD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }
    MarketMentionExtractor.prototype.initialize = function () {
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
                        return [4 /*yield*/, this.refreshKeywordCache()];
                    case 2:
                        _a.sent();
                        this.initialized = true;
                        logger_1.default.info('[MarketMentionExtractor] Initialized successfully');
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        logger_1.default.error('[MarketMentionExtractor] Initialization failed:', error_1);
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Refresh the keyword cache from database
     */
    MarketMentionExtractor.prototype.refreshKeywordCache = function () {
        return __awaiter(this, void 0, void 0, function () {
            var now, rows;
            return __generator(this, function (_a) {
                if (!this.db)
                    return [2 /*return*/];
                now = Date.now();
                if (now - this.lastKeywordRefresh < this.KEYWORD_CACHE_TTL && this.keywordCache.length > 0) {
                    return [2 /*return*/];
                }
                try {
                    rows = this.db.prepare("\n        SELECT \n          mk.market_id,\n          m.name as market_name,\n          m.type as market_type,\n          mk.keyword,\n          mk.keyword_type,\n          mk.weight\n        FROM market_keywords mk\n        JOIN markets m ON mk.market_id = m.id\n        WHERE m.active = 1\n        ORDER BY mk.weight DESC\n      ").all();
                    this.keywordCache = rows.map(function (r) { return ({
                        marketId: r.market_id,
                        marketName: r.market_name,
                        marketType: r.market_type,
                        keyword: r.keyword.toLowerCase(),
                        keywordType: r.keyword_type,
                        weight: r.weight,
                    }); });
                    this.lastKeywordRefresh = now;
                    logger_1.default.info("[MarketMentionExtractor] Loaded ".concat(this.keywordCache.length, " keywords"));
                }
                catch (error) {
                    logger_1.default.error('[MarketMentionExtractor] Failed to refresh keyword cache:', error);
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Extract market mentions from an article
     */
    MarketMentionExtractor.prototype.extractMentions = function (articleId, title, content, snippet) {
        return __awaiter(this, void 0, void 0, function () {
            var fullText, titleLower, firstParagraph, marketMatches, _i, _a, kw, keyword, position, matchCount, titleMatches, fpMatches, bodyMatches, market, mentions, _b, marketMatches_1, _c, _1, market, relevanceScore, context, sentiment, positions, bestPosition;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _d.sent();
                        return [4 /*yield*/, this.refreshKeywordCache()];
                    case 2:
                        _d.sent();
                        if (!this.db || this.keywordCache.length === 0) {
                            return [2 /*return*/, []];
                        }
                        try {
                            fullText = "".concat(title, " ").concat(content || snippet).toLowerCase();
                            titleLower = title.toLowerCase();
                            firstParagraph = this.extractFirstParagraph(content || snippet).toLowerCase();
                            marketMatches = new Map();
                            // Find all keyword matches
                            for (_i = 0, _a = this.keywordCache; _i < _a.length; _i++) {
                                kw = _a[_i];
                                keyword = kw.keyword.toLowerCase();
                                position = 'body';
                                matchCount = 0;
                                titleMatches = this.countOccurrences(titleLower, keyword);
                                if (titleMatches > 0) {
                                    position = 'title';
                                    matchCount += titleMatches;
                                }
                                // Check first paragraph
                                if (matchCount === 0) {
                                    fpMatches = this.countOccurrences(firstParagraph, keyword);
                                    if (fpMatches > 0) {
                                        position = 'first_paragraph';
                                        matchCount += fpMatches;
                                    }
                                }
                                // Check full text (body)
                                if (matchCount === 0) {
                                    bodyMatches = this.countOccurrences(fullText, keyword);
                                    if (bodyMatches > 0) {
                                        position = 'body';
                                        matchCount += bodyMatches;
                                    }
                                }
                                // If we found matches, record them
                                if (matchCount > 0) {
                                    if (!marketMatches.has(kw.marketId)) {
                                        marketMatches.set(kw.marketId, {
                                            marketId: kw.marketId,
                                            marketName: kw.marketName,
                                            marketType: kw.marketType,
                                            matches: [],
                                        });
                                    }
                                    market = marketMatches.get(kw.marketId);
                                    market.matches.push({
                                        keyword: kw.keyword,
                                        weight: kw.weight,
                                        position: position,
                                    });
                                }
                            }
                            mentions = [];
                            for (_b = 0, marketMatches_1 = marketMatches; _b < marketMatches_1.length; _b++) {
                                _c = marketMatches_1[_b], _1 = _c[0], market = _c[1];
                                relevanceScore = this.calculateRelevanceScore(market.matches);
                                // Skip low-relevance mentions
                                if (relevanceScore < 30)
                                    continue;
                                context = this.extractContext(fullText, market.matches[0].keyword);
                                sentiment = this.analyzeSentiment(context);
                                positions = market.matches.map(function (m) { return m.position; });
                                bestPosition = positions.includes('title') ? 'title' :
                                    positions.includes('first_paragraph') ? 'first_paragraph' : 'body';
                                mentions.push({
                                    marketId: market.marketId,
                                    marketName: market.marketName,
                                    marketType: market.marketType,
                                    relevanceScore: relevanceScore,
                                    mentionCount: market.matches.length,
                                    context: context.slice(0, 500),
                                    extractedKeywords: __spreadArray([], new Set(market.matches.map(function (m) { return m.keyword; })), true),
                                    sentiment: sentiment.label,
                                    sentimentScore: sentiment.score,
                                    position: bestPosition,
                                    extractionMethod: 'keyword',
                                });
                            }
                            // Sort by relevance score
                            mentions.sort(function (a, b) { return b.relevanceScore - a.relevanceScore; });
                            logger_1.default.debug("[MarketMentionExtractor] Found ".concat(mentions.length, " market mentions for article ").concat(articleId));
                            return [2 /*return*/, mentions];
                        }
                        catch (error) {
                            logger_1.default.error("[MarketMentionExtractor] Failed to extract mentions for ".concat(articleId, ":"), error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Store extracted mentions in database
     */
    MarketMentionExtractor.prototype.storeMentions = function (articleId, mentions) {
        return __awaiter(this, void 0, void 0, function () {
            var now_1, insertStmt_1, txn, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db || mentions.length === 0)
                            return [2 /*return*/, 0];
                        try {
                            now_1 = new Date().toISOString();
                            insertStmt_1 = this.db.prepare("\n        INSERT OR REPLACE INTO market_mentions (\n          article_id, market_id, relevance_score, mention_count,\n          mention_context, extracted_keywords, mention_sentiment, sentiment_score,\n          mention_position, extraction_method, extracted_at\n        ) VALUES (\n          @articleId, @marketId, @relevanceScore, @mentionCount,\n          @context, @keywords, @sentiment, @sentimentScore,\n          @position, @method, @extractedAt\n        )\n      ");
                            txn = this.db.transaction(function () {
                                var count = 0;
                                for (var _i = 0, mentions_1 = mentions; _i < mentions_1.length; _i++) {
                                    var mention = mentions_1[_i];
                                    insertStmt_1.run({
                                        articleId: articleId,
                                        marketId: mention.marketId,
                                        relevanceScore: mention.relevanceScore,
                                        mentionCount: mention.mentionCount,
                                        context: mention.context,
                                        keywords: JSON.stringify(mention.extractedKeywords),
                                        sentiment: mention.sentiment,
                                        sentimentScore: mention.sentimentScore,
                                        position: mention.position,
                                        method: mention.extractionMethod,
                                        extractedAt: now_1,
                                    });
                                    count++;
                                }
                                return count;
                            });
                            result = txn();
                            logger_1.default.debug("[MarketMentionExtractor] Stored ".concat(result, " mentions for article ").concat(articleId));
                            return [2 /*return*/, result];
                        }
                        catch (error) {
                            logger_1.default.error("[MarketMentionExtractor] Failed to store mentions for ".concat(articleId, ":"), error);
                            return [2 /*return*/, 0];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get mentions for a specific market
     */
    MarketMentionExtractor.prototype.getMentionsForMarket = function (marketId_1) {
        return __awaiter(this, arguments, void 0, function (marketId, hours, minRelevance) {
            var rows;
            if (hours === void 0) { hours = 24; }
            if (minRelevance === void 0) { minRelevance = 30; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            rows = this.db.prepare("\n        SELECT \n          mm.article_id,\n          na.title,\n          mm.relevance_score,\n          mm.sentiment_score,\n          mm.extracted_at\n        FROM market_mentions mm\n        JOIN news_articles na ON mm.article_id = na.id\n        WHERE mm.market_id = ?\n        AND mm.relevance_score >= ?\n        AND mm.extracted_at > datetime('now', '-".concat(hours, " hours')\n        ORDER BY mm.relevance_score DESC, mm.extracted_at DESC\n      ")).all(marketId, minRelevance);
                            return [2 /*return*/, rows.map(function (r) { return ({
                                    articleId: r.article_id,
                                    title: r.title,
                                    relevanceScore: r.relevance_score,
                                    sentimentScore: r.sentiment_score,
                                    extractedAt: new Date(r.extracted_at),
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error("[MarketMentionExtractor] Failed to get mentions for market ".concat(marketId, ":"), error);
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get top mentioned markets in timeframe
     */
    MarketMentionExtractor.prototype.getTopMentionedMarkets = function () {
        return __awaiter(this, arguments, void 0, function (hours, limit) {
            var rows;
            if (hours === void 0) { hours = 24; }
            if (limit === void 0) { limit = 20; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.db)
                            return [2 /*return*/, []];
                        try {
                            rows = this.db.prepare("\n        SELECT \n          m.id as market_id,\n          m.name as market_name,\n          m.type as market_type,\n          m.category,\n          COUNT(mm.id) as mention_count,\n          COUNT(DISTINCT mm.article_id) as article_count,\n          AVG(mm.relevance_score) as avg_relevance,\n          AVG(mm.sentiment_score) as avg_sentiment\n        FROM markets m\n        JOIN market_mentions mm ON m.id = mm.market_id\n        WHERE mm.extracted_at > datetime('now', '-".concat(hours, " hours')\n        AND m.active = 1\n        GROUP BY m.id\n        ORDER BY mention_count DESC, article_count DESC\n        LIMIT ?\n      ")).all(limit);
                            return [2 /*return*/, rows.map(function (r) { return ({
                                    marketId: r.market_id,
                                    marketName: r.market_name,
                                    marketType: r.market_type,
                                    category: r.category,
                                    mentionCount: r.mention_count,
                                    articleCount: r.article_count,
                                    avgRelevance: r.avg_relevance,
                                    avgSentiment: r.avg_sentiment,
                                }); })];
                        }
                        catch (error) {
                            logger_1.default.error('[MarketMentionExtractor] Failed to get top mentioned markets:', error);
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
    MarketMentionExtractor.prototype.countOccurrences = function (text, keyword) {
        var regex = new RegExp("\\b".concat(this.escapeRegex(keyword), "\\b"), 'gi');
        var matches = text.match(regex);
        return matches ? matches.length : 0;
    };
    MarketMentionExtractor.prototype.escapeRegex = function (str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };
    MarketMentionExtractor.prototype.extractFirstParagraph = function (text) {
        var paragraphs = text.split(/\n\n+/);
        return paragraphs[0] || '';
    };
    MarketMentionExtractor.prototype.calculateRelevanceScore = function (matches) {
        var score = 0;
        for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
            var match = matches_1[_i];
            // Base weight
            var matchScore = match.weight * 20; // Scale to 0-100 range
            // Position multiplier
            var positionMultiplier = {
                title: 2.0,
                headline: 1.8,
                first_paragraph: 1.5,
                body: 1.0,
            }[match.position] || 1.0;
            matchScore *= positionMultiplier;
            score += matchScore;
        }
        // Cap at 100
        return Math.min(100, Math.round(score));
    };
    MarketMentionExtractor.prototype.extractContext = function (text, keyword, windowSize) {
        if (windowSize === void 0) { windowSize = 100; }
        var index = text.toLowerCase().indexOf(keyword.toLowerCase());
        if (index === -1)
            return '';
        var start = Math.max(0, index - windowSize);
        var end = Math.min(text.length, index + keyword.length + windowSize);
        return text.slice(start, end).trim();
    };
    MarketMentionExtractor.prototype.analyzeSentiment = function (text) {
        // Simple rule-based sentiment analysis
        var positiveWords = [
            'surge', 'rally', 'boom', 'breakthrough', 'bullish', 'gain', 'rise', 'soar', 'rocket',
            'moon', 'pump', 'up', 'high', 'strong', 'growth', 'profit', 'success', 'win', 'positive',
            'optimistic', 'confident', 'momentum', 'support', 'bounce', 'recover', 'green', ' ATH',
            'all-time high', 'adopt', 'partnership', 'launch', 'upgrade', 'improve', 'beat',
            'exceed', 'outperform', 'breakout', ' ATH ', ' ath ', ' all-time', ' all time'
        ];
        var negativeWords = [
            'crash', 'plunge', 'dump', 'bearish', 'loss', 'fall', 'drop', 'decline', 'tank',
            'down', 'low', 'weak', 'crash', 'fear', 'panic', 'sell-off', 'liquidation', 'fud',
            'negative', 'pessimistic', 'worry', 'concern', 'risk', 'threat', 'ban', 'regulate',
            'hack', 'exploit', 'bug', 'delay', 'cancel', 'fail', 'miss', 'underperform', 'red',
            'death', 'blood', 'capitulation', 'bottom', 'dump', ' selloff', ' sell-off', 'fear'
        ];
        var textLower = text.toLowerCase();
        var positiveScore = 0;
        var negativeScore = 0;
        for (var _i = 0, positiveWords_1 = positiveWords; _i < positiveWords_1.length; _i++) {
            var word = positiveWords_1[_i];
            var regex = new RegExp("\\b".concat(this.escapeRegex(word), "\\b"), 'gi');
            var matches = textLower.match(regex);
            if (matches)
                positiveScore += matches.length;
        }
        for (var _a = 0, negativeWords_1 = negativeWords; _a < negativeWords_1.length; _a++) {
            var word = negativeWords_1[_a];
            var regex = new RegExp("\\b".concat(this.escapeRegex(word), "\\b"), 'gi');
            var matches = textLower.match(regex);
            if (matches)
                negativeScore += matches.length;
        }
        // Calculate normalized score (-1 to 1)
        var total = positiveScore + negativeScore;
        if (total === 0) {
            return { label: 'neutral', score: 0 };
        }
        var rawScore = (positiveScore - negativeScore) / total;
        // Map to label
        var label;
        if (rawScore > 0.6)
            label = 'very_positive';
        else if (rawScore > 0.2)
            label = 'positive';
        else if (rawScore < -0.6)
            label = 'very_negative';
        else if (rawScore < -0.2)
            label = 'negative';
        else
            label = 'neutral';
        return { label: label, score: rawScore };
    };
    return MarketMentionExtractor;
}());
exports.marketMentionExtractor = new MarketMentionExtractor();
exports.default = exports.marketMentionExtractor;
