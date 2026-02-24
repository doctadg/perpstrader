"use strict";
/**
 * Result Analyzer
 *
 * Analyzes backtest results and extracts key performance metrics.
 * Determines strategy status based on performance thresholds.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateMetrics = calculateMetrics;
exports.assessStrategy = assessStrategy;
exports.compareResults = compareResults;
exports.generateReport = generateReport;
const logger_1 = __importDefault(require("../shared/logger"));
// Performance thresholds
const DEFAULT_THRESHOLDS = {
    minSharpe: 1.5,
    minWinRate: 55,
    maxDrawdown: 20,
    minProfitFactor: 1.3,
    minTotalTrades: 10,
};
/**
 * Calculate comprehensive performance metrics from backtest result
 */
function calculateMetrics(result) {
    const { trades, initialCapital, finalCapital, totalReturn, annualizedReturn, sharpeRatio, maxDrawdown, winRate, totalTrades } = result;
    // Filter exit trades for PnL calculations
    const exitTrades = trades.filter(t => t.entryExit === 'EXIT');
    const winningTrades = exitTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = exitTrades.filter(t => (t.pnl || 0) < 0);
    // Calculate profit factor
    const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    // Calculate average win/loss
    const averageWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
    // Calculate expectancy (average PnL per trade)
    const totalPnL = finalCapital - initialCapital;
    const expectancy = totalTrades > 0 ? totalPnL / totalTrades : 0;
    // Calculate Calmar ratio (annualized return / max drawdown)
    const calmarRatio = maxDrawdown > 0 ? totalReturn / maxDrawdown : totalReturn > 0 ? Infinity : 0;
    // Calculate Sortino ratio (simplified - uses max drawdown as downside measure)
    const sortinoRatio = maxDrawdown > 0 ? (annualizedReturn / maxDrawdown) * Math.sqrt(12) : 0;
    // Calculate risk-adjusted return
    const riskAdjustedReturn = maxDrawdown > 0 ? totalReturn / maxDrawdown : totalReturn;
    // Calculate consistency score (based on win rate and trade distribution)
    const idealWinRate = 50; // 50% is baseline
    const winRateScore = Math.min(winRate / idealWinRate, 1) * 50;
    const sampleSizeScore = Math.min(totalTrades / 30, 1) * 50; // Full score at 30+ trades
    const consistencyScore = winRateScore + sampleSizeScore;
    return {
        sharpeRatio,
        winRate,
        maxDrawdown,
        totalReturn,
        annualizedReturn,
        totalTrades,
        profitFactor,
        calmarRatio,
        sortinoRatio,
        averageWin,
        averageLoss,
        expectancy,
        riskAdjustedReturn,
        consistencyScore,
    };
}
/**
 * Assess strategy viability based on performance metrics
 */
function assessStrategy(result, strategy, customThresholds) {
    const thresholds = { ...DEFAULT_THRESHOLDS, ...customThresholds };
    const metrics = calculateMetrics(result);
    const reasons = [];
    const recommendations = [];
    // Check individual criteria
    const sharpePass = metrics.sharpeRatio >= thresholds.minSharpe;
    const winRatePass = metrics.winRate >= thresholds.minWinRate;
    const drawdownPass = metrics.maxDrawdown <= thresholds.maxDrawdown;
    const profitFactorPass = metrics.profitFactor >= thresholds.minProfitFactor;
    const sampleSizePass = metrics.totalTrades >= thresholds.minTotalTrades;
    // Build reasons and recommendations
    if (sharpePass) {
        reasons.push(`Sharpe ratio ${metrics.sharpeRatio.toFixed(2)} meets threshold (${thresholds.minSharpe})`);
    }
    else {
        reasons.push(`Sharpe ratio ${metrics.sharpeRatio.toFixed(2)} below threshold (${thresholds.minSharpe})`);
        recommendations.push('Consider improving risk-adjusted returns by reducing volatility or increasing profit per trade');
    }
    if (winRatePass) {
        reasons.push(`Win rate ${metrics.winRate.toFixed(1)}% meets threshold (${thresholds.minWinRate}%)`);
    }
    else {
        reasons.push(`Win rate ${metrics.winRate.toFixed(1)}% below threshold (${thresholds.minWinRate}%)`);
        recommendations.push('Improve entry signal quality or tighten stop-loss criteria');
    }
    if (drawdownPass) {
        reasons.push(`Max drawdown ${metrics.maxDrawdown.toFixed(1)}% within limits (${thresholds.maxDrawdown}%)`);
    }
    else {
        reasons.push(`Max drawdown ${metrics.maxDrawdown.toFixed(1)}% exceeds limit (${thresholds.maxDrawdown}%)`);
        recommendations.push('Implement tighter risk controls or reduce position sizing');
    }
    if (profitFactorPass) {
        reasons.push(`Profit factor ${metrics.profitFactor.toFixed(2)} meets threshold (${thresholds.minProfitFactor})`);
    }
    else {
        reasons.push(`Profit factor ${metrics.profitFactor.toFixed(2)} below threshold (${thresholds.minProfitFactor})`);
        recommendations.push('Focus on increasing average win size or reducing average loss size');
    }
    if (sampleSizePass) {
        reasons.push(`Sample size ${metrics.totalTrades} trades sufficient (${thresholds.minTotalTrades}+)`);
    }
    else {
        reasons.push(`Sample size ${metrics.totalTrades} trades insufficient (${thresholds.minTotalTrades}+)`);
        recommendations.push('Collect more historical data or reduce timeframe granularity');
    }
    // Determine performance tier
    let performanceTier;
    const score = (sharpePass ? 2 : 0) + (winRatePass ? 2 : 0) + (drawdownPass ? 1 : 0) + (profitFactorPass ? 1 : 0) + (sampleSizePass ? 1 : 0);
    if (score >= 6) {
        performanceTier = 'EXCELLENT';
    }
    else if (score >= 5) {
        performanceTier = 'GOOD';
    }
    else if (score >= 4) {
        performanceTier = 'ACCEPTABLE';
    }
    else if (score >= 2) {
        performanceTier = 'POOR';
    }
    else {
        performanceTier = 'REJECTED';
    }
    // Determine viability - must pass sharpe AND win rate thresholds
    const isViable = sharpePass && winRatePass && drawdownPass;
    // Only activate if viable and has good sample size
    const shouldActivate = isViable && sampleSizePass;
    logger_1.default.info(`[ResultAnalyzer] Strategy ${strategy.id} assessment:`, {
        performanceTier,
        isViable,
        shouldActivate,
        metrics: {
            sharpe: metrics.sharpeRatio.toFixed(2),
            winRate: metrics.winRate.toFixed(1),
            drawdown: metrics.maxDrawdown.toFixed(1),
        },
    });
    return {
        strategyId: strategy.id,
        isViable,
        performanceTier,
        shouldActivate,
        metrics,
        reasons,
        recommendations,
        thresholds,
    };
}
/**
 * Compare two backtest results to determine improvement
 */
