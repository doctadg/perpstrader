/**
 * Overfill Protection Service
 *
 * Inspired by Nautilus Trader's overfill detection and protection.
 * Prevents and handles exchange-side overfills that could cause incorrect position sizing.
 *
 * An overfill occurs when:
 * - Exchange fills more quantity than ordered
 * - Duplicate fills arrive from exchange
 * - Fills arrive out of order causing incorrect accounting
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../shared/logger';

export interface OrderState {
    orderId: string;
    clientOrderId: string;
    venueOrderId?: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    orderQty: number;
    filledQty: number;
    avgPx: number;
    status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELED' | 'REJECTED';
    timestamp: number;
}

export interface FillEvent {
    fillId: string;
    orderId: string;
    venueOrderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    fillQty: number;
    fillPx: number;
    timestamp: number;
}

export interface OverfillCheckResult {
    allowed: boolean;
    overfillQty: number;
    reason: string;
    adjustedFill?: {
        qty: number;
        px: number;
    };
}

export interface OverfillConfig {
    /** Whether to allow overfills with logging */
    allowOverfills: boolean;
    /** Tolerance as percentage of order quantity (0.0001 = 0.01%) */
    tolerancePercent: number;
    /** Whether to automatically adjust fills */
    autoAdjust: boolean;
    /** Whether to alert on overfill detection */
    alertOnOverfill: boolean;
}

export interface OverfillRecord {
    id: string;
    orderId: string;
    overfillQty: number;
    expectedQty: number;
    receivedQty: number;
    timestamp: number;
    handled: 'ALLOWED' | 'ADJUSTED' | 'REJECTED';
}

export class OverfillProtection {
    private config: OverfillConfig;
    private orders: Map<string, OrderState> = new Map();
    private fills: Map<string, FillEvent> = new Map();
    private overfillHistory: OverfillRecord[] = [];
    private orderFills: Map<string, Set<string>> = new Map();

    constructor(config: Partial<OverfillConfig> = {}) {
        this.config = {
            allowOverfills: config.allowOverfills ?? false,
            tolerancePercent: config.tolerancePercent ?? 0.01, // 0.01% default
            autoAdjust: config.autoAdjust ?? true,
            alertOnOverfill: config.alertOnOverfill ?? true,
        };
    }

    /**
     * Register an order for tracking
     */
    registerOrder(order: OrderState): void {
        this.orders.set(order.orderId, order);
        this.orderFills.set(order.orderId, new Set());
        logger.debug(`[OverfillProtection] Registered order: ${order.orderId}, qty: ${order.orderQty}`);
    }

    /**
     * Check if a fill would cause an overfill
     */
    checkFill(orderId: string, fillQty: number, fillPx: number): OverfillCheckResult {
        const order = this.orders.get(orderId);
        if (!order) {
            return {
                allowed: false,
                overfillQty: fillQty,
                reason: `Order ${orderId} not found`,
            };
        }

        // Calculate remaining quantity
        const remainingQty = order.orderQty - order.filledQty;
        const potentialOverfill = fillQty - remainingQty;

        // Check tolerance
        const toleranceQty = order.orderQty * (this.config.tolerancePercent / 100);

        if (potentialOverfill > toleranceQty) {
            const record: OverfillRecord = {
                id: uuidv4(),
                orderId,
                overfillQty: potentialOverfill,
                expectedQty: remainingQty,
                receivedQty: fillQty,
                timestamp: Date.now(),
                handled: 'REJECTED', // Will be updated
            };

            if (this.config.allowOverfills) {
                record.handled = 'ALLOWED';
                this.recordOverfill(record);

                if (this.config.alertOnOverfill) {
                    logger.warn(`[OverfillProtection] Overfill ALLOWED for ${orderId}: ` +
                        `expected ${remainingQty}, received ${fillQty} (overfill: ${potentialOverfill})`);
                }

                return {
                    allowed: true,
                    overfillQty: potentialOverfill,
                    reason: 'Overfill allowed by configuration',
                };
            }

            if (this.config.autoAdjust) {
                record.handled = 'ADJUSTED';
                this.recordOverfill(record);

                if (this.config.alertOnOverfill) {
                    logger.warn(`[OverfillProtection] Overfill ADJUSTED for ${orderId}: ` +
                        `expected ${remainingQty}, adjusted to ${remainingQty}`);
                }

                return {
                    allowed: true,
                    overfillQty: potentialOverfill,
                    reason: 'Overfill adjusted to expected quantity',
                    adjustedFill: {
                        qty: remainingQty,
                        px: fillPx,
                    },
                };
            }

            this.recordOverfill(record);

            logger.error(`[OverfillProtection] Overfill REJECTED for ${orderId}: ` +
                `expected ${remainingQty}, received ${fillQty} (overfill: ${potentialOverfill})`);

            return {
                allowed: false,
                overfillQty: potentialOverfill,
                reason: 'Overfill exceeds tolerance and is not allowed',
            };
        }

        return {
            allowed: true,
            overfillQty: 0,
            reason: 'OK',
        };
    }

