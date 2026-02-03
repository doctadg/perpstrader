/**
 * Anomaly Detector Unit Tests
 * Tests for ENHANCEMENT 9: Anomaly Detection
 */

import AnomalyDetector, { HeatAnomaly, AnomalyConfig, CrossSyndicationEvent } from '../../src/news-agent/anomaly-detector';

describe('AnomalyDetector', () => {

    describe('detectHeatAnomalies - Spike Detection', () => {

        it('should detect spike when z-score > 3', () => {
            const clusterId = 'cluster-1';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 10 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 11 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 10.5 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 11.5 },
                { timestamp: now, heatScore: 50 }, // Sudden spike (z-score > 3)
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            expect(anomalies.length).toBeGreaterThan(0);
            expect(anomalies[0].type).toBe('SUDDEN_SPIKE');
            expect(anomalies[0].clusterId).toBe(clusterId);
            expect(anomalies[0].severity).toMatch(/^(MEDIUM|HIGH|CRITICAL)$/);
            expect(anomalies[0].zScore).toBeGreaterThan(3);
        });

        it('should not detect spike for normal variation', () => {
            const clusterId = 'cluster-2';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 10 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 11 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 9.5 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 10.5 },
                { timestamp: now, heatScore: 12 }, // Normal variation
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            expect(anomalies.length).toBe(0);
        });

        it('should use custom spike threshold when provided', () => {
            const clusterId = 'cluster-3';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 10 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 10.5 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 9.5 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 10 },
                { timestamp: now, heatScore: 25 }, // Moderate spike
            ];

            // Default threshold (3.0) won't detect this
            const anomaliesDefault = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);
            expect(anomaliesDefault.length).toBe(0);

            // Lower threshold (2.0) should detect it
            const anomaliesCustom = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory, {
                spikeThreshold: 2.0
            });
            expect(anomaliesCustom.length).toBeGreaterThan(0);
            expect(anomaliesCustom[0].type).toBe('SUDDEN_SPIKE');
        });

        it('should calculate correct expected range for spike', () => {
            const clusterId = 'cluster-4';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 20 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 21 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 20.5 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 21.5 },
                { timestamp: now, heatScore: 100 }, // Large spike
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            expect(anomalies.length).toBeGreaterThan(0);
            const expectedRange = anomalies[0].expectedRange;
            expect(expectedRange[0]).toBeLessThan(expectedRange[1]); // Min < Max
            expect(anomalies[0].currentValue).toBeGreaterThan(expectedRange[1]); // Above max
        });

        it('should set CRITICAL severity for very high z-score (>4)', () => {
            const clusterId = 'cluster-critical';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 10 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 10.5 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 9.5 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 10 },
                { timestamp: now, heatScore: 100 }, // Extreme spike
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            expect(anomalies.length).toBeGreaterThan(0);
            if (anomalies[0].zScore >= 4) {
                expect(anomalies[0].severity).toBe('CRITICAL');
            }
        });
    });

    describe('detectHeatAnomalies - Drop Detection', () => {

        it('should detect drop when z-score < -3', () => {
            const clusterId = 'cluster-drop';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 100 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 95 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 105 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 98 },
                { timestamp: now, heatScore: 10 }, // Sudden drop
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            expect(anomalies.length).toBeGreaterThan(0);
            expect(anomalies[0].type).toBe('SUDDEN_DROP');
            expect(anomalies[0].zScore).toBeLessThan(-3);
        });

        it('should not detect drop for normal variation', () => {
            const clusterId = 'cluster-drop-normal';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 50 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 52 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 48 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 51 },
                { timestamp: now, heatScore: 47 }, // Normal variation
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            expect(anomalies.length).toBe(0);
        });

        it('should use custom drop threshold when provided', () => {
            const clusterId = 'cluster-drop-custom';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 50 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 52 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 48 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 51 },
                { timestamp: now, heatScore: 35 }, // Moderate drop
            ];

            // Default threshold won't detect
            const anomaliesDefault = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);
            expect(anomaliesDefault.length).toBe(0);

            // Custom threshold will detect
            const anomaliesCustom = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory, {
                dropThreshold: -2.0
            });
            expect(anomaliesCustom.length).toBeGreaterThan(0);
            expect(anomaliesCustom[0].type).toBe('SUDDEN_DROP');
        });

        it('should calculate correct expected range for drop', () => {
            const clusterId = 'cluster-drop-range';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 100 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 105 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 98 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 102 },
                { timestamp: now, heatScore: 15 }, // Large drop
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            expect(anomalies.length).toBeGreaterThan(0);
            const expectedRange = anomalies[0].expectedRange;
            expect(anomalies[0].currentValue).toBeLessThan(expectedRange[0]); // Below min
        });
    });

    describe('detectHeatAnomalies - Velocity Anomalies', () => {

        it('should detect velocity anomalies', () => {
            const clusterId = 'cluster-velocity';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 10, velocity: 0.5 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 11, velocity: 1.0 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 10.5, velocity: -0.5 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 11.5, velocity: 1.0 },
                { timestamp: now, heatScore: 20, velocity: 8.5 }, // Velocity anomaly
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            const velocityAnomalies = anomalies.filter(a => a.type === 'VELOCITY_ANOMALY');
            expect(velocityAnomalies.length).toBeGreaterThan(0);
        });

        it('should detect sudden changes in velocity', () => {
            const clusterId = 'cluster-velocity-change';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 50, velocity: 0.1 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 50.2, velocity: 0.2 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 50.1, velocity: -0.1 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 50.3, velocity: 0.2 },
                { timestamp: now, heatScore: 60, velocity: 9.7 }, // Massive velocity jump
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            const velocityAnomalies = anomalies.filter(a => a.type === 'VELOCITY_ANOMALY');
            expect(velocityAnomalies.length).toBeGreaterThan(0);
        });

        it('should use custom velocity threshold when provided', () => {
            const clusterId = 'cluster-velocity-custom';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 50, velocity: 1.0 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 51, velocity: 1.0 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 50.5, velocity: -0.5 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 51.5, velocity: 1.0 },
                { timestamp: now, heatScore: 55, velocity: 3.5 }, // Moderate velocity
            ];

            // Default threshold won't detect
            const anomaliesDefault = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);
            const velocityDefault = anomaliesDefault.filter(a => a.type === 'VELOCITY_ANOMALY');
            expect(velocityDefault.length).toBe(0);

            // Lower threshold will detect
            const anomaliesCustom = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory, {
                velocityThreshold: 1.5
            });
            const velocityCustom = anomaliesCustom.filter(a => a.type === 'VELOCITY_ANOMALY');
            expect(velocityCustom.length).toBeGreaterThan(0);
        });
    });

    describe('detectCrossSyndication', () => {

        it('should detect cross-category syndication', () => {
            const clusters = [
                { id: 'cluster-1', category: 'CRYPTO', topicKey: 'bitcoin', heatScore: 80, updatedAt: new Date() },
                { id: 'cluster-2', category: 'STOCKS', topicKey: 'bitcoin', heatScore: 60, updatedAt: new Date() },
                { id: 'cluster-3', category: 'GEOPOLITICS', topicKey: 'regulation', heatScore: 40, updatedAt: new Date() },
            ];

            const events = AnomalyDetector.detectCrossSyndication(clusters);

            expect(events.length).toBeGreaterThan(0);
            expect(events[0].sourceClusterId).toBe('cluster-1');
            expect(events[0].sourceCategory).toBe('CRYPTO');
            expect(events[0].targetClusters.length).toBeGreaterThan(0);
            expect(events[0].targetClusters[0].clusterId).toBe('cluster-2');
        });

        it('should not detect syndication for single category', () => {
            const clusters = [
                { id: 'cluster-1', category: 'CRYPTO', topicKey: 'bitcoin', heatScore: 80, updatedAt: new Date() },
                { id: 'cluster-2', category: 'CRYPTO', topicKey: 'ethereum', heatScore: 60, updatedAt: new Date() },
            ];

            const events = AnomalyDetector.detectCrossSyndication(clusters);

            expect(events.length).toBe(0);
        });

        it('should handle case-insensitive topic matching', () => {
            const clusters = [
                { id: 'cluster-1', category: 'CRYPTO', topicKey: 'Bitcoin', heatScore: 80, updatedAt: new Date() },
                { id: 'cluster-2', category: 'STOCKS', topicKey: 'BITCOIN', heatScore: 60, updatedAt: new Date() },
                { id: 'cluster-3', category: 'GEOPOLITICS', topicKey: 'bitcoin', heatScore: 40, updatedAt: new Date() },
            ];

            const events = AnomalyDetector.detectCrossSyndication(clusters);

            expect(events.length).toBeGreaterThan(0);
            expect(events[0].targetClusters.length).toBeGreaterThanOrEqual(1);
        });

        it('should select hottest cluster as source', () => {
            const clusters = [
                { id: 'cluster-low', category: 'CRYPTO', topicKey: 'bitcoin', heatScore: 40, updatedAt: new Date() },
                { id: 'cluster-high', category: 'STOCKS', topicKey: 'bitcoin', heatScore: 90, updatedAt: new Date() },
                { id: 'cluster-medium', category: 'GEOPOLITICS', topicKey: 'bitcoin', heatScore: 60, updatedAt: new Date() },
            ];

            const events = AnomalyDetector.detectCrossSyndication(clusters);

            expect(events.length).toBeGreaterThan(0);
            expect(events[0].sourceClusterId).toBe('cluster-high');
        });

        it('should handle empty clusters array', () => {
            const events = AnomalyDetector.detectCrossSyndication([]);
            expect(events).toEqual([]);
        });

        it('should handle missing topic keys', () => {
            const clusters = [
                { id: 'cluster-1', category: 'CRYPTO', topicKey: 'bitcoin', heatScore: 80, updatedAt: new Date() },
                { id: 'cluster-2', category: 'STOCKS', topicKey: undefined as any, heatScore: 60, updatedAt: new Date() },
            ];

            const events = AnomalyDetector.detectCrossSyndication(clusters);
            expect(events.length).toBe(0);
        });
    });

    describe('detectAcceleration', () => {

        it('should detect accelerating clusters', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 10, velocity: 0.5 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 10.5, velocity: 0.5 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 11, velocity: 0.5 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 12, velocity: 1.0 },
                { timestamp: now, heatScore: 15, velocity: 3.0 }, // Accelerating
            ];

            const isAccelerating = AnomalyDetector.detectAcceleration(heatHistory, 1.5);

            expect(isAccelerating).toBe(true);
        });

        it('should not detect acceleration for steady velocity', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 10, velocity: 1.0 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 11, velocity: 1.0 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 12, velocity: 1.0 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 13, velocity: 1.0 },
                { timestamp: now, heatScore: 14, velocity: 1.0 }, // Steady
            ];

            const isAccelerating = AnomalyDetector.detectAcceleration(heatHistory);

            expect(isAccelerating).toBe(false);
        });

        it('should require minimum data points', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 1000), heatScore: 10, velocity: 5.0 },
                { timestamp: now, heatScore: 20, velocity: 10.0 },
            ];

            const isAccelerating = AnomalyDetector.detectAcceleration(heatHistory);
            expect(isAccelerating).toBe(false);
        });

        it('should handle missing velocities', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 10 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 11 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 12 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 13 },
                { timestamp: now, heatScore: 14 },
            ];

            const isAccelerating = AnomalyDetector.detectAcceleration(heatHistory);
            expect(isAccelerating).toBe(false);
        });
    });

    describe('detectPatternAnomalies', () => {

        it('should detect oscillating heat pattern', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 9000), heatScore: 50 },
                { timestamp: new Date(now.getTime() - 8000), heatScore: 70 },
                { timestamp: new Date(now.getTime() - 7000), heatScore: 45 },
                { timestamp: new Date(now.getTime() - 6000), heatScore: 75 },
                { timestamp: new Date(now.getTime() - 5000), heatScore: 40 },
                { timestamp: new Date(now.getTime() - 4000), heatScore: 80 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 35 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 85 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 30 },
                { timestamp: now, heatScore: 90 },
            ];

            const patterns = AnomalyDetector.detectPatternAnomalies(heatHistory);

            expect(patterns).toContain('OSCILLATING_HEAT');
        });

        it('should detect step pattern', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 50 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 51 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 50.5 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 51 },
                { timestamp: now, heatScore: 100 }, // Jump
            ];

            const patterns = AnomalyDetector.detectPatternAnomalies(heatHistory);

            expect(patterns).toContain('STEP_PATTERN');
        });

        it('should detect linear decay pattern', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 9000), heatScore: 100 },
                { timestamp: new Date(now.getTime() - 8000), heatScore: 90 },
                { timestamp: new Date(now.getTime() - 7000), heatScore: 80 },
                { timestamp: new Date(now.getTime() - 6000), heatScore: 70 },
                { timestamp: new Date(now.getTime() - 5000), heatScore: 60 },
                { timestamp: new Date(now.getTime() - 4000), heatScore: 50 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 40 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 30 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 20 },
                { timestamp: now, heatScore: 10 },
            ];

            const patterns = AnomalyDetector.detectPatternAnomalies(heatHistory);

            expect(patterns).toContain('LINEAR_DECAY');
        });

        it('should detect linear growth pattern', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 9000), heatScore: 10 },
                { timestamp: new Date(now.getTime() - 8000), heatScore: 20 },
                { timestamp: new Date(now.getTime() - 7000), heatScore: 30 },
                { timestamp: new Date(now.getTime() - 6000), heatScore: 40 },
                { timestamp: new Date(now.getTime() - 5000), heatScore: 50 },
                { timestamp: new Date(now.getTime() - 4000), heatScore: 60 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 70 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 80 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 90 },
                { timestamp: now, heatScore: 100 },
            ];

            const patterns = AnomalyDetector.detectPatternAnomalies(heatHistory);

            expect(patterns).toContain('LINEAR_GROWTH');
        });

        it('should return empty array for insufficient data', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 1000), heatScore: 50 },
                { timestamp: now, heatScore: 51 },
            ];

            const patterns = AnomalyDetector.detectPatternAnomalies(heatHistory);

            expect(patterns).toEqual([]);
        });
    });

    describe('generateAlert', () => {

        it('should generate alert for SUDDEN_SPIKE', () => {
            const anomaly: HeatAnomaly = {
                clusterId: 'cluster-1',
                type: 'SUDDEN_SPIKE',
                severity: 'HIGH',
                zScore: 3.5,
                currentValue: 50,
                expectedRange: [10, 25],
                detectedAt: new Date(),
                description: 'Heat spike detected'
            };

            const alert = AnomalyDetector.generateAlert(anomaly);

            expect(alert).toContain('🔴');
            expect(alert).toContain('spike');
            expect(alert).toContain('3.5σ');
        });

        it('should generate alert for SUDDEN_DROP', () => {
            const anomaly: HeatAnomaly = {
                clusterId: 'cluster-1',
                type: 'SUDDEN_DROP',
                severity: 'MEDIUM',
                zScore: -3.2,
                currentValue: 10,
                expectedRange: [25, 40],
                detectedAt: new Date(),
                description: 'Heat drop detected'
            };

            const alert = AnomalyDetector.generateAlert(anomaly);

            expect(alert).toContain('🔶');
            expect(alert).toContain('drop');
            expect(alert).toContain('3.2σ');
        });

        it('should use CRITICAL emoji for CRITICAL severity', () => {
            const anomaly: HeatAnomaly = {
                clusterId: 'cluster-1',
                type: 'SUDDEN_SPIKE',
                severity: 'CRITICAL',
                zScore: 5.0,
                currentValue: 100,
                expectedRange: [10, 25],
                detectedAt: new Date(),
                description: 'Critical spike'
            };

            const alert = AnomalyDetector.generateAlert(anomaly);

            expect(alert).toContain('🚨');
        });

        it('should use warning emoji for LOW severity', () => {
            const anomaly: HeatAnomaly = {
                clusterId: 'cluster-1',
                type: 'SUDDEN_SPIKE',
                severity: 'LOW',
                zScore: 1.5,
                currentValue: 30,
                expectedRange: [10, 25],
                detectedAt: new Date(),
                description: 'Minor spike'
            };

            const alert = AnomalyDetector.generateAlert(anomaly);

            expect(alert).toContain('⚠️');
        });
    });

    describe('Edge Cases', () => {

        it('should handle empty heat history', () => {
            const anomalies = AnomalyDetector.detectHeatAnomalies('cluster-empty', []);
            expect(anomalies).toEqual([]);
        });

        it('should handle insufficient history points', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 1000), heatScore: 10 },
                { timestamp: now, heatScore: 50 },
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies('cluster-insufficient', heatHistory);
            expect(anomalies).toEqual([]);
        });

        it('should handle zero variance in heat history', () => {
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: 50 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: 50 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: 50 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: 50 },
                { timestamp: now, heatScore: 50 },
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies('cluster-no-variance', heatHistory);
            expect(anomalies).toEqual([]);
        });

        it('should handle negative heat scores', () => {
            const clusterId = 'cluster-negative';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 4000), heatScore: -10 },
                { timestamp: new Date(now.getTime() - 3000), heatScore: -11 },
                { timestamp: new Date(now.getTime() - 2000), heatScore: -9 },
                { timestamp: new Date(now.getTime() - 1000), heatScore: -10 },
                { timestamp: now, heatScore: 20 },
            ];

            const anomalies = AnomalyDetector.detectHeatAnomalies(clusterId, heatHistory);

            // Should still detect the jump from negative to positive
            expect(anomalies.length).toBeGreaterThan(0);
        });
    });
});
