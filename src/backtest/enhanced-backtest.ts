/**
 * Enhanced Backtesting Engine
 *
 * Nautilus-inspired backtesting with realistic execution simulation.
 * Integrates simulation clock, fill models, and order book simulation.
 */

import { MarketData, BacktestResult, Trade, Strategy } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { TestClock, createClock, ClockMode } from './simulation-clock';
import { FillModel, OrderBookBuilder, SimulatedOrder, PositionCalculator, FillModels } from './fill-models';
import logger from '../shared/logger';

export interface BacktestConfig {
    initialCapital?: number;
    fillModel?: keyof typeof FillModels;
    commissionRate?: number;
    slippageBps?: number;
    latencyMs?: number;
    randomSeed?: number;
}

export interface BacktestEngineConfig extends BacktestConfig {
    clockMode?: ClockMode;
    startTime?: number;
}

/**
 * Enhanced Backtest Engine with Nautilus-style features
 */
export class BacktestEngine {
    private config: BacktestEngineConfig;
    private clock: TestClock;
    private fillModel: FillModel;
    private capital: number;
    private positions: Map<string, { qty: number; avgPx: number; side: 'LONG' | 'SHORT' }> = new Map();
    private trades: Trade[] = [];
    private orderBooks: Map<string, any> = new Map();

    constructor(config: BacktestEngineConfig = {}) {
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
        this.clock = new TestClock(this.config.startTime);

        // Initialize fill model
        this.fillModel = new FillModel(
            {
                avgSlippageBps: this.config.slippageBps,
                commissionRate: this.config.commissionRate,
            },
            {
                baseLatencyMs: this.config.latencyMs,
            }
        );

        if (this.config.randomSeed) {
            this.fillModel.setSeed(this.config.randomSeed);
        }

        this.capital = this.config.initialCapital ?? 10000;

        logger.info('[BacktestEngine] Initialized with config:', this.config);
    }

    /**
     * Run a complete backtest
     */
    async runBacktest(
        strategy: Strategy,
        candles: MarketData[]
    ): Promise<BacktestResult> {
        logger.info(`[BacktestEngine] Running backtest for ${strategy.name} on ${candles.length} candles`);

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
    private initializeOrderBooks(candles: MarketData[]): void {
        for (const candle of candles) {
            if (!this.orderBooks.has(candle.symbol)) {
                const book = OrderBookBuilder.fromMarketData(candle, 20);
                this.orderBooks.set(candle.symbol, book);
            }
        }
    }

    /**
     * Update order book for a candle
     */
    private updateOrderBook(candle: MarketData): void {
        const book = this.orderBooks.get(candle.symbol);
        if (book) {
            const bidsEntries = Array.from(book.bids?.entries() || []) as [number, number][];
            const asksEntries = Array.from(book.asks?.entries() || []) as [number, number][];

            const updatedBook = {
                ...book,
                bids: new Map(
                    bidsEntries.map(([price, size]: [number, number]) => [
                        price + (candle.close - (book.midPrice || candle.close)),
                        size,
                    ])
                ),
                asks: new Map(
                    asksEntries.map(([price, size]: [number, number]) => [
                        price + (candle.close - (book.midPrice || candle.close)),
                        size,
                    ])
                ),
                midPrice: candle.close,
                lastUpdate: candle.timestamp.getTime(),
            };
            this.orderBooks.set(candle.symbol, updatedBook);
        }
    }

    /**
     * Initialize strategy state
     */
    private initializeStrategyState(strategy: Strategy): any {
        return {
            indicators: {},
            lastSignal: null,
            lastSignalTime: 0,
        };
    }

    /**
     * Generate trading signals from strategy
     */
    private generateSignals(
        strategy: Strategy,
        candle: MarketData,
        state: any
    ): SimulatedOrder[] {
        const signals: SimulatedOrder[] = [];

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
                        orderId: uuidv4(),
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
                        orderId: uuidv4(),
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
    private async executeSignal(
        signal: SimulatedOrder,
        candle: MarketData,
        currentTime: number
    ): Promise<void> {
        const book = this.orderBooks.get(signal.symbol);
        if (!book) return;

        // Simulate fills
        const fills = this.fillModel.simulateFill(signal, book);

        for (const fill of fills) {
            const symbol = signal.symbol;
            const currentPos = this.positions.get(symbol) || { qty: 0, avgPx: 0, side: 'LONG' };

            const { qty, avgPx, realizedPnL } = PositionCalculator.applyFills(
                currentPos.qty,
                currentPos.avgPx,
                [fill]
            );

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
    private checkExitConditions(strategy: Strategy, candle: MarketData, currentTime: number): void {
        for (const [symbol, pos] of this.positions) {
            if (pos.qty === 0) continue;

            const riskParams = strategy.riskParameters;
            if (!riskParams) continue;

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
    private closePosition(symbol: string, price: number, time: number, reason: string): void {
        const pos = this.positions.get(symbol);
        if (!pos || pos.qty === 0) return;

        const closeQty = pos.qty;
        const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
        const pnl = pos.side === 'LONG'
            ? (price - pos.avgPx) * closeQty
            : (pos.avgPx - price) * closeQty;

        this.capital += pnl;

        this.trades.push({
            id: uuidv4(),
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

        logger.debug(`[BacktestEngine] Closed ${symbol} position: ${reason}, PnL: ${pnl.toFixed(2)}`);
    }

    /**
     * Close all positions at end of backtest
     */
    private closeAllPositions(lastCandle: MarketData): void {
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
    private calculateResults(strategy: Strategy, candles: MarketData[]): BacktestResult {
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
    private reset(): void {
        this.capital = this.config.initialCapital ?? 10000;
        this.positions.clear();
        this.trades = [];
        this.clock.reset();
        logger.debug('[BacktestEngine] Reset complete');
    }

    /**
     * Get current clock
     */
    getClock(): TestClock {
        return this.clock;
    }

    /**
     * Get current positions
     */
    getPositions(): Map<string, { qty: number; avgPx: number; side: 'LONG' | 'SHORT' }> {
        return new Map(this.positions);
    }

    /**
     * Get current capital
     */
    getCapital(): number {
        return this.capital;
    }
}

/**
 * Convenience function to run a quick backtest
 */
export async function runBacktest(
    strategy: Strategy,
    candles: MarketData[],
    config?: BacktestConfig
): Promise<BacktestResult> {
    const engine = new BacktestEngine(config);
    return await engine.runBacktest(strategy, candles);
}

export default BacktestEngine;
