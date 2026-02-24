"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManager = void 0;
const config_1 = __importDefault(require("../shared/config"));
const logger_1 = __importDefault(require("../shared/logger"));
class RiskManager {
    maxPositionSize;
    maxDailyLoss;
    maxLeverage;
    emergencyStopActive = false;
    emergencyStopReason = '';
    dailyPnL;
    consecutiveLosses = 0;
    lastResetDate;
    circuitBreakerLoss = 50; // $50 daily loss circuit breaker (5% of $1k account)
    // NEW: Track peak unrealized PnL for trailing stops
    positionPeakPnL = new Map();
    // Store trailing stops as retracement from peak %PnL once meaningful profit is reached.
    trailingStopPct = 0.35; // allow 35% retrace from peak profit before exit
    trailingStopActivationPct = 0.01; // arm trailing stop after +1.0% unrealized PnL
    // NEW: Track position open times for holding limits
    positionOpenTimes = new Map();
    constructor() {
        const riskConfig = config_1.default.getSection('risk');
        this.maxPositionSize = riskConfig.maxPositionSize;
        this.maxDailyLoss = riskConfig.maxDailyLoss;
        this.maxLeverage = riskConfig.maxLeverage;
        this.emergencyStopActive = riskConfig.emergencyStop;
        this.dailyPnL = 0;
        this.lastResetDate = new Date();
    }
    async evaluateSignal(signal, portfolio) {
        try {
            logger_1.default.info(`Evaluating risk for signal: ${signal.action} ${signal.symbol}`);
            // Reset daily P&L if it's a new day
            this.resetDailyPnLIfNeeded();
            // Check emergency stop
            if (this.emergencyStopActive) {
                return {
                    approved: false,
                    suggestedSize: 0,
                    riskScore: 1.0,
                    warnings: ['Emergency stop is active'],
                    stopLoss: 0,
                    takeProfit: 0,
                    leverage: 0
                };
            }
            // Check daily loss limit
            const hardDailyLossLimit = 0;
            if (this.dailyPnL < -this.maxDailyLoss || this.dailyPnL < -hardDailyLossLimit) {
                return {
                    approved: false,
                    suggestedSize: 0,
                    riskScore: 1.0,
                    warnings: [`Daily loss limit exceeded: ${this.dailyPnL.toFixed(2)} (hard limit: 0.00)`],
                    stopLoss: 0,
                    takeProfit: 0,
                    leverage: 0
                };
            }
            // Calculate stop loss and take profit first so position sizing can use real stop distance.
            const { stopLoss, takeProfit } = this.calculateStopLossAndTakeProfit(signal, portfolio);
            // Calculate position size based on risk budget and stop distance.
            const suggestedSize = this.calculatePositionSize(signal, portfolio, stopLoss);
            // Calculate risk score
            const riskScore = this.calculateRiskScore(signal, portfolio, suggestedSize);
            // Generate warnings
            const warnings = this.generateWarnings(signal, portfolio, riskScore);
            // Determine if approved
            const approved = suggestedSize > 0 && riskScore < 0.7 && this.dailyPnL > -this.maxDailyLoss;
            const assessment = {
                approved,
                suggestedSize,
                riskScore,
                warnings,
                stopLoss,
                takeProfit,
                leverage: 20 // Reduced from 40x to 20x maximum
            };
            logger_1.default.info(`Risk assessment completed: ${JSON.stringify(assessment)}`);
            return assessment;
        }
        catch (error) {
            logger_1.default.error('Risk assessment failed:', error);
            throw error;
        }
    }
    calculatePositionSize(signal, portfolio, stopLossPct) {
        if (this.consecutiveLosses >= 3) {
            logger_1.default.warn(`[RiskManager] Blocking new trade after ${this.consecutiveLosses} consecutive losses`);
            return 0;
        }
        // Leverage is only a margin constraint. PnL risk is still based on notional * stop distance.
        const LEVERAGE = Math.min(20, Math.max(1, this.maxLeverage));
        const price = Math.max(signal.price || 0, Number.EPSILON);
        // Risk 0.8% to 1.5% of available balance per trade based on confidence.
        const normalizedConfidence = Math.max(0, Math.min(1, (signal.confidence - 0.5) * 2));
        const minRiskPercent = 0.008;
        const maxRiskPercent = 0.015;
        const riskPercent = minRiskPercent + (normalizedConfidence * (maxRiskPercent - minRiskPercent));
        const riskBudgetUsd = portfolio.availableBalance * riskPercent;
        const safeStopLossPct = Math.max(0.005, stopLossPct);
        const targetNotionalFromRisk = riskBudgetUsd / safeStopLossPct;
        // Reduce sizing when there is already exposure in this symbol.
        const currentExposure = this.getCurrentExposure(signal.symbol, portfolio);
        const exposureMultiplier = Math.max(0.25, 1 - currentExposure);
        const exposureAdjustedNotional = targetNotionalFromRisk * exposureMultiplier;
        // Hard notional caps: margin cap and portfolio cap.
        const maxMargin = portfolio.availableBalance * 0.2;
        const maxNotionalByMargin = maxMargin * LEVERAGE;
        const maxNotionalByPortfolio = Math.max(0, portfolio.totalValue * this.maxPositionSize);
        const hardMaxNotional = Math.max(0, Math.min(maxNotionalByMargin, maxNotionalByPortfolio));
        if (hardMaxNotional <= 0) {
            logger_1.default.warn(`[RiskManager] Blocking ${signal.symbol} entry: max notional resolved to 0`);
            return 0;
        }
        // Keep minimum trade size, but never exceed hard limits on small balances.
        const dynamicMinNotional = Math.min(250, portfolio.availableBalance * 0.1 * LEVERAGE);
        const minNotional = Math.max(25, Math.min(dynamicMinNotional, hardMaxNotional));
        const boundedNotional = Math.max(minNotional, Math.min(exposureAdjustedNotional, hardMaxNotional));
        // Loss-streak de-risking should be gradual so winners are not starved.
        const consecutiveLossMultiplier = Math.max(0.8, Math.pow(0.9, this.consecutiveLosses));
        const finalNotional = Math.max(minNotional, Math.min(hardMaxNotional, boundedNotional * consecutiveLossMultiplier));
        const finalSize = finalNotional / price;
        const finalMargin = finalNotional / LEVERAGE;
        logger_1.default.info(`[RiskManager] Size calc (${LEVERAGE}x): price=$${price.toFixed(2)}, available=$${portfolio.availableBalance.toFixed(2)}`);
        logger_1.default.info(`[RiskManager]   → confidence=${signal.confidence.toFixed(2)}, riskBudget=$${riskBudgetUsd.toFixed(2)}, stop=${(safeStopLossPct * 100).toFixed(2)}%`);
        logger_1.default.info(`[RiskManager]   → consecutiveLosses=${this.consecutiveLosses}, sizeMultiplier=${consecutiveLossMultiplier.toFixed(4)}`);
        logger_1.default.info(`[RiskManager]   → units=${finalSize.toFixed(4)}, notional=$${finalNotional.toFixed(2)}, margin=$${finalMargin.toFixed(2)}`);
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
        // Portfolio concentration risk
        const concentrationRisk = this.getCurrentExposure(signal.symbol, portfolio);
        riskScore += concentrationRisk * 0.3;
        // Size risk
        const sizeNotional = suggestedSize * Math.max(signal.price || 0, 0);
        const sizeRisk = (sizeNotional / Math.max(portfolio.totalValue, 1)) / Math.max(this.maxPositionSize, 0.0001);
        riskScore += Math.min(sizeRisk, 1) * 0.2;
        // Daily P&L risk
        const dailyRisk = Math.max(0, -this.dailyPnL / this.maxDailyLoss);
        riskScore += dailyRisk * 0.3;
        // Confidence risk (inverse)
        const _confidenceRisk = (1 - signal.confidence) * 0.2;
        return Math.min(riskScore, 1.0);
    }
    generateWarnings(signal, portfolio, riskScore) {
        const warnings = [];
        if (riskScore > 0.8) {
            warnings.push('Very high risk score');
        }
        else if (riskScore > 0.6) {
            warnings.push('High risk score');
        }
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
    calculateStopLossAndTakeProfit(signal, portfolio) {
        // Default stop loss and take profit percentages - target better than 1:3 risk/reward.
        let stopLoss = 0.016; // 1.6%
        let takeProfit = 0.056; // 5.6% (~1:3.5)
        // Adjust based on signal confidence
        if (signal.confidence > 0.8) {
            // High confidence: tighter stop with larger reward multiple.
            stopLoss = 0.012; // 1.2% stop
            takeProfit = 0.048; // 4.8% target (1:4)
        }
        else if (signal.confidence < 0.5) {
            // Low confidence: keep stops wider, but avoid weak reward profiles.
            stopLoss = 0.02; // 2.0% stop
            takeProfit = 0.07; // 7.0% target (~1:3.5)
        }
        // Adjust based on daily performance - REVERSED from revenge trading
        // When losing: TIGHTEN stops and INCREASE profit targets (be more selective)
        if (this.dailyPnL < 0) {
            stopLoss *= 0.9; // modestly tighter stops when losing
            takeProfit *= 1.1; // modestly higher targets when losing
            if (this.dailyPnL < -5) {
                stopLoss *= 0.9; // extra tightening for larger daily losses
                takeProfit *= 1.05;
            }
        }
        // Keep stops realistic and enforce minimum reward multiple.
        stopLoss = Math.max(0.008, stopLoss);
        takeProfit = Math.max(takeProfit, stopLoss * 3.2);
        const riskRewardRatio = takeProfit / stopLoss;
        if (riskRewardRatio < 3) {
            throw new Error(`Invalid risk/reward ratio calculated: 1:${riskRewardRatio.toFixed(2)} (minimum is 1:3)`);
        }
        return { stopLoss, takeProfit };
    }
    trackTradeResult(won) {
        if (won) {
            this.consecutiveLosses = 0;
            return;
        }
        this.consecutiveLosses += 1;
    }
    updateTradeResult(pnl) {
        if (pnl < 0) {
            this.trackTradeResult(false);
        }
        else if (pnl > 0) {
            this.trackTradeResult(true);
        }
    }
    async checkPositionRisk(position, portfolio) {
        try {
            const positionNotional = Math.max(Math.abs(position.size * position.entryPrice), Number.EPSILON);
            const unrealizedPnLPercentage = position.unrealizedPnL / positionNotional;
            const positionKey = `${position.symbol}_${position.side}`;
            let riskScore = 0;
            const warnings = [];
            // NEW: Check position holding time (max 4 hours = 14400000ms)
            const openTime = this.positionOpenTimes.get(positionKey);
            if (openTime) {
                const holdingTimeMs = Date.now() - openTime;
                const maxHoldingTimeMs = 4 * 60 * 60 * 1000; // 4 hours
                if (holdingTimeMs > maxHoldingTimeMs) {
                    warnings.push(`Position holding time exceeded 4 hours: ${(holdingTimeMs / 3600000).toFixed(1)}h`);
                    riskScore += 0.3;
                }
            }
            // NEW: Force exit if unrealized PnL < -5% at any time
            if (unrealizedPnLPercentage < -0.05) {
                warnings.push(`CRITICAL: Unrealized loss exceeded -5%: ${(unrealizedPnLPercentage * 100).toFixed(1)}%`);
                riskScore += 0.6; // Significant increase to force exit
            }
            // NEW: Trailing stop logic - track peak PnL and check if we should lock in profits
            if (unrealizedPnLPercentage > 0) {
                const currentPeak = this.positionPeakPnL.get(positionKey) || 0;
                if (unrealizedPnLPercentage > currentPeak) {
                    // Track peak PnL percentage, not raw USD PnL, to avoid noise-triggered exits.
                    this.positionPeakPnL.set(positionKey, unrealizedPnLPercentage);
                }
                // Check trailing stop - if we've dropped enough from peak, suggest closing
                const peakPnLPct = this.positionPeakPnL.get(positionKey) || 0;
                const drawdownFromPeak = peakPnLPct > 0
                    ? (peakPnLPct - unrealizedPnLPercentage) / peakPnLPct
                    : 0;
                if (peakPnLPct >= this.trailingStopActivationPct && drawdownFromPeak > this.trailingStopPct) {
                    warnings.push(`Trailing stop triggered: retraced ${(drawdownFromPeak * 100).toFixed(1)}% from peak unrealized PnL ${(peakPnLPct * 100).toFixed(2)}%`);
                    riskScore += 0.4; // Increase risk score to signal exit
                }
            }
            else {
                // Reset peak if position is losing
                this.positionPeakPnL.set(positionKey, 0);
            }
            // Check for large losses
            if (unrealizedPnLPercentage < -0.1) {
                riskScore += 0.5;
                warnings.push(`Large unrealized loss: ${(unrealizedPnLPercentage * 100).toFixed(1)}%`);
            }
            // Check for high leverage
            if (position.leverage > this.maxLeverage) {
                riskScore += 0.3;
                warnings.push(`High leverage: ${position.leverage}x`);
            }
            // Check position size relative to portfolio
            const positionValue = Math.abs(position.size * position.markPrice);
            const positionPercentage = positionValue / portfolio.totalValue;
            if (positionPercentage > 0.2) {
                riskScore += 0.2;
                warnings.push(`Large position: ${(positionPercentage * 100).toFixed(1)}% of portfolio`);
            }
            return {
                approved: riskScore < 0.7,
                suggestedSize: position.size,
                riskScore,
                warnings,
                stopLoss: 0.016,
                takeProfit: 0.056,
                leverage: position.leverage
            };
        }
        catch (error) {
            logger_1.default.error('Position risk check failed:', error);
            throw error;
        }
    }
    /**
     * Check if a position should be closed due to trailing stop
     * Returns true if position should be closed
     */
    shouldClosePosition(position) {
        const positionKey = `${position.symbol}_${position.side}`;
        const peakPnLPct = this.positionPeakPnL.get(positionKey) || 0;
        const positionNotional = Math.max(Math.abs(position.size * position.entryPrice), Number.EPSILON);
        const unrealizedPnLPct = position.unrealizedPnL / positionNotional;
        if (peakPnLPct >= this.trailingStopActivationPct && unrealizedPnLPct > 0) {
            const drawdownFromPeak = (peakPnLPct - unrealizedPnLPct) / peakPnLPct;
            if (drawdownFromPeak > this.trailingStopPct) {
                logger_1.default.info(`[RiskManager] Trailing stop triggered for ${position.symbol}: ` +
                    `down ${(drawdownFromPeak * 100).toFixed(1)}% from peak`);
                return true;
            }
        }
        return false;
    }
    /**
     * Register a new position open time for holding limit tracking
     */
    registerPositionOpen(symbol, side) {
        const positionKey = `${symbol}_${side}`;
        this.positionOpenTimes.set(positionKey, Date.now());
        logger_1.default.info(`[RiskManager] Position registered: ${positionKey} at ${new Date().toISOString()}`);
    }
    /**
     * Clear position tracking when position is closed
     */
    clearPositionTracking(symbol, side) {
        const positionKey = `${symbol}_${side}`;
        this.positionOpenTimes.delete(positionKey);
        this.positionPeakPnL.delete(positionKey);
        logger_1.default.info(`[RiskManager] Position tracking cleared: ${positionKey}`);
    }
    async validateStrategy(strategy) {
        try {
            // Check if strategy parameters are within risk limits
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
        this.updateTradeResult(pnl);
        this.dailyPnL += pnl;
        logger_1.default.info(`Daily P&L updated: ${this.dailyPnL.toFixed(2)}`);
        // NEW: Daily loss circuit breaker with hard 0.00 limit
        const hardDailyLossLimit = 0;
        if (this.dailyPnL < -this.circuitBreakerLoss || this.dailyPnL < -this.maxDailyLoss || this.dailyPnL < -hardDailyLossLimit) {
            logger_1.default.error(`CRITICAL: Daily loss circuit breaker triggered! Loss: $${this.dailyPnL.toFixed(2)}, Hard limit: $${hardDailyLossLimit.toFixed(2)}, Configured maxDailyLoss: $${this.maxDailyLoss.toFixed(2)}, circuitBreakerLoss setting: $${this.circuitBreakerLoss.toFixed(2)}`);
            this.emergencyStopReason = `Daily loss limit exceeded: $${this.dailyPnL.toFixed(2)}`;
            this.activateEmergencyStop();
        }
    }
    resetDailyPnLIfNeeded() {
        const today = new Date();
        const isSameDay = today.toDateString() === this.lastResetDate.toDateString();
        if (!isSameDay) {
            this.dailyPnL = 0;
            this.lastResetDate = today;
            logger_1.default.info('Daily P&L reset for new day');
        }
    }
    async activateEmergencyStop() {
        try {
            logger_1.default.warn('EMERGENCY STOP ACTIVATED');
            if (this.emergencyStopReason) {
                logger_1.default.error(`Emergency stop reason: ${this.emergencyStopReason}`);
            }
            this.emergencyStopActive = true;
            // In a real implementation, this would:
            // 1. Cancel all open orders
            // 2. Close all positions (if configured)
            // 3. Send notifications
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
        if (parameters.maxPositionSize !== undefined) {
            this.maxPositionSize = parameters.maxPositionSize;
        }
        if (parameters.maxDailyLoss !== undefined) {
            this.maxDailyLoss = parameters.maxDailyLoss;
        }
        if (parameters.maxLeverage !== undefined) {
            this.maxLeverage = parameters.maxLeverage;
        }
        logger_1.default.info('Risk parameters updated:', parameters);
    }
    isWithinLimits(positionSize, leverage) {
        return positionSize <= this.maxPositionSize && leverage <= this.maxLeverage;
    }
    calculatePortfolioRisk(portfolio) {
        let concentrationRisk = 0;
        let leverageRisk = 0;
        // Calculate concentration risk
        portfolio.positions.forEach(position => {
            const concentration = Math.abs(position.size * position.markPrice) / portfolio.totalValue;
            concentrationRisk = Math.max(concentrationRisk, concentration);
        });
        // Calculate leverage risk
        const totalLeverage = portfolio.positions.reduce((sum, pos) => sum + pos.leverage, 0);
        leverageRisk = totalLeverage / (portfolio.positions.length || 1) / this.maxLeverage;
        // Calculate total risk
        const totalRisk = (concentrationRisk * 0.4 + leverageRisk * 0.4 + Math.abs(this.dailyPnL) / this.maxDailyLoss * 0.2);
        return {
            totalRisk: Math.min(totalRisk, 1.0),
            concentrationRisk,
            leverageRisk,
            liquidityRisk: 0 // Would need market data for this
        };
    }
}
exports.RiskManager = RiskManager;
exports.default = new RiskManager();
//# sourceMappingURL=risk-manager.js.map