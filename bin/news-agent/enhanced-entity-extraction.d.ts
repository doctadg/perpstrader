export interface ExtractedEntity {
    name: string;
    type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'TOKEN' | 'PROTOCOL' | 'COUNTRY' | 'GOVERNMENT_BODY' | 'EVENT' | 'AMOUNT' | 'DATE';
    confidence: number;
    normalized: string;
    source: 'regex' | 'llm' | 'hybrid';
}
export interface EntityExtractionResult {
    articleId: string;
    entities: ExtractedEntity[];
    primaryEntity?: ExtractedEntity;
    eventType?: string;
    timestamp: Date;
}
declare class EnhancedEntityExtractor {
    private readonly HIGH_CONFIDENCE;
    private readonly MEDIUM_CONFIDENCE;
    private readonly LOW_CONFIDENCE;
    private llmCache;
    private cacheMaxSize;
    private readonly PATTERNS;
    /**
     * Extract entities from text using regex patterns
     */
    extractWithRegex(title: string, content?: string): ExtractedEntity[];
    /**
     * Extract entities using LLM for higher accuracy
     */
    extractWithLLM(title: string, content?: string): Promise<ExtractedEntity[]>;
    /**
     * Hybrid extraction combining regex and LLM
     */
    extractHybrid(title: string, content?: string, articleId?: string): Promise<EntityExtractionResult>;
    /**
     * Batch extract entities for multiple articles
     */
    batchExtract(articles: Array<{
        id: string;
        title: string;
        content?: string;
    }>): Promise<Map<string, EntityExtractionResult>>;
    /**
     * Merge regex and LLM entities, keeping highest confidence
     */
    private mergeEntities;
    /**
     * Calculate confidence for regex matches
     */
    private calculateRegexConfidence;
    /**
     * Infer entity type from keyword
     */
    private inferEntityType;
    /**
     * Convert LLM response to entity array
     */
    private convertLLMResponse;
    /**
     * Normalize entity type from LLM response
     */
    private normalizeEntityType;
    /**
     * Cache LLM response with LRU eviction
     */
    private cacheResponse;
    /**
     * Clear all caches
     */
    clearCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): {
        size: number;
        maxSize: number;
    };
}
export declare const enhancedEntityExtractor: EnhancedEntityExtractor;
export default enhancedEntityExtractor;
//# sourceMappingURL=enhanced-entity-extraction.d.ts.map