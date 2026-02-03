import { RiskAssessment, TradingSignal, Portfolio, Position, Strategy } from '../shared/types';
export declare class RiskManager {
    private maxPositionSize;
    private maxDailyLoss;
    private maxLeverage;
    private emergencyStopActive;
    private dailyPnL;
    private lastResetDate;
    private positionPeakPnL;
    private trailingStopPct;
    constructor();
    evaluateSignal(signal: TradingSignal, portfolio: Portfolio): Promise<RiskAssessment>;
    private calculatePositionSize;
    private getCurrentExposure;
    private calculateRiskScore;
    private generateWarnings;
    private calculateStopLossAndTakeProfit;
    checkPositionRisk(position: Position, portfolio: Portfolio): Promise<RiskAssessment>;
    /**
     * Check if a position should be closed due to trailing stop
     * Returns true if position should be closed
     */
    shouldClosePosition(position: Position): boolean;
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