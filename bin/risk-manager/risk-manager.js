"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskManager = void 0;
const config_1 = __importDefault(require("../shared/config"));
const logger_1 = __importDefault(require("../shared/logger"));
const hyperliquid_client_1 = __importDefault(require("../execution-engine/hyperliquid-client"));
class RiskManager {
    maxPositionSize;
    maxDailyLoss;
    maxLeverage = 100;
    HARD_CAP_MAX_LOSS_PERCENT = 0.015; // 1.5% account loss cap per trade
    MIN_STOP_LOSS_PCT = 0.006; // 0.6% minimum stop distance
    DEFAULT_STOP_LOSS_PCT = 0.008; // 0.8% baseline hard stop
    MIN_RISK_REWARD_RATIO = 3.0; // reward must be >= 3x risk
    DAILY_LOSS_CIRCUIT_BREAKER_USD = 30; // hard daily stop in dollars
    DAILY_LOSS_ALERT_1_USD = 20; // critical approach threshold 1
    DAILY_LOSS_ALERT_2_USD = 25; // critical approach threshold 2
    REVENGE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown after 4 consecutive losses
    emergencyStopActive = false;
    emergencyStopReason = '';
    dailyPnL;
    consecutiveLosses = 0;
    lastResetDate;
    cooldownUntil = null;
    dailyLossAlert40Triggered = false;
    dailyLossAlert45Triggered = false;
    // NEW: Track peak unrealized PnL for trailing stops
    positionPeakPnL = new Map();
    // Store trailing stops as retracement from peak %PnL once meaningful profit is reached.
    trailingStopPct = 0.45; // allow 45% retrace from peak profit before exit
    trailingStopActivationPct = 0.025; // arm trailing stop after +2.5% unrealized PnL
    trailingStopMinProfitLockPct = 0.012; // trailing exits must lock at least +1.2%
    breakevenActivationPct = 0.03; // only arm breakeven after a meaningful +3.0% move
    // NEW: Track position open times for holding limits
    positionOpenTimes = new Map();
    // CRITICAL FIX: Track hard stops per position - these NEVER move
    positionHardStops = new Map();
    // Track the trailing stop floor as unrealized PnL % relative to entry.
    // This value is monotonic increasing (tightening) and is never reduced.
    positionTrailingStopFloors = new Map();
    constructor() {
        const riskConfig = config_1.default.getSection('risk');
        this.maxPositionSize = riskConfig.maxPositionSize;
        this.maxDailyLoss = riskConfig.maxDailyLoss;
        this.maxLeverage = riskConfig.maxLeverage ?? this.maxLeverage;
        this.emergencyStopActive = riskConfig.emergencyStop;
        this.dailyPnL = 0;
        this.lastResetDate = new Date();
    }
    async evaluateSignal(signal, portfolio) {
        try {
            logger_1.default.info(`Evaluating risk for signal: ${signal.action} ${signal.symbol}`);
            // Reset daily P&L if it's a new day
            this.resetDailyPnLIfNeeded();
            this.logDailyLossApproachAlerts();
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
            // Revenge-trading cooldown after 4 consecutive losses.
            const cooldownRemainingMs = this.getCooldownRemainingMs();
            if (cooldownRemainingMs > 0) {
                return {
                    approved: false,
                    suggestedSize: 0,
                    riskScore: 1.0,
                    warnings: [
                        `Trading cooldown active after ${this.consecutiveLosses} consecutive losses: ${(cooldownRemainingMs / 60000).toFixed(0)} minutes remaining`
                    ],
                    stopLoss: 0,
                    takeProfit: 0,
                    leverage: 0
                };
            }
            // Hard daily loss circuit breaker at -$50 absolute loss.
            if (this.dailyPnL <= -this.DAILY_LOSS_CIRCUIT_BREAKER_USD) {
                this.emergencyStopReason = `Daily loss limit exceeded: $${this.dailyPnL.toFixed(2)} <= -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD.toFixed(2)}`;
                await this.activateEmergencyStop();
                return {
                    approved: false,
                    suggestedSize: 0,
                    riskScore: 1.0,
                    warnings: [
                        `Daily loss circuit breaker triggered at $${this.dailyPnL.toFixed(2)} (hard limit: -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD.toFixed(2)})`
                    ],
                    stopLoss: 0,
                    takeProfit: 0,
                    leverage: 0
                };
            }
            // Calculate stop loss and take profit first so position sizing can use real stop distance.
            const { stopLoss, takeProfit } = this.calculateStopLossAndTakeProfit(signal, portfolio);
            const requiredRiskRewardRatio = Math.max(this.MIN_RISK_REWARD_RATIO, this.getRequiredRiskRewardRatio(signal.confidence));
            const riskRewardRatio = stopLoss > 0 ? takeProfit / stopLoss : 0;
            this.logRiskRewardCalculation(signal, stopLoss, takeProfit, riskRewardRatio, requiredRiskRewardRatio);
            if (riskRewardRatio < requiredRiskRewardRatio) {
                return {
                    approved: false,
                    suggestedSize: 0,
                    riskScore: 1.0,
                    warnings: [
                        `Trade rejected: R:R 1:${riskRewardRatio.toFixed(2)} below required 1:${requiredRiskRewardRatio.toFixed(2)}`
                    ],
                    stopLoss,
                    takeProfit,
                    leverage: 0
                };
            }
            // Calculate position size based on risk budget and stop distance.
            const suggestedSize = this.calculatePositionSize(signal, portfolio, stopLoss);
            // Calculate risk score
            const riskScore = this.calculateRiskScore(signal, portfolio, suggestedSize);
            // Generate warnings
            const warnings = this.generateWarnings(signal, portfolio, riskScore);
            warnings.push(`R:R validated at 1:${riskRewardRatio.toFixed(2)} (required 1:${requiredRiskRewardRatio.toFixed(2)})`);
            // Determine if approved
            const approved = suggestedSize > 0 &&
                riskScore < 0.7 &&
                !this.isCooldownActive() &&
                this.dailyPnL > -this.DAILY_LOSS_CIRCUIT_BREAKER_USD &&
                riskRewardRatio >= requiredRiskRewardRatio;
            const assessment = {
                approved,
                suggestedSize,
                riskScore,
                warnings,
                stopLoss,
                takeProfit,
                leverage: this.maxLeverage
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
        if (this.isCooldownActive()) {
            const cooldownRemainingMs = this.getCooldownRemainingMs();
            logger_1.default.error(`[RiskManager] Trading cooldown active: ${Math.ceil(cooldownRemainingMs / 60000)} minute(s) remaining`);
            return 0;
        }
        // Leverage is only a margin constraint. PnL risk is still based on notional * stop distance.
        const LEVERAGE = Math.min(this.maxLeverage, Math.max(1, this.maxLeverage));
        const price = Math.max(signal.price || 0, Number.EPSILON);
        // Risk 0.5% to 1.0% of available balance per trade based on confidence.
        const normalizedConfidence = Math.max(0, Math.min(1, (signal.confidence - 0.5) * 2));
        const minRiskPercent = 0.005;
        const maxRiskPercent = 0.01;
        const riskPercent = minRiskPercent + (normalizedConfidence * (maxRiskPercent - minRiskPercent));
        const riskBudgetUsd = portfolio.availableBalance * riskPercent;
        const safeStopLossPct = Math.max(0.006, stopLossPct);
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
        // Keep a baseline minimum trade size, but allow forced de-risking to cut below normal minimums.
        const dynamicMinNotional = Math.min(250, portfolio.availableBalance * 0.1 * LEVERAGE);
        const riskAlignedMinNotional = targetNotionalFromRisk * 0.35;
        const minNotional = Math.max(10, Math.min(dynamicMinNotional, riskAlignedMinNotional, hardMaxNotional));
        const boundedNotional = Math.max(minNotional, Math.min(exposureAdjustedNotional, hardMaxNotional));
        const consecutiveLossMultiplier = this.consecutiveLosses >= 3 ? 0.5 : 1.0;
        if (this.consecutiveLosses >= 3) {
            logger_1.default.warn(`[RiskManager] Revenge prevention active: losses=${this.consecutiveLosses}, size multiplier=${consecutiveLossMultiplier.toFixed(2)}`);
        }
        const lossAdjustedNotional = Math.max(10, Math.min(hardMaxNotional, boundedNotional * consecutiveLossMultiplier));
        const accountValue = Math.max(portfolio.totalValue, portfolio.availableBalance, 1);
        const maxAllowedRiskUsd = accountValue * this.HARD_CAP_MAX_LOSS_PERCENT;
        const calculatedRiskUsdBeforeCap = lossAdjustedNotional * safeStopLossPct;
        let finalNotional = lossAdjustedNotional;
        let sizeReductionPct = 0;
        if (calculatedRiskUsdBeforeCap > maxAllowedRiskUsd) {
            const cappedNotional = maxAllowedRiskUsd / safeStopLossPct;
            finalNotional = Math.max(0, Math.min(lossAdjustedNotional, cappedNotional));
            sizeReductionPct = lossAdjustedNotional > 0
                ? (1 - (finalNotional / lossAdjustedNotional)) * 100
                : 0;
            logger_1.default.warn(`[RiskManager] Hard max-loss cap reduced ${signal.symbol} size: ` +
                `risk=$${calculatedRiskUsdBeforeCap.toFixed(2)} > max=$${maxAllowedRiskUsd.toFixed(2)}, ` +
                `reduction=${sizeReductionPct.toFixed(2)}%`);
        }
        const finalRiskUsd = finalNotional * safeStopLossPct;
        const finalSize = finalNotional / price;
        const finalMargin = finalNotional / LEVERAGE;
        logger_1.default.info(`[RiskManager] Size calc (${LEVERAGE}x): price=$${price.toFixed(2)}, available=$${portfolio.availableBalance.toFixed(2)}`);
        logger_1.default.info(`[RiskManager]   → confidence=${signal.confidence.toFixed(2)}, riskBudget=$${riskBudgetUsd.toFixed(2)}, stop=${(safeStopLossPct * 100).toFixed(2)}%`);
        logger_1.default.info(`[RiskManager]   → consecutiveLosses=${this.consecutiveLosses}, sizeMultiplier=${consecutiveLossMultiplier.toFixed(4)}`);
        logger_1.default.info(`[RiskManager]   → calculatedRisk=$${finalRiskUsd.toFixed(2)}, ` +
            `maxAllowedRisk=$${maxAllowedRiskUsd.toFixed(2)}, sizeReduction=${sizeReductionPct.toFixed(2)}%`);
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
        const dailyRisk = Math.max(0, -this.dailyPnL / this.DAILY_LOSS_CIRCUIT_BREAKER_USD);
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
        if (this.dailyPnL <= -this.DAILY_LOSS_ALERT_2_USD) {
            warnings.push(`CRITICAL: Daily loss at $${this.dailyPnL.toFixed(2)} (near -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD.toFixed(2)} limit)`);
        }
        else if (this.dailyPnL <= -this.DAILY_LOSS_ALERT_1_USD) {
            warnings.push(`CRITICAL: Daily loss warning at $${this.dailyPnL.toFixed(2)} (approaching -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD.toFixed(2)})`);
        }
        if (signal.confidence < 0.5) {
            warnings.push(`Low signal confidence: ${(signal.confidence * 100).toFixed(1)}%`);
        }
        return warnings;
    }
    normalizeStopLossPct(stopLossPct, fallback = this.DEFAULT_STOP_LOSS_PCT) {
        const candidate = Number.isFinite(stopLossPct) ? stopLossPct : fallback;
        return Math.max(this.MIN_STOP_LOSS_PCT, Math.min(this.DEFAULT_STOP_LOSS_PCT, candidate));
    }
    enforceMinimumRiskReward(stopLossPct, takeProfitPct, requiredRiskRewardRatio) {
        const stopLoss = this.normalizeStopLossPct(stopLossPct);
        const minTakeProfit = stopLoss * Math.max(this.MIN_RISK_REWARD_RATIO, requiredRiskRewardRatio);
        const safeTakeProfit = Number.isFinite(takeProfitPct) && takeProfitPct > 0
            ? takeProfitPct
            : minTakeProfit;
        const takeProfit = Math.max(safeTakeProfit, minTakeProfit);
        return {
            stopLoss,
            takeProfit,
            riskRewardRatio: takeProfit / stopLoss
        };
    }
    setOrTightenHardStop(positionKey, requestedStopLossPct) {
        const candidateStop = this.normalizeStopLossPct(requestedStopLossPct);
        const existingStop = this.positionHardStops.get(positionKey);
        if (existingStop === undefined) {
            this.positionHardStops.set(positionKey, candidateStop);
            return candidateStop;
        }
        const tightenedStop = Math.min(existingStop, candidateStop);
        if (candidateStop > existingStop) {
            logger_1.default.warn(`[RiskManager] Prevented hard-stop widening for ${positionKey}: requested ${(candidateStop * 100).toFixed(2)}% > existing ${(existingStop * 100).toFixed(2)}%`);
        }
        else if (tightenedStop < existingStop) {
            logger_1.default.info(`[RiskManager] Tightened hard stop for ${positionKey}: ${(existingStop * 100).toFixed(2)}% -> ${(tightenedStop * 100).toFixed(2)}%`);
        }
        this.positionHardStops.set(positionKey, tightenedStop);
        return tightenedStop;
    }
    getOrInitializeHardStop(positionKey) {
        const existingStop = this.positionHardStops.get(positionKey);
        if (existingStop !== undefined) {
            return this.normalizeStopLossPct(existingStop, this.DEFAULT_STOP_LOSS_PCT);
        }
        // Fail-safe for untracked positions: prefer stricter stop so we never widen risk on recovery paths.
        const fallbackHardStop = this.MIN_STOP_LOSS_PCT;
        logger_1.default.warn(`[RiskManager] Missing hard stop for ${positionKey}; using strict fallback ${(fallbackHardStop * 100).toFixed(2)}%`);
        this.positionHardStops.set(positionKey, fallbackHardStop);
        return fallbackHardStop;
    }
    updatePositionPeakPnL(positionKey, unrealizedPnLPct) {
        const currentPeak = this.positionPeakPnL.get(positionKey) || 0;
        if (unrealizedPnLPct > currentPeak) {
            this.positionPeakPnL.set(positionKey, unrealizedPnLPct);
            return unrealizedPnLPct;
        }
        if (!this.positionPeakPnL.has(positionKey)) {
            this.positionPeakPnL.set(positionKey, 0);
        }
        return this.positionPeakPnL.get(positionKey) || 0;
    }
    getOrTightenTrailingStopFloor(positionKey, hardStopPct, peakPnLPct) {
        const baseFloor = -hardStopPct;
        const existingFloor = this.positionTrailingStopFloors.get(positionKey) ?? baseFloor;
        const trailingRetention = Math.max(0, Math.min(1, 1 - this.trailingStopPct));
        const candidateFloor = peakPnLPct >= this.trailingStopActivationPct
            ? peakPnLPct * trailingRetention
            : baseFloor;
        // Trailing floor only tightens (moves up toward/through entry), never loosens.
        const tightenedFloor = Math.max(existingFloor, candidateFloor);
        this.positionTrailingStopFloors.set(positionKey, tightenedFloor);
        return tightenedFloor;
    }
    calculateStopLossAndTakeProfit(signal, _portfolio) {
        const requiredRiskRewardRatio = Math.max(this.MIN_RISK_REWARD_RATIO, this.getRequiredRiskRewardRatio(signal.confidence));
        // Baseline hard stop is 0.8% and can only tighten from there.
        let stopLoss = this.DEFAULT_STOP_LOSS_PCT;
        if (signal.confidence > 0.8) {
            stopLoss = 0.0075; // tighten for high-confidence entries
        }
        else if (signal.confidence < 0.5) {
            stopLoss = 0.0070; // low confidence must not widen stop
        }
        // Set baseline target from required confidence-adjusted R:R.
        let takeProfit = stopLoss * requiredRiskRewardRatio;
        // Higher-confidence setups can still aim for better payoff.
        if (signal.confidence > 0.8) {
            takeProfit = Math.max(takeProfit, stopLoss * 4.0);
        }
        // Revenge protection: when day is red, tighten stops and demand larger winners.
        if (this.dailyPnL < 0) {
            stopLoss = Math.max(this.MIN_STOP_LOSS_PCT, stopLoss * 0.8);
            takeProfit *= 1.2;
        }
        // Enforce hard invariants: stop cannot widen above baseline and reward must meet confidence-adjusted minimum.
        const enforced = this.enforceMinimumRiskReward(stopLoss, takeProfit, requiredRiskRewardRatio);
        stopLoss = enforced.stopLoss;
        takeProfit = enforced.takeProfit;
        if (enforced.riskRewardRatio < requiredRiskRewardRatio) {
            throw new Error(`Invalid risk/reward ratio calculated: 1:${enforced.riskRewardRatio.toFixed(2)} ` +
                `(required is 1:${requiredRiskRewardRatio.toFixed(1)})`);
        }
        logger_1.default.info(`[RiskManager] Stop/Take Profit calc: SL=${(stopLoss * 100).toFixed(2)}%, TP=${(takeProfit * 100).toFixed(2)}%, ` +
            `R:R=1:${enforced.riskRewardRatio.toFixed(2)} (required 1:${requiredRiskRewardRatio.toFixed(2)})`);
        return { stopLoss, takeProfit };
    }
    getRequiredRiskRewardRatio(confidence) {
        if (confidence < 0.45) {
            return 5.0;
        }
        if (confidence < 0.60) {
            return 4.0;
        }
        return this.MIN_RISK_REWARD_RATIO;
    }
    logRiskRewardCalculation(signal, stopLoss, takeProfit, actualRiskRewardRatio, requiredRiskRewardRatio) {
        const compliance = actualRiskRewardRatio >= requiredRiskRewardRatio ? 'PASS' : 'FAIL';
        logger_1.default.info(`[RiskManager][RR][${compliance}] ${signal.symbol} ${signal.action} confidence=${signal.confidence.toFixed(2)} ` +
            `SL=${(stopLoss * 100).toFixed(2)}% TP=${(takeProfit * 100).toFixed(2)}% ` +
            `actual=1:${actualRiskRewardRatio.toFixed(2)} required=1:${requiredRiskRewardRatio.toFixed(2)}`);
    }
    isCooldownActive() {
        return this.cooldownUntil !== null && Date.now() < this.cooldownUntil;
    }
    getCooldownRemainingMs() {
        if (!this.isCooldownActive() || this.cooldownUntil === null) {
            return 0;
        }
        return Math.max(0, this.cooldownUntil - Date.now());
    }
    trackTradeResult(won) {
        if (won) {
            this.consecutiveLosses = 0;
            this.cooldownUntil = null;
            return;
        }
        this.consecutiveLosses += 1;
        if (this.consecutiveLosses >= 4 && !this.isCooldownActive()) {
            this.cooldownUntil = Date.now() + this.REVENGE_COOLDOWN_MS;
            logger_1.default.error(`[RiskManager] CRITICAL: ${this.consecutiveLosses} consecutive losses - trading halted for 1 hour cooldown until ${new Date(this.cooldownUntil).toISOString()}`);
        }
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
            const trackedOpenTime = this.positionOpenTimes.get(positionKey);
            const entryTimeMs = position.entryTime ? new Date(position.entryTime).getTime() : undefined;
            const openTimeMs = trackedOpenTime ?? entryTimeMs;
            let riskScore = 0;
            const warnings = [];
            if (openTimeMs !== undefined && Number.isFinite(openTimeMs)) {
                const holdingTimeMs = Date.now() - openTimeMs;
                const forceExitHoldingMs = 2 * 60 * 60 * 1000; // 2 hours
                if (holdingTimeMs > forceExitHoldingMs && unrealizedPnLPercentage < -0.01) {
                    warnings.push(`CRITICAL: Time-based stop triggered (${(holdingTimeMs / 3600000).toFixed(1)}h held, ` +
                        `unrealized ${(unrealizedPnLPercentage * 100).toFixed(2)}%)`);
                    riskScore = Math.max(riskScore, 1.0);
                }
                // Check position holding time (max 4 hours = 14400000ms)
                const maxHoldingTimeMs = 4 * 60 * 60 * 1000; // 4 hours
                if (holdingTimeMs > maxHoldingTimeMs) {
                    warnings.push(`Position holding time exceeded 4 hours: ${(holdingTimeMs / 3600000).toFixed(1)}h`);
                    riskScore += 0.3;
                }
            }
            // CRITICAL FIX: Use position-specific hard stop that NEVER moves outward.
            const hardStopPct = this.getOrInitializeHardStop(positionKey);
            // Force exit if unrealized PnL exceeds hard stop
            if (unrealizedPnLPercentage <= -hardStopPct) {
                warnings.push(`CRITICAL: Hard stop triggered at -${(hardStopPct * 100).toFixed(2)}%: ` +
                    `unrealized ${(unrealizedPnLPercentage * 100).toFixed(2)}%`);
                riskScore = Math.max(riskScore, 1.0);
            }
            // Trailing stop and breakeven logic - only lock winners after meaningful profit expansion.
            const peakPnLPct = this.updatePositionPeakPnL(positionKey, unrealizedPnLPercentage);
            const trailingStopFloorPct = this.getOrTightenTrailingStopFloor(positionKey, hardStopPct, peakPnLPct);
            const drawdownFromPeak = peakPnLPct > 0
                ? (peakPnLPct - unrealizedPnLPercentage) / peakPnLPct
                : 0;
            const trailingStopArmed = peakPnLPct >= this.trailingStopActivationPct
                && trailingStopFloorPct >= this.trailingStopMinProfitLockPct;
            if (trailingStopArmed && unrealizedPnLPercentage <= trailingStopFloorPct) {
                warnings.push(`Trailing stop triggered: current ${(unrealizedPnLPercentage * 100).toFixed(2)}% <= floor ${(trailingStopFloorPct * 100).toFixed(2)}% ` +
                    `(peak ${(peakPnLPct * 100).toFixed(2)}%, retrace ${(drawdownFromPeak * 100).toFixed(1)}%)`);
                riskScore += 0.4; // Increase risk score to signal exit
            }
            // Breakeven stop: once a strong move has printed, do not allow full round-trip to a loss.
            if (peakPnLPct >= this.breakevenActivationPct && unrealizedPnLPercentage <= 0) {
                warnings.push(`Breakeven stop triggered: peak ${(peakPnLPct * 100).toFixed(2)}%, ` +
                    `current ${(unrealizedPnLPercentage * 100).toFixed(2)}%`);
                riskScore = Math.max(riskScore, 1.0);
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
                stopLoss: this.DEFAULT_STOP_LOSS_PCT,
                takeProfit: this.DEFAULT_STOP_LOSS_PCT * this.MIN_RISK_REWARD_RATIO,
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
        const positionNotional = Math.max(Math.abs(position.size * position.entryPrice), Number.EPSILON);
        const unrealizedPnLPct = position.unrealizedPnL / positionNotional;
        const trackedOpenTime = this.positionOpenTimes.get(positionKey);
        const entryTimeMs = position.entryTime ? new Date(position.entryTime).getTime() : undefined;
        const openTimeMs = trackedOpenTime ?? entryTimeMs;
        // CRITICAL FIX: Use position-specific hard stop that NEVER moves outward.
        const hardStopPct = this.getOrInitializeHardStop(positionKey);
        const peakPnLPct = this.updatePositionPeakPnL(positionKey, unrealizedPnLPct);
        const trailingStopFloorPct = this.getOrTightenTrailingStopFloor(positionKey, hardStopPct, peakPnLPct);
        if (unrealizedPnLPct <= -hardStopPct) {
            logger_1.default.warn(`[RiskManager] HARD STOP triggered for ${position.symbol}: ` +
                `unrealized ${(unrealizedPnLPct * 100).toFixed(2)}% <= -${(hardStopPct * 100).toFixed(2)}%`);
            return true;
        }
        if (openTimeMs !== undefined && Number.isFinite(openTimeMs)) {
            const holdingTimeMs = Date.now() - openTimeMs;
            const forceExitHoldingMs = 2 * 60 * 60 * 1000; // 2 hours
            if (holdingTimeMs > forceExitHoldingMs && unrealizedPnLPct < -0.01) {
                logger_1.default.warn(`[RiskManager] Time-based stop triggered for ${position.symbol}: ` +
                    `held ${(holdingTimeMs / 3600000).toFixed(1)}h, unrealized ${(unrealizedPnLPct * 100).toFixed(2)}%`);
                return true;
            }
        }
        if (peakPnLPct >= this.breakevenActivationPct && unrealizedPnLPct <= 0) {
            logger_1.default.info(`[RiskManager] Breakeven stop triggered for ${position.symbol}: peak ${(peakPnLPct * 100).toFixed(2)}%, now ${(unrealizedPnLPct * 100).toFixed(2)}%`);
            return true;
        }
        const trailingStopArmed = peakPnLPct >= this.trailingStopActivationPct
            && trailingStopFloorPct >= this.trailingStopMinProfitLockPct;
        if (trailingStopArmed && unrealizedPnLPct <= trailingStopFloorPct) {
            const drawdownFromPeak = peakPnLPct > 0
                ? (peakPnLPct - unrealizedPnLPct) / peakPnLPct
                : 0;
            logger_1.default.info(`[RiskManager] Trailing stop triggered for ${position.symbol}: ` +
                `current ${(unrealizedPnLPct * 100).toFixed(2)}% <= floor ${(trailingStopFloorPct * 100).toFixed(2)}% ` +
                `(peak ${(peakPnLPct * 100).toFixed(2)}%, retrace ${(drawdownFromPeak * 100).toFixed(1)}%)`);
            return true;
        }
        return false;
    }
    /**
     * Register a new position open time for holding limit tracking
     */
    registerPositionOpen(symbol, side, stopLossPct) {
        const positionKey = `${symbol}_${side}`;
        this.positionOpenTimes.set(positionKey, Date.now());
        // CRITICAL FIX: Set hard stop that can only tighten.
        const hardStop = this.setOrTightenHardStop(positionKey, stopLossPct ?? this.DEFAULT_STOP_LOSS_PCT);
        this.positionPeakPnL.set(positionKey, 0);
        this.positionTrailingStopFloors.set(positionKey, -hardStop);
        logger_1.default.info(`[RiskManager] Position registered: ${positionKey} at ${new Date().toISOString()} with HARD STOP at -${(hardStop * 100).toFixed(2)}%`);
    }
    /**
     * Clear position tracking when position is closed
     */
    clearPositionTracking(symbol, side) {
        const positionKey = `${symbol}_${side}`;
        this.positionOpenTimes.delete(positionKey);
        this.positionPeakPnL.delete(positionKey);
        this.positionHardStops.delete(positionKey); // CRITICAL FIX: Clear hard stop
        this.positionTrailingStopFloors.delete(positionKey);
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
        this.logDailyLossApproachAlerts();
        if (this.dailyPnL <= -this.DAILY_LOSS_CIRCUIT_BREAKER_USD && !this.emergencyStopActive) {
            logger_1.default.error(`CRITICAL: Daily loss circuit breaker triggered at $${this.dailyPnL.toFixed(2)} ` +
                `(hard limit -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD.toFixed(2)})`);
            this.emergencyStopReason = `Daily loss limit exceeded: $${this.dailyPnL.toFixed(2)}`;
            void this.activateEmergencyStop();
        }
    }
    resetDailyPnLIfNeeded() {
        const today = new Date();
        const isSameDay = today.toDateString() === this.lastResetDate.toDateString();
        if (!isSameDay) {
            this.dailyPnL = 0;
            this.lastResetDate = today;
            this.dailyLossAlert40Triggered = false;
            this.dailyLossAlert45Triggered = false;
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
            await this.forceCloseAllPositions();
            logger_1.default.error('Emergency stop activated - all trading halted');
        }
        catch (error) {
            logger_1.default.error('Emergency stop failed:', error);
            throw error;
        }
    }
    disableEmergencyStop() {
        this.emergencyStopActive = false;
        this.emergencyStopReason = '';
        logger_1.default.info('Emergency stop disabled - trading resumed');
    }
    logDailyLossApproachAlerts() {
        if (this.dailyPnL <= -this.DAILY_LOSS_ALERT_1_USD && !this.dailyLossAlert40Triggered) {
            this.dailyLossAlert40Triggered = true;
            logger_1.default.error(`CRITICAL: Approaching daily loss breaker: PnL=$${this.dailyPnL.toFixed(2)} (threshold -$${this.DAILY_LOSS_ALERT_1_USD.toFixed(2)})`);
        }
        if (this.dailyPnL <= -this.DAILY_LOSS_ALERT_2_USD && !this.dailyLossAlert45Triggered) {
            this.dailyLossAlert45Triggered = true;
            logger_1.default.error(`CRITICAL: Approaching daily loss breaker: PnL=$${this.dailyPnL.toFixed(2)} (threshold -$${this.DAILY_LOSS_ALERT_2_USD.toFixed(2)})`);
        }
    }
    async forceCloseAllPositions() {
        try {
            if (!hyperliquid_client_1.default.isConfigured()) {
                logger_1.default.error('[RiskManager] CRITICAL: Unable to close positions - Hyperliquid client is not configured');
                return;
            }
            const accountState = await hyperliquid_client_1.default.getAccountState();
            if (accountState.positions.length === 0) {
                logger_1.default.error('[RiskManager] CRITICAL: No open exchange positions found during emergency close');
                return;
            }
            logger_1.default.error(`[RiskManager] CRITICAL: Closing ${accountState.positions.length} open position(s)`);
            await hyperliquid_client_1.default.cancelAllOrders(true);
            for (const position of accountState.positions) {
                const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
                const result = await hyperliquid_client_1.default.placeOrder({
                    symbol: position.symbol,
                    side: closeSide,
                    size: Math.abs(position.size),
                    reduceOnly: true,
                    bypassCooldown: true,
                    orderType: 'market'
                });
                if (!result.success) {
                    logger_1.default.error(`[RiskManager] CRITICAL: Failed closing ${position.symbol} ${position.side} size=${position.size}. ` +
                        `status=${result.status} error=${result.error || 'unknown'}`);
                }
                else {
                    logger_1.default.error(`[RiskManager] CRITICAL: Close submitted for ${position.symbol} ${position.side} size=${position.size} status=${result.status}`);
                }
            }
        }
        catch (error) {
            logger_1.default.error('[RiskManager] CRITICAL: Emergency position close failed:', error);
        }
        finally {
            this.positionOpenTimes.clear();
            this.positionPeakPnL.clear();
            this.positionHardStops.clear();
            this.positionTrailingStopFloors.clear();
        }
    }
    getRiskMetrics() {
        return {
            dailyPnL: this.dailyPnL,
            maxDailyLoss: this.DAILY_LOSS_CIRCUIT_BREAKER_USD,
            emergencyStop: this.emergencyStopActive,
            riskUtilization: Math.abs(this.dailyPnL) / this.DAILY_LOSS_CIRCUIT_BREAKER_USD
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
        const totalRisk = (concentrationRisk * 0.4 +
            leverageRisk * 0.4 +
            Math.abs(this.dailyPnL) / this.DAILY_LOSS_CIRCUIT_BREAKER_USD * 0.2);
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