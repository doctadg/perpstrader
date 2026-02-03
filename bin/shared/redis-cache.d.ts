export interface CacheConfig {
    ttl: number;
    prefix: string;
}
export declare const CacheTTL: {
    LLM_RESPONSE: number;
    EMBEDDING: number;
    CATEGORIZATION: number;
    EVENT_LABEL: number;
    MARKET_DATA: number;
    CLUSTER_LOOKUP: number;
    PATTERN_SEARCH: number;
};
declare class RedisCache {
    private client;
    private isConnected;
    private defaultTTL;
    private host;
    private port;
    private password?;
    private db;
    private prefix;
    constructor();
    /**
     * Initialize Redis connection
     */
    connect(): Promise<void>;
    /**
     * Generate cache key from inputs
     */
    private generateKey;
    /**
     * Hash function for cache keys (stable hashing)
     */
    private hash;
    /**
     * Get cached value
     */
    get<T>(namespace: string, key: string): Promise<T | null>;
    /**
     * Set cached value with TTL
     */
    set(namespace: string, key: string, value: any, ttl?: number): Promise<boolean>;
    /**
     * Delete cached value
     */
    delete(namespace: string, key: string): Promise<boolean>;
    /**
     * Clear all cache in namespace
     */
    clearNamespace(namespace: string): Promise<number>;
    /**
     * Get or compute pattern (cache-aside)
     */
    getOrCompute<T>(namespace: string, key: string, compute: () => Promise<T>, ttl?: number): Promise<T>;
    /**
     * Batch get (pipeline)
     */
    getBatch<T>(namespace: string, keys: string[]): Promise<Map<string, T>>;
    /**
     * Batch set (pipeline)
     */
    setBatch(namespace: string, entries: Map<string, any>, ttl?: number): Promise<number>;
    /**
     * Get cache statistics
     */
    getStats(namespace?: string): Promise<{
        totalKeys: number;
        memoryBytes: number;
        hitRate?: number;
    }>;
    /**
     * Flush all cache (use carefully)
     */
    flush(): Promise<boolean>;
    /**
     * Disconnect from Redis
     */
    disconnect(): Promise<void>;
    /**
     * Cache LLM response by prompt hash
     */
    getLLMResponse(prompt: string, model: string): Promise<any | null>;
    setLLMResponse(prompt: string, model: string, response: any): Promise<boolean>;
    /**
     * Cache embedding by text hash
     */
    getEmbedding(text: string): Promise<number[] | null>;
    setEmbedding(text: string, embedding: number[]): Promise<boolean>;
    /**
     * Cache categorization by title fingerprint
     */
    getCategorization(titleFingerprint: string): Promise<any | null>;
    setCategorization(titleFingerprint: string, categorization: any): Promise<boolean>;
    /**
     * Cache event label by title fingerprint
     */
    getEventLabel(titleFingerprint: string): Promise<any | null>;
    setEventLabel(titleFingerprint: string, label: any): Promise<boolean>;
    /**
     * Get connection status
     */
    getStatus(): {
        connected: boolean;
        host: string;
        port: number;
        db: number;
    };
}
declare const redisCache: RedisCache;
export default redisCache;
//# sourceMappingURL=redis-cache.d.ts.map