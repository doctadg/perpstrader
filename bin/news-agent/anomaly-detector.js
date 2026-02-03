"use strict";
// Anomaly Detection Service
// Detects unusual patterns in cluster heat and behavior
// Supports ENHANCEMENT 9: Anomaly Detection
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = __importDefault(require("../shared/logger"));
class AnomalyDetector {
    static DEFAULT_CONFIG = {
        spikeThreshold: 3.0,
        dropThreshold: -3.0,
        velocityThreshold: 2.0,
        minHistoryPoints: 5,
        windowSize: 10
    };
    /**
     * Detect heat anomalies using z-score analysis
     */
    static detectHeatAnomalies(clusterId, heatHistory, config = {}) {
        const fullConfig = { ...AnomalyDetector.DEFAULT_CONFIG, ...config };
        const anomalies = [];
        if (heatHistory.length < fullConfig.minHistoryPoints) {
            logger_1.default.debug(`[AnomalyDetector] Insufficient history for cluster ${clusterId}: ${heatHistory.length} < ${fullConfig.minHistoryPoints}`);
            return anomalies;
        }
        // Use rolling window for recent data
        const window = heatHistory.slice(0, fullConfig.windowSize);
        const heats = window.map(h => h.heatScore);
        // Calculate statistics
        const mean = AnomalyDetector.calculateMean(heats);
        const stdDev = AnomalyDetector.calculateStdDev(heats, mean);
        if (stdDev < 0.1) {
            logger_1.default.debug(`[AnomalyDetector] Low variance for cluster ${clusterId}, skipping anomaly detection`);
            return anomalies;
        }
        const currentHeat = heats[0];
        const zScore = (currentHeat - mean) / stdDev;
        // Detect spike
        if (zScore >= fullConfig.spikeThreshold) {
            anomalies.push({
                clusterId,
                type: 'SUDDEN_SPIKE',
                severity: AnomalyDetector.getSeverity(zScore),
                zScore,
                currentValue: currentHeat,
                expectedRange: [mean - (fullConfig.spikeThreshold * stdDev), mean + (fullConfig.spikeThreshold * stdDev)],
                detectedAt: new Date(),
                description: `Heat spike detected: ${currentHeat.toFixed(1)} is ${zScore.toFixed(1)}σ above mean ${mean.toFixed(1)}`
            });
        }
        // Detect drop
        else if (zScore <= fullConfig.dropThreshold) {
            anomalies.push({
                clusterId,
                type: 'SUDDEN_DROP',
                severity: AnomalyDetector.getSeverity(Math.abs(zScore)),
                zScore,
                currentValue: currentHeat,
                expectedRange: [mean + (fullConfig.dropThreshold * stdDev), mean - (fullConfig.dropThreshold * stdDev)],
                detectedAt: new Date(),
                description: `Heat drop detected: ${currentHeat.toFixed(1)} is ${Math.abs(zScore).toFixed(1)}σ below mean ${mean.toFixed(1)}`
            });
        }
        // Detect velocity anomalies
        const velocities = window.filter(h => h.velocity !== undefined).map(h => h.velocity);
        if (velocities.length >= fullConfig.minHistoryPoints) {
            const currentVelocity = velocities[0];
            const vMean = AnomalyDetector.calculateMean(velocities);
            const vStdDev = AnomalyDetector.calculateStdDev(velocities, vMean);
            if (vStdDev > 0) {
                const velocityZ = (currentVelocity - vMean) / vStdDev;
                if (Math.abs(velocityZ) >= fullConfig.velocityThreshold) {
                    anomalies.push({
                        clusterId,
                        type: 'VELOCITY_ANOMALY',
                        severity: AnomalyDetector.getSeverity(Math.abs(velocityZ)),
                        zScore: velocityZ,
                        currentValue: currentHeat,
                        expectedRange: [mean - 2 * stdDev, mean + 2 * stdDev],
                        detectedAt: new Date(),
                        description: `Velocity anomaly: ${currentVelocity.toFixed(1)}/hr is ${velocityZ.toFixed(1)}σ from mean ${vMean.toFixed(1)}/hr`
                    });
                }
            }
        }
        return anomalies;
    }
    /**
     * Detect cross-syndication events
     * Occurs when similar events appear in multiple categories simultaneously
     */
    static detectCrossSyndication(clusters) {
        const events = [];
        // Group clusters by topic key (case-insensitive)
        const topicGroups = new Map();
        for (const cluster of clusters) {
            const key = cluster.topicKey?.toLowerCase() || '';
            if (!topicGroups.has(key)) {
                topicGroups.set(key, []);
            }
            topicGroups.get(key).push({
                id: cluster.id,
                category: cluster.category,
                heat: cluster.heatScore
            });
        }
        // Find topic keys appearing in multiple categories
        for (const [topicKey, clusterList] of topicGroups) {
            if (clusterList.length < 2)
                continue;
            const categories = new Set(clusterList.map(c => c.category));
            if (categories.size > 1) {
                // Cross-category syndication detected
                const hottest = clusterList.reduce((max, c) => c.heat > max.heat ? c : max, clusterList[0]);
                events.push({
                    sourceClusterId: hottest.id,
                    sourceCategory: hottest.category,
                    targetClusters: clusterList.filter(c => c.id !== hottest.id),
                    eventTime: new Date()
                });
            }
        }
        return events;
    }
    /**
     * Detect emerging trend acceleration
     * Identifies clusters with accelerating velocity
     */
    static detectAcceleration(heatHistory, minAcceleration = 2.0) {
        if (heatHistory.length < 5)
            return false;
        const recentVelocity = heatHistory[0].velocity;
        const avgVelocity = heatHistory
            .filter(h => h.velocity !== undefined)
            .map(h => h.velocity)
            .reduce((a, b) => a + b, 0) / heatHistory.length;
        const acceleration = recentVelocity ? (recentVelocity - avgVelocity) : 0;
        return acceleration >= minAcceleration;
    }
    /**
     * Detect pattern anomalies (unusual heat patterns)
     */
    static detectPatternAnomalies(heatHistory) {
        const patterns = [];
        if (heatHistory.length < 10)
            return patterns;
        const heats = heatHistory.map(h => h.heatScore);
        // Check for oscillation (rapid up-down pattern)
        let directionChanges = 0;
        for (let i = 1; i < heats.length - 1; i++) {
            const prev = heats[i] - heats[i + 1];
            const curr = heats[i - 1] - heats[i];
            if (prev * curr < 0) {
                directionChanges++;
            }
        }
        if (directionChanges > heats.length * 0.6) {
            patterns.push('OSCILLATING_HEAT');
        }
        // Check for step pattern (sudden jump then flat)
        const jumpThreshold = Math.max(...heats) * 0.3;
        for (let i = 1; i < heats.length; i++) {
            const jump = Math.abs(heats[i - 1] - heats[i]);
            if (jump > jumpThreshold) {
                // Check if heat stays flat after jump
                const afterJump = heats.slice(0, i);
                const variance = AnomalyDetector.calculateStdDev(afterJump, AnomalyDetector.calculateMean(afterJump));
                if (variance < jumpThreshold * 0.1) {
                    patterns.push('STEP_PATTERN');
                    break;
                }
            }
        }
        // Check for linear decay (constant downward trend)
        let upwardCount = 0;
        let downwardCount = 0;
        for (let i = 1; i < heats.length; i++) {
            if (heats[i - 1] < heats[i]) {
                upwardCount++;
            }
            else if (heats[i - 1] > heats[i]) {
                downwardCount++;
            }
        }
        if (downwardCount > upwardCount * 2) {
            patterns.push('LINEAR_DECAY');
        }
        else if (upwardCount > downwardCount * 2) {
            patterns.push('LINEAR_GROWTH');
        }
        return patterns;
    }
    /**
     * Calculate mean of array
     */
    static calculateMean(values) {
        return values.reduce((a, b) => a + b, 0) / values.length;
    }
    /**
     * Calculate standard deviation
     */
    static calculateStdDev(values, mean) {
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
    }
    /**
     * Get severity level from z-score
     */
    static getSeverity(zScore) {
        const absZ = Math.abs(zScore);
        if (absZ < 2)
            return 'LOW';
        if (absZ < 3)
            return 'MEDIUM';
        if (absZ < 4)
            return 'HIGH';
        return 'CRITICAL';
    }
    /**
     * Generate anomaly alert message
     */
    static generateAlert(anomaly) {
        const severityEmoji = {
            LOW: '⚠️',
            MEDIUM: '🔶',
            HIGH: '🔴',
            CRITICAL: '🚨'
        };
        const prefix = severityEmoji[anomaly.severity];
        switch (anomaly.type) {
            case 'SUDDEN_SPIKE':
                return `${prefix} Heat spike: ${anomaly.currentValue.toFixed(1)} is ${anomaly.zScore.toFixed(1)}σ above normal`;
            case 'SUDDEN_DROP':
                return `${prefix} Heat drop: ${anomaly.currentValue.toFixed(1)} is ${Math.abs(anomaly.zScore).toFixed(1)}σ below normal`;
            case 'VELOCITY_ANOMALY':
                return `${prefix} Unusual velocity: ${anomaly.description}`;
            case 'CROSS_SYNDICATION':
                return `${prefix} Cross-category event detected: "${anomaly.description}"`;
            default:
                return `${prefix} Anomaly: ${anomaly.description}`;
        }
    }
}
exports.default = AnomalyDetector;
//# sourceMappingURL=anomaly-detector.js.map