/**
 * Infrastructure Integration Module
 *
 * Integrates all Nautilus-inspired services with the PerpsTrader system.
 * This module provides a unified interface for using the enhanced infrastructure.
 *
 * Services integrated:
 * - Token Bucket Rate Limiting
 * - Overfill Protection
 * - State Snapshots
 * - Order Reconciliation
 * - Simulation Clock (for backtesting)
 * - Fill Simulation (for backtesting)
 * - Message Bus
 * - Unified Cache
 */
import { hyperliquidRateLimiter } from './token-bucket';
import overfillProtection from './overfill-protection';
import snapshotService from './snapshot-service';
import reconciliationService from './reconciliation-service';
import enhancedMessageBus from './enhanced-message-bus';
import unifiedCache from './unified-cache';
import { getRealtimeClock, getSimulationClock, resetSimulationClock } from '../backtest/simulation-clock';
import { BacktestEngine } from '../backtest/enhanced-backtest';
/**
 * Infrastructure Manager
 *
 * Central coordinator for all infrastructure services
 */
export declare class InfrastructureManager {
    private initialized;
    private startTime;
    /**
     * Initialize all infrastructure services
     */
    initialize(): Promise<void>;
    /**
     * Connect to message bus (Redis)
     */
    private connectMessageBus;
    /**
     * Create a cycle snapshot (called at start/end of trading cycles)
     */
    createCycleSnapshot(cycleId: string, data?: {
        orders?: any[];
        positions?: any[];
        portfolio?: any;
    }): Promise<void>;
    /**
     * Run reconciliation between local and venue states
     */
    reconcile(localPositions: any[], venuePositions: any[]): Promise<{
        matched: number;
        discrepancies: number;
        adjustments: number;
    }>;
    /**
     * Get infrastructure health status
     */
    getHealthStatus(): {
        uptime: number;
        services: {
            messageBus: boolean;
            cache: boolean;
            rateLimiter: boolean;
            snapshots: boolean;
            reconciliation: boolean;
        };
        statistics: {
            cache: any;
            rateLimiter: any;
            reconciliation: any;
            snapshots: any;
        };
    };
    /**
     * Shutdown all services gracefully
     */
    shutdown(): Promise<void>;
}
declare const infrastructure: InfrastructureManager;
/**
 * Convenience exports for direct service access
 */
export { hyperliquidRateLimiter as rateLimiter, overfillProtection, snapshotService, reconciliationService, enhancedMessageBus, unifiedCache, getRealtimeClock, getSimulationClock, resetSimulationClock, BacktestEngine, };
export default infrastructure;
//# sourceMappingURL=infrastructure.d.ts.map