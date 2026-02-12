// Prediction Market Execution Engine (Hardened for Production)
// Paper trading + foundation for real trading integration

import { v4 as uuidv4 } from 'uuid';
import predictionStore from '../data/prediction-store';
import logger from '../shared/logger';
import riskManager from './risk-manager';
import alertingService from './alerting-service';
import {
  PredictionRiskAssessment,
  PredictionSignal,
  PredictionTrade,
  PredictionPosition,
  PredictionPortfolio,
} from '../shared/types';

type PriceSnapshot = { yesPrice?: number; noPrice?: number; timestamp: number };
type OrderStatus = 'PENDING' | 'FILLED' | 'PARTIAL' | 'CANCELLED' | 'FAILED';

interface PendingOrder {
  id: string;
  signal: PredictionSignal;
  status: OrderStatus;
  submittedAt: number;
  filledAt?: number;
  filledShares?: number;
  filledPrice?: number;
  retryCount: number;
  error?: string;
}

class PredictionExecutionEngine {
  private initialBalance: number;
  private cashBalance: number;
  private realizedPnL = 0;
  private positions: Map<string, PredictionPosition> = new Map();
  private currentPrices: Map<string, PriceSnapshot> = new Map();
  private pendingOrders: Map<string, PendingOrder> = new Map();
  private orderTimeoutMs: number;
  private slippageTolerance: number;
  private isRealTrading: boolean;

  constructor() {
    this.initialBalance = Number.parseFloat(process.env.PREDICTION_PAPER_BALANCE || '10000');
    this.cashBalance = this.initialBalance;
    this.orderTimeoutMs = parseInt(process.env.PREDICTION_ORDER_TIMEOUT_MS || '30000', 10);
    this.slippageTolerance = parseFloat(process.env.PREDICTION_MAX_SLIPPAGE_PCT || '0.02');
    this.isRealTrading = process.env.PREDICTION_PAPER_TRADING === 'false';

    if (this.isRealTrading) {
      logger.warn('[PredictionExecution] ⚠️ REAL TRADING MODE ENABLED ⚠️');
    } else {
      logger.info('[PredictionExecution] Paper trading mode');
    }

    // Start order monitoring loop
    this.startOrderMonitoring();
  }

  // ========================================================================
  // PRICE UPDATES
  // ========================================================================

  updateMarketPrice(marketId: string, yesPrice?: number, noPrice?: number): void {
    const existing = this.currentPrices.get(marketId);
    this.currentPrices.set(marketId, {
      yesPrice: Number.isFinite(yesPrice) ? yesPrice : existing?.yesPrice,
      noPrice: Number.isFinite(noPrice) ? noPrice : existing?.noPrice,
      timestamp: Date.now(),
    });

    for (const position of this.positions.values()) {
      if (position.marketId !== marketId) continue;
      const snapshot = this.currentPrices.get(marketId);
      const lastPrice = position.outcome === 'YES' ? snapshot?.yesPrice : snapshot?.noPrice;
      if (Number.isFinite(lastPrice)) {
        position.lastPrice = lastPrice!;
        position.unrealizedPnL = (position.lastPrice - position.averagePrice) * position.shares;
        predictionStore.upsertPosition(position);
      }
    }
  }

  // ========================================================================
  // SIGNAL EXECUTION
  // ========================================================================

