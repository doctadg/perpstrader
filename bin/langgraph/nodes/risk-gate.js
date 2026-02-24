"use strict";
// Risk Gate Node
// Validates signals against risk constraints
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.riskGateNode = riskGateNode;
const data_manager_1 = __importDefault(require("../../data-manager/data-manager"));
const risk_manager_1 = __importDefault(require("../../risk-manager/risk-manager"));
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../../shared/logger"));
// ENHANCED: Stricter thresholds to reduce signal spam
const DEFAULT_OVERSOLD = 25;
const DEFAULT_OVERBOUGHT = 75;
const RSI_EXIT_NEUTRAL = 50;
const MAX_HOLD_TIME_MS = 30 * 60 * 1000;
const MIN_HOLD_TIME_MS = 2 * 60 * 1000;
const COOLDOWN_FACTOR = 0.5;
const MIN_ENTRY_COOLDOWN_MS = 5000; // Increased from 1000ms
const MIN_REENTRY_COOLDOWN_MS = 10000; // Increased from 2000ms
const MIN_REENTRY_MOVE_PCT = 0.001; // Increased from 0.0002 (0.1% vs 0.02%)
const FEE_PCT_ROUND_TRIP = 0.0004;
// NEW: Minimum confidence thresholds by signal type
const MIN_CONFIDENCE_EXTREME_RSI = 0.80; // RSI <= 25 or >= 75
const MIN_CONFIDENCE_MODERATE_RSI = 0.75; // RSI <= 35 or >= 65
const MIN_CONFIDENCE_BAND_TOUCH = 0.72; // Bollinger Band touches
const MIN_CONFIDENCE_DEFAULT = 0.75; // Default minimum
// NEW: Signal quality thresholds
const MIN_RSI_DIVERGENCE = 5; // Minimum RSI points from threshold for quality signal
const MAX_SIGNALS_PER_CYCLE = 1; // Only one signal per cycle per symbol
function getLatestValue(values, fallback) {
    if (!values || values.length === 0)
        return fallback;
    const value = values[values.length - 1];
    return Number.isFinite(value) ? value : fallback;
}
function parseTimeframeMs(timeframe) {
    const match = timeframe.trim().match(/^(\d+)([smhd])$/i);
    if (!match)
        return 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's')
        return value * 1000;
    if (unit === 'm')
        return value * 60 * 1000;
    if (unit === 'h')
        return value * 60 * 60 * 1000;
    if (unit === 'd')
        return value * 24 * 60 * 60 * 1000;
    return 60 * 60 * 1000;
}
function getRsiThresholds(strategy, regime) {
    const params = strategy?.parameters || {};
    const rawOversold = Number(params.oversold ??
        params.rsiOversold ??
        params.rsiLow ??
        params.rsiThreshold ??
        DEFAULT_OVERSOLD);
    const rawOverbought = Number(params.overbought ??
        params.rsiOverbought ??
        params.rsiHigh ??
        params.rsiThreshold ??
        DEFAULT_OVERBOUGHT);
    let oversold = Number.isFinite(rawOversold) ? rawOversold : DEFAULT_OVERSOLD;
    let overbought = Number.isFinite(rawOverbought) ? rawOverbought : DEFAULT_OVERBOUGHT;
    const regimeAdjust = (regime === 'LOW_VOLATILITY') ? 0 : 5;
    oversold = Math.max(15, oversold - regimeAdjust);
    overbought = Math.min(85, overbought + regimeAdjust);
    return { oversold, overbought };
}
function getSmaPeriods(strategy) {
    const params = strategy?.parameters || {};
    const fastRaw = Number(params.fastPeriod ?? params.smaFast ?? 10);
    const slowRaw = Number(params.slowPeriod ?? params.smaSlow ?? 30);
    let fast = Number.isFinite(fastRaw) ? Math.round(fastRaw) : 10;
    let slow = Number.isFinite(slowRaw) ? Math.round(slowRaw) : 30;
    if (fast < 5)
        fast = 5;
    if (slow < 10)
        slow = 10;
    if (slow <= fast)
        slow = fast + 5;
    return { fast, slow };
}
function computeSmaAt(candles, endIndex, period) {
    if (endIndex < period - 1)
        return null;
    let sum = 0;
    for (let i = endIndex - period + 1; i <= endIndex; i++) {
        sum += candles[i].close;
    }
    return sum / period;
}
function getMinExpectedMovePct(regime) {
    // INCREASED: Require more edge to justify trades
    return FEE_PCT_ROUND_TRIP * 1.5; // 150% of fees (was 101%)
}
/**
 * Calculate confidence score based on signal quality factors
 */
