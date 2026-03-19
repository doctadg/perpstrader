/**
 * Optimized Risk Manager
 * Performance improvements:
 * - Caching of risk calculations
 * - Batch risk assessments
 * - Portfolio risk memoization
 * - Efficient position tracking
 *
 * CRITICAL SAFETY FIXES:
 * - Hard stops per position that NEVER widen (suicide prevention)
 * - Circuit breaker at $30 daily loss (halt new positions)
 * - Consecutive loss cooldown (revenge prevention)
 * - Trailing take-profit to lock gains
 * - Breakeven stop after meaningful moves
 * - Time-based stops for losing positions
 */
import { RiskAssessment, TradingSignal, Portfolio, Position, Strategy } from '../shared/types';
export declare class OptimizedRiskManager {
    private maxPositionSize;
    private maxDailyLoss;
    private maxLeverage;
    private emergencyStopActive;
    private emergencyStopReason;
    private dailyPnL;
    private lastResetDate;
    private consecutiveLosses;
    private cooldownUntil;
    private dailyLossAlert20Triggered;
    private dailyLossAlert25Triggered;
    private positionHardStops;
    private positionPeakPnL;
    private positionTrailingStopFloors;
    private positionOpenTimes;
    private readonly MIN_STOP_LOSS_PCT;
    private readonly DEFAULT_STOP_LOSS_PCT;
    private readonly MIN_RISK_REWARD_RATIO;
    private readonly HARD_CAP_MAX_LOSS_PERCENT;
    private readonly DAILY_LOSS_CIRCUIT_BREAKER_USD;
    private readonly DAILY_LOSS_ALERT_1_USD;
    private readonly DAILY_LOSS_ALERT_2_USD;
    private readonly REVENGE_COOLDOWN_MS;
    private trailingStopPct;
    private trailingStopActivationPct;
    private trailingStopMinProfitLockPct;
    private breakevenActivationPct;
    private riskCache;
    private portfolioRiskCache;
    private positionRiskCache;
    private readonly RISK_CACHE_TTL_MS;
    private readonly PORTFOLIO_RISK_CACHE_TTL_MS;
    private readonly POSITION_RISK_CACHE_TTL_MS;
    private readonly MAX_CACHE_ENTRIES;
    constructor();
    /**
     * Evaluate signal risk with caching
     */
    evaluateSignal(signal: TradingSignal, portfolio: Portfolio): Promise<RiskAssessment>;
    evaluateSignals(signals: TradingSignal[], portfolio: Portfolio): Promise<RiskAssessment[]>;
    private createRejectedAssessment;
    private hashSignal;
    private setRiskCache;
    private calculatePositionSize;
    private getCurrentExposure;
    private calculateRiskScore;
    private generateWarnings;
    private normalizeStopLossPct;
    private setOrTightenHardStop;
    private getOrInitializeHardStop;
    private updatePositionPeakPnL;
    private getOrTightenTrailingStopFloor;
    private calculateStopLossAndTakeProfit;
    private getRequiredRiskRewardRatio;
    /**
     * Check position risk with caching
     */
    checkPositionRisk(position: Position, portfolio: Portfolio): Promise<RiskAssessment>;
    checkPositionsRisk(positions: Position[], portfolio: Portfolio): Promise<RiskAssessment[]>;
    /**
     * Check if a position should be closed due to any stop mechanism
     */
    shouldClosePosition(position: Position): boolean;
    /**
     * Register a new position open for tracking
     */
    registerPositionOpen(symbol: string, side: string, stopLossPct?: number): void;
    /**
     * Clear position tracking when closed
     */
    clearPositionTracking(symbol: string, side: string): void;
    private isCooldownActive;
    private getCooldownRemainingMs;
    private trackTradeResult;
    updateDailyPnL(pnl: number): void;
    private resetDailyPnLIfNeeded;
    private logDailyLossApproachAlerts;
    activateEmergencyStop(): Promise<void>;
    private forceCloseAllPositions;
    disableEmergencyStop(): void;
    getRiskMetrics(): {
        dailyPnL: number;
        maxDailyLoss: number;
        emergencyStop: boolean;
        riskUtilization: number;
    };
    updateRiskParameters(parameters: {
        maxPositionSize?: number;
        maxDailyLoss?: number;
        maxLeverage?: number;
    }): void;
    isWithinLimits(positionSize: number, leverage: number): boolean;
    validateStrategy(strategy: Strategy): Promise<boolean>;
    calculatePortfolioRisk(portfolio: Portfolio): {
        totalRisk: number;
        concentrationRisk: number;
        leverageRisk: number;
        liquidityRisk: number;
    };
    private hashPortfolio;
    clearCaches(): void;
    getCacheStats(): {
        riskCacheSize: number;
        positionRiskCacheSize: number;
        portfolioCacheValid: boolean;
    };
}
declare const optimizedRiskManager: OptimizedRiskManager;
export default optimizedRiskManager;
//# sourceMappingURL=risk-manager-optimized.d.ts.map