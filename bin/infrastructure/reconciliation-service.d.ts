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
export interface LocalPositionState {
    symbol: string;
    side: 'LONG' | 'SHORT';
    quantity: number;
    avgEntryPrice: number;
    unrealizedPnL: number;
    fills: Fill[];
}
export interface VenuePositionState {
    symbol: string;
    side: 'LONG' | 'SHORT';
    quantity: number;
    entryPrice: number;
    unrealizedPnL: number;
    venueOrderId?: string;
}
export interface Fill {
    fillId: string;
    orderId: string;
    venueOrderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    timestamp: number;
    commission?: number;
}
export interface ReconciliationResult {
    matched: boolean;
    localState: LocalPositionState;
    venueState: VenuePositionState;
    discrepancy?: Discrepancy;
    adjustment?: ReconciliationAdjustment;
    timestamp: number;
}
export interface Discrepancy {
    type: 'QUANTITY' | 'PRICE' | 'SIDE' | 'MISSING_POSITION' | 'GHOST_POSITION';
    localValue: number;
    venueValue: number;
    difference: number;
    percentDiff: number;
}
export interface ReconciliationAdjustment {
    action: 'ADD_FILL' | 'ADJUST_POSITION' | 'SYNC_POSITION' | 'CLOSE_POSITION';
    details: {
        symbol: string;
        adjustmentQty: number;
        adjustmentPx: number;
        reason: string;
    };
}
export interface ReconciliationConfig {
    /** Tolerance as percentage of position (0.0001 = 0.01%) */
    tolerancePercent: number;
    /** Whether to automatically apply adjustments */
    autoApply: boolean;
    /** Whether to alert on discrepancies */
    alertOnDiscrepancy: boolean;
    /** Minimum absolute difference to trigger reconciliation */
    minDifference: number;
}
export interface ReconciliationReport {
    id: string;
    timestamp: number;
    totalPositions: number;
    matched: number;
    discrepancies: number;
    adjustments: number;
    results: ReconciliationResult[];
}
export declare class ReconciliationService {
    private config;
    private reconciliationHistory;
    constructor(config?: Partial<ReconciliationConfig>);
    /**
     * Reconcile local positions with venue positions
     */
    reconcilePositions(localPositions: LocalPositionState[], venuePositions: VenuePositionState[]): Promise<ReconciliationReport>;
    /**
     * Reconcile a single position
     */
    reconcilePosition(local: LocalPositionState, venue: VenuePositionState | undefined): ReconciliationResult;
    /**
     * Create adjustment for quantity discrepancy
     */
    private createQuantityAdjustment;
    /**
     * Apply reconciliation adjustment
     */
    applyAdjustment(adjustment: ReconciliationAdjustment): Promise<void>;
    /**
     * Add a synthetic fill to reconcile discrepancy
     */
    private addSyntheticFill;
    /**
     * Sync local position to venue state
     */
    private syncToVenue;
    /**
     * Adjust position quantity
     */
    private adjustPosition;
    /**
     * Close a position
     */
    private closePosition;
    /**
     * Simulate position from fills (for reconciliation)
     */
    simulatePositionFromFills(fills: Fill[]): {
        quantity: number;
        avgPrice: number;
        side: 'LONG' | 'SHORT';
        zeroCrossings: number;
    };
    /**
     * Detect zero crossings in position history
     */
    detectZeroCrossings(fills: Fill[]): number[];
    /**
     * Get reconciliation history
     */
    getHistory(limit?: number): ReconciliationReport[];
    /**
     * Get reconciliation statistics
     */
    getStatistics(): {
        totalReconciliations: number;
        totalPositions: number;
        totalMatched: number;
        totalDiscrepancies: number;
        totalAdjustments: number;
        matchRate: number;
    };
    /**
     * Update configuration
     */
    updateConfig(config: Partial<ReconciliationConfig>): void;
    /**
     * Clear history
     */
    clearHistory(): void;
}
declare const reconciliationService: ReconciliationService;
export default reconciliationService;
//# sourceMappingURL=reconciliation-service.d.ts.map