// Paper Portfolio Manager
// Manages a simulated trading portfolio for paper trading mode

import { Trade, Portfolio, Position } from '../shared/types';
import dataManager from '../data-manager/data-manager';
import logger from '../shared/logger';

export interface PaperPosition {
    symbol: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entryPrice: number;
    entryTime: Date;
    strategyId?: string;
}

interface PortfolioSnapshot {
    timestamp: Date;
    totalValue: number;
    realizedPnL: number;
    unrealizedPnL: number;
}

/**
 * Paper Portfolio Manager
 * Tracks simulated positions and P&L for paper trading
 */
export class PaperPortfolioManager {
    private static instance: PaperPortfolioManager;

    private initialBalance: number = 10000; // $10,000 starting balance
    private cashBalance: number;
    private positions: Map<string, PaperPosition> = new Map();
    private realizedPnL: number = 0;
    private trades: Trade[] = [];
    private snapshots: PortfolioSnapshot[] = [];
    private dailyStartValue: number;
    private lastSnapshotTime: Date;

    private constructor() {
        this.cashBalance = this.initialBalance;
        this.dailyStartValue = this.initialBalance;
        this.lastSnapshotTime = new Date();
        this.loadState();
    }

    static getInstance(): PaperPortfolioManager {
        if (!PaperPortfolioManager.instance) {
            PaperPortfolioManager.instance = new PaperPortfolioManager();
        }
        return PaperPortfolioManager.instance;
    }

    /**
     * Load persisted state from database
     */
    private async loadState(): Promise<void> {
        try {
            // Try to load last portfolio state from AI insights
            const insights = await dataManager.getAIInsights('paper_portfolio', 1);
            if (insights.length > 0 && insights[0].data) {
                const state = insights[0].data as any;
                this.cashBalance = state.cashBalance || this.initialBalance;
                this.realizedPnL = state.realizedPnL || 0;
                this.dailyStartValue = state.dailyStartValue || this.initialBalance;

                // Restore positions
                if (state.positions) {
                    for (const pos of state.positions) {
                        this.positions.set(pos.symbol, {
                            ...pos,
                            entryTime: new Date(pos.entryTime),
                        });
                    }
                }

                logger.info(`[PaperPortfolio] Loaded state: $${this.cashBalance.toFixed(2)} cash, ${this.positions.size} positions`);
            }
        } catch (error) {
            logger.warn('[PaperPortfolio] Could not load state, starting fresh');
        }
    }

    /**
     * Save state to database
     */
    async saveState(): Promise<void> {
        try {
            const state = {
                cashBalance: this.cashBalance,
                realizedPnL: this.realizedPnL,
                dailyStartValue: this.dailyStartValue,
                positions: Array.from(this.positions.values()),
                timestamp: new Date(),
            };

            await dataManager.saveAIInsight({
                id: 'paper_portfolio_state',
                type: 'paper_portfolio',
                title: 'Paper Portfolio State',
                description: 'Persistent paper trading portfolio state',
                timestamp: new Date(),
                data: state,
                confidence: 1,
                actionable: false,
            });
        } catch (error) {
            logger.error('[PaperPortfolio] Failed to save state:', error);
        }
    }

    /**
     * Execute a paper trade
     */
    async executeTrade(
        symbol: string,
        side: 'BUY' | 'SELL',
        size: number,
        price: number,
        strategyId?: string
    ): Promise<Trade> {
        const existingPosition = this.positions.get(symbol);
        let pnl = 0;
        let entryExit: 'ENTRY' | 'EXIT' = 'ENTRY';

        // Check if this is closing an existing position
        if (existingPosition) {
            if ((existingPosition.side === 'LONG' && side === 'SELL') ||
                (existingPosition.side === 'SHORT' && side === 'BUY')) {
                // Closing position - calculate P&L
                const closeSize = Math.min(size, existingPosition.size);

                if (existingPosition.side === 'LONG') {
                    pnl = (price - existingPosition.entryPrice) * closeSize;
                } else {
                    pnl = (existingPosition.entryPrice - price) * closeSize;
                }

                this.realizedPnL += pnl;
                this.cashBalance += pnl + (closeSize * existingPosition.entryPrice);
                entryExit = 'EXIT';

                // Update or remove position
                if (closeSize >= existingPosition.size) {
                    this.positions.delete(symbol);
                    logger.info(`[PaperPortfolio] Closed ${symbol} position, P&L: $${pnl.toFixed(2)}`);
                } else {
                    existingPosition.size -= closeSize;
                    logger.info(`[PaperPortfolio] Reduced ${symbol} position by ${closeSize}, remaining: ${existingPosition.size}`);
                }
            } else {
                // Adding to position
                const totalCost = existingPosition.entryPrice * existingPosition.size + price * size;
                const totalSize = existingPosition.size + size;
                existingPosition.entryPrice = totalCost / totalSize;
                existingPosition.size = totalSize;
                this.cashBalance -= price * size;
                logger.info(`[PaperPortfolio] Increased ${symbol} position to ${totalSize}`);
            }
        } else {
            // Opening new position
            const positionSide = side === 'BUY' ? 'LONG' : 'SHORT';
            const marginRequired = price * size * 0.1; // 10x leverage = 10% margin

            if (marginRequired > this.cashBalance) {
                throw new Error(`Insufficient balance: need $${marginRequired.toFixed(2)}, have $${this.cashBalance.toFixed(2)}`);
            }

            this.positions.set(symbol, {
                symbol,
                side: positionSide,
                size,
                entryPrice: price,
                entryTime: new Date(),
                strategyId,
            });

            this.cashBalance -= marginRequired;
            logger.info(`[PaperPortfolio] Opened ${positionSide} ${symbol} x${size} @ $${price.toFixed(2)}`);
        }

        // Create trade record
        const trade: Trade = {
            id: crypto.randomUUID(),
            strategyId,
            symbol,
            side,
            size,
            price,
            pnl,
            fee: price * size * 0.0002, // 0.02% fee
            timestamp: new Date(),
            type: 'MARKET',
            status: 'FILLED',
            entryExit,
        };

        this.trades.push(trade);
        await this.saveState();
        this.takeSnapshot(price);

        return trade;
    }

