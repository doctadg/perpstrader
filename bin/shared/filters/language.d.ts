/**
 * Detect the primary language of a text
 * Returns ISO 639-1 language code ('en', 'es', 'fr', etc.)
 */
export declare function detectLanguage(text: string): string;
/**
 * Check if text is primarily English
 */
export declare function isEnglish(text: string): boolean;
/**
 * Get confidence score for English detection (0-1)
 */
export declare function englishConfidence(text: string): number;
//# sourceMappingURL=language.d.ts.map