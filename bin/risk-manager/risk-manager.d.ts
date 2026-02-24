import { RiskAssessment, TradingSignal, Portfolio, Position, Strategy } from '../shared/types';
export declare class RiskManager {
    private maxPositionSize;
    private maxDailyLoss;
    private maxLeverage;
    private emergencyStopActive;
    private emergencyStopReason;
    private dailyPnL;
    private consecutiveLosses;
    private lastResetDate;
    private circuitBreakerLoss;
    private positionPeakPnL;
    private trailingStopPct;
    private trailingStopActivationPct;
    private positionOpenTimes;
    constructor();
    evaluateSignal(signal: TradingSignal, portfolio: Portfolio): Promise<RiskAssessment>;
    private calculatePositionSize;
    private getCurrentExposure;
    private calculateRiskScore;
    private generateWarnings;
    private calculateStopLossAndTakeProfit;
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
    registerPositionOpen(symbol: string, side: string): void;
    /**
     * Clear position tracking when position is closed
     */
    clearPositionTracking(symbol: string, side: string): void;
    validateStrategy(strategy: Strategy): Promise<boolean>;
    updateDailyPnL(pnl: number): void;
    private resetDailyPnLIfNeeded;
    activateEmergencyStop(): Promise<void>;
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