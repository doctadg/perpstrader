import * as dotenv from 'dotenv';
import glmService from '../shared/glm-service';
import { Trade, MarketData, Strategy, Position } from '../shared/types';
import logger from '../shared/logger';
import Database from 'better-sqlite3';

dotenv.config();

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

class AdvancedRiskEngine {
  private db: Database.Database;
  private riskThresholds: RiskThresholds;
  private riskHistory: RiskMetrics[] = [];
  private maxHistorySize = 100;
  private readonly HARD_DAILY_LOSS_LIMIT_USD = 50;
  private readonly DAILY_LOSS_ALERT_1_USD = 40;
  private readonly DAILY_LOSS_ALERT_2_USD = 45;
  private dailyLossAlert40Triggered = false;
  private dailyLossAlert45Triggered = false;

  constructor() {
    this.db = new Database(process.env.DB_PATH || './data/trading.db');

    this.riskThresholds = {
      maxOverallRisk: 0.7,
      maxPositionRisk: 0.5,
      maxLeverage: 20,  // CRITICAL FIX: Reduced from 40x to 20x max leverage
      maxCorrelation: 0.8,
      maxDailyLoss: this.HARD_DAILY_LOSS_LIMIT_USD,  // absolute dollar breaker
      stopLossThreshold: 0.008,  // 0.8% stop
      takeProfitThreshold: 0.032,  // 3.2% target (1:4 baseline R:R)
      maxPositionSize: 0.18
    };

    logger.info('Advanced Risk Engine initialized');
  }

