/**
 * Batch Processor
 * 
 * Collects orders over a configurable window and batches them for execution.
 * Groups compatible orders (same symbol, same direction) to reduce churn.
 */

import { TradingSignal, RiskAssessment } from '../shared/types';
import logger from '../shared/logger';

export interface BatchableOrder {
  id: string;
  signal: TradingSignal;
  riskAssessment: RiskAssessment;
  submittedAt: number;
  priority: number;
}

export interface BatchedOrder {
  symbol: string;
  side: 'BUY' | 'SELL';
  totalSize: number;
  avgConfidence: number;
  avgPrice: number;
  orderCount: number;
  originalOrders: BatchableOrder[];
  batchId: string;
}

export interface BatchProcessorConfig {
  windowMs: number;
  maxOrdersPerBatch: number;
  minOrdersToBatch: number;
  enableBatching: boolean;
}

export class BatchProcessor {
  private pendingOrders: Map<string, BatchableOrder> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  
  private config: BatchProcessorConfig = {
    windowMs: 10000, // 10 second batch window
    maxOrdersPerBatch: 10,
    minOrdersToBatch: 2,
    enableBatching: true
  };

  private onBatchReadyCallback: ((batches: BatchedOrder[]) => Promise<void>) | null = null;

  constructor(config?: Partial<BatchProcessorConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    logger.info(`[BatchProcessor] Initialized with window=${this.config.windowMs}ms, minOrders=${this.config.minOrdersToBatch}`);
  }

  /**
   * Set callback for when batches are ready
   */
  onBatchReady(callback: (batches: BatchedOrder[]) => Promise<void>): void {
    this.onBatchReadyCallback = callback;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<BatchProcessorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info(`[BatchProcessor] Config updated: ${JSON.stringify(this.config)}`);
  }