  async executeSignal(
    signal: PredictionSignal, 
    risk: PredictionRiskAssessment, 
    marketTitle: string
  ): Promise<PredictionTrade> {
    // Pre-execution validation
    this.validatePreExecution(signal, risk);

    // Check for pending orders on same market
    if (this.hasPendingOrder(signal.marketId)) {
      throw new Error(`Pending order exists for market ${marketTitle}`);
    }

    // Create pending order
    const orderId = uuidv4();
    const pendingOrder: PendingOrder = {
      id: orderId,
      signal,
      status: 'PENDING',
      submittedAt: Date.now(),
      retryCount: 0,
    };
    this.pendingOrders.set(orderId, pendingOrder);

    try {
      // Execute the trade
      const trade = await this.executeTrade(signal, risk, marketTitle, orderId);
      
      // Update pending order
      pendingOrder.status = 'FILLED';
      pendingOrder.filledAt = Date.now();
      pendingOrder.filledShares = trade.shares;
      pendingOrder.filledPrice = trade.price;

      // Record trade for risk management
      riskManager.recordTrade(trade);

      // Send alert
      await alertingService.tradeExecuted(trade, this.getPortfolio());

      return trade;
    } catch (error) {
      pendingOrder.status = 'FAILED';
      pendingOrder.error = (error as Error).message;
      throw error;
    } finally {
      // Clean up pending order after delay
      setTimeout(() => {
        this.pendingOrders.delete(orderId);
      }, 60000);
    }
  }

  private validatePreExecution(signal: PredictionSignal, risk: PredictionRiskAssessment): void {
    if (signal.action === 'HOLD') {
      throw new Error('Cannot execute HOLD signal');
    }

    if (!signal.price || !Number.isFinite(signal.price) || signal.price <= 0) {
      throw new Error('Invalid price for prediction trade');
    }

    if (!risk.approved) {
      throw new Error(`Risk check failed: ${risk.warnings.join(', ')}`);
    }

    if (risk.suggestedSizeUsd <= 0) {
      throw new Error('Position size must be greater than 0');
    }

    // Check price staleness
    const snapshot = this.currentPrices.get(signal.marketId);
    if (snapshot) {
      const priceAge = Date.now() - snapshot.timestamp;
      const maxAge = 60000; // 60 seconds
      if (priceAge > maxAge) {
        throw new Error(`Price data is stale (${(priceAge / 1000).toFixed(0)}s old)`);
      }
    }
  }

  private async executeTrade(
    signal: PredictionSignal,
    risk: PredictionRiskAssessment,
    marketTitle: string,
    orderId: string
  ): Promise<PredictionTrade> {
    const price = signal.price;
    const shares = risk.suggestedSizeUsd / price;
    const key = `${signal.marketId}:${signal.outcome}`;
    const existing = this.positions.get(key);
    let pnl = 0;

    if (signal.action === 'BUY') {
      await this.executeBuy(signal, risk, key, shares, price, existing);
    } else if (signal.action === 'SELL') {
      pnl = await this.executeSell(signal, key, shares, price, existing);
    }

    // Create trade record
    const trade: PredictionTrade = {
      id: orderId,
      marketId: signal.marketId,
      marketTitle,
      outcome: signal.outcome,
      side: signal.action,
      shares,
      price,
      fee: price * shares * (this.isRealTrading ? 0.02 : 0.001), // 2% fee on real Polymarket
      pnl,
      timestamp: new Date(),
      status: 'FILLED',
      reason: signal.reason,
    };

    // Persist trade
    predictionStore.storeTrade(trade);

    // Structured logging for audit trail
    logger.info({
      event: 'TRADE_EXECUTED',
      tradeId: orderId,
      marketId: signal.marketId,
      side: signal.action,
      outcome: signal.outcome,
      shares: shares.toFixed(4),
      price: price.toFixed(4),
      sizeUsd: risk.suggestedSizeUsd.toFixed(2),
      fee: trade.fee.toFixed(4),
      pnl: pnl.toFixed(2),
      portfolioValue: this.getPortfolio().totalValue.toFixed(2),
    }, `[PredictionExecution] ${signal.action} ${shares.toFixed(2)} ${signal.outcome} @ ${price.toFixed(3)} (${marketTitle})`);

    return trade;
  }

