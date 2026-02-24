import { TradingSignal, Trade, Portfolio, Position, RiskAssessment } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';
import config from '../shared/config';
import logger from '../shared/logger';
import hyperliquidClient from './hyperliquid-client';
import dataManager from '../data-manager/data-manager';

// Track current prices for portfolio valuation
const currentPrices: Map<string, number> = new Map();

// Signal deduplication tracking
interface SignalFingerprint {
  action: 'BUY' | 'SELL' | 'HOLD';
  price: number;
  confidence: number;
  reason: string;
  timestamp: number;
}

interface ManagedExitPlan {
  symbol: string;
  side: 'LONG' | 'SHORT';
  stopLossPct: number;
  takeProfitPct: number;
  entryPrice: number;
  createdAt: number;
}

export class ExecutionEngine {
  // INCREASED: Higher confidence threshold to reduce low-quality signals
  private readonly MIN_SIGNAL_CONFIDENCE = 0.80; // Increased from 0.75
  
  // INCREASED: Longer cooldown between orders to prevent churn
  private readonly ORDER_COOLDOWN_MS = 600000; // 10 minutes (was 5 min)
  private readonly MIN_ORDER_COOLDOWN_MS = 30000; // 30 seconds minimum between any orders
  
  // Signal deduplication settings
  private readonly SIGNAL_DEDUP_WINDOW_MS = 300000; // 5 minutes - consider signals duplicates within this window
  private readonly SIGNAL_PRICE_THRESHOLD = 0.005; // 0.5% price movement required for new signal
  private readonly MAX_SIGNALS_PER_MINUTE = 3; // Rate limit signals
  private readonly EXIT_PLAN_CHECK_INTERVAL_MS = 5000; // Check SL/TP plans every 5s
  
  private lastOrderTime: Map<string, number> = new Map();
  private lastSignalFingerprint: Map<string, SignalFingerprint> = new Map();
  private signalCountWindow: Map<string, { count: number; windowStart: number }> = new Map();
  private positionExitPlans: Map<string, ManagedExitPlan> = new Map();
  private pendingManagedExitSymbols: Set<string> = new Set();
  private exitPlanMonitor: NodeJS.Timeout | null = null;
  private isTestnet: boolean;

