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
 * Enhanced Backtest Engine with Nautilus-style features
 */
class BacktestEngine {
    config;
    clock;
    fillModel;
    capital;
    positions = new Map();
    trades = [];
    orderBooks = new Map();
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
            // Generate signals from strategy
            const signals = this.generateSignals(strategy, candle, strategyState);
            // Execute signals
            for (const signal of signals) {
                await this.executeSignal(signal, candle, currentTime);
            }
            // Check stop loss / take profit
            this.checkExitConditions(strategy, candle, currentTime);
        }
        // Close any remaining positions
        this.closeAllPositions(candles[candles.length - 1]);
        // Calculate results
        return this.calculateResults(strategy, candles);
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
            const bidsEntries = Array.from(book.bids?.entries() || []);
            const asksEntries = Array.from(book.asks?.entries() || []);
            const updatedBook = {
                ...book,
                bids: new Map(bidsEntries.map(([price, size]) => [
                    price + (candle.close - (book.midPrice || candle.close)),
                    size,
                ])),
                asks: new Map(asksEntries.map(([price, size]) => [
                    price + (candle.close - (book.midPrice || candle.close)),
                    size,
                ])),
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
        };
    }
    /**
     * Generate trading signals from strategy
     */
    generateSignals(strategy, candle, state) {
        const signals = [];
        // Simple implementation - can be extended with full strategy evaluation
        const params = strategy.parameters || {};
        switch (strategy.type) {
            case 'TREND_FOLLOWING':
                // Simple MA crossover signal
                const fastPeriod = params.fastPeriod || 10;
                const slowPeriod = params.slowPeriod || 30;
                // Would calculate indicators here
                // For now, generate dummy signals for testing
                if (Math.random() > 0.95) {
                    signals.push({
                        orderId: (0, uuid_1.v4)(),
                        symbol: candle.symbol,
                        side: Math.random() > 0.5 ? 'BUY' : 'SELL',
                        type: 'MARKET',
                        quantity: (this.capital * 0.1) / candle.close,
                        timestamp: this.clock.timestamp(),
                    });
                }
                break;
            case 'MEAN_REVERSION':
                // RSI-based signals
                if (Math.random() > 0.95) {
                    signals.push({
                        orderId: (0, uuid_1.v4)(),
                        symbol: candle.symbol,
                        side: Math.random() > 0.5 ? 'BUY' : 'SELL',
                        type: 'MARKET',
                        quantity: (this.capital * 0.1) / candle.close,
                        timestamp: this.clock.timestamp(),
                    });
                }
                break;
        }
        return signals;
    }
    /**
     * Execute a trading signal
     */
    async executeSignal(signal, candle, currentTime) {
        const book = this.orderBooks.get(signal.symbol);
        if (!book)
            return;
        // Simulate fills
        const fills = this.fillModel.simulateFill(signal, book);
        for (const fill of fills) {
            const symbol = signal.symbol;
            const currentPos = this.positions.get(symbol) || { qty: 0, avgPx: 0, side: 'LONG' };
            const { qty, avgPx, realizedPnL } = fill_models_1.PositionCalculator.applyFills(currentPos.qty, currentPos.avgPx, [fill]);
            this.positions.set(symbol, {
                qty,
                avgPx,
                side: qty >= 0 ? 'LONG' : 'SHORT',
            });
            this.capital += realizedPnL;
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
                entryExit: 'ENTRY',
            });
        }
    }
    /**
     * Check and execute stop loss / take profit
     */
    checkExitConditions(strategy, candle, currentTime) {
        for (const [symbol, pos] of this.positions) {
            if (pos.qty === 0)
                continue;
            const riskParams = strategy.riskParameters;
            if (!riskParams)
                continue;
            const currentPrice = candle.close;
            const unrealizedPnL = pos.side === 'LONG'
                ? (currentPrice - pos.avgPx) * pos.qty
                : (pos.avgPx - currentPrice) * pos.qty;
            const pnlPercent = (unrealizedPnL / (pos.avgPx * pos.qty)) * 100;
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
     * Close a position
     */
    closePosition(symbol, price, time, reason) {
        const pos = this.positions.get(symbol);
        if (!pos || pos.qty === 0)
            return;
        const closeQty = pos.qty;
        const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
        const pnl = pos.side === 'LONG'
            ? (price - pos.avgPx) * closeQty
            : (pos.avgPx - price) * closeQty;
        this.capital += pnl;
        this.trades.push({
            id: (0, uuid_1.v4)(),
            symbol,
            side: closeSide,
            size: closeQty,
            price,
            fee: price * closeQty * 0.0005,
            pnl,
            timestamp: new Date(time),
            type: 'MARKET',
            status: 'FILLED',
            entryExit: 'EXIT',
        });
        this.positions.set(symbol, { qty: 0, avgPx: 0, side: 'LONG' });
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
     * Calculate backtest results
     */
    calculateResults(strategy, candles) {
        const exitTrades = this.trades.filter(t => t.entryExit === 'EXIT');
        const winningTrades = exitTrades.filter(t => (t.pnl || 0) > 0);
        const losingTrades = exitTrades.filter(t => (t.pnl || 0) < 0);
        const initialCapital = this.config.initialCapital ?? 10000;
        const totalReturn = ((this.capital - initialCapital) / initialCapital) * 100;
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
            strategyId: strategy.id,
            period: {
                start: candles[0]?.timestamp || new Date(),
                end: candles[candles.length - 1]?.timestamp || new Date(),
            },
            initialCapital: this.config.initialCapital ?? 10000,
            finalCapital: this.capital,
            totalReturn,
            annualizedReturn: totalReturn * (365 / 30), // Assuming ~1 month of data
            sharpeRatio,
            maxDrawdown,
            winRate,
            totalTrades: exitTrades.length,
            trades: this.trades,
            metrics: {
                calmarRatio: maxDrawdown > 0 ? totalReturn / maxDrawdown : 0,
                sortinoRatio: sharpeRatio * 1.2, // Simplified
                var95: maxDrawdown * 0.8, // Simplified
                beta: 1,
                alpha: totalReturn - 5, // Assuming 5% market return
            },
        };
    }
    /**
     * Reset engine state
     */
    reset() {
        this.capital = this.config.initialCapital ?? 10000;
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