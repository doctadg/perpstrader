import { Position, Portfolio } from '../shared/types';
interface RecoveryAction {
    type: 'CLOSE' | 'REDUCE' | 'HEDGE' | 'WAIT' | 'ALERT';
    reason: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}
interface PositionIssue {
    position: Position;
    issue: string;
    action: RecoveryAction;
    detectedAt: Date;
}
/**
 * Position Recovery Service
 * Monitors and recovers problematic positions automatically
 */
export declare class PositionRecoveryService {
    private recoveryAttempts;
    private maxRecoveryAttempts;
    private monitoringInterval;
    private lastCheckTime;
    private issueHistory;
    private alertHistory;
    constructor();
    /**
     * Start monitoring positions for recovery
     */
    startMonitoring(intervalMs?: number): void;
    /**
     * Stop monitoring positions
     */
    stopMonitoring(): void;
    /**
     * Check all positions and perform recovery if needed
     */
    checkAndRecoverPositions(): Promise<void>;
    /**
     * Analyze positions for potential issues
     */
    analyzePositions(portfolio: Portfolio): Promise<PositionIssue[]>;
    /**
     * Check if position is orphaned (no associated strategy)
     */
    private isOrphanedPosition;
    /**
     * Check if position is stuck (no significant price movement)
     */
    private isStuckPosition;
    /**
     * Check if position is stale (open too long)
     */
    private isStalePosition;
    /**
     * Handle a position issue
     */
    private handlePositionIssue;
    /**
     * Close a position immediately
     */
    private closePosition;
    /**
     * Reduce position size by 50%
     */
    private reducePosition;
    /**
     * Hedge a position with opposite exposure
     */
    private hedgePosition;
    /**
     * Send alert about position issue
     */
    private sendAlert;
    /**
     * Manual recovery trigger for specific position
     */
    recoverPosition(symbol: string, side: 'LONG' | 'SHORT', action: 'CLOSE' | 'REDUCE'): Promise<boolean>;
    /**
     * Get recovery statistics
     */
    getStats(): {
        lastCheckTime: Date | null;
        recoveryAttempts: number;
        issueHistory: PositionIssue[];
        activeIssues: PositionIssue[];
    };
    /**
     * Reset recovery attempts for a position
     */
    resetRecoveryAttempts(symbol: string, side: 'LONG' | 'SHORT'): void;
    /**
     * Emergency close all positions
     */
    emergencyCloseAll(): Promise<void>;
}
declare const positionRecovery: PositionRecoveryService;
export default positionRecovery;
//# sourceMappingURL=position-recovery.d.ts.map