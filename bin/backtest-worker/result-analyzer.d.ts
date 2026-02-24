/**
 * Result Analyzer
 *
 * Analyzes backtest results and extracts key performance metrics.
 * Determines strategy status based on performance thresholds.
 */
import { BacktestResult, Strategy } from '../shared/types';
export interface PerformanceMetrics {
    sharpeRatio: number;
    winRate: number;
    maxDrawdown: number;
    totalReturn: number;
    annualizedReturn: number;
    totalTrades: number;
    profitFactor: number;
    calmarRatio: number;
    sortinoRatio: number;
    averageWin: number;
    averageLoss: number;
    expectancy: number;
    riskAdjustedReturn: number;
    consistencyScore: number;
}
export interface StrategyAssessment {
    strategyId: string;
    isViable: boolean;
    performanceTier: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'POOR' | 'REJECTED';
    shouldActivate: boolean;
    metrics: PerformanceMetrics;
    reasons: string[];
    recommendations: string[];
    thresholds: {
        minSharpe: number;
        minWinRate: number;
        maxDrawdown: number;
        minProfitFactor: number;
        minTotalTrades: number;
    };
}
declare const DEFAULT_THRESHOLDS: {
    minSharpe: number;
    minWinRate: number;
    maxDrawdown: number;
    minProfitFactor: number;
    minTotalTrades: number;
};
/**
 * Calculate comprehensive performance metrics from backtest result
 */
export declare function calculateMetrics(result: BacktestResult): PerformanceMetrics;
/**
 * Assess strategy viability based on performance metrics
 */
export declare function assessStrategy(result: BacktestResult, strategy: Strategy, customThresholds?: Partial<typeof DEFAULT_THRESHOLDS>): StrategyAssessment;
/**
 * Compare two backtest results to determine improvement
 */
export declare function compareResults(current: BacktestResult, previous: BacktestResult): {
    improved: boolean;
    changes: Record<string, {
        current: number;
        previous: number;
        change: number;
    }>;
};
/**
 * Generate summary report for backtest results
 */
export declare function generateReport(assessment: StrategyAssessment, strategy: Strategy): string;
declare const _default: {
    calculateMetrics: typeof calculateMetrics;
    assessStrategy: typeof assessStrategy;
    compareResults: typeof compareResults;
    generateReport: typeof generateReport;
};
export default _default;
//# sourceMappingURL=result-analyzer.d.ts.map