  private async executeBuy(
    signal: PredictionSignal,
    risk: PredictionRiskAssessment,
    key: string,
    shares: number,
    price: number,
    existing?: PredictionPosition
  ): Promise<void> {
    const cost = shares * price;

    if (cost > this.cashBalance) {
      throw new Error(`Insufficient balance: need $${cost.toFixed(2)}, have $${this.cashBalance.toFixed(2)}`);
    }

    // Slippage check
    if (this.isRealTrading) {
      const currentSnapshot = this.currentPrices.get(signal.marketId);
      const currentPrice = signal.outcome === 'YES' 
        ? currentSnapshot?.yesPrice 
        : currentSnapshot?.noPrice;
      
      if (currentPrice) {
        const slippage = Math.abs(currentPrice - price) / price;
        if (slippage > this.slippageTolerance) {
          throw new Error(`Slippage too high: ${(slippage * 100).toFixed(2)}% > ${(this.slippageTolerance * 100).toFixed(2)}%`);
        }
      }
    }

    if (existing) {
      // Add to existing position
      const totalCost = existing.averagePrice * existing.shares + cost;
      const totalShares = existing.shares + shares;
      existing.averagePrice = totalCost / totalShares;
      existing.shares = totalShares;
      existing.lastPrice = price;
      existing.unrealizedPnL = (price - existing.averagePrice) * existing.shares;
      this.positions.set(key, existing);
      predictionStore.upsertPosition(existing);
    } else {
      // New position
      const position: PredictionPosition = {
        marketId: signal.marketId,
        marketTitle: signal.marketId, // Will be updated from caller
        outcome: signal.outcome,
        shares,
        averagePrice: price,
        lastPrice: price,
        unrealizedPnL: 0,
        openedAt: new Date(),
      };
      this.positions.set(key, position);
      predictionStore.upsertPosition(position);
    }

    this.cashBalance -= cost;
  }

  private async executeSell(
    signal: PredictionSignal,
    key: string,
    shares: number,
    price: number,
    existing?: PredictionPosition
  ): Promise<number> {
    if (!existing) {
      throw new Error('No open position to sell');
    }

    const sellShares = Math.min(shares, existing.shares);
    const pnl = (price - existing.averagePrice) * sellShares;

    this.realizedPnL += pnl;
    this.cashBalance += sellShares * price;

    existing.shares -= sellShares;
    existing.lastPrice = price;
    existing.unrealizedPnL = existing.shares > 0
      ? (price - existing.averagePrice) * existing.shares
      : 0;

    if (existing.shares <= 0.0001) {
      this.positions.delete(key);
      predictionStore.removePosition(signal.marketId, signal.outcome);
    } else {
      this.positions.set(key, existing);
      predictionStore.upsertPosition(existing);
    }

    return pnl;
  }

  // ========================================================================
  // ORDER MANAGEMENT
  // ========================================================================

  private hasPendingOrder(marketId: string): boolean {
    for (const order of this.pendingOrders.values()) {
      if (order.signal.marketId === marketId && order.status === 'PENDING') {
        return true;
      }
    }
    return false;
  }

  private startOrderMonitoring(): void {
    const checkInterval = 10000; // 10 seconds

    setInterval(() => {
      const now = Date.now();

      for (const [orderId, order] of this.pendingOrders.entries()) {
        if (order.status !== 'PENDING') continue;

        // Check for timeout
        if (now - order.submittedAt > this.orderTimeoutMs) {
          logger.warn(`[PredictionExecution] Order ${orderId} timed out`);
          order.status = 'CANCELLED';
          order.error = 'Order timeout';
        }
      }
    }, checkInterval);
  }

  public getPendingOrders(): PendingOrder[] {
    return Array.from(this.pendingOrders.values());
  }

  public cancelOrder(orderId: string): boolean {
    const order = this.pendingOrders.get(orderId);
    if (order && order.status === 'PENDING') {
      order.status = 'CANCELLED';
      return true;
    }
    return false;
  }

  // ========================================================================
  // STOP LOSS
  // ========================================================================

