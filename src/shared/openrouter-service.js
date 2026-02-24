"use strict";
// OpenRouter Service
// Provides embeddings and labeling for news/heatmap system via OpenRouter API
// Primary for news components, with GLM as fallback for trading components
// Enhanced with Redis caching for ultra-fast responses
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
var axios_1 = require("axios");
var https_1 = require("https");
var http_1 = require("http");
var config_1 = require("./config");
var logger_1 = require("./logger");
var redis_cache_1 = require("./redis-cache");
var title_cleaner_1 = require("./title-cleaner");
var config = config_1.default.get();
// Create shared axios instance with connection pooling for better performance
var axiosInstance = axios_1.default.create({
    httpAgent: new http_1.default.Agent({ keepAlive: true, maxSockets: 10, maxFreeSockets: 5 }),
    httpsAgent: new https_1.default.Agent({ keepAlive: true, maxSockets: 10, maxFreeSockets: 5 }),
});
var OpenRouterService = /** @class */ (function () {
    function OpenRouterService() {
        // Cache metrics
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.baseUrl = config.openrouter.baseUrl;
        this.apiKey = config.openrouter.apiKey;
        this.labelingModel = config.openrouter.labelingModel;
        this.embeddingModel = config.openrouter.embeddingModel;
        this.timeout = config.openrouter.timeout;
    }
    OpenRouterService.prototype.canUseService = function () {
        return !!this.apiKey && this.apiKey.length > 0 && this.apiKey !== 'your-api-key-here';
    };
    OpenRouterService.prototype.safeErrorMessage = function (error) {
        var _a, _b, _c, _d, _e, _f;
        var status = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status;
        var apiMessage = ((_d = (_c = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message) || ((_f = (_e = error === null || error === void 0 ? void 0 : error.response) === null || _e === void 0 ? void 0 : _e.data) === null || _f === void 0 ? void 0 : _f.message);
        var code = error === null || error === void 0 ? void 0 : error.code;
        var message = error === null || error === void 0 ? void 0 : error.message;
        return [
            status ? "HTTP ".concat(status) : null,
            code ? "code=".concat(code) : null,
            apiMessage ? "api=".concat(String(apiMessage)) : null,
            message ? "msg=".concat(String(message)) : null,
        ].filter(Boolean).join(' ');
    };
    /**
     * Get cache statistics
     */
    OpenRouterService.prototype.getCacheStats = function () {
        var total = this.cacheHits + this.cacheMisses;
        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: total > 0 ? this.cacheHits / total : 0,
        };
    };
    /**
     * Generate embeddings for text using OpenRouter with Redis cache
     */
    OpenRouterService.prototype.generateEmbedding = function (text) {
        return __awaiter(this, void 0, void 0, function () {
            var cached, safeText, response, data, embedding, error_1;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.canUseService()) {
                            logger_1.default.debug('[OpenRouter] API key not configured for embeddings');
                            return [2 /*return*/, null];
                        }
                        return [4 /*yield*/, redis_cache_1.default.getEmbedding(text)];
                    case 1:
                        cached = _c.sent();
                        if (cached) {
                            this.cacheHits++;
                            logger_1.default.debug('[OpenRouter] Embedding cache hit');
                            return [2 /*return*/, cached];
                        }
                        this.cacheMisses++;
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 6, , 7]);
                        safeText = text.substring(0, 8000);
                        return [4 /*yield*/, axiosInstance.post("".concat(this.baseUrl, "/chat/completions"), {
                                model: this.embeddingModel,
                                messages: [
                                    {
                                        role: 'user',
                                        content: "Generate an embedding vector for this text: ".concat(safeText),
                                    },
                                ],
                            }, {
                                headers: {
                                    'Authorization': "Bearer ".concat(this.apiKey),
                                    'Content-Type': 'application/json',
                                    'HTTP-Referer': 'https://perps-trader.ai',
                                    'X-Title': 'PerpsTrader News System',
                                },
                                timeout: this.timeout,
                            })];
                    case 3:
                        response = _c.sent();
                        data = response.data;
                        if (!((_b = (_a = data === null || data === void 0 ? void 0 : data.data) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.embedding)) return [3 /*break*/, 5];
                        embedding = data.data[0].embedding;
                        // Cache the result
                        return [4 /*yield*/, redis_cache_1.default.setEmbedding(text, embedding)];
                    case 4:
                        // Cache the result
                        _c.sent();
                        return [2 /*return*/, embedding];
                    case 5:
                        logger_1.default.warn('[OpenRouter] Unexpected embedding response format');
                        return [2 /*return*/, null];
                    case 6:
                        error_1 = _c.sent();
                        logger_1.default.debug("[OpenRouter] Embedding generation failed: ".concat(this.safeErrorMessage(error_1)));
                        return [2 /*return*/, null];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate event label for a single news article with cache
     */
    OpenRouterService.prototype.generateEventLabel = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var title, fingerprint, cached, prompt, response, content, match, jsonString, openBraces, closeBraces, openBrackets, closeBrackets, i, i, parsed, topic, subEventType, trendDirection, urgency, result, error_2;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        if (!this.canUseService()) {
                            return [2 /*return*/, null];
                        }
                        title = (input.title || '').trim();
                        if (!title)
                            return [2 /*return*/, null];
                        fingerprint = (0, title_cleaner_1.getTitleFingerprint)(title);
                        return [4 /*yield*/, redis_cache_1.default.getEventLabel(fingerprint)];
                    case 1:
                        cached = _e.sent();
                        if (cached) {
                            this.cacheHits++;
                            logger_1.default.debug('[OpenRouter] Event label cache hit');
                            return [2 /*return*/, cached];
                        }
                        this.cacheMisses++;
                        prompt = "You are a financial news analyst for a crypto/perps trading dashboard.\n\nAnalyze this headline and extract specific event details.\n\nHEADLINE: ".concat(title, "\nCATEGORY: ").concat(input.category || 'UNKNOWN', "\nTAGS: ").concat((input.tags || []).slice(0, 5).join(', ') || 'none', "\n\nCRITICAL RULES FOR topic GENERATION:\n1. MUST be proper English with complete sentence structure\n2. MUST start with a SPECIFIC ENTITY (company, person, country, token, protocol)\n3. Followed by SPECIFIC ACTION (what happened) - use active verbs\n4. Title Case format with proper spacing (NO underscores)\n5. 3-8 words maximum - keep it concise\n6. NO generic terms - be specific\n7. Proper grammar: Subject + Verb + Object structure\n\nENTITY EXAMPLES:\n- Companies: Tesla, Nvidia, Binance, Coinbase, MicroStrategy\n- People: Jerome Powell, Elon Musk, Christine Lagarde\n- Countries/Regions: United States, China, European Union, Iran\n- Tokens: Bitcoin, Ethereum, Solana, Dogecoin\n- Protocols: Uniswap, Aave, Compound, Arbitrum\n\nACTION VERBS (use these):\n- Approves, Rejects, Launches, Hacks, Bans, Sues, Acquires\n- Reports, Raises, Cuts, Files, Delists, Lists, Partners\n- Mergers, Beats, Misses, Signs, Exits\n\nGood topics (proper English structure):\n\u2713 \"Bitcoin Spot ETF Approval by SEC\"\n\u2713 \"Federal Reserve Raises Interest Rates to 5.25%\"\n\u2713 \"Binance Suffers $400M Security Breach\"\n\u2713 \"Tesla Q4 Earnings Beat Expectations\"\n\u2713 \"Iran Protests Against Government\"\n\u2713 \"Ethereum Dencun Upgrade Goes Live\"\n\u2713 \"Crystal Palace Signs Sidiki Cherif\"\n\nBad topics (REJECT - poor grammar or unclear):\n\u2717 \"Price Action\" (too generic)\n\u2717 \"Market Update\" (not specific)\n\u2717 \"Latest News\" (meaningless)\n\u2717 \"Crypto News\" (too broad)\n\u2717 \"Joins sidiki cherif agrees crystal\" (broken English)\n\u2717 \"Misses serie mourns rocco\" (incomplete)\n\u2717 \"Politics Breaking Political Video\" (wrong word order)\n\u2717 \"bitcoin_spot_etf\" (underscores, not Title Case)\n\n2. subEventType: specific action category\n   Options: seizure|approval|launch|hack|announcement|sanction|regulation|\n            earnings|price_surge|price_drop|breakout|partnership|listing|\n            delisting|merger|acquisition|proposal|ruling|protest|conflict|other\n\n3. trendDirection: is this bullish or bearish for markets?\n   UP: price surges, approvals, launches, partnerships, listings, breakthroughs\n   DOWN: hacks, sanctions, delistings, crashes, bans, conflicts\n   NEUTRAL: announcements, general news, scheduled events\n\n4. urgency: how time-sensitive is this?\n   CRITICAL: breaking major developments, immediate market impact\n   HIGH: significant news, scheduled events, data releases\n   MEDIUM: analysis, secondary coverage\n   LOW: retrospective, evergreen content\n\n5. keywords: 4-7 specific entities and terms (space-separated, searchable)\n   - Include the primary entity, specific event type, relevant names\n   - Good: [\"spot ETF\", \"Bitcoin\", \"SEC approval\", \"institutional\"]\n   - Bad: [\"spot_etf\", \"btc\", \"sec\"] (abbreviated, unclear)\n\nReturn JSON ONLY:\n{\n  \"topic\": \"...\",\n  \"subEventType\": \"...\",\n  \"trendDirection\": \"UP|DOWN|NEUTRAL\",\n  \"urgency\": \"CRITICAL|HIGH|MEDIUM|LOW\",\n  \"keywords\": [\"...\", \"...\"]\n}");
                        _e.label = 2;
                    case 2:
                        _e.trys.push([2, 5, , 6]);
                        return [4 /*yield*/, axiosInstance.post("".concat(this.baseUrl, "/chat/completions"), {
                                model: this.labelingModel,
                                messages: [
                                    {
                                        role: 'system',
                                        content: 'You are a precise financial news analyst. Always respond with valid JSON only.',
                                    },
                                    {
                                        role: 'user',
                                        content: prompt,
                                    },
                                ],
                                temperature: 0.1,
                                max_tokens: 500,
                            }, {
                                headers: {
                                    'Authorization': "Bearer ".concat(this.apiKey),
                                    'Content-Type': 'application/json',
                                    'HTTP-Referer': 'https://perps-trader.ai',
                                    'X-Title': 'PerpsTrader News System',
                                },
                                timeout: this.timeout,
                            })];
                    case 3:
                        response = _e.sent();
                        content = ((_b = (_a = response.data.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '';
                        match = content.match(/\{[\s\S]*\}/);
                        if (!match)
                            return [2 /*return*/, null];
                        jsonString = match[0];
                        openBraces = (jsonString.match(/\{/g) || []).length;
                        closeBraces = (jsonString.match(/\}/g) || []).length;
                        openBrackets = (jsonString.match(/\[/g) || []).length;
                        closeBrackets = (jsonString.match(/\]/g) || []).length;
                        // Add missing closing braces and brackets
                        for (i = 0; i < openBraces - closeBraces; i++) {
                            jsonString += '}';
                        }
                        for (i = 0; i < openBrackets - closeBrackets; i++) {
                            jsonString += ']';
                        }
                        // Remove trailing commas that would cause parse errors
                        jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
                        // Fix incomplete strings at the end
                        if (jsonString.match(/"[^"]*$/)) {
                            jsonString += '"';
                        }
                        parsed = JSON.parse(jsonString);
                        topic = String(parsed.topic || '').trim();
                        subEventType = String(parsed.subEventType || 'other').toLowerCase();
                        trendDirection = (_c = parsed.trendDirection) === null || _c === void 0 ? void 0 : _c.toUpperCase();
                        urgency = (_d = parsed.urgency) === null || _d === void 0 ? void 0 : _d.toUpperCase();
                        if (!topic || !['UP', 'DOWN', 'NEUTRAL'].includes(trendDirection || '')) {
                            return [2 /*return*/, null];
                        }
                        result = {
                            topic: topic,
                            subEventType: this.validateSubEventType(subEventType),
                            trendDirection: trendDirection,
                            urgency: this.validateUrgency(urgency),
                            keywords: Array.isArray(parsed.keywords)
                                ? parsed.keywords.map(function (k) { return String(k).trim(); }).filter(Boolean).slice(0, 7)
                                : [],
                        };
                        // Cache the result
                        return [4 /*yield*/, redis_cache_1.default.setEventLabel(fingerprint, result)];
                    case 4:
                        // Cache the result
                        _e.sent();
                        return [2 /*return*/, result];
                    case 5:
                        error_2 = _e.sent();
                        logger_1.default.debug("[OpenRouter] Event label generation failed: ".concat(this.safeErrorMessage(error_2)));
                        return [2 /*return*/, null];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Process a single batch for event labeling
     */
    OpenRouterService.prototype.processEventLabelBatch = function (batch, batchIndex) {
        return __awaiter(this, void 0, void 0, function () {
            var results, uncached, _i, batch_1, item, fingerprint, cached, articlesText, prompt, response, content, jsonMatch, jsonString, openBraces, closeBraces, openBrackets, closeBrackets, i, i, parsed, labels, labelsArray, _loop_1, this_1, _a, labelsArray_1, label, parseError_1, rawSnippet, error_3;
            var _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        results = new Map();
                        uncached = [];
                        _i = 0, batch_1 = batch;
                        _d.label = 1;
                    case 1:
                        if (!(_i < batch_1.length)) return [3 /*break*/, 4];
                        item = batch_1[_i];
                        fingerprint = (0, title_cleaner_1.getTitleFingerprint)(item.title);
                        return [4 /*yield*/, redis_cache_1.default.getEventLabel(fingerprint)];
                    case 2:
                        cached = _d.sent();
                        if (cached) {
                            this.cacheHits++;
                            results.set(item.id, cached);
                        }
                        else {
                            this.cacheMisses++;
                            uncached.push(item);
                        }
                        _d.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        if (uncached.length === 0) {
                            logger_1.default.info("[OpenRouter] Batch ".concat(batchIndex, ": All ").concat(batch.length, " items from cache"));
                            return [2 /*return*/, results];
                        }
                        logger_1.default.info("[OpenRouter] Batch ".concat(batchIndex, ": Cache hit ").concat(batch.length - uncached.length, "/").concat(batch.length, ", LLM processing ").concat(uncached.length));
                        articlesText = uncached
                            .map(function (item, index) {
                            return "".concat(index + 1, ". ID: ").concat(item.id, "\n   Title: ").concat(item.title, "\n   Category: ").concat(item.category || 'UNKNOWN', "\n   Tags: ").concat((item.tags || []).slice(0, 5).join(', ') || 'none');
                        })
                            .join('\n\n');
                        prompt = "You are a financial news analyst for a crypto/perps trading dashboard.\n\nAnalyze these headlines and extract event details.\n\n".concat(articlesText, "\n\nCRITICAL RULES FOR topic GENERATION:\n1. MUST be proper English with complete sentence structure\n2. MUST start with a SPECIFIC ENTITY (company, person, country, token, protocol)\n3. Followed by SPECIFIC ACTION (what happened) - use active verbs\n4. Title Case format with proper spacing (NO underscores)\n5. 3-8 words maximum - keep it concise\n6. NO generic terms - be specific\n7. Proper grammar: Subject + Verb + Object structure\n\nENTITY EXAMPLES:\n- Companies: Tesla, Nvidia, Binance, Coinbase, MicroStrategy\n- People: Jerome Powell, Elon Musk, Christine Lagarde\n- Countries/Regions: United States, China, European Union, Iran\n- Tokens: Bitcoin, Ethereum, Solana, Dogecoin\n- Protocols: Uniswap, Aave, Compound, Arbitrum\n\nACTION VERBS (use these):\n- Approves, Rejects, Launches, Hacks, Bans, Sues, Acquires\n- Reports, Raises, Cuts, Files, Delists, Lists, Partners\n- Mergers, Beats, Misses, Signs, Exits\n\nGood topics (proper English structure):\n\u2713 \"Bitcoin Spot ETF Approval by SEC\"\n\u2713 \"Federal Reserve Raises Interest Rates\"\n\u2713 \"Binance Security Breach\"\n\u2713 \"Tesla Q4 Earnings Beat\"\n\u2713 \"Iran Protests Against Government\"\n\u2713 \"Ethereum Dencun Upgrade Launch\"\n\nBad topics (REJECT - poor grammar or unclear):\n\u2717 \"Price Action\" (too generic)\n\u2717 \"Market Update\" (not specific)\n\u2717 \"Latest News\" (meaningless)\n\u2717 \"Crypto News\" (too broad)\n\u2717 \"Joins sidiki cherif agrees crystal\" (broken English)\n\u2717 \"Misses serie mourns rocco\" (incomplete)\n\u2717 \"Politics Breaking Political Video\" (wrong word order)\n\u2717 \"bitcoin_spot_etf\" (use spaces, not underscores)\n\nFor EACH article, provide:\n1. topic: 3-8 words, SPECIFIC ENTITY + SPECIFIC ACTION, Title Case\n2. subEventType: specific action category\n3. trendDirection: UP (bullish) | DOWN (bearish) | NEUTRAL\n4. urgency: CRITICAL | HIGH | MEDIUM | LOW\n5. keywords: 4-7 specific entities and terms (space-separated, searchable)\n\nReturn JSON ONLY in this format:\n{\n  \"labels\": [\n    {\n      \"id\": \"article-id-1\",\n      \"topic\": \"...\",\n      \"subEventType\": \"...\",\n      \"trendDirection\": \"UP|DOWN|NEUTRAL\",\n      \"urgency\": \"CRITICAL|HIGH|MEDIUM|LOW\",\n      \"keywords\": [\"...\", \"...\"]\n    }\n  ]\n}");
                        _d.label = 5;
                    case 5:
                        _d.trys.push([5, 16, , 17]);
                        return [4 /*yield*/, axiosInstance.post("".concat(this.baseUrl, "/chat/completions"), {
                                model: this.labelingModel,
                                messages: [
                                    {
                                        role: 'system',
                                        content: 'You are a precise financial news analyst. Always respond with valid JSON only.',
                                    },
                                    {
                                        role: 'user',
                                        content: prompt,
                                    },
                                ],
                                temperature: 0.1,
                                max_tokens: 8000,
                            }, {
                                headers: {
                                    'Authorization': "Bearer ".concat(this.apiKey),
                                    'Content-Type': 'application/json',
                                    'HTTP-Referer': 'https://perps-trader.ai',
                                    'X-Title': 'PerpsTrader News System',
                                },
                                timeout: this.timeout * 2,
                            })];
                    case 6:
                        response = _d.sent();
                        content = ((_c = (_b = response.data.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
                        jsonMatch = content.match(/\{[\s\S]*"labels"[\s\S]*\}/);
                        if (!jsonMatch) {
                            jsonMatch = content.match(/\{[\s\S]*\}/);
                        }
                        if (!jsonMatch) return [3 /*break*/, 14];
                        _d.label = 7;
                    case 7:
                        _d.trys.push([7, 12, , 13]);
                        jsonString = jsonMatch[0];
                        openBraces = (jsonString.match(/\{/g) || []).length;
                        closeBraces = (jsonString.match(/\}/g) || []).length;
                        openBrackets = (jsonString.match(/\[/g) || []).length;
                        closeBrackets = (jsonString.match(/\]/g) || []).length;
                        // Add missing closing braces and brackets
                        for (i = 0; i < openBraces - closeBraces; i++) {
                            jsonString += '}';
                        }
                        for (i = 0; i < openBrackets - closeBrackets; i++) {
                            jsonString += ']';
                        }
                        // Remove trailing commas that would cause parse errors
                        jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
                        // Additional repair: fix incomplete strings at the end
                        // If the JSON ends with an incomplete string, try to close it
                        if (jsonString.match(/"[^"]*$/)) {
                            jsonString += '"';
                        }
                        parsed = JSON.parse(jsonString);
                        labels = parsed.labels || parsed;
                        labelsArray = Array.isArray(labels) ? labels : [];
                        _loop_1 = function (label) {
                            var result, originalItem, fingerprint;
                            return __generator(this, function (_e) {
                                switch (_e.label) {
                                    case 0:
                                        if (!(label.id && label.topic && label.topic.length > 5)) return [3 /*break*/, 2];
                                        result = {
                                            topic: String(label.topic).trim(),
                                            subEventType: this_1.validateSubEventType(label.subEventType || 'other'),
                                            trendDirection: ['UP', 'DOWN', 'NEUTRAL'].includes(label.trendDirection)
                                                ? label.trendDirection
                                                : 'NEUTRAL',
                                            urgency: this_1.validateUrgency(label.urgency),
                                            keywords: Array.isArray(label.keywords)
                                                ? label.keywords.map(function (k) { return String(k).trim(); }).filter(Boolean).slice(0, 7)
                                                : [],
                                        };
                                        results.set(label.id, result);
                                        originalItem = uncached.find(function (u) { return u.id === label.id; });
                                        if (!originalItem) return [3 /*break*/, 2];
                                        fingerprint = (0, title_cleaner_1.getTitleFingerprint)(originalItem.title);
                                        return [4 /*yield*/, redis_cache_1.default.setEventLabel(fingerprint, result)];
                                    case 1:
                                        _e.sent();
                                        _e.label = 2;
                                    case 2: return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _a = 0, labelsArray_1 = labelsArray;
                        _d.label = 8;
                    case 8:
                        if (!(_a < labelsArray_1.length)) return [3 /*break*/, 11];
                        label = labelsArray_1[_a];
                        return [5 /*yield**/, _loop_1(label)];
                    case 9:
                        _d.sent();
                        _d.label = 10;
                    case 10:
                        _a++;
                        return [3 /*break*/, 8];
                    case 11: return [3 /*break*/, 13];
                    case 12:
                        parseError_1 = _d.sent();
                        rawSnippet = content.length > 500 ? content.substring(0, 500) + '...' : content;
                        logger_1.default.warn("[OpenRouter] Batch ".concat(batchIndex, " JSON parse failed: ").concat(parseError_1));
                        logger_1.default.debug("[OpenRouter] Raw response snippet: ".concat(rawSnippet));
                        // Attempt emergency fallback: extract partial data using regex
                        try {
                            this.emergencyExtractLabels(content, uncached, results);
                        }
                        catch (fallbackError) {
                            logger_1.default.debug("[OpenRouter] Emergency extraction also failed: ".concat(fallbackError));
                        }
                        return [3 /*break*/, 13];
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        logger_1.default.warn("[OpenRouter] Batch ".concat(batchIndex, ": No JSON found in response. Length: ").concat(content.length, ", Preview: ").concat(content.substring(0, 200), "..."));
                        _d.label = 15;
                    case 15:
                        logger_1.default.info("[OpenRouter] Batch ".concat(batchIndex, ": ").concat(results.size, " labeled from ").concat(batch.length, " articles"));
                        return [3 /*break*/, 17];
                    case 16:
                        error_3 = _d.sent();
                        logger_1.default.warn("[OpenRouter] Batch ".concat(batchIndex, " failed: ").concat(this.safeErrorMessage(error_3)));
                        return [3 /*break*/, 17];
                    case 17: return [2 /*return*/, results];
                }
            });
        });
    };
    /**
     * Generate event labels for multiple articles with PARALLEL batch processing and Redis cache
     */
    OpenRouterService.prototype.batchEventLabels = function (inputs) {
        return __awaiter(this, void 0, void 0, function () {
            var batchSize, concurrency, results, batches, i, _loop_2, i;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.canUseService() || inputs.length === 0) {
                            return [2 /*return*/, new Map()];
                        }
                        batchSize = 100;
                        concurrency = Number.parseInt(process.env.OPENROUTER_CONCURRENCY || '8', 10);
                        results = new Map();
                        batches = [];
                        for (i = 0; i < inputs.length; i += batchSize) {
                            batches.push(inputs.slice(i, i + batchSize));
                        }
                        _loop_2 = function (i) {
                            var concurrentBatches, batchResults, _i, batchResults_1, batchResult, _b, batchResult_1, _c, id, label;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        concurrentBatches = batches.slice(i, i + concurrency);
                                        return [4 /*yield*/, Promise.all(concurrentBatches.map(function (batch, idx) { return _this.processEventLabelBatch(batch, i + idx + 1); }))];
                                    case 1:
                                        batchResults = _d.sent();
                                        for (_i = 0, batchResults_1 = batchResults; _i < batchResults_1.length; _i++) {
                                            batchResult = batchResults_1[_i];
                                            for (_b = 0, batchResult_1 = batchResult; _b < batchResult_1.length; _b++) {
                                                _c = batchResult_1[_b], id = _c[0], label = _c[1];
                                                results.set(id, label);
                                            }
                                        }
                                        logger_1.default.info("[OpenRouter] Completed ".concat(Math.min(i + concurrency, batches.length), "/").concat(batches.length, " batches, ").concat(results.size, " labeled"));
                                        return [2 /*return*/];
                                }
                            });
                        };
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < batches.length)) return [3 /*break*/, 4];
                        return [5 /*yield**/, _loop_2(i)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        i += concurrency;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, results];
                }
            });
        });
    };
    /**
     * Process a single batch for categorization with cache
     */
    OpenRouterService.prototype.processCategorizationBatch = function (batch, batchIndex) {
        return __awaiter(this, void 0, void 0, function () {
            var results, uncached, _i, batch_2, article, fingerprint, cached, articlesText, prompt, response, content, jsonMatch, jsonString, openBraces, closeBraces, openBrackets, closeBrackets, i, i, parsed, _loop_3, _a, _b, article, parseError_2, rawSnippet, error_4;
            var _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        results = new Map();
                        uncached = [];
                        _i = 0, batch_2 = batch;
                        _e.label = 1;
                    case 1:
                        if (!(_i < batch_2.length)) return [3 /*break*/, 4];
                        article = batch_2[_i];
                        fingerprint = (0, title_cleaner_1.getTitleFingerprint)(article.title);
                        return [4 /*yield*/, redis_cache_1.default.getCategorization(fingerprint)];
                    case 2:
                        cached = _e.sent();
                        if (cached) {
                            this.cacheHits++;
                            results.set(article.id, cached);
                        }
                        else {
                            this.cacheMisses++;
                            uncached.push(article);
                        }
                        _e.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        if (uncached.length === 0) {
                            logger_1.default.debug("[OpenRouter] Categorization batch ".concat(batchIndex, ": All ").concat(batch.length, " from cache"));
                            return [2 /*return*/, results];
                        }
                        logger_1.default.debug("[OpenRouter] Categorization batch ".concat(batchIndex, ": Cache hit ").concat(batch.length - uncached.length, "/").concat(batch.length, ", LLM processing ").concat(uncached.length));
                        articlesText = uncached
                            .map(function (article, index) {
                            var contentPreview = article.content ? article.content.substring(0, 500) : article.snippet || '';
                            return "".concat(index + 1, ". ID: ").concat(article.id, "\n   Title: ").concat(article.title, "\n   Content: ").concat(contentPreview, "...\n   Source: ").concat(article.source || 'Unknown');
                        })
                            .join('\n\n');
                        prompt = "You are an expert news categorizer for a trading dashboard.\n\nCategorize these news articles. For each article, provide:\n1. Primary categories (choose from: CRYPTO, STOCKS, ECONOMICS, GEOPOLITICS, TECH, COMMODITIES, SPORTS, FOOTBALL, BASKETBALL, TENNIS, MMA, GOLF)\n2. Tags (3-5 relevant keywords/phrases, avoid generic terms like \"news\", \"update\", \"report\")\n3. Sentiment (BULLISH, BEARISH, NEUTRAL)\n4. Importance (LOW, MEDIUM, HIGH, CRITICAL)\n5. Brief summary (2-3 sentences capturing key points for traders)\n6. Trend topic label (3-8 words, human-readable Title Case, include entities + what's happening)\n   - Good: \"Spot Bitcoin ETF Approvals\", \"Federal Reserve Rate Decision\"\n   - Bad: \"btc_etf\", \"fed news\" (abbreviations, underscores, unclear)\n7. Trend keywords (4-8 short tokens for search/matching, space-separated)\n\nArticles:\n".concat(articlesText, "\n\nReturn JSON in this format:\n{\n  \"articles\": [\n    {\n      \"id\": \"article-id-1\",\n      \"categories\": [\"CRYPTO\"],\n      \"tags\": [\"bitcoin\", \"regulation\", \"etf\"],\n      \"sentiment\": \"BULLISH\",\n      \"importance\": \"HIGH\",\n      \"summary\": \"Bitcoin ETF approval drives institutional inflows.\",\n      \"trendTopic\": \"Spot Bitcoin ETF Approval\",\n      \"trendKeywords\": [\"bitcoin\", \"ETF\", \"spot\", \"flows\", \"institutional\"]\n    }\n  ]\n}");
                        _e.label = 5;
                    case 5:
                        _e.trys.push([5, 16, , 17]);
                        return [4 /*yield*/, axiosInstance.post("".concat(this.baseUrl, "/chat/completions"), {
                                model: this.labelingModel,
                                messages: [
                                    {
                                        role: 'system',
                                        content: 'You are an expert news categorizer for financial markets. Always respond with valid JSON only.',
                                    },
                                    {
                                        role: 'user',
                                        content: prompt,
                                    },
                                ],
                                temperature: 0.1,
                                max_tokens: 8000,
                            }, {
                                headers: {
                                    'Authorization': "Bearer ".concat(this.apiKey),
                                    'Content-Type': 'application/json',
                                    'HTTP-Referer': 'https://perps-trader.ai',
                                    'X-Title': 'PerpsTrader News System',
                                },
                                timeout: this.timeout * 2,
                            })];
                    case 6:
                        response = _e.sent();
                        content = ((_d = (_c = response.data.choices[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) || '';
                        jsonMatch = content.match(/\{[\s\S]*"articles"[\s\S]*\}/);
                        if (!jsonMatch) {
                            jsonMatch = content.match(/\{[\s\S]*\}/);
                        }
                        if (!jsonMatch) return [3 /*break*/, 14];
                        _e.label = 7;
                    case 7:
                        _e.trys.push([7, 12, , 13]);
                        jsonString = jsonMatch[0];
                        openBraces = (jsonString.match(/\{/g) || []).length;
                        closeBraces = (jsonString.match(/\}/g) || []).length;
                        openBrackets = (jsonString.match(/\[/g) || []).length;
                        closeBrackets = (jsonString.match(/\]/g) || []).length;
                        for (i = 0; i < openBraces - closeBraces; i++) {
                            jsonString += '}';
                        }
                        for (i = 0; i < openBrackets - closeBrackets; i++) {
                            jsonString += ']';
                        }
                        jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
                        if (jsonString.match(/"[^"]*$/)) {
                            jsonString += '"';
                        }
                        parsed = JSON.parse(jsonString);
                        _loop_3 = function (article) {
                            var result, originalArticle, fingerprint;
                            return __generator(this, function (_f) {
                                switch (_f.label) {
                                    case 0:
                                        result = {
                                            categories: article.categories || [],
                                            tags: (article.tags || []).slice(0, 8),
                                            sentiment: article.sentiment || 'NEUTRAL',
                                            importance: article.importance || 'MEDIUM',
                                            summary: article.summary || '',
                                            trendTopic: article.trendTopic,
                                            trendKeywords: (article.trendKeywords || []).slice(0, 8),
                                        };
                                        results.set(article.id, result);
                                        originalArticle = uncached.find(function (a) { return a.id === article.id; });
                                        if (!originalArticle) return [3 /*break*/, 2];
                                        fingerprint = (0, title_cleaner_1.getTitleFingerprint)(originalArticle.title);
                                        return [4 /*yield*/, redis_cache_1.default.setCategorization(fingerprint, result)];
                                    case 1:
                                        _f.sent();
                                        _f.label = 2;
                                    case 2: return [2 /*return*/];
                                }
                            });
                        };
                        _a = 0, _b = parsed.articles || [];
                        _e.label = 8;
                    case 8:
                        if (!(_a < _b.length)) return [3 /*break*/, 11];
                        article = _b[_a];
                        return [5 /*yield**/, _loop_3(article)];
                    case 9:
                        _e.sent();
                        _e.label = 10;
                    case 10:
                        _a++;
                        return [3 /*break*/, 8];
                    case 11: return [3 /*break*/, 13];
                    case 12:
                        parseError_2 = _e.sent();
                        logger_1.default.warn("[OpenRouter] Categorization batch ".concat(batchIndex, " JSON parse failed: ").concat(parseError_2));
                        rawSnippet = content.length > 500 ? content.substring(0, 500) + '...' : content;
                        logger_1.default.debug("[OpenRouter] Raw response snippet: ".concat(rawSnippet));
                        return [3 /*break*/, 13];
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        logger_1.default.warn("[OpenRouter] Categorization batch ".concat(batchIndex, ": No JSON found in response. Length: ").concat(content.length));
                        _e.label = 15;
                    case 15: return [3 /*break*/, 17];
                    case 16:
                        error_4 = _e.sent();
                        logger_1.default.debug("[OpenRouter] Categorization batch ".concat(batchIndex, " failed: ").concat(this.safeErrorMessage(error_4)));
                        return [3 /*break*/, 17];
                    case 17: return [2 /*return*/, results];
                }
            });
        });
    };
    /**
     * Categorize a batch of news articles with PARALLEL batch processing and Redis cache
     * Handles multiple batches if more than 100 articles
     */
    OpenRouterService.prototype.categorizeArticles = function (articles) {
        return __awaiter(this, void 0, void 0, function () {
            var batchSize, concurrency, allResults, batches, i, _loop_4, this_2, i;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.canUseService()) {
                            return [2 /*return*/, new Map()];
                        }
                        batchSize = 100;
                        concurrency = Number.parseInt(process.env.OPENROUTER_CONCURRENCY || '8', 10);
                        allResults = new Map();
                        batches = [];
                        for (i = 0; i < articles.length; i += batchSize) {
                            batches.push(articles.slice(i, i + batchSize));
                        }
                        _loop_4 = function (i) {
                            var concurrentBatches, batchResults, _i, batchResults_2, batchResult, _b, batchResult_2, _c, id, result, cacheRate;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        concurrentBatches = batches.slice(i, i + concurrency);
                                        return [4 /*yield*/, Promise.all(concurrentBatches.map(function (batch, idx) { return _this.processCategorizationBatch(batch, i + idx + 1); }))];
                                    case 1:
                                        batchResults = _d.sent();
                                        for (_i = 0, batchResults_2 = batchResults; _i < batchResults_2.length; _i++) {
                                            batchResult = batchResults_2[_i];
                                            for (_b = 0, batchResult_2 = batchResult; _b < batchResult_2.length; _b++) {
                                                _c = batchResult_2[_b], id = _c[0], result = _c[1];
                                                allResults.set(id, result);
                                            }
                                        }
                                        cacheRate = this_2.cacheHits / (this_2.cacheHits + this_2.cacheMisses) * 100;
                                        logger_1.default.info("[OpenRouter] Completed ".concat(Math.min(i + concurrency, batches.length), "/").concat(batches.length, " categorization batches, ").concat(allResults.size, " categorized (cache: ").concat(cacheRate.toFixed(1), "%)"));
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_2 = this;
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < batches.length)) return [3 /*break*/, 4];
                        return [5 /*yield**/, _loop_4(i)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        i += concurrency;
                        return [3 /*break*/, 1];
                    case 4:
                        logger_1.default.info("[OpenRouter] Total categorized: ".concat(allResults.size, " articles"));
                        return [2 /*return*/, allResults];
                }
            });
        });
    };
    OpenRouterService.prototype.validateSubEventType = function (value) {
        var validTypes = [
            'seizure', 'approval', 'launch', 'hack', 'announcement', 'sanction',
            'regulation', 'earnings', 'price_surge', 'price_drop', 'breakout',
            'partnership', 'listing', 'delisting', 'merger', 'acquisition',
            'proposal', 'ruling', 'protest', 'conflict', 'other'
        ];
        return validTypes.includes(value) ? value : 'other';
    };
    OpenRouterService.prototype.validateUrgency = function (value) {
        if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(value)) {
            return value;
        }
        return 'MEDIUM';
    };
    /**
     * Emergency fallback: Extract labels from malformed JSON using regex patterns
     * Attempts to salvage partial data when JSON parsing completely fails
     */
    OpenRouterService.prototype.emergencyExtractLabels = function (content, uncached, results) {
        logger_1.default.info('[OpenRouter] Attempting emergency label extraction from malformed response');
        // Pattern 1: Extract individual "id": "..." pairs with their following topic
        var idTopicPattern = /"id":\s*"([^"]+)"[\s\S]*?"topic":\s*"([^"]+)"/g;
        var match;
        var extracted = 0;
        var _loop_5 = function () {
            var id = match[1];
            var topic = match[2];
            // Verify this ID is in our uncached list
            if (uncached.find(function (u) { return u.id === id; }) && topic.length > 5) {
                // Extract other fields if available
                var trendMatch = content.substring(match.index).match(/"trendDirection":\s*"(\w+)"/);
                var urgencyMatch = content.substring(match.index).match(/"urgency":\s*"(\w+)"/);
                var keywordsMatch = content.substring(match.index).match(/"keywords":\s*\[(.*?)\]/);
                var keywords = keywordsMatch
                    ? keywordsMatch[1].split(',').map(function (k) { return k.trim().replace(/"/g, ''); }).filter(function (k) { return k.length > 0; })
                    : [];
                results.set(id, {
                    topic: topic,
                    subEventType: 'other',
                    trendDirection: (trendMatch && ['UP', 'DOWN', 'NEUTRAL'].includes(trendMatch[1]))
                        ? trendMatch[1]
                        : 'NEUTRAL',
                    urgency: (urgencyMatch && ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(urgencyMatch[1]))
                        ? urgencyMatch[1]
                        : 'MEDIUM',
                    keywords: keywords.slice(0, 7),
                });
                extracted++;
            }
        };
        while ((match = idTopicPattern.exec(content)) !== null && extracted < uncached.length) {
            _loop_5();
        }
        if (extracted > 0) {
            logger_1.default.info("[OpenRouter] Emergency extraction salvaged ".concat(extracted, " labels"));
        }
    };
    return OpenRouterService;
}());
var openrouterService = new OpenRouterService();
exports.default = openrouterService;
