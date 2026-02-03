import { Trade, Portfolio } from '../shared/types';
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
export declare class PaperPortfolioManager {
    private static instance;
    private initialBalance;
    private cashBalance;
    private positions;
    private realizedPnL;
    private trades;
    private snapshots;
    private dailyStartValue;
    private lastSnapshotTime;
    private constructor();
    static getInstance(): PaperPortfolioManager;
    /**
     * Load persisted state from database
     */
    private loadState;
    /**
     * Save state to database
     */
    saveState(): Promise<void>;
    /**
     * Execute a paper trade
     */
    executeTrade(symbol: string, side: 'BUY' | 'SELL', size: number, price: number, strategyId?: string): Promise<Trade>;
    /**
     * Get current portfolio state
     */
    getPortfolio(currentPrices: Map<string, number>): Portfolio;
    /**
     * Get available balance for new trades
     */
    getAvailableBalance(): number;
    /**
     * Get total portfolio value
     */
    getTotalValue(currentPrices: Map<string, number>): number;
    /**
     * Take a portfolio snapshot for charting
     */
    private takeSnapshot;
    /**
     * Get portfolio history for charting
     */
    getSnapshots(): PortfolioSnapshot[];
    /**
     * Get recent trades
     */
    getTrades(limit?: number): Trade[];
    /**
     * Get open positions
     */
    getOpenPositions(): PaperPosition[];
    /**
     * Get realized P&L
     */
    getRealizedPnL(): number;
    /**
     * Reset portfolio to initial state
     */
    reset(): void;
    /**
     * Reset daily P&L tracking (call at start of each day)
     */
    resetDailyTracking(currentPrices: Map<string, number>): void;
}
declare const _default: PaperPortfolioManager;
export default _default;
//# sourceMappingURL=paper-portfolio.d.ts.map