/**
 * Performance Monitor
 * Tracks and reports system performance metrics
 */
interface PerformanceMetric {
    name: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    metadata?: Record<string, any>;
}
interface PerformanceSnapshot {
    timestamp: number;
    metrics: Record<string, {
        count: number;
        totalDuration: number;
        avgDuration: number;
        minDuration: number;
        maxDuration: number;
    }>;
}
export declare class PerformanceMonitor {
    private activeMetrics;
    private completedMetrics;
    private snapshots;
    private maxCompletedMetrics;
    private maxSnapshots;
    /**
     * Start timing a metric
     */
    start(name: string, metadata?: Record<string, any>): string;
    /**
     * End timing a metric
     */
    end(id: string): PerformanceMetric | null;
    /**
     * Measure a function execution time
     */
    measure<T>(name: string, fn: () => Promise<T>, metadata?: Record<string, any>): Promise<T>;
    /**
     * Measure sync function
     */
    measureSync<T>(name: string, fn: () => T, metadata?: Record<string, any>): T;
    /**
     * Create a performance snapshot
     */
    createSnapshot(): PerformanceSnapshot;
    /**
     * Get performance report
     */
    getReport(): {
        activeMetrics: number;
        completedMetrics: number;
        snapshots: number;
        recentMetrics: Record<string, {
            count: number;
            avgMs: number;
            minMs: number;
            maxMs: number;
        }>;
    };
    /**
     * Get metrics by name
     */
    getMetricsByName(name: string, limit?: number): PerformanceMetric[];
    /**
     * Get average duration for a metric
     */
    getAverageDuration(name: string): number;
    /**
     * Clear all metrics
     */
    clear(): void;
    /**
     * Log performance summary
     */
    logSummary(): void;
}
export declare const performanceMonitor: PerformanceMonitor;
export default performanceMonitor;
//# sourceMappingURL=performance-monitor.d.ts.map