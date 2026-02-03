import { TradingSignal, Trade, Portfolio, Position, RiskAssessment } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';
import config from '../shared/config';
import logger from '../shared/logger';
import hyperliquidClient from './hyperliquid-client';
import dataManager from '../data-manager/data-manager';

// Track current prices for portfolio valuation
const currentPrices: Map<string, number> = new Map();

export class ExecutionEngine {
  private isTestnet: boolean;
  // REMOVED: isPaperTrading flag

  constructor() {
    const hyperliquidConfig = config.getSection('hyperliquid');
    this.isTestnet = hyperliquidConfig.testnet;

    logger.info(`Execution Engine initialized - Mode: ${this.getEnvironment()}`);

    // Initialize the Hyperliquid client asynchronously
    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    try {
      await hyperliquidClient.initialize();

      // Log account state on startup if configured
      if (hyperliquidClient.isConfigured()) {
        const state = await hyperliquidClient.getAccountState();
        logger.info(`Hyperliquid account connected - Equity: $${state.equity.toFixed(2)}, Withdrawable: $${state.withdrawable.toFixed(2)}`);
      } else {
        logger.warn('Hyperliquid client NOT configured. Please check your .env file.');
      }
    } catch (error) {
      logger.error('Failed to initialize Hyperliquid client:', error);
    }
  }

  /**
   * Update current price for a symbol (for portfolio valuation)
   */
  updatePrice(symbol: string, price: number): void {
    currentPrices.set(symbol, price);
  }

  async executeSignal(signal: TradingSignal, riskAssessment: RiskAssessment): Promise<Trade> {
    try {
      if (signal.action === 'HOLD') {
        throw new Error('Cannot execute HOLD signal');
      }

      // Update price
      if (signal.price) {
        currentPrices.set(signal.symbol, signal.price);
      }

      // Check configuration before trading
      if (!hyperliquidClient.isConfigured()) {
        throw new Error('Hyperliquid Client is not configured. Cannot execute live trade.');
      }

      // LIVE TRADING with Hyperliquid SDK
      logger.info(`[LIVE ${this.isTestnet ? 'TESTNET' : 'MAINNET'}] Executing ${signal.action} ${riskAssessment.suggestedSize} ${signal.symbol} at ${signal.price}`);

      const result = await hyperliquidClient.placeOrder({
        symbol: signal.symbol,
        side: signal.action,
        size: riskAssessment.suggestedSize,
        price: signal.price,
        orderType: signal.type.toLowerCase() as 'limit' | 'market'
      });

      const trade: Trade = {
        id: uuidv4(),
        strategyId: signal.strategyId,
        symbol: signal.symbol,
        side: signal.action as 'BUY' | 'SELL',
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
        logger.info(`Trade executed: ${JSON.stringify(trade)}`);
        // Persist trade to database for Dashboard
        await dataManager.saveTrade(trade);
      } else {
        logger.warn(`Trade failed: ${result.error || result.status}`);
      }

      return trade;

    } catch (error) {
      logger.error('Signal execution failed:', error);
      throw error;
    }
  }

  async getPortfolio(): Promise<Portfolio> {
    try {
      // Get live portfolio from Hyperliquid
      if (!hyperliquidClient.isConfigured()) {
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

      const state = await hyperliquidClient.getAccountState();

      const positions: Position[] = state.positions.map(pos => ({
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

    } catch (error) {
      logger.error('Failed to get portfolio:', error);
      throw error;
    }
  }

  async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
    if (!symbol) {
      logger.error('Symbol required to cancel order');
      return false;
    }

    return await hyperliquidClient.cancelOrder(symbol, orderId);
  }

  async getOpenOrders(symbol?: string): Promise<any[]> {
    try {
      let orders = await hyperliquidClient.getOpenOrders();

      if (symbol) {
        orders = orders.filter((order: any) => order.coin === symbol);
      }

      return orders;
    } catch (error) {
      logger.error('Failed to get open orders:', error);
      return [];
    }
  }

  async getHistoricalTrades(symbol: string, limit: number = 100): Promise<any[]> {
    try {
      return await hyperliquidClient.getRecentTrades(symbol);
    } catch (error) {
      logger.error('Failed to get historical trades:', error);
      return [];
    }
  }

  async getMarketData(symbol: string): Promise<any> {
    try {
      return await hyperliquidClient.getL2Book(symbol);
    } catch (error) {
      logger.error('Failed to get market data:', error);
      throw error;
    }
  }

  async subscribeToWebSocket(callback: (data: any) => void): Promise<void> {
    logger.info('WebSocket subscription requested, using polling fallback');

    const pollInterval = setInterval(async () => {
      try {
        const portfolio = await this.getPortfolio();
        callback({ type: 'portfolio', data: portfolio });
      } catch (error) {
        logger.error('Portfolio polling failed:', error);
      }
    }, 5000);

    (this as any).pollInterval = pollInterval;
  }

  unsubscribeFromWebSocket(): void {
    if ((this as any).pollInterval) {
      clearInterval((this as any).pollInterval);
      (this as any).pollInterval = null;
    }
  }

  async emergencyStop(): Promise<void> {
    try {
      logger.info('Executing emergency stop - cancelling all orders');

      await hyperliquidClient.cancelAllOrders();

      logger.info('Emergency stop completed - all orders canceled');
    } catch (error) {
      logger.error('Emergency stop failed:', error);
      throw error;
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      if (!hyperliquidClient.isConfigured()) return false;

      const state = await hyperliquidClient.getAccountState();
      logger.info(`Credentials validated - Account equity: $${state.equity.toFixed(2)}`);
      return true;
    } catch (error) {
      logger.error('Credential validation failed:', error);
      return false;
    }
  }

  isConfigured(): boolean {
    return hyperliquidClient.isConfigured();
  }

  getEnvironment(): string {
    return this.isTestnet ? 'TESTNET' : 'LIVE';
  }

  /**
   * Get recently executed trades from DB
   * Replaces getPaperTrades
   */
  async getRecentTrades(limit: number = 20): Promise<Trade[]> {
    return await dataManager.getTrades(undefined, undefined, limit);
  }

  /**
   * Get current positions from Hyperliquid
   * Replaces getPaperPositions
   */
  async getPositions(): Promise<Position[]> {
    const portfolio = await this.getPortfolio();
    return portfolio.positions;
  }

  /**
   * Get realized P&L from DB
   * Replaces getPaperRealizedPnL (Approximation)
   */
  async getRealizedPnL(): Promise<number> {
    const performance = await dataManager.getPortfolioPerformance('30d');
    return performance.totalPnL;
  }

  /**
   * Get the wallet address being used
   */
  getWalletAddress(): string {
    return hyperliquidClient.getWalletAddress();
  }
}

const executionEngine = new ExecutionEngine();
export default executionEngine;
