/**
 * Optimized Risk Manager
 * Performance improvements:
 * - Caching of risk calculations
 * - Batch risk assessments
 * - Portfolio risk memoization
 * - Efficient position tracking
 */
import { RiskAssessment, TradingSignal, Portfolio, Position, Strategy } from '../shared/types';
export declare class OptimizedRiskManager {
    private maxPositionSize;
    private maxDailyLoss;
    private maxLeverage;
    private emergencyStopActive;
    private dailyPnL;
    private lastResetDate;
    private positionPeakPnL;
    private trailingStopPct;
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
    /**
     * Batch evaluate multiple signals
     */
    evaluateSignals(signals: TradingSignal[], portfolio: Portfolio): Promise<RiskAssessment[]>;
    /**
     * Create a rejected assessment
     */
    private createRejectedAssessment;
    /**
     * Hash a signal for cache key
     */
    private hashSignal;
    /**
     * Set risk cache with size limit
     */
    private setRiskCache;
    private calculatePositionSize;
    private getCurrentExposure;
    private calculateRiskScore;
    private generateWarnings;
    private calculateStopLossAndTakeProfit;
    /**
     * Check position risk with caching
     */
    checkPositionRisk(position: Position, portfolio: Portfolio): Promise<RiskAssessment>;
    /**
     * Batch check position risks
     */
    checkPositionsRisk(positions: Position[], portfolio: Portfolio): Promise<RiskAssessment[]>;
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
    /**
     * Calculate portfolio risk with caching
     */
    calculatePortfolioRisk(portfolio: Portfolio): {
        totalRisk: number;
        concentrationRisk: number;
        leverageRisk: number;
        liquidityRisk: number;
    };
    private hashPortfolio;
    /**
     * Clear all caches
     */
    clearCaches(): void;
    /**
     * Get cache stats
     */
    getCacheStats(): {
        riskCacheSize: number;
        positionRiskCacheSize: number;
        portfolioCacheValid: boolean;
    };
}
declare const optimizedRiskManager: OptimizedRiskManager;
export default optimizedRiskManager;
//# sourceMappingURL=risk-manager-optimized.d.ts.map