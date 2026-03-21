// Backtester Node
// Performs vectorized backtesting of strategy ideas with realistic execution

import { AgentState, StrategyIdea } from '../state';
import { Strategy, BacktestResult, Trade, MarketData } from '../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../../shared/logger';
import { getAnalysisWorkerPool } from '../../shared/analysis-worker-pool';

/** Realistic backtest configuration */
interface BacktestRealismConfig {
    /** Commission rate per trade (default: 0.0005 = 0.05%) */
    commissionRate: number;
    /** Average slippage in basis points (default: 3 = 0.03%) */
    slippageBps: number;
    /** Minimum bars between entries (default: 3, prevents overtrading) */
    minBarsBetweenEntries: number;
    /** Execute at next bar's open instead of signal bar's close (default: true) */
    nextBarExecution: boolean;
    /** Use candle high/low for intrabar stop/take-profit (default: true) */
    intrabarStopCheck: boolean;
    /** Estimated hourly funding rate for perpetuals (default: 0.00001 = 0.001%) */
    hourlyFundingRate: number;
    /** Minimum volume percentile to allow entry (default: 0 = off) */
    minVolumePercentile: number;
}

const DEFAULT_REALISM: BacktestRealismConfig = {
    commissionRate: 0.0005,
    slippageBps: 3,
    minBarsBetweenEntries: 3,
    nextBarExecution: true,
    intrabarStopCheck: true,
    hourlyFundingRate: 0.00001,
    minVolumePercentile: 0,
};

/**
 * Backtester Node
 * Tests strategy ideas against historical data using vectorized operations
 */
export async function backtesterNode(state: AgentState): Promise<Partial<AgentState>> {
    logger.info(`[BacktesterNode] Backtesting ${state.strategyIdeas.length} strategies`);
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
        const results: BacktestResult[] = [];
        const lowData = state.candles.length < minBacktestCandles;
        if (lowData) {
            logger.warn(`[BacktesterNode] Only ${state.candles.length} candles available, running low-confidence backtests`);
        }

        const pool = getAnalysisWorkerPool();
        if (pool) {
            try {
                const batches = splitIntoBatches(state.strategyIdeas, pool.size);
                const batchResults = await Promise.all(
                    batches.map(batch =>
                        pool.runTask<BacktestResult[]>('backtestBatch', {
                            ideas: batch,
                            candles: state.candles,
                        })
                    )
                );
                for (const batch of batchResults) {
                    results.push(...batch);
                }
            } catch (error) {
                logger.warn('[BacktesterNode] Worker backtest failed, falling back to main thread:', error);
                const closeSeries = buildCloseSeries(state.candles);
                for (const idea of state.strategyIdeas) {
                    const result = await vectorizedBacktest(idea, state.candles, closeSeries);
                    results.push(result);
                }
            }
        } else {
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
            `Backtested ${results.length} strategies (realistic mode: fees ${DEFAULT_REALISM.commissionRate * 100}%, slippage ${DEFAULT_REALISM.slippageBps}bps, next-bar exec)`,
            ...(lowData ? [`Limited backtest window (${state.candles.length} candles); treat results as low confidence`] : []),
            ...results.slice(0, 3).map(r =>
                `${r.strategyId}: Return ${r.totalReturn.toFixed(2)}%, Sharpe ${r.sharpeRatio.toFixed(2)}, WinRate ${r.winRate.toFixed(0)}%, Fees $${r.metrics.totalFees.toFixed(2)}`
            ),
        ];

        logger.info(`[BacktesterNode] Completed ${results.length} backtests`);

        return {
            currentStep: lowData ? 'BACKTEST_LOW_DATA' : 'BACKTEST_COMPLETE',
            backtestResults: results,
            thoughts,
        };
    } catch (error) {
        logger.error('[BacktesterNode] Backtesting failed:', error);
        return {
            currentStep: 'BACKTEST_ERROR',
            backtestResults: [],
            errors: [...state.errors, `Backtest error: ${error}`],
        };
    }
}