    /**
     * Record a fill event
     */
    recordFill(fill: FillEvent): void {
        // Check for duplicate fills
        const existingFill = this.fills.get(fill.fillId);
        if (existingFill) {
            logger.warn(`[OverfillProtection] Duplicate fill detected: ${fill.fillId}`);
            return;
        }

        this.fills.set(fill.fillId, fill);

        // Track fills per order
        const orderFills = this.orderFills.get(fill.orderId);
        if (orderFills) {
            orderFills.add(fill.fillId);
        }

        // Update order filled quantity
        const order = this.orders.get(fill.orderId);
        if (order) {
            order.filledQty += fill.fillQty;

            // Update average price
            const totalValue = (order.avgPx * (order.filledQty - fill.fillQty)) + (fill.fillPx * fill.fillQty);
            order.avgPx = totalValue / order.filledQty;

            // Update status if filled
            if (order.filledQty >= order.orderQty) {
                order.status = 'FILLED';
            }
        }

        logger.debug(`[OverfillProtection] Recorded fill: ${fill.fillId}, ` +
            `qty: ${fill.fillQty}, px: ${fill.fillPx}`);
    }

    /**
     * Check for duplicate fills
     */
    isDuplicateFill(fillId: string): boolean {
        return this.fills.has(fillId);
    }

    /**
     * Check if fill matches expected order
     */
    validateFillForOrder(fill: FillEvent, orderId: string): {
        valid: boolean;
        reason?: string;
    } {
        const order = this.orders.get(orderId);
        if (!order) {
            return { valid: false, reason: 'Order not found' };
        }

        if (fill.orderId !== orderId && fill.orderId !== order.venueOrderId) {
            return { valid: false, reason: 'Fill does not match order' };
        }

        if (fill.symbol !== order.symbol) {
            return { valid: false, reason: 'Symbol mismatch' };
        }

        if (fill.side !== order.side) {
            return { valid: false, reason: 'Side mismatch' };
        }

        return { valid: true };
    }

    /**
     * Get order state
     */
    getOrder(orderId: string): OrderState | undefined {
        return this.orders.get(orderId);
    }

    /**
     * Get all fills for an order
     */
    getOrderFills(orderId: string): FillEvent[] {
        const fillIds = this.orderFills.get(orderId);
        if (!fillIds) return [];

        const fills: FillEvent[] = [];
        for (const fillId of fillIds) {
            const fill = this.fills.get(fillId);
            if (fill) {
                fills.push(fill);
            }
        }
        return fills.sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Calculate expected position from fills
     */
    calculateExpectedPosition(orderId: string): {
        totalQty: number;
        avgPx: number;
    } {
        const fills = this.getOrderFills(orderId);
        let totalQty = 0;
        let totalValue = 0;

        for (const fill of fills) {
            totalQty += fill.fillQty;
            totalValue += fill.fillPx * fill.fillQty;
        }

        return {
            totalQty,
            avgPx: totalQty > 0 ? totalValue / totalQty : 0,
        };
    }

    /**
     * Remove an order from tracking (when fully processed)
     */
    removeOrder(orderId: string): void {
        this.orders.delete(orderId);
        this.orderFills.delete(orderId);
        logger.debug(`[OverfillProtection] Removed order: ${orderId}`);
    }

    /**
     * Record an overfill event
     */
    private recordOverfill(record: OverfillRecord): void {
        this.overfillHistory.push(record);

        // Keep only last 1000 records
        if (this.overfillHistory.length > 1000) {
            this.overfillHistory.shift();
        }
    }

    /**
     * Get overfill history
     */
    getOverfillHistory(limit: number = 100): OverfillRecord[] {
        return this.overfillHistory
            .slice(-limit)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get overfill statistics
     */
    getStatistics(): {
        totalOverfills: number;
        allowed: number;
        adjusted: number;
        rejected: number;
        byOrder: Map<string, number>;
    } {
        const stats = {
            totalOverfills: this.overfillHistory.length,
            allowed: 0,
            adjusted: 0,
            rejected: 0,
            byOrder: new Map<string, number>(),
        };

        for (const record of this.overfillHistory) {
            switch (record.handled) {
                case 'ALLOWED':
                    stats.allowed++;
                    break;
                case 'ADJUSTED':
                    stats.adjusted++;
                    break;
                case 'REJECTED':
                    stats.rejected++;
                    break;
            }

            const count = stats.byOrder.get(record.orderId) || 0;
            stats.byOrder.set(record.orderId, count + 1);
        }

        return stats;
    }

    /**
     * Clear old orders and fills
     */
    clear(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
        const cutoff = Date.now() - maxAgeMs;

        for (const [orderId, order] of this.orders) {
            if (order.timestamp < cutoff && order.status === 'FILLED') {
                this.removeOrder(orderId);
            }
        }
    }

    /**
     * Reset all state
     */
    reset(): void {
        this.orders.clear();
        this.fills.clear();
        this.orderFills.clear();
        this.overfillHistory = [];
        logger.info('[OverfillProtection] Reset all state');
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<OverfillConfig>): void {
        this.config = { ...this.config, ...config };
        logger.info('[OverfillProtection] Config updated:', this.config);
    }
}

// Singleton instance
const overfillProtection = new OverfillProtection();

export default overfillProtection;
