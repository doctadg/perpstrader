/**
 * Calculate quality score for an article (0-1)
 * Higher scores indicate better quality
 */
export declare function calculateQualityScore(title: string, content?: string): number;
/**
 * Check if article appears to be spam
 */
export declare function isSpam(title: string, content?: string): boolean;
/**
 * Check if title is likely spam using heuristics
 */
export declare function isLikelySpam(title: string): boolean;
/**
 * Clean and normalize a title
 */
export declare function cleanTitle(title: string): {
    title: string;
    qualityScore: number;
};
//# sourceMappingURL=quality.d.ts.map