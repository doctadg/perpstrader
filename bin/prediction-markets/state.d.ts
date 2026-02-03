import { PredictionMarket, PredictionIdea, PredictionBacktestResult, PredictionSignal, PredictionRiskAssessment, PredictionTrade, PredictionPortfolio, NewsItem } from '../shared/types';
export interface PredictionAgentState {
    cycleId: string;
    cycleStartTime: Date;
    currentStep: string;
    marketUniverse: PredictionMarket[];
    activeMarkets: PredictionMarket[];
    marketNews: Record<string, NewsItem[]>;
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
export declare function createInitialPredictionState(): PredictionAgentState;
//# sourceMappingURL=state.d.ts.map