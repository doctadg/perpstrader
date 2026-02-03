import { ExtractedEntity } from './enhanced-entity-extraction';
export interface SemanticSimilarityResult {
    score: number;
    method: 'cosine' | 'entity' | 'llm' | 'hybrid';
    confidence: number;
    details: {
        entityOverlap: number;
        cosineSimilarity?: number;
        llmScore?: number;
        topicOverlap: number;
    };
}
export interface ArticleVector {
    id: string;
    embedding: number[];
    entities: ExtractedEntity[];
    topic: string;
    keywords: string[];
}
declare class SemanticSimilarityService {
    private embeddingDim;
    private useLLM;
    private readonly HIGH_SIMILARITY;
    private readonly MEDIUM_SIMILARITY;
    private readonly LOW_SIMILARITY;
    private embeddingCache;
    private cacheMaxSize;
    /**
     * Calculate comprehensive similarity between two articles
     */
    calculateSimilarity(article1: {
        id: string;
        title: string;
        content?: string;
        category?: string;
    }, article2: {
        id: string;
        title: string;
        content?: string;
        category?: string;
    }): Promise<SemanticSimilarityResult>;
    /**
     * Batch calculate similarities between an article and a list of candidates
     */
    batchCalculateSimilarity(article: {
        id: string;
        title: string;
        content?: string;
        category?: string;
    }, candidates: Array<{
        id: string;
        title: string;
        content?: string;
        category?: string;
    }>): Promise<Array<{
        candidateId: string;
        result: SemanticSimilarityResult;
    }>>;
    /**
     * Find the most similar articles from a list
     */
    findMostSimilar(article: {
        id: string;
        title: string;
        content?: string;
        category?: string;
    }, candidates: Array<{
        id: string;
        title: string;
        content?: string;
        category?: string;
    }>, topK?: number, threshold?: number): Promise<Array<{
        candidateId: string;
        score: number;
        method: string;
    }>>;
    /**
     * Extract features from an article
     */
    private extractFeatures;
    /**
     * Generate embedding for text
     */
    private generateEmbedding;
    /**
     * Extract topic and keywords from article
     */
    private extractTopicAndKeywords;
    /**
     * Calculate entity-based similarity
     */
    private calculateEntitySimilarity;
    /**
     * Calculate topic similarity using word overlap
     */
    private calculateTopicSimilarity;
    /**
     * Calculate keyword similarity
     */
    private calculateKeywordSimilarity;
    /**
     * Calculate cosine similarity between two embeddings
     */
    private calculateCosineSimilarity;
    /**
     * Calculate LLM-based similarity
     */
    private calculateLLMSimilarity;
    /**
     * Calculate confidence score
     */
    private calculateConfidence;
    /**
     * Check if word is a stop word
     */
    private isStopWord;
    /**
     * Get cached embedding
     */
    private getCachedEmbedding;
    /**
     * Cache embedding with LRU eviction
     */
    private cacheEmbedding;
    /**
     * Clear caches
     */
    clearCache(): void;
    /**
     * Get cache stats
     */
    getCacheStats(): {
        size: number;
        maxSize: number;
    };
}
export declare const semanticSimilarityService: SemanticSimilarityService;
export default semanticSimilarityService;
//# sourceMappingURL=semantic-similarity.d.ts.map