import type { TitleMetrics, SubEventType } from './types';
/**
 * Convert a string to Title Case (smart capitalization)
 * - First word always capitalized
 * - Last word always capitalized
 * - Small words lowercase unless first/last
 * - Acronyms always uppercase
 * - Numbers preserved
 */
export declare function toTitleCase(str: string): string;
/**
 * Capitalize only the first letter of a word
 */
export declare function capitalizeFirst(word: string): string;
/**
 * Convert to sentence case (only first word capitalized)
 */
export declare function toSentenceCase(str: string): string;
/**
 * Convert ticker symbols to uppercase consistently
 */
export declare function normalizeTicker(ticker: string): string;
/**
 * Normalize asset names to use preferred format
 * - Returns ticker symbol if known asset
 * - Otherwise returns title case name
 */
export declare function normalizeAssetName(name: string): string;
/**
 * Get the ticker symbol for an asset name
 */
export declare function getAssetTicker(name: string): string;
/**
 * Remove excessive punctuation from title
 */
export declare function normalizePunctuation(title: string): string;
/**
 * Remove trailing source names or attribution
 */
export declare function removeTrailingAttribution(title: string): string;
/**
 * Standardize title formatting
 * - Consistent capitalization
 * - Normalized punctuation
 * - Cleaned attribution
 * - Tickers uppercase
 */
export declare function formatTitle(title: string): string;
/**
 * Calculate quality metrics for a title
 */
export declare function calculateTitleMetrics(title: string): TitleMetrics;
/**
 * Get a quality label for a title
 */
export declare function getTitleQualityLabel(metrics: TitleMetrics): string;
/**
 * Detect the primary action word in a title
 */
export declare function detectActionWord(title: string): string | null;
/**
 * Detect if a title suggests upward or downward movement
 */
export declare function detectTrendDirection(title: string): 'UP' | 'DOWN' | 'NEUTRAL';
/**
 * Detect sub-event type from title text
 */
export declare function detectEventType(title: string): SubEventType;
//# sourceMappingURL=title-formatter.d.ts.map