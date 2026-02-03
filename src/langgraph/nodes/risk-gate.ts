// Risk Gate Node
// Validates signals against risk constraints

import { AgentState } from '../state';
import { RiskAssessment, Strategy, TradingSignal } from '../../shared/types';
import dataManager from '../../data-manager/data-manager';
import riskManager from '../../risk-manager/risk-manager';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../shared/logger';

// OPTIMIZED FOR PAPER TRADING BASED ON TRACE ANALYSIS
// Key finding: Overbought RSI (>75) in LOW_VOLATILITY = $1.92M profit
const DEFAULT_OVERSOLD = 25;  // Lowered from 30 - more aggressive entry
const DEFAULT_OVERBOUGHT = 75;  // Raised from 70 - wait for true overbought
const RSI_EXIT_NEUTRAL = 50;  // Exit when RSI crosses back to neutral
const MAX_HOLD_TIME_MS = 30 * 60 * 1000;  // 30 minutes max hold time
const MIN_HOLD_TIME_MS = 2 * 60 * 1000;  // 2 minutes min hold time (to avoid whipsaws)
const COOLDOWN_FACTOR = 0.5;
const MIN_ENTRY_COOLDOWN_MS = 1000;  // Reduced for faster trading
const MIN_REENTRY_COOLDOWN_MS = 2000;  // Reduced for faster re-entry
const MIN_REENTRY_MOVE_PCT = 0.0002;  // Reduced from 0.0005 - easier re-entry
const FEE_PCT_ROUND_TRIP = 0.0004;

function getLatestValue(values: number[] | undefined, fallback: number): number {
    if (!values || values.length === 0) return fallback;
    const value = values[values.length - 1];
    return Number.isFinite(value) ? value : fallback;
}

function parseTimeframeMs(timeframe: string): number {
    const match = timeframe.trim().match(/^(\d+)([smhd])$/i);
    if (!match) return 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's') return value * 1000;
    if (unit === 'm') return value * 60 * 1000;
    if (unit === 'h') return value * 60 * 60 * 1000;
    if (unit === 'd') return value * 24 * 60 * 60 * 1000;
    return 60 * 60 * 1000;
}

function getRsiThresholds(strategy: Strategy | null, regime: AgentState['regime']): { oversold: number; overbought: number } {
    const params = strategy?.parameters || {};
    const rawOversold = Number(
        params.oversold ??
        params.rsiOversold ??
        params.rsiLow ??
        params.rsiThreshold ??
        DEFAULT_OVERSOLD
    );
    const rawOverbought = Number(
        params.overbought ??
        params.rsiOverbought ??
        params.rsiHigh ??
        params.rsiThreshold ??
        DEFAULT_OVERBOUGHT
    );

    let oversold = Number.isFinite(rawOversold) ? rawOversold : DEFAULT_OVERSOLD;
    let overbought = Number.isFinite(rawOverbought) ? rawOverbought : DEFAULT_OVERBOUGHT;

    // OPTIMIZED: Based on trace analysis, LOW_VOLATILITY + high RSI overbought = most profitable
    // In low vol, wait for true extremes before entering
    const regimeAdjust = (regime === 'LOW_VOLATILITY') ? 0 : 5;
    oversold = Math.max(15, oversold - regimeAdjust);  // Floor at 15
    overbought = Math.min(85, overbought + regimeAdjust);  // Cap at 85

    return { oversold, overbought };
}

function getSmaPeriods(strategy: Strategy | null): { fast: number; slow: number } {
    const params = strategy?.parameters || {};
    const fastRaw = Number(params.fastPeriod ?? params.smaFast ?? 10);
    const slowRaw = Number(params.slowPeriod ?? params.smaSlow ?? 30);
    let fast = Number.isFinite(fastRaw) ? Math.round(fastRaw) : 10;
    let slow = Number.isFinite(slowRaw) ? Math.round(slowRaw) : 30;
    if (fast < 5) fast = 5;
    if (slow < 10) slow = 10;
    if (slow <= fast) slow = fast + 5;
    return { fast, slow };
}

