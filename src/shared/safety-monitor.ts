import logger from './logger';

export class SafetyMonitor {
  private dailyLoss = 0;
  private dailyTrades = 0;
  private consecutiveLosses = 0;
  private lastReset = Date.now();
  private peakBalance = 0;
  private emergencyStop = false;
  private stopReason = '';
  
  // Limits
  private readonly MAX_DAILY_LOSS = 50; // $50
  private readonly MAX_DAILY_TRADES = 20;
  private readonly MAX_CONSECUTIVE_LOSSES = 5;
  private readonly MAX_DRAWDOWN_PCT = 0.15; // 15%
  
  recordTrade(pnl: number, balance: number) {
    this.checkNewDay();
    this.dailyTrades++;
    this.dailyLoss += pnl;
    
    if (pnl < 0) this.consecutiveLosses++;
    else this.consecutiveLosses = 0;
    
    if (balance > this.peakBalance) this.peakBalance = balance;
    
    this.checkLimits(balance);
  }
  
  private checkLimits(balance: number) {
    // Daily loss
    if (this.dailyLoss < -this.MAX_DAILY_LOSS) {
      this.emergencyStop = true;
      this.stopReason = `Daily loss limit exceeded: $${this.dailyLoss.toFixed(2)}`;
      logger.error(`🛑 CIRCUIT BREAKER: ${this.stopReason}`);
    }
    
    // Trade limit
    if (this.dailyTrades > this.MAX_DAILY_TRADES) {
      this.emergencyStop = true;
      this.stopReason = `Daily trade limit exceeded: ${this.dailyTrades}`;
      logger.error(`🛑 CIRCUIT BREAKER: ${this.stopReason}`);
    }
    
    // Consecutive losses
    if (this.consecutiveLosses >= this.MAX_CONSECUTIVE_LOSSES) {
      this.emergencyStop = true;
      this.stopReason = `Consecutive loss limit: ${this.consecutiveLosses}`;
      logger.error(`🛑 CIRCUIT BREAKER: ${this.stopReason}`);
    }
    
    // Drawdown
    const drawdown = (this.peakBalance - balance) / this.peakBalance;
    if (drawdown > this.MAX_DRAWDOWN_PCT) {
      this.emergencyStop = true;
      this.stopReason = `Max drawdown exceeded: ${(drawdown * 100).toFixed(1)}%`;
      logger.error(`🛑 CIRCUIT BREAKER: ${this.stopReason}`);
    }
  }
  
  canTrade(): boolean {
    this.checkNewDay();
    return !this.emergencyStop;
  }
  
  getStatus() {
    return {
      dailyLoss: this.dailyLoss,
      dailyTrades: this.dailyTrades,
      consecutiveLosses: this.consecutiveLosses,
      emergencyStop: this.emergencyStop,
      stopReason: this.stopReason
    };
  }
  
  reset() {
    this.emergencyStop = false;
    this.stopReason = '';
    this.dailyLoss = 0;
    this.dailyTrades = 0;
    this.consecutiveLosses = 0;
    logger.info('Safety monitor reset');
  }
  
  private checkNewDay() {
    const now = Date.now();
    if (now - this.lastReset > 24 * 60 * 60 * 1000) {
      this.dailyLoss = 0;
      this.dailyTrades = 0;
      this.lastReset = now;
      logger.info('Daily counters reset');
    }
  }
}

export const safetyMonitor = new SafetyMonitor();
