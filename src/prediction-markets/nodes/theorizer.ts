// Prediction Market Theorizer Node

import { v4 as uuidv4 } from 'uuid';
import { PredictionAgentState } from '../state';
import { PredictionIdea, NewsItem } from '../../shared/types';
import glmService from '../../shared/glm-service';
import logger from '../../shared/logger';

const MIN_EDGE = Number.parseFloat(process.env.PREDICTION_MIN_EDGE || '0.04');

const IMPORTANCE_WEIGHT: Record<string, number> = {
  LOW: 0.5,
  MEDIUM: 1,
  HIGH: 1.5,
  CRITICAL: 2,
};

function scoreNewsSentiment(news: NewsItem[]): number {
  if (!news.length) return 0;
  let score = 0;
  let weightTotal = 0;
  for (const item of news) {
    const weight = IMPORTANCE_WEIGHT[item.importance] || 1;
    weightTotal += weight;
    if (item.sentiment === 'BULLISH') score += 1 * weight;
    if (item.sentiment === 'BEARISH') score -= 1 * weight;
  }
  if (weightTotal === 0) return 0;
  return score / weightTotal;
}

function buildFallbackIdea(market: PredictionAgentState['activeMarkets'][number], news: NewsItem[]): PredictionIdea | null {
  if (!Number.isFinite(market.yesPrice)) return null;
  const implied = market.yesPrice as number;
  const sentimentScore = scoreNewsSentiment(news);
  if (Math.abs(sentimentScore) < 0.15) return null;

  const delta = Math.min(0.2, 0.05 + Math.abs(sentimentScore) * 0.1);
  const predicted = Math.max(0.02, Math.min(0.98, implied + (sentimentScore > 0 ? delta : -delta)));
  const edge = predicted - implied;
  if (Math.abs(edge) < MIN_EDGE) return null;

  const outcome = edge > 0 ? 'YES' : 'NO';
  const catalysts = news.slice(0, 2).map(item => item.title);

  return {
    id: uuidv4(),
    marketId: market.id,
    marketTitle: market.title,
    outcome,
    impliedProbability: implied,
    predictedProbability: predicted,
    edge,
    confidence: Math.min(0.95, 0.5 + Math.abs(edge) * 2),
    timeHorizon: '7d',
    catalysts,
    rationale: `${outcome} bias from ${news.length} linked headlines (score ${sentimentScore.toFixed(2)})`,
  };
}

export async function theorizerNode(state: PredictionAgentState): Promise<Partial<PredictionAgentState>> {
  logger.info('[PredictionTheorizer] Generating prediction ideas');

  if (!state.activeMarkets.length) {
    return {
      currentStep: 'THEORIZER_SKIPPED',
      ideas: [],
      thoughts: [...state.thoughts, 'No markets available for theorizing'],
    };
  }

  try {
    if (glmService.canUseService()) {
      const ideas = await glmService.generatePredictionIdeas({
        markets: state.activeMarkets,
        marketNews: state.marketNews,
      });

      if (ideas.length) {
        return {
          currentStep: 'THEORIZER_COMPLETE',
          ideas,
          thoughts: [
            ...state.thoughts,
            `Generated ${ideas.length} LLM prediction ideas`,
          ],
        };
      }
    }
  } catch (error) {
    logger.warn('[PredictionTheorizer] LLM generation failed, falling back:', error);
  }

  const ideas: PredictionIdea[] = [];
  for (const market of state.activeMarkets) {
    const news = state.marketNews[market.id] || [];
    const idea = buildFallbackIdea(market, news);
    if (idea) ideas.push(idea);
  }

  return {
    currentStep: ideas.length ? 'THEORIZER_FALLBACK' : 'THEORIZER_EMPTY',
    ideas,
    thoughts: [
      ...state.thoughts,
      `Generated ${ideas.length} fallback prediction ideas`,
    ],
  };
}

export default theorizerNode;
