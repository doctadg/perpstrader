import { Strategy, BacktestResult, MarketData, ResearchData } from '../shared/types';
export declare class StrategyEngine {
    private strategies;
    brainstormStrategies(research: ResearchData): Promise<Strategy[]>;
    private generateMarketMakingStrategies;
    private generateTrendFollowingStrategies;
    private generateMeanReversionStrategies;
    private generateArbitrageStrategies;
    private generateAIPredictionStrategies;
    backtestStrategy(strategy: Strategy, historicalData: MarketData[]): Promise<BacktestResult>;
    private generateSignal;
    private calculateBacktestMetrics;
    private getEmptyPerformance;
    optimizeStrategies(strategies: Strategy[]): Promise<Strategy[]>;
    private optimizeStrategy;
    getStrategy(id: string): Strategy | undefined;
    getAllStrategies(): Strategy[];
    saveStrategy(strategy: Strategy): void;
    deleteStrategy(id: string): boolean;
}
declare const strategyEngine: StrategyEngine;
export default strategyEngine;
//# sourceMappingURL=strategy-engine.d.ts.map