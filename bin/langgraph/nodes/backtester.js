"use strict";
// Backtester Node
// Performs vectorized backtesting of strategy ideas
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backtesterNode = backtesterNode;
exports.vectorizedBacktest = vectorizedBacktest;
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../../shared/logger"));
const analysis_worker_pool_1 = require("../../shared/analysis-worker-pool");
/**
 * Backtester Node
 * Tests strategy ideas against historical data using vectorized operations
 */
async function backtesterNode(state) {
    logger_1.default.info(`[BacktesterNode] Backtesting ${state.strategyIdeas.length} strategies`);
    const minCandles = 50;
    const minBacktestCandles = 100;
    if (state.strategyIdeas.length === 0) {
        return {
            currentStep: 'BACKTEST_SKIPPED',
            backtestResults: [],
            thoughts: [...state.thoughts, 'No strategy ideas to backtest'],
        };
    }
    if (state.candles.length < minCandles) {
        return {
            currentStep: 'BACKTEST_INSUFFICIENT_DATA',
            backtestResults: [],
            thoughts: [...state.thoughts, `Insufficient data for backtesting (${state.candles.length} candles)`],
        };
    }
    try {
        const results = [];
        const lowData = state.candles.length < minBacktestCandles;
        if (lowData) {
            logger_1.default.warn(`[BacktesterNode] Only ${state.candles.length} candles available, running low-confidence backtests`);
        }
        const pool = (0, analysis_worker_pool_1.getAnalysisWorkerPool)();
        if (pool) {
            try {
                const batches = splitIntoBatches(state.strategyIdeas, pool.size);
                const batchResults = await Promise.all(batches.map(batch => pool.runTask('backtestBatch', {
                    ideas: batch,
                    candles: state.candles,
                })));
                for (const batch of batchResults) {
                    results.push(...batch);
                }
            }
            catch (error) {
                logger_1.default.warn('[BacktesterNode] Worker backtest failed, falling back to main thread:', error);
                const closeSeries = buildCloseSeries(state.candles);
                for (const idea of state.strategyIdeas) {
                    const result = await vectorizedBacktest(idea, state.candles, closeSeries);
                    results.push(result);
                }
            }
        }
        else {
            const closeSeries = buildCloseSeries(state.candles);
            for (const idea of state.strategyIdeas) {
                const result = await vectorizedBacktest(idea, state.candles, closeSeries);
                results.push(result);
            }
        }
        // Sort by Sharpe ratio
        results.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
        const thoughts = [
            ...state.thoughts,
            `Backtested ${results.length} strategies`,
            ...(lowData ? [`Limited backtest window (${state.candles.length} candles); treat results as low confidence`] : []),
            ...results.slice(0, 3).map(r => `${r.strategyId}: Return ${r.totalReturn.toFixed(2)}%, Sharpe ${r.sharpeRatio.toFixed(2)}, WinRate ${r.winRate.toFixed(0)}%`),
        ];
        logger_1.default.info(`[BacktesterNode] Completed ${results.length} backtests`);
        return {
            currentStep: lowData ? 'BACKTEST_LOW_DATA' : 'BACKTEST_COMPLETE',
            backtestResults: results,
            thoughts,
        };
    }
    catch (error) {
        logger_1.default.error('[BacktesterNode] Backtesting failed:', error);
        return {
            currentStep: 'BACKTEST_ERROR',
            backtestResults: [],
            errors: [...state.errors, `Backtest error: ${error}`],
        };
    }
}
/**
 * Vectorized backtest using typed arrays for performance
 */
