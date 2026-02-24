"use strict";
/**
 * Overfill Protection Service
 *
 * Inspired by Nautilus Trader's overfill detection and protection.
 * Prevents and handles exchange-side overfills that could cause incorrect position sizing.
 *
 * An overfill occurs when:
 * - Exchange fills more quantity than ordered
 * - Duplicate fills arrive from exchange
 * - Fills arrive out of order causing incorrect accounting
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OverfillProtection = void 0;
var uuid_1 = require("uuid");
var logger_1 = require("../shared/logger");
var OverfillProtection = /** @class */ (function () {
    function OverfillProtection(config) {
        if (config === void 0) { config = {}; }
        var _a, _b, _c, _d;
        this.orders = new Map();
        this.fills = new Map();
        this.overfillHistory = [];
        this.orderFills = new Map();
        this.config = {
            allowOverfills: (_a = config.allowOverfills) !== null && _a !== void 0 ? _a : false,
            tolerancePercent: (_b = config.tolerancePercent) !== null && _b !== void 0 ? _b : 0.01, // 0.01% default
            autoAdjust: (_c = config.autoAdjust) !== null && _c !== void 0 ? _c : true,
            alertOnOverfill: (_d = config.alertOnOverfill) !== null && _d !== void 0 ? _d : true,
        };
    }
    /**
     * Register an order for tracking
     */
    OverfillProtection.prototype.registerOrder = function (order) {
        this.orders.set(order.orderId, order);
        this.orderFills.set(order.orderId, new Set());
        logger_1.default.debug("[OverfillProtection] Registered order: ".concat(order.orderId, ", qty: ").concat(order.orderQty));
    };
    /**
     * Check if a fill would cause an overfill
     */
    OverfillProtection.prototype.checkFill = function (orderId, fillQty, fillPx) {
        var order = this.orders.get(orderId);
        if (!order) {
            return {
                allowed: false,
                overfillQty: fillQty,
                reason: "Order ".concat(orderId, " not found"),
            };
        }
        // Calculate remaining quantity
        var remainingQty = order.orderQty - order.filledQty;
        var potentialOverfill = fillQty - remainingQty;
        // Check tolerance
        var toleranceQty = order.orderQty * (this.config.tolerancePercent / 100);
        if (potentialOverfill > toleranceQty) {
            var record = {
                id: (0, uuid_1.v4)(),
                orderId: orderId,
                overfillQty: potentialOverfill,
                expectedQty: remainingQty,
                receivedQty: fillQty,
                timestamp: Date.now(),
                handled: 'REJECTED', // Will be updated
            };
            if (this.config.allowOverfills) {
                record.handled = 'ALLOWED';
                this.recordOverfill(record);
                if (this.config.alertOnOverfill) {
                    logger_1.default.warn("[OverfillProtection] Overfill ALLOWED for ".concat(orderId, ": ") +
                        "expected ".concat(remainingQty, ", received ").concat(fillQty, " (overfill: ").concat(potentialOverfill, ")"));
                }
                return {
                    allowed: true,
                    overfillQty: potentialOverfill,
                    reason: 'Overfill allowed by configuration',
                };
            }
            if (this.config.autoAdjust) {
                record.handled = 'ADJUSTED';
                this.recordOverfill(record);
                if (this.config.alertOnOverfill) {
                    logger_1.default.warn("[OverfillProtection] Overfill ADJUSTED for ".concat(orderId, ": ") +
                        "expected ".concat(remainingQty, ", adjusted to ").concat(remainingQty));
                }
                return {
                    allowed: true,
                    overfillQty: potentialOverfill,
                    reason: 'Overfill adjusted to expected quantity',
                    adjustedFill: {
                        qty: remainingQty,
                        px: fillPx,
                    },
                };
            }
            this.recordOverfill(record);
            logger_1.default.error("[OverfillProtection] Overfill REJECTED for ".concat(orderId, ": ") +
                "expected ".concat(remainingQty, ", received ").concat(fillQty, " (overfill: ").concat(potentialOverfill, ")"));
            return {
                allowed: false,
                overfillQty: potentialOverfill,
                reason: 'Overfill exceeds tolerance and is not allowed',
            };
        }
        return {
            allowed: true,
            overfillQty: 0,
            reason: 'OK',
        };
    };
    /**
     * Record a fill event
     */
    OverfillProtection.prototype.recordFill = function (fill) {
        // Check for duplicate fills
        var existingFill = this.fills.get(fill.fillId);
        if (existingFill) {
            logger_1.default.warn("[OverfillProtection] Duplicate fill detected: ".concat(fill.fillId));
            return;
        }
        this.fills.set(fill.fillId, fill);
        // Track fills per order
        var orderFills = this.orderFills.get(fill.orderId);
        if (orderFills) {
            orderFills.add(fill.fillId);
        }
        // Update order filled quantity
        var order = this.orders.get(fill.orderId);
        if (order) {
            order.filledQty += fill.fillQty;
            // Update average price
            var totalValue = (order.avgPx * (order.filledQty - fill.fillQty)) + (fill.fillPx * fill.fillQty);
            order.avgPx = totalValue / order.filledQty;
            // Update status if filled
            if (order.filledQty >= order.orderQty) {
                order.status = 'FILLED';
            }
        }
        logger_1.default.debug("[OverfillProtection] Recorded fill: ".concat(fill.fillId, ", ") +
            "qty: ".concat(fill.fillQty, ", px: ").concat(fill.fillPx));
    };
    /**
     * Check for duplicate fills
     */
    OverfillProtection.prototype.isDuplicateFill = function (fillId) {
        return this.fills.has(fillId);
    };
    /**
     * Check if fill matches expected order
     */
    OverfillProtection.prototype.validateFillForOrder = function (fill, orderId) {
        var order = this.orders.get(orderId);
        if (!order) {
            return { valid: false, reason: 'Order not found' };
        }
        if (fill.orderId !== orderId && fill.orderId !== order.venueOrderId) {
            return { valid: false, reason: 'Fill does not match order' };
        }
        if (fill.symbol !== order.symbol) {
            return { valid: false, reason: 'Symbol mismatch' };
        }
        if (fill.side !== order.side) {
            return { valid: false, reason: 'Side mismatch' };
        }
        return { valid: true };
    };
    /**
     * Get order state
     */
    OverfillProtection.prototype.getOrder = function (orderId) {
        return this.orders.get(orderId);
    };
    /**
     * Get all fills for an order
     */
    OverfillProtection.prototype.getOrderFills = function (orderId) {
        var fillIds = this.orderFills.get(orderId);
        if (!fillIds)
            return [];
        var fills = [];
        for (var _i = 0, fillIds_1 = fillIds; _i < fillIds_1.length; _i++) {
            var fillId = fillIds_1[_i];
            var fill = this.fills.get(fillId);
            if (fill) {
                fills.push(fill);
            }
        }
        return fills.sort(function (a, b) { return a.timestamp - b.timestamp; });
    };
    /**
     * Calculate expected position from fills
     */
    OverfillProtection.prototype.calculateExpectedPosition = function (orderId) {
        var fills = this.getOrderFills(orderId);
        var totalQty = 0;
        var totalValue = 0;
        for (var _i = 0, fills_1 = fills; _i < fills_1.length; _i++) {
            var fill = fills_1[_i];
            totalQty += fill.fillQty;
            totalValue += fill.fillPx * fill.fillQty;
        }
        return {
            totalQty: totalQty,
            avgPx: totalQty > 0 ? totalValue / totalQty : 0,
        };
    };
    /**
     * Remove an order from tracking (when fully processed)
     */
    OverfillProtection.prototype.removeOrder = function (orderId) {
        this.orders.delete(orderId);
        this.orderFills.delete(orderId);
        logger_1.default.debug("[OverfillProtection] Removed order: ".concat(orderId));
    };
    /**
     * Record an overfill event
     */
    OverfillProtection.prototype.recordOverfill = function (record) {
        this.overfillHistory.push(record);
        // Keep only last 1000 records
        if (this.overfillHistory.length > 1000) {
            this.overfillHistory.shift();
        }
    };
    /**
     * Get overfill history
     */
    OverfillProtection.prototype.getOverfillHistory = function (limit) {
        if (limit === void 0) { limit = 100; }
        return this.overfillHistory
            .slice(-limit)
            .sort(function (a, b) { return b.timestamp - a.timestamp; });
    };
    /**
     * Get overfill statistics
     */
    OverfillProtection.prototype.getStatistics = function () {
        var stats = {
            totalOverfills: this.overfillHistory.length,
            allowed: 0,
            adjusted: 0,
            rejected: 0,
            byOrder: new Map(),
        };
        for (var _i = 0, _a = this.overfillHistory; _i < _a.length; _i++) {
            var record = _a[_i];
            switch (record.handled) {
                case 'ALLOWED':
                    stats.allowed++;
                    break;
                case 'ADJUSTED':
                    stats.adjusted++;
                    break;
                case 'REJECTED':
                    stats.rejected++;
                    break;
            }
            var count = stats.byOrder.get(record.orderId) || 0;
            stats.byOrder.set(record.orderId, count + 1);
        }
        return stats;
    };
    /**
     * Clear old orders and fills
     */
    OverfillProtection.prototype.clear = function (maxAgeMs) {
        if (maxAgeMs === void 0) { maxAgeMs = 24 * 60 * 60 * 1000; }
        var cutoff = Date.now() - maxAgeMs;
        for (var _i = 0, _a = this.orders; _i < _a.length; _i++) {
            var _b = _a[_i], orderId = _b[0], order = _b[1];
            if (order.timestamp < cutoff && order.status === 'FILLED') {
                this.removeOrder(orderId);
            }
        }
    };
    /**
     * Reset all state
     */
    OverfillProtection.prototype.reset = function () {
        this.orders.clear();
        this.fills.clear();
        this.orderFills.clear();
        this.overfillHistory = [];
        logger_1.default.info('[OverfillProtection] Reset all state');
    };
    /**
     * Update configuration
     */
    OverfillProtection.prototype.updateConfig = function (config) {
        this.config = __assign(__assign({}, this.config), config);
        logger_1.default.info('[OverfillProtection] Config updated:', this.config);
    };
    return OverfillProtection;
}());
exports.OverfillProtection = OverfillProtection;
// Singleton instance
var overfillProtection = new OverfillProtection();
exports.default = overfillProtection;
