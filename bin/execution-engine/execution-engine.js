"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionEngine = void 0;
const uuid_1 = require("uuid");
const config_1 = __importDefault(require("../shared/config"));
const logger_1 = __importDefault(require("../shared/logger"));
const hyperliquid_client_1 = __importDefault(require("./hyperliquid-client"));
const data_manager_1 = __importDefault(require("../data-manager/data-manager"));
// Track current prices for portfolio valuation
const currentPrices = new Map();
class ExecutionEngine {
    isTestnet;
    // REMOVED: isPaperTrading flag
    constructor() {
        const hyperliquidConfig = config_1.default.getSection('hyperliquid');
        this.isTestnet = hyperliquidConfig.testnet;
        logger_1.default.info(`Execution Engine initialized - Mode: ${this.getEnvironment()}`);
        // Initialize the Hyperliquid client asynchronously
        this.initializeClient();
    }
    async initializeClient() {
        try {
            await hyperliquid_client_1.default.initialize();
            // Log account state on startup if configured
            if (hyperliquid_client_1.default.isConfigured()) {
                const state = await hyperliquid_client_1.default.getAccountState();
                logger_1.default.info(`Hyperliquid account connected - Equity: $${state.equity.toFixed(2)}, Withdrawable: $${state.withdrawable.toFixed(2)}`);
            }
            else {
                logger_1.default.warn('Hyperliquid client NOT configured. Please check your .env file.');
            }
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Hyperliquid client:', error);
        }
    }
    /**
     * Update current price for a symbol (for portfolio valuation)
     */
    updatePrice(symbol, price) {
        currentPrices.set(symbol, price);
    }
    async executeSignal(signal, riskAssessment) {
        try {
            if (signal.action === 'HOLD') {
                throw new Error('Cannot execute HOLD signal');
            }
            // Update price
            if (signal.price) {
                currentPrices.set(signal.symbol, signal.price);
            }
            // Check configuration before trading
            if (!hyperliquid_client_1.default.isConfigured()) {
                throw new Error('Hyperliquid Client is not configured. Cannot execute live trade.');
            }
            // LIVE TRADING with Hyperliquid SDK
            logger_1.default.info(`[LIVE ${this.isTestnet ? 'TESTNET' : 'MAINNET'}] Executing ${signal.action} ${riskAssessment.suggestedSize} ${signal.symbol} at ${signal.price}`);
            const result = await hyperliquid_client_1.default.placeOrder({
                symbol: signal.symbol,
                side: signal.action,
                size: riskAssessment.suggestedSize,
                price: signal.price,
                orderType: signal.type.toLowerCase()
            });
            const trade = {
                id: (0, uuid_1.v4)(),
                strategyId: signal.strategyId,
                symbol: signal.symbol,
                side: signal.action,
                size: result.filledSize || riskAssessment.suggestedSize,
                price: result.filledPrice || signal.price || 0,
                fee: 0,
                pnl: 0,
                timestamp: new Date(),
                type: signal.type,
                status: result.success ? 'FILLED' : 'CANCELLED',
                entryExit: 'ENTRY'
            };
            if (result.success) {
                logger_1.default.info(`Trade executed: ${JSON.stringify(trade)}`);
                // Persist trade to database for Dashboard
                await data_manager_1.default.saveTrade(trade);
            }
            else {
                logger_1.default.warn(`Trade failed: ${result.error || result.status}`);
            }
            return trade;
        }
        catch (error) {
            logger_1.default.error('Signal execution failed:', error);
            throw error;
        }
    }
    async getPortfolio() {
        try {
            // Get live portfolio from Hyperliquid
            if (!hyperliquid_client_1.default.isConfigured()) {
                // Return empty portfolio if not configured, rather than throwing hard error?
                // Or maybe throw to alert user? usage seems to expect a Portfolio object.
                return {
                    totalValue: 0,
                    availableBalance: 0,
                    usedBalance: 0,
                    positions: [],
                    dailyPnL: 0,
                    unrealizedPnL: 0
                };
            }
            const state = await hyperliquid_client_1.default.getAccountState();
            const positions = state.positions.map(pos => ({
                symbol: pos.symbol,
                side: pos.side,
                size: pos.size,
                entryPrice: pos.entryPrice,
                markPrice: pos.markPrice,
                unrealizedPnL: pos.unrealizedPnL,
                leverage: pos.leverage,
                marginUsed: pos.marginUsed
            }));
            return {
                totalValue: state.equity,
                availableBalance: state.withdrawable,
                usedBalance: state.marginUsed,
                positions,
                dailyPnL: 0, // Hyperliquid API might provide this in summary, but for now 0 or calculate
                unrealizedPnL: positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0)
            };
        }
        catch (error) {
            logger_1.default.error('Failed to get portfolio:', error);
            throw error;
        }
    }
    async cancelOrder(orderId, symbol) {
        if (!symbol) {
            logger_1.default.error('Symbol required to cancel order');
            return false;
        }
        return await hyperliquid_client_1.default.cancelOrder(symbol, orderId);
    }
    async getOpenOrders(symbol) {
        try {
            let orders = await hyperliquid_client_1.default.getOpenOrders();
            if (symbol) {
                orders = orders.filter((order) => order.coin === symbol);
            }
            return orders;
        }
        catch (error) {
            logger_1.default.error('Failed to get open orders:', error);
            return [];
        }
    }
    async getHistoricalTrades(symbol, limit = 100) {
        try {
            return await hyperliquid_client_1.default.getRecentTrades(symbol);
        }
        catch (error) {
            logger_1.default.error('Failed to get historical trades:', error);
            return [];
        }
    }
    async getMarketData(symbol) {
        try {
            return await hyperliquid_client_1.default.getL2Book(symbol);
        }
        catch (error) {
            logger_1.default.error('Failed to get market data:', error);
            throw error;
        }
    }
    async subscribeToWebSocket(callback) {
        logger_1.default.info('WebSocket subscription requested, using polling fallback');
        const pollInterval = setInterval(async () => {
            try {
                const portfolio = await this.getPortfolio();
                callback({ type: 'portfolio', data: portfolio });
            }
            catch (error) {
                logger_1.default.error('Portfolio polling failed:', error);
            }
        }, 5000);
        this.pollInterval = pollInterval;
    }
    unsubscribeFromWebSocket() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
    async emergencyStop() {
        try {
            logger_1.default.info('Executing emergency stop - cancelling all orders');
            await hyperliquid_client_1.default.cancelAllOrders();
            logger_1.default.info('Emergency stop completed - all orders canceled');
        }
        catch (error) {
            logger_1.default.error('Emergency stop failed:', error);
            throw error;
        }
    }
    async validateCredentials() {
        try {
            if (!hyperliquid_client_1.default.isConfigured())
                return false;
            const state = await hyperliquid_client_1.default.getAccountState();
            logger_1.default.info(`Credentials validated - Account equity: $${state.equity.toFixed(2)}`);
            return true;
        }
        catch (error) {
            logger_1.default.error('Credential validation failed:', error);
            return false;
        }
    }
    isConfigured() {
        return hyperliquid_client_1.default.isConfigured();
    }
    getEnvironment() {
        return this.isTestnet ? 'TESTNET' : 'LIVE';
    }
    /**
     * Get recently executed trades from DB
     * Replaces getPaperTrades
     */
    async getRecentTrades(limit = 20) {
        return await data_manager_1.default.getTrades(undefined, undefined, limit);
    }
    /**
     * Get current positions from Hyperliquid
     * Replaces getPaperPositions
     */
    async getPositions() {
        const portfolio = await this.getPortfolio();
        return portfolio.positions;
    }
    /**
     * Get realized P&L from DB
     * Replaces getPaperRealizedPnL (Approximation)
     */
    async getRealizedPnL() {
        const performance = await data_manager_1.default.getPortfolioPerformance('30d');
        return performance.totalPnL;
    }
    /**
     * Get the wallet address being used
     */
    getWalletAddress() {
        return hyperliquid_client_1.default.getWalletAddress();
    }
}
exports.ExecutionEngine = ExecutionEngine;
const executionEngine = new ExecutionEngine();
exports.default = executionEngine;
//# sourceMappingURL=execution-engine.js.map