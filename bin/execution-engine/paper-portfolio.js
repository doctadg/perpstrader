"use strict";
// Paper Portfolio Manager
// Manages a simulated trading portfolio for paper trading mode
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaperPortfolioManager = void 0;
const data_manager_1 = __importDefault(require("../data-manager/data-manager"));
const logger_1 = __importDefault(require("../shared/logger"));
/**
 * Paper Portfolio Manager
 * Tracks simulated positions and P&L for paper trading
 */
class PaperPortfolioManager {
    static instance;
    initialBalance = 10000; // $10,000 starting balance
    cashBalance;
    positions = new Map();
    realizedPnL = 0;
    trades = [];
    snapshots = [];
    dailyStartValue;
    lastSnapshotTime;
    constructor() {
        this.cashBalance = this.initialBalance;
        this.dailyStartValue = this.initialBalance;
        this.lastSnapshotTime = new Date();
        this.loadState();
    }
    static getInstance() {
        if (!PaperPortfolioManager.instance) {
            PaperPortfolioManager.instance = new PaperPortfolioManager();
        }
        return PaperPortfolioManager.instance;
    }
    /**
     * Load persisted state from database
     */
    async loadState() {
        try {
            // Try to load last portfolio state from AI insights
            const insights = await data_manager_1.default.getAIInsights('paper_portfolio', 1);
            if (insights.length > 0 && insights[0].data) {
                const state = insights[0].data;
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
                logger_1.default.info(`[PaperPortfolio] Loaded state: $${this.cashBalance.toFixed(2)} cash, ${this.positions.size} positions`);
            }
        }
        catch (error) {
            logger_1.default.warn('[PaperPortfolio] Could not load state, starting fresh');
        }
    }
    /**
     * Save state to database
     */
    async saveState() {
        try {
            const state = {
                cashBalance: this.cashBalance,
                realizedPnL: this.realizedPnL,
                dailyStartValue: this.dailyStartValue,
                positions: Array.from(this.positions.values()),
                timestamp: new Date(),
            };
            await data_manager_1.default.saveAIInsight({
                id: 'paper_portfolio_state',
                type: 'paper_portfolio',
                title: 'Paper Portfolio State',
                description: 'Persistent paper trading portfolio state',
                timestamp: new Date(),
                data: state,
                confidence: 1,
                actionable: false,
            });
        }
        catch (error) {
            logger_1.default.error('[PaperPortfolio] Failed to save state:', error);
        }
    }
    /**
     * Execute a paper trade
     */
    async executeTrade(symbol, side, size, price, strategyId) {
        const existingPosition = this.positions.get(symbol);
        let pnl = 0;
        let entryExit = 'ENTRY';
        // Check if this is closing an existing position
        if (existingPosition) {
            if ((existingPosition.side === 'LONG' && side === 'SELL') ||
                (existingPosition.side === 'SHORT' && side === 'BUY')) {
                // Closing position - calculate P&L
                const closeSize = Math.min(size, existingPosition.size);
                if (existingPosition.side === 'LONG') {
                    pnl = (price - existingPosition.entryPrice) * closeSize;
                }
                else {
                    pnl = (existingPosition.entryPrice - price) * closeSize;
                }
                this.realizedPnL += pnl;
                this.cashBalance += pnl + (closeSize * existingPosition.entryPrice);
                entryExit = 'EXIT';
                // Update or remove position
                if (closeSize >= existingPosition.size) {
                    this.positions.delete(symbol);
                    logger_1.default.info(`[PaperPortfolio] Closed ${symbol} position, P&L: $${pnl.toFixed(2)}`);
                }
                else {
                    existingPosition.size -= closeSize;
                    logger_1.default.info(`[PaperPortfolio] Reduced ${symbol} position by ${closeSize}, remaining: ${existingPosition.size}`);
                }
            }
            else {
                // Adding to position
                const totalCost = existingPosition.entryPrice * existingPosition.size + price * size;
                const totalSize = existingPosition.size + size;
                existingPosition.entryPrice = totalCost / totalSize;
                existingPosition.size = totalSize;
                this.cashBalance -= price * size;
                logger_1.default.info(`[PaperPortfolio] Increased ${symbol} position to ${totalSize}`);
            }
        }
        else {
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
            logger_1.default.info(`[PaperPortfolio] Opened ${positionSide} ${symbol} x${size} @ $${price.toFixed(2)}`);
        }
        // Create trade record
        const trade = {
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
    getPortfolio(currentPrices) {
        let unrealizedPnL = 0;
        const positions = [];
        for (const [symbol, pos] of this.positions) {
            const currentPrice = currentPrices.get(symbol) || pos.entryPrice;
            let positionPnL;
            if (pos.side === 'LONG') {
                positionPnL = (currentPrice - pos.entryPrice) * pos.size;
            }
            else {
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
                entryTime: pos.entryTime, // NEW: Include entry time for time-based exits
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
    getAvailableBalance() {
        return this.cashBalance;
    }
    /**
     * Get total portfolio value
     */
    getTotalValue(currentPrices) {
        return this.getPortfolio(currentPrices).totalValue;
    }
    /**
     * Take a portfolio snapshot for charting
     */
    takeSnapshot(currentPrice) {
        const now = new Date();
        // Only take snapshots every 5 minutes
        if (now.getTime() - this.lastSnapshotTime.getTime() < 5 * 60 * 1000) {
            return;
        }
        const prices = new Map();
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
    getSnapshots() {
        return this.snapshots;
    }
    /**
     * Get recent trades
     */
    getTrades(limit = 50) {
        return this.trades.slice(-limit);
    }
    /**
     * Get open positions
     */
    getOpenPositions() {
        return Array.from(this.positions.values());
    }
    /**
     * Get realized P&L
     */
    getRealizedPnL() {
        return this.realizedPnL;
    }
    /**
     * Reset portfolio to initial state
     */
    reset() {
        this.cashBalance = this.initialBalance;
        this.positions.clear();
        this.realizedPnL = 0;
        this.trades = [];
        this.snapshots = [];
        this.dailyStartValue = this.initialBalance;
        logger_1.default.info('[PaperPortfolio] Reset to initial state');
    }
    /**
     * Reset daily P&L tracking (call at start of each day)
     */
    resetDailyTracking(currentPrices) {
        this.dailyStartValue = this.getTotalValue(currentPrices);
        logger_1.default.info(`[PaperPortfolio] Daily tracking reset, starting value: $${this.dailyStartValue.toFixed(2)}`);
    }
}
exports.PaperPortfolioManager = PaperPortfolioManager;
exports.default = PaperPortfolioManager.getInstance();
//# sourceMappingURL=paper-portfolio.js.map