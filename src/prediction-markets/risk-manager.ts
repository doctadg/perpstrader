// Comprehensive Risk Manager for Prediction Markets
// Enforces daily loss limits, portfolio heat, correlation checks, and cooldowns

import logger from '../../shared/logger';
import predictionStore from '../../data/prediction-store';
import { 
  PredictionPosition, 
  PredictionTrade, 
  PredictionIdea,
  PredictionRiskAssessment 
} from '../../shared/types';

// Risk Configuration
interface RiskConfig {
  // Daily Loss Limits
  maxDailyLossPct: number;          // Max % of portfolio that can be lost in a day
  maxDailyLossUsd: number;          // Absolute max daily loss in USD
  maxDailyTrades: number;           // Maximum trades per day
  
  // Portfolio Heat
  maxPortfolioHeatPct: number;      // Max % of portfolio in open positions
  maxPositions: number;             // Maximum number of open positions
  maxPositionPct: number;           // Max % of portfolio per position
  
  // Cooldown Periods
  cooldownAfterLossMinutes: number; // Wait time after a losing trade
  cooldownAfterWinMinutes: number;  // Wait time after a winning trade (optional)
  
  // Stop Loss
  stopLossPct: number;              // Stop loss % per position
  trailingStopPct: number;          // Trailing stop % (optional)
  
  // Correlation
  enableCorrelationCheck: boolean;  // Block conflicting bets
  maxCorrelatedPositions: number;   // Max positions on same event/topic
  
  // Slippage
  maxSlippagePct: number;           // Max acceptable slippage
  
  // Market Conditions
  minMarketVolume: number;          // Minimum market volume to trade
  maxMarketAgeDays: number;         // Don't trade markets older than X days
  
  // Emergency Stop
  emergencyStopDailyLoss: number;   // Emergency stop threshold
}

// Risk State Tracking
interface DailyRiskState {
  date: string;
  trades: PredictionTrade[];
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  dailyPnL: number;
  lastTradeTime: number;
  cooldownUntil: number;
  emergencyStopTriggered: boolean;
}

export class RiskManager {
  private config: RiskConfig;
  private dailyState: DailyRiskState;
  private lastReconciliationTime = 0;

  constructor() {
    this.config = this.loadConfig();
    this.dailyState = this.initializeDailyState();
    
    // Reconcile daily at midnight
    this.scheduleDailyReset();
  }

  private loadConfig(): RiskConfig {
    const totalPortfolioValue = this.getPortfolioValue();
    
    return {
      // Daily Loss Limits - Conservative defaults for real money
      maxDailyLossPct: parseFloat(process.env.PREDICTION_MAX_DAILY_LOSS_PCT || '0.02'), // 2%
      maxDailyLossUsd: parseFloat(process.env.PREDICTION_MAX_DAILY_LOSS_USD || '100'),  // $100
      maxDailyTrades: parseInt(process.env.PREDICTION_MAX_DAILY_TRADES || '5'),
      
      // Portfolio Heat
      maxPortfolioHeatPct: parseFloat(process.env.PREDICTION_MAX_PORTFOLIO_HEAT_PCT || '0.30'), // 30%
      maxPositions: parseInt(process.env.PREDICTION_MAX_POSITIONS || '10'),
      maxPositionPct: parseFloat(process.env.PREDICTION_MAX_POSITION_PCT || '0.05'), // 5%
      
      // Cooldown
      cooldownAfterLossMinutes: parseInt(process.env.PREDICTION_COOLDOWN_MINUTES || '30'),
      cooldownAfterWinMinutes: parseInt(process.env.PREDICTION_COOLDOWN_AFTER_WIN_MIN || '5'),
      
      // Stop Loss
      stopLossPct: parseFloat(process.env.PREDICTION_STOP_LOSS_PCT || '0.20'), // 20%
      trailingStopPct: parseFloat(process.env.PREDICTION_TRAILING_STOP_PCT || '0.15'),
      
      // Correlation
      enableCorrelationCheck: process.env.PREDICTION_ENABLE_CORRELATION_CHECK !== 'false',
      maxCorrelatedPositions: parseInt(process.env.PREDICTION_MAX_CORRELATED_POS || '2'),
      
      // Slippage
      maxSlippagePct: parseFloat(process.env.PREDICTION_MAX_SLIPPAGE_PCT || '0.02'), // 2%
      
      // Market Conditions
      minMarketVolume: parseFloat(process.env.PREDICTION_MIN_VOLUME || '10000'),
      maxMarketAgeDays: parseInt(process.env.PREDICTION_MARKET_MAX_AGE_DAYS || '30'),
      
      // Emergency Stop
      emergencyStopDailyLoss: parseFloat(process.env.PREDICTION_EMERGENCY_STOP_LOSS || '0.05'), // 5%
    };
  }

