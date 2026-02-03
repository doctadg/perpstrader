// News Agent State Definition
// Defines the shared state that flows through the newsfeed agent
// Rebuilt with layered filtering for real-time quality control

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

  // Configuration
  categories: NewsCategory[];

  // Pipeline data (old structure for backward compatibility)
  searchResults: Map<NewsCategory, SearchResult[]>;
  rawNews: NewsItem[];
  scrapedArticles: NewsArticle[];
  categorizedNews: NewsArticle[];
  storedCount: number;
  duplicateCount: number;

  // New pipeline with filtering
  rawArticles: RawArticle[];
  filteredArticles: FilteredArticle[];
  labeledArticles: LabeledArticle[];
  clusters: StoryCluster[];

  thoughts: string[];
  errors: string[];

  // Enhanced stats
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
export const TRADING_CATEGORIES: NewsCategory[] = [
  'CRYPTO',
  'STOCKS',
  'ECONOMICS',
  'GEOPOLITICS',
];

/**
 * Categories to exclude from news processing
 */
export const EXCLUDED_CATEGORIES: NewsCategory[] = [
  'SPORTS',
  'FOOTBALL',
  'BASKETBALL',
  'TENNIS',
  'MMA',
  'GOLF',
];

export function createInitialNewsState(): NewsAgentState {
  const allCategories = [...TRADING_CATEGORIES, ...EXCLUDED_CATEGORIES, 'TECH', 'COMMODITIES'] as NewsCategory[];

  return {
    cycleId: crypto.randomUUID(),
    cycleStartTime: new Date(),
    currentStep: 'INIT',

    categories: TRADING_CATEGORIES, // Only process trading categories

    searchResults: new Map(),
    rawNews: [],
    scrapedArticles: [],
    categorizedNews: [],
    storedCount: 0,
    duplicateCount: 0,

    rawArticles: [],
    filteredArticles: [],
    labeledArticles: [],
    clusters: [],

    thoughts: [],
    errors: [],

    stats: {
      searched: 0,
      scraped: 0,
      filteredLanguage: 0,
      filteredQuality: 0,
      filteredCategory: 0,
      filteredRedundant: 0,
      categorized: 0,
      labeled: 0,
      clustered: 0,
      totalRejected: 0,

      // Legacy stats
      totalFound: 0,
      totalScraped: 0,
      totalCategorized: 0,
      totalStored: 0,
      totalDuplicates: 0,
      byCategory: Object.fromEntries(allCategories.map(c => [c, 0])) as Record<NewsCategory, number>,
    },
  };
}
