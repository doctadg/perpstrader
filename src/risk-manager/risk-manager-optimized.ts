/**
 * Optimized Risk Manager
 * Performance improvements:
 * - Caching of risk calculations
 * - Batch risk assessments
 * - Portfolio risk memoization
 * - Efficient position tracking
 */

import { RiskAssessment, TradingSignal, Portfolio, Position, Strategy } from '../shared/types';
import config from '../shared/config';
import logger from '../shared/logger';

interface CachedRiskAssessment {
    assessment: RiskAssessment;
    timestamp: number;
    signalHash: string;
}

interface PortfolioRiskCache {
    risk: {
        totalRisk: number;
        concentrationRisk: number;
        leverageRisk: number;
        liquidityRisk: number;
    };
    timestamp: number;
    portfolioHash: string;
}

export class OptimizedRiskManager {
    private maxPositionSize: number;
    private maxDailyLoss: number;
    private maxLeverage: number;
    private emergencyStopActive: boolean = false;
    private dailyPnL: number;
    private lastResetDate: Date;
    private positionPeakPnL: Map<string, number> = new Map();
    private readonly MIN_STOP_LOSS_PCT: number = 0.006;
    private readonly DEFAULT_STOP_LOSS_PCT: number = 0.008;
    private readonly MIN_RISK_REWARD_RATIO: number = 3.0;
    private trailingStopPct: number = 0.45;
    private trailingStopActivationPct: number = 0.025;
    private trailingStopMinProfitLockPct: number = 0.012;
    
    // Caches
    private riskCache: Map<string, CachedRiskAssessment> = new Map();
    private portfolioRiskCache: PortfolioRiskCache | null = null;
    private positionRiskCache: Map<string, { assessment: RiskAssessment; timestamp: number }> = new Map();
    
    // Cache TTLs
    private readonly RISK_CACHE_TTL_MS = 1000; // 1 second
    private readonly PORTFOLIO_RISK_CACHE_TTL_MS = 5000; // 5 seconds
    private readonly POSITION_RISK_CACHE_TTL_MS = 2000; // 2 seconds
    
    // Cache size limits
    private readonly MAX_CACHE_ENTRIES = 1000;

    constructor() {
        const riskConfig = config.getSection('risk');
        this.maxPositionSize = riskConfig.maxPositionSize;
        this.maxDailyLoss = riskConfig.maxDailyLoss;
        this.maxLeverage = riskConfig.maxLeverage;
        this.emergencyStopActive = riskConfig.emergencyStop;
        this.dailyPnL = 0;
        this.lastResetDate = new Date();
    }

