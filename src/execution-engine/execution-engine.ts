import { TradingSignal, Trade, Portfolio, Position, RiskAssessment } from '../shared/types';
import { v4 as uuidv4 } from 'uuid';
import config from '../shared/config';
import logger from '../shared/logger';
import hyperliquidClient from './hyperliquid-client';
import orderValidator from './order-validator';
import dataManager from '../data-manager/data-manager';
import riskManager from '../risk-manager/risk-manager';

// Track current prices for portfolio valuation
const currentPrices: Map<string, number> = new Map();
// CRITICAL FIX: Lowered thresholds to allow more orders through
// Market orders need lower threshold since they're time-sensitive
const DEFAULT_MIN_SIGNAL_CONFIDENCE = 0.65;
const DEFAULT_MIN_MARKET_SIGNAL_CONFIDENCE = 0.70;
const MAX_PRACTICAL_MIN_SIGNAL_CONFIDENCE = 0.80;
const MAX_PRACTICAL_MIN_MARKET_SIGNAL_CONFIDENCE = 0.90;

function parseConfidenceEnv(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    logger.warn(`[ExecutionEngine] Invalid ${envName}=${raw}. Falling back to ${fallback}`);
    return fallback;
  }

  return parsed;
}

function parsePositiveIntEnv(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(`[ExecutionEngine] Invalid ${envName}=${raw}. Falling back to ${fallback}`);
    return fallback;
  }

  return parsed;
}

function parsePositiveFloatEnv(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(`[ExecutionEngine] Invalid ${envName}=${raw}. Falling back to ${fallback}`);
    return fallback;
  }

  return parsed;
}

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

interface NativeStopOrderTracking {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  stopLossTriggerPrice: number;
  takeProfitTriggerPrice: number;
  stopLossOrderId?: string;
  takeProfitOrderId?: string;
  createdAt: number;
}

interface ExecutionOrderStats {
  submitted: number;
  filled: number;
  resting: number;
  cancelled: number;
  rejected: number;
  blocked: number;
}

type OrderFailureCategory = 'CANCELLED' | 'REJECTED' | 'BLOCKED';

const BLOCKED_ORDER_STATUSES = new Set([
  'NO_WALLET',
  'CIRCUIT_BREAKER',
  'INVALID_SYMBOL',
  'INVALID_SIZE',
  'CHURN_PREVENTION',
  'PENDING_ORDER',
  'DUPLICATE_ORDER',
  'COOLDOWN',
  'MIN_NOTIONAL'
]);

const CANCELLED_ORDER_STATUSES = new Set([
  'CANCELLED',
  'IOC_UNFILLED'
]);

const REJECTED_ORDER_STATUSES = new Set([
  'REJECTED',
  'TIMEOUT',
  'PRICE_ERROR',
  'SIZE_ERROR',
  'INSUFFICIENT_MARGIN',
  'RATE_LIMITED',
  'NETWORK_ERROR',
  'RETRY_EXHAUSTED'
]);

export class ExecutionEngine {
  // Keep aligned with hyperliquid-client and allow env override.
  private readonly MIN_SIGNAL_CONFIDENCE = (() => {
    const configured = parseConfidenceEnv(
      'EXECUTION_MIN_SIGNAL_CONFIDENCE',
      parseConfidenceEnv('HYPERLIQUID_MIN_CONFIDENCE', DEFAULT_MIN_SIGNAL_CONFIDENCE)
    );

    if (configured > MAX_PRACTICAL_MIN_SIGNAL_CONFIDENCE) {
      logger.warn(
        `[ExecutionEngine] EXECUTION_MIN_SIGNAL_CONFIDENCE=${configured} is overly strict; ` +
        `clamping to ${MAX_PRACTICAL_MIN_SIGNAL_CONFIDENCE.toFixed(2)}`
      );
      return MAX_PRACTICAL_MIN_SIGNAL_CONFIDENCE;
    }

    return configured;
  })();
  private readonly MIN_MARKET_SIGNAL_CONFIDENCE = (() => {
    const fallback = Math.max(this.MIN_SIGNAL_CONFIDENCE, DEFAULT_MIN_MARKET_SIGNAL_CONFIDENCE);
    const configured = parseConfidenceEnv('EXECUTION_MIN_MARKET_SIGNAL_CONFIDENCE', fallback);
    const maxPractical = Math.min(
      MAX_PRACTICAL_MIN_MARKET_SIGNAL_CONFIDENCE,
      this.MIN_SIGNAL_CONFIDENCE + 0.10
    );

    if (configured > maxPractical) {
      logger.warn(
        `[ExecutionEngine] EXECUTION_MIN_MARKET_SIGNAL_CONFIDENCE=${configured} is overly strict; ` +
        `clamping to ${maxPractical.toFixed(2)}`
      );
      return maxPractical;
    }

    return Math.max(this.MIN_SIGNAL_CONFIDENCE, configured);
  })();
  