  private getPortfolioValue(): number {
    const portfolio = predictionStore.getPortfolioSnapshot?.() || { totalValue: 10000 };
    return portfolio.totalValue;
  }

  private initializeDailyState(): DailyRiskState {
    const today = new Date().toISOString().split('T')[0];
    
    // Try to load from database if available
    const stored = predictionStore.getDailyRiskState?.(today);
    if (stored) {
      return stored;
    }
    
    return {
      date: today,
      trades: [],
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      dailyPnL: 0,
      lastTradeTime: 0,
      cooldownUntil: 0,
      emergencyStopTriggered: false,
    };
  }

  private scheduleDailyReset(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.dailyState = this.initializeDailyState();
      this.scheduleDailyReset();
      logger.info('[RiskManager] Daily risk state reset');
    }, msUntilMidnight);
  }

  // ========================================================================
  // CORE RISK CHECKS
  // ========================================================================

  /**
   * Comprehensive risk assessment before trade execution
   */
  public assessTrade(
    idea: PredictionIdea,
    portfolioValue: number,
    availableBalance: number,
    currentPositions: PredictionPosition[]
  ): PredictionRiskAssessment {
    const warnings: string[] = [];
    let approved = true;
    
    // 1. Emergency Stop Check
    if (this.dailyState.emergencyStopTriggered) {
      return {
        approved: false,
        suggestedSizeUsd: 0,
        riskScore: 1,
        warnings: ['EMERGENCY STOP triggered - trading halted'],
        maxLossUsd: 0,
      };
    }
    
    // 2. Daily Loss Limit Check
    const dailyLossCheck = this.checkDailyLossLimit(portfolioValue);
    if (!dailyLossCheck.allowed) {
      warnings.push(dailyLossCheck.reason);
      approved = false;
    }
    
    // 3. Daily Trade Count Check
    if (this.dailyState.totalTrades >= this.config.maxDailyTrades) {
      warnings.push(`Daily trade limit reached (${this.config.maxDailyTrades})`);
      approved = false;
    }
    
    // 4. Cooldown Check
    const cooldownCheck = this.checkCooldown();
    if (!cooldownCheck.allowed) {
      warnings.push(cooldownCheck.reason);
      approved = false;
    }
    
    // 5. Portfolio Heat Check
    const heatCheck = this.checkPortfolioHeat(currentPositions, portfolioValue);
    if (!heatCheck.allowed) {
      warnings.push(heatCheck.reason);
      approved = false;
    }
    
    // 6. Position Count Check
    if (currentPositions.length >= this.config.maxPositions) {
      warnings.push(`Max positions reached (${this.config.maxPositions})`);
      approved = false;
    }
    
    // 7. Correlation Check
    if (this.config.enableCorrelationCheck) {
      const correlationCheck = this.checkCorrelation(idea, currentPositions);
      if (!correlationCheck.allowed) {
        warnings.push(correlationCheck.reason);
        approved = false;
      }
    }
    
    // 8. Calculate Position Size
    const positionSize = this.calculatePositionSize(
      idea,
      portfolioValue,
      availableBalance,
      heatCheck.currentHeat
    );
    
    if (positionSize <= 0) {
      warnings.push('Calculated position size is zero or negative');
      approved = false;
    }
    
    // 9. Check available balance
    if (positionSize > availableBalance) {
      warnings.push(`Insufficient balance: need $${positionSize.toFixed(2)}, have $${availableBalance.toFixed(2)}`);
      approved = false;
    }
    
    // Calculate risk score (0-1, higher = more risky)
    const riskScore = this.calculateRiskScore(idea, currentPositions.length);
    
    // Calculate max loss
    const maxLossUsd = positionSize * this.config.stopLossPct;
    
    return {
      approved: approved && positionSize > 0,
      suggestedSizeUsd: positionSize,
      riskScore,
      warnings,
      maxLossUsd,
    };
  }

  private checkDailyLossLimit(portfolioValue: number): { allowed: boolean; reason?: string } {
    const maxDailyLossUsd = Math.min(
      portfolioValue * this.config.maxDailyLossPct,
      this.config.maxDailyLossUsd
    );
    
    // Check if we've exceeded daily loss
    if (this.dailyState.dailyPnL < -maxDailyLossUsd) {
      // Trigger emergency stop if severe
      if (Math.abs(this.dailyState.dailyPnL) > portfolioValue * this.config.emergencyStopDailyLoss) {
        this.dailyState.emergencyStopTriggered = true;
        logger.error(`[RiskManager] EMERGENCY STOP triggered. Daily PnL: $${this.dailyState.dailyPnL.toFixed(2)}`);
      }
      
      return {
        allowed: false,
        reason: `Daily loss limit reached: $${Math.abs(this.dailyState.dailyPnL).toFixed(2)} / $${maxDailyLossUsd.toFixed(2)}`,
      };
    }
    
    return { allowed: true };
  }

  private checkCooldown(): { allowed: boolean; reason?: string } {
    const now = Date.now();
    
    if (now < this.dailyState.cooldownUntil) {
      const minutesRemaining = Math.ceil((this.dailyState.cooldownUntil - now) / 60000);
      return {
        allowed: false,
        reason: `Cooldown period active: ${minutesRemaining} minutes remaining`,
      };
    }
    
    return { allowed: true };
  }

  private checkPortfolioHeat(
    positions: PredictionPosition[],
    portfolioValue: number
  ): { allowed: boolean; currentHeat: number; reason?: string } {
    const positionValue = positions.reduce((sum, pos) => {
      return sum + (pos.shares * pos.lastPrice);
    }, 0);
    
    const currentHeat = positionValue / portfolioValue;
    
    if (currentHeat >= this.config.maxPortfolioHeatPct) {
      return {
        allowed: false,
        currentHeat,
        reason: `Portfolio heat limit reached: ${(currentHeat * 100).toFixed(1)}% / ${(this.config.maxPortfolioHeatPct * 100).toFixed(1)}%`,
      };
    }
    
    return { allowed: true, currentHeat };
  }

  private checkCorrelation(
    idea: PredictionIdea,
    positions: PredictionPosition[]
  ): { allowed: boolean; reason?: string } {
    // Count positions on the same market
    const sameMarketCount = positions.filter(p => p.marketId === idea.marketId).length;
    
    if (sameMarketCount > 0) {
      return {
        allowed: false,
        reason: `Already have position in market: ${idea.marketTitle}`,
      };
    }
    
    // Check for related markets (simple keyword matching)
    const ideaKeywords = idea.marketTitle.toLowerCase().split(' ');
    let correlatedCount = 0;
    
    for (const position of positions) {
      const posKeywords = position.marketTitle.toLowerCase().split(' ');
      const overlap = ideaKeywords.filter(k => posKeywords.includes(k) && k.length > 3);
      
      if (overlap.length >= 2) {
        correlatedCount++;
      }
    }
    
    if (correlatedCount >= this.config.maxCorrelatedPositions) {
      return {
        allowed: false,
        reason: `Max correlated positions reached for this topic`,
      };
    }
    
    return { allowed: true };
  }

  private calculatePositionSize(
    idea: PredictionIdea,
    portfolioValue: number,
    availableBalance: number,
    currentHeat: number
  ): number {
    // Base size: max position % of portfolio
    const maxPositionUsd = portfolioValue * this.config.maxPositionPct;
    
    // Adjust by confidence (higher confidence = larger size, but capped)
    const confidenceMultiplier = 0.5 + (idea.confidence * 0.5); // 0.5x to 1.0x
    
    // Adjust by edge (larger edge = larger size)
    const edgeMultiplier = Math.min(1 + Math.abs(idea.edge) * 2, 1.5); // 1.0x to 1.5x
    
    // Adjust by available heat (less heat available = smaller size)
    const heatRemaining = this.config.maxPortfolioHeatPct - currentHeat;
    const heatMultiplier = Math.max(0.3, heatRemaining / this.config.maxPortfolioHeatPct);
    
    // Calculate final size
    let size = maxPositionUsd * confidenceMultiplier * edgeMultiplier * heatMultiplier;
    
    // Hard cap at available balance
    size = Math.min(size, availableBalance);
    
    // Minimum size check ($5 minimum for real trading)
    const minSize = Math.min(5, availableBalance * 0.01);
    if (size < minSize) {
      return 0;
    }
    
    return Math.floor(size * 100) / 100; // Round to 2 decimals
  }

  private calculateRiskScore(idea: PredictionIdea, positionCount: number): number {
    let score = 0;
    
    // Higher edge = lower risk (up to a point - very high edge is suspicious)
    const edgeRisk = Math.abs(idea.edge - 0.1) * 2; // Optimal edge around 10%
    score += Math.min(edgeRisk, 0.3);
    
    // Lower confidence = higher risk
    score += (1 - idea.confidence) * 0.3;
    
    // More positions = higher portfolio risk
    score += (positionCount / this.config.maxPositions) * 0.2;
    
    // Time to resolution (shorter = higher risk due to less time for edge to play out)
    // This would need market close time data
    
    return Math.min(score, 1);
  }

  // ========================================================================
  // STOP LOSS CHECKS
  // ========================================================================

  /**
   * Check if any positions have hit stop loss
   */
  public checkStopLosses(positions: PredictionPosition[]): Array<{
    position: PredictionPosition;
    exitPrice: number;
    reason: string;
  }> {
    const exits: Array<{
      position: PredictionPosition;
      exitPrice: number;
      reason: string;
    }> = [];
    
    for (const position of positions) {
      const entryPrice = position.averagePrice;
      const currentPrice = position.lastPrice;
      
      // Calculate PnL %
      const pnlPct = (currentPrice - entryPrice) / entryPrice;
      
      // Fixed stop loss
      if (pnlPct < -this.config.stopLossPct) {
        exits.push({
          position,
          exitPrice: currentPrice,
          reason: `Stop loss hit: ${(pnlPct * 100).toFixed(1)}% loss`,
        });
        continue;
      }
      
      // Trailing stop (would need high watermark tracking)
      // This is a simplified version - full implementation would track highs
    }
    
    return exits;
  }

  // ========================================================================
  // TRADE TRACKING
  // ========================================================================

  /**
   * Record a trade for daily tracking
   */
  public recordTrade(trade: PredictionTrade): void {
    this.dailyState.trades.push(trade);
    this.dailyState.totalTrades++;
    this.dailyState.lastTradeTime = Date.now();
    
    // Update PnL
    const tradePnL = trade.pnl || 0;
    this.dailyState.dailyPnL += tradePnL;
    
    if (tradePnL > 0) {
      this.dailyState.winningTrades++;
      // Set cooldown after win (optional, usually shorter)
      this.dailyState.cooldownUntil = Date.now() + (this.config.cooldownAfterWinMinutes * 60000);
    } else if (tradePnL < 0) {
      this.dailyState.losingTrades++;
      // Set cooldown after loss
      this.dailyState.cooldownUntil = Date.now() + (this.config.cooldownAfterLossMinutes * 60000);
      
      logger.warn(
        `[RiskManager] Losing trade recorded: $${tradePnL.toFixed(2)}. ` +
        `Cooldown for ${this.config.cooldownAfterLossMinutes} minutes.`
      );
    }
    
    // Persist to database
    predictionStore.saveDailyRiskState?.(this.dailyState);
    
    // Check for emergency stop
    const portfolioValue = this.getPortfolioValue();
    if (Math.abs(this.dailyState.dailyPnL) > portfolioValue * this.config.emergencyStopDailyLoss) {
      this.dailyState.emergencyStopTriggered = true;
      logger.error(
        `[RiskManager] 🚨 EMERGENCY STOP TRIGGERED 🚨\n` +
        `Daily PnL: $${this.dailyState.dailyPnL.toFixed(2)}\n` +
        `Portfolio: $${portfolioValue.toFixed(2)}\n` +
        `Loss %: ${(Math.abs(this.dailyState.dailyPnL) / portfolioValue * 100).toFixed(2)}%`
      );
    }
  }

  // ========================================================================
  // EMERGENCY CONTROLS
  // ========================================================================

  /**
   * Trigger emergency stop - halt all trading
   */
  public triggerEmergencyStop(reason: string): void {
    this.dailyState.emergencyStopTriggered = true;
    logger.error(`[RiskManager] 🚨 EMERGENCY STOP TRIGGERED: ${reason} 🚨`);
  }

  /**
   * Reset emergency stop - use with caution!
   */
  public resetEmergencyStop(): void {
    this.dailyState.emergencyStopTriggered = false;
    logger.warn('[RiskManager] Emergency stop reset manually');
  }

  /**
   * Check if emergency stop is active
   */
  public isEmergencyStop(): boolean {
    return this.dailyState.emergencyStopTriggered;
  }

  /**
   * Force cooldown period
   */
  public forceCooldown(minutes: number): void {
    this.dailyState.cooldownUntil = Date.now() + (minutes * 60000);
    logger.info(`[RiskManager] Cooldown forced for ${minutes} minutes`);
  }

  // ========================================================================
  // REPORTING
  // ========================================================================

  public getRiskReport(): {
    dailyPnL: number;
    totalTrades: number;
    winRate: number;
    emergencyStop: boolean;
    cooldownRemaining: number;
    dailyLossLimit: number;
    portfolioHeat: number;
    openPositions: number;
    config: RiskConfig;
  } {
    const winRate = this.dailyState.totalTrades > 0
      ? (this.dailyState.winningTrades / this.dailyState.totalTrades) * 100
      : 0;
    
    const cooldownRemaining = Math.max(0, this.dailyState.cooldownUntil - Date.now()) / 60000;
    
    return {
      dailyPnL: this.dailyState.dailyPnL,
      totalTrades: this.dailyState.totalTrades,
      winRate,
      emergencyStop: this.dailyState.emergencyStopTriggered,
      cooldownRemaining,
      dailyLossLimit: this.config.maxDailyLossUsd,
      portfolioHeat: 0, // Would need current positions
      openPositions: 0, // Would need current positions
      config: this.config,
    };
  }

  public getDailyState(): DailyRiskState {
    return { ...this.dailyState };
  }
}

// Singleton instance
const riskManager = new RiskManager();
export default riskManager;
