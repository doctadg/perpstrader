/**
 * Format a topic into a human-readable title
 * Handles common LLM output issues like poor grammar, weird word order, etc.
 */
export declare function formatHumanReadableTitle(topic: string, articleTitle?: string): string;
/**
 * Check if a title appears to be non-English
 */
export declare function isNonEnglishTitle(title: string): boolean;
/**
 * Translate or fallback for non-English titles
 * For now, we'll try to extract key entities and return a generic English title
 */
export declare function handleNonEnglishTitle(title: string, articleTitle?: string): string;
/**
 * Validate and format a topic for storage
 * This is the main entry point used by the clustering system
 */
export declare function validateAndFormatTopic(topic: string, articleTitle?: string): string;
//# sourceMappingURL=human-title-formatter.d.ts.map