  constructor() {
    const hyperliquidConfig = config.getSection('hyperliquid');
    this.isTestnet = hyperliquidConfig.testnet;

    logger.info(`Execution Engine initialized - Mode: ${this.getEnvironment()}`);
    logger.info(`[ChurnPrevention] Config: confidence>=${this.MIN_SIGNAL_CONFIDENCE}, cooldown=${this.ORDER_COOLDOWN_MS}ms, minInterval=${this.MIN_ORDER_COOLDOWN_MS}ms`);

    // Initialize the Hyperliquid client asynchronously
    this.initializeClient();
    this.startExitPlanMonitor();
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
   * Generate a fingerprint for a signal to detect duplicates
   */
  private generateSignalFingerprint(signal: TradingSignal): SignalFingerprint {
    return {
      action: signal.action,
      price: signal.price || 0,
      confidence: signal.confidence,
      reason: signal.reason,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if a signal is a duplicate of a recent signal
   */
  private isDuplicateSignal(symbol: string, newSignal: SignalFingerprint): boolean {
    const lastSignal = this.lastSignalFingerprint.get(symbol.toUpperCase());
    if (!lastSignal) return false;

    const timeSinceLastSignal = newSignal.timestamp - lastSignal.timestamp;
    if (timeSinceLastSignal > this.SIGNAL_DEDUP_WINDOW_MS) return false;

    // Check if action is the same
    if (lastSignal.action !== newSignal.action) return false;

    // Check if price has moved enough to justify new signal
    if (lastSignal.price > 0 && newSignal.price > 0) {
      const priceChange = Math.abs(newSignal.price - lastSignal.price) / lastSignal.price;
      if (priceChange < this.SIGNAL_PRICE_THRESHOLD) {
        logger.warn(`[ChurnPrevention] Duplicate signal detected for ${symbol}: price change ${(priceChange * 100).toFixed(2)}% < threshold ${(this.SIGNAL_PRICE_THRESHOLD * 100).toFixed(2)}%`);
        return true;
      }
    }

    // Check if confidence is similar (within 10%)
    const confidenceDiff = Math.abs(lastSignal.confidence - newSignal.confidence);
    if (confidenceDiff < 0.1 && lastSignal.reason === newSignal.reason) {
      logger.warn(`[ChurnPrevention] Duplicate signal detected for ${symbol}: similar confidence (${confidenceDiff.toFixed(2)}) and same reason`);
      return true;
    }

    return false;
  }

  /**
   * Check signal rate limiting (signals per minute)
   */
  private checkSignalRateLimit(symbol: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const symbolKey = symbol.toUpperCase();
    const windowData = this.signalCountWindow.get(symbolKey);

    if (!windowData) {
      this.signalCountWindow.set(symbolKey, { count: 1, windowStart: now });
      return { allowed: true };
    }

    // Reset window if 1 minute has passed
    if (now - windowData.windowStart > 60000) {
      this.signalCountWindow.set(symbolKey, { count: 1, windowStart: now });
      return { allowed: true };
    }

    // Check if we've exceeded max signals per minute
    if (windowData.count >= this.MAX_SIGNALS_PER_MINUTE) {
      return { 
        allowed: false, 
        reason: `Signal rate limit exceeded: ${windowData.count} signals in last minute (max: ${this.MAX_SIGNALS_PER_MINUTE})` 
      };
    }

    windowData.count++;
    return { allowed: true };
  }

  /**
   * Update current price for a symbol (for portfolio valuation)
   */
  updatePrice(symbol: string, price: number): void {
    currentPrices.set(symbol, price);
  }

  private isExitSignalForPosition(position: Position | undefined, action: 'BUY' | 'SELL'): boolean {
    if (!position) return false;
    return (position.side === 'LONG' && action === 'SELL')
      || (position.side === 'SHORT' && action === 'BUY');
  }

  private registerManagedExitPlan(
    symbol: string,
    side: 'LONG' | 'SHORT',
    entryPrice: number,
    stopLossPct: number,
    takeProfitPct: number
  ): void {
    if (entryPrice <= 0 || stopLossPct <= 0 || takeProfitPct <= 0) return;

    const symbolKey = symbol.toUpperCase();
    this.positionExitPlans.set(symbolKey, {
      symbol: symbolKey,
      side,
      stopLossPct,
      takeProfitPct,
      entryPrice,
      createdAt: Date.now(),
    });

    logger.info(
      `[ExecutionEngine] Registered managed exit plan ${symbolKey} ${side}: SL ${(stopLossPct * 100).toFixed(2)}%, TP ${(takeProfitPct * 100).toFixed(2)}%`
    );
  }

  private clearManagedExitPlan(symbol: string): void {
    this.positionExitPlans.delete(symbol.toUpperCase());
  }

  private startExitPlanMonitor(): void {
    if (this.exitPlanMonitor) {
      clearInterval(this.exitPlanMonitor);
    }

    this.exitPlanMonitor = setInterval(() => {
      void this.enforceManagedExitPlans();
    }, this.EXIT_PLAN_CHECK_INTERVAL_MS);
  }

  private async enforceManagedExitPlans(): Promise<void> {
    if (!hyperliquidClient.isConfigured() || this.positionExitPlans.size === 0) {
      return;
    }

    try {
      const portfolio = await this.getPortfolio();
      const activeSymbols = new Set<string>();

      for (const position of portfolio.positions) {
        const symbolKey = position.symbol.toUpperCase();
        activeSymbols.add(symbolKey);

        const plan = this.positionExitPlans.get(symbolKey);
        if (!plan) continue;
        if (this.pendingManagedExitSymbols.has(symbolKey)) continue;

        if (plan.side !== position.side) {
          this.positionExitPlans.delete(symbolKey);
          continue;
        }

        const entryPrice = position.entryPrice > 0 ? position.entryPrice : plan.entryPrice;
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
          continue;
        }

        const pnlPct = position.side === 'LONG'
          ? (position.markPrice - entryPrice) / entryPrice
          : (entryPrice - position.markPrice) / entryPrice;

        // Trigger stop slightly earlier (execution latency buffer) and TP slightly later
        // to improve realized reward-to-risk.
        const stopLossTriggerPct = Math.max(0.001, plan.stopLossPct * 0.9);
        const takeProfitTriggerPct = plan.takeProfitPct * 1.15;

        let exitReason: string | null = null;
        if (pnlPct <= -stopLossTriggerPct) {
          exitReason = `stop-loss hit (${(pnlPct * 100).toFixed(2)}% <= -${(stopLossTriggerPct * 100).toFixed(2)}%)`;
        } else if (pnlPct >= takeProfitTriggerPct) {
          exitReason = `take-profit hit (${(pnlPct * 100).toFixed(2)}% >= ${(takeProfitTriggerPct * 100).toFixed(2)}%)`;
        }

        if (!exitReason) continue;

        this.pendingManagedExitSymbols.add(symbolKey);
        try {
          logger.warn(`[ExecutionEngine] Managed exit for ${position.symbol}: ${exitReason}`);

          const closeSignal: TradingSignal = {
            id: `managed-exit-${Date.now()}`,
            symbol: position.symbol,
            action: position.side === 'LONG' ? 'SELL' : 'BUY',
            size: Math.abs(position.size),
            price: position.markPrice,
            type: 'MARKET',
            timestamp: new Date(),
            confidence: 1.0,
            strategyId: 'risk-managed-exit',
            reason: `Managed exit: ${exitReason}`,
          };

          const closeRiskAssessment: RiskAssessment = {
            approved: true,
            suggestedSize: Math.abs(position.size),
            riskScore: 0,
            warnings: ['Managed exit'],
            stopLoss: 0,
            takeProfit: 0,
            leverage: position.leverage,
          };

          await this.executeSignal(closeSignal, closeRiskAssessment);
        } catch (error) {
          logger.error(`[ExecutionEngine] Managed exit failed for ${position.symbol}:`, error);
        } finally {
          this.pendingManagedExitSymbols.delete(symbolKey);
        }
      }

      for (const symbolKey of Array.from(this.positionExitPlans.keys())) {
        if (!activeSymbols.has(symbolKey)) {
          this.positionExitPlans.delete(symbolKey);
        }
      }
    } catch (error) {
      logger.error('[ExecutionEngine] Managed exit monitor failed:', error);
    }
  }

  async executeSignal(signal: TradingSignal, riskAssessment: RiskAssessment): Promise<Trade> {
    const symbolKey = signal.symbol.toUpperCase();
    const now = Date.now();

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

      const portfolio = await this.getPortfolio();
      const openPosition = portfolio.positions.find(
        p => p.symbol.toUpperCase() === symbolKey
      );
      const isExitOrder = this.isExitSignalForPosition(openPosition, signal.action);

      const exitIntent = riskAssessment.warnings.some(w => w.toLowerCase().includes('exit'))
        || signal.strategyId === 'position-recovery'
        || signal.strategyId === 'risk-managed-exit'
        || (riskAssessment.stopLoss === 0 && riskAssessment.takeProfit === 0);

      if (exitIntent && !openPosition && !isExitOrder) {
        throw new Error(`No open ${signal.symbol} position found to close`);
      }

      const signalFingerprint = this.generateSignalFingerprint(signal);

      if (!isExitOrder) {
        // ENHANCED: Higher confidence threshold (entries only)
        if (signal.confidence < this.MIN_SIGNAL_CONFIDENCE) {
          const confidenceMessage = `Signal confidence ${signal.confidence.toFixed(2)} below minimum threshold ${this.MIN_SIGNAL_CONFIDENCE}`;
          logger.warn(`[ExecutionEngine] [ChurnPrevention] ${confidenceMessage} for ${signal.symbol}`);
          throw new Error(confidenceMessage);
        }

        // Signal deduplication check (entries only)
        if (this.isDuplicateSignal(signal.symbol, signalFingerprint)) {
          const dupMessage = `Duplicate signal rejected for ${signal.symbol} - conditions unchanged`;
          logger.warn(`[ExecutionEngine] [ChurnPrevention] ${dupMessage}`);
          throw new Error(dupMessage);
        }

        // Signal rate limiting (entries only)
        const rateLimitCheck = this.checkSignalRateLimit(signal.symbol);
        if (!rateLimitCheck.allowed) {
          logger.warn(`[ExecutionEngine] [ChurnPrevention] ${rateLimitCheck.reason}`);
          throw new Error(rateLimitCheck.reason);
        }
      } else {
        logger.info(`[ExecutionEngine] Exit signal detected for ${signal.symbol}; bypassing entry churn gates`);
      }

      // Validate size
      let requestedSize = Math.max(0, Math.abs(riskAssessment.suggestedSize || 0));
      const minSizes: Record<string, number> = { BTC: 0.0001, ETH: 0.001, SOL: 0.01, DEFAULT: 0.01 };
      const minSize = minSizes[signal.symbol] || minSizes['DEFAULT'];

      if (isExitOrder && openPosition) {
        const requestedFromSignal = Math.max(0, Math.abs(signal.size || requestedSize));
        const fallbackSize = requestedFromSignal > 0 ? requestedFromSignal : Math.abs(openPosition.size);
        requestedSize = Math.min(Math.abs(openPosition.size), fallbackSize);
      } else if (requestedSize < minSize) {
        logger.warn(`[ExecutionEngine] Order size ${requestedSize} below minimum ${minSize} for ${signal.symbol}, adjusting up`);
        requestedSize = minSize;
        riskAssessment.suggestedSize = minSize;
      }

      if (requestedSize <= 0) {
        throw new Error(`Order size resolved to 0 for ${signal.symbol}`);
      }

      if (!isExitOrder) {
        // ENHANCED: Stricter cooldown check with minimum interval (entries only)
        const lastOrderAt = this.lastOrderTime.get(symbolKey);
        if (lastOrderAt !== undefined) {
          const elapsedMs = now - lastOrderAt;

          // Absolute minimum interval between any orders
          if (elapsedMs < this.MIN_ORDER_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((this.MIN_ORDER_COOLDOWN_MS - elapsedMs) / 1000);
            const cooldownMessage = `Minimum order interval not met for ${signal.symbol}. Retry in ${remainingSeconds}s`;
            logger.warn(`[ExecutionEngine] [ChurnPrevention] ${cooldownMessage}`);
            throw new Error(cooldownMessage);
          }

          // Full cooldown period
          if (elapsedMs < this.ORDER_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((this.ORDER_COOLDOWN_MS - elapsedMs) / 1000);
            const cooldownMessage = `Order cooldown active for ${signal.symbol}. Retry in ${remainingSeconds}s`;
            logger.warn(`[ExecutionEngine] [ChurnPrevention] ${cooldownMessage}`);
            throw new Error(cooldownMessage);
          }
        }
      }

      // Safety monitor gate + volatility-aware position scaling
      const circuitBreaker = require('../shared/circuit-breaker').default as {
        canEnterNewTrade?: (symbol: string) => boolean;
        getPositionSizeMultiplier?: () => number;
        recordTrade?: (trade: { id?: string; symbol: string; pnl: number; timestamp: Date | string | number }) => void;
      };

      let adjustedSize = requestedSize;
      if (!isExitOrder) {
        const canEnter = circuitBreaker.canEnterNewTrade?.(signal.symbol) ?? true;
        if (!canEnter) {
          throw new Error(`Safety monitor blocked new trade for ${signal.symbol}`);
        }

        const sizeMultiplier = Math.max(0, Math.min(1, circuitBreaker.getPositionSizeMultiplier?.() ?? 1));
        if (sizeMultiplier <= 0) {
          throw new Error('Safety monitor blocked new trade due volatility stop threshold');
        }

        adjustedSize = requestedSize * sizeMultiplier;
        if (adjustedSize <= 0) {
          throw new Error('Adjusted order size is zero after safety limits');
        }

        if (sizeMultiplier < 1) {
          logger.warn(
            `[ExecutionEngine] Applying safety size multiplier ${sizeMultiplier.toFixed(2)} to ${signal.symbol}`
          );
        }
      } else if (openPosition) {
        adjustedSize = Math.min(adjustedSize, Math.abs(openPosition.size));
      }

      // LIVE TRADING with Hyperliquid SDK
      logger.info(
        `[LIVE ${this.isTestnet ? 'TESTNET' : 'MAINNET'}] Executing ${isExitOrder ? 'EXIT' : 'ENTRY'} ${signal.action} ${adjustedSize} ${signal.symbol} at ${signal.price}`
      );
      
      // Record order time and signal fingerprint BEFORE execution to prevent race conditions
      this.lastOrderTime.set(symbolKey, now);
      this.lastSignalFingerprint.set(symbolKey, signalFingerprint);

      const result = await hyperliquidClient.placeOrder({
        symbol: signal.symbol,
        side: signal.action,
        size: adjustedSize,
        price: signal.price,
        orderType: signal.type.toLowerCase() as 'limit' | 'market',
        reduceOnly: isExitOrder,
        confidence: signal.confidence,
        bypassCooldown: isExitOrder
      });

      const trade: Trade = {
        id: uuidv4(),
        strategyId: signal.strategyId,
        symbol: signal.symbol,
        side: signal.action as 'BUY' | 'SELL',
        size: result.filledSize || adjustedSize,
        price: result.filledPrice || signal.price || 0,
        fee: 0,
        pnl: 0,
        timestamp: new Date(),
        type: signal.type,
        status: result.success ? (result.status === 'FILLED' ? 'FILLED' : 'PARTIAL') : 'CANCELLED',
        entryExit: isExitOrder ? 'EXIT' : 'ENTRY'
      };

      if (result.success) {
        if (result.status === 'FILLED') {
          logger.info(`[ExecutionEngine] Trade FILLED: ${JSON.stringify(trade)}`);
        } else {
          logger.info(`[ExecutionEngine] Trade PENDING (resting): ${JSON.stringify(trade)}`);
        }
        // Persist trade to database for Dashboard
        await dataManager.saveTrade(trade);

        if (isExitOrder) {
          this.clearManagedExitPlan(signal.symbol);
        } else {
          const entryPrice = trade.price > 0 ? trade.price : (signal.price || 0);
          const entrySide: 'LONG' | 'SHORT' = signal.action === 'BUY' ? 'LONG' : 'SHORT';
          this.registerManagedExitPlan(
            signal.symbol,
            entrySide,
            entryPrice,
            riskAssessment.stopLoss,
            riskAssessment.takeProfit
          );
        }

        try {
          circuitBreaker.recordTrade?.({
            id: trade.id,
            symbol: trade.symbol,
            pnl: trade.pnl || 0,
            timestamp: trade.timestamp,
          });
        } catch (safetyError) {
          logger.warn('[ExecutionEngine] Failed to record trade in safety monitor:', safetyError);
        }
      } else {
        logger.warn(`[ExecutionEngine] Trade failed: ${result.error || result.status}`);
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

  /**
   * Get anti-churn statistics for monitoring
   */
  getAntiChurnStats(): { 
    cooldownActive: string[]; 
    recentSignals: Record<string, SignalFingerprint>;
    signalRateLimits: Record<string, { count: number; windowStart: number }>;
  } {
    const now = Date.now();
    const cooldownActive: string[] = [];
    
    for (const [symbol, lastTime] of this.lastOrderTime.entries()) {
      if (now - lastTime < this.ORDER_COOLDOWN_MS) {
        cooldownActive.push(symbol);
      }
    }

    const recentSignals: Record<string, SignalFingerprint> = {};
    for (const [symbol, fingerprint] of this.lastSignalFingerprint.entries()) {
      if (now - fingerprint.timestamp < this.SIGNAL_DEDUP_WINDOW_MS) {
        recentSignals[symbol] = fingerprint;
      }
    }

    const signalRateLimits: Record<string, { count: number; windowStart: number }> = {};
    for (const [symbol, data] of this.signalCountWindow.entries()) {
      if (now - data.windowStart < 60000) {
        signalRateLimits[symbol] = data;
      }
    }

    return { cooldownActive, recentSignals, signalRateLimits };
  }
}

const executionEngine = new ExecutionEngine();
export default executionEngine;
