// Prediction Market News Context Node
// Links market-specific news and enriches each market with heatmap intelligence.

import { PredictionAgentState } from '../state';
import newsStore from '../../data/news-store';
import storyClusterStore, { StoryCluster } from '../../data/story-cluster-store';
import logger from '../../shared/logger';
import { NewsImportance, NewsItem, PredictionMarketIntel } from '../../shared/types';

const NEWS_PER_MARKET = Number.parseInt(process.env.PREDICTION_NEWS_LIMIT || '8', 10) || 8;

const URGENCY_RANK: Record<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function buildFallbackQuery(title: string): string {
  return title.split(/\s+/).slice(0, 6).join(' ');
}

function importanceWeight(importance: NewsImportance): number {
  switch (importance) {
    case 'CRITICAL':
      return 2;
    case 'HIGH':
      return 1.5;
    case 'MEDIUM':
      return 1;
    case 'LOW':
    default:
      return 0.6;
  }
}

function dedupeNews(news: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const item of news) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped;
}

function resolveTrend(clusters: StoryCluster[]): 'UP' | 'DOWN' | 'NEUTRAL' {
  let up = 0;
  let down = 0;
  for (const cluster of clusters) {
    if (cluster.trendDirection === 'UP') up += 1;
    else if (cluster.trendDirection === 'DOWN') down += 1;
  }
  if (up > down) return 'UP';
  if (down > up) return 'DOWN';
  return 'NEUTRAL';
}

function resolveUrgency(clusters: StoryCluster[]): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  let best: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  for (const cluster of clusters) {
    const urgency = cluster.urgency || 'MEDIUM';
    if (URGENCY_RANK[urgency] > URGENCY_RANK[best]) {
      best = urgency;
    }
  }
  return best;
}

function buildMarketIntel(
  market: PredictionAgentState['activeMarkets'][number],
  news: NewsItem[],
  clusters: StoryCluster[],
): PredictionMarketIntel {
  let weightedSentiment = 0;
  let weightSum = 0;
  let weightedImportance = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;

  for (const item of news) {
    const weight = importanceWeight(item.importance);
    weightedImportance += weight;
    weightSum += weight;

    if (item.sentiment === 'BULLISH') {
      weightedSentiment += 1 * weight;
      bullishCount += 1;
    } else if (item.sentiment === 'BEARISH') {
      weightedSentiment -= 1 * weight;
      bearishCount += 1;
    } else {
      neutralCount += 1;
    }
  }

  const sentimentScore = weightSum > 0 ? weightedSentiment / weightSum : 0;
  const heatValues = clusters.map(cluster => Number(cluster.heatScore) || 0);
  const totalHeat = heatValues.reduce((sum, value) => sum + value, 0);
  const avgClusterHeat = heatValues.length ? totalHeat / heatValues.length : 0;
  const maxClusterHeat = heatValues.length ? Math.max(...heatValues) : 0;
  const topTopics = [...clusters]
    .sort((a, b) => (b.heatScore || 0) - (a.heatScore || 0))
    .map(cluster => cluster.topic)
    .filter(Boolean)
    .slice(0, 3);
  const catalysts = news
    .map(item => item.title)
    .filter(Boolean)
    .slice(0, 4);

  return {
    marketId: market.id,
    marketSlug: market.slug,
    marketTitle: market.title,
    linkedNewsCount: news.length,
    linkedClusterCount: clusters.length,
    avgClusterHeat: Number(avgClusterHeat.toFixed(2)),
    maxClusterHeat: Number(maxClusterHeat.toFixed(2)),
    trendDirection: resolveTrend(clusters),
    urgency: resolveUrgency(clusters),
    sentimentScore: Number(sentimentScore.toFixed(3)),
    bullishCount,
    bearishCount,
    neutralCount,
    weightedImportance: Number(weightedImportance.toFixed(2)),
    topTopics,
    catalysts,
  };
}

export async function newsContextNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info('[PredictionNewsContext] Linking news to markets');

  if (!state.activeMarkets.length) {
    return {
      currentStep: 'NEWS_CONTEXT_SKIPPED',
      marketNews: {},
      marketIntel: {},
      thoughts: [...state.thoughts, 'No active markets to attach news'],
    };
  }

  const marketNews: Record<string, NewsItem[]> = {};
  const marketIntel: Record<string, PredictionMarketIntel> = {};
  let totalLinked = 0;

  for (const market of state.activeMarkets) {
    let news = await newsStore.getNewsByMarket(market.id, market.slug, NEWS_PER_MARKET);
    if (!news.length) {
      const query = buildFallbackQuery(market.title);
      news = await newsStore.searchNews(query, Math.min(NEWS_PER_MARKET, 5));
    }

    const deduped = dedupeNews(news);
    if (deduped.length) {
      marketNews[market.id] = deduped;
      totalLinked += deduped.length;
    }
  }

  const articleIds = Object.values(marketNews)
    .flatMap(news => news.map(item => item.id))
    .filter(Boolean);

  let articleToCluster = new Map<string, string>();
  const clustersById = new Map<string, StoryCluster>();

  if (articleIds.length) {
    try {
      articleToCluster = await storyClusterStore.findClusterIdsByArticleIds(articleIds);
      const uniqueClusterIds = Array.from(new Set(Array.from(articleToCluster.values()).filter(Boolean))).slice(0, 250);

      const clusterRows = await Promise.all(
        uniqueClusterIds.map(async clusterId => {
          const cluster = await storyClusterStore.getClusterById(clusterId);
          return { clusterId, cluster };
        }),
      );

      for (const row of clusterRows) {
        if (row.cluster) {
          clustersById.set(row.clusterId, row.cluster);
        }
      }
    } catch (error) {
      logger.warn('[PredictionNewsContext] Failed to hydrate cluster heat data:', error);
    }
  }

  for (const market of state.activeMarkets) {
    const news = marketNews[market.id] || [];
    const clusterIds = Array.from(
      new Set(
        news
          .map(item => articleToCluster.get(item.id))
          .filter((clusterId): clusterId is string => !!clusterId),
      ),
    );
    const clusters = clusterIds
      .map(clusterId => clustersById.get(clusterId))
      .filter((cluster): cluster is StoryCluster => !!cluster);

    marketIntel[market.id] = buildMarketIntel(market, news, clusters);
  }

  const marketsWithNews = Object.values(marketIntel).filter(intel => intel.linkedNewsCount > 0).length;
  const marketsWithHeat = Object.values(marketIntel).filter(intel => intel.linkedClusterCount > 0).length;
  const avgHeat = marketsWithHeat > 0
    ? Object.values(marketIntel)
      .filter(intel => intel.linkedClusterCount > 0)
      .reduce((sum, intel) => sum + intel.avgClusterHeat, 0) / marketsWithHeat
    : 0;

  return {
    currentStep: totalLinked > 0 ? 'NEWS_CONTEXT_READY' : 'NEWS_CONTEXT_EMPTY',
    marketNews,
    marketIntel,
    thoughts: [
      ...state.thoughts,
      `Linked ${totalLinked} news items to ${marketsWithNews} markets`,
      `Linked heatmap clusters to ${marketsWithHeat} markets (avg heat ${avgHeat.toFixed(1)})`,
    ],
  };
}

export default newsContextNode;
