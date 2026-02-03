// Anomaly Detection Service
// Detects unusual patterns in cluster heat and behavior
// Supports ENHANCEMENT 9: Anomaly Detection

import logger from '../shared/logger';

export interface AnomalyConfig {
    spikeThreshold: number;        // Z-score threshold for spike detection
    dropThreshold: number;         // Z-score threshold for drop detection
    velocityThreshold: number;      // Threshold for velocity anomaly
    minHistoryPoints: number;      // Minimum data points for detection
    windowSize: number;           // Size of rolling window for analysis
}

export interface HeatAnomaly {
    clusterId: string;
    type: 'SUDDEN_SPIKE' | 'SUDDEN_DROP' | 'VELOCITY_ANOMALY' | 'CROSS_SYNDICATION';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    zScore: number;
    currentValue: number;
    expectedRange: [number, number];
    detectedAt: Date;
    description: string;
}

export interface CrossSyndicationEvent {
    sourceClusterId: string;
    sourceCategory: string;
    targetClusters: Array<{
        clusterId: string;
        category: string;
        similarity: number;
    }>;
    eventTime: Date;
}

class AnomalyDetector {
    private static readonly DEFAULT_CONFIG: AnomalyConfig = {
        spikeThreshold: 3.0,
        dropThreshold: -3.0,
        velocityThreshold: 2.0,
        minHistoryPoints: 5,
        windowSize: 10
    };

    /**
     * Detect heat anomalies using z-score analysis
     */
    static detectHeatAnomalies(
        clusterId: string,
        heatHistory: Array<{ timestamp: Date; heatScore: number; velocity?: number }>,
        config: Partial<AnomalyConfig> = {}
    ): HeatAnomaly[] {
        const fullConfig = { ...AnomalyDetector.DEFAULT_CONFIG, ...config };
        const anomalies: HeatAnomaly[] = [];

        if (heatHistory.length < fullConfig.minHistoryPoints) {
            logger.debug(`[AnomalyDetector] Insufficient history for cluster ${clusterId}: ${heatHistory.length} < ${fullConfig.minHistoryPoints}`);
            return anomalies;
        }

        // Use rolling window for recent data
        const window = heatHistory.slice(0, fullConfig.windowSize);
        const heats = window.map(h => h.heatScore);

        // Calculate statistics
        const mean = AnomalyDetector.calculateMean(heats);
        const stdDev = AnomalyDetector.calculateStdDev(heats, mean);

        if (stdDev < 0.1) {
            logger.debug(`[AnomalyDetector] Low variance for cluster ${clusterId}, skipping anomaly detection`);
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
        const velocities = window.filter(h => h.velocity !== undefined).map(h => h.velocity as number);
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
    static detectCrossSyndication(
        clusters: Array<{
            id: string;
            category: string;
            topicKey: string;
            heatScore: number;
            updatedAt: Date;
        }>
    ): CrossSyndicationEvent[] {
        const events: CrossSyndicationEvent[] = [];

        // Group clusters by topic key (case-insensitive)
        const topicGroups = new Map<string, Array<{ id: string; category: string; heat: number }>>();

        for (const cluster of clusters) {
            const key = cluster.topicKey?.toLowerCase() || '';

            if (!topicGroups.has(key)) {
                topicGroups.set(key, []);
            }

            topicGroups.get(key)!.push({
                id: cluster.id,
                category: cluster.category,
                heat: cluster.heatScore
            });
        }

        // Find topic keys appearing in multiple categories
        for (const [topicKey, clusterList] of topicGroups) {
            if (clusterList.length < 2) continue;

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
    static detectAcceleration(
        heatHistory: Array<{ timestamp: Date; heatScore: number; velocity?: number }>,
        minAcceleration: number = 2.0
    ): boolean {
        if (heatHistory.length < 5) return false;

        const recentVelocity = heatHistory[0].velocity;
        const avgVelocity = heatHistory
            .filter(h => h.velocity !== undefined)
            .map(h => h.velocity as number)
            .reduce((a, b) => a + b, 0) / heatHistory.length;

        const acceleration = recentVelocity ? (recentVelocity - avgVelocity) : 0;

        return acceleration >= minAcceleration;
    }

    /**
     * Detect pattern anomalies (unusual heat patterns)
     */
    static detectPatternAnomalies(
        heatHistory: Array<{ timestamp: Date; heatScore: number }>
    ): string[] {
        const patterns: string[] = [];

        if (heatHistory.length < 10) return patterns;

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
            } else if (heats[i - 1] > heats[i]) {
                downwardCount++;
            }
        }

        if (downwardCount > upwardCount * 2) {
            patterns.push('LINEAR_DECAY');
        } else if (upwardCount > downwardCount * 2) {
            patterns.push('LINEAR_GROWTH');
        }

        return patterns;
    }

    /**
     * Calculate mean of array
     */
    private static calculateMean(values: number[]): number {
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    /**
     * Calculate standard deviation
     */
    private static calculateStdDev(values: number[], mean: number): number {
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
    }

    /**
     * Get severity level from z-score
     */
    private static getSeverity(zScore: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
        const absZ = Math.abs(zScore);

        if (absZ < 2) return 'LOW';
        if (absZ < 3) return 'MEDIUM';
        if (absZ < 4) return 'HIGH';
        return 'CRITICAL';
    }

    /**
     * Generate anomaly alert message
     */
    static generateAlert(anomaly: HeatAnomaly): string {
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

export default AnomalyDetector;
