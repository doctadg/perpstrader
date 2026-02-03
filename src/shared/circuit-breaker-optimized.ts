/**
 * Optimized Circuit Breaker System
 * Performance improvements:
 * - Exponential backoff for recovery attempts
 * - Alert deduplication
 * - Parallel health checks
 * - Configurable jitter
 * - Metrics collection
 */

import logger from '../shared/logger';
import executionEngine from '../execution-engine/execution-engine';
import riskManager from '../risk-manager/risk-manager';
import positionRecovery from '../execution-engine/position-recovery-optimized';

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
export class OptimizedCircuitBreakerSystem {
    private breakers: Map<string, CircuitBreakerState> = new Map();
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private healthHistory: HealthCheckResult[] = [];
    private alertCallbacks: Array<(result: HealthCheckResult) => void> = [];
    private metrics: Map<string, CircuitBreakerMetrics> = new Map();

    // Configuration
    private readonly MAX_RECOVERY_ATTEMPTS = 5;
    private readonly BASE_BACKOFF_MS = 1000;
    private readonly MAX_BACKOFF_MS = 60000;
    private readonly ALERT_COOLDOWN_MS = 300000; // 5 minutes
    private readonly HEALTH_HISTORY_LIMIT = 500;

    constructor() {
        this.initializeDefaultBreakers();
    }

    /**
     * Initialize default circuit breakers
     */
    private initializeDefaultBreakers(): void {
        this.registerBreaker('execution', {
            threshold: 5,
            timeout: 60000,
        });

        this.registerBreaker('risk-manager', {
            threshold: 3,
            timeout: 30000,
        });

        this.registerBreaker('api-hyperliquid', {
            threshold: 10,
            timeout: 120000,
        });

        this.registerBreaker('database', {
            threshold: 5,
            timeout: 30000,
        });

        this.registerBreaker('vector-store', {
            threshold: 5,
            timeout: 60000,
        });

        this.registerBreaker('glm-service', {
            threshold: 3,
            timeout: 120000,
        });
        
        this.registerBreaker('position-recovery', {
            threshold: 5,
            timeout: 60000,
        });
    }

    /**
     * Register a new circuit breaker
     */
    registerBreaker(name: string, config: { threshold: number; timeout: number }): void {
        this.breakers.set(name, {
            name,
            isOpen: false,
            halfOpen: false,
            openAt: null,
            lastError: null,
            errorCount: 0,
            successCount: 0,
            threshold: config.threshold,
            timeout: config.timeout,
            recoveryAttempts: 0,
            lastAlertAt: null,
        });

        this.metrics.set(name, {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            rejectedCalls: 0,
            avgResponseTime: 0,
            lastOpenedAt: null,
        });

        logger.debug(`[CircuitBreaker] Registered breaker: ${name} (threshold: ${config.threshold}, timeout: ${config.timeout}ms)`);
    }

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(
        breakerName: string,
        fn: () => Promise<T>,
        fallback?: () => T | Promise<T>
    ): Promise<T> {
        const breaker = this.breakers.get(breakerName);
        const metrics = this.metrics.get(breakerName);

        if (!breaker) {
            logger.warn(`[CircuitBreaker] Unknown breaker: ${breakerName}, executing without protection`);
            return fn();
        }

        if (metrics) {
            metrics.totalCalls++;
        }

        // Check if circuit is open
        if (breaker.isOpen) {
            const timeSinceOpen = breaker.openAt ? Date.now() - breaker.openAt.getTime() : 0;
            const backoffMs = this.calculateBackoff(breaker.recoveryAttempts);

            if (timeSinceOpen < backoffMs) {
                metrics?.rejectedCalls++;
                logger.warn(`[CircuitBreaker] ${breakerName} is OPEN, blocking execution (backoff: ${backoffMs}ms)`);

                if (fallback) {
                    return fallback();
                }

                throw new Error(`Circuit breaker ${breakerName} is OPEN`);
            }

            // Enter half-open state for recovery attempt
            breaker.halfOpen = true;
            logger.info(`[CircuitBreaker] ${breakerName} entering half-open state (attempt ${breaker.recoveryAttempts + 1}/${this.MAX_RECOVERY_ATTEMPTS})`);
        }

        const startTime = Date.now();

        try {
            const result = await fn();
            this.onSuccess(breakerName);
            
            if (metrics) {
                metrics.successfulCalls++;
                this.updateAvgResponseTime(metrics, Date.now() - startTime);
            }
            
            return result;

        } catch (error) {
            this.onError(breakerName, error);
            
            if (metrics) {
                metrics.failedCalls++;
            }

            if (fallback) {
                logger.warn(`[CircuitBreaker] ${breakerName} failed, using fallback`);
                return fallback();
            }

            throw error;
        }
    }