    /**
     * Evaluate signal risk with caching
     */
    async evaluateSignal(signal: TradingSignal, portfolio: Portfolio): Promise<RiskAssessment> {
        try {
            this.resetDailyPnLIfNeeded();

            // Check emergency stop
            if (this.emergencyStopActive) {
                return this.createRejectedAssessment(['Emergency stop is active']);
            }

            // Check daily loss limit
            if (this.dailyPnL < -this.maxDailyLoss) {
                return this.createRejectedAssessment([`Daily loss limit exceeded: ${this.dailyPnL.toFixed(2)}`]);
            }

            // Check cache
            const signalHash = this.hashSignal(signal);
            const cacheKey = `${signalHash}_${portfolio.totalValue.toFixed(2)}`;
            const cached = this.riskCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.RISK_CACHE_TTL_MS) {
                logger.debug(`[RiskManager] Cache hit for signal ${signal.id}`);
                return cached.assessment;
            }

            // Calculate fresh assessment
            const suggestedSize = this.calculatePositionSize(signal, portfolio);
            const riskScore = this.calculateRiskScore(signal, portfolio, suggestedSize);
            const warnings = this.generateWarnings(signal, portfolio, riskScore);
            // FIXED: Allow signals even with small portfolio - check if portfolio has value first
            const hasPortfolioValue = portfolio.totalValue > 100; // Minimum $100 to trade
            const approved = hasPortfolioValue && riskScore < 0.8 && this.dailyPnL > -this.maxDailyLoss;
            const { stopLoss, takeProfit } = this.calculateStopLossAndTakeProfit(signal, portfolio);
            const riskRewardRatio = stopLoss > 0 ? takeProfit / stopLoss : 0;
            if (riskRewardRatio < this.MIN_RISK_REWARD_RATIO) {
                warnings.push(
                    `Trade rejected: R:R 1:${riskRewardRatio.toFixed(2)} below required 1:${this.MIN_RISK_REWARD_RATIO.toFixed(2)}`
                );
                return this.createRejectedAssessment(warnings, stopLoss, takeProfit);
            }
            
            if (!hasPortfolioValue) {
                warnings.push('Portfolio value too low for position sizing');
            }

            const assessment: RiskAssessment = {
                approved,
                suggestedSize,
                riskScore,
                warnings,
                stopLoss,
                takeProfit,
                leverage: this.maxLeverage
            };

            // Cache result
            this.setRiskCache(cacheKey, { assessment, timestamp: Date.now(), signalHash });

            logger.info(`[RiskManager] Risk assessment for ${signal.symbol}: score=${riskScore.toFixed(2)}, approved=${approved}`);
            return assessment;

        } catch (error) {
            logger.error('Risk assessment failed:', error);
            throw error;
        }
    }

    /**
     * Batch evaluate multiple signals
     */
    async evaluateSignals(signals: TradingSignal[], portfolio: Portfolio): Promise<RiskAssessment[]> {
        return Promise.all(signals.map(signal => this.evaluateSignal(signal, portfolio)));
    }

    /**
     * Create a rejected assessment
     */
    private createRejectedAssessment(
        warnings: string[],
        stopLoss: number = 0,
        takeProfit: number = 0
    ): RiskAssessment {
        return {
            approved: false,
            suggestedSize: 0,
            riskScore: 1.0,
            warnings,
            stopLoss,
            takeProfit,
            leverage: 0
        };
    }

    /**
     * Hash a signal for cache key
     */
    private hashSignal(signal: TradingSignal): string {
        return `${signal.symbol}_${signal.action}_${signal.price}_${signal.confidence.toFixed(4)}`;
    }

    /**
     * Set risk cache with size limit
     */
    private setRiskCache(key: string, value: CachedRiskAssessment): void {
        if (this.riskCache.size >= this.MAX_CACHE_ENTRIES) {
            // Remove oldest entries (first 20%)
            const entriesToRemove = Math.floor(this.MAX_CACHE_ENTRIES * 0.2);
            const keys = Array.from(this.riskCache.keys()).slice(0, entriesToRemove);
            for (const k of keys) {
                this.riskCache.delete(k);
            }
        }
        this.riskCache.set(key, value);
    }

    private calculatePositionSize(signal: TradingSignal, portfolio: Portfolio): number {
        const LEVERAGE = 20; // CRITICAL FIX: Reduced from 40x to 20x max leverage
        const price = signal.price || 1;

        const minMarginPercent = 0.15;
        const maxMarginPercent = 0.35;
        const normalizedConfidence = Math.max(0, Math.min(1, (signal.confidence - 0.5) * 2));
        const targetMarginPercent = minMarginPercent + (normalizedConfidence * (maxMarginPercent - minMarginPercent));
        const targetMargin = portfolio.availableBalance * targetMarginPercent;
        const targetNotional = targetMargin * LEVERAGE;
        const baseUnits = targetNotional / price;

        const currentExposure = this.getCurrentExposure(signal.symbol, portfolio);
        const exposureAdjustedUnits = Math.max(0, baseUnits * (1 - currentExposure));

        const minNotional = 250;
        const minUnits = minNotional / price;
        const maxMargin = portfolio.availableBalance * 0.50;
        const maxNotional = maxMargin * LEVERAGE;
        const maxUnits = maxNotional / price;

        const finalSize = Math.max(minUnits, Math.min(exposureAdjustedUnits, maxUnits));

        logger.debug(`[RiskManager] Position size: ${finalSize.toFixed(4)} ${signal.symbol} @ $${price.toFixed(2)}`);
        return finalSize;
    }

    private getCurrentExposure(symbol: string, portfolio: Portfolio): number {
        const position = portfolio.positions.find(p => p.symbol === symbol);
        if (!position) return 0;
        return Math.abs(position.size * position.markPrice) / portfolio.totalValue;
    }

    private calculateRiskScore(signal: TradingSignal, portfolio: Portfolio, suggestedSize: number): number {
        let riskScore = 0;
        const concentrationRisk = this.getCurrentExposure(signal.symbol, portfolio);
        riskScore += concentrationRisk * 0.3;

        const sizeRisk = (suggestedSize / portfolio.totalValue) / this.maxPositionSize;
        riskScore += Math.min(sizeRisk, 1) * 0.2;

        const dailyRisk = Math.max(0, -this.dailyPnL / this.maxDailyLoss);
        riskScore += dailyRisk * 0.3;

        return Math.min(riskScore, 1.0);
    }

    private generateWarnings(signal: TradingSignal, portfolio: Portfolio, riskScore: number): string[] {
        const warnings: string[] = [];

        if (riskScore > 0.8) warnings.push('Very high risk score');
        else if (riskScore > 0.6) warnings.push('High risk score');

        const exposure = this.getCurrentExposure(signal.symbol, portfolio);
        if (exposure > 0.15) {
            warnings.push(`High concentration in ${signal.symbol}: ${(exposure * 100).toFixed(1)}%`);
        }

        if (this.dailyPnL < -this.maxDailyLoss * 0.8) {
            warnings.push(`Approaching daily loss limit: ${this.dailyPnL.toFixed(2)}`);
        }

        if (signal.confidence < 0.5) {
            warnings.push(`Low signal confidence: ${(signal.confidence * 100).toFixed(1)}%`);
        }

        return warnings;
    }

    private calculateStopLossAndTakeProfit(signal: TradingSignal, _portfolio: Portfolio): { stopLoss: number; takeProfit: number } {
        let stopLoss = this.DEFAULT_STOP_LOSS_PCT; // 0.8% default stop
        const requiredRiskReward = this.getRequiredRiskRewardRatio(signal.confidence);
        let takeProfit = stopLoss * requiredRiskReward;

        if (signal.confidence > 0.8) {
            stopLoss = 0.0075; // tighten for high confidence
            takeProfit = Math.max(stopLoss * requiredRiskReward, stopLoss * 4.0);
        } else if (signal.confidence < 0.5) {
            stopLoss = 0.0070; // low confidence must never widen stop
            takeProfit = stopLoss * requiredRiskReward;
        }

        // CRITICAL FIX: Reverse stop widening - tighten when losing, don't widen
        if (this.dailyPnL < 0) {
            stopLoss = Math.max(this.MIN_STOP_LOSS_PCT, stopLoss * 0.8);
            takeProfit *= 1.2;
        }

        // CRITICAL FIX: Enforce minimum 1:3 risk:reward ratio
        const minRiskReward = Math.max(this.MIN_RISK_REWARD_RATIO, requiredRiskReward);
        const currentRR = takeProfit / stopLoss;
        if (currentRR < minRiskReward) {
            takeProfit = stopLoss * minRiskReward;
        }

        // Hard limits: stop cannot widen beyond default baseline and never below minimum.
        stopLoss = Math.max(this.MIN_STOP_LOSS_PCT, Math.min(this.DEFAULT_STOP_LOSS_PCT, stopLoss));
        takeProfit = Math.max(stopLoss * minRiskReward, takeProfit);

        return { stopLoss, takeProfit };
    }

    private getRequiredRiskRewardRatio(confidence: number): number {
        if (confidence < 0.45) {
            return 5.0;
        }
        if (confidence < 0.60) {
            return 4.0;
        }
        return this.MIN_RISK_REWARD_RATIO;
    }

    /**
     * Check position risk with caching
     */
    async checkPositionRisk(position: Position, portfolio: Portfolio): Promise<RiskAssessment> {
        const cacheKey = `${position.symbol}_${position.side}_${position.unrealizedPnL.toFixed(2)}`;
        const cached = this.positionRiskCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.POSITION_RISK_CACHE_TTL_MS) {
            return cached.assessment;
        }

        try {
            const unrealizedPnLPercentage = position.unrealizedPnL / (position.size * position.entryPrice);
            const positionKey = `${position.symbol}_${position.side}`;

            let riskScore = 0;
            const warnings: string[] = [];

            // Trailing stop logic on unrealized PnL % so it scales consistently across position sizes.
            const currentPeak = this.positionPeakPnL.get(positionKey) || 0;
            if (unrealizedPnLPercentage > currentPeak) {
                this.positionPeakPnL.set(positionKey, unrealizedPnLPercentage);
            }
            const peakPnLPct = this.positionPeakPnL.get(positionKey) || 0;
            const trailingFloorPct = peakPnLPct >= this.trailingStopActivationPct
                ? peakPnLPct * (1 - this.trailingStopPct)
                : Number.NEGATIVE_INFINITY;
            const trailingStopArmed = peakPnLPct >= this.trailingStopActivationPct
                && trailingFloorPct >= this.trailingStopMinProfitLockPct;

            if (trailingStopArmed && unrealizedPnLPercentage <= trailingFloorPct) {
                const drawdownFromPeak = peakPnLPct > 0
                    ? (peakPnLPct - unrealizedPnLPercentage) / peakPnLPct
                    : 0;
                warnings.push(
                    `Trailing stop triggered: current ${(unrealizedPnLPercentage * 100).toFixed(2)}% <= floor ${(trailingFloorPct * 100).toFixed(2)}% ` +
                    `(peak ${(peakPnLPct * 100).toFixed(2)}%, retrace ${(drawdownFromPeak * 100).toFixed(1)}%)`
                );
                riskScore += 0.4;
            }

            if (unrealizedPnLPercentage < -0.1) {
                riskScore += 0.5;
                warnings.push(`Large unrealized loss: ${(unrealizedPnLPercentage * 100).toFixed(1)}%`);
            }

            if (position.leverage > this.maxLeverage) {
                riskScore += 0.3;
                warnings.push(`High leverage: ${position.leverage}x`);
            }

            const positionValue = Math.abs(position.size * position.markPrice);
            const positionPercentage = positionValue / portfolio.totalValue;
            if (positionPercentage > 0.2) {
                riskScore += 0.2;
                warnings.push(`Large position: ${(positionPercentage * 100).toFixed(1)}% of portfolio`);
            }

            const assessment: RiskAssessment = {
                approved: riskScore < 0.7,
                suggestedSize: position.size,
                riskScore,
                warnings,
                stopLoss: 0.03,
                takeProfit: 0.06,
                leverage: position.leverage
            };

            this.positionRiskCache.set(cacheKey, { assessment, timestamp: Date.now() });
            
            // Clean old cache entries periodically
            if (this.positionRiskCache.size > this.MAX_CACHE_ENTRIES) {
                const entriesToRemove = Math.floor(this.MAX_CACHE_ENTRIES * 0.2);
                const keys = Array.from(this.positionRiskCache.keys()).slice(0, entriesToRemove);
                for (const k of keys) this.positionRiskCache.delete(k);
            }

            return assessment;

        } catch (error) {
            logger.error('Position risk check failed:', error);
            throw error;
        }
    }

    /**
     * Batch check position risks
     */
    async checkPositionsRisk(positions: Position[], portfolio: Portfolio): Promise<RiskAssessment[]> {
        return Promise.all(positions.map(position => this.checkPositionRisk(position, portfolio)));
    }

    shouldClosePosition(position: Position): boolean {
        const positionKey = `${position.symbol}_${position.side}`;
        const positionNotional = Math.max(Math.abs(position.size * position.entryPrice), Number.EPSILON);
        const unrealizedPnLPct = position.unrealizedPnL / positionNotional;
        const currentPeak = this.positionPeakPnL.get(positionKey) || 0;
        if (unrealizedPnLPct > currentPeak) {
            this.positionPeakPnL.set(positionKey, unrealizedPnLPct);
        }

        const peakPnLPct = this.positionPeakPnL.get(positionKey) || 0;
        const trailingFloorPct = peakPnLPct >= this.trailingStopActivationPct
            ? peakPnLPct * (1 - this.trailingStopPct)
            : Number.NEGATIVE_INFINITY;
        const trailingStopArmed = peakPnLPct >= this.trailingStopActivationPct
            && trailingFloorPct >= this.trailingStopMinProfitLockPct;

        if (trailingStopArmed && unrealizedPnLPct <= trailingFloorPct) {
            const drawdownFromPeak = peakPnLPct > 0
                ? (peakPnLPct - unrealizedPnLPct) / peakPnLPct
                : 0;
            logger.info(
                `[RiskManager] Trailing stop triggered for ${position.symbol}: ` +
                `current ${(unrealizedPnLPct * 100).toFixed(2)}% <= floor ${(trailingFloorPct * 100).toFixed(2)}% ` +
                `(peak ${(peakPnLPct * 100).toFixed(2)}%, retrace ${(drawdownFromPeak * 100).toFixed(1)}%)`
            );
            return true;
        }
        return false;
    }

    async validateStrategy(strategy: Strategy): Promise<boolean> {
        try {
            if (strategy.riskParameters.maxPositionSize > this.maxPositionSize) {
                logger.warn(`Strategy ${strategy.name} exceeds max position size`);
                return false;
            }

            if (strategy.riskParameters.maxLeverage > this.maxLeverage) {
                logger.warn(`Strategy ${strategy.name} exceeds max leverage`);
                return false;
            }

            if (strategy.riskParameters.stopLoss > 0.1) {
                logger.warn(`Strategy ${strategy.name} has excessive stop loss`);
                return false;
            }

            return true;

        } catch (error) {
            logger.error('Strategy validation failed:', error);
            return false;
        }
    }

    updateDailyPnL(pnl: number): void {
        this.dailyPnL += pnl;
        logger.info(`Daily P&L updated: ${this.dailyPnL.toFixed(2)}`);

        // CRITICAL FIX: Circuit breaker at -$50 daily loss
        const CIRCUIT_BREAKER_THRESHOLD = -50;
        if (this.dailyPnL <= CIRCUIT_BREAKER_THRESHOLD) {
            logger.error(`CRITICAL: Circuit breaker triggered! Daily loss $${this.dailyPnL.toFixed(2)} exceeds limit $${Math.abs(CIRCUIT_BREAKER_THRESHOLD)}`);
            this.activateEmergencyStop();
        }
    }

    private resetDailyPnLIfNeeded(): void {
        const today = new Date();
        if (today.toDateString() !== this.lastResetDate.toDateString()) {
            this.dailyPnL = 0;
            this.lastResetDate = today;
            this.riskCache.clear();
            this.portfolioRiskCache = null;
            logger.info('Daily P&L reset for new day');
        }
    }

    async activateEmergencyStop(): Promise<void> {
        try {
            logger.warn('EMERGENCY STOP ACTIVATED');
            this.emergencyStopActive = true;
            logger.error('Emergency stop activated - all trading halted');
        } catch (error) {
            logger.error('Emergency stop failed:', error);
            throw error;
        }
    }

    disableEmergencyStop(): void {
        this.emergencyStopActive = false;
        logger.info('Emergency stop disabled - trading resumed');
    }

    getRiskMetrics(): {
        dailyPnL: number;
        maxDailyLoss: number;
        emergencyStop: boolean;
        riskUtilization: number;
    } {
        return {
            dailyPnL: this.dailyPnL,
            maxDailyLoss: this.maxDailyLoss,
            emergencyStop: this.emergencyStopActive,
            riskUtilization: Math.abs(this.dailyPnL) / this.maxDailyLoss
        };
    }

    updateRiskParameters(parameters: {
        maxPositionSize?: number;
        maxDailyLoss?: number;
        maxLeverage?: number;
    }): void {
        if (parameters.maxPositionSize !== undefined) this.maxPositionSize = parameters.maxPositionSize;
        if (parameters.maxDailyLoss !== undefined) this.maxDailyLoss = parameters.maxDailyLoss;
        if (parameters.maxLeverage !== undefined) this.maxLeverage = parameters.maxLeverage;

        // Clear caches on parameter change
        this.riskCache.clear();
        this.portfolioRiskCache = null;

        logger.info('Risk parameters updated:', parameters);
    }

    isWithinLimits(positionSize: number, leverage: number): boolean {
        return positionSize <= this.maxPositionSize && leverage <= this.maxLeverage;
    }

    /**
     * Calculate portfolio risk with caching
     */
    calculatePortfolioRisk(portfolio: Portfolio): {
        totalRisk: number;
        concentrationRisk: number;
        leverageRisk: number;
        liquidityRisk: number;
    } {
        const portfolioHash = this.hashPortfolio(portfolio);
        
        if (this.portfolioRiskCache && 
            this.portfolioRiskCache.portfolioHash === portfolioHash &&
            (Date.now() - this.portfolioRiskCache.timestamp) < this.PORTFOLIO_RISK_CACHE_TTL_MS) {
            return this.portfolioRiskCache.risk;
        }

        let concentrationRisk = 0;
        let leverageRisk = 0;

        portfolio.positions.forEach(position => {
            const concentration = Math.abs(position.size * position.markPrice) / portfolio.totalValue;
            concentrationRisk = Math.max(concentrationRisk, concentration);
        });

        const totalLeverage = portfolio.positions.reduce((sum, pos) => sum + pos.leverage, 0);
        leverageRisk = totalLeverage / (portfolio.positions.length || 1) / this.maxLeverage;

        const totalRisk = (concentrationRisk * 0.4 + leverageRisk * 0.4 + Math.abs(this.dailyPnL) / this.maxDailyLoss * 0.2);

        const risk = {
            totalRisk: Math.min(totalRisk, 1.0),
            concentrationRisk,
            leverageRisk,
            liquidityRisk: 0
        };

        this.portfolioRiskCache = { risk, timestamp: Date.now(), portfolioHash };
        return risk;
    }

    private hashPortfolio(portfolio: Portfolio): string {
        const positionsHash = portfolio.positions
            .map(p => `${p.symbol}_${p.side}_${p.size.toFixed(4)}`)
            .join('|');
        return `${portfolio.totalValue.toFixed(2)}_${positionsHash}`;
    }

    /**
     * Clear all caches
     */
    clearCaches(): void {
        this.riskCache.clear();
        this.portfolioRiskCache = null;
        this.positionRiskCache.clear();
        logger.info('[RiskManager] All caches cleared');
    }

    /**
     * Get cache stats
     */
    getCacheStats(): {
        riskCacheSize: number;
        positionRiskCacheSize: number;
        portfolioCacheValid: boolean;
    } {
        return {
            riskCacheSize: this.riskCache.size,
            positionRiskCacheSize: this.positionRiskCache.size,
            portfolioCacheValid: this.portfolioRiskCache !== null
        };
    }
}

// Singleton instance
const optimizedRiskManager = new OptimizedRiskManager();
export default optimizedRiskManager;
