// Categorize Node
// Uses LLM (gpt-oss-20b) to categorize, tag, and analyze news
// Enhanced with strict filtering for perpetual traders

import { NewsAgentState, LabeledArticle, FilteredArticle, TRADING_CATEGORIES } from '../state';
import { NewsArticle, NewsCategory, NewsImportance, NewsSentiment } from '../../shared/types';
import axios from 'axios';
import logger from '../../shared/logger';
import configManager from '../../shared/config';
import { deriveTrend, deriveTrendTopic } from '../../shared/news-trend';
import openrouterService from '../../shared/openrouter-service';
import { generateEnhancedTitle, type EnhancedTitle } from '../../shared/market-title-generator';

const config = configManager.get();

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  CRYPTO: ['bitcoin', 'ethereum', 'crypto', 'defi', 'blockchain', 'altcoin', 'stablecoin', 'token', 'btc', 'eth', 'sol', 'xrp'],
  STOCKS: ['nasdaq', 's&p 500', 'earnings', 'ipo', 'shares', 'sec', 'sec approves', 'stock market', 'wall street'],
  ECONOMICS: ['inflation', 'cpi', 'gdp', 'fed', 'interest rate', 'interest rates', 'central bank', 'jobs report', 'treasury'],
  GEOPOLITICS: ['sanction', 'sanctions', 'war', 'conflict', 'diplomacy', 'election', 'trade war', 'summit', 'treaty'],
};

// System prompt for categorization (gpt-oss-20b)
const CATEGORIZATION_SYSTEM_PROMPT = `You are an expert news categorizer for a PERPETUAL TRADING platform.

Your job is to categorize news articles for cryptocurrency and financial traders.

CATEGORIES:
- CRYPTO: Bitcoin, Ethereum, DeFi, exchanges, tokens, regulations, hacks
- STOCKS: Equities markets, earnings, IPOs, SEC actions, stock splits
- ECONOMICS: Fed decisions, inflation data, GDP, jobs reports, central banks
- GEOPOLITICS: Trade policies, sanctions, conflicts affecting markets

CRITICAL RULES:
1. Only assign TRADING-RELEVANT categories (CRYPTO, STOCKS, ECONOMICS, GEOPOLITICS)
2. Do NOT assign sports categories (MMA, tennis, etc.) to financial news
3. Be specific with tags (token names, company names, event types)
4. Sentiment should reflect market impact (bullish = positive for price, bearish = negative)

Respond with valid JSON only.`;

/**
 * Categorize Node
 * Uses gpt-oss-20b to categorize filtered articles
 */
