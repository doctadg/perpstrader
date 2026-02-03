"use strict";
/**
 * Order Reconciliation Service
 *
 * Inspired by Nautilus Trader's comprehensive reconciliation system.
 * Detects and corrects discrepancies between local state and venue state.
 *
 * Features:
 * - Position reconciliation with tolerance
 * - Fill simulation to calculate expected positions
 * - Zero-crossing detection for position flips
 * - Automatic adjustment generation
 * - Audit trail for all reconciliation actions
 */
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
exports.ReconciliationService = void 0;
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../shared/logger"));
const message_bus_1 = __importStar(require("../shared/message-bus"));
class ReconciliationService {
    config;
    reconciliationHistory = [];
    constructor(config = {}) {
        this.config = {
            tolerancePercent: config.tolerancePercent ?? 0.01, // 0.01% default
            autoApply: config.autoApply ?? false, // Manual by default for safety
            alertOnDiscrepancy: config.alertOnDiscrepancy ?? true,
            minDifference: config.minDifference ?? 0.0001,
        };
    }
    /**
     * Reconcile local positions with venue positions
     */
    async reconcilePositions(localPositions, venuePositions) {
        const results = [];
        const venueMap = new Map(venuePositions.map(p => [p.symbol, p]));
        let matched = 0;
        let discrepancies = 0;
        let adjustments = 0;
        // Check local positions against venue
        for (const local of localPositions) {
            const venue = venueMap.get(local.symbol);
            const result = this.reconcilePosition(local, venue);
            results.push(result);
            if (result.matched) {
                matched++;
            }
            else {
                discrepancies++;
                if (result.adjustment) {
                    adjustments++;
                    if (this.config.autoApply) {
                        await this.applyAdjustment(result.adjustment);
                    }
                }
            }
            // Remove matched position from map
            if (venue) {
                venueMap.delete(local.symbol);
            }
        }
        // Check for venue positions not in local state
        for (const venue of venueMap.values()) {
            const result = {
                matched: false,
                localState: {
                    symbol: venue.symbol,
                    side: 'LONG',
                    quantity: 0,
                    avgEntryPrice: 0,
                    unrealizedPnL: 0,
                    fills: [],
                },
                venueState: venue,
                discrepancy: {
                    type: 'GHOST_POSITION',
                    localValue: 0,
                    venueValue: venue.quantity,
                    difference: venue.quantity,
                    percentDiff: 100,
                },
                timestamp: Date.now(),
            };
            results.push(result);
            discrepancies++;
            if (this.config.alertOnDiscrepancy) {
                logger_1.default.warn(`[Reconciliation] Ghost position detected: ${venue.symbol} ` +
                    `qty: ${venue.quantity} (exists on venue but not locally)`);
                await message_bus_1.default.publish(message_bus_1.Channel.RISK_LIMIT_BREACH, {
                    type: 'GHOST_POSITION',
                    symbol: venue.symbol,
                    quantity: venue.quantity,
                });
            }
        }
        const report = {
            id: (0, uuid_1.v4)(),
            timestamp: Date.now(),
            totalPositions: localPositions.length + venueMap.size,
            matched,
            discrepancies,
            adjustments,
            results,
        };
        this.reconciliationHistory.push(report);
        // Keep only last 100 reports
        if (this.reconciliationHistory.length > 100) {
            this.reconciliationHistory.shift();
        }
        logger_1.default.info(`[Reconciliation] Completed: ${matched}/${report.totalPositions} matched, ` +
            `${discrepancies} discrepancies, ${adjustments} adjustments`);
        return report;
    }
    /**
     * Reconcile a single position
     */
    reconcilePosition(local, venue) {
        const timestamp = Date.now();
        // Position doesn't exist on venue
        if (!venue) {
            const result = {
                matched: Math.abs(local.quantity) < this.config.minDifference,
                localState: local,
                venueState: {
                    symbol: local.symbol,
                    side: 'LONG',
                    quantity: 0,
                    entryPrice: 0,
                    unrealizedPnL: 0,
                },
                discrepancy: {
                    type: 'MISSING_POSITION',
                    localValue: local.quantity,
                    venueValue: 0,
                    difference: local.quantity,
                    percentDiff: 100,
                },
                timestamp,
            };
            if (!result.matched && this.config.alertOnDiscrepancy) {
                logger_1.default.warn(`[Reconciliation] Missing position: ${local.symbol} ` +
                    `local: ${local.quantity}, venue: 0`);
            }
            return result;
        }
        // Check quantity match
        const qtyDiff = local.quantity - venue.quantity;
        const qtyTolerance = local.quantity * (this.config.tolerancePercent / 100);
        if (Math.abs(qtyDiff) > qtyTolerance && Math.abs(qtyDiff) > this.config.minDifference) {
            const discrepancy = {
                type: 'QUANTITY',
                localValue: local.quantity,
                venueValue: venue.quantity,
                difference: qtyDiff,
                percentDiff: (qtyDiff / local.quantity) * 100,
            };
            const adjustment = this.createQuantityAdjustment(local, venue);
            if (this.config.alertOnDiscrepancy) {
                logger_1.default.warn(`[Reconciliation] Quantity discrepancy: ${local.symbol} ` +
                    `local: ${local.quantity}, venue: ${venue.quantity}, diff: ${qtyDiff}`);
                message_bus_1.default.publish(message_bus_1.Channel.RISK_LIMIT_BREACH, {
                    type: 'QUANTITY_DISCREPANCY',
                    symbol: local.symbol,
                    localQuantity: local.quantity,
                    venueQuantity: venue.quantity,
                    difference: qtyDiff,
                });
            }
            return {
                matched: false,
                localState: local,
                venueState: venue,
                discrepancy,
                adjustment,
                timestamp,
            };
        }
        // Check side match
        if (local.side !== venue.side && local.quantity > 0 && venue.quantity > 0) {
            const discrepancy = {
                type: 'SIDE',
                localValue: local.side === 'LONG' ? 1 : -1,
                venueValue: venue.side === 'LONG' ? 1 : -1,
                difference: 2,
                percentDiff: 200,
            };
            if (this.config.alertOnDiscrepancy) {
                logger_1.default.error(`[Reconciliation] Side mismatch: ${local.symbol} ` +
                    `local: ${local.side}, venue: ${venue.side}`);
            }
            return {
                matched: false,
                localState: local,
                venueState: venue,
                discrepancy,
                adjustment: {
                    action: 'SYNC_POSITION',
                    details: {
                        symbol: local.symbol,
                        adjustmentQty: venue.quantity,
                        adjustmentPx: venue.entryPrice,
                        reason: 'Side mismatch - sync to venue',
                    },
                },
                timestamp,
            };
        }
        // All checks passed
        return {
            matched: true,
            localState: local,
            venueState: venue,
            timestamp,
        };
    }
    /**
     * Create adjustment for quantity discrepancy
     */
    createQuantityAdjustment(local, venue) {
        const diff = venue.quantity - local.quantity;
        // If difference is significant, sync to venue
        if (Math.abs(diff) > this.config.minDifference * 10) {
            return {
                action: 'SYNC_POSITION',
                details: {
                    symbol: local.symbol,
                    adjustmentQty: venue.quantity,
                    adjustmentPx: venue.entryPrice,
                    reason: `Large quantity discrepancy (${diff.toFixed(6)}) - sync to venue`,
                },
            };
        }
        // Otherwise, add synthetic fill
        return {
            action: 'ADD_FILL',
            details: {
                symbol: local.symbol,
                adjustmentQty: Math.abs(diff),
                adjustmentPx: venue.entryPrice,
                reason: `Quantity discrepancy (${diff.toFixed(6)}) - add synthetic fill`,
            },
        };
    }
    /**
     * Apply reconciliation adjustment
     */
    async applyAdjustment(adjustment) {
        logger_1.default.info(`[Reconciliation] Applying adjustment: ${adjustment.action}`, adjustment.details);
        // Publish adjustment event
        await message_bus_1.default.publish(message_bus_1.Channel.POSITION_UPDATED, {
            type: 'RECONCILIATION_ADJUSTMENT',
            action: adjustment.action,
            ...adjustment.details,
        });
        // Based on action type, perform adjustment
        switch (adjustment.action) {
            case 'ADD_FILL':
                await this.addSyntheticFill(adjustment.details);
                break;
            case 'SYNC_POSITION':
                await this.syncToVenue(adjustment.details);
                break;
            case 'ADJUST_POSITION':
                await this.adjustPosition(adjustment.details);
                break;
            case 'CLOSE_POSITION':
                await this.closePosition(adjustment.details);
                break;
        }
    }
    /**
     * Add a synthetic fill to reconcile discrepancy
     */
    async addSyntheticFill(details) {
        logger_1.default.info(`[Reconciliation] Adding synthetic fill: ${details.symbol} ` +
            `${details.adjustmentQty} @ ${details.adjustmentPx}`);
        // This would integrate with the data manager to record the fill
        // and update local position state accordingly
    }
    /**
     * Sync local position to venue state
     */
    async syncToVenue(details) {
        logger_1.default.info(`[Reconciliation] Syncing to venue: ${details.symbol} ` +
            `qty: ${details.adjustmentQty} @ ${details.adjustmentPx}`);
        // Update local state to match venue
    }
    /**
     * Adjust position quantity
     */
    async adjustPosition(details) {
        logger_1.default.info(`[Reconciliation] Adjusting position: ${details.symbol} ` +
            `qty: ${details.adjustmentQty} @ ${details.adjustmentPx}`);
    }
    /**
     * Close a position
     */
    async closePosition(details) {
        logger_1.default.info(`[Reconciliation] Closing position: ${details.symbol}`);
    }
    /**
     * Simulate position from fills (for reconciliation)
     */
    simulatePositionFromFills(fills) {
        if (fills.length === 0) {
            return { quantity: 0, avgPrice: 0, side: 'LONG', zeroCrossings: 0 };
        }
        let quantity = 0;
        let totalValue = 0;
        let zeroCrossings = 0;
        let lastSide = null;
        // Sort fills by timestamp
        const sortedFills = [...fills].sort((a, b) => a.timestamp - b.timestamp);
        for (const fill of sortedFills) {
            const signedQty = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
            const newQuantity = quantity + signedQty;
            // Track value for average price calculation
            if (quantity >= 0 && newQuantity >= 0) {
                // Adding to long or reducing long
                totalValue += fill.price * fill.quantity * (fill.side === 'BUY' ? 1 : -1);
            }
            else if (quantity <= 0 && newQuantity <= 0) {
                // Adding to short or reducing short
                totalValue += fill.price * fill.quantity * (fill.side === 'SELL' ? 1 : -1);
            }
            else {
                // Position flip - close previous position and open new one
                // This is a simplified calculation
                totalValue = fill.price * Math.abs(newQuantity);
                zeroCrossings++;
            }
            quantity = newQuantity;
            // Track side
            const currentSide = quantity >= 0 ? 'LONG' : 'SHORT';
            if (lastSide && lastSide !== currentSide) {
                zeroCrossings++;
            }
            lastSide = currentSide;
        }
        return {
            quantity: Math.abs(quantity),
            avgPrice: quantity !== 0 ? totalValue / Math.abs(quantity) : 0,
            side: quantity >= 0 ? 'LONG' : 'SHORT',
            zeroCrossings,
        };
    }
    /**
     * Detect zero crossings in position history
     */
    detectZeroCrossings(fills) {
        const crossings = [];
        let runningQty = 0;
        const sortedFills = [...fills].sort((a, b) => a.timestamp - b.timestamp);
        for (const fill of sortedFills) {
            const signedQty = fill.side === 'BUY' ? fill.quantity : -fill.quantity;
            const newQty = runningQty + signedQty;
            // Check if sign changed (zero crossing)
            if (Math.sign(runningQty) !== Math.sign(newQty) && runningQty !== 0 && newQty !== 0) {
                crossings.push(fill.timestamp);
            }
            runningQty = newQty;
        }
        return crossings;
    }
    /**
     * Get reconciliation history
     */
    getHistory(limit = 10) {
        return this.reconciliationHistory.slice(-limit);
    }
    /**
     * Get reconciliation statistics
     */
    getStatistics() {
        const history = this.reconciliationHistory;
        return {
            totalReconciliations: history.length,
            totalPositions: history.reduce((sum, r) => sum + r.totalPositions, 0),
            totalMatched: history.reduce((sum, r) => sum + r.matched, 0),
            totalDiscrepancies: history.reduce((sum, r) => sum + r.discrepancies, 0),
            totalAdjustments: history.reduce((sum, r) => sum + r.adjustments, 0),
            matchRate: history.reduce((sum, r) => sum + r.totalPositions, 0) > 0
                ? history.reduce((sum, r) => sum + r.matched, 0) /
                    history.reduce((sum, r) => sum + r.totalPositions, 0)
                : 1,
        };
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        logger_1.default.info('[Reconciliation] Config updated:', this.config);
    }
    /**
     * Clear history
     */
    clearHistory() {
        this.reconciliationHistory = [];
        logger_1.default.info('[Reconciliation] History cleared');
    }
}
exports.ReconciliationService = ReconciliationService;
// Singleton instance
const reconciliationService = new ReconciliationService();
exports.default = reconciliationService;
//# sourceMappingURL=reconciliation-service.js.map