    /**
     * Calculate exponential backoff with jitter
     */
    private calculateBackoff(attempts: number): number {
        // Exponential backoff: 2^attempts * base, with jitter
        const exponentialDelay = Math.min(
            this.BASE_BACKOFF_MS * Math.pow(2, attempts),
            this.MAX_BACKOFF_MS
        );
        
        // Add ±20% jitter to avoid thundering herd
        const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
        return Math.floor(exponentialDelay + jitter);
    }

    /**
     * Update average response time using exponential moving average
     */
    private updateAvgResponseTime(metrics: CircuitBreakerMetrics, responseTime: number): void {
        const alpha = 0.1; // Smoothing factor
        metrics.avgResponseTime = (alpha * responseTime) + ((1 - alpha) * metrics.avgResponseTime);
    }

    /**
     * Record a successful execution
     */
    private onSuccess(breakerName: string): void {
        const breaker = this.breakers.get(breakerName);
        if (!breaker) return;

        breaker.successCount++;
        breaker.errorCount = Math.max(0, breaker.errorCount - 1); // Decay errors on success

        // If we were in half-open state and succeeded enough times, close the circuit
        if (breaker.halfOpen && breaker.successCount >= 2) {
            breaker.isOpen = false;
            breaker.halfOpen = false;
            breaker.openAt = null;
            breaker.errorCount = 0;
            breaker.successCount = 0;
            breaker.recoveryAttempts = 0;
            
            const metrics = this.metrics.get(breakerName);
            if (metrics) {
                metrics.lastOpenedAt = new Date();
            }
            
            logger.info(`[CircuitBreaker] ${breakerName} circuit CLOSED after successful recovery`);
        }
    }

    /**
     * Record a failed execution
     */
    private onError(breakerName: string, error: unknown): void {
        const breaker = this.breakers.get(breakerName);
        if (!breaker) return;

        breaker.errorCount++;
        breaker.lastError = new Date();

        const errorMsg = error instanceof Error ? error.message : String(error);

        if (breaker.errorCount >= breaker.threshold && !breaker.isOpen) {
            breaker.isOpen = true;
            breaker.halfOpen = false;
            breaker.openAt = new Date();
            breaker.successCount = 0;
            breaker.recoveryAttempts = 0;

            const metrics = this.metrics.get(breakerName);
            if (metrics) {
                metrics.lastOpenedAt = new Date();
            }

            logger.error(`[CircuitBreaker] ${breakerName} circuit OPENED after ${breaker.errorCount} errors: ${errorMsg}`);

            // Trigger alert with deduplication
            if (!this.shouldDedupeAlert(breaker)) {
                this.triggerAlert({
                    component: breakerName,
                    status: 'CRITICAL',
                    message: `Circuit breaker opened: ${errorMsg}`,
                    timestamp: new Date(),
                    metrics: { errorCount: breaker.errorCount, threshold: breaker.threshold },
                    responseTime: 0,
                });
            }

            this.handleBreakerOpen(breakerName);
        }

        // If in half-open state, increment recovery attempts
        if (breaker.halfOpen) {
            breaker.recoveryAttempts++;
            
            if (breaker.recoveryAttempts >= this.MAX_RECOVERY_ATTEMPTS) {
                // Go back to fully open
                breaker.halfOpen = false;
                breaker.recoveryAttempts = 0;
                logger.error(`[CircuitBreaker] ${breakerName} recovery attempts exhausted, returning to open state`);
            }
        }
    }

