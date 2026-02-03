export interface ExtractedEntity {
    name: string;
    type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'TOKEN' | 'PROTOCOL' | 'COUNTRY' | 'GOVERNMENT_BODY';
    confidence: number;
    normalized: string;
}
export interface EntityExtractionResult {
    articleId: string;
    entities: ExtractedEntity[];
    timestamp: Date;
}
declare class EntityExtractor {
    private static readonly TOKEN_PATTERNS;
    private static readonly PROTOCOL_PATTERNS;
    private static readonly ORG_PATTERNS;
    private static readonly LOCATION_PATTERNS;
    private static readonly PERSON_PATTERNS;
    private static readonly GOV_BODY_PATTERNS;
    /**
     * Extract entities from text
     */
    static extractEntities(title: string, content: string): ExtractedEntity[];
    /**
     * Extract entities using regex patterns
     */
    private static extractWithPatterns;
    /**
     * Calculate confidence score for extracted entity
     */
    private static calculateConfidence;
    /**
     * Deduplicate entities, keeping highest confidence
     */
    private static deduplicateEntities;
    /**
     * Classify location as country or generic location
     */
    static classifyLocation(entity: ExtractedEntity): 'COUNTRY' | 'LOCATION';
}
export default EntityExtractor;
//# sourceMappingURL=entity-extraction.d.ts.map