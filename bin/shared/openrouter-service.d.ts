interface EventLabelResult {
    topic: string;
    subEventType: string;
    trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
    urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    keywords: string[];
}
interface CategorizationResult {
    categories: string[];
    tags: string[];
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    summary?: string;
    trendTopic?: string;
    trendKeywords?: string[];
}
declare class OpenRouterService {
    private baseUrl;
    private apiKey;
    private labelingModel;
    private embeddingModel;
    private timeout;
    private cacheHits;
    private cacheMisses;
    private circuitBreaker;
    private static readonly MAX_RETRIES;
    private static readonly RETRY_BASE_DELAY_MS;
    private static readonly RETRY_MAX_DELAY_MS;
    constructor();
    canUseService(): boolean;
    /**
     * Get circuit breaker state for observability
     */
    getCircuitBreakerState(): {
        state: string;
        failures: number;
    };
    /**
     * Execute an API call with circuit breaker check, retry with exponential backoff,
     * and proper 429 handling using Retry-After header.
     * Returns null if circuit breaker is open or all retries exhausted.
     */
    private callWithRetry;
    private safeErrorMessage;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        hits: number;
        misses: number;
        hitRate: number;
    };
    /**
     * Generate embeddings for text.
     * DISABLED: z.ai API has no embeddings endpoint, and the old code sent a chat
     * completion request while parsing it as an embedding response — fundamentally broken.
     * All callers already fall back to local SHA256 feature hashing (local-embeddings.ts).
     * Returning null immediately avoids the rate-limit storm (680+ waits/cycle).
     */
    generateEmbedding(text: string): Promise<number[] | null>;
    /**
     * Generate event label for a single news article with cache
     * DISABLED: OpenRouter API key is dead (401 User not found).
     * Returns null immediately to avoid retry storms.
     */
    generateEventLabel(input: {
        title: string;
        content?: string;
        category?: string;
        tags?: string[];
    }): Promise<EventLabelResult | null>;
    /**
     * Generate event labels for multiple articles with PARALLEL batch processing and Redis cache
     */
    batchEventLabels(inputs: Array<{
        id: string;
        title: string;
        category?: string;
        tags?: string[];
    }>): Promise<Map<string, EventLabelResult>>;
    /**
     * Process a single batch for categorization with cache
     */
    private processCategorizationBatch;
    /**
     * Categorize a batch of news articles with PARALLEL batch processing and Redis cache
     * Handles multiple batches if more than 100 articles
     */
    categorizeArticles(articles: Array<{
        id: string;
        title: string;
        content?: string;
        snippet?: string;
        source?: string;
    }>): Promise<Map<string, CategorizationResult>>;
    /**
     * Extract the first balanced JSON object from LLM response text.
     * Handles markdown code fences, trailing text, and nested structures.
     * Falls back to simple brace-counting repair if balanced extraction fails.
     */
    private extractBalancedJson;
    private validateSubEventType;
    private validateUrgency;
}
declare const openrouterService: OpenRouterService;
export default openrouterService;
//# sourceMappingURL=openrouter-service.d.ts.map