async function vectorizedBacktest(idea, candles, closes) {
    const strategyId = (0, uuid_1.v4)();
    const initialCapital = 10000;
    let capital = initialCapital;
    const params = idea.parameters || {};
    const getParam = (keys, fallback, min, max, integer = true) => {
        for (const key of keys) {
            const raw = params[key];
            const value = Number(raw);
            if (Number.isFinite(value)) {
                const clamped = Math.min(Math.max(value, min), max);
                return integer ? Math.round(clamped) : clamped;
            }
        }
        const clampedFallback = Math.min(Math.max(fallback, min), max);
        return integer ? Math.round(clampedFallback) : clampedFallback;
    };
    const rsiPeriod = getParam(['rsiPeriod', 'rsi_length', 'rsiLength'], 14, 5, 40);
    let oversold = getParam(['oversold', 'rsiOversold', 'rsiLow'], 35, 10, 50, false);
    let overbought = getParam(['overbought', 'rsiOverbought', 'rsiHigh'], 65, 50, 90, false);
    const bbPeriod = getParam(['bbPeriod', 'bollingerPeriod'], 20, 10, 50);
    const bbStdDev = getParam(['bbStdDev', 'bollingerStdDev'], 2, 1.5, 3.5, false);
    let fastPeriod = getParam(['fastPeriod', 'smaFast', 'fast'], 10, 5, 30);
    let slowPeriod = getParam(['slowPeriod', 'smaSlow', 'slow'], 30, 10, 80);
    if (slowPeriod <= fastPeriod) {
        slowPeriod = Math.min(fastPeriod + 5, 80);
    }
    if (oversold >= overbought) {
        oversold = Math.max(10, overbought - 20);
    }
    // Convert to typed arrays for performance
    const closeSeries = closes && closes.length === candles.length
        ? closes
        : buildCloseSeries(candles);
    // Pre-compute indicators as arrays
    const rsi = computeRSI(closeSeries, rsiPeriod);
    const [smaFast, smaSlow] = [computeSMA(closeSeries, fastPeriod), computeSMA(closeSeries, slowPeriod)];
    const [bbUpper, bbMiddle, bbLower] = computeBollingerBands(closeSeries, bbPeriod, bbStdDev);
    // Generate signals as boolean arrays
    const buySignals = new Uint8Array(closeSeries.length);
    const sellSignals = new Uint8Array(closeSeries.length);
    // Apply strategy-specific signal logic
    switch (idea.type) {
        case 'TREND_FOLLOWING':
            for (let i = Math.max(50, slowPeriod); i < closeSeries.length; i++) {
                // MA crossover
                if (smaFast[i] > smaSlow[i] && smaFast[i - 1] <= smaSlow[i - 1]) {
                    buySignals[i] = 1;
                }
                if (smaFast[i] < smaSlow[i] && smaFast[i - 1] >= smaSlow[i - 1]) {
                    sellSignals[i] = 1;
                }
            }
            break;
        case 'MEAN_REVERSION':
            for (let i = Math.max(50, bbPeriod, rsiPeriod); i < closeSeries.length; i++) {
                // Bollinger band reversion
                if (closeSeries[i] < bbLower[i] && rsi[i] < oversold) {
                    buySignals[i] = 1;
                }
                if (closeSeries[i] > bbUpper[i] && rsi[i] > overbought) {
                    sellSignals[i] = 1;
                }
            }
            break;
        default:
            // Generic momentum
            for (let i = Math.max(50, rsiPeriod); i < closeSeries.length; i++) {
                if (rsi[i] < oversold)
                    buySignals[i] = 1;
                if (rsi[i] > overbought)
                    sellSignals[i] = 1;
            }
    }
    // Simulate trades
    const trades = [];
    let position = 0;
    let entryPrice = 0;
    let entryIndex = 0;
    const warmup = Math.max(50, slowPeriod, bbPeriod, rsiPeriod);
    for (let i = warmup; i < closeSeries.length; i++) {
        const price = closeSeries[i];
        if (buySignals[i] && position <= 0) {
            // Close short if exists
            if (position < 0) {
                const pnl = (entryPrice - price) * Math.abs(position);
                capital += pnl;
                trades.push(createTrade(strategyId, idea.symbols[0], 'BUY', Math.abs(position), price, pnl, candles[i].timestamp, 'EXIT'));
            }
            // Open long
            const size = (capital * idea.riskParameters.maxPositionSize) / price;
            position = size;
            entryPrice = price;
            entryIndex = i;
            trades.push(createTrade(strategyId, idea.symbols[0], 'BUY', size, price, 0, candles[i].timestamp, 'ENTRY'));
        }
        else if (sellSignals[i] && position >= 0) {
            // Close long if exists
            if (position > 0) {
                const pnl = (price - entryPrice) * position;
                capital += pnl;
                trades.push(createTrade(strategyId, idea.symbols[0], 'SELL', position, price, pnl, candles[i].timestamp, 'EXIT'));
            }
            // Open short
            const size = (capital * idea.riskParameters.maxPositionSize) / price;
            position = -size;
            entryPrice = price;
            entryIndex = i;
            trades.push(createTrade(strategyId, idea.symbols[0], 'SELL', size, price, 0, candles[i].timestamp, 'ENTRY'));
        }
        // Check stop loss / take profit
        if (position !== 0) {
            const unrealizedPnL = position > 0
                ? (price - entryPrice) / entryPrice
                : (entryPrice - price) / entryPrice;
            if (unrealizedPnL <= -idea.riskParameters.stopLoss) {
                // Stop loss hit
                const pnl = position > 0 ? (price - entryPrice) * position : (entryPrice - price) * Math.abs(position);
                capital += pnl;
                trades.push(createTrade(strategyId, idea.symbols[0], position > 0 ? 'SELL' : 'BUY', Math.abs(position), price, pnl, candles[i].timestamp, 'EXIT'));
                position = 0;
            }
            else if (unrealizedPnL >= idea.riskParameters.takeProfit) {
                // Take profit hit
                const pnl = position > 0 ? (price - entryPrice) * position : (entryPrice - price) * Math.abs(position);
                capital += pnl;
                trades.push(createTrade(strategyId, idea.symbols[0], position > 0 ? 'SELL' : 'BUY', Math.abs(position), price, pnl, candles[i].timestamp, 'EXIT'));
                position = 0;
            }
        }
    }
    // Close any remaining position
    if (position !== 0) {
        const price = closeSeries[closeSeries.length - 1];
        const pnl = position > 0 ? (price - entryPrice) * position : (entryPrice - price) * Math.abs(position);
        capital += pnl;
        trades.push(createTrade(strategyId, idea.symbols[0], position > 0 ? 'SELL' : 'BUY', Math.abs(position), price, pnl, candles[candles.length - 1].timestamp, 'EXIT'));
    }
    // Calculate metrics
    return calculateMetrics(strategyId, trades, initialCapital, capital, candles);
}
function createTrade(strategyId, symbol, side, size, price, pnl, timestamp, entryExit) {
    return {
        id: (0, uuid_1.v4)(),
        strategyId,
        symbol,
        side,
        size,
        price,
        fee: price * size * 0.0005,
        pnl,
        timestamp,
        type: 'MARKET',
        status: 'FILLED',
        entryExit,
    };
}
function calculateMetrics(strategyId, trades, initialCapital, finalCapital, candles) {
    const exitTrades = trades.filter(t => t.entryExit === 'EXIT');
    const winningTrades = exitTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = exitTrades.filter(t => (t.pnl || 0) < 0);
    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
    const winRate = exitTrades.length > 0 ? (winningTrades.length / exitTrades.length) * 100 : 0;
    // Calculate max drawdown
    let maxDrawdown = 0;
    let peak = initialCapital;
    let runningCapital = initialCapital;
    for (const trade of exitTrades) {
        runningCapital += trade.pnl || 0;
        peak = Math.max(peak, runningCapital);
        const drawdown = ((peak - runningCapital) / peak) * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    // Calculate Sharpe ratio
    const returns = exitTrades.map(t => (t.pnl || 0) / initialCapital);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
        ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length)
        : 1;
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;
    // Calculate profit factor
    const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
    return {
        strategyId,
        period: {
            start: candles[0]?.timestamp || new Date(),
            end: candles[candles.length - 1]?.timestamp || new Date(),
        },
        initialCapital,
        finalCapital,
        totalReturn,
        annualizedReturn: totalReturn * (365 / 30), // Assuming ~1 month of data
        sharpeRatio,
        maxDrawdown,
        winRate,
        totalTrades: exitTrades.length,
        trades,
        metrics: {
            calmarRatio: maxDrawdown > 0 ? totalReturn / maxDrawdown : 0,
            sortinoRatio: sharpeRatio * 1.2, // Simplified
            var95: maxDrawdown * 0.8, // Simplified
            beta: 1,
            alpha: totalReturn - 5, // Assuming 5% market return
        },
    };
}
function buildCloseSeries(candles) {
    const closes = new Float64Array(candles.length);
    for (let i = 0; i < candles.length; i++) {
        closes[i] = candles[i].close;
    }
    return closes;
}
function splitIntoBatches(items, batchCount) {
    const count = Math.max(1, Math.min(batchCount, items.length));
    const batches = Array.from({ length: count }, () => []);
    for (let i = 0; i < items.length; i++) {
        batches[i % count].push(items[i]);
    }
    return batches.filter(batch => batch.length > 0);
}
// Vectorized indicator calculations
function computeRSI(prices, period) {
    const length = prices.length;
    const rsi = new Float64Array(length);
    rsi.fill(50);
    if (length <= period) {
        return rsi;
    }
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) {
            gains += change;
        }
        else {
            losses -= change;
        }
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < length; i++) {
        const change = prices[i] - prices[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }
    return rsi;
}
function computeSMA(prices, period) {
    const length = prices.length;
    const sma = new Float64Array(length);
    if (length === 0 || period <= 0)
        return sma;
    let sum = 0;
    for (let i = 0; i < length; i++) {
        sum += prices[i];
        if (i >= period) {
            sum -= prices[i - period];
        }
        if (i >= period - 1) {
            sma[i] = sum / period;
        }
    }
    return sma;
}
function computeBollingerBands(prices, period, stdDev) {
    const length = prices.length;
    const upper = new Float64Array(length);
    const middle = new Float64Array(length);
    const lower = new Float64Array(length);
    if (length === 0 || period <= 0)
        return [upper, middle, lower];
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < length; i++) {
        const price = prices[i];
        sum += price;
        sumSq += price * price;
        if (i >= period) {
            const removed = prices[i - period];
            sum -= removed;
            sumSq -= removed * removed;
        }
        if (i >= period - 1) {
            const mean = sum / period;
            const variance = Math.max(0, (sumSq / period) - (mean * mean));
            const std = Math.sqrt(variance);
            middle[i] = mean;
            upper[i] = mean + std * stdDev;
            lower[i] = mean - std * stdDev;
        }
    }
    return [upper, middle, lower];
}
exports.default = backtesterNode;
//# sourceMappingURL=backtester.js.map