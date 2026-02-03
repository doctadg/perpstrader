/**
 * Optimized Position Recovery Service
 * Performance improvements:
 * - Parallel position analysis
 * - Connection pooling for API calls
 * - Caching of position data
 * - Batched recovery operations
 * - Debounced alerts
 */
import { Position } from '../shared/types';
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
 * Optimized Position Recovery Service
 * Monitors and recovers problematic positions automatically
 */
export declare class OptimizedPositionRecoveryService {
    private recoveryAttempts;
    private maxRecoveryAttempts;
    private monitoringInterval;
    private lastCheckTime;
    private issueHistory;
    private alertHistory;
    private cache;
    private readonly CACHE_TTL_MS;
    private recentAlerts;
    private readonly ALERT_DEDUP_MS;
    private pendingCloses;
    private pendingReductions;
    private batchTimeout;
    private readonly BATCH_INTERVAL_MS;
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
     * Check all positions and perform recovery if needed (parallelized)
     */
    checkAndRecoverPositions(): Promise<void>;
    /**
     * Fetch position data with caching
     */
    private fetchPositionData;
    /**
     * Analyze a single position for issues
     */
    private analyzePosition;
    /**
     * Queue a recovery action for batching
     */
    private queueRecoveryAction;
    /**
     * Flush pending batch operations
     */
    private flushPendingBatches;
    /**
     * Check if alert should be deduplicated
     */
    private shouldDedupeAlert;
    /**
     * Close a position immediately
     */
    private closePosition;
    /**
     * Reduce position size by 50%
     */
    private reducePosition;
    /**
     * Send alert about position issue (debounced)
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
        pendingBatches: {
            closes: number;
            reductions: number;
        };
    };
    /**
     * Reset recovery attempts for a position
     */
    resetRecoveryAttempts(symbol: string, side: 'LONG' | 'SHORT'): void;
    /**
     * Clear caches (call when external data changes)
     */
    clearCache(): void;
    /**
     * Emergency close all positions
     */
    emergencyCloseAll(): Promise<void>;
}
declare const optimizedPositionRecovery: OptimizedPositionRecoveryService;
export default optimizedPositionRecovery;
//# sourceMappingURL=position-recovery-optimized.d.ts.map