/**
 * Vectorized backtest with realistic execution simulation.
 *
 * Realism features:
 * - Commission deducted from capital on every trade
 * - Slippage applied on entry and exit (average bps, always against trader)
 * - Next-bar execution (signal on candle N, fill at candle N+1 open)
 * - Intrabar stop/take-profit using candle high/low
 * - Position cooldown (min bars between entries)
 * - Funding rate charged while in position
 * - Volume filter to skip low-liquidity entries
 * - Proper Sortino (downside deviation), VaR95 (5th percentile), expectancy
 */
export async function vectorizedBacktest(
    idea: StrategyIdea,
    candles: MarketData[],
    closes?: Float64Array
): Promise<BacktestResult> {
    const cfg = DEFAULT_REALISM;
    const strategyId = uuidv4();
    const initialCapital = 10000;
    let capital = initialCapital;
    const maxCapital = initialCapital * 10; // Cap to prevent unrealistic compounding
    let totalFees = 0;
    let totalSlippageCost = 0;

    const params = idea.parameters || {};
    const getParam = (
        keys: string[],
        fallback: number,
        min: number,
        max: number,
        integer: boolean = true
    ): number => {
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
    let fastPeriod = getParam(['fastPeriod', 'smaFast', 'emaFast', 'fast'], 10, 5, 30);
    let slowPeriod = getParam(['slowPeriod', 'smaSlow', 'emaSlow', 'slow'], 30, 10, 80);

    if (slowPeriod <= fastPeriod) {
        slowPeriod = Math.min(fastPeriod + 5, 80);
    }
    if (oversold >= overbought) {
        oversold = Math.max(10, overbought - 20);
    }

    // Build typed arrays
    const closeSeries = closes && closes.length === candles.length
        ? closes
        : buildCloseSeries(candles);
    const openSeries = buildPriceSeries(candles, 'open');
    const highSeries = buildPriceSeries(candles, 'high');
    const lowSeries = buildPriceSeries(candles, 'low');
    const volumeSeries = buildPriceSeries(candles, 'volume');

    // Pre-compute indicators
    const rsi = computeRSI(closeSeries, rsiPeriod);
    const [smaFast, smaSlow] = [computeSMA(closeSeries, fastPeriod), computeSMA(closeSeries, slowPeriod)];
    const [bbUpper, bbMiddle, bbLower] = computeBollingerBands(closeSeries, bbPeriod, bbStdDev);

    // Pre-compute volume percentile for filtering
    const volumeThreshold = cfg.minVolumePercentile > 0
        ? computeVolumePercentile(volumeSeries, closeSeries.length, cfg.minVolumePercentile)
        : 0;

    // Generate signals as boolean arrays
    const buySignals = new Uint8Array(closeSeries.length);
    const sellSignals = new Uint8Array(closeSeries.length);

    switch (idea.type) {
        case 'TREND_FOLLOWING':
            for (let i = Math.max(50, slowPeriod); i < closeSeries.length; i++) {
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
                if (closeSeries[i] < bbLower[i] && rsi[i] < oversold) {
                    buySignals[i] = 1;
                }
                if (closeSeries[i] > bbUpper[i] && rsi[i] > overbought) {
                    sellSignals[i] = 1;
                }
            }
            break;

        default:
            for (let i = Math.max(50, rsiPeriod); i < closeSeries.length; i++) {
                if (rsi[i] < oversold) buySignals[i] = 1;
                if (rsi[i] > overbought) sellSignals[i] = 1;
            }
    }

    // Simulate trades with realistic execution
    const trades: Trade[] = [];
    let position = 0;           // positive = long, negative = short
    let entryPrice = 0;
    let entryIndex = 0;
    let lastEntryBar = -cfg.minBarsBetweenEntries; // cooldown tracker
    let barsInPosition = 0;

    // Estimate hours per candle from data
    const hoursPerCandle = estimateHoursPerCandle(candles);

    const warmup = Math.max(50, slowPeriod, bbPeriod, rsiPeriod);
    for (let i = warmup; i < closeSeries.length; i++) {
        const price = closeSeries[i];
        const open = openSeries[i];
        const high = highSeries[i];
        const low = lowSeries[i];
        const volume = volumeSeries[i];

        // Apply slippage function: always moves against trader
        const applySlippage = (px: number, side: 'BUY' | 'SELL'): number => {
            const slip = px * (cfg.slippageBps / 10000);
            return side === 'BUY' ? px + slip : px - slip;
        };

        // Apply commission
        const calcFee = (px: number, size: number): number => px * size * cfg.commissionRate;

        // Charge funding rate while in position
        if (position !== 0 && barsInPosition > 0) {
            const hoursSinceEntry = barsInPosition * hoursPerCandle;
            const fundingCost = Math.abs(position) * entryPrice * cfg.hourlyFundingRate * hoursSinceEntry;
            // Funding is charged periodically, approximate per-bar
            const barFunding = Math.abs(position) * price * cfg.hourlyFundingRate * hoursPerCandle;
            capital -= barFunding;
            totalFees += barFunding;
        }

        // Check intrabar stop/take-profit using high/low (before signal logic)
        if (position !== 0 && cfg.intrabarStopCheck) {
            if (position > 0) {
                // Long position: check if low hit stop loss first, then high for take profit
                const stopPrice = entryPrice * (1 - idea.riskParameters.stopLoss);
                const tpPrice = entryPrice * (1 + idea.riskParameters.takeProfit);

                // Determine which was hit first based on open relative to entry
                let exitPrice = 0;
                let exitReason = '';
                let exitSide: 'BUY' | 'SELL' = 'SELL';

                if (low <= stopPrice) {
                    // Stop loss hit at stopPrice + slippage
                    exitPrice = applySlippage(stopPrice, 'SELL');
                    exitReason = 'STOP_LOSS';
                    const pnl = (exitPrice - entryPrice) * position;
                    const fee = calcFee(exitPrice, position);
                    capital += pnl - fee;
                    totalFees += fee;
                    totalSlippageCost += Math.abs(exitPrice - stopPrice) * position;
                    trades.push(createTrade(strategyId, idea.symbols[0], exitSide, position, exitPrice, pnl, candles[i].timestamp, 'EXIT', fee));
                    position = 0;
                    lastEntryBar = i;
                    barsInPosition = 0;
                    continue; // Skip signal check this bar
                } else if (high >= tpPrice) {
                    // Take profit hit
                    exitPrice = applySlippage(tpPrice, 'SELL');
                    exitReason = 'TAKE_PROFIT';
                    const pnl = (exitPrice - entryPrice) * position;
                    const fee = calcFee(exitPrice, position);
                    capital += pnl - fee;
                    totalFees += fee;
                    totalSlippageCost += Math.abs(exitPrice - tpPrice) * position;
                    trades.push(createTrade(strategyId, idea.symbols[0], exitSide, position, exitPrice, pnl, candles[i].timestamp, 'EXIT', fee));
                    position = 0;
                    lastEntryBar = i;
                    barsInPosition = 0;
                    continue;
                }
            } else if (position < 0) {
                // Short position
                const stopPrice = entryPrice * (1 + idea.riskParameters.stopLoss);
                const tpPrice = entryPrice * (1 - idea.riskParameters.takeProfit);

                if (high >= stopPrice) {
                    // Stop loss hit on short
                    const exitPrice = applySlippage(stopPrice, 'BUY');
                    const pnl = (entryPrice - exitPrice) * Math.abs(position);
                    const fee = calcFee(exitPrice, Math.abs(position));
                    capital += pnl - fee;
                    totalFees += fee;
                    totalSlippageCost += Math.abs(exitPrice - stopPrice) * Math.abs(position);
                    trades.push(createTrade(strategyId, idea.symbols[0], 'BUY', Math.abs(position), exitPrice, pnl, candles[i].timestamp, 'EXIT', fee));
                    position = 0;
                    lastEntryBar = i;
                    barsInPosition = 0;
                    continue;
                } else if (low <= tpPrice) {
                    // Take profit hit on short
                    const exitPrice = applySlippage(tpPrice, 'BUY');
                    const pnl = (entryPrice - exitPrice) * Math.abs(position);
                    const fee = calcFee(exitPrice, Math.abs(position));
                    capital += pnl - fee;
                    totalFees += fee;
                    totalSlippageCost += Math.abs(exitPrice - tpPrice) * Math.abs(position);
                    trades.push(createTrade(strategyId, idea.symbols[0], 'BUY', Math.abs(position), exitPrice, pnl, candles[i].timestamp, 'EXIT', fee));
                    position = 0;
                    lastEntryBar = i;
                    barsInPosition = 0;
                    continue;
                }
            }
        }

        // Check close-based stop/take-profit as fallback
        if (position !== 0) {
            const unrealizedPnL = position > 0
                ? (price - entryPrice) / entryPrice
                : (entryPrice - price) / entryPrice;

            if (unrealizedPnL <= -idea.riskParameters.stopLoss) {
                const exitSide: 'BUY' | 'SELL' = position > 0 ? 'SELL' : 'BUY';
                const exitPrice = applySlippage(price, exitSide);
                const pnl = position > 0
                    ? (exitPrice - entryPrice) * position
                    : (entryPrice - exitPrice) * Math.abs(position);
                const fee = calcFee(exitPrice, Math.abs(position));
                capital += pnl - fee;
                totalFees += fee;
                totalSlippageCost += Math.abs(exitPrice - price) * Math.abs(position);
                trades.push(createTrade(strategyId, idea.symbols[0], exitSide, Math.abs(position), exitPrice, pnl, candles[i].timestamp, 'EXIT', fee));
                position = 0;
                lastEntryBar = i;
                barsInPosition = 0;
                continue;
            }
            else if (unrealizedPnL >= idea.riskParameters.takeProfit) {
                const exitSide: 'BUY' | 'SELL' = position > 0 ? 'SELL' : 'BUY';
                const exitPrice = applySlippage(price, exitSide);
                const pnl = position > 0
                    ? (exitPrice - entryPrice) * position
                    : (entryPrice - exitPrice) * Math.abs(position);
                const fee = calcFee(exitPrice, Math.abs(position));
                capital += pnl - fee;
                totalFees += fee;
                totalSlippageCost += Math.abs(exitPrice - price) * Math.abs(position);
                trades.push(createTrade(strategyId, idea.symbols[0], exitSide, Math.abs(position), exitPrice, pnl, candles[i].timestamp, 'EXIT', fee));
                position = 0;
                lastEntryBar = i;
                barsInPosition = 0;
                continue;
            }
        }

        // Signal detection with cooldown and volume filter
        const cooldownActive = (i - lastEntryBar) < cfg.minBarsBetweenEntries;
        const volumeOk = volumeThreshold <= 0 || volume >= volumeThreshold;

        // Determine execution price (next-bar open or current close)
        const execIndex = cfg.nextBarExecution ? i + 1 : i;
        const execPrice = execIndex < closeSeries.length ? openSeries[execIndex] : price;

        if (buySignals[i] && position <= 0 && !cooldownActive && volumeOk && execIndex < closeSeries.length) {
            // Close short if exists
            if (position < 0) {
                const exitPrice = applySlippage(execPrice, 'BUY');
                const pnl = (entryPrice - exitPrice) * Math.abs(position);
                const fee = calcFee(exitPrice, Math.abs(position));
                capital += pnl - fee;
                totalFees += fee;
                totalSlippageCost += Math.abs(exitPrice - execPrice) * Math.abs(position);
                trades.push(createTrade(strategyId, idea.symbols[0], 'BUY', Math.abs(position), exitPrice, pnl, candles[execIndex].timestamp, 'EXIT', fee));
            }

            // Open long
            const fillPrice = applySlippage(execPrice, 'BUY');
            const effectiveCapital = Math.min(capital, maxCapital);
            const size = (effectiveCapital * idea.riskParameters.maxPositionSize) / fillPrice;
            const fee = calcFee(fillPrice, size);
            capital -= fee;
            totalFees += fee;
            totalSlippageCost += Math.abs(fillPrice - execPrice) * size;
            position = size;
            entryPrice = fillPrice;
            entryIndex = execIndex;
            lastEntryBar = i;
            barsInPosition = 0;
            trades.push(createTrade(strategyId, idea.symbols[0], 'BUY', size, fillPrice, 0, candles[execIndex].timestamp, 'ENTRY', fee));
        }
        else if (sellSignals[i] && position >= 0 && !cooldownActive && volumeOk && execIndex < closeSeries.length) {
            // Close long if exists
            if (position > 0) {
                const exitPrice = applySlippage(execPrice, 'SELL');
                const pnl = (exitPrice - entryPrice) * position;
                const fee = calcFee(exitPrice, position);
                capital += pnl - fee;
                totalFees += fee;
                totalSlippageCost += Math.abs(exitPrice - execPrice) * position;
                trades.push(createTrade(strategyId, idea.symbols[0], 'SELL', position, exitPrice, pnl, candles[execIndex].timestamp, 'EXIT', fee));
            }

            // Open short
            const fillPrice = applySlippage(execPrice, 'SELL');
            const effectiveCapital = Math.min(capital, maxCapital);
            const size = (effectiveCapital * idea.riskParameters.maxPositionSize) / fillPrice;
            const fee = calcFee(fillPrice, size);
            capital -= fee;
            totalFees += fee;
            totalSlippageCost += Math.abs(fillPrice - execPrice) * size;
            position = -size;
            entryPrice = fillPrice;
            entryIndex = execIndex;
            lastEntryBar = i;
            barsInPosition = 0;
            trades.push(createTrade(strategyId, idea.symbols[0], 'SELL', size, fillPrice, 0, candles[execIndex].timestamp, 'ENTRY', fee));
        }

        if (position !== 0) barsInPosition++;
        // Cap capital to prevent unrealistic compounding across loop iterations
        capital = Math.min(capital, maxCapital);
    }

    // Close any remaining position at last bar
    if (position !== 0) {
        const lastPrice = closeSeries[closeSeries.length - 1];
        const exitSide: 'BUY' | 'SELL' = position > 0 ? 'SELL' : 'BUY';
        const slip = lastPrice * (cfg.slippageBps / 10000);
        const exitPrice = exitSide === 'BUY' ? lastPrice + slip : lastPrice - slip;
        const pnl = position > 0
            ? (exitPrice - entryPrice) * position
            : (entryPrice - exitPrice) * Math.abs(position);
        const fee = exitPrice * Math.abs(position) * cfg.commissionRate;
        capital += pnl - fee;
        totalFees += fee;
        trades.push(createTrade(strategyId, idea.symbols[0], exitSide, Math.abs(position), exitPrice, pnl, candles[candles.length - 1].timestamp, 'EXIT', fee));
    }

    // Calculate metrics
    return calculateMetrics(strategyId, trades, initialCapital, capital, candles, totalFees, totalSlippageCost, hoursPerCandle);
}

function createTrade(
    strategyId: string,
    symbol: string,
    side: 'BUY' | 'SELL',
    size: number,
    price: number,
    pnl: number,
    timestamp: Date,
    entryExit: 'ENTRY' | 'EXIT',
    fee: number
): Trade {
    return {
        id: uuidv4(),
        strategyId,
        symbol,
        side,
        size,
        price,
        fee,
        pnl,
        timestamp,
        type: 'MARKET',
        status: 'FILLED',
        entryExit,
    };
}

/**
 * Calculate realistic backtest metrics.
 */
function calculateMetrics(
    strategyId: string,
    trades: Trade[],
    initialCapital: number,
    finalCapital: number,
    candles: MarketData[],
    totalFees: number,
    totalSlippageCost: number,
    hoursPerCandle: number
): BacktestResult {
    const exitTrades = trades.filter(t => t.entryExit === 'EXIT');
    const winningTrades = exitTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = exitTrades.filter(t => (t.pnl || 0) < 0);

    const totalReturn = ((finalCapital - initialCapital) / initialCapital) * 100;
    const winRate = exitTrades.length > 0 ? (winningTrades.length / exitTrades.length) * 100 : 0;

    // Actual data duration in years
    const dataDurationMs = candles[candles.length - 1].timestamp.getTime() - candles[0].timestamp.getTime();
    const dataDurationYears = Math.max(dataDurationMs / (365.25 * 24 * 3600 * 1000), 1 / 365.25); // floor at 1 day
    const annualizedReturn = ((Math.pow(finalCapital / initialCapital, 1 / dataDurationYears) - 1) * 100);

    // Calculate max drawdown at trade resolution
    let maxDrawdown = 0;
    let peak = initialCapital;
    let runningCapital = initialCapital;

    for (const trade of exitTrades) {
        runningCapital += (trade.pnl || 0) - (trade.fee || 0);
        peak = Math.max(peak, runningCapital);
        const drawdown = ((peak - runningCapital) / peak) * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    // Calculate Sharpe ratio (per-trade returns, annualized)
    // Use running capital at each trade time, not initial capital, to avoid
    // distortion from capital compounding
    let sharpeCapital = initialCapital;
    const returns = exitTrades.map(t => {
        const netPnl = (t.pnl || 0) - (t.fee || 0);
        const r = sharpeCapital > 0 ? netPnl / sharpeCapital : 0;
        sharpeCapital = Math.min(sharpeCapital + netPnl, initialCapital * 10);
        return r;
    });
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
        ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
        : 1;

    // Estimate trades per year for annualization, cap at sqrt(252) (standard daily annualization)
    const rawTradesPerYear = dataDurationYears > 0 ? exitTrades.length / dataDurationYears : exitTrades.length * 365;
    const annualizationFactor = Math.min(Math.sqrt(rawTradesPerYear), Math.sqrt(252));
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * annualizationFactor : 0;

    // Real Sortino ratio (downside deviation only)
    const downsideReturns = returns.filter(r => r < 0);
    const downsideDev = downsideReturns.length > 1
        ? Math.sqrt(downsideReturns.reduce((sum, r) => sum + r * r, 0) / (downsideReturns.length - 1))
        : downsideReturns.length === 1
            ? Math.abs(downsideReturns[0])
            : 1;
    const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * annualizationFactor : 0;

    // Real VaR95 (5th percentile of returns, as loss)
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const varIndex = Math.floor(sortedReturns.length * 0.05);
    const var95 = sortedReturns.length > 0 ? Math.abs(sortedReturns[varIndex] || 0) * 100 : 0;

    // Profit factor
    const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    // Average win/loss
    const avgWin = winningTrades.length > 0
        ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
        : 0;
    const avgLoss = losingTrades.length > 0
        ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)) / losingTrades.length
        : 0;

    // Max consecutive losses
    let maxConsecutiveLosses = 0;
    let consecutiveLosses = 0;
    for (const trade of exitTrades) {
        if ((trade.pnl || 0) < 0) {
            consecutiveLosses++;
            maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
        } else {
            consecutiveLosses = 0;
        }
    }

    // Average trade duration (in bars)
    const entryTrades = trades.filter(t => t.entryExit === 'ENTRY');
    let avgTradeDuration = 0;
    if (entryTrades.length > 0 && exitTrades.length > 0) {
        const durations: number[] = [];
        for (let i = 0; i < exitTrades.length && i < entryTrades.length; i++) {
            const duration = exitTrades[i].timestamp.getTime() - entryTrades[i].timestamp.getTime();
            durations.push(duration / (1000 * 60 * 60)); // in hours
        }
        avgTradeDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    }

    // Expectancy (average $ per trade)
    const expectancy = exitTrades.length > 0
        ? exitTrades.reduce((sum, t) => sum + (t.pnl || 0) - (t.fee || 0), 0) / exitTrades.length
        : 0;

    // Calmar ratio (annualized return / max drawdown)
    const calmarRatio = maxDrawdown > 0 ? Math.abs(annualizedReturn) / maxDrawdown : 0;

    return {
        strategyId,
        period: {
            start: candles[0]?.timestamp || new Date(),
            end: candles[candles.length - 1]?.timestamp || new Date(),
        },
        initialCapital,
        finalCapital,
        totalReturn,
        annualizedReturn,
        sharpeRatio,
        maxDrawdown,
        winRate,
        totalTrades: exitTrades.length,
        trades,
        profitFactor,
        metrics: {
            calmarRatio,
            sortinoRatio,
            var95,
            beta: 0, // Cannot compute without benchmark; 0 = not calculated
            alpha: 0, // Cannot compute without benchmark; 0 = not calculated
            avgWin,
            avgLoss,
            maxConsecutiveLosses,
            avgTradeDuration,
            totalFees,
            avgSlippageCost: exitTrades.length > 0 ? totalSlippageCost / exitTrades.length : 0,
            expectancy,
        },
    };
}

