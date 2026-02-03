/**
 * Infrastructure Components
 *
 * Nautilus-inspired infrastructure services for PerpsTrader
 * Exporting all services for easy importing
 */

// Token Bucket Rate Limiting
export {
    TokenBucket,
    HyperliquidRateLimiter,
    PolymarketRateLimiter,
    hyperliquidRateLimiter,
    polymarketRateLimiter,
} from './token-bucket';
export type { TokenBucketConfig, ConsumeResult } from './token-bucket';

// Overfill Protection
export { default as overfillProtection } from './overfill-protection';
export type {
    OrderState,
    FillEvent,
    OverfillCheckResult,
    OverfillConfig,
    OverfillRecord,
} from './overfill-protection';

// State Snapshot Service
export { default as snapshotService } from './snapshot-service';
export type {
    SnapshotMetadata,
    SnapshotType,
    OrderSnapshot,
    PositionSnapshot,
    PortfolioSnapshot,
    SystemSnapshot,
    SnapshotConfig,
} from './snapshot-service';

// Reconciliation Service
export { default as reconciliationService } from './reconciliation-service';
export type {
    LocalPositionState,
    VenuePositionState,
    Fill,
    ReconciliationResult,
    Discrepancy,
    ReconciliationAdjustment,
    ReconciliationConfig,
    ReconciliationReport,
} from './reconciliation-service';

// Simulation Clock
export {
    RealtimeClock,
    TestClock,
    createClock,
    getRealtimeClock,
    getSimulationClock,
    resetSimulationClock,
    dateToNanos,
    nanosToDate,
    formatNanos,
} from '../backtest/simulation-clock';
export type { IClock, TimeEvent, Timer, TimeAlert, ClockMode } from '../backtest/simulation-clock';

// Fill Models
export {
    FillModel,
    OrderBookBuilder,
    PositionCalculator,
    FillModels,
} from '../backtest/fill-models';
export type {
    OrderBook,
    BookLevel,
    SimulatedOrder,
    SimulatedFill,
    FillModelConfig,
    LatencyModelConfig,
} from '../backtest/fill-models';

// Enhanced Message Bus
export {
    EnhancedMessageBus,
    MessageCircuitBreaker,
} from './enhanced-message-bus';
export type {
    EnhancedMessage,
    MessageHandler,
    Subscription,
    DeadLetterMessage,
} from './enhanced-message-bus';
export { CircuitBreakerState } from './enhanced-message-bus';

// Unified Cache
export { default as unifiedCache } from './unified-cache';
export type {
    Instrument,
    CachedOrderBook,
    CachedOrder,
    CachedPosition,
    MarketDataCache,
    CacheConfig,
} from './unified-cache';

// Default exports for convenience
export { hyperliquidRateLimiter as rateLimiter } from './token-bucket';
