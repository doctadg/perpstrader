export interface AnomalyConfig {
    spikeThreshold: number;
    dropThreshold: number;
    velocityThreshold: number;
    minHistoryPoints: number;
    windowSize: number;
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
declare class AnomalyDetector {
    private static readonly DEFAULT_CONFIG;
    /**
     * Detect heat anomalies using z-score analysis
     */
    static detectHeatAnomalies(clusterId: string, heatHistory: Array<{
        timestamp: Date;
        heatScore: number;
        velocity?: number;
    }>, config?: Partial<AnomalyConfig>): HeatAnomaly[];
    /**
     * Detect cross-syndication events
     * Occurs when similar events appear in multiple categories simultaneously
     */
    static detectCrossSyndication(clusters: Array<{
        id: string;
        category: string;
        topicKey: string;
        heatScore: number;
        updatedAt: Date;
    }>): CrossSyndicationEvent[];
    /**
     * Detect emerging trend acceleration
     * Identifies clusters with accelerating velocity
     */
    static detectAcceleration(heatHistory: Array<{
        timestamp: Date;
        heatScore: number;
        velocity?: number;
    }>, minAcceleration?: number): boolean;
    /**
     * Detect pattern anomalies (unusual heat patterns)
     */
    static detectPatternAnomalies(heatHistory: Array<{
        timestamp: Date;
        heatScore: number;
    }>): string[];
    /**
     * Calculate mean of array
     */
    private static calculateMean;
    /**
     * Calculate standard deviation
     */
    private static calculateStdDev;
    /**
     * Get severity level from z-score
     */
    private static getSeverity;
    /**
     * Generate anomaly alert message
     */
    static generateAlert(anomaly: HeatAnomaly): string;
}
export default AnomalyDetector;
//# sourceMappingURL=anomaly-detector.d.ts.map