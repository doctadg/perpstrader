export { generateEnhancedTitle, quickGenerateTitle, generateTitleWithMarketContext, scoreTitleQuality, } from './market-title-generator';
export { extractNumericalEntities, getPrimaryPrice, getPrimaryPercentage, getPrimaryAmount, formatPrice, formatPercentage, } from './numerical-extractor';
export { formatTitle, normalizeAssetName, getAssetTicker, calculateTitleMetrics, detectActionWord, detectTrendDirection, detectEventType, } from './title-formatter';
export type { EnhancedTitle, TitleFormats, TitleMetrics, NumericalEntity, MarketContext, SubEventType, } from './types';
interface CleanedTitle {
    title: string;
    qualityScore: number;
    flags: string[];
}
/**
 * Clean and normalize a news title
 */
export declare function cleanTitle(title: string): CleanedTitle;
/**
 * Check if a title is likely SEO spam or low quality
 */
export declare function isLikelySpam(title: string): boolean;
/**
 * Deduplicate similar titles (simple Jaccard similarity)
 */
export declare function areTitlesSimilar(title1: string, title2: string, threshold?: number): boolean;
/**
 * Create a normalized title fingerprint for exact duplicate detection.
 * Normalizes: lowercase, removes punctuation, extra whitespace, certain stop words.
 * Returns a hashable string suitable for comparing exact duplicates.
 */
export declare function getTitleFingerprint(title: string): string;
/**
 * Check if two titles are exact duplicates (after normalization).
 * Stricter than areTitlesSimilar - for catching syndicated content.
 */
export declare function isExactDuplicate(title1: string, title2: string): boolean;
/**
 * Check if a title represents non-market-moving content that should be filtered.
 * Returns true for content that adds noise without trading value.
 */
export declare function isNonMarketMoving(title: string): boolean;
//# sourceMappingURL=title-cleaner.d.ts.map