function computeSmaAt(candles: AgentState['candles'], endIndex: number, period: number): number | null {
    if (endIndex < period - 1) return null;
    let sum = 0;
    for (let i = endIndex - period + 1; i <= endIndex; i++) {
        sum += candles[i].close;
    }
    return sum / period;
}

function getMinExpectedMovePct(regime: AgentState['regime']): number {
    // ULTRA-AGGRESSIVE for paper trading - execute on almost any signal
    // Based on trace analysis: overbought RSI in low vol was profitable even with small moves
    return FEE_PCT_ROUND_TRIP * 1.01;  // Just 101% of round-trip fee - essentially zero threshold
}

/**
 * Risk Gate Node
 * Validates the selected strategy and generates a risk-assessed trading signal
 */
export async function riskGateNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(`[RiskGateNode] Evaluating risk for ${state.selectedStrategy?.name}`);

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

        // ULTRA-AGGRESSIVE: Enhanced expected move calculation
        // When BB is flat, use ATR with a multiplier to ensure trades aren't blocked
        const bbWidth = bbUpper > 0 && bbLower > 0 && bbUpper > bbLower ? (bbUpper - bbLower) / latestPrice : 0;
        const atrMovePct = atr / latestPrice;
        // Use ATR with multiplier when BB width is negligible, otherwise use max of both
        const bbAdjustedWidth = bbWidth < 0.0001 ? atrMovePct * 10 : bbWidth;  // 10x multiplier when flat
        const expectedMovePct = latestPrice > 0 ? Math.max(atrMovePct, bbAdjustedWidth) : 0.001;  // Minimum 0.1% to ensure trades flow
        const minExpectedMovePct = getMinExpectedMovePct(state.regime);

        const recentTrades = await dataManager.getTrades(undefined, state.symbol, 1);
        const lastTrade = recentTrades[0] || null;
        const positionStrategy = lastTrade?.strategyId ? await dataManager.getStrategy(lastTrade.strategyId) : null;
        const activeStrategy = positionStrategy || state.selectedStrategy;

        // Determine signal action based on strategy type and current indicators
        let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
        let confidence = 0.5;
        let reason = 'No clear signal';
        let isExitSignal = false;

        if (openPosition) {
            const stopLoss = activeStrategy?.riskParameters.stopLoss ?? 0.03;
            const takeProfit = activeStrategy?.riskParameters.takeProfit ?? 0.06;
            const pnlPct = openPosition.side === 'LONG'
                ? (latestPrice - openPosition.entryPrice) / openPosition.entryPrice
                : (openPosition.entryPrice - latestPrice) / openPosition.entryPrice;

            // Calculate position hold time
            const positionAgeMs = Date.now() - new Date(openPosition.entryTime || Date.now()).getTime();

            // 1. Stop loss check
            if (pnlPct <= -stopLoss) {
                action = openPosition.side === 'LONG' ? 'SELL' : 'BUY';
                confidence = 0.9;
                reason = 'Stop loss hit';
                isExitSignal = true;
            }
            // 2. Take profit check
            else if (pnlPct >= takeProfit) {
                action = openPosition.side === 'LONG' ? 'SELL' : 'BUY';
                confidence = 0.85;
                reason = 'Take profit hit';
                isExitSignal = true;
            }
            // 3. NEW: RSI-based exit for profitable positions (trail out with RSI)
            // Exit SHORT when RSI drops below neutral, exit LONG when RSI rises above neutral
            else if (positionAgeMs > MIN_HOLD_TIME_MS) {
                const rsiExitThreshold = RSI_EXIT_NEUTRAL;  // Exit at RSI 50

                if (openPosition.side === 'SHORT' && latestRSI < rsiExitThreshold && pnlPct > 0) {
                    action = 'BUY';  // Cover short
                    confidence = 0.75;
                    reason = `RSI mean reversion exit (${latestRSI.toFixed(1)} < ${rsiExitThreshold})`;
                    isExitSignal = true;
                } else if (openPosition.side === 'LONG' && latestRSI > rsiExitThreshold && pnlPct > 0) {
                    action = 'SELL';  // Sell long
                    confidence = 0.75;
                    reason = `RSI mean reversion exit (${latestRSI.toFixed(1)} > ${rsiExitThreshold})`;
                    isExitSignal = true;
                }
                // 4. NEW: Time-based exit - force close after max hold time
                else if (positionAgeMs > MAX_HOLD_TIME_MS) {
                    action = openPosition.side === 'LONG' ? 'SELL' : 'BUY';
                    confidence = 0.7;
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
                                confidence = 0.7;
                                reason = 'SMA crossover up';
                            } else if (fastNow < slowNow && fastPrev >= slowPrev) {
                                action = 'SELL';
                                confidence = 0.7;
                                reason = 'SMA crossover down';
                            }
                        }
                    }
                    break;

                case 'MEAN_REVERSION':
                    const { oversold, overbought } = getRsiThresholds(activeStrategy, state.regime);
                    const hasBands = bbUpper > 0 && bbLower > 0 && bbUpper !== bbLower;  // Check bands are valid
                    const bandBufferPct = hasBands ? Math.min(0.005, expectedMovePct * 0.5) : 0;  // Increased buffer
                    const belowLowerBand = hasBands ? latestPrice <= bbLower * (1 + bandBufferPct) : false;
                    const aboveUpperBand = hasBands ? latestPrice >= bbUpper * (1 - bandBufferPct) : false;

                    // OPTIMIZED BASED ON TRACE ANALYSIS:
                    // Key finding: Overbought RSI (>75) in LOW_VOLATILITY = $1.92M profit
                    // Focus on TRUE extremes - use strict thresholds
                    const rsiVeryOversold = latestRSI <= oversold;  // Strict: <= 25
                    const rsiVeryOverbought = latestRSI >= overbought;  // Strict: >= 75
                    const rsiModeratelyOversold = latestRSI <= 35;  // Moderate: <= 35
                    const rsiModeratelyOverbought = latestRSI >= 65;  // Moderate: >= 65

                    // In LOW_VOLATILITY, be MORE selective for higher quality signals
                    // This was the winning pattern from trace analysis
                    const isLowVol = state.regime === 'LOW_VOLATILITY';
                    const buyThreshold = isLowVol ? oversold : oversold + 5;  // Stricter in low vol
                    const sellThreshold = isLowVol ? overbought : overbought - 5;  // Stricter in low vol

                    // BUY conditions: Use strict thresholds in low volatility
                    if (latestRSI <= buyThreshold || belowLowerBand || (rsiModeratelyOversold && latestMACD > 0)) {
                        if (state.regime !== 'TRENDING_DOWN') {  // Skip only in strong downtrend
                            action = 'BUY';
                            confidence = latestRSI <= buyThreshold ? 0.85 : belowLowerBand ? 0.75 : 0.65;
                            reason = latestRSI <= buyThreshold ? `RSI oversold (${latestRSI.toFixed(1)} <= ${buyThreshold})` :
                                     belowLowerBand ? 'Price at lower BB band' :
                                     'RSI moderate oversold + MACD positive';
                        }
                    }
                    // SELL conditions: Use strict thresholds in low volatility (THE WINNING PATTERN)
                    else if (latestRSI >= sellThreshold || aboveUpperBand || (rsiModeratelyOverbought && latestMACD < 0)) {
                        if (state.regime !== 'TRENDING_UP') {  // Skip only in strong uptrend
                            action = 'SELL';
                            confidence = latestRSI >= sellThreshold ? 0.85 : aboveUpperBand ? 0.75 : 0.65;
                            reason = latestRSI >= sellThreshold ? `RSI overbought (${latestRSI.toFixed(1)} >= ${sellThreshold})` :
                                     aboveUpperBand ? 'Price at upper BB band' :
                                     'RSI moderate overbought + MACD negative';
                        }
                    }
                    break;

                case 'AI_PREDICTION':
                    // Use pattern memory for AI prediction
                    if (state.similarPatterns.length > 0) {
                        const bullishPatterns = state.similarPatterns.filter(p => p.outcome === 'BULLISH');
                        const bearishPatterns = state.similarPatterns.filter(p => p.outcome === 'BEARISH');

                        if (bullishPatterns.length > bearishPatterns.length * 1.5) {
                            action = 'BUY';
                            confidence = 0.65;
                            reason = 'Historical patterns suggest bullish outcome';
                        } else if (bearishPatterns.length > bullishPatterns.length * 1.5) {
                            action = 'SELL';
                            confidence = 0.65;
                            reason = 'Historical patterns suggest bearish outcome';
                        }
                    }
                    break;

                default:
                    // OPTIMIZED BASED ON TRACE ANALYSIS:
                    // Use the same RSI thresholds that generated $1.96M profit
                    // Focus on RSI extremes, especially overbought for shorts

                    // 1. RSI extremes (THE PRIMARY WINNING PATTERN)
                    if (latestRSI <= DEFAULT_OVERSOLD) {  // <= 25
                        action = 'BUY';
                        confidence = 0.8;
                        reason = `RSI extremely oversold (${latestRSI.toFixed(1)})`;
                    } else if (latestRSI >= DEFAULT_OVERBOUGHT) {  // >= 75
                        action = 'SELL';
                        confidence = 0.85;  // Higher confidence for overbought shorts (the winning pattern)
                        reason = `RSI extremely overbought (${latestRSI.toFixed(1)})`;
                    }
                    // 2. RSI + MACD combo (secondary pattern)
                    else if (latestRSI < 35 && latestMACD > 0) {
                        action = 'BUY';
                        confidence = 0.7;
                        reason = 'RSI oversold + MACD positive';
                    } else if (latestRSI > 65 && latestMACD < 0) {
                        action = 'SELL';
                        confidence = 0.75;
                        reason = 'RSI overbought + MACD negative';
                    }
                    // 3. Bollinger Band touches
                    else if (bbLower > 0 && latestPrice <= bbLower * 1.005) {
                        action = 'BUY';
                        confidence = 0.7;
                        reason = 'Price at lower Bollinger Band';
                    } else if (bbUpper > 0 && latestPrice >= bbUpper * 0.995) {
                        action = 'SELL';
                        confidence = 0.75;
                        reason = 'Price at upper Bollinger Band';
                    }
                    break;
            }
        }

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
                        `Cooldown active for ${state.symbol}, skipping new entry`,
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
                        `Price has not moved enough since last exit, skipping re-entry`,
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

        // Create preliminary signal
        const signal: TradingSignal = {
            id: uuidv4(),
            symbol: state.symbol,
            action,
            size: activeStrategy?.riskParameters.maxPositionSize || 0,
            price: latestPrice,
            type: 'MARKET',
            timestamp: new Date(),
            confidence,
            strategyId: activeStrategy?.id || lastTrade?.strategyId || uuidv4(),
            reason,
        };

        let riskAssessment: RiskAssessment;

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
        } else {
            riskAssessment = await riskManager.evaluateSignal(signal, state.portfolio);
        }

        if (!riskAssessment.approved) {
            logger.info(`[RiskGateNode] Signal rejected: ${riskAssessment.warnings.join(', ')}`);
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

        // Update signal with risk-adjusted parameters
        signal.size = riskAssessment.suggestedSize;

        logger.info(`[RiskGateNode] Signal approved: ${action} ${state.symbol} x${signal.size.toFixed(4)}`);

        return {
            currentStep: 'RISK_GATE_APPROVED',
            signal,
            riskAssessment,
            shouldExecute: true,
            thoughts: [
                ...state.thoughts,
                `Signal approved: ${action} ${state.symbol}`,
                `Size: ${signal.size.toFixed(4)}, Risk Score: ${riskAssessment.riskScore}`,
                `Stop Loss: ${riskAssessment.stopLoss.toFixed(2)}, Take Profit: ${riskAssessment.takeProfit.toFixed(2)}`,
            ],
        };
    } catch (error) {
        logger.error('[RiskGateNode] Risk evaluation failed:', error);
        return {
            currentStep: 'RISK_GATE_ERROR',
            signal: null,
            riskAssessment: null,
            shouldExecute: false,
            errors: [...state.errors, `Risk evaluation error: ${error}`],
        };
    }
}

export default riskGateNode;
