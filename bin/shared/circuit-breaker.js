"use strict";
// Circuit Breaker System
// Implements circuit breakers and health checks for all trading components
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerSystem = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const execution_engine_1 = __importDefault(require("../execution-engine/execution-engine"));
const risk_manager_1 = __importDefault(require("../risk-manager/risk-manager"));
/**
 * Circuit Breaker System
 * Protects the trading system from cascading failures
 */
class CircuitBreakerSystem {
    breakers = new Map();
    healthCheckInterval = null;
    healthHistory = [];
    alertCallbacks = [];
    constructor() {
        this.initializeDefaultBreakers();
    }
    /**
     * Initialize default circuit breakers
     */
    initializeDefaultBreakers() {
        this.registerBreaker('execution', {
            threshold: 5, // Open after 5 errors
            timeout: 60000, // 1 minute recovery timeout
        });
        this.registerBreaker('risk-manager', {
            threshold: 3, // More sensitive for risk
            timeout: 30000, // 30 second recovery timeout
        });
        this.registerBreaker('api-hyperliquid', {
            threshold: 10, // More tolerant for API issues
            timeout: 120000, // 2 minute recovery timeout
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
    }
    /**
     * Register a new circuit breaker
     */
    registerBreaker(name, config) {
        this.breakers.set(name, {
            name,
            isOpen: false,
            openAt: null,
            lastError: null,
            errorCount: 0,
            successCount: 0,
            threshold: config.threshold,
            timeout: config.timeout,
        });
        logger_1.default.debug(`[CircuitBreaker] Registered breaker: ${name} (threshold: ${config.threshold}, timeout: ${config.timeout}ms)`);
    }
    /**
     * Execute a function with circuit breaker protection
     */
    async execute(breakerName, fn, fallback) {
        const breaker = this.breakers.get(breakerName);
        if (!breaker) {
            logger_1.default.warn(`[CircuitBreaker] Unknown breaker: ${breakerName}, executing without protection`);
            return fn();
        }
        // Check if circuit is open
        if (breaker.isOpen) {
            const timeSinceOpen = breaker.openAt ? Date.now() - breaker.openAt.getTime() : 0;
            if (timeSinceOpen < breaker.timeout) {
                logger_1.default.warn(`[CircuitBreaker] ${breakerName} is OPEN, blocking execution`);
                if (fallback) {
                    return fallback();
                }
                throw new Error(`Circuit breaker ${breakerName} is OPEN`);
            }
            // Attempt to close the circuit (half-open state)
            logger_1.default.info(`[CircuitBreaker] ${breakerName} attempting recovery`);
        }
        try {
            const result = await fn();
            this.onSuccess(breakerName);
            return result;
        }
        catch (error) {
            this.onError(breakerName, error);
            if (fallback) {
                logger_1.default.warn(`[CircuitBreaker] ${breakerName} failed, using fallback`);
                return fallback();
            }
            throw error;
        }
    }
    /**
     * Record a successful execution
     */
    onSuccess(breakerName) {
        const breaker = this.breakers.get(breakerName);
        if (!breaker)
            return;
        breaker.successCount++;
        // If we were in half-open state and succeeded, close the circuit
        if (breaker.isOpen && breaker.successCount >= 3) {
            breaker.isOpen = false;
            breaker.openAt = null;
            breaker.errorCount = 0;
            breaker.successCount = 0;
            logger_1.default.info(`[CircuitBreaker] ${breakerName} circuit CLOSED after successful recovery`);
        }
    }
    /**
     * Record a failed execution
     */
    onError(breakerName, error) {
        const breaker = this.breakers.get(breakerName);
        if (!breaker)
            return;
        breaker.errorCount++;
        breaker.lastError = new Date();
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (breaker.errorCount >= breaker.threshold && !breaker.isOpen) {
            breaker.isOpen = true;
            breaker.openAt = new Date();
            breaker.successCount = 0;
            logger_1.default.error(`[CircuitBreaker] ${breakerName} circuit OPENED after ${breaker.errorCount} errors: ${errorMsg}`);
            // Trigger alert
            this.triggerAlert({
                component: breakerName,
                status: 'CRITICAL',
                message: `Circuit breaker opened: ${errorMsg}`,
                timestamp: new Date(),
                metrics: { errorCount: breaker.errorCount, threshold: breaker.threshold },
                responseTime: 0,
            });
            // Initiate emergency actions based on breaker
            this.handleBreakerOpen(breakerName);
        }
    }
    /**
     * Handle circuit breaker opening
     */
    handleBreakerOpen(breakerName) {
        switch (breakerName) {
            case 'execution':
                logger_1.default.error('[CircuitBreaker] Execution breaker opened - stopping all trading');
                // Stop trading but keep monitoring
                break;
            case 'risk-manager':
                logger_1.default.error('[CircuitBreaker] Risk manager breaker opened - reducing position sizes');
                // Could reduce position sizes or use more conservative settings
                break;
            case 'database':
                logger_1.default.error('[CircuitBreaker] Database breaker opened - switching to memory mode');
                // Could switch to in-memory storage temporarily
                break;
            default:
                logger_1.default.warn(`[CircuitBreaker] ${breakerName} opened`);
        }
    }
    /**
     * Start periodic health checks
     */
    startHealthChecks(intervalMs = 30000) {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.healthCheckInterval = setInterval(async () => {
            await this.runAllHealthChecks();
        }, intervalMs);
        logger_1.default.info(`[CircuitBreaker] Started health checks (interval: ${intervalMs}ms)`);
    }
    /**
     * Stop health checks
     */
    stopHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger_1.default.info('[CircuitBreaker] Stopped health checks');
        }
    }
    /**
     * Run health check for all components
     */
    async runAllHealthChecks() {
        const results = await Promise.allSettled([
            this.checkExecutionEngine(),
            this.checkRiskManager(),
            this.checkAPIConnectivity(),
            this.checkDatabase(),
            this.checkVectorStore(),
            this.checkGLMService(),
        ]);
        const healthResults = results
            .filter((r) => r.status === 'fulfilled')
            .map(r => r.value);
        // Store in history
        this.healthHistory.push(...healthResults);
        // Keep only last 1000 results
        if (this.healthHistory.length > 1000) {
            this.healthHistory = this.healthHistory.slice(-1000);
        }
        // Check for critical issues
        const criticalResults = healthResults.filter(r => r.status === 'CRITICAL');
        if (criticalResults.length > 0) {
            for (const result of criticalResults) {
                this.triggerAlert(result);
            }
        }
        return healthResults;
    }
    /**
     * Check execution engine health
     */
    async checkExecutionEngine() {
        const startTime = Date.now();
        try {
            const isConfigured = execution_engine_1.default.isConfigured();
            const portfolio = await execution_engine_1.default.getPortfolio();
            const responseTime = Date.now() - startTime;
            let status = 'HEALTHY';
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
        }
        catch (error) {
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
    async checkRiskManager() {
        const startTime = Date.now();
        try {
            const riskMetrics = risk_manager_1.default.getRiskMetrics();
            const responseTime = Date.now() - startTime;
            let status = 'HEALTHY';
            let message = 'Risk manager operational';
            if (riskMetrics.emergencyStop) {
                status = 'CRITICAL';
                message = 'Emergency stop is active';
            }
            if (riskMetrics.riskUtilization > 0.9) {
                status = 'DEGRADED';
                message = `Risk utilization at ${(riskMetrics.riskUtilization * 100).toFixed(0)}%`;
            }
            if (Math.abs(riskMetrics.dailyPnL) > riskMetrics.maxDailyLoss * 0.8) {
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
        }
        catch (error) {
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
    async checkAPIConnectivity() {
        const startTime = Date.now();
        try {
            // Try to validate credentials
            const isValid = await execution_engine_1.default.validateCredentials();
            const responseTime = Date.now() - startTime;
            return {
                component: 'api-hyperliquid',
                status: isValid ? 'HEALTHY' : 'UNHEALTHY',
                message: isValid ? 'API connectivity OK' : 'API validation failed',
                timestamp: new Date(),
                metrics: { isValid, responseTime },
                responseTime,
            };
        }
        catch (error) {
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
    async checkDatabase() {
        const startTime = Date.now();
        try {
            // Simple health check - try to get recent trades
            const trades = await execution_engine_1.default.getRecentTrades(1);
            const responseTime = Date.now() - startTime;
            return {
                component: 'database',
                status: 'HEALTHY',
                message: 'Database operational',
                timestamp: new Date(),
                metrics: { recentTradesCount: trades.length },
                responseTime,
            };
        }
        catch (error) {
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
    async checkVectorStore() {
        const startTime = Date.now();
        try {
            const vectorStore = await Promise.resolve().then(() => __importStar(require('../data/vector-store')));
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
        }
        catch (error) {
            return {
                component: 'vector-store',
                status: 'DEGRADED', // Non-critical
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
    async checkGLMService() {
        const startTime = Date.now();
        try {
            const glmService = await Promise.resolve().then(() => __importStar(require('../shared/glm-service')));
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
        }
        catch (error) {
            return {
                component: 'glm-service',
                status: 'DEGRADED', // Non-critical
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
    getHealthHistory(component, limit = 100) {
        let history = this.healthHistory;
        if (component) {
            history = history.filter(h => h.component === component);
        }
        return history.slice(-limit);
    }
    /**
     * Get circuit breaker status
     */
    getBreakerStatus(name) {
        return this.breakers.get(name);
    }
    /**
     * Get all circuit breaker statuses
     */
    getAllBreakerStatuses() {
        return Array.from(this.breakers.values());
    }
    /**
     * Reset a circuit breaker
     */
    resetBreaker(name) {
        const breaker = this.breakers.get(name);
        if (!breaker)
            return false;
        breaker.isOpen = false;
        breaker.openAt = null;
        breaker.errorCount = 0;
        breaker.successCount = 0;
        logger_1.default.info(`[CircuitBreaker] Reset breaker: ${name}`);
        return true;
    }
    /**
     * Manually open a circuit breaker (for emergency)
     */
    openBreaker(name) {
        const breaker = this.breakers.get(name);
        if (!breaker)
            return false;
        breaker.isOpen = true;
        breaker.openAt = new Date();
        logger_1.default.warn(`[CircuitBreaker] Manually opened breaker: ${name}`);
        this.handleBreakerOpen(name);
        return true;
    }
    /**
     * Register alert callback
     */
    onAlert(callback) {
        this.alertCallbacks.push(callback);
    }
    /**
     * Trigger alert to all callbacks
     */
    triggerAlert(result) {
        for (const callback of this.alertCallbacks) {
            try {
                callback(result);
            }
            catch (error) {
                logger_1.default.error('[CircuitBreaker] Alert callback failed:', error);
            }
        }
    }
    /**
     * Get system health summary
     */
    async getHealthSummary() {
        const components = await this.runAllHealthChecks();
        const breakers = this.getAllBreakerStatuses();
        let overall = 'HEALTHY';
        // Check for critical issues
        if (components.some(c => c.status === 'CRITICAL') || breakers.some(b => b.isOpen)) {
            overall = 'CRITICAL';
        }
        // Check for unhealthy components
        else if (components.some(c => c.status === 'UNHEALTHY')) {
            overall = 'UNHEALTHY';
        }
        // Check for degraded components
        else if (components.some(c => c.status === 'DEGRADED')) {
            overall = 'DEGRADED';
        }
        return {
            overall,
            components,
            breakers,
            timestamp: new Date(),
        };
    }
}
exports.CircuitBreakerSystem = CircuitBreakerSystem;
// Singleton instance
const circuitBreaker = new CircuitBreakerSystem();
exports.default = circuitBreaker;
//# sourceMappingURL=circuit-breaker.js.map