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
    constructor();
    canUseService(): boolean;
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
     * Generate embeddings for text using OpenRouter with Redis cache
     */
    generateEmbedding(text: string): Promise<number[] | null>;
    /**
     * Generate event label for a single news article with cache
     */
    generateEventLabel(input: {
        title: string;
        content?: string;
        category?: string;
        tags?: string[];
    }): Promise<EventLabelResult | null>;
    /**
     * Process a single batch for event labeling
     */
    private processEventLabelBatch;
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
    private validateSubEventType;
    private validateUrgency;
    /**
     * Emergency fallback: Extract labels from malformed JSON using regex patterns
     * Attempts to salvage partial data when JSON parsing completely fails
     */
    private emergencyExtractLabels;
}
declare const openrouterService: OpenRouterService;
export default openrouterService;
//# sourceMappingURL=openrouter-service.d.ts.map