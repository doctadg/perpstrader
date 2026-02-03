import type { NumericalEntity } from './types';
/**
 * Extract all numerical entities from text
 */
export declare function extractNumericalEntities(text: string): NumericalEntity[];
/**
 * Get the most relevant price entity from a list
 * Prefers USD prices, then crypto prices, then others
 */
export declare function getPrimaryPrice(entities: NumericalEntity[]): NumericalEntity | null;
/**
 * Get the most relevant percentage entity
 * Prefers percentages that seem to be price changes
 */
export declare function getPrimaryPercentage(entities: NumericalEntity[]): NumericalEntity | null;
/**
 * Get the most relevant volume entity
 */
export declare function getPrimaryVolume(entities: NumericalEntity[]): NumericalEntity | null;
/**
 * Get the most relevant amount entity (for hacks, etc.)
 */
export declare function getPrimaryAmount(entities: NumericalEntity[]): NumericalEntity | null;
/**
 * Format a price for display in titles
 */
export declare function formatPrice(price: NumericalEntity): string;
/**
 * Format a percentage for display in titles
 */
export declare function formatPercentage(percentage: NumericalEntity): string;
/**
 * Format a volume or amount for display in titles
 */
export declare function formatLargeAmount(entity: NumericalEntity): string;
//# sourceMappingURL=numerical-extractor.d.ts.map