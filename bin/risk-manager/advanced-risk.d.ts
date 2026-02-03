import { MarketData, Strategy, Position } from '../shared/types';
interface RiskMetrics {
    overallRisk: number;
    positionRisk: number;
    marketRisk: number;
    correlationRisk: number;
    liquidityRisk: number;
    leverageRisk: number;
    KellyCriterion: {
        f: number;
        expectedReturn: number;
        winProbability: number;
        lossProbability: number;
        averageWin: number;
        averageLoss: number;
    };
}
interface RiskAlert {
    type: 'HIGH_RISK' | 'MODERATE_RISK' | 'LOW_RISK';
    level: number;
    message: string;
    recommendations: string[];
    timestamp: Date;
}
interface RiskThresholds {
    maxOverallRisk: number;
    maxPositionRisk: number;
    maxLeverage: number;
    maxCorrelation: number;
    maxDailyLoss: number;
    stopLossThreshold: number;
    takeProfitThreshold: number;
    maxPositionSize: number;
}
declare class AdvancedRiskEngine {
    private db;
    private riskThresholds;
    private riskHistory;
    private maxHistorySize;
    constructor();
    calculateComprehensiveRisk(positions: Position[], marketData: Map<string, MarketData>, strategy: Strategy): Promise<RiskMetrics>;
    private calculatePositionRisk;
    private calculateMarketRisk;
    private calculateCorrelationRisk;
    private calculateLiquidityRisk;
    private calculateLeverageRisk;
    calculateKellyCriterion(strategy: Strategy): Promise<RiskMetrics['KellyCriterion']>;
    getGLMRecommendations(riskMetrics: RiskMetrics, positions: Position[]): Promise<RiskAlert[]>;
    private getHistoricalTrades;
    private updateRiskHistory;
    getRiskTrend(): 'INCREASING' | 'STABLE' | 'DECREASING';
    shouldReducePosition(riskMetrics: RiskMetrics): boolean;
    getRecommendedPositionSize(riskMetrics: RiskMetrics, availableCapital: number): number;
    getStopLossLevel(entryPrice: number, isLong: boolean): number;
    getTakeProfitLevel(entryPrice: number, isLong: boolean): number;
    checkDailyLoss(todayPnL: number, initialCapital: number): boolean;
    updateRiskThresholds(newThresholds: Partial<RiskThresholds>): void;
}
declare const _default: AdvancedRiskEngine;
export default _default;
//# sourceMappingURL=advanced-risk.d.ts.map