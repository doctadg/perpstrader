// Search Node
// Searches for news across all categories

import { NewsAgentState } from '../state';
import newsSearchService from '../../news-ingester/news-search';
import logger from '../../shared/logger';
import { NewsCategory, NewsItem } from '../../shared/types';

export async function searchNode(state: NewsAgentState): Promise<Partial<NewsAgentState>> {
  logger.info('[SearchNode] Starting news search across all categories');

  try {
    const categories = state.categories.length > 0 ? state.categories : newsSearchService.getAvailableCategories();
    const searchResults = await newsSearchService.searchAllCategories(categories);

    let totalFound = 0;
    const rawNews: NewsItem[] = [];

    for (const [category, results] of searchResults.entries()) {
      for (const result of results) {
        if (!result.link) continue;
        const title = result.title || result.link || 'Untitled';
        const snippet = result.snippet || (result.content ? result.content.slice(0, 200) : '');
        let source = 'unknown';
        try {
          source = new URL(result.link).hostname;
        } catch (error) {
          logger.debug(`[SearchNode] Failed to parse source for ${result.link}`);
        }

        rawNews.push({
          id: crypto.randomUUID(),
          title,
          content: result.content,
          source,
          url: result.link,
          publishedAt: result.date ? new Date(result.date) : new Date(),
          categories: [category],
          tags: [],
          sentiment: 'NEUTRAL',
          importance: 'MEDIUM',
          snippet,
          scrapedAt: new Date(),
          createdAt: new Date(),
        });
      }

      totalFound += results.length;
      logger.info(`[SearchNode] ${category}: Found ${results.length} results`);
    }

    const byCategory: Record<NewsCategory, number> = {
      ...state.stats.byCategory,
    };
    for (const category of categories) {
      byCategory[category] = searchResults.get(category)?.length || 0;
    }

    const queryPlan = newsSearchService.getLastQueryPlan();
    const querySummary = Array.from(queryPlan.entries())
      .map(([category, queries]) => `${category}: ${queries.join(' | ')}`)
      .join(' ; ');
    const trimmedSummary = querySummary.length > 400 ? `${querySummary.slice(0, 400)}...` : querySummary;

    const thoughts = [
      ...state.thoughts,
      `Searched ${categories.length} categories, found ${totalFound} total results`,
      `Results by category: ${Array.from(searchResults.entries()).map(([k, v]) => `${k}: ${v.length}`).join(', ')}`,
      trimmedSummary ? `Queries used: ${trimmedSummary}` : '',
    ].filter(Boolean);

    return {
      currentStep: 'SEARCH_COMPLETE',
      searchResults,
      rawNews,
      stats: {
        ...state.stats,
        totalFound,
        byCategory,
      },
      thoughts,
    };
  } catch (error) {
    logger.error('[SearchNode] Failed to search news:', error);
    return {
      currentStep: 'SEARCH_ERROR',
      errors: [
        ...state.errors,
        `Search failed: ${error}`,
      ],
    };
  }
}
