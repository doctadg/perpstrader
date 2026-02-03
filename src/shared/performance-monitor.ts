/**
 * Performance Monitor
 * Tracks and reports system performance metrics
 */

import logger from './logger';

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

export class PerformanceMonitor {
    private activeMetrics: Map<string, PerformanceMetric> = new Map();
    private completedMetrics: PerformanceMetric[] = [];
    private snapshots: PerformanceSnapshot[] = [];
    private maxCompletedMetrics: number = 10000;
    private maxSnapshots: number = 100;

    /**
     * Start timing a metric
     */
    start(name: string, metadata?: Record<string, any>): string {
        const id = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.activeMetrics.set(id, {
            name,
            startTime: performance.now(),
            metadata
        });
        return id;
    }

    /**
     * End timing a metric
     */
    end(id: string): PerformanceMetric | null {
        const metric = this.activeMetrics.get(id);
        if (!metric) return null;

        metric.endTime = performance.now();
        metric.duration = metric.endTime - metric.startTime;

        this.activeMetrics.delete(id);
        this.completedMetrics.push(metric);

        // Trim completed metrics if needed
        if (this.completedMetrics.length > this.maxCompletedMetrics) {
            this.completedMetrics = this.completedMetrics.slice(-this.maxCompletedMetrics * 0.8);
        }

        return metric;
    }

    /**
     * Measure a function execution time
     */
    async measure<T>(
        name: string,
        fn: () => Promise<T>,
        metadata?: Record<string, any>
    ): Promise<T> {
        const id = this.start(name, metadata);
        try {
            const result = await fn();
            const metric = this.end(id);
            if (metric) {
                logger.debug(`[Performance] ${name}: ${metric.duration?.toFixed(2)}ms`);
            }
            return result;
        } catch (error) {
            this.end(id);
            throw error;
        }
    }

    /**
     * Measure sync function
     */
    measureSync<T>(name: string, fn: () => T, metadata?: Record<string, any>): T {
        const id = this.start(name, metadata);
        try {
            const result = fn();
            const metric = this.end(id);
            if (metric) {
                logger.debug(`[Performance] ${name}: ${metric.duration?.toFixed(2)}ms`);
            }
            return result;
        } catch (error) {
            this.end(id);
            throw error;
        }
    }

    /**
     * Create a performance snapshot
     */
    createSnapshot(): PerformanceSnapshot {
        const metricsByName: Record<string, number[]> = {};

        for (const metric of this.completedMetrics) {
            if (!metric.duration) continue;
            if (!metricsByName[metric.name]) {
                metricsByName[metric.name] = [];
            }
            metricsByName[metric.name].push(metric.duration);
        }

        const snapshot: PerformanceSnapshot = {
            timestamp: Date.now(),
            metrics: {}
        };

        for (const [name, durations] of Object.entries(metricsByName)) {
            const total = durations.reduce((a, b) => a + b, 0);
            snapshot.metrics[name] = {
                count: durations.length,
                totalDuration: total,
                avgDuration: total / durations.length,
                minDuration: Math.min(...durations),
                maxDuration: Math.max(...durations)
            };
        }

        this.snapshots.push(snapshot);

        // Trim snapshots
        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots = this.snapshots.slice(-this.maxSnapshots * 0.8);
        }

        return snapshot;
    }

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
    } {
        const snapshot = this.createSnapshot();

        const recentMetrics: Record<string, any> = {};
        for (const [name, stats] of Object.entries(snapshot.metrics)) {
            recentMetrics[name] = {
                count: stats.count,
                avgMs: parseFloat(stats.avgDuration.toFixed(2)),
                minMs: parseFloat(stats.minDuration.toFixed(2)),
                maxMs: parseFloat(stats.maxDuration.toFixed(2))
            };
        }

        return {
            activeMetrics: this.activeMetrics.size,
            completedMetrics: this.completedMetrics.length,
            snapshots: this.snapshots.length,
            recentMetrics
        };
    }

    /**
     * Get metrics by name
     */
    getMetricsByName(name: string, limit: number = 100): PerformanceMetric[] {
        return this.completedMetrics
            .filter(m => m.name === name)
            .slice(-limit);
    }

    /**
     * Get average duration for a metric
     */
    getAverageDuration(name: string): number {
        const metrics = this.getMetricsByName(name);
        if (metrics.length === 0) return 0;

        const total = metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
        return total / metrics.length;
    }

    /**
     * Clear all metrics
     */
    clear(): void {
        this.activeMetrics.clear();
        this.completedMetrics = [];
        this.snapshots = [];
    }

    /**
     * Log performance summary
     */
    logSummary(): void {
        const report = this.getReport();

        logger.info('╔══════════════════════════════════════════════════════════╗');
        logger.info('║              PERFORMANCE SUMMARY                         ║');
        logger.info('╠══════════════════════════════════════════════════════════╣');
        logger.info(`║ Active metrics:    ${report.activeMetrics.toString().padEnd(37)}║`);
        logger.info(`║ Completed metrics: ${report.completedMetrics.toString().padEnd(37)}║`);
        logger.info(`║ Snapshots:         ${report.snapshots.toString().padEnd(37)}║`);
        logger.info('╠══════════════════════════════════════════════════════════╣');

        for (const [name, stats] of Object.entries(report.recentMetrics)) {
            logger.info(`║ ${name.padEnd(20)} avg: ${stats.avgMs.toFixed(2).padStart(8)}ms (${stats.count.toString().padStart(4)} calls) ║`);
        }

        logger.info('╚══════════════════════════════════════════════════════════╝');
    }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;