    /**
     * Get current portfolio state
     */
    getPortfolio(currentPrices: Map<string, number>): Portfolio {
        let unrealizedPnL = 0;
        const positions: Position[] = [];

        for (const [symbol, pos] of this.positions) {
            const currentPrice = currentPrices.get(symbol) || pos.entryPrice;
            let positionPnL: number;

            if (pos.side === 'LONG') {
                positionPnL = (currentPrice - pos.entryPrice) * pos.size;
            } else {
                positionPnL = (pos.entryPrice - currentPrice) * pos.size;
            }

            unrealizedPnL += positionPnL;

            positions.push({
                symbol: pos.symbol,
                side: pos.side,
                size: pos.size,
                entryPrice: pos.entryPrice,
                markPrice: currentPrice,
                unrealizedPnL: positionPnL,
                leverage: 10,
                marginUsed: pos.entryPrice * pos.size * 0.1,
                entryTime: pos.entryTime,  // NEW: Include entry time for time-based exits
            });
        }

        const totalValue = this.cashBalance + unrealizedPnL +
            Array.from(this.positions.values()).reduce((sum, p) => sum + p.entryPrice * p.size * 0.1, 0);

        const dailyPnL = totalValue - this.dailyStartValue;

        return {
            totalValue,
            availableBalance: this.cashBalance,
            usedBalance: totalValue - this.cashBalance,
            positions,
            dailyPnL,
            unrealizedPnL,
        };
    }

    /**
     * Get available balance for new trades
     */
    getAvailableBalance(): number {
        return this.cashBalance;
    }

    /**
     * Get total portfolio value
     */
    getTotalValue(currentPrices: Map<string, number>): number {
        return this.getPortfolio(currentPrices).totalValue;
    }

    /**
     * Take a portfolio snapshot for charting
     */
    private takeSnapshot(currentPrice: number): void {
        const now = new Date();
        // Only take snapshots every 5 minutes
        if (now.getTime() - this.lastSnapshotTime.getTime() < 5 * 60 * 1000) {
            return;
        }

        const prices = new Map<string, number>();
        for (const symbol of this.positions.keys()) {
            prices.set(symbol, currentPrice); // Simplified - should get actual prices
        }

        const portfolio = this.getPortfolio(prices);
        this.snapshots.push({
            timestamp: now,
            totalValue: portfolio.totalValue,
            realizedPnL: this.realizedPnL,
            unrealizedPnL: portfolio.unrealizedPnL,
        });

        // Keep only last 24 hours of snapshots
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        this.snapshots = this.snapshots.filter(s => s.timestamp > cutoff);
        this.lastSnapshotTime = now;
    }

    /**
     * Get portfolio history for charting
     */
    getSnapshots(): PortfolioSnapshot[] {
        return this.snapshots;
    }

    /**
     * Get recent trades
     */
    getTrades(limit: number = 50): Trade[] {
        return this.trades.slice(-limit);
    }

    /**
     * Get open positions
     */
    getOpenPositions(): PaperPosition[] {
        return Array.from(this.positions.values());
    }

    /**
     * Get realized P&L
     */
    getRealizedPnL(): number {
        return this.realizedPnL;
    }

    /**
     * Reset portfolio to initial state
     */
    reset(): void {
        this.cashBalance = this.initialBalance;
        this.positions.clear();
        this.realizedPnL = 0;
        this.trades = [];
        this.snapshots = [];
        this.dailyStartValue = this.initialBalance;
        logger.info('[PaperPortfolio] Reset to initial state');
    }

    /**
     * Reset daily P&L tracking (call at start of each day)
     */
    resetDailyTracking(currentPrices: Map<string, number>): void {
        this.dailyStartValue = this.getTotalValue(currentPrices);
        logger.info(`[PaperPortfolio] Daily tracking reset, starting value: $${this.dailyStartValue.toFixed(2)}`);
    }
}

export default PaperPortfolioManager.getInstance();