  // CRITICAL FIX: Reduced cooldowns to match hyperliquid-client for consistency
  private readonly ORDER_COOLDOWN_MS = 10000; // 10 seconds (reduced from 10 min - was too aggressive)
  private readonly MIN_ORDER_COOLDOWN_MS = 5000; // 5 seconds minimum between any orders
  private readonly FAILURE_COOLDOWN_BASE_MS = parsePositiveIntEnv(
    'EXECUTION_FAILURE_COOLDOWN_BASE_MS',
    15000
  );
  private readonly FAILURE_COOLDOWN_MAX_MS = parsePositiveIntEnv(
    'EXECUTION_FAILURE_COOLDOWN_MAX_MS',
    180000
  );
  private readonly MIN_ENTRY_NOTIONAL_USD = parsePositiveFloatEnv(
    'EXECUTION_MIN_ENTRY_NOTIONAL_USD',
    10
  );
  
  // Signal deduplication settings
  private readonly SIGNAL_DEDUP_WINDOW_MS = 300000; // 5 minutes - consider signals duplicates within this window
  private readonly SIGNAL_PRICE_THRESHOLD = 0.005; // 0.5% price movement required for new signal
  private readonly MAX_SIGNALS_PER_MINUTE = 3; // Rate limit signals
  private readonly EXIT_PLAN_CHECK_INTERVAL_MS = 5000; // Check SL/TP plans every 5s
  
  // CRITICAL FIX: Fill rate tracking for monitoring
  private orderStats: Map<string, ExecutionOrderStats> = new Map();
  
  private lastOrderTime: Map<string, number> = new Map();
  private lastSignalFingerprint: Map<string, SignalFingerprint> = new Map();
  private signalCountWindow: Map<string, { count: number; windowStart: number }> = new Map();
  private failureCooldownUntil: Map<string, number> = new Map();
  private lastCancellationTime: Map<string, number> = new Map(); // Track cancellations
  private readonly CANCELLATION_COOLDOWN_MS = 5000; // 5-second cooldown after any cancellation
  private positionExitPlans: Map<string, ManagedExitPlan> = new Map();
  private nativeStopOrders: Map<string, NativeStopOrderTracking> = new Map();
  private pendingManagedExitSymbols: Set<string> = new Set();
  private exitPlanMonitor: NodeJS.Timeout | null = null;
  private isTestnet: boolean;

