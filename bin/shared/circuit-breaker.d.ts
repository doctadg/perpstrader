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
/**
 * Circuit Breaker System
 * Protects the trading system from cascading failures
 */
export declare class CircuitBreakerSystem {
    private breakers;
    private healthCheckInterval;
    private healthHistory;
    private alertCallbacks;
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
    /**
     * Check vector store health
     */
    private checkVectorStore;
    /**
     * Check GLM service health
     */
    private checkGLMService;
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
        timestamp: Date;
    }>;
}
declare const circuitBreaker: CircuitBreakerSystem;
export default circuitBreaker;
//# sourceMappingURL=circuit-breaker.d.ts.map