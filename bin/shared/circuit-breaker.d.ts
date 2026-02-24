interface CircuitBreakerState {
    name: string;
    isOpen: boolean;
    openAt: Date | null;
    lastError: Date | null;
    errorCount: number;
    successCount: number;
    threshold: number;
    timeout: number;
}
interface HealthCheckResult {
    component: string;
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
    message: string;
    timestamp: Date;
    metrics: Record<string, any>;
    responseTime: number;
}
type SafetyBreakerType = 'daily_loss' | 'consecutive_loss' | 'drawdown' | 'volatility' | 'frequency_limit';
type VolatilityMode = 'normal' | 'reduced' | 'stopped';
interface SafetyTradeInput {
    symbol: string;
    pnl: number;
    timestamp: Date | string | number;
    id?: string;
}
interface SafetyBreakerTriggerState {
    type: SafetyBreakerType;
    triggered: boolean;
    triggeredAt: string | null;
    expiresAt: string | null;
    triggerValue: number;
    threshold: number;
    reason: string | null;
    manualResetRequired: boolean;
}
export interface SafetyStatus {
    tradingAllowed: boolean;
    tradingHalted: boolean;
    haltReason: string | null;
    blockedReasons: string[];
    dailyPnL: number;
    dailyLossLimit: number;
    consecutiveLosses: number;
    consecutiveLossLimit: number;
    drawdownPercent: number;
    maxDrawdownPercent: number;
    peakAccountValue: number;
    currentAccountValue: number;
    btcVolatility1h: number;
    volatilityMode: VolatilityMode;
    volatilityReduceThreshold: number;
    volatilityStopThreshold: number;
    positionSizeMultiplier: number;
    tradesToday: number;
    maxTradesPerDay: number;
    maxTradesPerSymbol: number;
    tradesPerSymbol: Record<string, number>;
    activeBreakers: SafetyBreakerType[];
    breakers: Record<SafetyBreakerType, SafetyBreakerTriggerState>;
    currentDate: string;
}
/**
 * Safety monitor for trading-specific circuit breakers and position sizing controls.
 */
export declare class SafetyMonitor {
    private readonly circuitBreakerSystem;
    private state;
    private config;
    private readonly statePath;
    private processedTradeKeys;
    private readonly ONE_HOUR_MS;
    private readonly ONE_DAY_MS;
    private readonly MAX_TRADE_HISTORY;
    private readonly MAX_PROCESSED_KEYS;
    constructor(circuitBreakerSystem: CircuitBreakerSystem);
    /**
     * Record a completed trade and evaluate safety breakers.
     */
    recordTrade(trade: SafetyTradeInput): void;
    /**
     * Update the latest account value and evaluate drawdown breaker.
     */
    updateAccountValue(value: number): void;
    /**
     * Update BTC 1h volatility for volatility breaker checks.
     */
    updateBTCVolatility(volatility1h: number): void;
    /**
     * Check if a symbol can open a new trade under current safety constraints.
     */
    canEnterNewTrade(symbol: string): boolean;
    /**
     * Get position sizing multiplier [0, 1] based on current volatility regime.
     */
    getPositionSizeMultiplier(): number;
    /**
     * Manually reset a safety circuit breaker with audit log.
     */
    resetCircuitBreaker(type: string, reason: string): boolean;
    /**
     * Return a full safety status snapshot for health checks and APIs.
     */
    getSafetyStatus(): SafetyStatus;
    /**
     * Get safety status in the same shape used by system health checks.
     */
    getHealthCheckResult(): HealthCheckResult;
    private loadSafetyConfig;
    private refreshConfig;
    private safeNumber;
    private createInitialState;
    private createBreakerState;
    private loadPersistedState;
    private mergeBreakerStates;
    private syncThresholdsWithConfig;
    private refreshState;
    private clearExpiredBreakers;
    private resetBreakerState;
    private triggerDailyLoss;
    private triggerConsecutiveLoss;
    private triggerDrawdown;
    private executeDrawdownEmergencyActions;
    private triggerBreaker;
    private updateFrequencyBreaker;
    private recomputeTradingHaltState;
    private getBlockingReasons;
    private parseDate;
    private buildTradeKey;
    private pushProcessedKey;
    private cloneBreakers;
    private isSafetyBreakerType;
    private mapSafetyBreakerToEventType;
    private getDateKey;
    private getEndOfDay;
    private persistState;
}
/**
 * Circuit Breaker System
 * Protects the trading system from cascading failures
 */
