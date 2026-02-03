/**
 * Optimized Components Index
 * Exports all optimized system components
 */

// Data Layer
export { default as traceStoreOptimized } from './data/trace-store-optimized';
export * from './data/trace-store-optimized';

// Execution Engine
export { default as hyperliquidClientOptimized } from './execution-engine/hyperliquid-client-optimized';
export { default as positionRecoveryOptimized } from './execution-engine/position-recovery-optimized';
export * from './execution-engine/hyperliquid-client-optimized';
export * from './execution-engine/position-recovery-optimized';

// Risk Manager
export { default as riskManagerOptimized } from './risk-manager/risk-manager-optimized';
export * from './risk-manager/risk-manager-optimized';

// Circuit Breaker
export { default as circuitBreakerOptimized } from './shared/circuit-breaker-optimized';
export * from './shared/circuit-breaker-optimized';
