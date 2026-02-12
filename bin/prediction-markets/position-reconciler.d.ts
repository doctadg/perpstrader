import { PredictionPosition } from '../../shared/types';
interface ReconciliationResult {
    timestamp: number;
    discrepancies: PositionDiscrepancy[];
    orphanedPositions: PredictionPosition[];
    stalePositions: PredictionPosition[];
    synced: boolean;
}
interface PositionDiscrepancy {
    position: PredictionPosition;
    actualShares: number;
    expectedShares: number;
    difference: number;
    severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
}
declare class PositionReconciler {
    private lastReconciliation;
    private reconciliationInterval;
    private isRunning;
    private discrepanciesFound;
    constructor();
    /**
     * Perform full position reconciliation
     * Should be called periodically (every 5 minutes) and before/after trades
     */
    reconcile(): Promise<ReconciliationResult>;
    /**
     * Fetch positions from on-chain (Polymarket CLOB API)
     * NOTE: This is a placeholder - real implementation needs wallet integration
     */
    private fetchOnChainPositions;
    private findDiscrepancies;
    private findOrphanedPositions;
    private findStalePositions;
    private normalizeStatus;
    private cleanupOrphanedPositions;
    private handleCriticalDiscrepancy;
    private logReconciliation;
    private getLastResult;
    /**
     * Start automatic reconciliation loop
     */
    startAutoReconciliation(): void;
    /**
     * Force immediate reconciliation
     */
    forceReconcile(): Promise<ReconciliationResult>;
    /**
     * Emergency close all positions
     * Used when risk limits are hit or system shutdown
     */
    emergencyCloseAll(): Promise<{
        closed: number;
        failed: number;
        positions: PredictionPosition[];
    }>;
    getHealth(): {
        healthy: boolean;
        lastReconciliation: number;
        minutesSinceReconciliation: number;
        discrepanciesFound: number;
        autoReconciliationEnabled: boolean;
    };
}
declare const positionReconciler: PositionReconciler;
export default positionReconciler;
//# sourceMappingURL=position-reconciler.d.ts.map