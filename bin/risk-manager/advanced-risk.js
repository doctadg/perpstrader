"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const glm_service_1 = __importDefault(require("../shared/glm-service"));
const logger_1 = __importDefault(require("../shared/logger"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
dotenv.config();
class AdvancedRiskEngine {
    db;
    riskThresholds;
    riskHistory = [];
    maxHistorySize = 100;
    constructor() {
        this.db = new better_sqlite3_1.default(process.env.DB_PATH || './data/trading.db');
        this.riskThresholds = {
            maxOverallRisk: 0.7,
            maxPositionRisk: 0.5,
            maxLeverage: 40, // Increased from 5x to 40x for aggressive trading
            maxCorrelation: 0.8,
            maxDailyLoss: 0.10, // Increased from 5% to 10%
            stopLossThreshold: 0.04, // Increased from 2% to 4%
            takeProfitThreshold: 0.08, // Increased from 4% to 8%
            maxPositionSize: 0.25 // Increased from 10% to 25%
        };
        logger_1.default.info('Advanced Risk Engine initialized');
    }
    async calculateComprehensiveRisk(positions, marketData, strategy) {
        const positionRisk = this.calculatePositionRisk(positions, strategy);
        const marketRisk = this.calculateMarketRisk(positions, marketData);
        const correlationRisk = this.calculateCorrelationRisk(positions);
        const liquidityRisk = this.calculateLiquidityRisk(positions, marketData);
        const leverageRisk = this.calculateLeverageRisk(positions);
        const KellyCriterion = await this.calculateKellyCriterion(strategy);
        const overallRisk = Math.max(positionRisk * 0.3, marketRisk * 0.25, correlationRisk * 0.2, liquidityRisk * 0.15, leverageRisk * 0.1);
        const metrics = {
            overallRisk,
            positionRisk,
            marketRisk,
            correlationRisk,
            liquidityRisk,
            leverageRisk,
            KellyCriterion
        };
        this.updateRiskHistory(metrics);
        return metrics;
    }
    calculatePositionRisk(positions, strategy) {
        if (positions.length === 0)
            return 0;
        let totalRisk = 0;
        const maxPositionSize = strategy.riskParameters.maxPositionSize || 0.1;
        for (const position of positions) {
            const sizeRisk = position.size / maxPositionSize;
            const pnlRisk = Math.abs(position.unrealizedPnL || 0) / (position.size * position.entryPrice);
            totalRisk += (sizeRisk + pnlRisk) / 2;
        }
        return Math.min(totalRisk / positions.length, 1);
    }
    calculateMarketRisk(positions, marketData) {
        if (positions.length === 0 || marketData.size === 0)
            return 0.5;
        let volatilitySum = 0;
        let count = 0;
        for (const position of positions) {
            const data = marketData.get(position.symbol);
            if (data) {
                const range = (data.high - data.low) / data.close;
                volatilitySum += range;
                count++;
            }
        }
        return count > 0 ? Math.min(volatilitySum / count * 5, 1) : 0.5;
    }
    calculateCorrelationRisk(positions) {
        if (positions.length < 2)
            return 0;
        const symbolMap = new Map();
        for (const position of positions) {
            symbolMap.set(position.symbol, (symbolMap.get(position.symbol) || 0) + 1);
        }
        const maxExposure = Math.max(...symbolMap.values());
        return maxExposure / positions.length;
    }
    calculateLiquidityRisk(positions, marketData) {
        let liquidityRisk = 0;
        let count = 0;
        for (const position of positions) {
            const data = marketData.get(position.symbol);
            if (data && data.bid && data.ask) {
                const spread = (data.ask - data.bid) / data.close;
                liquidityRisk += Math.min(spread * 100, 1);
                count++;
            }
        }
        return count > 0 ? liquidityRisk / count : 0.5;
    }
    calculateLeverageRisk(positions) {
        if (positions.length === 0)
            return 0;
        let totalLeverage = 0;
        for (const position of positions) {
            totalLeverage += position.leverage || 1;
        }
        const avgLeverage = totalLeverage / positions.length;
        return Math.min(avgLeverage / this.riskThresholds.maxLeverage, 1);
    }
    async calculateKellyCriterion(strategy) {
        try {
            const trades = this.getHistoricalTrades(strategy.id, 100);
            if (trades.length < 10) {
                return {
                    f: 0.1,
                    expectedReturn: 0,
                    winProbability: 0.5,
                    lossProbability: 0.5,
                    averageWin: 0,
                    averageLoss: 0
                };
            }
            const wins = trades.filter(t => t.pnl > 0);
            const losses = trades.filter(t => t.pnl < 0);
            const winProbability = wins.length / trades.length;
            const lossProbability = losses.length / trades.length;
            const averageWin = wins.length > 0
                ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length / (wins[0].price * wins[0].size)
                : 0;
            const averageLoss = losses.length > 0
                ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0)) / losses.length / (losses[0].price * losses[0].size)
                : 0.01;
            const expectedReturn = (winProbability * averageWin) - (lossProbability * averageLoss);
            const f = averageLoss > 0 ? Math.max(0, Math.min(1, expectedReturn / averageLoss)) : 0.1;
            logger_1.default.info(`Kelly Criterion: f=${f.toFixed(4)}, expectedReturn=${expectedReturn.toFixed(4)}, winRate=${(winProbability * 100).toFixed(1)}%`);
            return { f, expectedReturn, winProbability, lossProbability, averageWin, averageLoss };
        }
        catch (error) {
            logger_1.default.error('Error calculating Kelly Criterion:', error);
            return {
                f: 0.1,
                expectedReturn: 0,
                winProbability: 0.5,
                lossProbability: 0.5,
                averageWin: 0,
                averageLoss: 0
            };
        }
    }
    async getGLMRecommendations(riskMetrics, positions) {
        const prompt = `You are a professional risk manager for cryptocurrency trading.

Current Risk Metrics:
- Overall Risk: ${(riskMetrics.overallRisk * 100).toFixed(1)}%
- Position Risk: ${(riskMetrics.positionRisk * 100).toFixed(1)}%
- Market Risk: ${(riskMetrics.marketRisk * 100).toFixed(1)}%
- Correlation Risk: ${(riskMetrics.correlationRisk * 100).toFixed(1)}%
- Liquidity Risk: ${(riskMetrics.liquidityRisk * 100).toFixed(1)}%
- Leverage Risk: ${(riskMetrics.leverageRisk * 100).toFixed(1)}%

Kelly Criterion Analysis:
- Optimal Position Size (f): ${(riskMetrics.KellyCriterion.f * 100).toFixed(1)}%
- Expected Return: ${(riskMetrics.KellyCriterion.expectedReturn * 100).toFixed(2)}%
- Win Probability: ${(riskMetrics.KellyCriterion.winProbability * 100).toFixed(1)}%
- Average Win: ${(riskMetrics.KellyCriterion.averageWin * 100).toFixed(2)}%
- Average Loss: ${(riskMetrics.KellyCriterion.averageLoss * 100).toFixed(2)}%

Current Positions: ${positions.length}

Analyze risk profile and provide:
1. Risk level assessment (HIGH/MODERATE/LOW)
2. 3-5 specific actionable recommendations
3. Any immediate actions needed

Format as JSON with fields: type, level (0-1), message, recommendations[]`;
        try {
            const response = await glm_service_1.default.generateTradingSignal([], []);
            const data = typeof response === 'string' ? JSON.parse(response || '{}') : {};
            return [{
                    type: data.type || 'MODERATE_RISK',
                    level: data.level || riskMetrics.overallRisk,
                    message: data.message || 'Review risk metrics',
                    recommendations: data.recommendations || ['Monitor positions'],
                    timestamp: new Date()
                }];
        }
        catch (error) {
            logger_1.default.error('Error getting GLM risk recommendations:', error);
            return [{
                    type: riskMetrics.overallRisk > 0.7 ? 'HIGH_RISK' : 'MODERATE_RISK',
                    level: riskMetrics.overallRisk,
                    message: 'Unable to get AI recommendations',
                    recommendations: ['Review risk metrics manually'],
                    timestamp: new Date()
                }];
        }
    }
    getHistoricalTrades(strategyId, limit) {
        const stmt = this.db.prepare(`
      SELECT * FROM trades 
      WHERE strategyId = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
        return stmt.all(strategyId, limit);
    }
    updateRiskHistory(metrics) {
        this.riskHistory.push(metrics);
        if (this.riskHistory.length > this.maxHistorySize) {
            this.riskHistory.shift();
        }
    }
    getRiskTrend() {
        if (this.riskHistory.length < 10)
            return 'STABLE';
        const recent = this.riskHistory.slice(-10);
        const firstHalf = recent.slice(0, 5).reduce((sum, m) => sum + m.overallRisk, 0) / 5;
        const secondHalf = recent.slice(5).reduce((sum, m) => sum + m.overallRisk, 0) / 5;
        if (secondHalf > firstHalf * 1.1)
            return 'INCREASING';
        if (secondHalf < firstHalf * 0.9)
            return 'DECREASING';
        return 'STABLE';
    }
    shouldReducePosition(riskMetrics) {
        return riskMetrics.overallRisk > this.riskThresholds.maxOverallRisk ||
            riskMetrics.positionRisk > this.riskThresholds.maxPositionRisk ||
            riskMetrics.leverageRisk > 0.9;
    }
    getRecommendedPositionSize(riskMetrics, availableCapital) {
        const kellyFraction = riskMetrics.KellyCriterion.f;
        const riskAdjusted = kellyFraction * (1 - riskMetrics.overallRisk);
        const maxAllowed = availableCapital * this.riskThresholds.maxPositionSize;
        return Math.min(maxAllowed, availableCapital * riskAdjusted);
    }
    getStopLossLevel(entryPrice, isLong) {
        const threshold = this.riskThresholds.stopLossThreshold;
        if (isLong) {
            return entryPrice * (1 - threshold);
        }
        return entryPrice * (1 + threshold);
    }
    getTakeProfitLevel(entryPrice, isLong) {
        const threshold = this.riskThresholds.takeProfitThreshold;
        if (isLong) {
            return entryPrice * (1 + threshold);
        }
        return entryPrice * (1 - threshold);
    }
    checkDailyLoss(todayPnL, initialCapital) {
        const lossRatio = Math.abs(todayPnL) / initialCapital;
        return lossRatio >= this.riskThresholds.maxDailyLoss;
    }
    updateRiskThresholds(newThresholds) {
        this.riskThresholds = { ...this.riskThresholds, ...newThresholds };
        logger_1.default.info('Risk thresholds updated:', this.riskThresholds);
    }
}
exports.default = new AdvancedRiskEngine();
//# sourceMappingURL=advanced-risk.js.map