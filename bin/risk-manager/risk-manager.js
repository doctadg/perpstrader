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
    dailyPnL;
    lastResetDate;
    // NEW: Track peak unrealized PnL for trailing stops
    positionPeakPnL = new Map();
    trailingStopPct = 0.015; // 1.5% trailing stop
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
            if (this.dailyPnL < -this.maxDailyLoss) {
                return {
                    approved: false,
                    suggestedSize: 0,
                    riskScore: 1.0,
                    warnings: [`Daily loss limit exceeded: ${this.dailyPnL.toFixed(2)}`],
                    stopLoss: 0,
                    takeProfit: 0,
                    leverage: 0
                };
            }
            // Calculate position size based on risk
            const suggestedSize = this.calculatePositionSize(signal, portfolio);
            // Calculate risk score
            const riskScore = this.calculateRiskScore(signal, portfolio, suggestedSize);
            // Generate warnings
            const warnings = this.generateWarnings(signal, portfolio, riskScore);
            // Determine if approved
            const approved = riskScore < 0.7 && this.dailyPnL > -this.maxDailyLoss;
            // Calculate stop loss and take profit
            const { stopLoss, takeProfit } = this.calculateStopLossAndTakeProfit(signal, portfolio);
            const assessment = {
                approved,
                suggestedSize,
                riskScore,
                warnings,
                stopLoss,
                takeProfit,
                leverage: this.maxLeverage // Always use max leverage (40x) as requested
            };
            logger_1.default.info(`Risk assessment completed: ${JSON.stringify(assessment)}`);
            return assessment;
        }
        catch (error) {
            logger_1.default.error('Risk assessment failed:', error);
            throw error;
        }
    }
    calculatePositionSize(signal, portfolio) {
        // LEVERAGE-AWARE POSITION SIZING
        // Target 40x leverage as requested
        const LEVERAGE = 40;
        // Get the asset price from signal
        const price = signal.price || 1;
        // Target: Risk 15-35% of available balance as MARGIN per trade based on confidence (aggressive)
        // Confidence 0.5 -> 15% margin
        // Confidence 0.9+ -> 35% margin
        const minMarginPercent = 0.15;
        const maxMarginPercent = 0.35;
        // Scale confidence (0.5 to 1.0) to margin percent
        const normalizedConfidence = Math.max(0, Math.min(1, (signal.confidence - 0.5) * 2)); // 0.5->0, 1.0->1
        const targetMarginPercent = minMarginPercent + (normalizedConfidence * (maxMarginPercent - minMarginPercent));
        const targetMargin = portfolio.availableBalance * targetMarginPercent;
        // With 40x leverage, this margin allows for notional exposure of:
        const targetNotional = targetMargin * LEVERAGE;
        // Convert to asset units
        const baseUnits = targetNotional / price;
        // Adjust based on current exposure to the symbol
        const currentExposure = this.getCurrentExposure(signal.symbol, portfolio);
        const exposureAdjustedUnits = Math.max(0, baseUnits * (1 - currentExposure));
        // HARD LIMITS
        // Min: At least $250 notional position (increased from $100)
        const minNotional = 250;
        const minUnits = minNotional / price;
        // Max: No more than 50% of available balance as MARGIN (increased from 25%)
        const maxMargin = portfolio.availableBalance * 0.50;
        const maxNotional = maxMargin * LEVERAGE;
        const maxUnits = maxNotional / price;
        const finalSize = Math.max(minUnits, Math.min(exposureAdjustedUnits, maxUnits));
        const finalNotional = finalSize * price;
        const finalMargin = finalNotional / LEVERAGE;
        logger_1.default.info(`[RiskManager] Size calc (40x): price=$${price.toFixed(2)}, available=$${portfolio.availableBalance.toFixed(2)}`);
        logger_1.default.info(`[RiskManager]   → confidence=${signal.confidence.toFixed(2)}, targetMargin=${(targetMarginPercent * 100).toFixed(1)}%`);
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
        const sizeRisk = (suggestedSize / portfolio.totalValue) / this.maxPositionSize;
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
        // Default stop loss and take profit percentages
        let stopLoss = 0.03; // 3%
        let takeProfit = 0.06; // 6%
        // Adjust based on signal confidence
        if (signal.confidence > 0.8) {
            stopLoss = 0.02; // Tighter stop loss for high confidence
            takeProfit = 0.08; // Higher take profit for high confidence
        }
        else if (signal.confidence < 0.5) {
            stopLoss = 0.04; // Wider stop loss for low confidence
            takeProfit = 0.04; // Lower take profit for low confidence
        }
        // Adjust based on daily performance
        if (this.dailyPnL < 0) {
            stopLoss *= 1.5; // Wider stops when losing
            takeProfit *= 0.8; // Lower targets when losing
        }
        return { stopLoss, takeProfit };
    }
    async checkPositionRisk(position, portfolio) {
        try {
            const unrealizedPnLPercentage = position.unrealizedPnL / (position.size * position.entryPrice);
            const positionKey = `${position.symbol}_${position.side}`;
            let riskScore = 0;
            const warnings = [];
            // NEW: Trailing stop logic - track peak PnL and check if we should lock in profits
            if (position.unrealizedPnL > 0) {
                const currentPeak = this.positionPeakPnL.get(positionKey) || 0;
                if (position.unrealizedPnL > currentPeak) {
                    // Update peak PnL
                    this.positionPeakPnL.set(positionKey, position.unrealizedPnL);
                }
                // Check trailing stop - if we've dropped enough from peak, suggest closing
                const peakPnL = this.positionPeakPnL.get(positionKey) || 0;
                const drawdownFromPeak = peakPnL > 0 ? (peakPnL - position.unrealizedPnL) / peakPnL : 0;
                if (drawdownFromPeak > this.trailingStopPct && peakPnL > 0) {
                    warnings.push(`Trailing stop triggered: down ${(drawdownFromPeak * 100).toFixed(1)}% from peak ($${peakPnL.toFixed(2)})`);
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
                stopLoss: 0.03,
                takeProfit: 0.06,
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
        const peakPnL = this.positionPeakPnL.get(positionKey) || 0;
        if (peakPnL > 0 && position.unrealizedPnL > 0) {
            const drawdownFromPeak = (peakPnL - position.unrealizedPnL) / peakPnL;
            if (drawdownFromPeak > this.trailingStopPct) {
                logger_1.default.info(`[RiskManager] Trailing stop triggered for ${position.symbol}: ` +
                    `down ${(drawdownFromPeak * 100).toFixed(1)}% from peak`);
                return true;
            }
        }
        return false;
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
        this.dailyPnL += pnl;
        logger_1.default.info(`Daily P&L updated: ${this.dailyPnL.toFixed(2)}`);
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