function calculateConfidence(baseConfidence, factors) {
    let confidence = baseConfidence;
    // Boost for strong RSI divergence
    if (factors.rsiDivergence) {
        const divergenceBoost = Math.min(factors.rsiDivergence * 0.01, 0.1);
        confidence += divergenceBoost;
    }
    // Boost for MACD alignment
    if (factors.macdAlignment) {
        confidence += 0.05;
    }
    // Boost for volume confirmation
    if (factors.volumeConfirmation) {
        confidence += 0.03;
    }
    // Penalty for trading against trend
    if (factors.trendAlignment === false) {
        confidence -= 0.15;
    }
    // Regime-based adjustments
    if (factors.regime === 'LOW_VOLATILITY') {
        confidence += 0.02; // Slight boost in low vol
    }
    else if (factors.regime === 'HIGH_VOLATILITY') {
        confidence -= 0.05; // Penalty in high vol
    }
    // Cap at 0.95 (leave room for uncertainty)
    return Math.min(Math.max(confidence, 0), 0.95);
}
/**
 * Risk Gate Node
 * Validates the selected strategy and generates a risk-assessed trading signal
 */
async function riskGateNode(state) {
    logger_1.default.info(`[RiskGateNode] Evaluating risk for ${state.selectedStrategy?.name}`);
    const openPosition = state.portfolio?.positions.find(p => p.symbol === state.symbol) || null;
    if ((!state.selectedStrategy || !state.shouldExecute) && !openPosition) {
        return {
            currentStep: 'RISK_GATE_SKIPPED',
            signal: null,
            riskAssessment: null,
            shouldExecute: false,
            thoughts: [...state.thoughts, 'No strategy selected, skipping risk evaluation'],
        };
    }
    if (!state.portfolio || !state.indicators || state.candles.length === 0) {
        return {
            currentStep: 'RISK_GATE_MISSING_DATA',
            signal: null,
            riskAssessment: null,
            shouldExecute: false,
            thoughts: [...state.thoughts, 'Missing portfolio or market data for risk evaluation'],
        };
    }
    try {
        const latestCandle = state.candles[state.candles.length - 1];
        const latestPrice = latestCandle.close;
        const latestRSI = getLatestValue(state.indicators.rsi, 50);
        const latestMACD = getLatestValue(state.indicators.macd.histogram, 0);
        const bbUpper = getLatestValue(state.indicators.bollinger.upper, 0);
        const bbLower = getLatestValue(state.indicators.bollinger.lower, 0);
        const atr = getLatestValue(state.indicators.volatility.atr, 0);
        const bbWidth = bbUpper > 0 && bbLower > 0 && bbUpper > bbLower ? (bbUpper - bbLower) / latestPrice : 0;
        const atrMovePct = atr / latestPrice;
        const bbAdjustedWidth = bbWidth < 0.0001 ? atrMovePct * 10 : bbWidth;
        const expectedMovePct = latestPrice > 0 ? Math.max(atrMovePct, bbAdjustedWidth) : 0.001;
        const minExpectedMovePct = getMinExpectedMovePct(state.regime);
        const recentTrades = await data_manager_1.default.getTrades(undefined, state.symbol, 1);
        const lastTrade = recentTrades[0] || null;
        const positionStrategy = lastTrade?.strategyId ? await data_manager_1.default.getStrategy(lastTrade.strategyId) : null;
        const activeStrategy = positionStrategy || state.selectedStrategy;
        let action = 'HOLD';
        let baseConfidence = 0.5;
        let reason = 'No clear signal';
        let isExitSignal = false;
        let signalFactors = {
            macdAlignment: false,
            volumeConfirmation: false,
            trendAlignment: true,
            regime: state.regime
        };
        if (openPosition) {
            const stopLoss = activeStrategy?.riskParameters.stopLoss ?? 0.03;
            const takeProfit = activeStrategy?.riskParameters.takeProfit ?? 0.06;
            const pnlPct = openPosition.side === 'LONG'
                ? (latestPrice - openPosition.entryPrice) / openPosition.entryPrice
                : (openPosition.entryPrice - latestPrice) / latestPrice;
            const positionAgeMs = Date.now() - new Date(openPosition.entryTime || Date.now()).getTime();
            if (pnlPct <= -stopLoss) {
                action = openPosition.side === 'LONG' ? 'SELL' : 'BUY';
                baseConfidence = 0.9;
                reason = 'Stop loss hit';
                isExitSignal = true;
            }
            else if (pnlPct >= takeProfit) {
                action = openPosition.side === 'LONG' ? 'SELL' : 'BUY';
                baseConfidence = 0.85;
                reason = 'Take profit hit';
                isExitSignal = true;
            }
            else if (positionAgeMs > MIN_HOLD_TIME_MS) {
                const rsiExitThreshold = RSI_EXIT_NEUTRAL;
                if (openPosition.side === 'SHORT' && latestRSI < rsiExitThreshold && pnlPct > 0) {
                    action = 'BUY';
                    baseConfidence = 0.75;
                    reason = `RSI mean reversion exit (${latestRSI.toFixed(1)} < ${rsiExitThreshold})`;
                    isExitSignal = true;
                }
                else if (openPosition.side === 'LONG' && latestRSI > rsiExitThreshold && pnlPct > 0) {
                    action = 'SELL';
                    baseConfidence = 0.75;
                    reason = `RSI mean reversion exit (${latestRSI.toFixed(1)} > ${rsiExitThreshold})`;
                    isExitSignal = true;
                }
                else if (positionAgeMs > MAX_HOLD_TIME_MS) {
                    action = openPosition.side === 'LONG' ? 'SELL' : 'BUY';
                    baseConfidence = 0.7;
                    reason = `Max hold time reached (${(positionAgeMs / 60000).toFixed(1)}min)`;
                    isExitSignal = true;
                }
            }
        }
        if (!isExitSignal && activeStrategy) {
            switch (activeStrategy.type) {
                case 'TREND_FOLLOWING':
                    const { fast, slow } = getSmaPeriods(activeStrategy);
                    if (state.candles.length >= slow + 1) {
                        const lastIndex = state.candles.length - 1;
                        const prevIndex = lastIndex - 1;
                        const fastPrev = computeSmaAt(state.candles, prevIndex, fast);
                        const slowPrev = computeSmaAt(state.candles, prevIndex, slow);
                        const fastNow = computeSmaAt(state.candles, lastIndex, fast);
                        const slowNow = computeSmaAt(state.candles, lastIndex, slow);
                        if (fastPrev !== null && slowPrev !== null && fastNow !== null && slowNow !== null) {
                            if (fastNow > slowNow && fastPrev <= slowPrev) {
                                action = 'BUY';
                                baseConfidence = 0.72;
                                reason = 'SMA crossover up';
                                signalFactors.macdAlignment = latestMACD > 0;
                            }
                            else if (fastNow < slowNow && fastPrev >= slowPrev) {
                                action = 'SELL';
                                baseConfidence = 0.72;
                                reason = 'SMA crossover down';
                                signalFactors.macdAlignment = latestMACD < 0;
                            }
                        }
                    }
                    break;
                case 'MEAN_REVERSION':
                    const { oversold, overbought } = getRsiThresholds(activeStrategy, state.regime);
                    const hasBands = bbUpper > 0 && bbLower > 0 && bbUpper !== bbLower;
                    const bandBufferPct = hasBands ? Math.min(0.005, expectedMovePct * 0.5) : 0;
                    const belowLowerBand = hasBands ? latestPrice <= bbLower * (1 + bandBufferPct) : false;
                    const aboveUpperBand = hasBands ? latestPrice >= bbUpper * (1 - bandBufferPct) : false;
                    // Strict thresholds for quality signals
                    const rsiVeryOversold = latestRSI <= oversold;
                    const rsiVeryOverbought = latestRSI >= overbought;
                    const rsiModeratelyOversold = latestRSI <= oversold + 10;
                    const rsiModeratelyOverbought = latestRSI >= overbought - 10;
                    const isLowVol = state.regime === 'LOW_VOLATILITY';
                    const buyThreshold = isLowVol ? oversold : oversold + 5;
                    const sellThreshold = isLowVol ? overbought : overbought - 5;
                    // Check trend alignment
                    const isDowntrend = state.regime === 'TRENDING_DOWN';
                    const isUptrend = state.regime === 'TRENDING_UP';
                    // BUY conditions
                    if (latestRSI <= buyThreshold || belowLowerBand || (rsiModeratelyOversold && latestMACD > 0)) {
                        if (!isDowntrend) {
                            action = 'BUY';
                            // Calculate confidence based on signal quality
                            if (latestRSI <= buyThreshold) {
                                baseConfidence = MIN_CONFIDENCE_EXTREME_RSI;
                                reason = `RSI oversold (${latestRSI.toFixed(1)} <= ${buyThreshold})`;
                                signalFactors.rsiDivergence = buyThreshold - latestRSI;
                            }
                            else if (belowLowerBand) {
                                baseConfidence = MIN_CONFIDENCE_BAND_TOUCH;
                                reason = 'Price at lower BB band';
                            }
                            else {
                                baseConfidence = MIN_CONFIDENCE_MODERATE_RSI;
                                reason = 'RSI moderate oversold + MACD positive';
                            }
                            signalFactors.macdAlignment = latestMACD > 0;
                            signalFactors.trendAlignment = !isDowntrend;
                        }
                    }
                    // SELL conditions
                    else if (latestRSI >= sellThreshold || aboveUpperBand || (rsiModeratelyOverbought && latestMACD < 0)) {
                        if (!isUptrend) {
                            action = 'SELL';
                            if (latestRSI >= sellThreshold) {
                                baseConfidence = MIN_CONFIDENCE_EXTREME_RSI;
                                reason = `RSI overbought (${latestRSI.toFixed(1)} >= ${sellThreshold})`;
                                signalFactors.rsiDivergence = latestRSI - sellThreshold;
                            }
                            else if (aboveUpperBand) {
                                baseConfidence = MIN_CONFIDENCE_BAND_TOUCH;
                                reason = 'Price at upper BB band';
                            }
                            else {
                                baseConfidence = MIN_CONFIDENCE_MODERATE_RSI;
                                reason = 'RSI moderate overbought + MACD negative';
                            }
                            signalFactors.macdAlignment = latestMACD < 0;
                            signalFactors.trendAlignment = !isUptrend;
                        }
                    }
                    break;
                case 'AI_PREDICTION':
                    if (state.similarPatterns.length > 0) {
                        const bullishPatterns = state.similarPatterns.filter(p => p.outcome === 'BULLISH');
                        const bearishPatterns = state.similarPatterns.filter(p => p.outcome === 'BEARISH');
                        if (bullishPatterns.length > bearishPatterns.length * 1.5) {
                            action = 'BUY';
                            baseConfidence = 0.72;
                            reason = 'Historical patterns suggest bullish outcome';
                        }
                        else if (bearishPatterns.length > bullishPatterns.length * 1.5) {
                            action = 'SELL';
                            baseConfidence = 0.72;
                            reason = 'Historical patterns suggest bearish outcome';
                        }
                    }
                    break;
                default:
                    // Default strategy with strict thresholds
                    if (latestRSI <= DEFAULT_OVERSOLD) {
                        action = 'BUY';
                        baseConfidence = MIN_CONFIDENCE_EXTREME_RSI;
                        reason = `RSI extremely oversold (${latestRSI.toFixed(1)})`;
                        signalFactors.rsiDivergence = DEFAULT_OVERSOLD - latestRSI;
                        signalFactors.macdAlignment = latestMACD > 0;
                    }
                    else if (latestRSI >= DEFAULT_OVERBOUGHT) {
                        action = 'SELL';
                        baseConfidence = MIN_CONFIDENCE_EXTREME_RSI;
                        reason = `RSI extremely overbought (${latestRSI.toFixed(1)})`;
                        signalFactors.rsiDivergence = latestRSI - DEFAULT_OVERBOUGHT;
                        signalFactors.macdAlignment = latestMACD < 0;
                    }
                    else if (latestRSI < 35 && latestMACD > 0) {
                        action = 'BUY';
                        baseConfidence = MIN_CONFIDENCE_MODERATE_RSI;
                        reason = 'RSI oversold + MACD positive';
                        signalFactors.macdAlignment = true;
                    }
                    else if (latestRSI > 65 && latestMACD < 0) {
                        action = 'SELL';
                        baseConfidence = MIN_CONFIDENCE_MODERATE_RSI;
                        reason = 'RSI overbought + MACD negative';
                        signalFactors.macdAlignment = true;
                    }
                    else if (bbLower > 0 && latestPrice <= bbLower * 1.005) {
                        action = 'BUY';
                        baseConfidence = MIN_CONFIDENCE_BAND_TOUCH;
                        reason = 'Price at lower Bollinger Band';
                    }
                    else if (bbUpper > 0 && latestPrice >= bbUpper * 0.995) {
                        action = 'SELL';
                        baseConfidence = MIN_CONFIDENCE_BAND_TOUCH;
                        reason = 'Price at upper Bollinger Band';
                    }
                    break;
            }
        }
        // Calculate final confidence with quality factors
        let confidence = calculateConfidence(baseConfidence, signalFactors);
        if (!openPosition && !isExitSignal && action !== 'HOLD' && expectedMovePct < minExpectedMovePct) {
            return {
                currentStep: 'RISK_GATE_LOW_EDGE',
                signal: null,
                riskAssessment: null,
                shouldExecute: false,
                thoughts: [
                    ...state.thoughts,
                    `Expected move too small (${(expectedMovePct * 100).toFixed(2)}%), skipping trade`,
                ],
            };
        }
        // ENHANCED: Stricter cooldown checks
        if (!openPosition && lastTrade) {
            const baseCooldownMs = parseTimeframeMs(state.timeframe) * COOLDOWN_FACTOR;
            const entryCooldownMs = Math.max(baseCooldownMs, MIN_ENTRY_COOLDOWN_MS);
            const reentryCooldownMs = Math.max(baseCooldownMs, MIN_REENTRY_COOLDOWN_MS);
            const cooldownMs = lastTrade.entryExit === 'EXIT' ? reentryCooldownMs : entryCooldownMs;
            const lastTradeAgeMs = Date.now() - lastTrade.timestamp.getTime();
            const reentryPriceMove = lastTrade.price > 0
                ? Math.abs(latestPrice - lastTrade.price) / lastTrade.price
                : 1;
            if (action !== 'HOLD' && lastTradeAgeMs < cooldownMs) {
                return {
                    currentStep: 'RISK_GATE_COOLDOWN',
                    signal: null,
                    riskAssessment: null,
                    shouldExecute: false,
                    thoughts: [
                        ...state.thoughts,
                        `Cooldown active for ${state.symbol} (${(lastTradeAgeMs / 1000).toFixed(0)}s/${(cooldownMs / 1000).toFixed(0)}s), skipping new entry`,
                    ],
                };
            }
            if (action !== 'HOLD' && lastTrade.entryExit === 'EXIT' && reentryPriceMove < MIN_REENTRY_MOVE_PCT) {
                return {
                    currentStep: 'RISK_GATE_REENTRY_WAIT',
                    signal: null,
                    riskAssessment: null,
                    shouldExecute: false,
                    thoughts: [
                        ...state.thoughts,
                        `Price has not moved enough since last exit (${(reentryPriceMove * 100).toFixed(3)}% < ${(MIN_REENTRY_MOVE_PCT * 100).toFixed(3)}%), skipping re-entry`,
                    ],
                };
            }
        }
        if (openPosition && action !== 'HOLD') {
            const sameSide = (openPosition.side === 'LONG' && action === 'BUY') ||
                (openPosition.side === 'SHORT' && action === 'SELL');
            if (sameSide) {
                return {
                    currentStep: 'RISK_GATE_HOLD_POSITION',
                    signal: null,
                    riskAssessment: null,
                    shouldExecute: false,
                    thoughts: [...state.thoughts, 'Open position aligned with signal, holding'],
                };
            }
            isExitSignal = true;
            confidence = Math.max(confidence, 0.75);
            reason = `${reason} (exit)`;
        }
        if (action === 'HOLD') {
            return {
                currentStep: 'RISK_GATE_NO_SIGNAL',
                signal: null,
                riskAssessment: null,
                shouldExecute: false,
                thoughts: [...state.thoughts, 'No actionable signal generated'],
            };
        }
        // ENHANCED: Final confidence check before creating signal
        if (confidence < MIN_CONFIDENCE_DEFAULT) {
            return {
                currentStep: 'RISK_GATE_LOW_CONFIDENCE',
                signal: null,
                riskAssessment: null,
                shouldExecute: false,
                thoughts: [
                    ...state.thoughts,
                    `Signal ${action} ${state.symbol} rejected: confidence ${confidence.toFixed(2)} below threshold ${MIN_CONFIDENCE_DEFAULT}`,
                ],
            };
        }
        // Create signal with calculated confidence
        const signal = {
            id: (0, uuid_1.v4)(),
            symbol: state.symbol,
            action,
            size: activeStrategy?.riskParameters.maxPositionSize || 0,
            price: latestPrice,
            type: 'MARKET',
            timestamp: new Date(),
            confidence,
            strategyId: activeStrategy?.id || lastTrade?.strategyId || (0, uuid_1.v4)(),
            reason,
        };
        let riskAssessment;
        if (isExitSignal && openPosition) {
            signal.size = Math.abs(openPosition.size);
            riskAssessment = {
                approved: true,
                suggestedSize: signal.size,
                riskScore: 0,
                warnings: ['Exit signal'],
                stopLoss: 0,
                takeProfit: 0,
                leverage: openPosition.leverage,
            };
        }
        else {
            riskAssessment = await risk_manager_1.default.evaluateSignal(signal, state.portfolio);
        }
        if (!riskAssessment.approved) {
            logger_1.default.info(`[RiskGateNode] Signal rejected: ${riskAssessment.warnings.join(', ')}`);
            return {
                currentStep: 'RISK_GATE_REJECTED',
                signal,
                riskAssessment,
                shouldExecute: false,
                thoughts: [
                    ...state.thoughts,
                    `Signal ${action} ${state.symbol} rejected by risk manager`,
                    ...riskAssessment.warnings,
                ],
            };
        }
        signal.size = riskAssessment.suggestedSize;
        logger_1.default.info(`[RiskGateNode] Signal approved: ${action} ${state.symbol} x${signal.size.toFixed(4)} (confidence: ${confidence.toFixed(2)})`);
        return {
            currentStep: 'RISK_GATE_APPROVED',
            signal,
            riskAssessment,
            shouldExecute: true,
            thoughts: [
                ...state.thoughts,
                `Signal approved: ${action} ${state.symbol}`,
                `Confidence: ${confidence.toFixed(2)}, Size: ${signal.size.toFixed(4)}, Risk Score: ${riskAssessment.riskScore}`,
                `Stop Loss: ${riskAssessment.stopLoss.toFixed(2)}, Take Profit: ${riskAssessment.takeProfit.toFixed(2)}`,
            ],
        };
    }
    catch (error) {
        logger_1.default.error('[RiskGateNode] Risk evaluation failed:', error);
        return {
            currentStep: 'RISK_GATE_ERROR',
            signal: null,
            riskAssessment: null,
            shouldExecute: false,
            errors: [...state.errors, `Risk evaluation error: ${error}`],
        };
    }
}
exports.default = riskGateNode;
//# sourceMappingURL=risk-gate.js.map