"use strict";
/**
 * Optimized Risk Manager
 * Performance improvements:
 * - Caching of risk calculations
 * - Batch risk assessments
 * - Portfolio risk memoization
 * - Efficient position tracking
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedRiskManager = void 0;
const config_1 = __importDefault(require("../shared/config"));
const logger_1 = __importDefault(require("../shared/logger"));
class OptimizedRiskManager {
    maxPositionSize;
    maxDailyLoss;
    maxLeverage;
    emergencyStopActive = false;
    dailyPnL;
    lastResetDate;
    positionPeakPnL = new Map();
    trailingStopPct = 0.015;
    // Caches
    riskCache = new Map();
    portfolioRiskCache = null;
    positionRiskCache = new Map();
    // Cache TTLs
    RISK_CACHE_TTL_MS = 1000; // 1 second
    PORTFOLIO_RISK_CACHE_TTL_MS = 5000; // 5 seconds
    POSITION_RISK_CACHE_TTL_MS = 2000; // 2 seconds
    // Cache size limits
    MAX_CACHE_ENTRIES = 1000;
    constructor() {
        const riskConfig = config_1.default.getSection('risk');
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
    async evaluateSignal(signal, portfolio) {
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
                logger_1.default.debug(`[RiskManager] Cache hit for signal ${signal.id}`);
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
            if (!hasPortfolioValue) {
                warnings.push('Portfolio value too low for position sizing');
            }
            const assessment = {
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
            logger_1.default.info(`[RiskManager] Risk assessment for ${signal.symbol}: score=${riskScore.toFixed(2)}, approved=${approved}`);
            return assessment;
        }
        catch (error) {
            logger_1.default.error('Risk assessment failed:', error);
            throw error;
        }
    }
    /**
     * Batch evaluate multiple signals
     */
    async evaluateSignals(signals, portfolio) {
        return Promise.all(signals.map(signal => this.evaluateSignal(signal, portfolio)));
    }
    /**
     * Create a rejected assessment
     */
    createRejectedAssessment(warnings) {
        return {
            approved: false,
            suggestedSize: 0,
            riskScore: 1.0,
            warnings,
            stopLoss: 0,
            takeProfit: 0,
            leverage: 0
        };
    }
    /**
     * Hash a signal for cache key
     */
    hashSignal(signal) {
        return `${signal.symbol}_${signal.action}_${signal.price}_${signal.confidence.toFixed(4)}`;
    }
    /**
     * Set risk cache with size limit
     */
    setRiskCache(key, value) {
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
    calculatePositionSize(signal, portfolio) {
        const LEVERAGE = 40;
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
        logger_1.default.debug(`[RiskManager] Position size: ${finalSize.toFixed(4)} ${signal.symbol} @ $${price.toFixed(2)}`);
        return finalSize;
    }
    getCurrentExposure(symbol, portfolio) {
        const position = portfolio.positions.find(p => p.symbol === symbol);
        if (!position)
            return 0;
        return Math.abs(position.size * position.markPrice) / portfolio.totalValue;
    }
    calculateRiskScore(signal, portfolio, suggestedSize) {
        let riskScore = 0;
        const concentrationRisk = this.getCurrentExposure(signal.symbol, portfolio);
        riskScore += concentrationRisk * 0.3;
        const sizeRisk = (suggestedSize / portfolio.totalValue) / this.maxPositionSize;
        riskScore += Math.min(sizeRisk, 1) * 0.2;
        const dailyRisk = Math.max(0, -this.dailyPnL / this.maxDailyLoss);
        riskScore += dailyRisk * 0.3;
        return Math.min(riskScore, 1.0);
    }
    generateWarnings(signal, portfolio, riskScore) {
        const warnings = [];
        if (riskScore > 0.8)
            warnings.push('Very high risk score');
        else if (riskScore > 0.6)
            warnings.push('High risk score');
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
    calculateStopLossAndTakeProfit(signal, _portfolio) {
        let stopLoss = 0.03;
        let takeProfit = 0.06;
        if (signal.confidence > 0.8) {
            stopLoss = 0.02;
            takeProfit = 0.08;
        }
        else if (signal.confidence < 0.5) {
            stopLoss = 0.04;
            takeProfit = 0.04;
        }
        if (this.dailyPnL < 0) {
            stopLoss *= 1.5;
            takeProfit *= 0.8;
        }
        return { stopLoss, takeProfit };
    }
    /**
     * Check position risk with caching
     */
    async checkPositionRisk(position, portfolio) {
        const cacheKey = `${position.symbol}_${position.side}_${position.unrealizedPnL.toFixed(2)}`;
        const cached = this.positionRiskCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.POSITION_RISK_CACHE_TTL_MS) {
            return cached.assessment;
        }
        try {
            const unrealizedPnLPercentage = position.unrealizedPnL / (position.size * position.entryPrice);
            const positionKey = `${position.symbol}_${position.side}`;
            let riskScore = 0;
            const warnings = [];
            // Trailing stop logic
            if (position.unrealizedPnL > 0) {
                const currentPeak = this.positionPeakPnL.get(positionKey) || 0;
                if (position.unrealizedPnL > currentPeak) {
                    this.positionPeakPnL.set(positionKey, position.unrealizedPnL);
                }
                const peakPnL = this.positionPeakPnL.get(positionKey) || 0;
                const drawdownFromPeak = peakPnL > 0 ? (peakPnL - position.unrealizedPnL) / peakPnL : 0;
                if (drawdownFromPeak > this.trailingStopPct && peakPnL > 0) {
                    warnings.push(`Trailing stop triggered: down ${(drawdownFromPeak * 100).toFixed(1)}% from peak`);
                    riskScore += 0.4;
                }
            }
            else {
                this.positionPeakPnL.set(positionKey, 0);
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
            const assessment = {
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
                for (const k of keys)
                    this.positionRiskCache.delete(k);
            }
            return assessment;
        }
        catch (error) {
            logger_1.default.error('Position risk check failed:', error);
            throw error;
        }
    }
    /**
     * Batch check position risks
     */
    async checkPositionsRisk(positions, portfolio) {
        return Promise.all(positions.map(position => this.checkPositionRisk(position, portfolio)));
    }
    shouldClosePosition(position) {
        const positionKey = `${position.symbol}_${position.side}`;
        const peakPnL = this.positionPeakPnL.get(positionKey) || 0;
        if (peakPnL > 0 && position.unrealizedPnL > 0) {
            const drawdownFromPeak = (peakPnL - position.unrealizedPnL) / peakPnL;
            if (drawdownFromPeak > this.trailingStopPct) {
                logger_1.default.info(`[RiskManager] Trailing stop triggered for ${position.symbol}`);
                return true;
            }
        }
        return false;
    }
    async validateStrategy(strategy) {
        try {
            if (strategy.riskParameters.maxPositionSize > this.maxPositionSize) {
                logger_1.default.warn(`Strategy ${strategy.name} exceeds max position size`);
                return false;
            }
            if (strategy.riskParameters.maxLeverage > this.maxLeverage) {
                logger_1.default.warn(`Strategy ${strategy.name} exceeds max leverage`);
                return false;
            }
            if (strategy.riskParameters.stopLoss > 0.1) {
                logger_1.default.warn(`Strategy ${strategy.name} has excessive stop loss`);
                return false;
            }
            return true;
        }
        catch (error) {
            logger_1.default.error('Strategy validation failed:', error);
            return false;
        }
    }
    updateDailyPnL(pnl) {
        this.dailyPnL += pnl;
        logger_1.default.info(`Daily P&L updated: ${this.dailyPnL.toFixed(2)}`);
    }
    resetDailyPnLIfNeeded() {
        const today = new Date();
        if (today.toDateString() !== this.lastResetDate.toDateString()) {
            this.dailyPnL = 0;
            this.lastResetDate = today;
            this.riskCache.clear();
            this.portfolioRiskCache = null;
            logger_1.default.info('Daily P&L reset for new day');
        }
    }
    async activateEmergencyStop() {
        try {
            logger_1.default.warn('EMERGENCY STOP ACTIVATED');
            this.emergencyStopActive = true;
            logger_1.default.error('Emergency stop activated - all trading halted');
        }
        catch (error) {
            logger_1.default.error('Emergency stop failed:', error);
            throw error;
        }
    }
    disableEmergencyStop() {
        this.emergencyStopActive = false;
        logger_1.default.info('Emergency stop disabled - trading resumed');
    }
    getRiskMetrics() {
        return {
            dailyPnL: this.dailyPnL,
            maxDailyLoss: this.maxDailyLoss,
            emergencyStop: this.emergencyStopActive,
            riskUtilization: Math.abs(this.dailyPnL) / this.maxDailyLoss
        };
    }
    updateRiskParameters(parameters) {
        if (parameters.maxPositionSize !== undefined)
            this.maxPositionSize = parameters.maxPositionSize;
        if (parameters.maxDailyLoss !== undefined)
            this.maxDailyLoss = parameters.maxDailyLoss;
        if (parameters.maxLeverage !== undefined)
            this.maxLeverage = parameters.maxLeverage;
        // Clear caches on parameter change
        this.riskCache.clear();
        this.portfolioRiskCache = null;
        logger_1.default.info('Risk parameters updated:', parameters);
    }
    isWithinLimits(positionSize, leverage) {
        return positionSize <= this.maxPositionSize && leverage <= this.maxLeverage;
    }
    /**
     * Calculate portfolio risk with caching
     */
    calculatePortfolioRisk(portfolio) {
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
    hashPortfolio(portfolio) {
        const positionsHash = portfolio.positions
            .map(p => `${p.symbol}_${p.side}_${p.size.toFixed(4)}`)
            .join('|');
        return `${portfolio.totalValue.toFixed(2)}_${positionsHash}`;
    }
    /**
     * Clear all caches
     */
    clearCaches() {
        this.riskCache.clear();
        this.portfolioRiskCache = null;
        this.positionRiskCache.clear();
        logger_1.default.info('[RiskManager] All caches cleared');
    }
    /**
     * Get cache stats
     */
    getCacheStats() {
        return {
            riskCacheSize: this.riskCache.size,
            positionRiskCacheSize: this.positionRiskCache.size,
            portfolioCacheValid: this.portfolioRiskCache !== null
        };
    }
}
exports.OptimizedRiskManager = OptimizedRiskManager;
// Singleton instance
const optimizedRiskManager = new OptimizedRiskManager();
exports.default = optimizedRiskManager;
//# sourceMappingURL=risk-manager-optimized.js.map