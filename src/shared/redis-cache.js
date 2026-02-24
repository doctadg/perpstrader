"use strict";
// Redis Cache Service - LLM Response & Embedding Cache
// Provides ultra-fast caching for AI operations
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
exports.CacheTTL = void 0;
var ioredis_1 = require("ioredis");
var crypto_1 = require("crypto");
var logger_1 = require("./logger");
// Default TTL configurations
exports.CacheTTL = {
    LLM_RESPONSE: 3600, // 1 hour - LLM responses don't change often
    EMBEDDING: 86400, // 24 hours - embeddings are stable
    CATEGORIZATION: 1800, // 30 minutes - categories are somewhat stable
    EVENT_LABEL: 1800, // 30 minutes - event labels
    MARKET_DATA: 5, // 5 seconds - market data is very fresh
    CLUSTER_LOOKUP: 600, // 10 minutes - cluster assignments
    PATTERN_SEARCH: 3600, // 1 hour - pattern results
};
var RedisCache = /** @class */ (function () {
    function RedisCache() {
        this.client = null;
        this.isConnected = false;
        this.defaultTTL = 3600;
        this.host = process.env.REDIS_HOST || '127.0.0.1';
        this.port = Number.parseInt(process.env.REDIS_PORT || '6380', 10);
        this.password = process.env.REDIS_PASSWORD;
        this.db = Number.parseInt(process.env.REDIS_CACHE_DB || '1', 10); // Use DB 1 for cache
        this.prefix = process.env.REDIS_CACHE_PREFIX || 'perps:cache:';
    }
    /**
     * Initialize Redis connection
     */
    RedisCache.prototype.connect = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.isConnected)
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        this.client = new ioredis_1.default({
                            host: this.host,
                            port: this.port,
                            password: this.password,
                            db: this.db,
                            retryStrategy: function (times) {
                                var delay = Math.min(times * 50, 2000);
                                return delay;
                            },
                            maxRetriesPerRequest: 3,
                            lazyConnect: true,
                        });
                        this.client.on('error', function (error) {
                            logger_1.default.error('[RedisCache] Error:', error);
                        });
                        return [4 /*yield*/, this.client.connect()];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.client.ping()];
                    case 3:
                        _a.sent();
                        this.isConnected = true;
                        logger_1.default.info("[RedisCache] Connected to redis://".concat(this.host, ":").concat(this.port, "/").concat(this.db));
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _a.sent();
                        logger_1.default.error('[RedisCache] Failed to connect:', error_1);
                        this.client = null;
                        throw error_1;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate cache key from inputs
     */
    RedisCache.prototype.generateKey = function (namespace, identifier) {
        return "".concat(this.prefix).concat(namespace, ":").concat(identifier);
    };
    /**
     * Hash function for cache keys (stable hashing)
     */
    RedisCache.prototype.hash = function (content) {
        return crypto_1.default.createHash('sha256').update(content).digest('hex').slice(0, 16);
    };
    /**
     * Get cached value
     */
    RedisCache.prototype.get = function (namespace, key) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, data, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isConnected || !this.client)
                            return [2 /*return*/, null];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        cacheKey = this.generateKey(namespace, key);
                        return [4 /*yield*/, this.client.get(cacheKey)];
                    case 2:
                        data = _a.sent();
                        if (data) {
                            return [2 /*return*/, JSON.parse(data)];
                        }
                        return [2 /*return*/, null];
                    case 3:
                        error_2 = _a.sent();
                        logger_1.default.error("[RedisCache] Get failed for ".concat(namespace, ":").concat(key, ":"), error_2);
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Set cached value with TTL
     */
    RedisCache.prototype.set = function (namespace, key, value, ttl) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, data, expiry, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isConnected || !this.client)
                            return [2 /*return*/, false];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        cacheKey = this.generateKey(namespace, key);
                        data = JSON.stringify(value);
                        expiry = ttl !== null && ttl !== void 0 ? ttl : this.defaultTTL;
                        return [4 /*yield*/, this.client.setex(cacheKey, expiry, data)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 3:
                        error_3 = _a.sent();
                        logger_1.default.error("[RedisCache] Set failed for ".concat(namespace, ":").concat(key, ":"), error_3);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Delete cached value
     */
    RedisCache.prototype.delete = function (namespace, key) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isConnected || !this.client)
                            return [2 /*return*/, false];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        cacheKey = this.generateKey(namespace, key);
                        return [4 /*yield*/, this.client.del(cacheKey)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 3:
                        error_4 = _a.sent();
                        logger_1.default.error("[RedisCache] Delete failed for ".concat(namespace, ":").concat(key, ":"), error_4);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Clear all cache in namespace
     */
    RedisCache.prototype.clearNamespace = function (namespace) {
        return __awaiter(this, void 0, void 0, function () {
            var pattern, keys, error_5;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.isConnected || !this.client)
                            return [2 /*return*/, 0];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 5, , 6]);
                        pattern = this.generateKey(namespace, '*');
                        return [4 /*yield*/, this.client.keys(pattern)];
                    case 2:
                        keys = _b.sent();
                        if (!(keys.length > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, (_a = this.client).del.apply(_a, keys)];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4: return [2 /*return*/, keys.length];
                    case 5:
                        error_5 = _b.sent();
                        logger_1.default.error("[RedisCache] Clear namespace failed for ".concat(namespace, ":"), error_5);
                        return [2 /*return*/, 0];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get or compute pattern (cache-aside)
     */
    RedisCache.prototype.getOrCompute = function (namespace, key, compute, ttl) {
        return __awaiter(this, void 0, void 0, function () {
            var cached, value;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.get(namespace, key)];
                    case 1:
                        cached = _a.sent();
                        if (cached !== null) {
                            logger_1.default.debug("[RedisCache] Cache hit: ".concat(namespace, ":").concat(key));
                            return [2 /*return*/, cached];
                        }
                        // Cache miss - compute and store
                        logger_1.default.debug("[RedisCache] Cache miss: ".concat(namespace, ":").concat(key));
                        return [4 /*yield*/, compute()];
                    case 2:
                        value = _a.sent();
                        return [4 /*yield*/, this.set(namespace, key, value, ttl)];
                    case 3:
                        _a.sent();
                        return [2 /*return*/, value];
                }
            });
        });
    };
    /**
     * Batch get (pipeline)
     */
    RedisCache.prototype.getBatch = function (namespace, keys) {
        return __awaiter(this, void 0, void 0, function () {
            var pipeline, cacheKeys, _i, cacheKeys_1, key, results, map_1, error_6;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isConnected || !this.client || keys.length === 0) {
                            return [2 /*return*/, new Map()];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        pipeline = this.client.pipeline();
                        cacheKeys = keys.map(function (k) { return _this.generateKey(namespace, k); });
                        for (_i = 0, cacheKeys_1 = cacheKeys; _i < cacheKeys_1.length; _i++) {
                            key = cacheKeys_1[_i];
                            pipeline.get(key);
                        }
                        return [4 /*yield*/, pipeline.exec()];
                    case 2:
                        results = _a.sent();
                        map_1 = new Map();
                        results === null || results === void 0 ? void 0 : results.forEach(function (_a, index) {
                            var err = _a[0], data = _a[1];
                            if (!err && data) {
                                try {
                                    map_1.set(keys[index], JSON.parse(data));
                                }
                                catch (_b) {
                                    // Skip invalid JSON
                                }
                            }
                        });
                        return [2 /*return*/, map_1];
                    case 3:
                        error_6 = _a.sent();
                        logger_1.default.error('[RedisCache] Batch get failed:', error_6);
                        return [2 /*return*/, new Map()];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Batch set (pipeline)
     */
    RedisCache.prototype.setBatch = function (namespace, entries, ttl) {
        return __awaiter(this, void 0, void 0, function () {
            var pipeline, expiry, _i, entries_1, _a, key, value, cacheKey, results, error_7;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.isConnected || !this.client || entries.size === 0) {
                            return [2 /*return*/, 0];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        pipeline = this.client.pipeline();
                        expiry = ttl !== null && ttl !== void 0 ? ttl : this.defaultTTL;
                        for (_i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
                            _a = entries_1[_i], key = _a[0], value = _a[1];
                            cacheKey = this.generateKey(namespace, key);
                            pipeline.setex(cacheKey, expiry, JSON.stringify(value));
                        }
                        return [4 /*yield*/, pipeline.exec()];
                    case 2:
                        results = _b.sent();
                        return [2 /*return*/, (results === null || results === void 0 ? void 0 : results.filter(function (r) { return r[0] === null; }).length) || 0];
                    case 3:
                        error_7 = _b.sent();
                        logger_1.default.error('[RedisCache] Batch set failed:', error_7);
                        return [2 /*return*/, 0];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get cache statistics
     */
    RedisCache.prototype.getStats = function (namespace) {
        return __awaiter(this, void 0, void 0, function () {
            var pattern, keys, info, memoryMatch, memoryBytes, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.isConnected || !this.client) {
                            return [2 /*return*/, { totalKeys: 0, memoryBytes: 0 }];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        pattern = namespace
                            ? this.generateKey(namespace, '*')
                            : "".concat(this.prefix, "*");
                        return [4 /*yield*/, this.client.keys(pattern)];
                    case 2:
                        keys = _a.sent();
                        return [4 /*yield*/, this.client.info('memory')];
                    case 3:
                        info = _a.sent();
                        memoryMatch = info.match(/used_memory:(\d+)/);
                        memoryBytes = memoryMatch ? Number.parseInt(memoryMatch[1], 10) : 0;
                        return [2 /*return*/, {
                                totalKeys: keys.length,
                                memoryBytes: memoryBytes,
                            }];
                    case 4:
                        error_8 = _a.sent();
                        logger_1.default.error('[RedisCache] Get stats failed:', error_8);
                        return [2 /*return*/, { totalKeys: 0, memoryBytes: 0 }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Flush all cache (use carefully)
     */
    RedisCache.prototype.flush = function () {
        return __awaiter(this, void 0, void 0, function () {
            var keys, error_9;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.isConnected || !this.client)
                            return [2 /*return*/, false];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, this.client.keys("".concat(this.prefix, "*"))];
                    case 2:
                        keys = _b.sent();
                        if (!(keys.length > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, (_a = this.client).del.apply(_a, keys)];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4:
                        logger_1.default.info("[RedisCache] Flushed ".concat(keys.length, " keys"));
                        return [2 /*return*/, true];
                    case 5:
                        error_9 = _b.sent();
                        logger_1.default.error('[RedisCache] Flush failed:', error_9);
                        return [2 /*return*/, false];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Disconnect from Redis
     */
    RedisCache.prototype.disconnect = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.client) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.client.quit().catch(function () { return _this.client.disconnect(); })];
                    case 1:
                        _a.sent();
                        this.client = null;
                        this.isConnected = false;
                        logger_1.default.info('[RedisCache] Disconnected');
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    // Convenience methods for common cache types
    /**
     * Cache LLM response by prompt hash
     */
    RedisCache.prototype.getLLMResponse = function (prompt, model) {
        return __awaiter(this, void 0, void 0, function () {
            var key;
            return __generator(this, function (_a) {
                key = this.hash("".concat(model, ":").concat(prompt));
                return [2 /*return*/, this.get('llm', key)];
            });
        });
    };
    RedisCache.prototype.setLLMResponse = function (prompt, model, response) {
        return __awaiter(this, void 0, void 0, function () {
            var key;
            return __generator(this, function (_a) {
                key = this.hash("".concat(model, ":").concat(prompt));
                return [2 /*return*/, this.set('llm', key, response, exports.CacheTTL.LLM_RESPONSE)];
            });
        });
    };
    /**
     * Cache embedding by text hash
     */
    RedisCache.prototype.getEmbedding = function (text) {
        return __awaiter(this, void 0, void 0, function () {
            var key;
            return __generator(this, function (_a) {
                key = this.hash(text);
                return [2 /*return*/, this.get('embedding', key)];
            });
        });
    };
    RedisCache.prototype.setEmbedding = function (text, embedding) {
        return __awaiter(this, void 0, void 0, function () {
            var key;
            return __generator(this, function (_a) {
                key = this.hash(text);
                return [2 /*return*/, this.set('embedding', key, embedding, exports.CacheTTL.EMBEDDING)];
            });
        });
    };
    /**
     * Cache categorization by title fingerprint
     */
    RedisCache.prototype.getCategorization = function (titleFingerprint) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.get('categorization', titleFingerprint)];
            });
        });
    };
    RedisCache.prototype.setCategorization = function (titleFingerprint, categorization) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.set('categorization', titleFingerprint, categorization, exports.CacheTTL.CATEGORIZATION)];
            });
        });
    };
    /**
     * Cache event label by title fingerprint
     */
    RedisCache.prototype.getEventLabel = function (titleFingerprint) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.get('event_label', titleFingerprint)];
            });
        });
    };
    RedisCache.prototype.setEventLabel = function (titleFingerprint, label) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.set('event_label', titleFingerprint, label, exports.CacheTTL.EVENT_LABEL)];
            });
        });
    };
    /**
     * Get connection status
     */
    RedisCache.prototype.getStatus = function () {
        return {
            connected: this.isConnected,
            host: this.host,
            port: this.port,
            db: this.db,
        };
    };
    return RedisCache;
}());
// Singleton instance
var redisCache = new RedisCache();
// Auto-connect in production
if (process.env.NODE_ENV === 'production') {
    redisCache.connect().catch(function (error) {
        logger_1.default.error('[RedisCache] Auto-connect failed:', error);
    });
}
exports.default = redisCache;
