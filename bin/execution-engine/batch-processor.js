"use strict";
/**
 * Batch Processor
 *
 * Collects orders over a configurable window and batches them for execution.
 * Groups compatible orders (same symbol, same direction) to reduce churn.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchProcessor = exports.BatchProcessor = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
class BatchProcessor {
    pendingOrders = new Map();
    batchTimer = null;
    isProcessing = false;
    config = {
        windowMs: 10000, // 10 second batch window
        maxOrdersPerBatch: 10,
        minOrdersToBatch: 2,
        enableBatching: true
    };
    onBatchReadyCallback = null;
    constructor(config) {
        if (config) {
            this.config = { ...this.config, ...config };
        }
        logger_1.default.info(`[BatchProcessor] Initialized with window=${this.config.windowMs}ms, minOrders=${this.config.minOrdersToBatch}`);
    }
    /**
     * Set callback for when batches are ready
     */
    onBatchReady(callback) {
        this.onBatchReadyCallback = callback;
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        logger_1.default.info(`[BatchProcessor] Config updated: ${JSON.stringify(this.config)}`);
    }
    /**
     * Add an order to the batch queue
     */
    addOrder(signal, riskAssessment) {
        if (!this.config.enableBatching) {
            return false; // Indicate that batching is disabled
        }
        const orderId = `${signal.symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Calculate priority based on confidence and signal age
        const priority = this.calculatePriority(signal);
        const order = {
            id: orderId,
            signal,
            riskAssessment,
            submittedAt: Date.now(),
            priority
        };
        this.pendingOrders.set(orderId, order);
        logger_1.default.info(`[BatchProcessor] Order queued: ${signal.symbol} ${signal.action} (queue size: ${this.pendingOrders.size})`);
        // Start or reset the batch timer
        this.scheduleBatch();
        return true;
    }
    /**
     * Force immediate batch processing
     */
    async flush() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        return this.processBatch();
    }
    /**
     * Get current queue stats
     */
    getQueueStats() {
        const bySymbol = {};
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
    clearQueue() {
        const count = this.pendingOrders.size;
        this.pendingOrders.clear();
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        logger_1.default.info(`[BatchProcessor] Queue cleared (${count} orders removed)`);
    }
    scheduleBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }
        this.batchTimer = setTimeout(() => {
            void this.processBatch();
        }, this.config.windowMs);
    }
    async processBatch() {
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
            const batches = [];
            for (const [key, groupOrders] of groups) {
                if (groupOrders.length >= this.config.minOrdersToBatch) {
                    // Create a batched order
                    const batch = this.createBatch(key, groupOrders);
                    batches.push(batch);
                    logger_1.default.info(`[BatchProcessor] Created batch for ${key}: ${batch.orderCount} orders, size=${batch.totalSize.toFixed(4)}`);
                }
                else {
                    // Not enough orders to batch, process individually
                    for (const order of groupOrders) {
                        // Re-add to pending for individual processing
                        this.pendingOrders.set(order.id, order);
                    }
                    logger_1.default.info(`[BatchProcessor] Insufficient orders for ${key} (${groupOrders.length} < ${this.config.minOrdersToBatch}), processing individually`);
                }
            }
            // Call the callback if set
            if (batches.length > 0 && this.onBatchReadyCallback) {
                await this.onBatchReadyCallback(batches);
            }
            return batches;
        }
        catch (error) {
            logger_1.default.error('[BatchProcessor] Error processing batch:', error);
            return [];
        }
        finally {
            this.isProcessing = false;
        }
    }
    groupOrders(orders) {
        const groups = new Map();
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
    createBatch(key, orders) {
        const [symbol, side] = key.split('-');
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
    calculatePriority(signal) {
        let priority = signal.confidence * 100; // Base: confidence 0-100
        // Boost for higher confidence
        if (signal.confidence > 0.9)
            priority += 20;
        if (signal.confidence > 0.95)
            priority += 20;
        // Small time boost to prevent starvation
        priority += Math.random() * 5;
        return priority;
    }
    /**
     * Check if a signal should be batched or processed immediately
     */
    shouldBatch(signal, riskAssessment) {
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
    setEnabled(enabled) {
        this.config.enableBatching = enabled;
        logger_1.default.info(`[BatchProcessor] Batching ${enabled ? 'enabled' : 'disabled'}`);
    }
}
exports.BatchProcessor = BatchProcessor;
exports.batchProcessor = new BatchProcessor();
exports.default = exports.batchProcessor;
//# sourceMappingURL=batch-processor.js.map