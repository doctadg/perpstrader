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
export interface OrderState {
    orderId: string;
    clientOrderId: string;
    venueOrderId?: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    orderQty: number;
    filledQty: number;
    avgPx: number;
    status: 'PENDING' | 'OPEN' | 'FILLED' | 'CANCELED' | 'REJECTED';
    timestamp: number;
}
export interface FillEvent {
    fillId: string;
    orderId: string;
    venueOrderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    fillQty: number;
    fillPx: number;
    timestamp: number;
}
export interface OverfillCheckResult {
    allowed: boolean;
    overfillQty: number;
    reason: string;
    adjustedFill?: {
        qty: number;
        px: number;
    };
}
export interface OverfillConfig {
    /** Whether to allow overfills with logging */
    allowOverfills: boolean;
    /** Tolerance as percentage of order quantity (0.0001 = 0.01%) */
    tolerancePercent: number;
    /** Whether to automatically adjust fills */
    autoAdjust: boolean;
    /** Whether to alert on overfill detection */
    alertOnOverfill: boolean;
}
export interface OverfillRecord {
    id: string;
    orderId: string;
    overfillQty: number;
    expectedQty: number;
    receivedQty: number;
    timestamp: number;
    handled: 'ALLOWED' | 'ADJUSTED' | 'REJECTED';
}
export declare class OverfillProtection {
    private config;
    private orders;
    private fills;
    private overfillHistory;
    private orderFills;
    constructor(config?: Partial<OverfillConfig>);
    /**
     * Register an order for tracking
     */
    registerOrder(order: OrderState): void;
    /**
     * Check if a fill would cause an overfill
     */
    checkFill(orderId: string, fillQty: number, fillPx: number): OverfillCheckResult;
    /**
     * Record a fill event
     */
    recordFill(fill: FillEvent): void;
    /**
     * Check for duplicate fills
     */
    isDuplicateFill(fillId: string): boolean;
    /**
     * Check if fill matches expected order
     */
    validateFillForOrder(fill: FillEvent, orderId: string): {
        valid: boolean;
        reason?: string;
    };
    /**
     * Get order state
     */
    getOrder(orderId: string): OrderState | undefined;
    /**
     * Get all fills for an order
     */
    getOrderFills(orderId: string): FillEvent[];
    /**
     * Calculate expected position from fills
     */
    calculateExpectedPosition(orderId: string): {
        totalQty: number;
        avgPx: number;
    };
    /**
     * Remove an order from tracking (when fully processed)
     */
    removeOrder(orderId: string): void;
    /**
     * Record an overfill event
     */
    private recordOverfill;
    /**
     * Get overfill history
     */
    getOverfillHistory(limit?: number): OverfillRecord[];
    /**
     * Get overfill statistics
     */
    getStatistics(): {
        totalOverfills: number;
        allowed: number;
        adjusted: number;
        rejected: number;
        byOrder: Map<string, number>;
    };
    /**
     * Clear old orders and fills
     */
    clear(maxAgeMs?: number): void;
    /**
     * Reset all state
     */
    reset(): void;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<OverfillConfig>): void;
}
declare const overfillProtection: OverfillProtection;
export default overfillProtection;
//# sourceMappingURL=overfill-protection.d.ts.map