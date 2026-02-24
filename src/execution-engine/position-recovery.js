"use strict";
// Position Recovery Service
// Handles automatic recovery of stuck, orphaned, or problematic positions
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
exports.PositionRecoveryService = void 0;
var logger_1 = require("../shared/logger");
var execution_engine_1 = require("./execution-engine");
var risk_manager_1 = require("../risk-manager/risk-manager");
var data_manager_1 = require("../data-manager/data-manager");
/**
 * Position Recovery Service
 * Monitors and recovers problematic positions automatically
 */
var PositionRecoveryService = /** @class */ (function () {
    function PositionRecoveryService() {
        this.recoveryAttempts = new Map();
        this.maxRecoveryAttempts = 3;
        this.monitoringInterval = null;
        this.lastCheckTime = null;
        this.issueHistory = [];
        this.alertHistory = [];
        this.maxRecoveryAttempts = parseInt(process.env.MAX_RECOVERY_ATTEMPTS || '3', 10);
    }
    /**
     * Start monitoring positions for recovery
     */
    PositionRecoveryService.prototype.startMonitoring = function (intervalMs) {
        var _this = this;
        if (intervalMs === void 0) { intervalMs = 30000; }
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        this.monitoringInterval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.checkAndRecoverPositions()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); }, intervalMs);
        logger_1.default.info("[PositionRecovery] Started monitoring (interval: ".concat(intervalMs, "ms)"));
    };
    /**
     * Stop monitoring positions
     */
    PositionRecoveryService.prototype.stopMonitoring = function () {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            logger_1.default.info('[PositionRecovery] Stopped monitoring');
        }
    };
    /**
     * Check all positions and perform recovery if needed
     */
    PositionRecoveryService.prototype.checkAndRecoverPositions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var portfolio, issues, _i, issues_1, issue, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.lastCheckTime = new Date();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 8, , 9]);
                        return [4 /*yield*/, execution_engine_1.default.getPortfolio()];
                    case 2:
                        portfolio = _a.sent();
                        return [4 /*yield*/, this.analyzePositions(portfolio)];
                    case 3:
                        issues = _a.sent();
                        if (issues.length === 0) {
                            return [2 /*return*/];
                        }
                        logger_1.default.warn("[PositionRecovery] Found ".concat(issues.length, " position issues"));
                        _i = 0, issues_1 = issues;
                        _a.label = 4;
                    case 4:
                        if (!(_i < issues_1.length)) return [3 /*break*/, 7];
                        issue = issues_1[_i];
                        return [4 /*yield*/, this.handlePositionIssue(issue, portfolio)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        _i++;
                        return [3 /*break*/, 4];
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        error_1 = _a.sent();
                        logger_1.default.error('[PositionRecovery] Check failed:', error_1);
                        return [3 /*break*/, 9];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Analyze positions for potential issues
     */
    PositionRecoveryService.prototype.analyzePositions = function (portfolio) {
        return __awaiter(this, void 0, void 0, function () {
            var issues, _i, _a, position, lossPercent;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        issues = [];
                        _i = 0, _a = portfolio.positions;
                        _c.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        position = _a[_i];
                        return [4 /*yield*/, this.isOrphanedPosition(position)];
                    case 2:
                        // Check for orphaned positions (no matching strategy)
                        if (_c.sent()) {
                            issues.push({
                                position: position,
                                issue: 'ORPHANED',
                                action: {
                                    type: 'CLOSE',
                                    reason: 'Position has no associated strategy or has been abandoned',
                                    priority: 'HIGH',
                                },
                                detectedAt: new Date(),
                            });
                            return [3 /*break*/, 5];
                        }
                        lossPercent = position.unrealizedPnL / (position.size * position.entryPrice);
                        if (lossPercent < -0.15) { // 15% loss
                            issues.push({
                                position: position,
                                issue: 'EXCESSIVE_LOSS',
                                action: {
                                    type: 'CLOSE',
                                    reason: "Position has excessive unrealized loss: ".concat((lossPercent * 100).toFixed(1), "%"),
                                    priority: 'CRITICAL',
                                },
                                detectedAt: new Date(),
                            });
                            return [3 /*break*/, 5];
                        }
                        return [4 /*yield*/, this.isStuckPosition(position)];
                    case 3:
                        // Check for stuck positions (no price movement for extended period)
                        if (_c.sent()) {
                            issues.push({
                                position: position,
                                issue: 'STUCK',
                                action: {
                                    type: position.side === 'LONG' ? 'REDUCE' : 'CLOSE',
                                    reason: 'Position appears stuck with no price movement',
                                    priority: 'MEDIUM',
                                },
                                detectedAt: new Date(),
                            });
                            return [3 /*break*/, 5];
                        }
                        // Check for leverage exceeded
                        if (position.leverage > 50) { // Beyond 50x
                            issues.push({
                                position: position,
                                issue: 'EXCESSIVE_LEVERAGE',
                                action: {
                                    type: 'REDUCE',
                                    reason: "Position leverage ".concat(position.leverage, "x exceeds safe threshold"),
                                    priority: 'HIGH',
                                },
                                detectedAt: new Date(),
                            });
                            return [3 /*break*/, 5];
                        }
                        return [4 /*yield*/, this.isStalePosition(position)];
                    case 4:
                        // Check for stale positions (open too long without action)
                        if (_c.sent()) {
                            issues.push({
                                position: position,
                                issue: 'STALE',
                                action: {
                                    type: 'WAIT',
                                    reason: 'Position has been open for extended period, consider closing',
                                    priority: 'LOW',
                                },
                                detectedAt: new Date(),
                            });
                        }
                        _c.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6:
                        // Store in history
                        (_b = this.issueHistory).push.apply(_b, issues);
                        // Keep only last 100 issues
                        if (this.issueHistory.length > 100) {
                            this.issueHistory = this.issueHistory.slice(-100);
                        }
                        return [2 /*return*/, issues.filter(function (i) { return i.action.priority === 'CRITICAL' || i.action.priority === 'HIGH'; })];
                }
            });
        });
    };
    /**
     * Check if position is orphaned (no associated strategy)
     */
    PositionRecoveryService.prototype.isOrphanedPosition = function (position) {
        return __awaiter(this, void 0, void 0, function () {
            var strategies, hasActiveStrategy, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, data_manager_1.default.getAllStrategies()];
                    case 1:
                        strategies = _b.sent();
                        hasActiveStrategy = strategies.some(function (s) {
                            return s.symbols.includes(position.symbol) && s.isActive;
                        });
                        return [2 /*return*/, !hasActiveStrategy];
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if position is stuck (no significant price movement)
     */
    PositionRecoveryService.prototype.isStuckPosition = function (position) {
        return __awaiter(this, void 0, void 0, function () {
            var trades, prices, minPrice, maxPrice, volatility, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, execution_engine_1.default.getHistoricalTrades(position.symbol, 10)];
                    case 1:
                        trades = _b.sent();
                        if (trades.length === 0)
                            return [2 /*return*/, false];
                        prices = trades.map(function (t) { return t.price; }).filter(function (p) { return p > 0; });
                        if (prices.length < 5)
                            return [2 /*return*/, false];
                        minPrice = Math.min.apply(Math, prices);
                        maxPrice = Math.max.apply(Math, prices);
                        volatility = (maxPrice - minPrice) / ((minPrice + maxPrice) / 2);
                        return [2 /*return*/, volatility < 0.005]; // Less than 0.5% movement
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if position is stale (open too long)
     */
    PositionRecoveryService.prototype.isStalePosition = function (position) {
        return __awaiter(this, void 0, void 0, function () {
            var trades, oldestTrade, ageMs, ageHours, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, execution_engine_1.default.getHistoricalTrades(position.symbol, 1)];
                    case 1:
                        trades = _b.sent();
                        if (trades.length === 0)
                            return [2 /*return*/, false];
                        oldestTrade = trades[0];
                        if (!oldestTrade.timestamp)
                            return [2 /*return*/, false];
                        ageMs = Date.now() - new Date(oldestTrade.timestamp).getTime();
                        ageHours = ageMs / (1000 * 60 * 60);
                        return [2 /*return*/, ageHours > 24]; // Older than 24 hours
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Handle a position issue
     */
    PositionRecoveryService.prototype.handlePositionIssue = function (issue, portfolio) {
        return __awaiter(this, void 0, void 0, function () {
            var position, action, positionKey, attempts, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        position = issue.position, action = issue.action;
                        positionKey = "".concat(position.symbol, "-").concat(position.side);
                        attempts = this.recoveryAttempts.get(positionKey) || 0;
                        if (attempts >= this.maxRecoveryAttempts) {
                            logger_1.default.error("[PositionRecovery] Max recovery attempts reached for ".concat(positionKey));
                            return [2 /*return*/];
                        }
                        this.recoveryAttempts.set(positionKey, attempts + 1);
                        logger_1.default.info("[PositionRecovery] Handling ".concat(action.type, " for ").concat(position.symbol, " (").concat(action.priority, "): ").concat(action.reason));
                        _a = action.type;
                        switch (_a) {
                            case 'CLOSE': return [3 /*break*/, 1];
                            case 'REDUCE': return [3 /*break*/, 3];
                            case 'HEDGE': return [3 /*break*/, 5];
                            case 'ALERT': return [3 /*break*/, 7];
                            case 'WAIT': return [3 /*break*/, 9];
                        }
                        return [3 /*break*/, 10];
                    case 1: return [4 /*yield*/, this.closePosition(position, action.reason)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 3: return [4 /*yield*/, this.reducePosition(position, portfolio, action.reason)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 5: return [4 /*yield*/, this.hedgePosition(position, action.reason)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 7: return [4 /*yield*/, this.sendAlert(position, action.reason)];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 10];
                    case 9:
                        logger_1.default.info("[PositionRecovery] Waiting on ".concat(position.symbol, ": ").concat(action.reason));
                        return [3 /*break*/, 10];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Close a position immediately
     */
    PositionRecoveryService.prototype.closePosition = function (position, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var signal, riskAssessment, _a, _b, _c, error_2;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _d.trys.push([0, 6, , 7]);
                        logger_1.default.warn("[PositionRecovery] Closing position ".concat(position.symbol, ": ").concat(reason));
                        signal = {
                            id: "recovery-".concat(Date.now()),
                            symbol: position.symbol,
                            action: position.side === 'LONG' ? 'SELL' : 'BUY',
                            size: Math.abs(position.size),
                            price: position.markPrice,
                            type: 'MARKET',
                            timestamp: new Date(),
                            confidence: 1.0,
                            strategyId: 'position-recovery',
                            reason: "Recovery: ".concat(reason),
                        };
                        _b = (_a = risk_manager_1.default).evaluateSignal;
                        _c = [signal];
                        return [4 /*yield*/, execution_engine_1.default.getPortfolio()];
                    case 1: return [4 /*yield*/, _b.apply(_a, _c.concat([_d.sent()]))];
                    case 2:
                        riskAssessment = _d.sent();
                        if (!riskAssessment.approved) return [3 /*break*/, 4];
                        return [4 /*yield*/, execution_engine_1.default.executeSignal(signal, riskAssessment)];
                    case 3:
                        _d.sent();
                        logger_1.default.info("[PositionRecovery] Successfully closed position ".concat(position.symbol));
                        return [3 /*break*/, 5];
                    case 4:
                        logger_1.default.error("[PositionRecovery] Risk manager rejected recovery close for ".concat(position.symbol));
                        _d.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_2 = _d.sent();
                        logger_1.default.error("[PositionRecovery] Failed to close position ".concat(position.symbol, ":"), error_2);
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Reduce position size by 50%
     */
    PositionRecoveryService.prototype.reducePosition = function (position, portfolio, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var newSize, signal, riskAssessment, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        newSize = Math.abs(position.size) * 0.5;
                        logger_1.default.warn("[PositionRecovery] Reducing position ".concat(position.symbol, " by 50%: ").concat(reason));
                        signal = {
                            id: "recovery-".concat(Date.now()),
                            symbol: position.symbol,
                            action: position.side === 'LONG' ? 'SELL' : 'BUY',
                            size: newSize,
                            price: position.markPrice,
                            type: 'MARKET',
                            timestamp: new Date(),
                            confidence: 0.8,
                            strategyId: 'position-recovery',
                            reason: "Recovery: ".concat(reason),
                        };
                        return [4 /*yield*/, risk_manager_1.default.evaluateSignal(signal, portfolio)];
                    case 1:
                        riskAssessment = _a.sent();
                        if (!riskAssessment.approved) return [3 /*break*/, 3];
                        return [4 /*yield*/, execution_engine_1.default.executeSignal(signal, riskAssessment)];
                    case 2:
                        _a.sent();
                        logger_1.default.info("[PositionRecovery] Successfully reduced position ".concat(position.symbol, " by 50%"));
                        _a.label = 3;
                    case 3: return [3 /*break*/, 5];
                    case 4:
                        error_3 = _a.sent();
                        logger_1.default.error("[PositionRecovery] Failed to reduce position ".concat(position.symbol, ":"), error_3);
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Hedge a position with opposite exposure
     */
    PositionRecoveryService.prototype.hedgePosition = function (position, reason) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    logger_1.default.warn("[PositionRecovery] Hedging position ".concat(position.symbol, ": ").concat(reason));
                    // For now, just log - hedging requires more sophisticated logic
                    logger_1.default.info("[PositionRecovery] Hedge recommendation: ".concat(position.side === 'LONG' ? 'SHORT' : 'LONG', " ").concat(position.symbol));
                }
                catch (error) {
                    logger_1.default.error("[PositionRecovery] Failed to hedge position ".concat(position.symbol, ":"), error);
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Send alert about position issue
     */
    PositionRecoveryService.prototype.sendAlert = function (position, reason) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                logger_1.default.error("[PositionRecovery] ALERT: ".concat(position.symbol, " ").concat(position.side, " - ").concat(reason));
                // Could integrate with notification services here
                // For now, just log and store locally
                this.alertHistory.push({
                    position: position,
                    issue: reason,
                    action: {
                        type: 'ALERT',
                        reason: reason,
                        priority: 'HIGH',
                    },
                    detectedAt: new Date(),
                });
                return [2 /*return*/];
            });
        });
    };
    /**
     * Manual recovery trigger for specific position
     */
    PositionRecoveryService.prototype.recoverPosition = function (symbol, side, action) {
        return __awaiter(this, void 0, void 0, function () {
            var portfolio, position, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        return [4 /*yield*/, execution_engine_1.default.getPortfolio()];
                    case 1:
                        portfolio = _a.sent();
                        position = portfolio.positions.find(function (p) { return p.symbol === symbol && p.side === side; });
                        if (!position) {
                            logger_1.default.error("[PositionRecovery] Position not found: ".concat(symbol, " ").concat(side));
                            return [2 /*return*/, false];
                        }
                        if (!(action === 'CLOSE')) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.closePosition(position, 'Manual recovery')];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, this.reducePosition(position, portfolio, 'Manual recovery')];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5: return [2 /*return*/, true];
                    case 6:
                        error_4 = _a.sent();
                        logger_1.default.error("[PositionRecovery] Manual recovery failed:", error_4);
                        return [2 /*return*/, false];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get recovery statistics
     */
    PositionRecoveryService.prototype.getStats = function () {
        return {
            lastCheckTime: this.lastCheckTime,
            recoveryAttempts: this.recoveryAttempts.size,
            issueHistory: this.issueHistory,
            activeIssues: this.issueHistory.filter(function (i) { return i.detectedAt > new Date(Date.now() - 3600000); }), // Last hour
        };
    };
    /**
     * Reset recovery attempts for a position
     */
    PositionRecoveryService.prototype.resetRecoveryAttempts = function (symbol, side) {
        var key = "".concat(symbol, "-").concat(side);
        this.recoveryAttempts.delete(key);
        logger_1.default.info("[PositionRecovery] Reset recovery attempts for ".concat(key));
    };
    /**
     * Emergency close all positions
     */
    PositionRecoveryService.prototype.emergencyCloseAll = function () {
        return __awaiter(this, void 0, void 0, function () {
            var portfolio, _i, _a, position, error_5;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 6, , 7]);
                        logger_1.default.error('[PositionRecovery] EMERGENCY CLOSE ALL POSITIONS');
                        return [4 /*yield*/, execution_engine_1.default.getPortfolio()];
                    case 1:
                        portfolio = _b.sent();
                        _i = 0, _a = portfolio.positions;
                        _b.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 5];
                        position = _a[_i];
                        return [4 /*yield*/, this.closePosition(position, 'EMERGENCY CLOSE ALL')];
                    case 3:
                        _b.sent();
                        _b.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_5 = _b.sent();
                        logger_1.default.error('[PositionRecovery] Emergency close all failed:', error_5);
                        throw error_5;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    return PositionRecoveryService;
}());
exports.PositionRecoveryService = PositionRecoveryService;
// Singleton instance
var positionRecovery = new PositionRecoveryService();
exports.default = positionRecovery;
