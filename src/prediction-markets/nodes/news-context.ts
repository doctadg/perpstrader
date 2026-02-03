// Prediction Market News Context Node

import { PredictionAgentState } from '../state';
import newsStore from '../../data/news-store';
import logger from '../../shared/logger';

const NEWS_PER_MARKET = Number.parseInt(process.env.PREDICTION_NEWS_LIMIT || '8', 10) || 8;

function buildFallbackQuery(title: string): string {
  return title.split(/\s+/).slice(0, 6).join(' ');
}

export async function newsContextNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info('[PredictionNewsContext] Linking news to markets');

  if (!state.activeMarkets.length) {
    return {
      currentStep: 'NEWS_CONTEXT_SKIPPED',
      marketNews: {},
      thoughts: [...state.thoughts, 'No active markets to attach news'],
    };
  }

  const marketNews: Record<string, any[]> = {};
  let totalLinked = 0;

  for (const market of state.activeMarkets) {
    let news = await newsStore.getNewsByMarket(market.id, market.slug, NEWS_PER_MARKET);
    if (!news.length) {
      const query = buildFallbackQuery(market.title);
      news = await newsStore.searchNews(query, Math.min(NEWS_PER_MARKET, 5));
    }
    if (news.length) {
      marketNews[market.id] = news;
      totalLinked += news.length;
    }
  }

  return {
    currentStep: totalLinked > 0 ? 'NEWS_CONTEXT_READY' : 'NEWS_CONTEXT_EMPTY',
    marketNews,
    thoughts: [
      ...state.thoughts,
      `Linked ${totalLinked} news items to ${Object.keys(marketNews).length} markets`,
    ],
  };
}

export default newsContextNode;