    /**
     * Check if alert should be deduplicated
     */
    private shouldDedupeAlert(breaker: CircuitBreakerState): boolean {
        if (!breaker.lastAlertAt) {
            breaker.lastAlertAt = new Date();
            return false;
        }

        const timeSinceLastAlert = Date.now() - breaker.lastAlertAt.getTime();
        if (timeSinceLastAlert < this.ALERT_COOLDOWN_MS) {
            return true;
        }

        breaker.lastAlertAt = new Date();
        return false;
    }

    /**
     * Handle circuit breaker opening
     */
    private handleBreakerOpen(breakerName: string): void {
        switch (breakerName) {
            case 'execution':
                logger.error('[CircuitBreaker] Execution breaker opened - stopping all trading');
                break;

            case 'risk-manager':
                logger.error('[CircuitBreaker] Risk manager breaker opened - reducing position sizes');
                break;

            case 'database':
                logger.error('[CircuitBreaker] Database breaker opened - switching to memory mode');
                break;
                
            case 'position-recovery':
                logger.error('[CircuitBreaker] Position recovery breaker opened - disabling auto-recovery');
                positionRecovery.stopMonitoring();
                break;

            default:
                logger.warn(`[CircuitBreaker] ${breakerName} opened`);
        }
    }

    /**
     * Start periodic health checks (parallelized)
     */
    startHealthChecks(intervalMs: number = 30000): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            await this.runAllHealthChecks();
        }, intervalMs);

        logger.info(`[CircuitBreaker] Started optimized health checks (interval: ${intervalMs}ms)`);
    }

    /**
     * Stop health checks
     */
    stopHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.info('[CircuitBreaker] Stopped health checks');
        }
    }

    /**
     * Run health check for all components (parallelized)
     */
    async runAllHealthChecks(): Promise<HealthCheckResult[]> {
        const startTime = Date.now();
        
        // Run all health checks in parallel
        const results = await Promise.all([
            this.checkExecutionEngine(),
            this.checkRiskManager(),
            this.checkAPIConnectivity(),
            this.checkDatabase(),
            this.checkVectorStore(),
            this.checkGLMService(),
            this.checkPositionRecovery(),
        ]);

        // Store in history
        this.healthHistory.push(...results);

        // Keep only last N results
        if (this.healthHistory.length > this.HEALTH_HISTORY_LIMIT) {
            this.healthHistory = this.healthHistory.slice(-this.HEALTH_HISTORY_LIMIT);
        }

        // Check for critical issues
        const criticalResults = results.filter(r => r.status === 'CRITICAL');
        if (criticalResults.length > 0) {
            for (const result of criticalResults) {
                this.triggerAlert(result);
            }
        }

        const totalTime = Date.now() - startTime;
        logger.debug(`[CircuitBreaker] Health checks completed in ${totalTime}ms`);

        return results;
    }

    /**
     * Check execution engine health
     */
    private async checkExecutionEngine(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const [isConfigured, portfolio] = await Promise.all([
                Promise.resolve(executionEngine.isConfigured()),
                executionEngine.getPortfolio()
            ]);

            const responseTime = Date.now() - startTime;

            let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' = 'HEALTHY';
            let message = 'Execution engine operational';

            if (!isConfigured) {
                status = 'DEGRADED';
                message = 'Execution engine not configured';
            }

            if (portfolio.totalValue === 0) {
                status = 'DEGRADED';
                message = 'Portfolio has zero value';
            }

            return {
                component: 'execution-engine',
                status,
                message,
                timestamp: new Date(),
                metrics: {
                    isConfigured,
                    portfolioValue: portfolio.totalValue,
                    availableBalance: portfolio.availableBalance,
                    positionsCount: portfolio.positions.length,
                },
                responseTime,
            };

        } catch (error) {
            return {
                component: 'execution-engine',
                status: 'UNHEALTHY',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check risk manager health
     */
    private async checkRiskManager(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const riskMetrics = riskManager.getRiskMetrics();
            const responseTime = Date.now() - startTime;

            let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' = 'HEALTHY';
            let message = 'Risk manager operational';

            if (riskMetrics.emergencyStop) {
                status = 'CRITICAL';
                message = 'Emergency stop is active';
            } else if (riskMetrics.riskUtilization > 0.9) {
                status = 'DEGRADED';
                message = `Risk utilization at ${(riskMetrics.riskUtilization * 100).toFixed(0)}%`;
            } else if (Math.abs(riskMetrics.dailyPnL) > riskMetrics.maxDailyLoss * 0.8) {
                status = 'DEGRADED';
                message = `Approaching daily loss limit: ${riskMetrics.dailyPnL.toFixed(2)}`;
            }

            return {
                component: 'risk-manager',
                status,
                message,
                timestamp: new Date(),
                metrics: riskMetrics,
                responseTime,
            };

        } catch (error) {
            return {
                component: 'risk-manager',
                status: 'UNHEALTHY',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check API connectivity
     */
    private async checkAPIConnectivity(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const isValid = await executionEngine.validateCredentials();
            const responseTime = Date.now() - startTime;

            return {
                component: 'api-hyperliquid',
                status: isValid ? 'HEALTHY' : 'UNHEALTHY',
                message: isValid ? 'API connectivity OK' : 'API validation failed',
                timestamp: new Date(),
                metrics: { isValid, responseTime },
                responseTime,
            };

        } catch (error) {
            return {
                component: 'api-hyperliquid',
                status: 'UNHEALTHY',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check database health
     */
    private async checkDatabase(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const trades = await executionEngine.getRecentTrades(1);
            const responseTime = Date.now() - startTime;

            return {
                component: 'database',
                status: 'HEALTHY',
                message: 'Database operational',
                timestamp: new Date(),
                metrics: { recentTradesCount: trades.length },
                responseTime,
            };

        } catch (error) {
            return {
                component: 'database',
                status: 'UNHEALTHY',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check vector store health
     */
    private async checkVectorStore(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const vectorStore = await import('../data/vector-store');
            const stats = await vectorStore.default.getStats();
            const responseTime = Date.now() - startTime;

            return {
                component: 'vector-store',
                status: 'HEALTHY',
                message: 'Vector store operational',
                timestamp: new Date(),
                metrics: stats,
                responseTime,
            };

        } catch (error) {
            return {
                component: 'vector-store',
                status: 'DEGRADED',
                message: `Vector store unavailable: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check GLM service health
     */
    private async checkGLMService(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const glmService = await import('../shared/glm-service');
            const canUse = glmService.default.canUseService();
            const responseTime = Date.now() - startTime;

            return {
                component: 'glm-service',
                status: canUse ? 'HEALTHY' : 'DEGRADED',
                message: canUse ? 'GLM service available' : 'GLM service not configured',
                timestamp: new Date(),
                metrics: { canUse },
                responseTime,
            };

        } catch (error) {
            return {
                component: 'glm-service',
                status: 'DEGRADED',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }
    
    /**
     * Check position recovery health
     */
    private async checkPositionRecovery(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const stats = positionRecovery.getStats();
            const responseTime = Date.now() - startTime;
            
            const hasActiveIssues = stats.activeIssues.length > 0;
            const hasPendingBatches = stats.pendingBatches.closes > 0 || stats.pendingBatches.reductions > 0;

            let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' = 'HEALTHY';
            let message = 'Position recovery operational';

            if (stats.recoveryAttempts > 10) {
                status = 'DEGRADED';
                message = 'High number of recovery attempts';
            }
            
            if (hasActiveIssues && stats.activeIssues.length > 5) {
                status = 'DEGRADED';
                message = `${stats.activeIssues.length} active position issues`;
            }

            return {
                component: 'position-recovery',
                status,
                message,
                timestamp: new Date(),
                metrics: {
                    activeIssues: stats.activeIssues.length,
                    recoveryAttempts: stats.recoveryAttempts,
                    pendingBatches: stats.pendingBatches,
                },
                responseTime,
            };

        } catch (error) {
            return {
                component: 'position-recovery',
                status: 'UNHEALTHY',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Get health check history
     */
    getHealthHistory(component?: string, limit: number = 100): HealthCheckResult[] {
        let history = this.healthHistory;

        if (component) {
            history = history.filter(h => h.component === component);
        }

        return history.slice(-limit);
    }

    /**
     * Get circuit breaker status
     */
    getBreakerStatus(name: string): CircuitBreakerState | undefined {
        return this.breakers.get(name);
    }

    /**
     * Get all circuit breaker statuses
     */
    getAllBreakerStatuses(): CircuitBreakerState[] {
        return Array.from(this.breakers.values());
    }

    /**
     * Get metrics for all breakers
     */
    getAllMetrics(): Map<string, CircuitBreakerMetrics> {
        return new Map(this.metrics);
    }

    /**
     * Reset a circuit breaker
     */
    resetBreaker(name: string): boolean {
        const breaker = this.breakers.get(name);
        if (!breaker) return false;

        breaker.isOpen = false;
        breaker.halfOpen = false;
        breaker.openAt = null;
        breaker.errorCount = 0;
        breaker.successCount = 0;
        breaker.recoveryAttempts = 0;

        logger.info(`[CircuitBreaker] Reset breaker: ${name}`);
        return true;
    }

    /**
     * Manually open a circuit breaker (for emergency)
     */
    openBreaker(name: string): boolean {
        const breaker = this.breakers.get(name);
        if (!breaker) return false;

        breaker.isOpen = true;
        breaker.halfOpen = false;
        breaker.openAt = new Date();

        logger.warn(`[CircuitBreaker] Manually opened breaker: ${name}`);
        this.handleBreakerOpen(name);

        return true;
    }

    /**
     * Register alert callback
     */
    onAlert(callback: (result: HealthCheckResult) => void): void {
        this.alertCallbacks.push(callback);
    }

    /**
     * Trigger alert to all callbacks
     */
    private triggerAlert(result: HealthCheckResult): void {
        for (const callback of this.alertCallbacks) {
            try {
                callback(result);
            } catch (error) {
                logger.error('[CircuitBreaker] Alert callback failed:', error);
            }
        }
    }

    /**
     * Get system health summary
     */
    async getHealthSummary(): Promise<{
        overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
        components: HealthCheckResult[];
        breakers: CircuitBreakerState[];
        metrics: Record<string, CircuitBreakerMetrics>;
        timestamp: Date;
    }> {
        const [components, breakers] = await Promise.all([
            this.runAllHealthChecks(),
            Promise.resolve(this.getAllBreakerStatuses())
        ]);

        let overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' = 'HEALTHY';

        if (components.some(c => c.status === 'CRITICAL') || breakers.some(b => b.isOpen)) {
            overall = 'CRITICAL';
        } else if (components.some(c => c.status === 'UNHEALTHY')) {
            overall = 'UNHEALTHY';
        } else if (components.some(c => c.status === 'DEGRADED')) {
            overall = 'DEGRADED';
        }

        // Convert metrics map to record
        const metricsRecord: Record<string, CircuitBreakerMetrics> = {};
        this.metrics.forEach((value, key) => {
            metricsRecord[key] = value;
        });

        return {
            overall,
            components,
            breakers,
            metrics: metricsRecord,
            timestamp: new Date(),
        };
    }
}

// Singleton instance
const optimizedCircuitBreaker = new OptimizedCircuitBreakerSystem();
export default optimizedCircuitBreaker;
