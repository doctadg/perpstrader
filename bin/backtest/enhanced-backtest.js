"use strict";
/**
 * Enhanced Backtesting Engine
 *
 * Nautilus-inspired backtesting with realistic execution simulation.
 * Integrates simulation clock, fill models, and order book simulation.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BacktestEngine = void 0;
exports.runBacktest = runBacktest;
const uuid_1 = require("uuid");
const simulation_clock_1 = require("./simulation-clock");
const fill_models_1 = require("./fill-models");
const logger_1 = __importDefault(require("../shared/logger"));
/**
 * Enhanced Backtest Engine with Nautilus-style features and realistic execution
 */
class BacktestEngine {
    config;
    clock;
    fillModel;
    capital;
    totalFees;
    totalSlippageCost;
    positions = new Map();
    trades = [];
    orderBooks = new Map();
    // Realism settings
    minBarsBetweenEntries;
    nextBarExecution;
    intrabarStopCheck;
    hourlyFundingRate;
    // Capital cap to prevent unrealistic compounding
    maxCapital;
    constructor(config = {}) {
        this.config = {
            initialCapital: config.initialCapital ?? 10000,
            fillModel: config.fillModel ?? 'STANDARD',
            commissionRate: config.commissionRate ?? 0.0005,
            slippageBps: config.slippageBps ?? 5,
            latencyMs: config.latencyMs ?? 10,
            randomSeed: config.randomSeed,
            clockMode: config.clockMode ?? 'SIMULATION',
            startTime: config.startTime,
        };
        // Initialize clock
        this.clock = new simulation_clock_1.TestClock(this.config.startTime);
        // Initialize fill model
        this.fillModel = new fill_models_1.FillModel({
            avgSlippageBps: this.config.slippageBps,
            commissionRate: this.config.commissionRate,
        }, {
            baseLatencyMs: this.config.latencyMs,
        });
        if (this.config.randomSeed) {
            this.fillModel.setSeed(this.config.randomSeed);
        }
        this.capital = this.config.initialCapital ?? 10000;
        this.totalFees = 0;
        this.totalSlippageCost = 0;
        // Realism defaults
        this.minBarsBetweenEntries = 3;
        this.nextBarExecution = true;
        this.intrabarStopCheck = true;
        this.hourlyFundingRate = 0.00001; // 0.001% per hour
        // Cap capital at 10x initial to prevent unrealistic compounding
        this.maxCapital = this.capital * 10;
        logger_1.default.info('[BacktestEngine] Initialized with config:', this.config);
    }
    /**
     * Run a complete backtest
     */
    async runBacktest(strategy, candles) {
        logger_1.default.info(`[BacktestEngine] Running backtest for ${strategy.name} on ${candles.length} candles`);
        this.reset();
        this.initializeOrderBooks(candles);
        const strategyState = this.initializeStrategyState(strategy);
        // Estimate hours per candle
        const hoursPerCandle = this.estimateHoursPerCandle(candles);
        // Main backtesting loop
        for (let i = 0; i < candles.length; i++) {
            const candle = candles[i];
            const time = candle.timestamp.getTime() * 1_000_000; // Convert to nanoseconds
            // Advance clock
            this.clock.setTime(time);
            // Update order book
            this.updateOrderBook(candle);
            // Get current clock time
            const currentTime = this.clock.timestampMs();
            // Check intrabar stop/take-profit using candle high/low
            if (this.intrabarStopCheck) {
                this.checkIntrabarExits(strategy, candle, currentTime, i);
            }
            // Check close-based stop loss / take profit
            this.checkExitConditions(strategy, candle, currentTime);
            // Charge funding while in position
            this.chargeFunding(candle, hoursPerCandle);
            // Generate signals from strategy
            const signals = this.generateSignals(strategy, candle, strategyState, i);
            // Execute signals at next bar (or same bar if nextBarExecution is off)
            if (signals.length > 0 && this.nextBarExecution && i + 1 < candles.length) {
                const nextCandle = candles[i + 1];
                const nextTime = nextCandle.timestamp.getTime() * 1_000_000;
                this.clock.setTime(nextTime);
                this.updateOrderBook(nextCandle);
                const nextCurrentTime = this.clock.timestampMs();
                for (const signal of signals) {
                    await this.executeSignal(signal, nextCandle, nextCurrentTime, i);
                }
            }
            else {
                for (const signal of signals) {
                    await this.executeSignal(signal, candle, currentTime, i);
                }
            }
        }
        // Close any remaining positions
        this.closeAllPositions(candles[candles.length - 1]);
        // Calculate results
        return this.calculateResults(strategy, candles, hoursPerCandle);
    }
    /**
     * Initialize order books from first candles
     */
    initializeOrderBooks(candles) {
        for (const candle of candles) {
            if (!this.orderBooks.has(candle.symbol)) {
                const book = fill_models_1.OrderBookBuilder.fromMarketData(candle, 20);
                this.orderBooks.set(candle.symbol, book);
            }
        }
    }
    /**
     * Update order book for a candle
     */
    updateOrderBook(candle) {
        const book = this.orderBooks.get(candle.symbol);
        if (book) {
            const priceDelta = candle.close - (book.midPrice || candle.close);
            const updatedBook = {
                ...book,
                bids: (book.bids || []).map((level) => ({
                    price: (level.price || 0) + priceDelta,
                    size: level.size || 0,
                })),
                asks: (book.asks || []).map((level) => ({
                    price: (level.price || 0) + priceDelta,
                    size: level.size || 0,
                })),
                midPrice: candle.close,
                lastUpdate: candle.timestamp.getTime(),
            };
            this.orderBooks.set(candle.symbol, updatedBook);
        }
    }
    /**
     * Initialize strategy state
     */
    initializeStrategyState(strategy) {
        return {
            indicators: {},
            lastSignal: null,
            lastSignalTime: 0,
            lastEntryBar: -this.minBarsBetweenEntries,
        };
    }
    /**
     * Charge funding rate for open positions
     */
    chargeFunding(candle, hoursPerCandle) {
        for (const [symbol, pos] of this.positions) {
            if (pos.qty === 0)
                continue;
            const notional = Math.abs(pos.qty) * candle.close;
            const fundingCost = notional * this.hourlyFundingRate * hoursPerCandle;
            this.capital -= fundingCost;
            this.totalFees += fundingCost;
        }
    }
    /**
     * Check intrabar stop/take-profit using candle high/low
     */
    checkIntrabarExits(strategy, candle, currentTime, barIndex) {
        const riskParams = strategy.riskParameters;
        if (!riskParams)
            return;
        for (const [symbol, pos] of this.positions) {
            if (pos.qty === 0)
                continue;
            const slippageBps = this.config.slippageBps ?? 5;
            const slippageFactor = slippageBps / 10000;
            if (pos.side === 'LONG') {
                const stopPrice = pos.avgPx * (1 - riskParams.stopLoss);
                const tpPrice = pos.avgPx * (1 + riskParams.takeProfit);
                // Check stop loss (low hit)
                if (candle.low <= stopPrice) {
                    const exitPrice = stopPrice * (1 - slippageFactor); // worse for sell
                    this.closePositionWithFill(symbol, exitPrice, currentTime, 'STOP_LOSS');
                    continue;
                }
                // Check take profit (high hit)
                if (candle.high >= tpPrice) {
                    const exitPrice = tpPrice * (1 - slippageFactor);
                    this.closePositionWithFill(symbol, exitPrice, currentTime, 'TAKE_PROFIT');
                }
            }
            else {
                // SHORT
                const stopPrice = pos.avgPx * (1 + riskParams.stopLoss);
                const tpPrice = pos.avgPx * (1 - riskParams.takeProfit);
                // Check stop loss (high hit on short)
                if (candle.high >= stopPrice) {
                    const exitPrice = stopPrice * (1 + slippageFactor); // worse for buy-to-cover
                    this.closePositionWithFill(symbol, exitPrice, currentTime, 'STOP_LOSS');
                    continue;
                }
                // Check take profit (low hit on short)
                if (candle.low <= tpPrice) {
                    const exitPrice = tpPrice * (1 + slippageFactor);
                    this.closePositionWithFill(symbol, exitPrice, currentTime, 'TAKE_PROFIT');
                }
            }
        }
    }
    /**
     * Generate trading signals from strategy using indicator-based logic
     */
    generateSignals(strategy, candle, state, barIndex) {
        const signals = [];
        // Check cooldown
        if (barIndex - state.lastEntryBar < this.minBarsBetweenEntries) {
            return signals;
        }
        const params = strategy.parameters || {};
        // Use capped capital for position sizing to prevent unrealistic compounding
        const effectiveCapital = Math.min(this.capital, this.maxCapital);
        const positionSize = (effectiveCapital * (strategy.riskParameters?.maxPositionSize || 0.05)) / candle.close;
        // Build close price history from tracked candles
        if (!state.closes)
            state.closes = [];
        state.closes.push(candle.close);
        const closes = state.closes;
        // Helper: compute RSI using Wilder's EMA (industry standard)
        const rsi = (period) => {
            if (closes.length <= period + 1)
                return 50;
            // Cache state for incremental computation
            if (!state.rsiState) {
                state.rsiState = { avgGain: 0, avgLoss: 0, initialized: false, period };
            }
            const st = state.rsiState;
            if (st.period !== period) {
                st.period = period;
                st.initialized = false;
                st.avgGain = 0;
                st.avgLoss = 0;
            }
            // Compute all changes up to current bar
            const startIdx = closes.length - (st.initialized ? 1 : period);
            for (let i = Math.max(1, startIdx); i < closes.length; i++) {
                const change = closes[i] - closes[i - 1];
                if (!st.initialized) {
                    // First `period` changes: simple average
                    if (change > 0)
                        st.avgGain += change;
                    else
                        st.avgLoss -= change;
                    if (i === closes.length - 1 || (i - startIdx + 1) === period) {
                        st.avgGain /= period;
                        st.avgLoss /= period;
                        if ((i - startIdx + 1) >= period)
                            st.initialized = true;
                    }
                }
                else {
                    // Wilder's EMA: alpha = 1/period
                    st.avgGain = (st.avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
                    st.avgLoss = (st.avgLoss * (period - 1) + (change < 0 ? -change : 0)) / period;
                }
            }
            return st.avgLoss === 0 ? 100 : 100 - (100 / (1 + st.avgGain / st.avgLoss));
        };
        // Helper: compute SMA from close series
        const sma = (period) => {
            if (closes.length < period)
                return closes[closes.length - 1] || 0;
            let sum = 0;
            for (let i = closes.length - period; i < closes.length; i++)
                sum += closes[i];
            return sum / period;
        };
        // Helper: compute Bollinger Bands
        const bollinger = (period, stdMult) => {
            const middle = sma(period);
            if (closes.length < period)
                return { upper: middle, middle, lower: middle };
            let sumSq = 0;
            for (let i = closes.length - period; i < closes.length; i++)
                sumSq += (closes[i] - middle) ** 2;
            const std = Math.sqrt(sumSq / period);
            return { upper: middle + std * stdMult, middle, lower: middle - std * stdMult };
        };
        switch (strategy.type) {
            case 'TREND_FOLLOWING': {
                const fastPeriod = params.fastPeriod ?? params.smaFast ?? params.emaFast ?? params.fast ?? 10;
                const slowPeriod = params.slowPeriod ?? params.smaSlow ?? params.emaSlow ?? params.slow ?? 30;
                const minBars = Math.max(fastPeriod, slowPeriod) + 1;
                if (closes.length >= minBars) {
                    const fastNow = sma(fastPeriod);
                    const slowNow = sma(slowPeriod);
                    const fastPrev = closes.length >= minBars + 1
                        ? closes.slice(0, -1).reduce((s, v, i, a) => i >= a.length - fastPeriod ? s + v : s, 0) / fastPeriod
                        : fastNow;
                    const slowPrev = closes.length >= minBars + 1
                        ? closes.slice(0, -1).reduce((s, v, i, a) => i >= a.length - slowPeriod ? s + v : s, 0) / slowPeriod
                        : slowNow;
                    if (fastNow > slowNow && fastPrev <= slowPrev) {
                        signals.push(this.createBuySignal(candle, positionSize));
                        state.lastEntryBar = barIndex;
                    }
                    else if (fastNow < slowNow && fastPrev >= slowPrev) {
                        signals.push(this.createSellSignal(candle, positionSize));
                        state.lastEntryBar = barIndex;
                    }
                }
                break;
            }
            case 'MEAN_REVERSION': {
                const rsiPeriod = params.rsiPeriod || params.rsiLength || 14;
                const oversold = params.oversold || params.rsiOversold || 35;
                const overbought = params.overbought || params.rsiOverbought || 65;
                const bbPeriod = params.bbPeriod || params.bollingerPeriod || 20;
                const bbStdDev = params.bbStdDev || params.bollingerStdDev || 2;
                if (closes.length > Math.max(rsiPeriod, bbPeriod)) {
                    const currentRSI = rsi(rsiPeriod);
                    const bb = bollinger(bbPeriod, bbStdDev);
                    const price = candle.close;
                    if (price < bb.lower && currentRSI < oversold) {
                        signals.push(this.createBuySignal(candle, positionSize));
                        state.lastEntryBar = barIndex;
                    }
                    else if (price > bb.upper && currentRSI > overbought) {
                        signals.push(this.createSellSignal(candle, positionSize));
                        state.lastEntryBar = barIndex;
                    }
                }
                break;
            }
            default: {
                // Generic RSI-based signals for MARKET_MAKING, ARBITRAGE, AI_PREDICTION, etc.
                const rsiPeriod = params.rsiPeriod || params.rsiLength || 14;
                const oversold = params.oversold || params.rsiOversold || 30;
                const overbought = params.overbought || params.rsiOverbought || 70;
                if (closes.length > rsiPeriod) {
                    const currentRSI = rsi(rsiPeriod);
                    if (currentRSI < oversold) {
                        signals.push(this.createBuySignal(candle, positionSize));
                        state.lastEntryBar = barIndex;
                    }
                    else if (currentRSI > overbought) {
                        signals.push(this.createSellSignal(candle, positionSize));
                        state.lastEntryBar = barIndex;
                    }
                }
                break;
            }
        }
        return signals;
    }
    createBuySignal(candle, quantity) {
        return {
            orderId: (0, uuid_1.v4)(),
            symbol: candle.symbol,
            side: 'BUY',
            type: 'MARKET',
            quantity,
            timestamp: this.clock.timestamp(),
        };
    }
    createSellSignal(candle, quantity) {
        return {
            orderId: (0, uuid_1.v4)(),
            symbol: candle.symbol,
            side: 'SELL',
            type: 'MARKET',
            quantity,
            timestamp: this.clock.timestamp(),
        };
    }
    /**
     * Execute a trading signal — commission is DEDUCTED from capital here
     */
    async executeSignal(signal, candle, currentTime, barIndex) {
        const book = this.orderBooks.get(signal.symbol);
        if (!book)
            return;
        // Simulate fills through order book
        const fills = this.fillModel.simulateFill(signal, book);
        for (const fill of fills) {
            const symbol = signal.symbol;
            const currentPos = this.positions.get(symbol) || { qty: 0, avgPx: 0, side: 'LONG', entryBar: 0 };
            const { qty, avgPx, realizedPnL } = fill_models_1.PositionCalculator.applyFills(currentPos.qty, currentPos.avgPx, [fill]);
            // Determine entry vs exit
            const fillSignedQty = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
            const isExit = currentPos.qty !== 0 &&
                Math.sign(fillSignedQty) !== Math.sign(currentPos.qty);
            this.positions.set(symbol, {
                qty,
                avgPx,
                side: qty >= 0 ? 'LONG' : 'SHORT',
                entryBar: isExit ? 0 : barIndex,
            });
            // Deduct commission from capital — THIS IS THE KEY FIX
            // Cap capital at maxCapital to prevent unrealistic compounding
            this.capital = Math.min(this.capital + realizedPnL - fill.commission, this.maxCapital);
            this.totalFees += fill.commission;
            this.totalSlippageCost += Math.abs(fill.slippage) * fill.quantity;
            // Record trade
            this.trades.push({
                id: fill.fillId,
                symbol: fill.symbol,
                side: fill.side,
                size: fill.quantity,
                price: fill.price,
                fee: fill.commission,
                pnl: realizedPnL,
                timestamp: new Date(currentTime),
                type: 'MARKET',
                status: 'FILLED',
                entryExit: isExit ? 'EXIT' : 'ENTRY',
            });
        }
    }
    /**
     * Check and execute stop loss / take profit (close-based fallback)
     */
    checkExitConditions(strategy, candle, currentTime) {
        for (const [symbol, pos] of this.positions) {
            if (pos.qty === 0)
                continue;
            const riskParams = strategy.riskParameters;
            if (!riskParams)
                continue;
            const currentPrice = candle.close;
            const absQty = Math.abs(pos.qty);
            const unrealizedPnL = pos.side === 'LONG'
                ? (currentPrice - pos.avgPx) * absQty
                : (pos.avgPx - currentPrice) * absQty;
            const pnlPercent = (unrealizedPnL / (pos.avgPx * absQty)) * 100;
            // Check stop loss
            if (pnlPercent <= -riskParams.stopLoss) {
                this.closePosition(symbol, currentPrice, currentTime, 'STOP_LOSS');
            }
            // Check take profit
            else if (pnlPercent >= riskParams.takeProfit) {
                this.closePosition(symbol, currentPrice, currentTime, 'TAKE_PROFIT');
            }
        }
    }
    /**
     * Close a position with explicit fill price (for intrabar stops)
     */
    closePositionWithFill(symbol, fillPrice, time, reason) {
        const pos = this.positions.get(symbol);
        if (!pos || pos.qty === 0)
            return;
        const closeQty = Math.abs(pos.qty);
        const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
        const pnl = pos.side === 'LONG'
            ? (fillPrice - pos.avgPx) * closeQty
            : (pos.avgPx - fillPrice) * closeQty;
        const fee = fillPrice * closeQty * (this.config.commissionRate ?? 0.0005);
        // Deduct fee from capital
        this.capital += pnl - fee;
        this.totalFees += fee;
        this.trades.push({
            id: (0, uuid_1.v4)(),
            symbol,
            side: closeSide,
            size: closeQty,
            price: fillPrice,
            fee,
            pnl,
            timestamp: new Date(time),
            type: 'MARKET',
            status: 'FILLED',
            entryExit: 'EXIT',
        });
        this.positions.set(symbol, { qty: 0, avgPx: 0, side: 'LONG', entryBar: 0 });
        logger_1.default.debug(`[BacktestEngine] Closed ${symbol} position: ${reason}, PnL: ${pnl.toFixed(2)}`);
    }
    /**
     * Close a position
     */
    closePosition(symbol, price, time, reason) {
        const pos = this.positions.get(symbol);
        if (!pos || pos.qty === 0)
            return;
        const closeQty = Math.abs(pos.qty);
        const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
        const pnl = pos.side === 'LONG'
            ? (price - pos.avgPx) * closeQty
            : (pos.avgPx - price) * closeQty;
        const fee = price * closeQty * (this.config.commissionRate ?? 0.0005);
        // Deduct fee from capital
        this.capital += pnl - fee;
        this.totalFees += fee;
        this.trades.push({
            id: (0, uuid_1.v4)(),
            symbol,
            side: closeSide,
            size: closeQty,
            price,
            fee,
            pnl,
            timestamp: new Date(time),
            type: 'MARKET',
            status: 'FILLED',
            entryExit: 'EXIT',
        });
        this.positions.set(symbol, { qty: 0, avgPx: 0, side: 'LONG', entryBar: 0 });
        logger_1.default.debug(`[BacktestEngine] Closed ${symbol} position: ${reason}, PnL: ${pnl.toFixed(2)}`);
    }
    /**
     * Close all positions at end of backtest
     */
    closeAllPositions(lastCandle) {
        const time = lastCandle.timestamp.getTime();
        for (const [symbol, pos] of this.positions) {
            if (pos.qty !== 0) {
                this.closePosition(symbol, lastCandle.close, time, 'END_OF_BACKTEST');
            }
        }
    }
    /**
     * Calculate backtest results with proper metrics
     */
    calculateResults(strategy, candles, hoursPerCandle) {
        const exitTrades = this.trades.filter(t => t.entryExit === 'EXIT');
        const winningTrades = exitTrades.filter(t => (t.pnl || 0) > 0);
        const losingTrades = exitTrades.filter(t => (t.pnl || 0) < 0);
        const initialCapital = this.config.initialCapital ?? 10000;
        const totalReturn = ((this.capital - initialCapital) / initialCapital) * 100;
        const winRate = exitTrades.length > 0 ? (winningTrades.length / exitTrades.length) * 100 : 0;
        // Actual data duration
        const dataDurationMs = candles[candles.length - 1].timestamp.getTime() - candles[0].timestamp.getTime();
        const dataDurationYears = Math.max(dataDurationMs / (365.25 * 24 * 3600 * 1000), 1 / 365.25);
        const annualizedReturn = ((Math.pow(this.capital / initialCapital, 1 / dataDurationYears) - 1) * 100);
        // Max drawdown including fees
        let maxDrawdown = 0;
        let peak = initialCapital;
        let runningCapital = initialCapital;
        for (const trade of exitTrades) {
            runningCapital += (trade.pnl || 0) - (trade.fee || 0);
            peak = Math.max(peak, runningCapital);
            const drawdown = ((peak - runningCapital) / peak) * 100;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        // Sharpe ratio (proper annualization via trades-per-year)
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
        // Annualization: use min(tradesPerYear, 252) to prevent absurd inflation
        // on short backtest windows. 252 = standard daily-bar annualization factor.
        // A strategy with 100 trades in 1 hour should NOT show 87,000x annualized Sharpe.
        const rawTradesPerYear = dataDurationYears > 0 ? exitTrades.length / dataDurationYears : exitTrades.length * 365;
        const annualizationFactor = Math.min(Math.sqrt(rawTradesPerYear), Math.sqrt(252));
        const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * annualizationFactor : 0;
        // Real Sortino ratio (same capped annualization)
        const downsideReturns = returns.filter(r => r < 0);
        const downsideDev = downsideReturns.length > 1
            ? Math.sqrt(downsideReturns.reduce((sum, r) => sum + r * r, 0) / (downsideReturns.length - 1))
            : downsideReturns.length === 1 ? Math.abs(downsideReturns[0]) : 1;
        const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * annualizationFactor : 0;
        // Real VaR95
        const sortedReturns = [...returns].sort((a, b) => a - b);
        const varIndex = Math.floor(sortedReturns.length * 0.05);
        const var95 = sortedReturns.length > 0 ? Math.abs(sortedReturns[varIndex] || 0) * 100 : 0;
        // Profit factor
        const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 999 : 0;
        // Average win/loss
        const avgWin = winningTrades.length > 0
            ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0
            ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)) / losingTrades.length : 0;
        // Max consecutive losses
        let maxConsecutiveLosses = 0;
        let consecutiveLosses = 0;
        for (const trade of exitTrades) {
            if ((trade.pnl || 0) < 0) {
                consecutiveLosses++;
                maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
            }
            else {
                consecutiveLosses = 0;
            }
        }
        // Average trade duration (match entries/exits by symbol, not index)
        const entryTrades = this.trades.filter(t => t.entryExit === 'ENTRY');
        let avgTradeDuration = 0;
        if (entryTrades.length > 0 && exitTrades.length > 0) {
            const durations = [];
            // Build a map of symbol -> list of entry timestamps
            const entryMap = new Map();
            for (const et of entryTrades) {
                const list = entryMap.get(et.symbol) || [];
                list.push(et.timestamp.getTime());
                entryMap.set(et.symbol, list);
            }
            // Match each exit to the earliest unmatched entry for same symbol
            for (const xt of exitTrades) {
                const entries = entryMap.get(xt.symbol);
                if (entries && entries.length > 0) {
                    const entryTime = entries.shift();
                    durations.push((xt.timestamp.getTime() - entryTime) / (1000 * 60 * 60)); // hours
                }
            }
            avgTradeDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
        }
        // Expectancy
        const expectancy = exitTrades.length > 0
            ? exitTrades.reduce((sum, t) => sum + (t.pnl || 0) - (t.fee || 0), 0) / exitTrades.length : 0;
        const calmarRatio = maxDrawdown > 0 ? Math.abs(annualizedReturn) / maxDrawdown : 0;
        return {
            strategyId: strategy.id,
            period: {
                start: candles[0]?.timestamp || new Date(),
                end: candles[candles.length - 1]?.timestamp || new Date(),
            },
            initialCapital: this.config.initialCapital ?? 10000,
            finalCapital: this.capital,
            totalReturn,
            annualizedReturn,
            sharpeRatio,
            maxDrawdown,
            winRate,
            totalTrades: exitTrades.length,
            trades: this.trades,
            profitFactor,
            metrics: {
                calmarRatio,
                sortinoRatio,
                var95,
                beta: 0, // Requires benchmark data
                alpha: 0, // Requires benchmark data
                avgWin,
                avgLoss,
                maxConsecutiveLosses,
                avgTradeDuration,
                totalFees: this.totalFees,
                avgSlippageCost: exitTrades.length > 0 ? this.totalSlippageCost / exitTrades.length : 0,
                expectancy,
            },
        };
    }
    /**
     * Estimate hours per candle from timestamp gaps
     */
    estimateHoursPerCandle(candles) {
        if (candles.length < 2)
            return 1;
        const gaps = [];
        const sampleCount = Math.min(20, candles.length - 1);
        for (let i = 1; i <= sampleCount; i++) {
            gaps.push(candles[i].timestamp.getTime() - candles[i - 1].timestamp.getTime());
        }
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        return Math.max(1 / 60, Math.min(24, avgGap / (1000 * 60 * 60)));
    }
    /**
     * Reset engine state
     */
    reset() {
        this.capital = this.config.initialCapital ?? 10000;
        this.totalFees = 0;
        this.totalSlippageCost = 0;
        this.positions.clear();
        this.trades = [];
        this.clock.reset();
        logger_1.default.debug('[BacktestEngine] Reset complete');
    }
    /**
     * Get current clock
     */
    getClock() {
        return this.clock;
    }
    /**
     * Get current positions
     */
    getPositions() {
        return new Map(this.positions);
    }
    /**
     * Get current capital
     */
    getCapital() {
        return this.capital;
    }
}
exports.BacktestEngine = BacktestEngine;
/**
 * Convenience function to run a quick backtest
 */
async function runBacktest(strategy, candles, config) {
    const engine = new BacktestEngine(config);
    return await engine.runBacktest(strategy, candles);
}
exports.default = BacktestEngine;
//# sourceMappingURL=enhanced-backtest.js.map