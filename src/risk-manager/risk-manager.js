"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManager = void 0;
var config_1 = require("../shared/config");
var logger_1 = require("../shared/logger");
var RiskManager = /** @class */ (function () {
    function RiskManager() {
        this.emergencyStopActive = false;
        // NEW: Track peak unrealized PnL for trailing stops
        this.positionPeakPnL = new Map();
        this.trailingStopPct = 0.015; // 1.5% trailing stop
        var riskConfig = config_1.default.getSection('risk');
        this.maxPositionSize = riskConfig.maxPositionSize;
        this.maxDailyLoss = riskConfig.maxDailyLoss;
        this.maxLeverage = riskConfig.maxLeverage;
        this.emergencyStopActive = riskConfig.emergencyStop;
        this.dailyPnL = 0;
        this.lastResetDate = new Date();
    }
    RiskManager.prototype.evaluateSignal = function (signal, portfolio) {
        return __awaiter(this, void 0, void 0, function () {
            var suggestedSize, riskScore, warnings, approved, _a, stopLoss, takeProfit, assessment;
            return __generator(this, function (_b) {
                try {
                    logger_1.default.info("Evaluating risk for signal: ".concat(signal.action, " ").concat(signal.symbol));
                    // Reset daily P&L if it's a new day
                    this.resetDailyPnLIfNeeded();
                    // Check emergency stop
                    if (this.emergencyStopActive) {
                        return [2 /*return*/, {
                                approved: false,
                                suggestedSize: 0,
                                riskScore: 1.0,
                                warnings: ['Emergency stop is active'],
                                stopLoss: 0,
                                takeProfit: 0,
                                leverage: 0
                            }];
                    }
                    // Check daily loss limit
                    if (this.dailyPnL < -this.maxDailyLoss) {
                        return [2 /*return*/, {
                                approved: false,
                                suggestedSize: 0,
                                riskScore: 1.0,
                                warnings: ["Daily loss limit exceeded: ".concat(this.dailyPnL.toFixed(2))],
                                stopLoss: 0,
                                takeProfit: 0,
                                leverage: 0
                            }];
                    }
                    suggestedSize = this.calculatePositionSize(signal, portfolio);
                    riskScore = this.calculateRiskScore(signal, portfolio, suggestedSize);
                    warnings = this.generateWarnings(signal, portfolio, riskScore);
                    approved = riskScore < 0.7 && this.dailyPnL > -this.maxDailyLoss;
                    _a = this.calculateStopLossAndTakeProfit(signal, portfolio), stopLoss = _a.stopLoss, takeProfit = _a.takeProfit;
                    assessment = {
                        approved: approved,
                        suggestedSize: suggestedSize,
                        riskScore: riskScore,
                        warnings: warnings,
                        stopLoss: stopLoss,
                        takeProfit: takeProfit,
                        leverage: this.maxLeverage // Always use max leverage (40x) as requested
                    };
                    logger_1.default.info("Risk assessment completed: ".concat(JSON.stringify(assessment)));
                    return [2 /*return*/, assessment];
                }
                catch (error) {
                    logger_1.default.error('Risk assessment failed:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    RiskManager.prototype.calculatePositionSize = function (signal, portfolio) {
        // LEVERAGE-AWARE POSITION SIZING
        // Target 40x leverage as requested
        var LEVERAGE = 40;
        // Get the asset price from signal
        var price = signal.price || 1;
        // Target: Risk 15-35% of available balance as MARGIN per trade based on confidence (aggressive)
        // Confidence 0.5 -> 15% margin
        // Confidence 0.9+ -> 35% margin
        var minMarginPercent = 0.15;
        var maxMarginPercent = 0.35;
        // Scale confidence (0.5 to 1.0) to margin percent
        var normalizedConfidence = Math.max(0, Math.min(1, (signal.confidence - 0.5) * 2)); // 0.5->0, 1.0->1
        var targetMarginPercent = minMarginPercent + (normalizedConfidence * (maxMarginPercent - minMarginPercent));
        var targetMargin = portfolio.availableBalance * targetMarginPercent;
        // With 40x leverage, this margin allows for notional exposure of:
        var targetNotional = targetMargin * LEVERAGE;
        // Convert to asset units
        var baseUnits = targetNotional / price;
        // Adjust based on current exposure to the symbol
        var currentExposure = this.getCurrentExposure(signal.symbol, portfolio);
        var exposureAdjustedUnits = Math.max(0, baseUnits * (1 - currentExposure));
        // HARD LIMITS
        // Min: At least $250 notional position (increased from $100)
        var minNotional = 250;
        var minUnits = minNotional / price;
        // Max: No more than 50% of available balance as MARGIN (increased from 25%)
        var maxMargin = portfolio.availableBalance * 0.50;
        var maxNotional = maxMargin * LEVERAGE;
        var maxUnits = maxNotional / price;
        var finalSize = Math.max(minUnits, Math.min(exposureAdjustedUnits, maxUnits));
        var finalNotional = finalSize * price;
        var finalMargin = finalNotional / LEVERAGE;
        logger_1.default.info("[RiskManager] Size calc (40x): price=$".concat(price.toFixed(2), ", available=$").concat(portfolio.availableBalance.toFixed(2)));
        logger_1.default.info("[RiskManager]   \u2192 confidence=".concat(signal.confidence.toFixed(2), ", targetMargin=").concat((targetMarginPercent * 100).toFixed(1), "%"));
        logger_1.default.info("[RiskManager]   \u2192 units=".concat(finalSize.toFixed(4), ", notional=$").concat(finalNotional.toFixed(2), ", margin=$").concat(finalMargin.toFixed(2)));
        return finalSize;
    };
    RiskManager.prototype.getCurrentExposure = function (symbol, portfolio) {
        var position = portfolio.positions.find(function (p) { return p.symbol === symbol; });
        if (!position)
            return 0;
        return Math.abs(position.size * position.markPrice) / portfolio.totalValue;
    };
    RiskManager.prototype.calculateRiskScore = function (signal, portfolio, suggestedSize) {
        var riskScore = 0;
        // Portfolio concentration risk
        var concentrationRisk = this.getCurrentExposure(signal.symbol, portfolio);
        riskScore += concentrationRisk * 0.3;
        // Size risk
        var sizeRisk = (suggestedSize / portfolio.totalValue) / this.maxPositionSize;
        riskScore += Math.min(sizeRisk, 1) * 0.2;
        // Daily P&L risk
        var dailyRisk = Math.max(0, -this.dailyPnL / this.maxDailyLoss);
        riskScore += dailyRisk * 0.3;
        // Confidence risk (inverse)
        var _confidenceRisk = (1 - signal.confidence) * 0.2;
        return Math.min(riskScore, 1.0);
    };
    RiskManager.prototype.generateWarnings = function (signal, portfolio, riskScore) {
        var warnings = [];
        if (riskScore > 0.8) {
            warnings.push('Very high risk score');
        }
        else if (riskScore > 0.6) {
            warnings.push('High risk score');
        }
        var exposure = this.getCurrentExposure(signal.symbol, portfolio);
        if (exposure > 0.15) {
            warnings.push("High concentration in ".concat(signal.symbol, ": ").concat((exposure * 100).toFixed(1), "%"));
        }
        if (this.dailyPnL < -this.maxDailyLoss * 0.8) {
            warnings.push("Approaching daily loss limit: ".concat(this.dailyPnL.toFixed(2)));
        }
        if (signal.confidence < 0.5) {
            warnings.push("Low signal confidence: ".concat((signal.confidence * 100).toFixed(1), "%"));
        }
        return warnings;
    };
    RiskManager.prototype.calculateStopLossAndTakeProfit = function (signal, portfolio) {
        // Default stop loss and take profit percentages
        var stopLoss = 0.03; // 3%
        var takeProfit = 0.06; // 6%
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
        return { stopLoss: stopLoss, takeProfit: takeProfit };
    };
    RiskManager.prototype.checkPositionRisk = function (position, portfolio) {
        return __awaiter(this, void 0, void 0, function () {
            var unrealizedPnLPercentage, positionKey, riskScore, warnings, currentPeak, peakPnL, drawdownFromPeak, positionValue, positionPercentage;
            return __generator(this, function (_a) {
                try {
                    unrealizedPnLPercentage = position.unrealizedPnL / (position.size * position.entryPrice);
                    positionKey = "".concat(position.symbol, "_").concat(position.side);
                    riskScore = 0;
                    warnings = [];
                    // NEW: Trailing stop logic - track peak PnL and check if we should lock in profits
                    if (position.unrealizedPnL > 0) {
                        currentPeak = this.positionPeakPnL.get(positionKey) || 0;
                        if (position.unrealizedPnL > currentPeak) {
                            // Update peak PnL
                            this.positionPeakPnL.set(positionKey, position.unrealizedPnL);
                        }
                        peakPnL = this.positionPeakPnL.get(positionKey) || 0;
                        drawdownFromPeak = peakPnL > 0 ? (peakPnL - position.unrealizedPnL) / peakPnL : 0;
                        if (drawdownFromPeak > this.trailingStopPct && peakPnL > 0) {
                            warnings.push("Trailing stop triggered: down ".concat((drawdownFromPeak * 100).toFixed(1), "% from peak ($").concat(peakPnL.toFixed(2), ")"));
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
                        warnings.push("Large unrealized loss: ".concat((unrealizedPnLPercentage * 100).toFixed(1), "%"));
                    }
                    // Check for high leverage
                    if (position.leverage > this.maxLeverage) {
                        riskScore += 0.3;
                        warnings.push("High leverage: ".concat(position.leverage, "x"));
                    }
                    positionValue = Math.abs(position.size * position.markPrice);
                    positionPercentage = positionValue / portfolio.totalValue;
                    if (positionPercentage > 0.2) {
                        riskScore += 0.2;
                        warnings.push("Large position: ".concat((positionPercentage * 100).toFixed(1), "% of portfolio"));
                    }
                    return [2 /*return*/, {
                            approved: riskScore < 0.7,
                            suggestedSize: position.size,
                            riskScore: riskScore,
                            warnings: warnings,
                            stopLoss: 0.03,
                            takeProfit: 0.06,
                            leverage: position.leverage
                        }];
                }
                catch (error) {
                    logger_1.default.error('Position risk check failed:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Check if a position should be closed due to trailing stop
     * Returns true if position should be closed
     */
    RiskManager.prototype.shouldClosePosition = function (position) {
        var positionKey = "".concat(position.symbol, "_").concat(position.side);
        var peakPnL = this.positionPeakPnL.get(positionKey) || 0;
        if (peakPnL > 0 && position.unrealizedPnL > 0) {
            var drawdownFromPeak = (peakPnL - position.unrealizedPnL) / peakPnL;
            if (drawdownFromPeak > this.trailingStopPct) {
                logger_1.default.info("[RiskManager] Trailing stop triggered for ".concat(position.symbol, ": ") +
                    "down ".concat((drawdownFromPeak * 100).toFixed(1), "% from peak"));
                return true;
            }
        }
        return false;
    };
    RiskManager.prototype.validateStrategy = function (strategy) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    // Check if strategy parameters are within risk limits
                    if (strategy.riskParameters.maxPositionSize > this.maxPositionSize) {
                        logger_1.default.warn("Strategy ".concat(strategy.name, " exceeds max position size"));
                        return [2 /*return*/, false];
                    }
                    if (strategy.riskParameters.maxLeverage > this.maxLeverage) {
                        logger_1.default.warn("Strategy ".concat(strategy.name, " exceeds max leverage"));
                        return [2 /*return*/, false];
                    }
                    if (strategy.riskParameters.stopLoss > 0.1) {
                        logger_1.default.warn("Strategy ".concat(strategy.name, " has excessive stop loss"));
                        return [2 /*return*/, false];
                    }
                    return [2 /*return*/, true];
                }
                catch (error) {
                    logger_1.default.error('Strategy validation failed:', error);
                    return [2 /*return*/, false];
                }
                return [2 /*return*/];
            });
        });
    };
    RiskManager.prototype.updateDailyPnL = function (pnl) {
        this.dailyPnL += pnl;
        logger_1.default.info("Daily P&L updated: ".concat(this.dailyPnL.toFixed(2)));
    };
    RiskManager.prototype.resetDailyPnLIfNeeded = function () {
        var today = new Date();
        var isSameDay = today.toDateString() === this.lastResetDate.toDateString();
        if (!isSameDay) {
            this.dailyPnL = 0;
            this.lastResetDate = today;
            logger_1.default.info('Daily P&L reset for new day');
        }
    };
    RiskManager.prototype.activateEmergencyStop = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
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
                return [2 /*return*/];
            });
        });
    };
    RiskManager.prototype.disableEmergencyStop = function () {
        this.emergencyStopActive = false;
        logger_1.default.info('Emergency stop disabled - trading resumed');
    };
    RiskManager.prototype.getRiskMetrics = function () {
        return {
            dailyPnL: this.dailyPnL,
            maxDailyLoss: this.maxDailyLoss,
            emergencyStop: this.emergencyStopActive,
            riskUtilization: Math.abs(this.dailyPnL) / this.maxDailyLoss
        };
    };
    RiskManager.prototype.updateRiskParameters = function (parameters) {
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
    };
    RiskManager.prototype.isWithinLimits = function (positionSize, leverage) {
        return positionSize <= this.maxPositionSize && leverage <= this.maxLeverage;
    };
    RiskManager.prototype.calculatePortfolioRisk = function (portfolio) {
        var concentrationRisk = 0;
        var leverageRisk = 0;
        // Calculate concentration risk
        portfolio.positions.forEach(function (position) {
            var concentration = Math.abs(position.size * position.markPrice) / portfolio.totalValue;
            concentrationRisk = Math.max(concentrationRisk, concentration);
        });
        // Calculate leverage risk
        var totalLeverage = portfolio.positions.reduce(function (sum, pos) { return sum + pos.leverage; }, 0);
        leverageRisk = totalLeverage / (portfolio.positions.length || 1) / this.maxLeverage;
        // Calculate total risk
        var totalRisk = (concentrationRisk * 0.4 + leverageRisk * 0.4 + Math.abs(this.dailyPnL) / this.maxDailyLoss * 0.2);
        return {
            totalRisk: Math.min(totalRisk, 1.0),
            concentrationRisk: concentrationRisk,
            leverageRisk: leverageRisk,
            liquidityRisk: 0 // Would need market data for this
        };
    };
    return RiskManager;
}());
exports.RiskManager = RiskManager;
exports.default = new RiskManager();
