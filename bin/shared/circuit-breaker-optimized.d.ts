/**
 * Optimized Circuit Breaker System
 * Performance improvements:
 * - Exponential backoff for recovery attempts
 * - Alert deduplication
 * - Parallel health checks
 * - Configurable jitter
 * - Metrics collection
 */
interface CircuitBreakerState {
    name: string;
    isOpen: boolean;
    halfOpen: boolean;
    openAt: Date | null;
    lastError: Date | null;
    errorCount: number;
    successCount: number;
    threshold: number;
    timeout: number;
    recoveryAttempts: number;
    lastAlertAt: Date | null;
}
interface HealthCheckResult {
    component: string;
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
    message: string;
    timestamp: Date;
    metrics: Record<string, any>;
    responseTime: number;
}
interface CircuitBreakerMetrics {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    rejectedCalls: number;
    avgResponseTime: number;
    lastOpenedAt: Date | null;
}
/**
 * Optimized Circuit Breaker System
 * Protects the trading system from cascading failures
 */
export declare class OptimizedCircuitBreakerSystem {
    private breakers;
    private healthCheckInterval;
    private healthHistory;
    private alertCallbacks;
    private metrics;
    private readonly MAX_RECOVERY_ATTEMPTS;
    private readonly BASE_BACKOFF_MS;
    private readonly MAX_BACKOFF_MS;
    private readonly ALERT_COOLDOWN_MS;
    private readonly HEALTH_HISTORY_LIMIT;
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
     * Calculate exponential backoff with jitter
     */
    private calculateBackoff;
    /**
     * Update average response time using exponential moving average
     */
    private updateAvgResponseTime;
    /**
     * Record a successful execution
     */
    private onSuccess;
    /**
     * Record a failed execution
     */
    private onError;
    /**
     * Check if alert should be deduplicated
     */
    private shouldDedupeAlert;
    /**
     * Handle circuit breaker opening
     */
    private handleBreakerOpen;
    /**
     * Start periodic health checks (parallelized)
     */
    startHealthChecks(intervalMs?: number): void;
    /**
     * Stop health checks
     */
    stopHealthChecks(): void;
    /**
     * Run health check for all components (parallelized)
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
    /**
     * Check vector store health
     */
    private checkVectorStore;
    /**
     * Check GLM service health
     */
    private checkGLMService;
    /**
     * Check position recovery health
     */
    private checkPositionRecovery;
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
     * Get metrics for all breakers
     */
    getAllMetrics(): Map<string, CircuitBreakerMetrics>;
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
        metrics: Record<string, CircuitBreakerMetrics>;
        timestamp: Date;
    }>;
}
declare const optimizedCircuitBreaker: OptimizedCircuitBreakerSystem;
export default optimizedCircuitBreaker;
//# sourceMappingURL=circuit-breaker-optimized.d.ts.map