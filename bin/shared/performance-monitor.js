"use strict";
/**
 * Performance Monitor
 * Tracks and reports system performance metrics
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performanceMonitor = exports.PerformanceMonitor = void 0;
const logger_1 = __importDefault(require("./logger"));
class PerformanceMonitor {
    activeMetrics = new Map();
    completedMetrics = [];
    snapshots = [];
    maxCompletedMetrics = 10000;
    maxSnapshots = 100;
    /**
     * Start timing a metric
     */
    start(name, metadata) {
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
    end(id) {
        const metric = this.activeMetrics.get(id);
        if (!metric)
            return null;
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
    async measure(name, fn, metadata) {
        const id = this.start(name, metadata);
        try {
            const result = await fn();
            const metric = this.end(id);
            if (metric) {
                logger_1.default.debug(`[Performance] ${name}: ${metric.duration?.toFixed(2)}ms`);
            }
            return result;
        }
        catch (error) {
            this.end(id);
            throw error;
        }
    }
    /**
     * Measure sync function
     */
    measureSync(name, fn, metadata) {
        const id = this.start(name, metadata);
        try {
            const result = fn();
            const metric = this.end(id);
            if (metric) {
                logger_1.default.debug(`[Performance] ${name}: ${metric.duration?.toFixed(2)}ms`);
            }
            return result;
        }
        catch (error) {
            this.end(id);
            throw error;
        }
    }
    /**
     * Create a performance snapshot
     */
    createSnapshot() {
        const metricsByName = {};
        for (const metric of this.completedMetrics) {
            if (!metric.duration)
                continue;
            if (!metricsByName[metric.name]) {
                metricsByName[metric.name] = [];
            }
            metricsByName[metric.name].push(metric.duration);
        }
        const snapshot = {
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
    getReport() {
        const snapshot = this.createSnapshot();
        const recentMetrics = {};
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
    getMetricsByName(name, limit = 100) {
        return this.completedMetrics
            .filter(m => m.name === name)
            .slice(-limit);
    }
    /**
     * Get average duration for a metric
     */
    getAverageDuration(name) {
        const metrics = this.getMetricsByName(name);
        if (metrics.length === 0)
            return 0;
        const total = metrics.reduce((sum, m) => sum + (m.duration || 0), 0);
        return total / metrics.length;
    }
    /**
     * Clear all metrics
     */
    clear() {
        this.activeMetrics.clear();
        this.completedMetrics = [];
        this.snapshots = [];
    }
    /**
     * Log performance summary
     */
    logSummary() {
        const report = this.getReport();
        logger_1.default.info('╔══════════════════════════════════════════════════════════╗');
        logger_1.default.info('║              PERFORMANCE SUMMARY                         ║');
        logger_1.default.info('╠══════════════════════════════════════════════════════════╣');
        logger_1.default.info(`║ Active metrics:    ${report.activeMetrics.toString().padEnd(37)}║`);
        logger_1.default.info(`║ Completed metrics: ${report.completedMetrics.toString().padEnd(37)}║`);
        logger_1.default.info(`║ Snapshots:         ${report.snapshots.toString().padEnd(37)}║`);
        logger_1.default.info('╠══════════════════════════════════════════════════════════╣');
        for (const [name, stats] of Object.entries(report.recentMetrics)) {
            logger_1.default.info(`║ ${name.padEnd(20)} avg: ${stats.avgMs.toFixed(2).padStart(8)}ms (${stats.count.toString().padStart(4)} calls) ║`);
        }
        logger_1.default.info('╚══════════════════════════════════════════════════════════╝');
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
// Singleton instance
exports.performanceMonitor = new PerformanceMonitor();
exports.default = exports.performanceMonitor;
//# sourceMappingURL=performance-monitor.js.map