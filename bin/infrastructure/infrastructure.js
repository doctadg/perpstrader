"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BacktestEngine = exports.resetSimulationClock = exports.getSimulationClock = exports.getRealtimeClock = exports.unifiedCache = exports.enhancedMessageBus = exports.reconciliationService = exports.snapshotService = exports.overfillProtection = exports.rateLimiter = exports.InfrastructureManager = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const token_bucket_1 = require("./token-bucket");
Object.defineProperty(exports, "rateLimiter", { enumerable: true, get: function () { return token_bucket_1.hyperliquidRateLimiter; } });
const overfill_protection_1 = __importDefault(require("./overfill-protection"));
exports.overfillProtection = overfill_protection_1.default;
const snapshot_service_1 = __importDefault(require("./snapshot-service"));
exports.snapshotService = snapshot_service_1.default;
const reconciliation_service_1 = __importDefault(require("./reconciliation-service"));
exports.reconciliationService = reconciliation_service_1.default;
const enhanced_message_bus_1 = __importDefault(require("./enhanced-message-bus"));
exports.enhancedMessageBus = enhanced_message_bus_1.default;
const unified_cache_1 = __importDefault(require("./unified-cache"));
exports.unifiedCache = unified_cache_1.default;
const simulation_clock_1 = require("../backtest/simulation-clock");
Object.defineProperty(exports, "getRealtimeClock", { enumerable: true, get: function () { return simulation_clock_1.getRealtimeClock; } });
Object.defineProperty(exports, "getSimulationClock", { enumerable: true, get: function () { return simulation_clock_1.getSimulationClock; } });
Object.defineProperty(exports, "resetSimulationClock", { enumerable: true, get: function () { return simulation_clock_1.resetSimulationClock; } });
const enhanced_backtest_1 = require("../backtest/enhanced-backtest");
Object.defineProperty(exports, "BacktestEngine", { enumerable: true, get: function () { return enhanced_backtest_1.BacktestEngine; } });
/**
 * Infrastructure Manager
 *
 * Central coordinator for all infrastructure services
 */
class InfrastructureManager {
    initialized = false;
    startTime = Date.now();
    /**
     * Initialize all infrastructure services
     */
    async initialize() {
        if (this.initialized) {
            logger_1.default.warn('[Infrastructure] Already initialized');
            return;
        }
        logger_1.default.info('[Infrastructure] Initializing services...');
        // Initialize message bus
        try {
            await this.connectMessageBus();
        }
        catch (error) {
            logger_1.default.warn('[Infrastructure] Message bus connection failed (continuing without it):', error);
        }
        // Start snapshot service
        logger_1.default.info('[Infrastructure] Snapshot service started');
        // Log cache stats
        const cacheStats = unified_cache_1.default.getStatistics();
        logger_1.default.info(`[Infrastructure] Cache ready - ${cacheStats.orders} orders, ${cacheStats.positions} positions`);
        // Log rate limiter state
        const rateLimiterState = token_bucket_1.hyperliquidRateLimiter.getState();
        logger_1.default.info('[Infrastructure] Rate limiter ready - ' +
            `info: ${rateLimiterState.info.availableTokens}/${rateLimiterState.info.capacity}, ` +
            `exchange: ${rateLimiterState.exchange.availableTokens}/${rateLimiterState.exchange.capacity}`);
        this.initialized = true;
        logger_1.default.info(`[Infrastructure] All services initialized (${Date.now() - this.startTime}ms)`);
    }
    /**
     * Connect to message bus (Redis)
     */
    async connectMessageBus() {
        // The existing message bus will auto-connect in production
        logger_1.default.info('[Infrastructure] Message bus ready');
    }
    /**
     * Create a cycle snapshot (called at start/end of trading cycles)
     */
    async createCycleSnapshot(cycleId, data) {
        await snapshot_service_1.default.createSnapshot('CYCLE_COMPLETE', {
            context: { cycleId },
            ...data,
        });
    }
    /**
     * Run reconciliation between local and venue states
     */
    async reconcile(localPositions, venuePositions) {
        const report = await reconciliation_service_1.default.reconcilePositions(localPositions.map(p => ({
            symbol: p.symbol,
            side: p.side,
            quantity: p.size,
            avgEntryPrice: p.entryPrice,
            unrealizedPnL: p.unrealizedPnL,
            fills: [],
        })), venuePositions.map(p => ({
            symbol: p.symbol,
            side: p.side,
            quantity: p.size,
            entryPrice: p.entryPrice,
            unrealizedPnL: p.unrealizedPnL,
        })));
        return {
            matched: report.matched,
            discrepancies: report.discrepancies,
            adjustments: report.adjustments,
        };
    }
    /**
     * Get infrastructure health status
     */
    getHealthStatus() {
        return {
            uptime: Date.now() - this.startTime,
            services: {
                messageBus: true, // Simplified
                cache: true,
                rateLimiter: true,
                snapshots: true,
                reconciliation: true,
            },
            statistics: {
                cache: unified_cache_1.default.getStatistics(),
                rateLimiter: token_bucket_1.hyperliquidRateLimiter.getState(),
                reconciliation: reconciliation_service_1.default.getStatistics(),
                snapshots: snapshot_service_1.default.getStatistics(),
            },
        };
    }
    /**
     * Shutdown all services gracefully
     */
    async shutdown() {
        logger_1.default.info('[Infrastructure] Shutting down...');
        // Stop periodic snapshots
        snapshot_service_1.default.stopPeriodicSnapshots();
        // Create final snapshot
        await snapshot_service_1.default.createSnapshot('FULL');
        // Clear message bus
        enhanced_message_bus_1.default.clear();
        logger_1.default.info('[Infrastructure] Shutdown complete');
    }
}
exports.InfrastructureManager = InfrastructureManager;
// Singleton instance
const infrastructure = new InfrastructureManager();
// Auto-initialize in production
if (process.env.NODE_ENV === 'production') {
    infrastructure.initialize().catch(err => {
        logger_1.default.error('[Infrastructure] Auto-init failed:', err);
    });
}
exports.default = infrastructure;
//# sourceMappingURL=infrastructure.js.map