function compareResults(current, previous) {
    const currentMetrics = calculateMetrics(current);
    const previousMetrics = calculateMetrics(previous);
    const changes = {};
    const keys = ['sharpeRatio', 'winRate', 'totalReturn', 'maxDrawdown', 'profitFactor'];
    for (const key of keys) {
        const curr = currentMetrics[key];
        const prev = previousMetrics[key];
        const change = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : curr > 0 ? 100 : 0;
        changes[key] = {
            current: curr,
            previous: prev,
            change,
        };
    }
    // Improved if sharpe and win rate increased
    const improved = changes.sharpeRatio.change > 0 && changes.winRate.change > 0;
    return { improved, changes };
}
/**
 * Generate summary report for backtest results
 */
function generateReport(assessment, strategy) {
    const { metrics, performanceTier, isViable, shouldActivate } = assessment;
    return `
╔══════════════════════════════════════════════════════════════════╗
║           BACKTEST RESULTS - ${strategy.name.padEnd(36)}║
╠══════════════════════════════════════════════════════════════════╣
║ Performance Tier: ${performanceTier.padEnd(46)}║
║ Viable: ${isViable ? 'YES ✓' : 'NO ✗'} | Should Activate: ${shouldActivate ? 'YES ✓' : 'NO ✗'.padEnd(26)}║
╠══════════════════════════════════════════════════════════════════╣
║ CORE METRICS                                                     ║
╠══════════════════════════════════════════════════════════════════╣
║  Total Return:      ${metrics.totalReturn.toFixed(2).padStart(8)}%                                    ║
║  Annualized Return: ${metrics.annualizedReturn.toFixed(2).padStart(8)}%                                    ║
║  Sharpe Ratio:      ${metrics.sharpeRatio.toFixed(2).padStart(8)}                                    ║
║  Win Rate:          ${metrics.winRate.toFixed(1).padStart(8)}%                                    ║
║  Max Drawdown:      ${metrics.maxDrawdown.toFixed(2).padStart(8)}%                                    ║
║  Total Trades:      ${metrics.totalTrades.toString().padStart(8)}                                    ║
╠══════════════════════════════════════════════════════════════════╣
║ EXTENDED METRICS                                                 ║
╠══════════════════════════════════════════════════════════════════╣
║  Profit Factor:     ${metrics.profitFactor.toFixed(2).padStart(8)}                                    ║
║  Calmar Ratio:      ${metrics.calmarRatio.toFixed(2).padStart(8)}                                    ║
║  Sortino Ratio:     ${metrics.sortinoRatio.toFixed(2).padStart(8)}                                    ║
║  Average Win:       $${metrics.averageWin.toFixed(2).padStart(7)}                                    ║
║  Average Loss:      $${metrics.averageLoss.toFixed(2).padStart(7)}                                    ║
║  Expectancy:        $${metrics.expectancy.toFixed(2).padStart(7)}                                    ║
╠══════════════════════════════════════════════════════════════════╣
║ THRESHOLDS                                                       ║
╠══════════════════════════════════════════════════════════════════╣
║  Min Sharpe:        ${assessment.thresholds.minSharpe.toString().padStart(8)}                                    ║
║  Min Win Rate:      ${assessment.thresholds.minWinRate.toString().padStart(8)}%                                    ║
║  Max Drawdown:      ${assessment.thresholds.maxDrawdown.toString().padStart(8)}%                                    ║
╚══════════════════════════════════════════════════════════════════╝
  `.trim();
}
exports.default = {
    calculateMetrics,
    assessStrategy,
    compareResults,
    generateReport,
};
//# sourceMappingURL=result-analyzer.js.map