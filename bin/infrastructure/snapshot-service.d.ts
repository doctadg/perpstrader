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
import { Trade, Position, Portfolio } from '../shared/types';
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
export declare class SnapshotService {
    private config;
    private snapshots;
    private orderSnapshots;
    private positionSnapshots;
    private timer;
    private lastFullSnapshot;
    constructor(config?: Partial<SnapshotConfig>);
    /**
     * Start periodic snapshot timer
     */
    private startPeriodicSnapshots;
    /**
     * Stop periodic snapshot timer
     */
    stopPeriodicSnapshots(): void;
    /**
     * Create a snapshot of current system state
     */
    createSnapshot(type: SnapshotType, data?: {
        orders?: OrderSnapshot[];
        positions?: PositionSnapshot[];
        portfolio?: PortfolioSnapshot;
        context?: Record<string, any>;
        cycleId?: string;
    }): Promise<SystemSnapshot>;
    /**
     * Snapshot a single order
     */
    snapshotOrder(order: {
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
    }): Promise<OrderSnapshot>;
    /**
     * Snapshot a single position
     */
    snapshotPosition(position: Position, trades: Trade[]): Promise<PositionSnapshot>;
    /**
     * Snapshot portfolio state
     */
    snapshotPortfolio(portfolio: Portfolio): Promise<PortfolioSnapshot>;
    /**
     * Restore system state from a snapshot
     */
    restoreFromSnapshot(snapshotId: string): Promise<SystemSnapshot | null>;
    /**
     * Get snapshot at or closest to a given timestamp
     */
    getSnapshotAtTime(timestamp: number): SystemSnapshot | null;
    /**
     * Get order history from snapshots
     */
    getOrderHistory(orderId: string, limit?: number): OrderSnapshot[];
    /**
     * Get position history from snapshots
     */
    getPositionHistory(symbol: string, limit?: number): PositionSnapshot[];
    /**
     * Find state changes between two snapshots
     */
    compareSnapshots(snapshotId1: string, snapshotId2: string): {
        orders: {
            added: OrderSnapshot[];
            removed: OrderSnapshot[];
            changed: {
                old: OrderSnapshot;
                new: OrderSnapshot;
            }[];
        };
        positions: {
            added: PositionSnapshot[];
            removed: PositionSnapshot[];
            changed: {
                old: PositionSnapshot;
                new: PositionSnapshot;
            }[];
        };
    } | null;
    /**
     * Persist snapshot to storage
     */
    private persistSnapshot;
    /**
     * Load snapshot from storage
     */
    private loadSnapshot;
    /**
     * Enforce memory limits by removing old snapshots
     */
    private enforceMemoryLimits;
    /**
     * Get all snapshot metadata
     */
    getSnapshotList(): SnapshotMetadata[];
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
    };
    /**
     * Clear all snapshots
     */
    clear(): void;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<SnapshotConfig>): void;
    /**
     * Cleanup on shutdown
     */
    shutdown(): Promise<void>;
}
declare const snapshotService: SnapshotService;
export default snapshotService;
//# sourceMappingURL=snapshot-service.d.ts.map