  /**
   * Add an order to the batch queue
   */
  addOrder(signal: TradingSignal, riskAssessment: RiskAssessment): boolean {
    if (!this.config.enableBatching) {
      return false; // Indicate that batching is disabled
    }

    const orderId = `${signal.symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate priority based on confidence and signal age
    const priority = this.calculatePriority(signal);

    const order: BatchableOrder = {
      id: orderId,
      signal,
      riskAssessment,
      submittedAt: Date.now(),
      priority
    };

    this.pendingOrders.set(orderId, order);
    logger.info(`[BatchProcessor] Order queued: ${signal.symbol} ${signal.action} (queue size: ${this.pendingOrders.size})`);

    // Start or reset the batch timer
    this.scheduleBatch();

    return true;
  }

  /**
   * Force immediate batch processing
   */
  async flush(): Promise<BatchedOrder[]> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    return this.processBatch();
  }

  /**
   * Get current queue stats
   */
  getQueueStats(): {
    pendingCount: number;
    bySymbol: Record<string, number>;
    oldestOrderAgeMs: number;
  } {
    const bySymbol: Record<string, number> = {};
    let oldestTimestamp = Date.now();

    for (const order of this.pendingOrders.values()) {
      const symbol = order.signal.symbol.toUpperCase();
      bySymbol[symbol] = (bySymbol[symbol] || 0) + 1;
      oldestTimestamp = Math.min(oldestTimestamp, order.submittedAt);
    }

    return {
      pendingCount: this.pendingOrders.size,
      bySymbol,
      oldestOrderAgeMs: Date.now() - oldestTimestamp
    };
  }

  /**
   * Clear all pending orders
   */
  clearQueue(): void {
    const count = this.pendingOrders.size;
    this.pendingOrders.clear();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    logger.info(`[BatchProcessor] Queue cleared (${count} orders removed)`);
  }

  private scheduleBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      void this.processBatch();
    }, this.config.windowMs);
  }

  private async processBatch(): Promise<BatchedOrder[]> {
    if (this.isProcessing || this.pendingOrders.size === 0) {
      return [];
    }

    this.isProcessing = true;
    this.batchTimer = null;

    try {
      // Get all pending orders
      const orders = Array.from(this.pendingOrders.values());
      this.pendingOrders.clear();

      // Group orders by symbol+direction
      const groups = this.groupOrders(orders);
      
      // Create batches
      const batches: BatchedOrder[] = [];
      
      for (const [key, groupOrders] of groups) {
        if (groupOrders.length >= this.config.minOrdersToBatch) {
          // Create a batched order
          const batch = this.createBatch(key, groupOrders);
          batches.push(batch);
          logger.info(`[BatchProcessor] Created batch for ${key}: ${batch.orderCount} orders, size=${batch.totalSize.toFixed(4)}`);
        } else {
          // Not enough orders to batch, process individually
          for (const order of groupOrders) {
            // Re-add to pending for individual processing
            this.pendingOrders.set(order.id, order);
          }
          logger.info(`[BatchProcessor] Insufficient orders for ${key} (${groupOrders.length} < ${this.config.minOrdersToBatch}), processing individually`);
        }
      }

      // Call the callback if set
      if (batches.length > 0 && this.onBatchReadyCallback) {
        await this.onBatchReadyCallback(batches);
      }

      return batches;

    } catch (error) {
      logger.error('[BatchProcessor] Error processing batch:', error);
      return [];
    } finally {
      this.isProcessing = false;
    }
  }

  private groupOrders(orders: BatchableOrder[]): Map<string, BatchableOrder[]> {
    const groups = new Map<string, BatchableOrder[]>();

    for (const order of orders) {
      // Skip exit orders (reduceOnly) - they should be processed immediately
      if (order.riskAssessment.warnings?.some(w => w.toLowerCase().includes('exit'))) {
        continue;
      }

      const key = `${order.signal.symbol.toUpperCase()}-${order.signal.action}`;
      const existing = groups.get(key) || [];
      existing.push(order);
      groups.set(key, existing);
    }

    return groups;
  }

  private createBatch(key: string, orders: BatchableOrder[]): BatchedOrder {
    const [symbol, side] = key.split('-') as [string, 'BUY' | 'SELL'];
    
    // Calculate aggregates
    let totalSize = 0;
    let totalConfidence = 0;
    let totalPrice = 0;
    let maxPriority = 0;

    for (const order of orders) {
      const size = order.riskAssessment.suggestedSize || order.signal.size || 0;
      totalSize += size;
      totalConfidence += order.signal.confidence;
      totalPrice += order.signal.price || 0;
      maxPriority = Math.max(maxPriority, order.priority);
    }

    const count = orders.length;
    
    // Sort by priority (highest first) for execution order
    orders.sort((a, b) => b.priority - a.priority);

    return {
      symbol,
      side,
      totalSize,
      avgConfidence: totalConfidence / count,
      avgPrice: totalPrice / count,
      orderCount: count,
      originalOrders: orders,
      batchId: `batch-${symbol}-${Date.now()}`
    };
  }

  private calculatePriority(signal: TradingSignal): number {
    let priority = signal.confidence * 100; // Base: confidence 0-100
    
    // Boost for higher confidence
    if (signal.confidence > 0.9) priority += 20;
    if (signal.confidence > 0.95) priority += 20;
    
    // Small time boost to prevent starvation
    priority += Math.random() * 5;
    
    return priority;
  }

  /**
   * Check if a signal should be batched or processed immediately
   */
  shouldBatch(signal: TradingSignal, riskAssessment: RiskAssessment): boolean {
    // Don't batch exit orders
    if (riskAssessment.warnings?.some(w => w.toLowerCase().includes('exit'))) {
      return false;
    }
    
    // Don't batch if batching is disabled
    if (!this.config.enableBatching) {
      return false;
    }

    // Don't batch high-priority urgent orders
    if (signal.confidence > 0.95 && riskAssessment.riskScore < 0.3) {
      return false;
    }

    return true;
  }

  /**
   * Enable/disable batching
   */
  setEnabled(enabled: boolean): void {
    this.config.enableBatching = enabled;
    logger.info(`[BatchProcessor] Batching ${enabled ? 'enabled' : 'disabled'}`);
  }
}

export const batchProcessor = new BatchProcessor();
export default batchProcessor;
