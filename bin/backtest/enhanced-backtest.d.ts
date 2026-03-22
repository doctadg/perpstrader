/**
 * Enhanced Backtesting Engine
 *
 * Nautilus-inspired backtesting with realistic execution simulation.
 * Integrates simulation clock, fill models, and order book simulation.
 */
import { MarketData, BacktestResult, Strategy } from '../shared/types';
import { TestClock, ClockMode } from './simulation-clock';
import { FillModels } from './fill-models';
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
 * Enhanced Backtest Engine with Nautilus-style features and realistic execution
 */
export declare class BacktestEngine {
    private config;
    private clock;
    private fillModel;
    private capital;
    private totalFees;
    private totalSlippageCost;
    private positions;
    private trades;
    private orderBooks;
    private minBarsBetweenEntries;
    private nextBarExecution;
    private intrabarStopCheck;
    private hourlyFundingRate;
    private maxCapital;
    constructor(config?: BacktestEngineConfig);
    /**
     * Run a complete backtest
     */
    runBacktest(strategy: Strategy, candles: MarketData[]): Promise<BacktestResult>;
    /**
     * Initialize order books from first candles
     */
    private initializeOrderBooks;
    /**
     * Update order book for a candle
     */
    private updateOrderBook;
    /**
     * Initialize strategy state
     */
    private initializeStrategyState;
    /** Get or create per-symbol state for indicator calculations */
    private getSymbolState;
    /**
     * Charge funding rate for open positions
     */
    private chargeFunding;
    /**
     * Check intrabar stop/take-profit using candle high/low
     */
    private checkIntrabarExits;
    /**
     * Generate trading signals from strategy using indicator-based logic
     */
    private generateSignals;
    private createBuySignal;
    private createSellSignal;
    /**
     * Execute a trading signal — commission is DEDUCTED from capital here
     */
    private executeSignal;
    /**
     * Check and execute stop loss / take profit (close-based fallback)
     */
    private checkExitConditions;
    /**
     * Close a position with explicit fill price (for intrabar stops)
     */
    private closePositionWithFill;
    /**
     * Close a position
     */
    private closePosition;
    /**
     * Close all positions at end of backtest
     */
    private closeAllPositions;
    /**
     * Calculate backtest results with proper metrics
     */
    private calculateResults;
    /**
     * Estimate hours per candle from timestamp gaps
     */
    private estimateHoursPerCandle;
    /**
     * Reset engine state
     */
    private reset;
    /**
     * Get current clock
     */
    getClock(): TestClock;
    /**
     * Get current positions
     */
    getPositions(): Map<string, {
        qty: number;
        avgPx: number;
        side: 'LONG' | 'SHORT';
    }>;
    /**
     * Get current capital
     */
    getCapital(): number;
}
/**
 * Convenience function to run a quick backtest
 */
export declare function runBacktest(strategy: Strategy, candles: MarketData[], config?: BacktestConfig): Promise<BacktestResult>;
export default BacktestEngine;
//# sourceMappingURL=enhanced-backtest.d.ts.map