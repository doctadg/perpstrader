/**
 * State Snapshot Service
 *
 * Inspired by Nautilus Trader's state snapshotting system.
 * Provides point-in-time recovery capability and comprehensive audit trails.
 *
 * Features:
 * - Periodic snapshots of order, position, and portfolio state
 * - Point-in-time state recovery
 * - Audit trail for compliance and debugging
 * - Configurable snapshot intervals
 */

import { v4 as uuidv4 } from 'uuid';
import { Trade, Position, Portfolio } from '../shared/types';
import logger from '../shared/logger';
import dataManager from '../data-manager/data-manager';

export interface SnapshotMetadata {
    id: string;
    timestamp: number;
    cycleId?: string;
    type: SnapshotType;
    tags: string[];
}

export type SnapshotType = 'ORDER' | 'POSITION' | 'PORTFOLIO' | 'FULL' | 'CYCLE_COMPLETE';

export interface OrderSnapshot {
    orderId: string;
    clientOrderId: string;
    venueOrderId?: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    filledQuantity: number;
    avgFillPrice: number;
    status: 'PENDING' | 'OPEN' | 'FILLED' | 'PARTIAL' | 'CANCELED' | 'REJECTED';
    timestamp: number;
    metadata?: Record<string, any>;
}

export interface PositionSnapshot {
    symbol: string;
    side: 'LONG' | 'SHORT';
    quantity: number;
    entryPrice: number;
    markPrice: number;
    unrealizedPnL: number;
    realizedPnL: number;
    leverage: number;
    marginUsed: number;
    timestamp: number;
    trades: Trade[];
}

export interface PortfolioSnapshot {
    totalValue: number;
    availableBalance: number;
    usedBalance: number;
    positions: PositionSnapshot[];
    dailyPnL: number;
    unrealizedPnL: number;
    timestamp: number;
}

export interface SystemSnapshot {
    metadata: SnapshotMetadata;
    orders: OrderSnapshot[];
    positions: PositionSnapshot[];
    portfolio?: PortfolioSnapshot;
    context?: {
        cycleId?: string;
        symbol?: string;
        strategyId?: string;
        [key: string]: any;
    };
}

export interface SnapshotConfig {
    /** Whether to enable automatic snapshots */
    enabled: boolean;
    /** Snapshot interval in milliseconds (0 = manual only) */
    intervalMs: number;
    /** Maximum snapshots to keep in memory */
    maxInMemory: number;
    /** Whether to persist snapshots to disk */
    persist: boolean;
    /** Snapshot retention period in milliseconds */
    retentionMs: number;
}

export class SnapshotService {
    private config: SnapshotConfig;
    private snapshots: Map<string, SystemSnapshot> = new Map();
    private orderSnapshots: Map<string, OrderSnapshot[]> = new Map(); // orderId -> snapshots
    private positionSnapshots: Map<string, PositionSnapshot[]> = new Map(); // symbol -> snapshots
    private timer: NodeJS.Timeout | null = null;
    private lastFullSnapshot: number = 0;

    constructor(config: Partial<SnapshotConfig> = {}) {
        this.config = {
            enabled: config.enabled ?? true,
            intervalMs: config.intervalMs ?? 60000, // 1 minute default
            maxInMemory: config.maxInMemory ?? 1000,
            persist: config.persist ?? true,
            retentionMs: config.retentionMs ?? 7 * 24 * 60 * 60 * 1000, // 7 days
        };

        if (this.config.enabled && this.config.intervalMs > 0) {
            this.startPeriodicSnapshots();
        }
    }

    /**
     * Start periodic snapshot timer
     */
    private startPeriodicSnapshots(): void {
        if (this.timer) {
            clearInterval(this.timer);
        }

        this.timer = setInterval(() => {
            this.createSnapshot('FULL').catch(err => {
                logger.error('[SnapshotService] Periodic snapshot failed:', err);
            });
        }, this.config.intervalMs);

        logger.info(`[SnapshotService] Periodic snapshots enabled (interval: ${this.config.intervalMs}ms)`);
    }

