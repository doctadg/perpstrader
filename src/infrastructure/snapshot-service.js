"use strict";
/**
 * State Snapshot Service
 *
 * Inspired by Nautilus Trader's state snapshotting system.
 * Provides point-in-time recovery capability and comprehensive audit trails.
 *
 * Features:
 * - Periodic snapshots of order, position, and portfolio state
 * - Point-in-time state recovery
 * - Audit trail for compliance and debugging
 * - Configurable snapshot intervals
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnapshotService = void 0;
var uuid_1 = require("uuid");
var logger_1 = require("../shared/logger");
var SnapshotService = /** @class */ (function () {
    function SnapshotService(config) {
        if (config === void 0) { config = {}; }
        var _a, _b, _c, _d, _e;
        this.snapshots = new Map();
        this.orderSnapshots = new Map(); // orderId -> snapshots
        this.positionSnapshots = new Map(); // symbol -> snapshots
        this.timer = null;
        this.lastFullSnapshot = 0;
        this.config = {
            enabled: (_a = config.enabled) !== null && _a !== void 0 ? _a : true,
            intervalMs: (_b = config.intervalMs) !== null && _b !== void 0 ? _b : 60000, // 1 minute default
            maxInMemory: (_c = config.maxInMemory) !== null && _c !== void 0 ? _c : 1000,
            persist: (_d = config.persist) !== null && _d !== void 0 ? _d : true,
            retentionMs: (_e = config.retentionMs) !== null && _e !== void 0 ? _e : 7 * 24 * 60 * 60 * 1000, // 7 days
        };
        if (this.config.enabled && this.config.intervalMs > 0) {
            this.startPeriodicSnapshots();
        }
    }
    /**
     * Start periodic snapshot timer
     */
    SnapshotService.prototype.startPeriodicSnapshots = function () {
        var _this = this;
        if (this.timer) {
            clearInterval(this.timer);
        }
        this.timer = setInterval(function () {
            _this.createSnapshot('FULL').catch(function (err) {
                logger_1.default.error('[SnapshotService] Periodic snapshot failed:', err);
            });
        }, this.config.intervalMs);
        logger_1.default.info("[SnapshotService] Periodic snapshots enabled (interval: ".concat(this.config.intervalMs, "ms)"));
    };
    /**
     * Stop periodic snapshot timer
     */
    SnapshotService.prototype.stopPeriodicSnapshots = function () {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger_1.default.info('[SnapshotService] Periodic snapshots stopped');
        }
    };
    /**
     * Create a snapshot of current system state
     */
    SnapshotService.prototype.createSnapshot = function (type, data) {
        return __awaiter(this, void 0, void 0, function () {
            var metadata, snapshot, _i, _a, order, _b, _c, position;
            var _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        metadata = {
                            id: (0, uuid_1.v4)(),
                            timestamp: Date.now(),
                            cycleId: (_d = data === null || data === void 0 ? void 0 : data.context) === null || _d === void 0 ? void 0 : _d.cycleId,
                            type: type,
                            tags: [],
                        };
                        snapshot = {
                            metadata: metadata,
                            orders: (_e = data === null || data === void 0 ? void 0 : data.orders) !== null && _e !== void 0 ? _e : [],
                            positions: (_f = data === null || data === void 0 ? void 0 : data.positions) !== null && _f !== void 0 ? _f : [],
                            portfolio: data === null || data === void 0 ? void 0 : data.portfolio,
                            context: data === null || data === void 0 ? void 0 : data.context,
                        };
                        // Store snapshot
                        this.snapshots.set(metadata.id, snapshot);
                        // Index by order
                        for (_i = 0, _a = snapshot.orders; _i < _a.length; _i++) {
                            order = _a[_i];
                            if (!this.orderSnapshots.has(order.orderId)) {
                                this.orderSnapshots.set(order.orderId, []);
                            }
                            this.orderSnapshots.get(order.orderId).push(__assign(__assign({}, order), { timestamp: metadata.timestamp }));
                        }
                        // Index by position
                        for (_b = 0, _c = snapshot.positions; _b < _c.length; _b++) {
                            position = _c[_b];
                            if (!this.positionSnapshots.has(position.symbol)) {
                                this.positionSnapshots.set(position.symbol, []);
                            }
                            this.positionSnapshots.get(position.symbol).push(__assign(__assign({}, position), { timestamp: metadata.timestamp }));
                        }
                        // Update last full snapshot timestamp
                        if (type === 'FULL' || type === 'CYCLE_COMPLETE') {
                            this.lastFullSnapshot = metadata.timestamp;
                        }
                        // Enforce memory limits
                        this.enforceMemoryLimits();
                        if (!this.config.persist) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.persistSnapshot(snapshot)];
                    case 1:
                        _g.sent();
                        _g.label = 2;
                    case 2:
                        logger_1.default.debug("[SnapshotService] Created ".concat(type, " snapshot: ").concat(metadata.id));
                        return [2 /*return*/, snapshot];
                }
            });
        });
    };
    /**
     * Snapshot a single order
     */
    SnapshotService.prototype.snapshotOrder = function (order) {
        return __awaiter(this, void 0, void 0, function () {
            var orderSnapshot;
            return __generator(this, function (_a) {
                orderSnapshot = {
                    orderId: order.orderId,
                    clientOrderId: order.clientOrderId,
                    venueOrderId: order.venueOrderId,
                    symbol: order.symbol,
                    side: order.side,
                    quantity: order.quantity,
                    price: order.price,
                    filledQuantity: order.filledQuantity,
                    avgFillPrice: order.avgFillPrice,
                    status: order.status,
                    timestamp: Date.now(),
                    metadata: order.metadata,
                };
                if (!this.orderSnapshots.has(order.orderId)) {
                    this.orderSnapshots.set(order.orderId, []);
                }
                this.orderSnapshots.get(order.orderId).push(orderSnapshot);
                return [2 /*return*/, orderSnapshot];
            });
        });
    };
    /**
     * Snapshot a single position
     */
    SnapshotService.prototype.snapshotPosition = function (position, trades) {
        return __awaiter(this, void 0, void 0, function () {
            var positionSnapshot;
            return __generator(this, function (_a) {
                positionSnapshot = {
                    symbol: position.symbol,
                    side: position.side,
                    quantity: position.size,
                    entryPrice: position.entryPrice,
                    markPrice: position.markPrice,
                    unrealizedPnL: position.unrealizedPnL,
                    realizedPnL: 0, // Would need to calculate from closed trades
                    leverage: position.leverage,
                    marginUsed: position.marginUsed,
                    timestamp: Date.now(),
                    trades: __spreadArray([], trades, true), // Copy trades
                };
                if (!this.positionSnapshots.has(position.symbol)) {
                    this.positionSnapshots.set(position.symbol, []);
                }
                this.positionSnapshots.get(position.symbol).push(positionSnapshot);
                return [2 /*return*/, positionSnapshot];
            });
        });
    };
    /**
     * Snapshot portfolio state
     */
    SnapshotService.prototype.snapshotPortfolio = function (portfolio) {
        return __awaiter(this, void 0, void 0, function () {
            var snapshot;
            return __generator(this, function (_a) {
                snapshot = {
                    totalValue: portfolio.totalValue,
                    availableBalance: portfolio.availableBalance,
                    usedBalance: portfolio.usedBalance,
                    positions: portfolio.positions.map(function (p) { return ({
                        symbol: p.symbol,
                        side: p.side,
                        quantity: p.size,
                        entryPrice: p.entryPrice,
                        markPrice: p.markPrice,
                        unrealizedPnL: p.unrealizedPnL,
                        realizedPnL: 0,
                        leverage: p.leverage,
                        marginUsed: p.marginUsed,
                        timestamp: Date.now(),
                        trades: [],
                    }); }),
                    dailyPnL: portfolio.dailyPnL,
                    unrealizedPnL: portfolio.unrealizedPnL,
                    timestamp: Date.now(),
                };
                return [2 /*return*/, snapshot];
            });
        });
    };
    /**
     * Restore system state from a snapshot
     */
    SnapshotService.prototype.restoreFromSnapshot = function (snapshotId) {
        return __awaiter(this, void 0, void 0, function () {
            var snapshot, _i, _a, position, _b, _c, order;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        snapshot = this.snapshots.get(snapshotId);
                        if (!!snapshot) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.loadSnapshot(snapshotId)];
                    case 1: 
                    // Try loading from persistent storage
                    return [2 /*return*/, _d.sent()];
                    case 2:
                        logger_1.default.info("[SnapshotService] Restoring from snapshot: ".concat(snapshotId));
                        // Restore positions
                        for (_i = 0, _a = snapshot.positions; _i < _a.length; _i++) {
                            position = _a[_i];
                            // Trigger position restoration
                            logger_1.default.debug("[SnapshotService] Restoring position: ".concat(position.symbol, " ").concat(position.side, " ").concat(position.quantity));
                        }
                        // Restore orders
                        for (_b = 0, _c = snapshot.orders; _b < _c.length; _b++) {
                            order = _c[_b];
                            logger_1.default.debug("[SnapshotService] Restoring order: ".concat(order.orderId, " ").concat(order.side, " ").concat(order.quantity));
                        }
                        return [2 /*return*/, snapshot];
                }
            });
        });
    };
    /**
     * Get snapshot at or closest to a given timestamp
     */
    SnapshotService.prototype.getSnapshotAtTime = function (timestamp) {
        var closest = null;
        var minDiff = Infinity;
        for (var _i = 0, _a = this.snapshots.values(); _i < _a.length; _i++) {
            var snapshot = _a[_i];
            var diff = Math.abs(snapshot.metadata.timestamp - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closest = snapshot;
            }
        }
        return closest;
    };
    /**
     * Get order history from snapshots
     */
    SnapshotService.prototype.getOrderHistory = function (orderId, limit) {
        if (limit === void 0) { limit = 100; }
        var snapshots = this.orderSnapshots.get(orderId) || [];
        return snapshots.slice(-limit);
    };
    /**
     * Get position history from snapshots
     */
    SnapshotService.prototype.getPositionHistory = function (symbol, limit) {
        if (limit === void 0) { limit = 100; }
        var snapshots = this.positionSnapshots.get(symbol) || [];
        return snapshots.slice(-limit);
    };
    /**
     * Find state changes between two snapshots
     */
    SnapshotService.prototype.compareSnapshots = function (snapshotId1, snapshotId2) {
        var snap1 = this.snapshots.get(snapshotId1);
        var snap2 = this.snapshots.get(snapshotId2);
        if (!snap1 || !snap2) {
            return null;
        }
        // Compare orders
        var orders1 = new Map(snap1.orders.map(function (o) { return [o.orderId, o]; }));
        var orders2 = new Map(snap2.orders.map(function (o) { return [o.orderId, o]; }));
        var orderAdded = [];
        var orderRemoved = [];
        var orderChanged = [];
        for (var _i = 0, orders2_1 = orders2; _i < orders2_1.length; _i++) {
            var _a = orders2_1[_i], id = _a[0], order = _a[1];
            var oldOrder = orders1.get(id);
            if (!oldOrder) {
                orderAdded.push(order);
            }
            else if (oldOrder.filledQuantity !== order.filledQuantity ||
                oldOrder.status !== order.status) {
                orderChanged.push({ old: oldOrder, new: order });
            }
        }
        for (var _b = 0, orders1_1 = orders1; _b < orders1_1.length; _b++) {
            var _c = orders1_1[_b], id = _c[0], order = _c[1];
            if (!orders2.has(id)) {
                orderRemoved.push(order);
            }
        }
        // Compare positions
        var positions1 = new Map(snap1.positions.map(function (p) { return [p.symbol, p]; }));
        var positions2 = new Map(snap2.positions.map(function (p) { return [p.symbol, p]; }));
        var positionAdded = [];
        var positionRemoved = [];
        var positionChanged = [];
        for (var _d = 0, positions2_1 = positions2; _d < positions2_1.length; _d++) {
            var _e = positions2_1[_d], symbol = _e[0], position = _e[1];
            var oldPos = positions1.get(symbol);
            if (!oldPos) {
                positionAdded.push(position);
            }
            else if (oldPos.quantity !== position.quantity ||
                oldPos.side !== position.side) {
                positionChanged.push({ old: oldPos, new: position });
            }
        }
        for (var _f = 0, positions1_1 = positions1; _f < positions1_1.length; _f++) {
            var _g = positions1_1[_f], symbol = _g[0], position = _g[1];
            if (!positions2.has(symbol)) {
                positionRemoved.push(position);
            }
        }
        return {
            orders: {
                added: orderAdded,
                removed: orderRemoved,
                changed: orderChanged,
            },
            positions: {
                added: positionAdded,
                removed: positionRemoved,
                changed: positionChanged,
            },
        };
    };
    /**
     * Persist snapshot to storage
     */
    SnapshotService.prototype.persistSnapshot = function (snapshot) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    // TODO: Implement database persistence for snapshots
                    // Store in database using dataManager when methods are available
                    logger_1.default.debug("[SnapshotService] Would persist snapshot: ".concat(snapshot.metadata.id));
                }
                catch (error) {
                    logger_1.default.error('[SnapshotService] Failed to persist snapshot:', error);
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Load snapshot from storage
     */
    SnapshotService.prototype.loadSnapshot = function (snapshotId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    // TODO: Implement database loading for snapshots
                    // Return from in-memory cache for now
                    return [2 /*return*/, this.snapshots.get(snapshotId) || null];
                }
                catch (error) {
                    logger_1.default.error('[SnapshotService] Failed to load snapshot:', error);
                }
                return [2 /*return*/, null];
            });
        });
    };
    /**
     * Enforce memory limits by removing old snapshots
     */
    SnapshotService.prototype.enforceMemoryLimits = function () {
        var now = Date.now();
        var cutoff = now - this.config.retentionMs;
        // Remove old snapshots by type
        for (var _i = 0, _a = this.snapshots; _i < _a.length; _i++) {
            var _b = _a[_i], id = _b[0], snapshot = _b[1];
            if (snapshot.metadata.timestamp < cutoff) {
                this.snapshots.delete(id);
            }
        }
        // Limit total in-memory snapshots
        if (this.snapshots.size > this.config.maxInMemory) {
            var entries = Array.from(this.snapshots.entries())
                .sort(function (a, b) { return a[1].metadata.timestamp - b[1].metadata.timestamp; });
            var toRemove = entries.slice(0, entries.length - this.config.maxInMemory);
            for (var _c = 0, toRemove_1 = toRemove; _c < toRemove_1.length; _c++) {
                var id = toRemove_1[_c][0];
                this.snapshots.delete(id);
            }
        }
        // Clean up order/position snapshots
        for (var _d = 0, _e = this.orderSnapshots; _d < _e.length; _d++) {
            var _f = _e[_d], orderId = _f[0], snapshots = _f[1];
            var filtered = snapshots.filter(function (s) { return s.timestamp >= cutoff; });
            if (filtered.length === 0) {
                this.orderSnapshots.delete(orderId);
            }
            else {
                this.orderSnapshots.set(orderId, filtered);
            }
        }
        for (var _g = 0, _h = this.positionSnapshots; _g < _h.length; _g++) {
            var _j = _h[_g], symbol = _j[0], snapshots = _j[1];
            var filtered = snapshots.filter(function (s) { return s.timestamp >= cutoff; });
            if (filtered.length === 0) {
                this.positionSnapshots.delete(symbol);
            }
            else {
                this.positionSnapshots.set(symbol, filtered);
            }
        }
    };
    /**
     * Get all snapshot metadata
     */
    SnapshotService.prototype.getSnapshotList = function () {
        return Array.from(this.snapshots.values())
            .map(function (s) { return s.metadata; })
            .sort(function (a, b) { return b.timestamp - a.timestamp; });
    };
    /**
     * Get service statistics
     */
    SnapshotService.prototype.getStatistics = function () {
        var timestamps = Array.from(this.snapshots.values()).map(function (s) { return s.metadata.timestamp; });
        return {
            totalSnapshots: this.snapshots.size,
            ordersTracked: this.orderSnapshots.size,
            positionsTracked: this.positionSnapshots.size,
            lastFullSnapshot: this.lastFullSnapshot,
            oldestSnapshot: timestamps.length > 0 ? Math.min.apply(Math, timestamps) : 0,
            newestSnapshot: timestamps.length > 0 ? Math.max.apply(Math, timestamps) : 0,
        };
    };
    /**
     * Clear all snapshots
     */
    SnapshotService.prototype.clear = function () {
        this.snapshots.clear();
        this.orderSnapshots.clear();
        this.positionSnapshots.clear();
        this.lastFullSnapshot = 0;
        logger_1.default.info('[SnapshotService] All snapshots cleared');
    };
    /**
     * Update configuration
     */
    SnapshotService.prototype.updateConfig = function (config) {
        var wasEnabled = this.config.enabled && this.config.intervalMs > 0;
        this.config = __assign(__assign({}, this.config), config);
        var isEnabled = this.config.enabled && this.config.intervalMs > 0;
        if (wasEnabled && !isEnabled) {
            this.stopPeriodicSnapshots();
        }
        else if (!wasEnabled && isEnabled) {
            this.startPeriodicSnapshots();
        }
        logger_1.default.info('[SnapshotService] Config updated:', this.config);
    };
    /**
     * Cleanup on shutdown
     */
    SnapshotService.prototype.shutdown = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.stopPeriodicSnapshots();
                        if (!this.config.enabled) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.createSnapshot('FULL')];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        logger_1.default.info('[SnapshotService] Shutdown complete');
                        return [2 /*return*/];
                }
            });
        });
    };
    return SnapshotService;
}());
exports.SnapshotService = SnapshotService;
// Singleton instance
var snapshotService = new SnapshotService();
exports.default = snapshotService;