  public checkStopLosses(): Array<{
    position: PredictionPosition;
    exitPrice: number;
    pnl: number;
    reason: string;
  }> {
    const exits: Array<{
      position: PredictionPosition;
      exitPrice: number;
      pnl: number;
      reason: string;
    }> = [];

    for (const position of this.positions.values()) {
      const entryPrice = position.averagePrice;
      const currentPrice = position.lastPrice;
      
      const pnlPct = (currentPrice - entryPrice) / entryPrice;
      const stopLossPct = parseFloat(process.env.PREDICTION_STOP_LOSS_PCT || '0.20');

      if (pnlPct < -stopLossPct) {
        exits.push({
          position,
          exitPrice: currentPrice,
          pnl: (currentPrice - entryPrice) * position.shares,
          reason: `Stop loss hit: ${(pnlPct * 100).toFixed(1)}% loss`,
        });
      }
    }

    return exits;
  }

  // ========================================================================
  // EMERGENCY CLOSE
  // ========================================================================

  public async emergencyCloseAll(): Promise<{
    closed: number;
    failed: number;
    totalPnl: number;
  }> {
    logger.error('[PredictionExecution] 🚨 EMERGENCY CLOSE ALL POSITIONS 🚨');

    let closed = 0;
    let failed = 0;
    let totalPnl = 0;

    for (const [key, position] of this.positions.entries()) {
      try {
        const currentPrice = position.lastPrice;
        const pnl = (currentPrice - position.averagePrice) * position.shares;

        // Execute market sell
        this.realizedPnL += pnl;
        this.cashBalance += position.shares * currentPrice;
        totalPnl += pnl;

        // Record closing trade
        const trade: PredictionTrade = {
          id: uuidv4(),
          marketId: position.marketId,
          marketTitle: position.marketTitle,
          outcome: position.outcome,
          side: 'SELL',
          shares: position.shares,
          price: currentPrice,
          fee: position.shares * currentPrice * 0.001,
          pnl,
          timestamp: new Date(),
          status: 'FILLED',
          reason: 'EMERGENCY CLOSE',
        };

        predictionStore.storeTrade(trade);
        predictionStore.removePosition(position.marketId, position.outcome);

        this.positions.delete(key);
        closed++;

        logger.info(
          `[PredictionExecution] Emergency closed: ${position.marketTitle} ${position.outcome} P&L: $${pnl.toFixed(2)}`
        );
      } catch (error) {
        logger.error(
          `[PredictionExecution] Failed to close position ${position.marketId}:`,
          error
        );
        failed++;
      }
    }

    // Send alert
    await alertingService.emergencyStop(
      'Emergency close all positions executed',
      this.getPortfolio()
    );

    return { closed, failed, totalPnl };
  }

  // ========================================================================
  // PORTFOLIO
  // ========================================================================

  getPortfolio(): PredictionPortfolio {
    let positionValue = 0;
    let costBasis = 0;
    let unrealized = 0;

    for (const position of this.positions.values()) {
      const lastPrice = position.lastPrice || position.averagePrice;
      positionValue += position.shares * lastPrice;
      costBasis += position.shares * position.averagePrice;
      unrealized += (lastPrice - position.averagePrice) * position.shares;
    }

    return {
      totalValue: this.cashBalance + positionValue,
      availableBalance: this.cashBalance,
      usedBalance: costBasis,
      realizedPnL: this.realizedPnL,
      unrealizedPnL: unrealized,
      positions: Array.from(this.positions.values()),
    };
  }

  getPositions(): PredictionPosition[] {
    return Array.from(this.positions.values());
  }

  getPosition(marketId: string, outcome: 'YES' | 'NO'): PredictionPosition | undefined {
    return this.positions.get(`${marketId}:${outcome}`);
  }

  // ========================================================================
  // HEALTH CHECK
  // ========================================================================

  public getHealth(): {
    healthy: boolean;
    positions: number;
    pendingOrders: number;
    cashBalance: number;
    isRealTrading: boolean;
  } {
    return {
      healthy: this.cashBalance > 0,
      positions: this.positions.size,
      pendingOrders: this.pendingOrders.size,
      cashBalance: this.cashBalance,
      isRealTrading: this.isRealTrading,
    };
  }
}

const predictionExecutionEngine = new PredictionExecutionEngine();
export default predictionExecutionEngine;
