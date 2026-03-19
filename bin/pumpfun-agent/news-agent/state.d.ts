import { NewsCategory, NewsItem, NewsArticle, SearchResult } from '../shared/types';
import type { StoryCluster } from '../data/story-cluster-store';
/**
 * Raw article after scraping (before filtering)
 */
export interface RawArticle {
    id: string;
    url: string;
    title: string;
    content: string;
    snippet: string;
    source: string;
    publishedAt: Date;
    language?: string;
}
/**
 * Article after quality filtering
 */
export interface FilteredArticle extends RawArticle {
    qualityScore: number;
    isEnglish: boolean;
    passedFirstFilter: boolean;
    filterReasons?: string[];
}
/**
 * Article after categorization
 */
export interface CategorizedArticle extends FilteredArticle {
    categories: NewsCategory[];
    tags: string[];
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    summary: string;
}
/**
 * Article after topic labeling
 */
export interface LabeledArticle extends CategorizedArticle {
    topic: string;
    subEventType: string;
    trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
    urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    keywords: string[];
}
/**
 * Processing statistics for a cycle
 */
export interface ProcessingStats {
    searched: number;
    scraped: number;
    filteredLanguage: number;
    filteredQuality: number;
    filteredCategory: number;
    filteredRedundant: number;
    categorized: number;
    labeled: number;
    clustered: number;
    totalRejected: number;
}
export interface NewsAgentState {
    cycleId: string;
    cycleStartTime: Date;
    currentStep: string;
    categories: NewsCategory[];
    searchResults: Map<NewsCategory, SearchResult[]>;
    rawNews: NewsItem[];
    scrapedArticles: NewsArticle[];
    categorizedNews: NewsArticle[];
    storedCount: number;
    duplicateCount: number;
    rawArticles: RawArticle[];
    filteredArticles: FilteredArticle[];
    labeledArticles: LabeledArticle[];
    clusters: StoryCluster[];
    thoughts: string[];
    errors: string[];
    stats: ProcessingStats & {
        totalFound: number;
        totalScraped: number;
        totalCategorized: number;
        totalStored: number;
        totalDuplicates: number;
        byCategory: Record<NewsCategory, number>;
    };
}
/**
 * Trading-focused categories for perpetual traders
 */
export declare const TRADING_CATEGORIES: NewsCategory[];
/**
 * Categories to exclude from news processing
 */
export declare const EXCLUDED_CATEGORIES: NewsCategory[];
export declare function createInitialNewsState(): NewsAgentState;
//# sourceMappingURL=state.d.ts.map