function buildCloseSeries(candles: MarketData[]): Float64Array {
    const closes = new Float64Array(candles.length);
    for (let i = 0; i < candles.length; i++) {
        closes[i] = candles[i].close;
    }
    return closes;
}

function buildPriceSeries(candles: MarketData[], field: 'open' | 'high' | 'low' | 'volume'): Float64Array {
    const arr = new Float64Array(candles.length);
    for (let i = 0; i < candles.length; i++) {
        arr[i] = (candles[i] as any)[field] || 0;
    }
    return arr;
}

/**
 * Estimate hours per candle from timestamp gaps.
 */
function estimateHoursPerCandle(candles: MarketData[]): number {
    if (candles.length < 2) return 1;
    const gaps: number[] = [];
    const sampleCount = Math.min(20, candles.length - 1);
    for (let i = 1; i <= sampleCount; i++) {
        const gap = candles[i].timestamp.getTime() - candles[i - 1].timestamp.getTime();
        gaps.push(gap);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    // Floor at 1 minute, cap at 24 hours
    return Math.max(1 / 60, Math.min(24, avgGap / (1000 * 60 * 60)));
}

/**
 * Compute volume threshold at given percentile.
 */
function computeVolumePercentile(volumes: Float64Array, length: number, percentile: number): number {
    const validVolumes: number[] = [];
    for (let i = 0; i < length; i++) {
        if (volumes[i] > 0) validVolumes.push(volumes[i]);
    }
    if (validVolumes.length === 0) return 0;
    validVolumes.sort((a, b) => a - b);
    const idx = Math.floor(validVolumes.length * percentile);
    return validVolumes[Math.min(idx, validVolumes.length - 1)];
}

function splitIntoBatches<T>(items: T[], batchCount: number): T[][] {
    const count = Math.max(1, Math.min(batchCount, items.length));
    const batches: T[][] = Array.from({ length: count }, () => []);

    for (let i = 0; i < items.length; i++) {
        batches[i % count].push(items[i]);
    }

    return batches.filter(batch => batch.length > 0);
}

// Vectorized indicator calculations
function computeRSI(prices: Float64Array, period: number): Float64Array {
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
        } else {
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

function computeSMA(prices: Float64Array, period: number): Float64Array {
    const length = prices.length;
    const sma = new Float64Array(length);
    if (length === 0 || period <= 0) return sma;

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

function computeBollingerBands(
    prices: Float64Array,
    period: number,
    stdDev: number
): [Float64Array, Float64Array, Float64Array] {
    const length = prices.length;
    const upper = new Float64Array(length);
    const middle = new Float64Array(length);
    const lower = new Float64Array(length);
    if (length === 0 || period <= 0) return [upper, middle, lower];

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

export default backtesterNode;