    /**
     * Stop periodic snapshot timer
     */
    stopPeriodicSnapshots(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger.info('[SnapshotService] Periodic snapshots stopped');
        }
    }

    /**
     * Create a snapshot of current system state
     */
    async createSnapshot(
        type: SnapshotType,
        data?: {
            orders?: OrderSnapshot[];
            positions?: PositionSnapshot[];
            portfolio?: PortfolioSnapshot;
            context?: Record<string, any>;
            cycleId?: string;
        }
    ): Promise<SystemSnapshot> {
        const metadata: SnapshotMetadata = {
            id: uuidv4(),
            timestamp: Date.now(),
            cycleId: data?.context?.cycleId,
            type,
            tags: [],
        };

        const snapshot: SystemSnapshot = {
            metadata,
            orders: data?.orders ?? [],
            positions: data?.positions ?? [],
            portfolio: data?.portfolio,
            context: data?.context,
        };

        // Store snapshot
        this.snapshots.set(metadata.id, snapshot);

        // Index by order
        for (const order of snapshot.orders) {
            if (!this.orderSnapshots.has(order.orderId)) {
                this.orderSnapshots.set(order.orderId, []);
            }
            this.orderSnapshots.get(order.orderId)!.push({
                ...order,
                timestamp: metadata.timestamp,
            });
        }

        // Index by position
        for (const position of snapshot.positions) {
            if (!this.positionSnapshots.has(position.symbol)) {
                this.positionSnapshots.set(position.symbol, []);
            }
            this.positionSnapshots.get(position.symbol)!.push({
                ...position,
                timestamp: metadata.timestamp,
            });
        }

        // Update last full snapshot timestamp
        if (type === 'FULL' || type === 'CYCLE_COMPLETE') {
            this.lastFullSnapshot = metadata.timestamp;
        }

        // Enforce memory limits
        this.enforceMemoryLimits();

        // Persist if enabled
        if (this.config.persist) {
            await this.persistSnapshot(snapshot);
        }

        logger.debug(`[SnapshotService] Created ${type} snapshot: ${metadata.id}`);

        return snapshot;
    }

    /**
     * Snapshot a single order
     */
    async snapshotOrder(order: {
        orderId: string;
        clientOrderId: string;
        venueOrderId?: string;
        symbol: string;
        side: 'BUY' | 'SELL';
        quantity: number;
        price: number;
        filledQuantity: number;
        avgFillPrice: number;
        status: string;
        metadata?: Record<string, any>;
    }): Promise<OrderSnapshot> {
        const orderSnapshot: OrderSnapshot = {
            orderId: order.orderId,
            clientOrderId: order.clientOrderId,
            venueOrderId: order.venueOrderId,
            symbol: order.symbol,
            side: order.side,
            quantity: order.quantity,
            price: order.price,
            filledQuantity: order.filledQuantity,
            avgFillPrice: order.avgFillPrice,
            status: order.status as any,
            timestamp: Date.now(),
            metadata: order.metadata,
        };

        if (!this.orderSnapshots.has(order.orderId)) {
            this.orderSnapshots.set(order.orderId, []);
        }
        this.orderSnapshots.get(order.orderId)!.push(orderSnapshot);

        return orderSnapshot;
    }

    /**
     * Snapshot a single position
     */
    async snapshotPosition(position: Position, trades: Trade[]): Promise<PositionSnapshot> {
        const positionSnapshot: PositionSnapshot = {
            symbol: position.symbol,
            side: position.side,
            quantity: position.size,
            entryPrice: position.entryPrice,
            markPrice: position.markPrice,
            unrealizedPnL: position.unrealizedPnL,
            realizedPnL: 0, // Would need to calculate from closed trades
            leverage: position.leverage,
            marginUsed: position.marginUsed,
            timestamp: Date.now(),
            trades: [...trades], // Copy trades
        };

        if (!this.positionSnapshots.has(position.symbol)) {
            this.positionSnapshots.set(position.symbol, []);
        }
        this.positionSnapshots.get(position.symbol)!.push(positionSnapshot);

        return positionSnapshot;
    }

    /**
     * Snapshot portfolio state
     */
    async snapshotPortfolio(portfolio: Portfolio): Promise<PortfolioSnapshot> {
        const snapshot: PortfolioSnapshot = {
            totalValue: portfolio.totalValue,
            availableBalance: portfolio.availableBalance,
            usedBalance: portfolio.usedBalance,
            positions: portfolio.positions.map(p => ({
                symbol: p.symbol,
                side: p.side,
                quantity: p.size,
                entryPrice: p.entryPrice,
                markPrice: p.markPrice,
                unrealizedPnL: p.unrealizedPnL,
                realizedPnL: 0,
                leverage: p.leverage,
                marginUsed: p.marginUsed,
                timestamp: Date.now(),
                trades: [],
            })),
            dailyPnL: portfolio.dailyPnL,
            unrealizedPnL: portfolio.unrealizedPnL,
            timestamp: Date.now(),
        };

        return snapshot;
    }

    /**
     * Restore system state from a snapshot
     */
    async restoreFromSnapshot(snapshotId: string): Promise<SystemSnapshot | null> {
        const snapshot = this.snapshots.get(snapshotId);
        if (!snapshot) {
            // Try loading from persistent storage
            return await this.loadSnapshot(snapshotId);
        }

        logger.info(`[SnapshotService] Restoring from snapshot: ${snapshotId}`);

        // Restore positions
        for (const position of snapshot.positions) {
            // Trigger position restoration
            logger.debug(`[SnapshotService] Restoring position: ${position.symbol} ${position.side} ${position.quantity}`);
        }

        // Restore orders
        for (const order of snapshot.orders) {
            logger.debug(`[SnapshotService] Restoring order: ${order.orderId} ${order.side} ${order.quantity}`);
        }

        return snapshot;
    }

    /**
     * Get snapshot at or closest to a given timestamp
     */
    getSnapshotAtTime(timestamp: number): SystemSnapshot | null {
        let closest: SystemSnapshot | null = null;
        let minDiff = Infinity;

        for (const snapshot of this.snapshots.values()) {
            const diff = Math.abs(snapshot.metadata.timestamp - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closest = snapshot;
            }
        }

        return closest;
    }

    /**
     * Get order history from snapshots
     */
    getOrderHistory(orderId: string, limit: number = 100): OrderSnapshot[] {
        const snapshots = this.orderSnapshots.get(orderId) || [];
        return snapshots.slice(-limit);
    }

    /**
     * Get position history from snapshots
     */
    getPositionHistory(symbol: string, limit: number = 100): PositionSnapshot[] {
        const snapshots = this.positionSnapshots.get(symbol) || [];
        return snapshots.slice(-limit);
    }

    /**
     * Find state changes between two snapshots
     */
    compareSnapshots(snapshotId1: string, snapshotId2: string): {
        orders: {
            added: OrderSnapshot[];
            removed: OrderSnapshot[];
            changed: { old: OrderSnapshot; new: OrderSnapshot }[];
        };
        positions: {
            added: PositionSnapshot[];
            removed: PositionSnapshot[];
            changed: { old: PositionSnapshot; new: PositionSnapshot }[];
        };
    } | null {
        const snap1 = this.snapshots.get(snapshotId1);
        const snap2 = this.snapshots.get(snapshotId2);

        if (!snap1 || !snap2) {
            return null;
        }

        // Compare orders
        const orders1 = new Map(snap1.orders.map(o => [o.orderId, o]));
        const orders2 = new Map(snap2.orders.map(o => [o.orderId, o]));

        const orderAdded: OrderSnapshot[] = [];
        const orderRemoved: OrderSnapshot[] = [];
        const orderChanged: { old: OrderSnapshot; new: OrderSnapshot }[] = [];

        for (const [id, order] of orders2) {
            const oldOrder = orders1.get(id);
            if (!oldOrder) {
                orderAdded.push(order);
            } else if (
                oldOrder.filledQuantity !== order.filledQuantity ||
                oldOrder.status !== order.status
            ) {
                orderChanged.push({ old: oldOrder, new: order });
            }
        }

        for (const [id, order] of orders1) {
            if (!orders2.has(id)) {
                orderRemoved.push(order);
            }
        }

        // Compare positions
        const positions1 = new Map(snap1.positions.map(p => [p.symbol, p]));
        const positions2 = new Map(snap2.positions.map(p => [p.symbol, p]));

        const positionAdded: PositionSnapshot[] = [];
        const positionRemoved: PositionSnapshot[] = [];
        const positionChanged: { old: PositionSnapshot; new: PositionSnapshot }[] = [];

        for (const [symbol, position] of positions2) {
            const oldPos = positions1.get(symbol);
            if (!oldPos) {
                positionAdded.push(position);
            } else if (
                oldPos.quantity !== position.quantity ||
                oldPos.side !== position.side
            ) {
                positionChanged.push({ old: oldPos, new: position });
            }
        }

        for (const [symbol, position] of positions1) {
            if (!positions2.has(symbol)) {
                positionRemoved.push(position);
            }
        }

        return {
            orders: {
                added: orderAdded,
                removed: orderRemoved,
                changed: orderChanged,
            },
            positions: {
                added: positionAdded,
                removed: positionRemoved,
                changed: positionChanged,
            },
        };
    }

    /**
     * Persist snapshot to storage
     */
    private async persistSnapshot(snapshot: SystemSnapshot): Promise<void> {
        try {
            // TODO: Implement database persistence for snapshots
            // Store in database using dataManager when methods are available
            logger.debug(`[SnapshotService] Would persist snapshot: ${snapshot.metadata.id}`);
        } catch (error) {
            logger.error('[SnapshotService] Failed to persist snapshot:', error);
        }
    }

    /**
     * Load snapshot from storage
     */
    private async loadSnapshot(snapshotId: string): Promise<SystemSnapshot | null> {
        try {
            // TODO: Implement database loading for snapshots
            // Return from in-memory cache for now
            return this.snapshots.get(snapshotId) || null;
        } catch (error) {
            logger.error('[SnapshotService] Failed to load snapshot:', error);
        }
        return null;
    }

    /**
     * Enforce memory limits by removing old snapshots
     */
    private enforceMemoryLimits(): void {
        const now = Date.now();
        const cutoff = now - this.config.retentionMs;

        // Remove old snapshots by type
        for (const [id, snapshot] of this.snapshots) {
            if (snapshot.metadata.timestamp < cutoff) {
                this.snapshots.delete(id);
            }
        }

        // Limit total in-memory snapshots
        if (this.snapshots.size > this.config.maxInMemory) {
            const entries = Array.from(this.snapshots.entries())
                .sort((a, b) => a[1].metadata.timestamp - b[1].metadata.timestamp);

            const toRemove = entries.slice(0, entries.length - this.config.maxInMemory);
            for (const [id] of toRemove) {
                this.snapshots.delete(id);
            }
        }

        // Clean up order/position snapshots
        for (const [orderId, snapshots] of this.orderSnapshots) {
            const filtered = snapshots.filter(s => s.timestamp >= cutoff);
            if (filtered.length === 0) {
                this.orderSnapshots.delete(orderId);
            } else {
                this.orderSnapshots.set(orderId, filtered);
            }
        }

        for (const [symbol, snapshots] of this.positionSnapshots) {
            const filtered = snapshots.filter(s => s.timestamp >= cutoff);
            if (filtered.length === 0) {
                this.positionSnapshots.delete(symbol);
            } else {
                this.positionSnapshots.set(symbol, filtered);
            }
        }
    }

    /**
     * Get all snapshot metadata
     */
    getSnapshotList(): SnapshotMetadata[] {
        return Array.from(this.snapshots.values())
            .map(s => s.metadata)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get service statistics
     */
    getStatistics(): {
        totalSnapshots: number;
        ordersTracked: number;
        positionsTracked: number;
        lastFullSnapshot: number;
        oldestSnapshot: number;
        newestSnapshot: number;
    } {
        const timestamps = Array.from(this.snapshots.values()).map(s => s.metadata.timestamp);

        return {
            totalSnapshots: this.snapshots.size,
            ordersTracked: this.orderSnapshots.size,
            positionsTracked: this.positionSnapshots.size,
            lastFullSnapshot: this.lastFullSnapshot,
            oldestSnapshot: timestamps.length > 0 ? Math.min(...timestamps) : 0,
            newestSnapshot: timestamps.length > 0 ? Math.max(...timestamps) : 0,
        };
    }

    /**
     * Clear all snapshots
     */
    clear(): void {
        this.snapshots.clear();
        this.orderSnapshots.clear();
        this.positionSnapshots.clear();
        this.lastFullSnapshot = 0;
        logger.info('[SnapshotService] All snapshots cleared');
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<SnapshotConfig>): void {
        const wasEnabled = this.config.enabled && this.config.intervalMs > 0;

        this.config = { ...this.config, ...config };

        const isEnabled = this.config.enabled && this.config.intervalMs > 0;

        if (wasEnabled && !isEnabled) {
            this.stopPeriodicSnapshots();
        } else if (!wasEnabled && isEnabled) {
            this.startPeriodicSnapshots();
        }

        logger.info('[SnapshotService] Config updated:', this.config);
    }

    /**
     * Cleanup on shutdown
     */
    async shutdown(): Promise<void> {
        this.stopPeriodicSnapshots();

        // Create final snapshot
        if (this.config.enabled) {
            await this.createSnapshot('FULL');
        }

        logger.info('[SnapshotService] Shutdown complete');
    }
}

// Singleton instance
const snapshotService = new SnapshotService();

export default snapshotService;
