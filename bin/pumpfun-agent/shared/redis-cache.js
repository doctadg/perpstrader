"use strict";
// Redis Cache Service - LLM Response & Embedding Cache
// Provides ultra-fast caching for AI operations
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheTTL = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = __importDefault(require("./logger"));
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
class RedisCache {
    client = null;
    isConnected = false;
    defaultTTL = 3600;
    // Configuration
    host;
    port;
    password;
    db;
    prefix;
    constructor() {
        this.host = process.env.REDIS_HOST || '127.0.0.1';
        this.port = Number.parseInt(process.env.REDIS_PORT || '6380', 10);
        this.password = process.env.REDIS_PASSWORD;
        this.db = Number.parseInt(process.env.REDIS_CACHE_DB || '1', 10); // Use DB 1 for cache
        this.prefix = process.env.REDIS_CACHE_PREFIX || 'perps:cache:';
    }
    /**
     * Initialize Redis connection
     */
    async connect() {
        if (this.isConnected)
            return;
        try {
            this.client = new ioredis_1.default({
                host: this.host,
                port: this.port,
                password: this.password,
                db: this.db,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                maxRetriesPerRequest: 3,
                lazyConnect: true,
            });
            this.client.on('error', (error) => {
                logger_1.default.error('[RedisCache] Error:', error);
            });
            await this.client.connect();
            await this.client.ping();
            this.isConnected = true;
            logger_1.default.info(`[RedisCache] Connected to redis://${this.host}:${this.port}/${this.db}`);
        }
        catch (error) {
            logger_1.default.error('[RedisCache] Failed to connect:', error);
            this.client = null;
            throw error;
        }
    }
    /**
     * Generate cache key from inputs
     */
    generateKey(namespace, identifier) {
        return `${this.prefix}${namespace}:${identifier}`;
    }
    /**
     * Hash function for cache keys (stable hashing)
     */
    hash(content) {
        return crypto_1.default.createHash('sha256').update(content).digest('hex').slice(0, 16);
    }
    /**
     * Get cached value
     */
    async get(namespace, key) {
        if (!this.isConnected || !this.client)
            return null;
        try {
            const cacheKey = this.generateKey(namespace, key);
            const data = await this.client.get(cacheKey);
            if (data) {
                return JSON.parse(data);
            }
            return null;
        }
        catch (error) {
            logger_1.default.error(`[RedisCache] Get failed for ${namespace}:${key}:`, error);
            return null;
        }
    }
    /**
     * Set cached value with TTL
     */
    async set(namespace, key, value, ttl) {
        if (!this.isConnected || !this.client)
            return false;
        try {
            const cacheKey = this.generateKey(namespace, key);
            const data = JSON.stringify(value);
            const expiry = ttl ?? this.defaultTTL;
            await this.client.setex(cacheKey, expiry, data);
            return true;
        }
        catch (error) {
            logger_1.default.error(`[RedisCache] Set failed for ${namespace}:${key}:`, error);
            return false;
        }
    }
    /**
     * Delete cached value
     */
    async delete(namespace, key) {
        if (!this.isConnected || !this.client)
            return false;
        try {
            const cacheKey = this.generateKey(namespace, key);
            await this.client.del(cacheKey);
            return true;
        }
        catch (error) {
            logger_1.default.error(`[RedisCache] Delete failed for ${namespace}:${key}:`, error);
            return false;
        }
    }
    /**
     * Clear all cache in namespace
     */
    async clearNamespace(namespace) {
        if (!this.isConnected || !this.client)
            return 0;
        try {
            const pattern = this.generateKey(namespace, '*');
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
            return keys.length;
        }
        catch (error) {
            logger_1.default.error(`[RedisCache] Clear namespace failed for ${namespace}:`, error);
            return 0;
        }
    }
    /**
     * Get or compute pattern (cache-aside)
     */
    async getOrCompute(namespace, key, compute, ttl) {
        // Try cache first
        const cached = await this.get(namespace, key);
        if (cached !== null) {
            logger_1.default.debug(`[RedisCache] Cache hit: ${namespace}:${key}`);
            return cached;
        }
        // Cache miss - compute and store
        logger_1.default.debug(`[RedisCache] Cache miss: ${namespace}:${key}`);
        const value = await compute();
        await this.set(namespace, key, value, ttl);
        return value;
    }
    /**
     * Batch get (pipeline)
     */
    async getBatch(namespace, keys) {
        if (!this.isConnected || !this.client || keys.length === 0) {
            return new Map();
        }
        try {
            const pipeline = this.client.pipeline();
            const cacheKeys = keys.map(k => this.generateKey(namespace, k));
            for (const key of cacheKeys) {
                pipeline.get(key);
            }
            const results = await pipeline.exec();
            const map = new Map();
            results?.forEach(([err, data], index) => {
                if (!err && data) {
                    try {
                        map.set(keys[index], JSON.parse(data));
                    }
                    catch {
                        // Skip invalid JSON
                    }
                }
            });
            return map;
        }
        catch (error) {
            logger_1.default.error('[RedisCache] Batch get failed:', error);
            return new Map();
        }
    }
    /**
     * Batch set (pipeline)
     */
    async setBatch(namespace, entries, ttl) {
        if (!this.isConnected || !this.client || entries.size === 0) {
            return 0;
        }
        try {
            const pipeline = this.client.pipeline();
            const expiry = ttl ?? this.defaultTTL;
            for (const [key, value] of entries) {
                const cacheKey = this.generateKey(namespace, key);
                pipeline.setex(cacheKey, expiry, JSON.stringify(value));
            }
            const results = await pipeline.exec();
            return results?.filter(r => r[0] === null).length || 0;
        }
        catch (error) {
            logger_1.default.error('[RedisCache] Batch set failed:', error);
            return 0;
        }
    }
    /**
     * Get cache statistics
     */
    async getStats(namespace) {
        if (!this.isConnected || !this.client) {
            return { totalKeys: 0, memoryBytes: 0 };
        }
        try {
            const pattern = namespace
                ? this.generateKey(namespace, '*')
                : `${this.prefix}*`;
            const keys = await this.client.keys(pattern);
            const info = await this.client.info('memory');
            const memoryMatch = info.match(/used_memory:(\d+)/);
            const memoryBytes = memoryMatch ? Number.parseInt(memoryMatch[1], 10) : 0;
            return {
                totalKeys: keys.length,
                memoryBytes,
            };
        }
        catch (error) {
            logger_1.default.error('[RedisCache] Get stats failed:', error);
            return { totalKeys: 0, memoryBytes: 0 };
        }
    }
    /**
     * Flush all cache (use carefully)
     */
    async flush() {
        if (!this.isConnected || !this.client)
            return false;
        try {
            const keys = await this.client.keys(`${this.prefix}*`);
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
            logger_1.default.info(`[RedisCache] Flushed ${keys.length} keys`);
            return true;
        }
        catch (error) {
            logger_1.default.error('[RedisCache] Flush failed:', error);
            return false;
        }
    }
    /**
     * Disconnect from Redis
     */
    async disconnect() {
        if (this.client) {
            await this.client.quit().catch(() => this.client.disconnect());
            this.client = null;
            this.isConnected = false;
            logger_1.default.info('[RedisCache] Disconnected');
        }
    }
    // Convenience methods for common cache types
    /**
     * Cache LLM response by prompt hash
     */
    async getLLMResponse(prompt, model) {
        const key = this.hash(`${model}:${prompt}`);
        return this.get('llm', key);
    }
    async setLLMResponse(prompt, model, response) {
        const key = this.hash(`${model}:${prompt}`);
        return this.set('llm', key, response, exports.CacheTTL.LLM_RESPONSE);
    }
    /**
     * Cache embedding by text hash
     */
    async getEmbedding(text) {
        const key = this.hash(text);
        return this.get('embedding', key);
    }
    async setEmbedding(text, embedding) {
        const key = this.hash(text);
        return this.set('embedding', key, embedding, exports.CacheTTL.EMBEDDING);
    }
    /**
     * Cache categorization by title fingerprint
     */
    async getCategorization(titleFingerprint) {
        return this.get('categorization', titleFingerprint);
    }
    async setCategorization(titleFingerprint, categorization) {
        return this.set('categorization', titleFingerprint, categorization, exports.CacheTTL.CATEGORIZATION);
    }
    /**
     * Cache event label by title fingerprint
     */
    async getEventLabel(titleFingerprint) {
        return this.get('event_label', titleFingerprint);
    }
    async setEventLabel(titleFingerprint, label) {
        return this.set('event_label', titleFingerprint, label, exports.CacheTTL.EVENT_LABEL);
    }
    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            host: this.host,
            port: this.port,
            db: this.db,
        };
    }
}
// Singleton instance
const redisCache = new RedisCache();
// Auto-connect in production
if (process.env.NODE_ENV === 'production') {
    redisCache.connect().catch((error) => {
        logger_1.default.error('[RedisCache] Auto-connect failed:', error);
    });
}
exports.default = redisCache;
//# sourceMappingURL=redis-cache.js.map