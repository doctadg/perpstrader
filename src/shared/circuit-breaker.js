"use strict";
// Circuit Breaker System
// Implements circuit breakers and health checks for all trading components
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerSystem = void 0;
var logger_1 = require("../shared/logger");
var execution_engine_1 = require("../execution-engine/execution-engine");
var risk_manager_1 = require("../risk-manager/risk-manager");
/**
 * Circuit Breaker System
 * Protects the trading system from cascading failures
 */
var CircuitBreakerSystem = /** @class */ (function () {
    function CircuitBreakerSystem() {
        this.breakers = new Map();
        this.healthCheckInterval = null;
        this.healthHistory = [];
        this.alertCallbacks = [];
        this.initializeDefaultBreakers();
    }
    /**
     * Initialize default circuit breakers
     */
    CircuitBreakerSystem.prototype.initializeDefaultBreakers = function () {
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
        // Trading pipeline nodes
        this.registerBreaker('market-data', { threshold: 5, timeout: 30000 });
        this.registerBreaker('pattern-recall', { threshold: 5, timeout: 60000 });
        this.registerBreaker('strategy-ideation', { threshold: 4, timeout: 60000 });
        this.registerBreaker('backtester', { threshold: 4, timeout: 45000 });
        this.registerBreaker('strategy-selector', { threshold: 4, timeout: 30000 });
        this.registerBreaker('risk-gate', { threshold: 3, timeout: 30000 });
        this.registerBreaker('executor', { threshold: 5, timeout: 60000 });
        this.registerBreaker('learner', { threshold: 4, timeout: 30000 });
        // News pipeline nodes
        this.registerBreaker('news-execution', { threshold: 5, timeout: 60000 });
        this.registerBreaker('search', { threshold: 5, timeout: 30000 });
        this.registerBreaker('scrape', { threshold: 5, timeout: 30000 });
        this.registerBreaker('quality-filter', { threshold: 4, timeout: 30000 });
        this.registerBreaker('categorize', { threshold: 4, timeout: 30000 });
        this.registerBreaker('topic-generation', { threshold: 4, timeout: 30000 });
        this.registerBreaker('redundancy-filter', { threshold: 4, timeout: 30000 });
        this.registerBreaker('cluster', { threshold: 4, timeout: 45000 });
        this.registerBreaker('cluster-fallback', { threshold: 4, timeout: 45000 });
    };
    /**
     * Register a new circuit breaker
     */
    CircuitBreakerSystem.prototype.registerBreaker = function (name, config) {
        this.breakers.set(name, {
            name: name,
            isOpen: false,
            openAt: null,
            lastError: null,
            errorCount: 0,
            successCount: 0,
            threshold: config.threshold,
            timeout: config.timeout,
        });
        logger_1.default.debug("[CircuitBreaker] Registered breaker: ".concat(name, " (threshold: ").concat(config.threshold, ", timeout: ").concat(config.timeout, "ms)"));
    };
    /**
     * Execute a function with circuit breaker protection
     */
    CircuitBreakerSystem.prototype.execute = function (breakerName, fn, fallback) {
        return __awaiter(this, void 0, void 0, function () {
            var breaker, timeSinceOpen, result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        breaker = this.breakers.get(breakerName);
                        if (!breaker) {
                            logger_1.default.warn("[CircuitBreaker] Unknown breaker: ".concat(breakerName, ", executing without protection"));
                            return [2 /*return*/, fn()];
                        }
                        // Check if circuit is open
                        if (breaker.isOpen) {
                            timeSinceOpen = breaker.openAt ? Date.now() - breaker.openAt.getTime() : 0;
                            if (timeSinceOpen < breaker.timeout) {
                                logger_1.default.warn("[CircuitBreaker] ".concat(breakerName, " is OPEN, blocking execution"));
                                if (fallback) {
                                    return [2 /*return*/, fallback()];
                                }
                                throw new Error("Circuit breaker ".concat(breakerName, " is OPEN"));
                            }
                            // Attempt to close the circuit (half-open state)
                            logger_1.default.info("[CircuitBreaker] ".concat(breakerName, " attempting recovery"));
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, fn()];
                    case 2:
                        result = _a.sent();
                        this.onSuccess(breakerName);
                        return [2 /*return*/, result];
                    case 3:
                        error_1 = _a.sent();
                        this.onError(breakerName, error_1);
                        if (fallback) {
                            logger_1.default.warn("[CircuitBreaker] ".concat(breakerName, " failed, using fallback"));
                            return [2 /*return*/, fallback()];
                        }
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Record a successful execution
     */
    CircuitBreakerSystem.prototype.onSuccess = function (breakerName) {
        var breaker = this.breakers.get(breakerName);
        if (!breaker)
            return;
        breaker.successCount++;
        // If we were in half-open state and succeeded, close the circuit
        if (breaker.isOpen && breaker.successCount >= 3) {
            breaker.isOpen = false;
            breaker.openAt = null;
            breaker.errorCount = 0;
            breaker.successCount = 0;
            logger_1.default.info("[CircuitBreaker] ".concat(breakerName, " circuit CLOSED after successful recovery"));
        }
    };
    /**
     * Record a failed execution
     */
    CircuitBreakerSystem.prototype.onError = function (breakerName, error) {
        var breaker = this.breakers.get(breakerName);
        if (!breaker)
            return;
        breaker.errorCount++;
        breaker.lastError = new Date();
        var errorMsg = error instanceof Error ? error.message : String(error);
        if (breaker.errorCount >= breaker.threshold && !breaker.isOpen) {
            breaker.isOpen = true;
            breaker.openAt = new Date();
            breaker.successCount = 0;
            logger_1.default.error("[CircuitBreaker] ".concat(breakerName, " circuit OPENED after ").concat(breaker.errorCount, " errors: ").concat(errorMsg));
            // Trigger alert
            this.triggerAlert({
                component: breakerName,
                status: 'CRITICAL',
                message: "Circuit breaker opened: ".concat(errorMsg),
                timestamp: new Date(),
                metrics: { errorCount: breaker.errorCount, threshold: breaker.threshold },
                responseTime: 0,
            });
            // Initiate emergency actions based on breaker
            this.handleBreakerOpen(breakerName);
        }
    };
    /**
     * Handle circuit breaker opening
     */
    CircuitBreakerSystem.prototype.handleBreakerOpen = function (breakerName) {
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
                logger_1.default.warn("[CircuitBreaker] ".concat(breakerName, " opened"));
        }
    };
    /**
     * Start periodic health checks
     */
    CircuitBreakerSystem.prototype.startHealthChecks = function (intervalMs) {
        var _this = this;
        if (intervalMs === void 0) { intervalMs = 30000; }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.healthCheckInterval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.runAllHealthChecks()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, intervalMs);
        logger_1.default.info("[CircuitBreaker] Started health checks (interval: ".concat(intervalMs, "ms)"));
    };
    /**
     * Stop health checks
     */
    CircuitBreakerSystem.prototype.stopHealthChecks = function () {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger_1.default.info('[CircuitBreaker] Stopped health checks');
        }
    };
    /**
     * Run health check for all components
     */
    CircuitBreakerSystem.prototype.runAllHealthChecks = function () {
        return __awaiter(this, void 0, void 0, function () {
            var results, healthResults, criticalResults, _i, criticalResults_1, result;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, Promise.allSettled([
                            this.checkExecutionEngine(),
                            this.checkRiskManager(),
                            this.checkAPIConnectivity(),
                            this.checkDatabase(),
                            this.checkVectorStore(),
                            this.checkGLMService(),
                        ])];
                    case 1:
                        results = _b.sent();
                        healthResults = results
                            .filter(function (r) { return r.status === 'fulfilled'; })
                            .map(function (r) { return r.value; });
                        // Store in history
                        (_a = this.healthHistory).push.apply(_a, healthResults);
                        // Keep only last 1000 results
                        if (this.healthHistory.length > 1000) {
                            this.healthHistory = this.healthHistory.slice(-1000);
                        }
                        criticalResults = healthResults.filter(function (r) { return r.status === 'CRITICAL'; });
                        if (criticalResults.length > 0) {
                            for (_i = 0, criticalResults_1 = criticalResults; _i < criticalResults_1.length; _i++) {
                                result = criticalResults_1[_i];
                                this.triggerAlert(result);
                            }
                        }
                        return [2 /*return*/, healthResults];
                }
            });
        });
    };
    /**
     * Check execution engine health
     */
    CircuitBreakerSystem.prototype.checkExecutionEngine = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, isConfigured, portfolio, responseTime, status_1, message, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        isConfigured = execution_engine_1.default.isConfigured();
                        return [4 /*yield*/, execution_engine_1.default.getPortfolio()];
                    case 2:
                        portfolio = _a.sent();
                        responseTime = Date.now() - startTime;
                        status_1 = 'HEALTHY';
                        message = 'Execution engine operational';
                        if (!isConfigured) {
                            status_1 = 'DEGRADED';
                            message = 'Execution engine not configured';
                        }
                        if (portfolio.totalValue === 0) {
                            status_1 = 'DEGRADED';
                            message = 'Portfolio has zero value';
                        }
                        return [2 /*return*/, {
                                component: 'execution-engine',
                                status: status_1,
                                message: message,
                                timestamp: new Date(),
                                metrics: {
                                    isConfigured: isConfigured,
                                    portfolioValue: portfolio.totalValue,
                                    availableBalance: portfolio.availableBalance,
                                    positionsCount: portfolio.positions.length,
                                },
                                responseTime: responseTime,
                            }];
                    case 3:
                        error_2 = _a.sent();
                        return [2 /*return*/, {
                                component: 'execution-engine',
                                status: 'UNHEALTHY',
                                message: "Error: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)),
                                timestamp: new Date(),
                                metrics: {},
                                responseTime: Date.now() - startTime,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check risk manager health
     */
    CircuitBreakerSystem.prototype.checkRiskManager = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, riskMetrics, responseTime, status_2, message;
            return __generator(this, function (_a) {
                startTime = Date.now();
                try {
                    riskMetrics = risk_manager_1.default.getRiskMetrics();
                    responseTime = Date.now() - startTime;
                    status_2 = 'HEALTHY';
                    message = 'Risk manager operational';
                    if (riskMetrics.emergencyStop) {
                        status_2 = 'CRITICAL';
                        message = 'Emergency stop is active';
                    }
                    if (riskMetrics.riskUtilization > 0.9) {
                        status_2 = 'DEGRADED';
                        message = "Risk utilization at ".concat((riskMetrics.riskUtilization * 100).toFixed(0), "%");
                    }
                    if (Math.abs(riskMetrics.dailyPnL) > riskMetrics.maxDailyLoss * 0.8) {
                        status_2 = 'DEGRADED';
                        message = "Approaching daily loss limit: ".concat(riskMetrics.dailyPnL.toFixed(2));
                    }
                    return [2 /*return*/, {
                            component: 'risk-manager',
                            status: status_2,
                            message: message,
                            timestamp: new Date(),
                            metrics: riskMetrics,
                            responseTime: responseTime,
                        }];
                }
                catch (error) {
                    return [2 /*return*/, {
                            component: 'risk-manager',
                            status: 'UNHEALTHY',
                            message: "Error: ".concat(error instanceof Error ? error.message : String(error)),
                            timestamp: new Date(),
                            metrics: {},
                            responseTime: Date.now() - startTime,
                        }];
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Check API connectivity
     */
    CircuitBreakerSystem.prototype.checkAPIConnectivity = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, isValid, responseTime, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, execution_engine_1.default.validateCredentials()];
                    case 2:
                        isValid = _a.sent();
                        responseTime = Date.now() - startTime;
                        return [2 /*return*/, {
                                component: 'api-hyperliquid',
                                status: isValid ? 'HEALTHY' : 'UNHEALTHY',
                                message: isValid ? 'API connectivity OK' : 'API validation failed',
                                timestamp: new Date(),
                                metrics: { isValid: isValid, responseTime: responseTime },
                                responseTime: responseTime,
                            }];
                    case 3:
                        error_3 = _a.sent();
                        return [2 /*return*/, {
                                component: 'api-hyperliquid',
                                status: 'UNHEALTHY',
                                message: "Error: ".concat(error_3 instanceof Error ? error_3.message : String(error_3)),
                                timestamp: new Date(),
                                metrics: {},
                                responseTime: Date.now() - startTime,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check database health
     */
    CircuitBreakerSystem.prototype.checkDatabase = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, trades, responseTime, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, execution_engine_1.default.getRecentTrades(1)];
                    case 2:
                        trades = _a.sent();
                        responseTime = Date.now() - startTime;
                        return [2 /*return*/, {
                                component: 'database',
                                status: 'HEALTHY',
                                message: 'Database operational',
                                timestamp: new Date(),
                                metrics: { recentTradesCount: trades.length },
                                responseTime: responseTime,
                            }];
                    case 3:
                        error_4 = _a.sent();
                        return [2 /*return*/, {
                                component: 'database',
                                status: 'UNHEALTHY',
                                message: "Error: ".concat(error_4 instanceof Error ? error_4.message : String(error_4)),
                                timestamp: new Date(),
                                metrics: {},
                                responseTime: Date.now() - startTime,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check vector store health
     */
    CircuitBreakerSystem.prototype.checkVectorStore = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, vectorStore, stats, responseTime, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('../data/vector-store'); })];
                    case 2:
                        vectorStore = _a.sent();
                        return [4 /*yield*/, vectorStore.default.getStats()];
                    case 3:
                        stats = _a.sent();
                        responseTime = Date.now() - startTime;
                        return [2 /*return*/, {
                                component: 'vector-store',
                                status: 'HEALTHY',
                                message: 'Vector store operational',
                                timestamp: new Date(),
                                metrics: stats,
                                responseTime: responseTime,
                            }];
                    case 4:
                        error_5 = _a.sent();
                        return [2 /*return*/, {
                                component: 'vector-store',
                                status: 'DEGRADED', // Non-critical
                                message: "Vector store unavailable: ".concat(error_5 instanceof Error ? error_5.message : String(error_5)),
                                timestamp: new Date(),
                                metrics: {},
                                responseTime: Date.now() - startTime,
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check GLM service health
     */
    CircuitBreakerSystem.prototype.checkGLMService = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, glmService, canUse, responseTime, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, Promise.resolve().then(function () { return require('../shared/glm-service'); })];
                    case 2:
                        glmService = _a.sent();
                        canUse = glmService.default.canUseService();
                        responseTime = Date.now() - startTime;
                        return [2 /*return*/, {
                                component: 'glm-service',
                                status: canUse ? 'HEALTHY' : 'DEGRADED',
                                message: canUse ? 'GLM service available' : 'GLM service not configured',
                                timestamp: new Date(),
                                metrics: { canUse: canUse },
                                responseTime: responseTime,
                            }];
                    case 3:
                        error_6 = _a.sent();
                        return [2 /*return*/, {
                                component: 'glm-service',
                                status: 'DEGRADED', // Non-critical
                                message: "Error: ".concat(error_6 instanceof Error ? error_6.message : String(error_6)),
                                timestamp: new Date(),
                                metrics: {},
                                responseTime: Date.now() - startTime,
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get health check history
     */
    CircuitBreakerSystem.prototype.getHealthHistory = function (component, limit) {
        if (limit === void 0) { limit = 100; }
        var history = this.healthHistory;
        if (component) {
            history = history.filter(function (h) { return h.component === component; });
        }
        return history.slice(-limit);
    };
    /**
     * Get circuit breaker status
     */
    CircuitBreakerSystem.prototype.getBreakerStatus = function (name) {
        return this.breakers.get(name);
    };
    /**
     * Get all circuit breaker statuses
     */
    CircuitBreakerSystem.prototype.getAllBreakerStatuses = function () {
        return Array.from(this.breakers.values());
    };
    /**
     * Reset a circuit breaker
     */
    CircuitBreakerSystem.prototype.resetBreaker = function (name) {
        var breaker = this.breakers.get(name);
        if (!breaker)
            return false;
        breaker.isOpen = false;
        breaker.openAt = null;
        breaker.errorCount = 0;
        breaker.successCount = 0;
        logger_1.default.info("[CircuitBreaker] Reset breaker: ".concat(name));
        return true;
    };
    /**
     * Manually open a circuit breaker (for emergency)
     */
    CircuitBreakerSystem.prototype.openBreaker = function (name) {
        var breaker = this.breakers.get(name);
        if (!breaker)
            return false;
        breaker.isOpen = true;
        breaker.openAt = new Date();
        logger_1.default.warn("[CircuitBreaker] Manually opened breaker: ".concat(name));
        this.handleBreakerOpen(name);
        return true;
    };
    /**
     * Register alert callback
     */
    CircuitBreakerSystem.prototype.onAlert = function (callback) {
        this.alertCallbacks.push(callback);
    };
    /**
     * Trigger alert to all callbacks
     */
    CircuitBreakerSystem.prototype.triggerAlert = function (result) {
        for (var _i = 0, _a = this.alertCallbacks; _i < _a.length; _i++) {
            var callback = _a[_i];
            try {
                callback(result);
            }
            catch (error) {
                logger_1.default.error('[CircuitBreaker] Alert callback failed:', error);
            }
        }
    };
    /**
     * Get system health summary
     */
    CircuitBreakerSystem.prototype.getHealthSummary = function () {
        return __awaiter(this, void 0, void 0, function () {
            var components, breakers, overall;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.runAllHealthChecks()];
                    case 1:
                        components = _a.sent();
                        breakers = this.getAllBreakerStatuses();
                        overall = 'HEALTHY';
                        // Check for critical issues
                        if (components.some(function (c) { return c.status === 'CRITICAL'; }) || breakers.some(function (b) { return b.isOpen; })) {
                            overall = 'CRITICAL';
                        }
                        // Check for unhealthy components
                        else if (components.some(function (c) { return c.status === 'UNHEALTHY'; })) {
                            overall = 'UNHEALTHY';
                        }
                        // Check for degraded components
                        else if (components.some(function (c) { return c.status === 'DEGRADED'; })) {
                            overall = 'DEGRADED';
                        }
                        return [2 /*return*/, {
                                overall: overall,
                                components: components,
                                breakers: breakers,
                                timestamp: new Date(),
                            }];
                }
            });
        });
    };
    return CircuitBreakerSystem;
}());
exports.CircuitBreakerSystem = CircuitBreakerSystem;
// Singleton instance
var circuitBreaker = new CircuitBreakerSystem();
exports.default = circuitBreaker;
