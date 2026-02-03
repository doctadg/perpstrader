// Store Node
// Stores categorized news articles in the news database

import { NewsAgentState } from '../state';
import newsStore from '../../data/news-store';
import logger from '../../shared/logger';

export async function storeNode(state: NewsAgentState): Promise<Partial<NewsAgentState>> {
  logger.info(`[StoreNode] Storing ${state.categorizedNews.length} articles in news store`);

  if (state.categorizedNews.length === 0) {
    return {
      currentStep: 'STORE_SKIPPED',
      stats: {
        ...state.stats,
        totalStored: 0,
        totalDuplicates: 0,
      },
      thoughts: [...state.thoughts, 'No articles to store'],
    };
  }

  try {
    const { stored, duplicates } = await newsStore.storeNews(state.categorizedNews);

    logger.info(`[StoreNode] Stored ${stored.length} articles, skipped ${duplicates.length} duplicates`);

    const storedSet = new Set(stored);
    const storedArticles = state.categorizedNews.filter(article => storedSet.has(article.id));

    return {
      currentStep: 'STORE_COMPLETE',
      categorizedNews: storedArticles,
      storedCount: stored.length,
      duplicateCount: duplicates.length,
      stats: {
        ...state.stats,
        totalStored: stored.length,
        totalDuplicates: duplicates.length,
      },
      thoughts: [
        ...state.thoughts,
        `Stored ${stored.length} new articles in news database`,
        duplicates.length > 0 ? `Skipped ${duplicates.length} duplicate URLs` : '',
      ].filter(Boolean),
    };
  } catch (error) {
    logger.error('[StoreNode] Failed to store news:', error);
    return {
      currentStep: 'STORE_ERROR',
      errors: [
        ...state.errors,
        `Store failed: ${error}`,
      ],
    };
  }
}
