// Prediction Markets Agent State

import {
  PredictionMarket,
  PredictionIdea,
  PredictionBacktestResult,
  PredictionSignal,
  PredictionRiskAssessment,
  PredictionTrade,
  PredictionPortfolio,
  NewsItem,
  PredictionMarketIntel,
} from '../shared/types';

export interface PredictionAgentState {
  cycleId: string;
  cycleStartTime: Date;
  currentStep: string;

  marketUniverse: PredictionMarket[];
  activeMarkets: PredictionMarket[];
  marketNews: Record<string, NewsItem[]>;
  marketIntel: Record<string, PredictionMarketIntel>;

  ideas: PredictionIdea[];
  backtestResults: PredictionBacktestResult[];
  selectedIdea: PredictionIdea | null;

  signal: PredictionSignal | null;
  riskAssessment: PredictionRiskAssessment | null;
  executionResult: PredictionTrade | null;

  portfolio: PredictionPortfolio | null;

  thoughts: string[];
  errors: string[];

  shouldExecute: boolean;
  shouldLearn: boolean;
}

export function createInitialPredictionState(): PredictionAgentState {
  return {
    cycleId: crypto.randomUUID(),
    cycleStartTime: new Date(),
    currentStep: 'INIT',

    marketUniverse: [],
    activeMarkets: [],
    marketNews: {},
    marketIntel: {},

    ideas: [],
    backtestResults: [],
    selectedIdea: null,

    signal: null,
    riskAssessment: null,
    executionResult: null,

    portfolio: null,

    thoughts: [],
    errors: [],

    shouldExecute: false,
    shouldLearn: false,
  };
}