  constructor() {
    const hyperliquidConfig = config.getSection('hyperliquid');
    this.isTestnet = hyperliquidConfig.testnet;

    logger.info(`Execution Engine initialized - Mode: ${this.getEnvironment()}`);
    logger.info(
      `[CRITICAL FIX] Config: confidence>=${this.MIN_SIGNAL_CONFIDENCE}, marketConfidence>=${this.MIN_MARKET_SIGNAL_CONFIDENCE}, ` +
      `cooldown=${this.ORDER_COOLDOWN_MS}ms, minInterval=${this.MIN_ORDER_COOLDOWN_MS}ms, maxOrdersPerMin=10, ` +
      `failureCooldownBase=${this.FAILURE_COOLDOWN_BASE_MS}ms, minEntryNotional=$${this.MIN_ENTRY_NOTIONAL_USD.toFixed(2)}`
    );

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

  private applyFailureCooldown(symbol: string, failureCount: number): void {
    const symbolKey = symbol.toUpperCase();
    const scaling = Math.max(0, failureCount - 1);
    const cooldownMs = Math.min(
      this.FAILURE_COOLDOWN_BASE_MS * Math.pow(2, scaling),
      this.FAILURE_COOLDOWN_MAX_MS
    );
    this.failureCooldownUntil.set(symbolKey, Date.now() + cooldownMs);
    logger.warn(
      `[ExecutionEngine] [ChurnPrevention] Applied failure cooldown for ${symbolKey}: ${(cooldownMs / 1000).toFixed(0)}s`
    );
  }

  private clearFailureCooldown(symbol: string): void {
    this.failureCooldownUntil.delete(symbol.toUpperCase());
  }

  private classifyOrderFailure(status?: string, errorMessage?: string): OrderFailureCategory {
    const normalizedStatus = String(status || '').toUpperCase();
    const normalizedError = String(errorMessage || '').toLowerCase();

    if (BLOCKED_ORDER_STATUSES.has(normalizedStatus)) {
      return 'BLOCKED';
    }

    if (CANCELLED_ORDER_STATUSES.has(normalizedStatus)) {
      return 'CANCELLED';
    }

    if (REJECTED_ORDER_STATUSES.has(normalizedStatus)) {
      return 'REJECTED';
    }

    if (
      normalizedStatus.includes('COOLDOWN')
      || normalizedStatus.includes('PENDING')
      || normalizedStatus.includes('DUPLICATE')
      || normalizedStatus.includes('BLOCK')
    ) {
      return 'BLOCKED';
    }

    if (normalizedStatus.includes('CANCEL')) {
      return 'CANCELLED';
    }

    if (
      normalizedError.includes('cooldown')
      || normalizedError.includes('pending')
      || normalizedError.includes('duplicate')
      || normalizedError.includes('blocked')
    ) {
      return 'BLOCKED';
    }

    if (normalizedError.includes('cancel')) {
      return 'CANCELLED';
    }

    return 'REJECTED';
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

  private async submitNativeStopOrders(
    symbol: string,
    positionSide: 'LONG' | 'SHORT',
    size: number,
    entryPrice: number,
    stopLossPct: number,
    takeProfitPct: number
  ): Promise<void> {
    const symbolKey = symbol.toUpperCase();
    const normalizedSize = Math.abs(size);

    if (
      !Number.isFinite(entryPrice)
      || entryPrice <= 0
      || !Number.isFinite(normalizedSize)
      || normalizedSize <= 0
      || stopLossPct <= 0
      || takeProfitPct <= 0
    ) {
      logger.warn(
        `[ExecutionEngine] Skipping native stop submission for ${symbolKey}: ` +
        `entryPrice=${entryPrice}, size=${normalizedSize}, stopLossPct=${stopLossPct}, takeProfitPct=${takeProfitPct}`
      );
      return;
    }

    const stopLossPrice = positionSide === 'LONG'
      ? entryPrice * (1 - stopLossPct)
      : entryPrice * (1 + stopLossPct);
    const takeProfitPrice = positionSide === 'LONG'
      ? entryPrice * (1 + takeProfitPct)
      : entryPrice * (1 - takeProfitPct);

    if (
      !Number.isFinite(stopLossPrice)
      || stopLossPrice <= 0
      || !Number.isFinite(takeProfitPrice)
      || takeProfitPrice <= 0
    ) {
      logger.error(
        `[ExecutionEngine] Invalid native stop prices for ${symbolKey}: ` +
        `SL=${stopLossPrice}, TP=${takeProfitPrice}, entry=${entryPrice}`
      );
      return;
    }

    await this.cancelTrackedNativeStopOrders(symbolKey);

    const closeSide: 'BUY' | 'SELL' = positionSide === 'LONG' ? 'SELL' : 'BUY';

    logger.info(
      `[ExecutionEngine] Submitting native SL/TP orders for ${symbolKey} ${positionSide}: ` +
      `size=${normalizedSize}, SL=${stopLossPrice.toFixed(6)}, TP=${takeProfitPrice.toFixed(6)}`
    );

    const stopLossResult = await hyperliquidClient.placeStopOrder({
      symbol: symbolKey,
      side: closeSide,
      size: normalizedSize,
      triggerPrice: stopLossPrice,
      tpsl: 'sl',
      reduceOnly: true
    });

    const takeProfitResult = await hyperliquidClient.placeStopOrder({
      symbol: symbolKey,
      side: closeSide,
      size: normalizedSize,
      triggerPrice: takeProfitPrice,
      tpsl: 'tp',
      reduceOnly: true
    });

    const tracking: NativeStopOrderTracking = {
      symbol: symbolKey,
      side: positionSide,
      size: normalizedSize,
      stopLossTriggerPrice: stopLossPrice,
      takeProfitTriggerPrice: takeProfitPrice,
      stopLossOrderId: stopLossResult.orderId,
      takeProfitOrderId: takeProfitResult.orderId,
      createdAt: Date.now(),
    };

    if (tracking.stopLossOrderId || tracking.takeProfitOrderId) {
      this.nativeStopOrders.set(symbolKey, tracking);
    } else {
      this.nativeStopOrders.delete(symbolKey);
    }

    if (!stopLossResult.success || !takeProfitResult.success) {
      logger.error(
        `[ExecutionEngine] Native SL/TP placement incomplete for ${symbolKey}: ` +
        `SL=${stopLossResult.status} (${stopLossResult.error || 'ok'}), ` +
        `TP=${takeProfitResult.status} (${takeProfitResult.error || 'ok'})`
      );
      return;
    }

    logger.info(
      `[ExecutionEngine] Native SL/TP submitted for ${symbolKey}: ` +
      `slOrderId=${tracking.stopLossOrderId || 'n/a'}, tpOrderId=${tracking.takeProfitOrderId || 'n/a'}`
    );
  }

  private async cancelTrackedNativeStopOrders(symbol: string): Promise<void> {
    const symbolKey = symbol.toUpperCase();
    const tracking = this.nativeStopOrders.get(symbolKey);
    if (!tracking) {
      return;
    }

    const trackedOrders: Array<{ label: 'SL' | 'TP'; orderId: string }> = [];
    if (tracking.stopLossOrderId) {
      trackedOrders.push({ label: 'SL', orderId: tracking.stopLossOrderId });
    }
    if (tracking.takeProfitOrderId) {
      trackedOrders.push({ label: 'TP', orderId: tracking.takeProfitOrderId });
    }

    if (trackedOrders.length === 0) {
      this.nativeStopOrders.delete(symbolKey);
      return;
    }

    let openOrderIds: Set<string> | null = null;
    try {
      const openOrders = await hyperliquidClient.getOpenOrders();
      openOrderIds = new Set<string>();

      for (const order of openOrders || []) {
        const orderSymbol = typeof order?.coin === 'string' ? order.coin.toUpperCase() : '';
        if (orderSymbol !== symbolKey) {
          continue;
        }
        if (order?.oid !== undefined && order?.oid !== null) {
          openOrderIds.add(order.oid.toString());
        }
      }
    } catch (error) {
      logger.warn(`[ExecutionEngine] Failed to fetch open orders for native stop cancellation (${symbolKey}):`, error);
    }

    let unresolved = false;

    for (const trackedOrder of trackedOrders) {
      if (openOrderIds && !openOrderIds.has(trackedOrder.orderId)) {
        logger.info(
          `[ExecutionEngine] Native ${trackedOrder.label} order ${trackedOrder.orderId} already closed for ${symbolKey}`
        );
        continue;
      }

      const cancelled = await hyperliquidClient.cancelOrder(symbolKey, trackedOrder.orderId, false, true);
      if (!cancelled) {
        unresolved = true;
        logger.warn(
          `[ExecutionEngine] Failed to cancel native ${trackedOrder.label} order ${trackedOrder.orderId} for ${symbolKey}`
        );
      } else {
        logger.info(
          `[ExecutionEngine] Cancelled native ${trackedOrder.label} order ${trackedOrder.orderId} for ${symbolKey}`
        );
      }
    }

    if (!unresolved) {
      this.nativeStopOrders.delete(symbolKey);
    } else {
      logger.warn(`[ExecutionEngine] Retaining native stop tracking for ${symbolKey} to retry cancellation`);
    }
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
    if (
      !hyperliquidClient.isConfigured()
      || (this.positionExitPlans.size === 0 && this.nativeStopOrders.size === 0)
    ) {
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
          await this.cancelTrackedNativeStopOrders(symbolKey);
          this.positionExitPlans.delete(symbolKey);
          continue;
        }

        // CRITICAL FIX: Always use the plan's entry price (actual fill price) for PnL calculation
        // Hyperliquid's position.entryPrice is the average entry which can be wrong for partial fills
        const entryPrice = plan.entryPrice;
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
          logger.warn(`[ExecutionEngine] Invalid entry price for ${symbolKey}: plan.entryPrice=${plan.entryPrice}`);
          continue;
        }

        const pnlPct = position.side === 'LONG'
          ? (position.markPrice - entryPrice) / entryPrice
          : (entryPrice - position.markPrice) / entryPrice;

        // CRITICAL FIX: Symmetric triggers to preserve configured R:R
        // Stop triggers at exact configured level (no early trigger to avoid cutting losses too early)
        // TP triggers at exact configured level (no delay to avoid giving back profits)
        // This ensures actual R:R matches calculated R:R from risk manager
        const stopLossTriggerPct = Math.max(0.001, plan.stopLossPct);
        const takeProfitTriggerPct = plan.takeProfitPct;

        // Log PnL for debugging R:R execution
        logger.info(
          `[ManagedExit] ${symbolKey} ${position.side}: ` +
          `entryPrice=${entryPrice.toFixed(4)} markPrice=${position.markPrice.toFixed(4)} ` +
          `pnlPct=${(pnlPct * 100).toFixed(4)}% ` +
          `SL=${(stopLossTriggerPct * 100).toFixed(4)}% TP=${(takeProfitTriggerPct * 100).toFixed(4)}% ` +
          `configuredRR=1:${(takeProfitTriggerPct / stopLossTriggerPct).toFixed(2)}`
        );

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

      const trackedSymbols = new Set<string>([
        ...Array.from(this.positionExitPlans.keys()),
        ...Array.from(this.nativeStopOrders.keys())
      ]);

      for (const symbolKey of trackedSymbols) {
        if (activeSymbols.has(symbolKey)) {
          continue;
        }

        await this.cancelTrackedNativeStopOrders(symbolKey);
        this.positionExitPlans.delete(symbolKey);
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
      if (!Number.isFinite(signal.confidence) || signal.confidence <= 0 || signal.confidence > 1) {
        throw new Error(`Invalid signal confidence for ${signal.symbol}: ${signal.confidence}`);
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

      let effectiveConfidence = signal.confidence;
      const requestedOrderType = signal.type?.toLowerCase() === 'limit' ? 'limit' : 'market';
      const requestedSizeForValidation = Math.max(0, Math.abs(riskAssessment.suggestedSize || signal.size || 0));

      if (!isExitOrder) {
        const failureCooldownUntil = this.failureCooldownUntil.get(symbolKey) || 0;
        if (failureCooldownUntil > now) {
          const remainingSec = Math.ceil((failureCooldownUntil - now) / 1000);
          const cooldownMessage = `Failure cooldown active for ${signal.symbol}. Retry in ${remainingSec}s`;
          logger.warn(`[ExecutionEngine] [ChurnPrevention] ${cooldownMessage}`);
          throw new Error(cooldownMessage);
        }

        // CRITICAL FIX: 5-second cooldown after any cancellation
        const lastCancelTime = this.lastCancellationTime.get(symbolKey) || 0;
        if (lastCancelTime > 0 && now - lastCancelTime < this.CANCELLATION_COOLDOWN_MS) {
          const remainingSec = Math.ceil((this.CANCELLATION_COOLDOWN_MS - (now - lastCancelTime)) / 1000);
          const cooldownMessage = `Cancellation cooldown active for ${signal.symbol}. Retry in ${remainingSec}s`;
          logger.warn(`[ExecutionEngine] [ChurnPrevention] ${cooldownMessage}`);
          throw new Error(cooldownMessage);
        }

        if (hyperliquidClient.hasPendingOrder(signal.symbol)) {
          const pendingMessage = `Pending order already exists for ${signal.symbol}; waiting for lifecycle resolution`;
          logger.warn(`[ExecutionEngine] [ChurnPrevention] ${pendingMessage}`);
          throw new Error(pendingMessage);
        }

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

        // Validate confidence against current market conditions and enforce stricter market-order threshold.
        const confidenceValidation = await orderValidator.validateConfidence(
          signal.symbol,
          signal.confidence,
          requestedSizeForValidation
        );

        if (!confidenceValidation.valid) {
          const validationMessage = confidenceValidation.reason || 'Order validation failed';
          logger.warn(`[ExecutionEngine] [ChurnPrevention] ${validationMessage} for ${signal.symbol}`);
          throw new Error(validationMessage);
        }

        effectiveConfidence = confidenceValidation.adjustedConfidence ?? signal.confidence;
        const requiredConfidence = requestedOrderType === 'market'
          ? this.MIN_MARKET_SIGNAL_CONFIDENCE
          : this.MIN_SIGNAL_CONFIDENCE;

        if (effectiveConfidence < requiredConfidence) {
          const adjustedMessage = `Adjusted confidence ${effectiveConfidence.toFixed(2)} below ${requestedOrderType.toUpperCase()} threshold ${requiredConfidence.toFixed(2)}`;
          logger.warn(`[ExecutionEngine] [ChurnPrevention] ${adjustedMessage} for ${signal.symbol}`);
          throw new Error(adjustedMessage);
        }
      } else {
        logger.info(`[ExecutionEngine] Exit signal detected for ${signal.symbol}; bypassing entry churn gates`);
        effectiveConfidence = Math.max(signal.confidence, this.MIN_SIGNAL_CONFIDENCE);
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

      if (!isExitOrder) {
        const referencePrice = signal.price && signal.price > 0
          ? signal.price
          : (currentPrices.get(signal.symbol) || 0);
        if (referencePrice > 0) {
          const notional = adjustedSize * referencePrice;
          if (notional < this.MIN_ENTRY_NOTIONAL_USD) {
            throw new Error(
              `Entry notional $${notional.toFixed(2)} below minimum $${this.MIN_ENTRY_NOTIONAL_USD.toFixed(2)} for ${signal.symbol}`
            );
          }
        }
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
        orderType: requestedOrderType,
        reduceOnly: isExitOrder,
        confidence: effectiveConfidence,
        bypassCooldown: false
      });

      // CRITICAL FIX: Track order stats for fill rate monitoring
      const currentStats: ExecutionOrderStats = this.orderStats.get(symbolKey) || {
        submitted: 0,
        filled: 0,
        resting: 0,
        cancelled: 0,
        rejected: 0,
        blocked: 0
      };
      currentStats.submitted++;

      const orderFilled = result.success && result.status === 'FILLED';
      const orderResting = result.success && (result.status === 'RESTING' || result.status === 'PENDING');

      const trade: Trade = {
        id: uuidv4(),
        strategyId: signal.strategyId,
        symbol: signal.symbol,
        side: signal.action as 'BUY' | 'SELL',
        size: orderFilled ? (result.filledSize || adjustedSize) : adjustedSize,
        price: orderFilled ? (result.filledPrice || signal.price || 0) : (signal.price || 0),
        fee: 0,
        pnl: 0,
        timestamp: new Date(),
        type: signal.type,
        status: orderFilled ? 'FILLED' : (orderResting ? 'PARTIAL' : 'CANCELLED'),
        entryExit: isExitOrder ? 'EXIT' : 'ENTRY'
      };

      let failureToThrow: Error | null = null;

      if (result.success) {
        if (orderFilled) {
          currentStats.filled++;
          this.clearFailureCooldown(symbolKey);
          logger.info(`[ExecutionEngine] Trade FILLED: ${JSON.stringify(trade)}`);
          // Persist filled trade to database for Dashboard
          await dataManager.saveTrade(trade);

          if (isExitOrder) {
            await this.cancelTrackedNativeStopOrders(signal.symbol);
            this.clearManagedExitPlan(signal.symbol);
            // CRITICAL FIX: Clear risk manager tracking on position close
            const exitSide = signal.action === 'SELL' ? 'LONG' : 'SHORT';
            riskManager.clearPositionTracking(signal.symbol, exitSide);
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
            await this.submitNativeStopOrders(
              signal.symbol,
              entrySide,
              trade.size,
              entryPrice,
              riskAssessment.stopLoss,
              riskAssessment.takeProfit
            );
            // CRITICAL FIX: Register position with risk manager for hard stop tracking only after fill
            riskManager.registerPositionOpen(signal.symbol, entrySide, riskAssessment.stopLoss);
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
          if (orderResting) {
            currentStats.resting++;
          }
          logger.info(
            `[ExecutionEngine] Order accepted but not yet filled (${result.status}) for ${signal.symbol}; ` +
            `keeping lifecycle in pending state`
          );
        }
      } else {
        const failureCategory = this.classifyOrderFailure(result.status, result.error);
        const failureReason = result.error || result.status || 'Unknown placement error';

        if (failureCategory === 'CANCELLED') {
          currentStats.cancelled++;
          this.lastCancellationTime.set(symbolKey, Date.now());
        } else if (failureCategory === 'REJECTED') {
          currentStats.rejected++;
        } else {
          currentStats.blocked++;
        }

        if (!isExitOrder && failureCategory !== 'BLOCKED') {
          const hardFailures = currentStats.cancelled + currentStats.rejected;
          this.applyFailureCooldown(symbolKey, hardFailures);
        }

        const cancelRatio = currentStats.submitted > 0 ? currentStats.cancelled / currentStats.submitted : 0;
        const rejectRatio = currentStats.submitted > 0 ? currentStats.rejected / currentStats.submitted : 0;
        const blockedRatio = currentStats.submitted > 0 ? currentStats.blocked / currentStats.submitted : 0;

        logger.error(
          `[ExecutionEngine] Trade failed [${failureCategory}]: ${failureReason} | ` +
          `Cancel ${(cancelRatio * 100).toFixed(1)}% (${currentStats.cancelled}/${currentStats.submitted}), ` +
          `Reject ${(rejectRatio * 100).toFixed(1)}% (${currentStats.rejected}/${currentStats.submitted}), ` +
          `Blocked ${(blockedRatio * 100).toFixed(1)}% (${currentStats.blocked}/${currentStats.submitted})`
        );

        failureToThrow = new Error(`Order ${failureCategory.toLowerCase()}: ${failureReason}`);
      }
      
      // CRITICAL FIX: Log fill rate for monitoring
      const fillRate = currentStats.submitted > 0 ? (currentStats.filled / currentStats.submitted) * 100 : 0;
      logger.info(`[ExecutionEngine] Fill Rate for ${symbolKey}: ${fillRate.toFixed(2)}% (${currentStats.filled}/${currentStats.submitted})`);
      
      this.orderStats.set(symbolKey, currentStats);

      if (failureToThrow) {
        throw failureToThrow;
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

    // CRITICAL FIX: Record cancellation time for cooldown
    const symbolKey = symbol.toUpperCase();
    this.lastCancellationTime.set(symbolKey, Date.now());
    logger.info(`[ExecutionEngine] Recording cancellation for ${symbolKey} - 5s cooldown active`);

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

      await hyperliquidClient.cancelAllOrders(true);

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
    failureCooldownActive: string[];
    cancellationCooldownActive: string[];
    recentSignals: Record<string, SignalFingerprint>;
    signalRateLimits: Record<string, { count: number; windowStart: number }>;
    orderStats: Record<string, { 
      submitted: number; 
      filled: number; 
      cancelled: number; 
      fillRate: number;
      cancelRatio: number;
    }>;
  } {
    const now = Date.now();
    const cooldownActive: string[] = [];
    const failureCooldownActive: string[] = [];
    const cancellationCooldownActive: string[] = [];
    
    for (const [symbol, lastTime] of this.lastOrderTime.entries()) {
      if (now - lastTime < this.ORDER_COOLDOWN_MS) {
        cooldownActive.push(symbol);
      }
    }

    for (const [symbol, cooldownUntil] of this.failureCooldownUntil.entries()) {
      if (cooldownUntil > now) {
        failureCooldownActive.push(symbol);
      }
    }

    // CRITICAL FIX: Track cancellation cooldowns
    for (const [symbol, cancelTime] of this.lastCancellationTime.entries()) {
      if (now - cancelTime < this.CANCELLATION_COOLDOWN_MS) {
        cancellationCooldownActive.push(symbol);
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
    
    // CRITICAL FIX: Include order stats with fill rates
    const orderStats: Record<string, { 
      submitted: number; 
      filled: number; 
      cancelled: number; 
      fillRate: number;
      cancelRatio: number;
    }> = {};
    
    for (const [symbol, stats] of this.orderStats.entries()) {
      orderStats[symbol] = {
        ...stats,
        fillRate: stats.submitted > 0 ? (stats.filled / stats.submitted) * 100 : 0,
        cancelRatio: stats.submitted > 0 ? stats.cancelled / stats.submitted : 0
      };
    }

    return { cooldownActive, failureCooldownActive, cancellationCooldownActive, recentSignals, signalRateLimits, orderStats };
  }
}

const executionEngine = new ExecutionEngine();
export default executionEngine;
