"use strict";
// Vector Store Service - ChromaDB Integration
// Stores and retrieves pattern embeddings for market memory
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
exports.VectorStore = void 0;
var chromadb_1 = require("chromadb");
var logger_1 = require("../shared/logger");
/**
 * Vector Store Service for pattern recognition and memory
 */
var VectorStore = /** @class */ (function () {
    function VectorStore() {
        this.patternCollection = null;
        this.tradeCollection = null;
        this.initialized = false;
        var chromaUrl = process.env.CHROMA_URL || process.env.CHROMADB_URL;
        var urlHost;
        var urlPort;
        if (chromaUrl) {
            try {
                var parsed = new URL(chromaUrl);
                urlHost = parsed.hostname;
                if (parsed.port) {
                    var parsedPort = Number.parseInt(parsed.port, 10);
                    if (Number.isFinite(parsedPort)) {
                        urlPort = parsedPort;
                    }
                }
            }
            catch (_a) {
                // Ignore malformed URL and fall back to explicit host/port vars.
            }
        }
        var host = process.env.CHROMA_HOST || urlHost || '127.0.0.1';
        var port = process.env.CHROMA_PORT ? Number.parseInt(process.env.CHROMA_PORT, 10) : (urlPort !== null && urlPort !== void 0 ? urlPort : 8001);
        var resolvedPort = Number.isFinite(port) ? port : 8001;
        this.client = new chromadb_1.ChromaClient({ host: host, port: resolvedPort });
    }
    /**
     * Initialize collections
     */
    VectorStore.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, error_1;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (this.initialized)
                            return [2 /*return*/];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 5]);
                        logger_1.default.info('Initializing vector store...');
                        // Collection for price patterns
                        _a = this;
                        return [4 /*yield*/, this.client.getOrCreateCollection({
                                name: 'price_patterns',
                                metadata: { description: 'Historical price patterns with outcomes' },
                                embeddingFunction: null,
                            })];
                    case 2:
                        // Collection for price patterns
                        _a.patternCollection = _c.sent();
                        // Collection for trade outcomes
                        _b = this;
                        return [4 /*yield*/, this.client.getOrCreateCollection({
                                name: 'trade_outcomes',
                                metadata: { description: 'Trade results for learning' },
                                embeddingFunction: null,
                            })];
                    case 3:
                        // Collection for trade outcomes
                        _b.tradeCollection = _c.sent();
                        this.initialized = true;
                        logger_1.default.info('Vector store initialized successfully');
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _c.sent();
                        logger_1.default.error('Failed to initialize vector store:', error_1);
                        throw error_1;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Validate input arrays for embedding generation
     */
    VectorStore.prototype.validateEmbeddingInputs = function (candles, indicators) {
        var _a;
        if (!candles || candles.length < 20) {
            return { valid: false, error: "Insufficient candles: ".concat((candles === null || candles === void 0 ? void 0 : candles.length) || 0, " < 20") };
        }
        if (!indicators) {
            return { valid: false, error: 'Indicators object is null or undefined' };
        }
        if (!indicators.rsi || indicators.rsi.length < 5) {
            return { valid: false, error: "Insufficient RSI data: ".concat(((_a = indicators.rsi) === null || _a === void 0 ? void 0 : _a.length) || 0, " < 5") };
        }
        if (!indicators.macd || !indicators.macd.histogram || indicators.macd.histogram.length < 5) {
            return { valid: false, error: "Insufficient MACD histogram data" };
        }
        if (!indicators.bollinger || !indicators.bollinger.upper || !indicators.bollinger.lower) {
            return { valid: false, error: 'Missing Bollinger bands data' };
        }
        // Check for null/NaN values in key indicators
        var hasNullRSI = indicators.rsi.some(function (v) { return v === null || v === undefined || !Number.isFinite(v); });
        if (hasNullRSI) {
            return { valid: false, error: 'RSI contains null, NaN, or infinite values' };
        }
        var hasNullMACD = indicators.macd.histogram.some(function (v) { return v === null || v === undefined || !Number.isFinite(v); });
        if (hasNullMACD) {
            return { valid: false, error: 'MACD histogram contains null, NaN, or infinite values' };
        }
        return { valid: true, error: null };
    };
    /**
     * Safely get array value with bounds checking and null validation
     */
    VectorStore.prototype.safeArrayGet = function (arr, index, fallback) {
        if (!arr || arr.length === 0)
            return fallback;
        if (index < 0 || index >= arr.length)
            return fallback;
        var value = arr[index];
        return (value !== null && value !== undefined && Number.isFinite(value)) ? value : fallback;
    };
    /**
     * Create an embedding from market data and indicators
     * This is a simplified approach - in production you'd use an embedding model
     */
    VectorStore.prototype.createPatternEmbedding = function (candles, indicators) {
        var _a;
        // Validate inputs
        var validation = this.validateEmbeddingInputs(candles, indicators);
        if (!validation.valid) {
            logger_1.default.error("[VectorStore] ".concat(validation.error, ", returning default embedding"));
            return new Array(40).fill(0);
        }
        // Normalize recent price action into a fixed-size vector
        var recentCandles = candles.slice(-20);
        var embedding = [];
        // Price changes (normalized)
        var firstClose = ((_a = recentCandles[0]) === null || _a === void 0 ? void 0 : _a.close) || 1;
        var safeFirstClose = firstClose === 0 ? 1 : firstClose;
        for (var _i = 0, recentCandles_1 = recentCandles; _i < recentCandles_1.length; _i++) {
            var candle = recentCandles_1[_i];
            embedding.push((candle.close - safeFirstClose) / safeFirstClose);
        }
        // RSI values (last 5, normalized to 0-1)
        var recentRSI = indicators.rsi.slice(-5);
        for (var _b = 0, recentRSI_1 = recentRSI; _b < recentRSI_1.length; _b++) {
            var rsi = recentRSI_1[_b];
            var safeRSI = this.safeArrayGet(indicators.rsi, indicators.rsi.indexOf(rsi), 50);
            embedding.push(safeRSI / 100);
        }
        // MACD histogram (last 5, normalized)
        var absHistogram = indicators.macd.histogram.map(Math.abs);
        var maxHist = absHistogram.length > 0 ? Math.max.apply(Math, absHistogram) : 1;
        var safeMaxHist = maxHist === 0 ? 1 : maxHist;
        var recentHist = indicators.macd.histogram.slice(-5);
        for (var _c = 0, recentHist_1 = recentHist; _c < recentHist_1.length; _c++) {
            var hist = recentHist_1[_c];
            var safeHist = this.safeArrayGet(indicators.macd.histogram, indicators.macd.histogram.indexOf(hist), 0);
            embedding.push(safeHist / safeMaxHist);
        }
        // Bollinger position (last 5)
        for (var i = recentCandles.length - 5; i < recentCandles.length; i++) {
            if (i >= 0 && i < recentCandles.length) {
                var bbUpper = this.safeArrayGet(indicators.bollinger.upper, i, 0);
                var bbLower = this.safeArrayGet(indicators.bollinger.lower, i, 0);
                var bbRange = bbUpper - bbLower;
                var safeBBRange = Math.abs(bbRange) < 0.0001 ? 1 : bbRange;
                var position = (recentCandles[i].close - bbLower) / safeBBRange;
                embedding.push(Math.max(0, Math.min(1, position)));
            }
            else {
                embedding.push(0.5);
            }
        }
        // Volume trend (last 5, normalized)
        var avgVolume = recentCandles.reduce(function (sum, c) { return sum + c.volume; }, 0) / recentCandles.length;
        var safeAvgVolume = avgVolume === 0 ? 1 : avgVolume;
        for (var i = recentCandles.length - 5; i < recentCandles.length; i++) {
            if (i >= 0 && i < recentCandles.length) {
                var vol = recentCandles[i].volume;
                embedding.push(vol / safeAvgVolume);
            }
            else {
                embedding.push(1);
            }
        }
        // Pad or truncate to fixed size (40 dimensions)
        while (embedding.length < 40)
            embedding.push(0);
        return embedding.slice(0, 40);
    };
    /**
     * Store a pattern with its outcome
     */
    VectorStore.prototype.storePattern = function (symbol, timeframe, candles, indicators, outcome, historicalReturn, regime) {
        return __awaiter(this, void 0, void 0, function () {
            var id, embedding, metadata;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.patternCollection)
                            throw new Error('Pattern collection not initialized');
                        id = crypto.randomUUID();
                        embedding = this.createPatternEmbedding(candles, indicators);
                        metadata = {
                            symbol: symbol,
                            timeframe: timeframe,
                            outcome: outcome,
                            historicalReturn: historicalReturn,
                            regime: regime,
                            timestamp: new Date().toISOString(),
                            indicators: JSON.stringify({
                                rsi: indicators.rsi.slice(-5),
                                macdHist: indicators.macd.histogram.slice(-5),
                            }),
                        };
                        return [4 /*yield*/, this.patternCollection.add({
                                ids: [id],
                                embeddings: [embedding],
                                metadatas: [metadata],
                                documents: ["".concat(symbol, " ").concat(timeframe, " pattern at ").concat(metadata.timestamp)],
                            })];
                    case 2:
                        _a.sent();
                        logger_1.default.debug("Stored pattern ".concat(id, " with outcome ").concat(outcome));
                        return [2 /*return*/, id];
                }
            });
        });
    };
    /**
     * Query for similar patterns
     */
    VectorStore.prototype.querySimilarPatterns = function (symbol_1, timeframe_1, candles_1, indicators_1) {
        return __awaiter(this, arguments, void 0, function (symbol, timeframe, candles, indicators, limit) {
            var embedding, results, matches, i, metadata, distance, error_2;
            var _a, _b, _c, _d, _e, _f;
            if (limit === void 0) { limit = 5; }
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _g.sent();
                        if (!this.patternCollection)
                            return [2 /*return*/, []];
                        embedding = this.createPatternEmbedding(candles, indicators);
                        _g.label = 2;
                    case 2:
                        _g.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.patternCollection.query({
                                queryEmbeddings: [embedding],
                                nResults: limit,
                                where: {
                                    $and: [
                                        { symbol: { $eq: symbol } },
                                        { timeframe: { $eq: timeframe } },
                                    ],
                                },
                            })];
                    case 3:
                        results = _g.sent();
                        if (!results.ids || !results.ids[0])
                            return [2 /*return*/, []];
                        matches = [];
                        for (i = 0; i < results.ids[0].length; i++) {
                            metadata = (_b = (_a = results.metadatas) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b[i];
                            distance = ((_d = (_c = results.distances) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d[i]) || 1;
                            if (metadata) {
                                matches.push({
                                    id: results.ids[0][i],
                                    pattern: ((_f = (_e = results.documents) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f[i]) || '',
                                    similarity: 1 - distance, // Convert distance to similarity
                                    outcome: metadata.outcome,
                                    historicalReturn: metadata.historicalReturn,
                                    timestamp: new Date(metadata.timestamp),
                                    context: { regime: metadata.regime },
                                });
                            }
                        }
                        logger_1.default.debug("Found ".concat(matches.length, " similar patterns for ").concat(symbol, " ").concat(timeframe));
                        return [2 /*return*/, matches];
                    case 4:
                        error_2 = _g.sent();
                        logger_1.default.error('Failed to query similar patterns:', error_2);
                        return [2 /*return*/, []];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Store a trade outcome for learning
     */
    VectorStore.prototype.storeTradeOutcome = function (strategyId, symbol, entryIndicators, candles, pnl, metadata) {
        return __awaiter(this, void 0, void 0, function () {
            var id, embedding;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        if (!this.tradeCollection)
                            return [2 /*return*/];
                        id = crypto.randomUUID();
                        embedding = this.createPatternEmbedding(candles, entryIndicators);
                        return [4 /*yield*/, this.tradeCollection.add({
                                ids: [id],
                                embeddings: [embedding],
                                metadatas: [__assign({ strategyId: strategyId, symbol: symbol, pnl: pnl, profitable: pnl > 0, timestamp: new Date().toISOString() }, metadata)],
                                documents: ["Trade on ".concat(symbol, ": PnL ").concat(pnl.toFixed(4))],
                            })];
                    case 2:
                        _a.sent();
                        logger_1.default.debug("Stored trade outcome ".concat(id, " with PnL ").concat(pnl));
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get statistics about stored patterns
     */
    VectorStore.prototype.getStats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var patternCount, tradeCount;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.initialize()];
                    case 1:
                        _c.sent();
                        return [4 /*yield*/, ((_a = this.patternCollection) === null || _a === void 0 ? void 0 : _a.count())];
                    case 2:
                        patternCount = (_c.sent()) || 0;
                        return [4 /*yield*/, ((_b = this.tradeCollection) === null || _b === void 0 ? void 0 : _b.count())];
                    case 3:
                        tradeCount = (_c.sent()) || 0;
                        return [2 /*return*/, { patterns: patternCount, trades: tradeCount }];
                }
            });
        });
    };
    return VectorStore;
}());
exports.VectorStore = VectorStore;
// Singleton instance
var vectorStore = new VectorStore();
exports.default = vectorStore;