export async function categorizeNode(state: NewsAgentState): Promise<Partial<NewsAgentState>> {
  const startTime = Date.now();
  logger.info(`[CategorizeNode] Categorizing ${state.filteredArticles.length} filtered articles`);

  if (state.filteredArticles.length === 0) {
    return {
      currentStep: 'CATEGORIZE_SKIPPED',
      labeledArticles: [],
      categorizedNews: [], // For backward compatibility
      stats: {
        ...state.stats,
        categorized: 0,
        totalCategorized: 0,
      },
      thoughts: [...state.thoughts, 'No articles to categorize'],
    };
  }

  // Use OpenRouter with gpt-oss-20b
  if (openrouterService.canUseService()) {
    try {
      const categorization = await openrouterService.categorizeArticles(
        state.filteredArticles.map(a => ({
          id: a.id,
          title: a.title,
          content: a.content,
          snippet: a.snippet,
          source: a.source,
        }))
      );

      if (categorization.size > 0) {
        const labeledArticles: LabeledArticle[] = state.filteredArticles.map(article => {
          const catResult = categorization.get(article.id);

          if (catResult) {
            // Filter to only trading categories
            const tradingCategories = (catResult.categories || []).filter((c: string) =>
              TRADING_CATEGORIES.includes(c as any)
            ) as NewsCategory[];

            // If no trading categories found, try to infer from content
            const finalCategories = tradingCategories.length > 0
              ? tradingCategories
              : inferTradingCategory(article.title, article.content);

            if (finalCategories.length === 0) {
              // Article doesn't belong in trading categories
              return null as any;
            }

            const derivedTrend = deriveTrend({ title: article.title, category: finalCategories[0], tags: catResult.tags });
            const trend = catResult.trendTopic
              ? { topic: catResult.trendTopic, keywords: (catResult.trendKeywords || []).slice(0, 8) }
              : deriveTrendTopic({ title: article.title, category: finalCategories[0], tags: catResult.tags });

            // Generate enhanced title with market context
            const enhancedTitle = generateEnhancedTitle(article);

            const labeledArticle: LabeledArticle = {
              ...article,
              categories: finalCategories,
              tags: catResult.tags || [],
              sentiment: catResult.sentiment as NewsSentiment || 'NEUTRAL',
              importance: catResult.importance as NewsImportance || 'MEDIUM',
              summary: catResult.summary || '',

              // Topic/label fields (from categorization)
              topic: catResult.trendTopic || enhancedTitle.enhanced.split(':')[0],
              subEventType: enhancedTitle.subEventType || 'other',
              trendDirection: 'NEUTRAL', // Will be determined by topic generation node
              urgency: catResult.importance === 'CRITICAL' ? 'CRITICAL' :
                       catResult.importance === 'HIGH' ? 'HIGH' : 'MEDIUM',
              keywords: (catResult.trendKeywords || catResult.tags || []).slice(0, 7),
            };

            return labeledArticle;
          }

          // No categorization result - use fallback
          const inferredCategories = inferTradingCategory(article.title, article.content);
          if (inferredCategories.length === 0) {
            return null as any; // Filter out non-trading articles
          }

          const enhancedTitle = generateEnhancedTitle(article);
          const derivedTrend = deriveTrend({ title: article.title, category: inferredCategories[0], tags: [] });

          return {
            ...article,
            categories: inferredCategories,
            tags: [],
            sentiment: 'NEUTRAL' as NewsSentiment,
            importance: 'MEDIUM' as NewsImportance,
            summary: '',
            topic: enhancedTitle.enhanced.split(':')[0],
            subEventType: enhancedTitle.subEventType || 'other',
            trendDirection: 'NEUTRAL',
            urgency: 'MEDIUM',
            keywords: [],
          };
        }).filter(a => a !== null) as LabeledArticle[];

        // Also create categorizedNews for backward compatibility (without metadata)
        const categorizedNews: NewsArticle[] = labeledArticles.map(a => ({
          id: a.id,
          title: a.title,
          content: a.content,
          source: a.source,
          url: a.url,
          publishedAt: a.publishedAt,
          categories: a.categories,
          tags: a.tags,
          sentiment: a.sentiment,
          importance: a.importance,
          snippet: a.snippet,
          summary: a.summary,
        } as NewsArticle));

        const elapsed = Date.now() - startTime;
        logger.info(
          `[CategorizeNode] Completed in ${elapsed}ms. ` +
          `Categorized: ${labeledArticles.length}/${state.filteredArticles.length} articles`
        );

        return {
          currentStep: 'CATEGORIZE_COMPLETE',
          labeledArticles,
          categorizedNews,
          stats: {
            ...state.stats,
            categorized: labeledArticles.length,
            totalCategorized: labeledArticles.length,
          },
          thoughts: [
            ...state.thoughts,
            `Categorized ${labeledArticles.length} articles using gpt-oss-20b`,
          ],
        };
      }
    } catch (error) {
      logger.warn('[CategorizeNode] OpenRouter categorization failed, trying fallback:', error);
    }
  }

  // Fallback: Keyword-based categorization
  logger.info('[CategorizeNode] Using keyword-based categorization fallback');

  const labeledArticles: LabeledArticle[] = state.filteredArticles
    .map(article => {
      const categories = inferTradingCategory(article.title, article.content);
      if (categories.length === 0) {
        return null as any;
      }

      const enhancedTitle = generateEnhancedTitle(article);

      return {
        ...article,
        categories,
        tags: extractKeywords(article.title),
        sentiment: 'NEUTRAL' as NewsSentiment,
        importance: 'MEDIUM' as NewsImportance,
        summary: '',
        topic: enhancedTitle.enhanced.split(':')[0],
        subEventType: enhancedTitle.subEventType || 'other',
        trendDirection: 'NEUTRAL',
        urgency: 'MEDIUM',
        keywords: extractKeywords(article.title),
      };
    })
    .filter(a => a !== null) as LabeledArticle[];

  const elapsed = Date.now() - startTime;
  logger.info(`[CategorizeNode] Completed in ${elapsed}ms using fallback. Categorized: ${labeledArticles.length}`);

  return {
    currentStep: 'CATEGORIZE_COMPLETE_FALLBACK',
    labeledArticles,
    categorizedNews: labeledArticles as any,
    stats: {
      ...state.stats,
      categorized: labeledArticles.length,
      totalCategorized: labeledArticles.length,
    },
    thoughts: [
      ...state.thoughts,
      `Categorized ${labeledArticles.length} articles using keyword fallback`,
    ],
  };
}

/**
 * Infer trading category from title and content
 */
function inferTradingCategory(title: string, content?: string): NewsCategory[] {
  const text = (title + ' ' + (content || '')).toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matchCount = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
    if (matchCount >= 2) {
      return [category as NewsCategory];
    }
  }

  // No clear category match
  return [];
}

/**
 * Extract keywords from title
 */
function extractKeywords(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3);

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
}
