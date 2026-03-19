import { RiskAssessment, TradingSignal, Portfolio, Position, Strategy } from '../shared/types';
export declare class RiskManager {
    private maxPositionSize;
    private maxDailyLoss;
    private maxLeverage;
    private readonly HARD_CAP_MAX_LOSS_PERCENT;
    private readonly MIN_STOP_LOSS_PCT;
    private readonly DEFAULT_STOP_LOSS_PCT;
    private readonly MIN_RISK_REWARD_RATIO;
    private readonly DAILY_LOSS_CIRCUIT_BREAKER_USD;
    private readonly DAILY_LOSS_ALERT_1_USD;
    private readonly DAILY_LOSS_ALERT_2_USD;
    private readonly REVENGE_COOLDOWN_MS;
    private emergencyStopActive;
    private emergencyStopReason;
    private dailyPnL;
    private consecutiveLosses;
    private lastResetDate;
    private cooldownUntil;
    private dailyLossAlert40Triggered;
    private dailyLossAlert45Triggered;
    private positionPeakPnL;
    private trailingStopPct;
    private trailingStopActivationPct;
    private trailingStopMinProfitLockPct;
    private breakevenActivationPct;
    private positionOpenTimes;
    private positionHardStops;
    private positionTrailingStopFloors;
    constructor();
    evaluateSignal(signal: TradingSignal, portfolio: Portfolio): Promise<RiskAssessment>;
    private calculatePositionSize;
    private getCurrentExposure;
    private calculateRiskScore;
    private generateWarnings;
    private normalizeStopLossPct;
    private enforceMinimumRiskReward;
    private setOrTightenHardStop;
    private getOrInitializeHardStop;
    private updatePositionPeakPnL;
    private getOrTightenTrailingStopFloor;
    private calculateStopLossAndTakeProfit;
    private getRequiredRiskRewardRatio;
    private logRiskRewardCalculation;
    private isCooldownActive;
    private getCooldownRemainingMs;
    private trackTradeResult;
    private updateTradeResult;
    checkPositionRisk(position: Position, portfolio: Portfolio): Promise<RiskAssessment>;
    /**
     * Check if a position should be closed due to trailing stop
     * Returns true if position should be closed
     */
    shouldClosePosition(position: Position): boolean;
    /**
     * Register a new position open time for holding limit tracking
     */
    registerPositionOpen(symbol: string, side: string, stopLossPct?: number): void;
    /**
     * Clear position tracking when position is closed
     */
    clearPositionTracking(symbol: string, side: string): void;
    validateStrategy(strategy: Strategy): Promise<boolean>;
    updateDailyPnL(pnl: number): void;
    private resetDailyPnLIfNeeded;
    activateEmergencyStop(): Promise<void>;
    disableEmergencyStop(): void;
    private logDailyLossApproachAlerts;
    private forceCloseAllPositions;
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
    calculatePortfolioRisk(portfolio: Portfolio): {
        totalRisk: number;
        concentrationRisk: number;
        leverageRisk: number;
        liquidityRisk: number;
    };
}
declare const _default: RiskManager;
export default _default;
//# sourceMappingURL=risk-manager.d.ts.map