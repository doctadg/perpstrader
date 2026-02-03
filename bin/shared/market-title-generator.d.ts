import type { NewsArticle, EnhancedTitle, MarketContext } from './types';
/**
 * Generate enhanced title from article content
 */
export declare function generateEnhancedTitle(article: NewsArticle | {
    title: string;
    content?: string;
    snippet?: string;
}, marketContext?: MarketContext, llmGeneratedTitle?: string): EnhancedTitle;
export type { EnhancedTitle, TitleFormats, TitleMetrics, MarketContext, SubEventType, NumericalEntity } from './types';
/**
 * Quick title generation with minimal processing
 */
export declare function quickGenerateTitle(title: string): EnhancedTitle;
/**
 * Generate title from market data context
 */
export declare function generateTitleWithMarketContext(title: string, price: number, priceChange24h: number, assetSymbol: string): EnhancedTitle;
/**
 * Score title quality (1-5)
 */
export declare function scoreTitleQuality(title: string): number;
//# sourceMappingURL=market-title-generator.d.ts.map