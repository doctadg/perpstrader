export interface TitleSimilarityResult {
    title1: string;
    title2: string;
    similarityScore: number;
    similarityType: 'exact' | 'semantic' | 'entity' | 'topic' | 'none';
    sharedEntities: string[];
    confidence: number;
}
export interface TitleCluster {
    id: string;
    representativeTitle: string;
    titles: string[];
    articleIds: string[];
    entities: string[];
    topicFingerprint: string;
    createdAt: Date;
}
declare class TitleSemanticClustering {
    private readonly EXACT_MATCH_THRESHOLD;
    private readonly SEMANTIC_MATCH_THRESHOLD;
    private readonly ENTITY_MATCH_THRESHOLD;
    private readonly TOPIC_MATCH_THRESHOLD;
    private readonly MAX_BATCH_SIZE;
    private analysisCache;
    private cacheMaxSize;
    /**
     * Calculate similarity between two titles using multiple methods
     */
    calculateSimilarity(title1: string, title2: string): Promise<TitleSimilarityResult>;
    /**
     * Batch cluster titles using semantic similarity
     */
    clusterTitles(articles: Array<{
        id: string;
        title: string;
        category?: string;
    }>, similarityThreshold?: number): Promise<TitleCluster[]>;
    /**
     * Get or generate title analysis with caching
     */
    private getTitleAnalysis;
    /**
     * Analyze a title using OpenRouter for entities and topic
     */
    private analyzeTitle;
    /**
     * Batch analyze titles efficiently
     */
    private batchAnalyzeTitles;
    /**
     * Local entity extraction (fallback when LLM unavailable)
     */
    private extractEntitiesLocal;
    /**
     * Extract key phrases from title
     */
    private extractKeyPhrases;
    /**
     * Detect sentiment from keywords
     */
    private detectSentiment;
    /**
     * Calculate similarity between two entity lists
     */
    private calculateEntitySimilarity;
    /**
     * Calculate topic similarity
     */
    private calculateTopicSimilarity;
    /**
     * Calculate phrase overlap
     */
    private calculatePhraseOverlap;
    /**
     * Calculate cluster similarity score
     */
    private calculateClusterSimilarity;
    /**
     * Calculate confidence score for similarity
     */
    private calculateConfidence;
    /**
     * Check if word is a stop word
     */
    private isStopWord;
    /**
     * Clear the analysis cache
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
export declare const titleSemanticClustering: TitleSemanticClustering;
export default titleSemanticClustering;
//# sourceMappingURL=title-semantic-clustering.d.ts.map