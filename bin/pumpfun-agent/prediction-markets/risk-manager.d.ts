import { PredictionPosition, PredictionTrade, PredictionIdea, PredictionRiskAssessment } from '../../shared/types';
interface RiskConfig {
    maxDailyLossPct: number;
    maxDailyLossUsd: number;
    maxDailyTrades: number;
    maxPortfolioHeatPct: number;
    maxPositions: number;
    maxPositionPct: number;
    cooldownAfterLossMinutes: number;
    cooldownAfterWinMinutes: number;
    stopLossPct: number;
    trailingStopPct: number;
    enableCorrelationCheck: boolean;
    maxCorrelatedPositions: number;
    maxSlippagePct: number;
    minMarketVolume: number;
    maxMarketAgeDays: number;
    emergencyStopDailyLoss: number;
}
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
export declare class RiskManager {
    private config;
    private dailyState;
    private lastReconciliationTime;
    constructor();
    private loadConfig;
    private getPortfolioValue;
    private initializeDailyState;
    private scheduleDailyReset;
    /**
     * Comprehensive risk assessment before trade execution
     */
    assessTrade(idea: PredictionIdea, portfolioValue: number, availableBalance: number, currentPositions: PredictionPosition[]): PredictionRiskAssessment;
    private checkDailyLossLimit;
    private checkCooldown;
    private checkPortfolioHeat;
    private checkCorrelation;
    private calculatePositionSize;
    private calculateRiskScore;
    /**
     * Check if any positions have hit stop loss
     */
    checkStopLosses(positions: PredictionPosition[]): Array<{
        position: PredictionPosition;
        exitPrice: number;
        reason: string;
    }>;
    /**
     * Record a trade for daily tracking
     */
    recordTrade(trade: PredictionTrade): void;
    /**
     * Trigger emergency stop - halt all trading
     */
    triggerEmergencyStop(reason: string): void;
    /**
     * Reset emergency stop - use with caution!
     */
    resetEmergencyStop(): void;
    /**
     * Check if emergency stop is active
     */
    isEmergencyStop(): boolean;
    /**
     * Force cooldown period
     */
    forceCooldown(minutes: number): void;
    getRiskReport(): {
        dailyPnL: number;
        totalTrades: number;
        winRate: number;
        emergencyStop: boolean;
        cooldownRemaining: number;
        dailyLossLimit: number;
        portfolioHeat: number;
        openPositions: number;
        config: RiskConfig;
    };
    getDailyState(): DailyRiskState;
}
declare const riskManager: RiskManager;
export default riskManager;
//# sourceMappingURL=risk-manager.d.ts.map