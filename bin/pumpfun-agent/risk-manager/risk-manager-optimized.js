"use strict";
/**
 * Optimized Risk Manager
 * Performance improvements:
 * - Caching of risk calculations
 * - Batch risk assessments
 * - Portfolio risk memoization
 * - Efficient position tracking
 *
 * CRITICAL SAFETY FIXES:
 * - Hard stops per position that NEVER widen (suicide prevention)
 * - Circuit breaker at $30 daily loss (halt new positions)
 * - Consecutive loss cooldown (revenge prevention)
 * - Trailing take-profit to lock gains
 * - Breakeven stop after meaningful moves
 * - Time-based stops for losing positions
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedRiskManager = void 0;
const config_1 = __importDefault(require("../shared/config"));
const logger_1 = __importDefault(require("../shared/logger"));
const hyperliquid_client_1 = __importDefault(require("../execution-engine/hyperliquid-client"));
class OptimizedRiskManager {
    maxPositionSize;
    maxDailyLoss;
    maxLeverage;
    emergencyStopActive = false;
    emergencyStopReason = '';
    dailyPnL;
    lastResetDate;
    consecutiveLosses = 0;
    cooldownUntil = null;
    dailyLossAlert20Triggered = false;
    dailyLossAlert25Triggered = false;
    // CRITICAL: Per-position hard stops that NEVER widen
    positionHardStops = new Map();
    positionPeakPnL = new Map();
    positionTrailingStopFloors = new Map();
    positionOpenTimes = new Map();
    MIN_STOP_LOSS_PCT = 0.006; // 0.6% minimum
    DEFAULT_STOP_LOSS_PCT = 0.008; // 0.8% baseline
    MIN_RISK_REWARD_RATIO = 3.0; // 1:3 minimum
    HARD_CAP_MAX_LOSS_PERCENT = 0.015; // 1.5% max loss per trade
    DAILY_LOSS_CIRCUIT_BREAKER_USD = 30; // $30 hard daily stop
    DAILY_LOSS_ALERT_1_USD = 20;
    DAILY_LOSS_ALERT_2_USD = 25;
    REVENGE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour after 4 losses
    // Trailing stop parameters
    trailingStopPct = 0.45; // allow 45% retrace from peak
    trailingStopActivationPct = 0.025; // arm after +2.5%
    trailingStopMinProfitLockPct = 0.012; // lock at least +1.2%
    breakevenActivationPct = 0.03; // arm breakeven after +3.0%
    // Caches
    riskCache = new Map();
    portfolioRiskCache = null;
    positionRiskCache = new Map();
    // Cache TTLs
    RISK_CACHE_TTL_MS = 1000;
    PORTFOLIO_RISK_CACHE_TTL_MS = 5000;
    POSITION_RISK_CACHE_TTL_MS = 2000;
    MAX_CACHE_ENTRIES = 1000;
    constructor() {
        const riskConfig = config_1.default.getSection('risk');
        this.maxPositionSize = riskConfig.maxPositionSize;
        this.maxDailyLoss = riskConfig.maxDailyLoss;
        this.maxLeverage = riskConfig.maxLeverage ?? 20;
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
            this.logDailyLossApproachAlerts();
            // Emergency stop check
            if (this.emergencyStopActive) {
                return this.createRejectedAssessment(['Emergency stop is active']);
            }
            // Revenge-trading cooldown
            const cooldownRemainingMs = this.getCooldownRemainingMs();
            if (cooldownRemainingMs > 0) {
                return this.createRejectedAssessment([
                    `Trading cooldown active after ${this.consecutiveLosses} consecutive losses: ${(cooldownRemainingMs / 60000).toFixed(0)} minutes remaining`
                ]);
            }
            // Hard daily loss circuit breaker at -$30
            if (this.dailyPnL <= -this.DAILY_LOSS_CIRCUIT_BREAKER_USD) {
                this.emergencyStopReason = `Daily loss limit exceeded: $${this.dailyPnL.toFixed(2)} <= -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD}`;
                await this.activateEmergencyStop();
                return this.createRejectedAssessment([
                    `Daily loss circuit breaker triggered at $${this.dailyPnL.toFixed(2)} (hard limit: -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD})`
                ]);
            }
            // Check cache
            const signalHash = this.hashSignal(signal);
            const cacheKey = `${signalHash}_${portfolio.totalValue.toFixed(2)}`;
            const cached = this.riskCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.RISK_CACHE_TTL_MS) {
                logger_1.default.debug(`[OptimizedRiskManager] Cache hit for signal ${signal.id}`);
                return cached.assessment;
            }
            // Calculate stop loss and take profit first for R:R validation
            const { stopLoss, takeProfit } = this.calculateStopLossAndTakeProfit(signal, portfolio);
            const requiredRiskRewardRatio = Math.max(this.MIN_RISK_REWARD_RATIO, this.getRequiredRiskRewardRatio(signal.confidence));
            const riskRewardRatio = stopLoss > 0 ? takeProfit / stopLoss : 0;
            if (riskRewardRatio < requiredRiskRewardRatio) {
                return this.createRejectedAssessment([`Trade rejected: R:R 1:${riskRewardRatio.toFixed(2)} below required 1:${requiredRiskRewardRatio.toFixed(2)}`], stopLoss, takeProfit);
            }
            // Calculate position size
            const suggestedSize = this.calculatePositionSize(signal, portfolio, stopLoss);
            if (suggestedSize <= 0) {
                return this.createRejectedAssessment(['Position size resolved to 0 — trade blocked'], stopLoss, takeProfit);
            }
            // Calculate risk score
            const riskScore = this.calculateRiskScore(signal, portfolio, suggestedSize);
            const warnings = this.generateWarnings(signal, portfolio, riskScore);
            warnings.push(`R:R validated at 1:${riskRewardRatio.toFixed(2)} (required 1:${requiredRiskRewardRatio.toFixed(2)})`);
            const hasPortfolioValue = portfolio.totalValue > 100;
            const approved = hasPortfolioValue
                && riskScore < 0.7
                && !this.isCooldownActive()
                && this.dailyPnL > -this.DAILY_LOSS_CIRCUIT_BREAKER_USD
                && riskRewardRatio >= requiredRiskRewardRatio;
            const assessment = {
                approved,
                suggestedSize,
                riskScore,
                warnings,
                stopLoss,
                takeProfit,
                leverage: Math.min(20, this.maxLeverage)
            };
            this.setRiskCache(cacheKey, { assessment, timestamp: Date.now(), signalHash });
            logger_1.default.info(`[OptimizedRiskManager] Risk assessment for ${signal.symbol}: score=${riskScore.toFixed(2)}, approved=${approved}`);
            return assessment;
        }
        catch (error) {
            logger_1.default.error('Risk assessment failed:', error);
            throw error;
        }
    }
    async evaluateSignals(signals, portfolio) {
        return Promise.all(signals.map(signal => this.evaluateSignal(signal, portfolio)));
    }
    createRejectedAssessment(warnings, stopLoss = 0, takeProfit = 0) {
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
    hashSignal(signal) {
        return `${signal.symbol}_${signal.action}_${signal.price}_${signal.confidence.toFixed(4)}`;
    }
    setRiskCache(key, value) {
        if (this.riskCache.size >= this.MAX_CACHE_ENTRIES) {
            const entriesToRemove = Math.floor(this.MAX_CACHE_ENTRIES * 0.2);
            const keys = Array.from(this.riskCache.keys()).slice(0, entriesToRemove);
            for (const k of keys)
                this.riskCache.delete(k);
        }
        this.riskCache.set(key, value);
    }
    calculatePositionSize(signal, portfolio, stopLossPct) {
        if (this.isCooldownActive()) {
            logger_1.default.error(`[OptimizedRiskManager] Trading cooldown active: ${Math.ceil(this.getCooldownRemainingMs() / 60000)} minute(s) remaining`);
            return 0;
        }
        const LEVERAGE = Math.min(20, Math.max(1, this.maxLeverage));
        const price = Math.max(signal.price || 0, Number.EPSILON);
        // Risk 0.5% to 1.0% of available balance per trade
        const normalizedConfidence = Math.max(0, Math.min(1, (signal.confidence - 0.5) * 2));
        const riskPercent = 0.005 + (normalizedConfidence * 0.005);
        const riskBudgetUsd = portfolio.availableBalance * riskPercent;
        const safeStopLossPct = Math.max(this.MIN_STOP_LOSS_PCT, stopLossPct);
        const targetNotionalFromRisk = riskBudgetUsd / safeStopLossPct;
        // Reduce sizing with existing exposure
        const currentExposure = this.getCurrentExposure(signal.symbol, portfolio);
        const exposureMultiplier = Math.max(0.25, 1 - currentExposure);
        const exposureAdjustedNotional = targetNotionalFromRisk * exposureMultiplier;
        // Hard notional caps
        const maxMargin = portfolio.availableBalance * 0.2;
        const maxNotionalByMargin = maxMargin * LEVERAGE;
        const maxNotionalByPortfolio = Math.max(0, portfolio.totalValue * this.maxPositionSize);
        const hardMaxNotional = Math.max(0, Math.min(maxNotionalByMargin, maxNotionalByPortfolio));
        if (hardMaxNotional <= 0) {
            logger_1.default.warn(`[OptimizedRiskManager] Blocking ${signal.symbol}: max notional resolved to 0`);
            return 0;
        }
        // Minimum notional
        const dynamicMinNotional = Math.min(250, portfolio.availableBalance * 0.1 * LEVERAGE);
        const riskAlignedMinNotional = targetNotionalFromRisk * 0.35;
        const minNotional = Math.max(10, Math.min(dynamicMinNotional, riskAlignedMinNotional, hardMaxNotional));
        let boundedNotional = Math.max(minNotional, Math.min(exposureAdjustedNotional, hardMaxNotional));
        // Halve size after 3+ consecutive losses
        const consecutiveLossMultiplier = this.consecutiveLosses >= 3 ? 0.5 : 1.0;
        if (this.consecutiveLosses >= 3) {
            logger_1.default.warn(`[OptimizedRiskManager] Revenge prevention: losses=${this.consecutiveLosses}, sizeMultiplier=0.50`);
        }
        let lossAdjustedNotional = Math.max(10, Math.min(hardMaxNotional, boundedNotional * consecutiveLossMultiplier));
        // Hard 1.5% max loss per trade cap
        const accountValue = Math.max(portfolio.totalValue, portfolio.availableBalance, 1);
        const maxAllowedRiskUsd = accountValue * this.HARD_CAP_MAX_LOSS_PERCENT;
        const calculatedRiskUsd = lossAdjustedNotional * safeStopLossPct;
        if (calculatedRiskUsd > maxAllowedRiskUsd) {
            const cappedNotional = maxAllowedRiskUsd / safeStopLossPct;
            lossAdjustedNotional = Math.max(0, Math.min(lossAdjustedNotional, cappedNotional));
            logger_1.default.warn(`[OptimizedRiskManager] Hard max-loss cap reduced ${signal.symbol}: risk=$${calculatedRiskUsd.toFixed(2)} > max=$${maxAllowedRiskUsd.toFixed(2)}`);
        }
        return lossAdjustedNotional / price;
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
        const sizeNotional = suggestedSize * Math.max(signal.price || 0, 0);
        const sizeRisk = (sizeNotional / Math.max(portfolio.totalValue, 1)) / Math.max(this.maxPositionSize, 0.0001);
        riskScore += Math.min(sizeRisk, 1) * 0.2;
        const dailyRisk = Math.max(0, -this.dailyPnL / this.DAILY_LOSS_CIRCUIT_BREAKER_USD);
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
        if (exposure > 0.15)
            warnings.push(`High concentration in ${signal.symbol}: ${(exposure * 100).toFixed(1)}%`);
        if (this.dailyPnL <= -this.DAILY_LOSS_ALERT_2_USD) {
            warnings.push(`CRITICAL: Daily loss at $${this.dailyPnL.toFixed(2)} (near -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD} limit)`);
        }
        else if (this.dailyPnL <= -this.DAILY_LOSS_ALERT_1_USD) {
            warnings.push(`CRITICAL: Daily loss warning at $${this.dailyPnL.toFixed(2)} (approaching -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD})`);
        }
        if (signal.confidence < 0.5)
            warnings.push(`Low signal confidence: ${(signal.confidence * 100).toFixed(1)}%`);
        return warnings;
    }
    normalizeStopLossPct(stopLossPct, fallback) {
        const candidate = Number.isFinite(stopLossPct) ? stopLossPct : (fallback ?? this.DEFAULT_STOP_LOSS_PCT);
        return Math.max(this.MIN_STOP_LOSS_PCT, Math.min(this.DEFAULT_STOP_LOSS_PCT, candidate));
    }
    setOrTightenHardStop(positionKey, requestedStopLossPct) {
        const candidateStop = this.normalizeStopLossPct(requestedStopLossPct);
        const existingStop = this.positionHardStops.get(positionKey);
        if (existingStop === undefined) {
            this.positionHardStops.set(positionKey, candidateStop);
            return candidateStop;
        }
        // CRITICAL: Hard stops only tighten, NEVER widen
        const tightenedStop = Math.min(existingStop, candidateStop);
        if (candidateStop > existingStop) {
            logger_1.default.warn(`[OptimizedRiskManager] PREVENTED hard-stop widening for ${positionKey}: requested ${(candidateStop * 100).toFixed(2)}% > existing ${(existingStop * 100).toFixed(2)}%`);
        }
        this.positionHardStops.set(positionKey, tightenedStop);
        return tightenedStop;
    }
    getOrInitializeHardStop(positionKey) {
        const existingStop = this.positionHardStops.get(positionKey);
        if (existingStop !== undefined)
            return this.normalizeStopLossPct(existingStop);
        const fallbackHardStop = this.MIN_STOP_LOSS_PCT;
        logger_1.default.warn(`[OptimizedRiskManager] Missing hard stop for ${positionKey}; using strict fallback ${(fallbackHardStop * 100).toFixed(2)}%`);
        this.positionHardStops.set(positionKey, fallbackHardStop);
        return fallbackHardStop;
    }
    updatePositionPeakPnL(positionKey, unrealizedPnLPct) {
        const currentPeak = this.positionPeakPnL.get(positionKey) || 0;
        if (unrealizedPnLPct > currentPeak) {
            this.positionPeakPnL.set(positionKey, unrealizedPnLPct);
            return unrealizedPnLPct;
        }
        if (!this.positionPeakPnL.has(positionKey))
            this.positionPeakPnL.set(positionKey, 0);
        return this.positionPeakPnL.get(positionKey) || 0;
    }
    getOrTightenTrailingStopFloor(positionKey, hardStopPct, peakPnLPct) {
        const baseFloor = -hardStopPct;
        const existingFloor = this.positionTrailingStopFloors.get(positionKey) ?? baseFloor;
        const trailingRetention = Math.max(0, Math.min(1, 1 - this.trailingStopPct));
        const candidateFloor = peakPnLPct >= this.trailingStopActivationPct
            ? peakPnLPct * trailingRetention
            : baseFloor;
        // Floor only tightens (moves up), never loosens
        const tightenedFloor = Math.max(existingFloor, candidateFloor);
        this.positionTrailingStopFloors.set(positionKey, tightenedFloor);
        return tightenedFloor;
    }
    calculateStopLossAndTakeProfit(signal, _portfolio) {
        const requiredRiskRewardRatio = Math.max(this.MIN_RISK_REWARD_RATIO, this.getRequiredRiskRewardRatio(signal.confidence));
        // Baseline hard stop: can only tighten from 0.8%
        let stopLoss = this.DEFAULT_STOP_LOSS_PCT;
        if (signal.confidence > 0.8) {
            stopLoss = 0.0075;
        }
        else if (signal.confidence < 0.5) {
            stopLoss = 0.0070; // low confidence: tighter stop, NOT wider
        }
        let takeProfit = stopLoss * requiredRiskRewardRatio;
        if (signal.confidence > 0.8) {
            takeProfit = Math.max(takeProfit, stopLoss * 4.0);
        }
        // CRITICAL: When losing, TIGHTEN stops and demand larger winners. NEVER widen.
        if (this.dailyPnL < 0) {
            stopLoss = Math.max(this.MIN_STOP_LOSS_PCT, stopLoss * 0.8);
            takeProfit *= 1.2;
        }
        // Enforce hard invariants
        stopLoss = this.normalizeStopLossPct(stopLoss);
        const minTakeProfit = stopLoss * requiredRiskRewardRatio;
        takeProfit = Math.max(takeProfit, minTakeProfit);
        const riskRewardRatio = takeProfit / stopLoss;
        if (riskRewardRatio < requiredRiskRewardRatio) {
            throw new Error(`Invalid R:R 1:${riskRewardRatio.toFixed(2)} (required 1:${requiredRiskRewardRatio.toFixed(1)})`);
        }
        logger_1.default.info(`[OptimizedRiskManager] SL=${(stopLoss * 100).toFixed(2)}%, TP=${(takeProfit * 100).toFixed(2)}%, ` +
            `R:R=1:${riskRewardRatio.toFixed(2)} (required 1:${requiredRiskRewardRatio.toFixed(2)})`);
        return { stopLoss, takeProfit };
    }
    getRequiredRiskRewardRatio(confidence) {
        if (confidence < 0.45)
            return 5.0;
        if (confidence < 0.60)
            return 4.0;
        return this.MIN_RISK_REWARD_RATIO;
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
            const positionNotional = Math.max(Math.abs(position.size * position.entryPrice), Number.EPSILON);
            const unrealizedPnLPercentage = position.unrealizedPnL / positionNotional;
            const positionKey = `${position.symbol}_${position.side}`;
            const trackedOpenTime = this.positionOpenTimes.get(positionKey);
            const entryTimeMs = position.entryTime ? new Date(position.entryTime).getTime() : undefined;
            const openTimeMs = trackedOpenTime ?? entryTimeMs;
            let riskScore = 0;
            const warnings = [];
            // Time-based stops
            if (openTimeMs !== undefined && Number.isFinite(openTimeMs)) {
                const holdingTimeMs = Date.now() - openTimeMs;
                // Force exit after 2h if losing
                if (holdingTimeMs > 2 * 60 * 60 * 1000 && unrealizedPnLPercentage < -0.01) {
                    warnings.push(`CRITICAL: Time-based stop (${(holdingTimeMs / 3600000).toFixed(1)}h held, ${(unrealizedPnLPercentage * 100).toFixed(2)}%)`);
                    riskScore = Math.max(riskScore, 1.0);
                }
                // Max 4 hours regardless
                if (holdingTimeMs > 4 * 60 * 60 * 1000) {
                    warnings.push(`Position holding exceeded 4h: ${(holdingTimeMs / 3600000).toFixed(1)}h`);
                    riskScore += 0.3;
                }
            }
            // CRITICAL: Hard stop that NEVER widens
            const hardStopPct = this.getOrInitializeHardStop(positionKey);
            if (unrealizedPnLPercentage <= -hardStopPct) {
                warnings.push(`CRITICAL: Hard stop triggered at -${(hardStopPct * 100).toFixed(2)}%: unrealized ${(unrealizedPnLPercentage * 100).toFixed(2)}%`);
                riskScore = Math.max(riskScore, 1.0);
            }
            // Trailing stop
            const peakPnLPct = this.updatePositionPeakPnL(positionKey, unrealizedPnLPercentage);
            const trailingStopFloorPct = this.getOrTightenTrailingStopFloor(positionKey, hardStopPct, peakPnLPct);
            const trailingStopArmed = peakPnLPct >= this.trailingStopActivationPct
                && trailingStopFloorPct >= this.trailingStopMinProfitLockPct;
            if (trailingStopArmed && unrealizedPnLPercentage <= trailingStopFloorPct) {
                const drawdownFromPeak = peakPnLPct > 0
                    ? (peakPnLPct - unrealizedPnLPercentage) / peakPnLPct : 0;
                warnings.push(`Trailing stop: current ${(unrealizedPnLPercentage * 100).toFixed(2)}% <= floor ${(trailingStopFloorPct * 100).toFixed(2)}% ` +
                    `(peak ${(peakPnLPct * 100).toFixed(2)}%, retrace ${(drawdownFromPeak * 100).toFixed(1)}%)`);
                riskScore += 0.4;
            }
            // Breakeven stop after meaningful move
            if (peakPnLPct >= this.breakevenActivationPct && unrealizedPnLPercentage <= 0) {
                warnings.push(`Breakeven stop: peak ${(peakPnLPct * 100).toFixed(2)}%, current ${(unrealizedPnLPercentage * 100).toFixed(2)}%`);
                riskScore = Math.max(riskScore, 1.0);
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
                stopLoss: this.DEFAULT_STOP_LOSS_PCT,
                takeProfit: this.DEFAULT_STOP_LOSS_PCT * this.MIN_RISK_REWARD_RATIO,
                leverage: position.leverage
            };
            this.positionRiskCache.set(cacheKey, { assessment, timestamp: Date.now() });
            if (this.positionRiskCache.size > this.MAX_CACHE_ENTRIES) {
                const keys = Array.from(this.positionRiskCache.keys()).slice(0, Math.floor(this.MAX_CACHE_ENTRIES * 0.2));
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
    async checkPositionsRisk(positions, portfolio) {
        return Promise.all(positions.map(position => this.checkPositionRisk(position, portfolio)));
    }
    /**
     * Check if a position should be closed due to any stop mechanism
     */
    shouldClosePosition(position) {
        const positionKey = `${position.symbol}_${position.side}`;
        const positionNotional = Math.max(Math.abs(position.size * position.entryPrice), Number.EPSILON);
        const unrealizedPnLPct = position.unrealizedPnL / positionNotional;
        const trackedOpenTime = this.positionOpenTimes.get(positionKey);
        const entryTimeMs = position.entryTime ? new Date(position.entryTime).getTime() : undefined;
        const openTimeMs = trackedOpenTime ?? entryTimeMs;
        // CRITICAL: Hard stop that NEVER widens
        const hardStopPct = this.getOrInitializeHardStop(positionKey);
        const peakPnLPct = this.updatePositionPeakPnL(positionKey, unrealizedPnLPct);
        const trailingStopFloorPct = this.getOrTightenTrailingStopFloor(positionKey, hardStopPct, peakPnLPct);
        // 1. Hard stop
        if (unrealizedPnLPct <= -hardStopPct) {
            logger_1.default.warn(`[OptimizedRiskManager] HARD STOP triggered for ${position.symbol}: ${(unrealizedPnLPct * 100).toFixed(2)}% <= -${(hardStopPct * 100).toFixed(2)}%`);
            return true;
        }
        // 2. Time-based stop (2h + losing)
        if (openTimeMs !== undefined && Number.isFinite(openTimeMs)) {
            const holdingTimeMs = Date.now() - openTimeMs;
            if (holdingTimeMs > 2 * 60 * 60 * 1000 && unrealizedPnLPct < -0.01) {
                logger_1.default.warn(`[OptimizedRiskManager] Time-based stop for ${position.symbol}: held ${(holdingTimeMs / 3600000).toFixed(1)}h, ${(unrealizedPnLPct * 100).toFixed(2)}%`);
                return true;
            }
        }
        // 3. Breakeven stop after +3% peak
        if (peakPnLPct >= this.breakevenActivationPct && unrealizedPnLPct <= 0) {
            logger_1.default.info(`[OptimizedRiskManager] Breakeven stop for ${position.symbol}: peak ${(peakPnLPct * 100).toFixed(2)}%, now ${(unrealizedPnLPct * 100).toFixed(2)}%`);
            return true;
        }
        // 4. Trailing stop
        const trailingStopArmed = peakPnLPct >= this.trailingStopActivationPct
            && trailingStopFloorPct >= this.trailingStopMinProfitLockPct;
        if (trailingStopArmed && unrealizedPnLPct <= trailingStopFloorPct) {
            const drawdownFromPeak = peakPnLPct > 0 ? (peakPnLPct - unrealizedPnLPct) / peakPnLPct : 0;
            logger_1.default.info(`[OptimizedRiskManager] Trailing stop for ${position.symbol}: ` +
                `current ${(unrealizedPnLPct * 100).toFixed(2)}% <= floor ${(trailingStopFloorPct * 100).toFixed(2)}% ` +
                `(peak ${(peakPnLPct * 100).toFixed(2)}%, retrace ${(drawdownFromPeak * 100).toFixed(1)}%)`);
            return true;
        }
        return false;
    }
    /**
     * Register a new position open for tracking
     */
    registerPositionOpen(symbol, side, stopLossPct) {
        const positionKey = `${symbol}_${side}`;
        this.positionOpenTimes.set(positionKey, Date.now());
        const hardStop = this.setOrTightenHardStop(positionKey, stopLossPct ?? this.DEFAULT_STOP_LOSS_PCT);
        this.positionPeakPnL.set(positionKey, 0);
        this.positionTrailingStopFloors.set(positionKey, -hardStop);
        logger_1.default.info(`[OptimizedRiskManager] Position registered: ${positionKey} with HARD STOP at -${(hardStop * 100).toFixed(2)}%`);
    }
    /**
     * Clear position tracking when closed
     */
    clearPositionTracking(symbol, side) {
        const positionKey = `${symbol}_${side}`;
        this.positionOpenTimes.delete(positionKey);
        this.positionPeakPnL.delete(positionKey);
        this.positionHardStops.delete(positionKey);
        this.positionTrailingStopFloors.delete(positionKey);
        logger_1.default.info(`[OptimizedRiskManager] Position tracking cleared: ${positionKey}`);
    }
    // --- Cooldown / Revenge prevention ---
    isCooldownActive() {
        return this.cooldownUntil !== null && Date.now() < this.cooldownUntil;
    }
    getCooldownRemainingMs() {
        if (!this.isCooldownActive() || this.cooldownUntil === null)
            return 0;
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
            logger_1.default.error(`[OptimizedRiskManager] CRITICAL: ${this.consecutiveLosses} consecutive losses — trading halted for 1 hour`);
        }
    }
    // --- Daily PnL ---
    updateDailyPnL(pnl) {
        if (pnl < 0)
            this.trackTradeResult(false);
        else if (pnl > 0)
            this.trackTradeResult(true);
        this.dailyPnL += pnl;
        logger_1.default.info(`Daily P&L updated: ${this.dailyPnL.toFixed(2)}`);
        this.logDailyLossApproachAlerts();
        if (this.dailyPnL <= -this.DAILY_LOSS_CIRCUIT_BREAKER_USD && !this.emergencyStopActive) {
            logger_1.default.error(`CRITICAL: Daily loss circuit breaker at $${this.dailyPnL.toFixed(2)} (limit -$${this.DAILY_LOSS_CIRCUIT_BREAKER_USD})`);
            this.emergencyStopReason = `Daily loss limit exceeded: $${this.dailyPnL.toFixed(2)}`;
            void this.activateEmergencyStop();
        }
    }
    resetDailyPnLIfNeeded() {
        const today = new Date();
        if (today.toDateString() !== this.lastResetDate.toDateString()) {
            this.dailyPnL = 0;
            this.lastResetDate = today;
            this.dailyLossAlert20Triggered = false;
            this.dailyLossAlert25Triggered = false;
            this.riskCache.clear();
            this.portfolioRiskCache = null;
            logger_1.default.info('Daily P&L reset for new day');
        }
    }
    logDailyLossApproachAlerts() {
        if (this.dailyPnL <= -this.DAILY_LOSS_ALERT_1_USD && !this.dailyLossAlert20Triggered) {
            this.dailyLossAlert20Triggered = true;
            logger_1.default.error(`CRITICAL: Approaching daily loss breaker: PnL=$${this.dailyPnL.toFixed(2)} (threshold -$${this.DAILY_LOSS_ALERT_1_USD})`);
        }
        if (this.dailyPnL <= -this.DAILY_LOSS_ALERT_2_USD && !this.dailyLossAlert25Triggered) {
            this.dailyLossAlert25Triggered = true;
            logger_1.default.error(`CRITICAL: Approaching daily loss breaker: PnL=$${this.dailyPnL.toFixed(2)} (threshold -$${this.DAILY_LOSS_ALERT_2_USD})`);
        }
    }
    async activateEmergencyStop() {
        try {
            logger_1.default.warn('EMERGENCY STOP ACTIVATED');
            if (this.emergencyStopReason)
                logger_1.default.error(`Reason: ${this.emergencyStopReason}`);
            this.emergencyStopActive = true;
            await this.forceCloseAllPositions();
            logger_1.default.error('Emergency stop activated — all trading halted');
        }
        catch (error) {
            logger_1.default.error('Emergency stop failed:', error);
            throw error;
        }
    }
    async forceCloseAllPositions() {
        try {
            if (!hyperliquid_client_1.default.isConfigured()) {
                logger_1.default.error('[OptimizedRiskManager] CRITICAL: Cannot close positions — Hyperliquid client not configured');
                return;
            }
            const accountState = await hyperliquid_client_1.default.getAccountState();
            if (accountState.positions.length === 0)
                return;
            logger_1.default.error(`[OptimizedRiskManager] CRITICAL: Closing ${accountState.positions.length} position(s)`);
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
                    logger_1.default.error(`[OptimizedRiskManager] Failed closing ${position.symbol}: ${result.error || 'unknown'}`);
                }
            }
        }
        catch (error) {
            logger_1.default.error('[OptimizedRiskManager] Emergency close failed:', error);
        }
        finally {
            this.positionOpenTimes.clear();
            this.positionPeakPnL.clear();
            this.positionHardStops.clear();
            this.positionTrailingStopFloors.clear();
        }
    }
    disableEmergencyStop() {
        this.emergencyStopActive = false;
        this.emergencyStopReason = '';
        logger_1.default.info('Emergency stop disabled — trading resumed');
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
        if (parameters.maxPositionSize !== undefined)
            this.maxPositionSize = parameters.maxPositionSize;
        if (parameters.maxDailyLoss !== undefined)
            this.maxDailyLoss = parameters.maxDailyLoss;
        if (parameters.maxLeverage !== undefined)
            this.maxLeverage = parameters.maxLeverage;
        this.riskCache.clear();
        this.portfolioRiskCache = null;
        logger_1.default.info('Risk parameters updated:', parameters);
    }
    isWithinLimits(positionSize, leverage) {
        return positionSize <= this.maxPositionSize && leverage <= this.maxLeverage;
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
        const totalRisk = (concentrationRisk * 0.4 + leverageRisk * 0.4 + Math.abs(this.dailyPnL) / this.DAILY_LOSS_CIRCUIT_BREAKER_USD * 0.2);
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
    clearCaches() {
        this.riskCache.clear();
        this.portfolioRiskCache = null;
        this.positionRiskCache.clear();
        logger_1.default.info('[OptimizedRiskManager] All caches cleared');
    }
    getCacheStats() {
        return {
            riskCacheSize: this.riskCache.size,
            positionRiskCacheSize: this.positionRiskCache.size,
            portfolioCacheValid: this.portfolioRiskCache !== null
        };
    }
}
exports.OptimizedRiskManager = OptimizedRiskManager;
const optimizedRiskManager = new OptimizedRiskManager();
exports.default = optimizedRiskManager;
//# sourceMappingURL=risk-manager-optimized.js.map