  async calculateComprehensiveRisk(
    positions: Position[],
    marketData: Map<string, MarketData>,
    strategy: Strategy
  ): Promise<RiskMetrics> {
    const positionRisk = this.calculatePositionRisk(positions, strategy);
    const marketRisk = this.calculateMarketRisk(positions, marketData);
    const correlationRisk = this.calculateCorrelationRisk(positions);
    const liquidityRisk = this.calculateLiquidityRisk(positions, marketData);
    const leverageRisk = this.calculateLeverageRisk(positions);

    const KellyCriterion = await this.calculateKellyCriterion(strategy);

    const overallRisk = Math.max(
      positionRisk * 0.3,
      marketRisk * 0.25,
      correlationRisk * 0.2,
      liquidityRisk * 0.15,
      leverageRisk * 0.1
    );

    const metrics: RiskMetrics = {
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

  private calculatePositionRisk(positions: Position[], strategy: Strategy): number {
    if (positions.length === 0) return 0;

    let totalRisk = 0;
    const maxPositionSize = strategy.riskParameters.maxPositionSize || 0.1;

    for (const position of positions) {
      const sizeRisk = position.size / maxPositionSize;
      const pnlRisk = Math.abs(position.unrealizedPnL || 0) / (position.size * position.entryPrice);
      totalRisk += (sizeRisk + pnlRisk) / 2;
    }

    return Math.min(totalRisk / positions.length, 1);
  }

  private calculateMarketRisk(positions: Position[], marketData: Map<string, MarketData>): number {
    if (positions.length === 0 || marketData.size === 0) return 0.5;

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

  private calculateCorrelationRisk(positions: Position[]): number {
    if (positions.length < 2) return 0;

    const symbolMap = new Map<string, number>();
    for (const position of positions) {
      symbolMap.set(position.symbol, (symbolMap.get(position.symbol) || 0) + 1);
    }

    const maxExposure = Math.max(...symbolMap.values());
    return maxExposure / positions.length;
  }

  private calculateLiquidityRisk(positions: Position[], marketData: Map<string, MarketData>): number {
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

  private calculateLeverageRisk(positions: Position[]): number {
    if (positions.length === 0) return 0;

    let totalLeverage = 0;
    for (const position of positions) {
      totalLeverage += position.leverage || 1;
    }

    const avgLeverage = totalLeverage / positions.length;
    return Math.min(avgLeverage / this.riskThresholds.maxLeverage, 1);
  }

  async calculateKellyCriterion(strategy: Strategy): Promise<RiskMetrics['KellyCriterion']> {
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
        ? wins.reduce((sum, t) => {
          const notional = Math.max(Math.abs((t.price || 0) * (t.size || 0)), Number.EPSILON);
          return sum + ((t.pnl || 0) / notional);
        }, 0) / wins.length
        : 0;
      const averageLoss = losses.length > 0
        ? Math.abs(losses.reduce((sum, t) => {
          const notional = Math.max(Math.abs((t.price || 0) * (t.size || 0)), Number.EPSILON);
          return sum + ((t.pnl || 0) / notional);
        }, 0) / losses.length)
        : 0.01;

      const expectedReturn = (winProbability * averageWin) - (lossProbability * averageLoss);
      const f = averageLoss > 0 ? Math.max(0, Math.min(1, expectedReturn / averageLoss)) : 0.1;

      logger.info(`Kelly Criterion: f=${f.toFixed(4)}, expectedReturn=${expectedReturn.toFixed(4)}, winRate=${(winProbability * 100).toFixed(1)}%`);

      return { f, expectedReturn, winProbability, lossProbability, averageWin, averageLoss };
    } catch (error) {
      logger.error('Error calculating Kelly Criterion:', error);
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

  async getGLMRecommendations(riskMetrics: RiskMetrics, positions: Position[]): Promise<RiskAlert[]> {
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
      const response = await glmService.generateTradingSignal([], []);
      const data = typeof response === 'string' ? JSON.parse(response || '{}') : {};

      return [{
        type: data.type || 'MODERATE_RISK',
        level: data.level || riskMetrics.overallRisk,
        message: data.message || 'Review risk metrics',
        recommendations: data.recommendations || ['Monitor positions'],
        timestamp: new Date()
      }];
    } catch (error) {
      logger.error('Error getting GLM risk recommendations:', error);
      return [{
        type: riskMetrics.overallRisk > 0.7 ? 'HIGH_RISK' : 'MODERATE_RISK',
        level: riskMetrics.overallRisk,
        message: 'Unable to get AI recommendations',
        recommendations: ['Review risk metrics manually'],
        timestamp: new Date()
      }];
    }
  }

  private getHistoricalTrades(strategyId: string, limit: number): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM trades 
      WHERE strategyId = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    return stmt.all(strategyId, limit);
  }

  private updateRiskHistory(metrics: RiskMetrics): void {
    this.riskHistory.push(metrics);
    if (this.riskHistory.length > this.maxHistorySize) {
      this.riskHistory.shift();
    }
  }

  getRiskTrend(): 'INCREASING' | 'STABLE' | 'DECREASING' {
    if (this.riskHistory.length < 10) return 'STABLE';

    const recent = this.riskHistory.slice(-10);
    const firstHalf = recent.slice(0, 5).reduce((sum, m) => sum + m.overallRisk, 0) / 5;
    const secondHalf = recent.slice(5).reduce((sum, m) => sum + m.overallRisk, 0) / 5;

    if (secondHalf > firstHalf * 1.1) return 'INCREASING';
    if (secondHalf < firstHalf * 0.9) return 'DECREASING';
    return 'STABLE';
  }

  shouldReducePosition(riskMetrics: RiskMetrics): boolean {
    return riskMetrics.overallRisk > this.riskThresholds.maxOverallRisk ||
      riskMetrics.positionRisk > this.riskThresholds.maxPositionRisk ||
      riskMetrics.leverageRisk > 0.9;
  }

  getRecommendedPositionSize(riskMetrics: RiskMetrics, availableCapital: number): number {
    const kellyFraction = riskMetrics.KellyCriterion.f;
    const payoffRatio = riskMetrics.KellyCriterion.averageLoss > 0
      ? riskMetrics.KellyCriterion.averageWin / riskMetrics.KellyCriterion.averageLoss
      : 0;
    const payoffAdjustment = Math.max(0.25, Math.min(1, payoffRatio / 2));
    const riskAdjusted = kellyFraction * (1 - riskMetrics.overallRisk) * payoffAdjustment;
    const maxAllowed = availableCapital * this.riskThresholds.maxPositionSize;

    return Math.max(0, Math.min(maxAllowed, availableCapital * riskAdjusted));
  }

  private getRequiredRiskRewardRatio(confidence: number = 0.5): number {
    if (confidence < 0.45) {
      return 5.0;
    }
    if (confidence < 0.60) {
      return 4.0;
    }
    return 3.0;
  }

  private resolveRiskRewardThresholds(confidence: number = 0.5): {
    stopLossThreshold: number;
    takeProfitThreshold: number;
    actualRatio: number;
    requiredRatio: number;
  } {
    let stopLossThreshold = this.riskThresholds.stopLossThreshold;
    let takeProfitThreshold = this.riskThresholds.takeProfitThreshold;
    const requiredRatio = this.getRequiredRiskRewardRatio(confidence);

    if (confidence < 0.5) {
      stopLossThreshold = Math.min(stopLossThreshold, 0.0075); // tighten for low-confidence setups
    }

    const minTakeProfitThreshold = stopLossThreshold * requiredRatio;
    if (takeProfitThreshold < minTakeProfitThreshold) {
      takeProfitThreshold = minTakeProfitThreshold;
    }

    const actualRatio = takeProfitThreshold / Math.max(stopLossThreshold, Number.EPSILON);
    logger.info(
      `[AdvancedRisk][RR] confidence=${confidence.toFixed(2)} stop=${(stopLossThreshold * 100).toFixed(2)}% ` +
      `target=${(takeProfitThreshold * 100).toFixed(2)}% actual=1:${actualRatio.toFixed(2)} required=1:${requiredRatio.toFixed(2)}`
    );

    return { stopLossThreshold, takeProfitThreshold, actualRatio, requiredRatio };
  }

  getStopLossLevel(entryPrice: number, isLong: boolean, confidence: number = 0.5): number {
    const { stopLossThreshold } = this.resolveRiskRewardThresholds(confidence);
    if (isLong) {
      return entryPrice * (1 - stopLossThreshold);
    }
    return entryPrice * (1 + stopLossThreshold);
  }

  getTakeProfitLevel(entryPrice: number, isLong: boolean, confidence: number = 0.5): number {
    const { takeProfitThreshold } = this.resolveRiskRewardThresholds(confidence);
    if (isLong) {
      return entryPrice * (1 + takeProfitThreshold);
    }
    return entryPrice * (1 - takeProfitThreshold);
  }

  checkDailyLoss(todayPnL: number, _initialCapital: number): boolean {
    if (todayPnL <= -this.DAILY_LOSS_ALERT_1_USD && !this.dailyLossAlert40Triggered) {
      this.dailyLossAlert40Triggered = true;
      logger.error(
        `CRITICAL: Approaching daily loss breaker: PnL=$${todayPnL.toFixed(2)} (threshold -$${this.DAILY_LOSS_ALERT_1_USD.toFixed(2)})`
      );
    }

    if (todayPnL <= -this.DAILY_LOSS_ALERT_2_USD && !this.dailyLossAlert45Triggered) {
      this.dailyLossAlert45Triggered = true;
      logger.error(
        `CRITICAL: Approaching daily loss breaker: PnL=$${todayPnL.toFixed(2)} (threshold -$${this.DAILY_LOSS_ALERT_2_USD.toFixed(2)})`
      );
    }

    if (todayPnL <= -this.HARD_DAILY_LOSS_LIMIT_USD) {
      logger.error(
        `CRITICAL: Circuit breaker triggered: PnL=$${todayPnL.toFixed(2)} <= -$${this.HARD_DAILY_LOSS_LIMIT_USD.toFixed(2)}`
      );
      return true;
    }

    return false;
  }

  updateRiskThresholds(newThresholds: Partial<RiskThresholds>): void {
    this.riskThresholds = { ...this.riskThresholds, ...newThresholds };
    logger.info('Risk thresholds updated:', this.riskThresholds);
  }
}

export default new AdvancedRiskEngine();