export declare class CircuitBreakerSystem {
    private breakers;
    private healthCheckInterval;
    private healthHistory;
    private alertCallbacks;
    private readonly safetyMonitor;
    constructor();
    /**
     * Initialize default circuit breakers
     */
    private initializeDefaultBreakers;
    /**
     * Register a new circuit breaker
     */
    registerBreaker(name: string, config: {
        threshold: number;
        timeout: number;
    }): void;
    /**
     * Execute a function with circuit breaker protection
     */
    execute<T>(breakerName: string, fn: () => Promise<T>, fallback?: () => T | Promise<T>): Promise<T>;
    /**
     * Record a successful execution
     */
    private onSuccess;
    /**
     * Record a failed execution
     */
    private onError;
    /**
     * Handle circuit breaker opening
     */
    private handleBreakerOpen;
    /**
     * Start periodic health checks
     */
    startHealthChecks(intervalMs?: number): void;
    /**
     * Stop health checks
     */
    stopHealthChecks(): void;
    /**
     * Run health check for all components
     */
    runAllHealthChecks(): Promise<HealthCheckResult[]>;
    /**
     * Check execution engine health
     */
    private checkExecutionEngine;
    /**
     * Check risk manager health
     */
    private checkRiskManager;
    /**
     * Check API connectivity
     */
    private checkAPIConnectivity;
    /**
     * Check database health
     */
    private checkDatabase;
    private recordRecentTradesForSafety;
    /**
     * Check vector store health
     */
    private checkVectorStore;
    /**
     * Check GLM service health
     */
    private checkGLMService;
    /**
     * Check safety monitor health.
     */
    private checkSafetyMonitor;
    /**
     * Get health check history
     */
    getHealthHistory(component?: string, limit?: number): HealthCheckResult[];
    /**
     * Get circuit breaker status
     */
    getBreakerStatus(name: string): CircuitBreakerState | undefined;
    /**
     * Get all circuit breaker statuses
     */
    getAllBreakerStatuses(): CircuitBreakerState[];
    /**
     * Get the safety monitor singleton bound to this circuit breaker system.
     */
    getSafetyMonitor(): SafetyMonitor;
    /**
     * Record a completed trade into safety monitoring.
     */
    recordTrade(trade: SafetyTradeInput): void;
    /**
     * Update account value in safety monitoring.
     */
    updateAccountValue(value: number): void;
    /**
     * Update BTC 1h volatility in safety monitoring.
     */
    updateBTCVolatility(volatility1h: number): void;
    /**
     * Check whether a symbol can open a new trade under safety constraints.
     */
    canEnterNewTrade(symbol: string): boolean;
    /**
     * Get the current volatility-based position size multiplier.
     */
    getPositionSizeMultiplier(): number;
    /**
     * Reset a safety breaker manually with reason.
     */
    resetSafetyCircuitBreaker(type: string, reason: string): boolean;
    /**
     * Get safety subsystem status.
     */
    getSafetyStatus(): SafetyStatus;
    /**
     * Reset a circuit breaker
     */
    resetBreaker(name: string): boolean;
    /**
     * Manually open a circuit breaker (for emergency)
     */
    openBreaker(name: string): boolean;
    /**
     * Register alert callback
     */
    onAlert(callback: (result: HealthCheckResult) => void): void;
    /**
     * Trigger alert to all callbacks
     */
    private triggerAlert;
    /**
     * Get system health summary
     */
    getHealthSummary(): Promise<{
        overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
        components: HealthCheckResult[];
        breakers: CircuitBreakerState[];
        safety: SafetyStatus;
        timestamp: Date;
    }>;
}
declare const circuitBreaker: CircuitBreakerSystem;
export declare const safetyMonitor: SafetyMonitor;
export default circuitBreaker;
//# sourceMappingURL=circuit-breaker.d.ts.map