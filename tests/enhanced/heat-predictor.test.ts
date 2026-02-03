/**
 * Heat Predictor Unit Tests
 * Tests for ENHANCEMENT 6: Predictive Scoring
 */

import HeatPredictor, { HeatPrediction, HeatPredictionConfig } from '../../src/news-agent/heat-predictor';

describe('HeatPredictor', () => {

    describe('predictHeat', () => {

        it('should return null for insufficient history', () => {
            const clusterId = 'cluster-1';
            const now = new Date();
            const heatHistory = [
                { timestamp: new Date(now.getTime() - 1000), heatScore: 10 },
                { timestamp: now, heatScore: 11 },
            ];

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).toBeNull();
        });

        it('should generate predictions with required fields', () => {
            const clusterId = 'cluster-2';
            const now = new Date();
            const heatHistory = generateHistory(25, 50); // 25 points around 50

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.clusterId).toBe(clusterId);
                expect(prediction.predictions).toBeDefined();
                expect(prediction.trajectory).toBeDefined();
                expect(prediction.confidence).toBeGreaterThan(0);
                expect(prediction.confidence).toBeLessThanOrEqual(1);
                expect(prediction.predictedAt).toBeInstanceOf(Date);
                expect(prediction.factors).toBeDefined();
            }
        });

        it('should generate predictions for multiple time horizons', () => {
            const clusterId = 'cluster-3';
            const heatHistory = generateHistory(25, 50);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory, {
                forecastHorizon: [1, 6, 24, 48]
            });

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.predictions.length).toBe(4);
                expect(prediction.predictions[0].hoursAhead).toBe(1);
                expect(prediction.predictions[1].hoursAhead).toBe(6);
                expect(prediction.predictions[2].hoursAhead).toBe(24);
                expect(prediction.predictions[3].hoursAhead).toBe(48);
            }
        });

        it('should predict higher confidence for shorter horizons', () => {
            const clusterId = 'cluster-4';
            const heatHistory = generateHistory(30, 50);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                const p1h = prediction.predictions.find(p => p.hoursAhead === 1);
                const p24h = prediction.predictions.find(p => p.hoursAhead === 24);

                expect(p1h).toBeDefined();
                expect(p24h).toBeDefined();
                if (p1h && p24h) {
                    expect(p1h.confidence).toBeGreaterThan(p24h.confidence);
                }
            }
        });

        it('should ensure predictions are non-negative', () => {
            const clusterId = 'cluster-5';
            const heatHistory = generateHistory(25, 10); // Low starting heat

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                prediction.predictions.forEach(p => {
                    expect(p.predictedHeat).toBeGreaterThanOrEqual(0);
                    expect(p.lowerBound).toBeGreaterThanOrEqual(0);
                });
            }
        });

        it('should include upper and lower bounds', () => {
            const clusterId = 'cluster-6';
            const heatHistory = generateHistory(25, 50);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                prediction.predictions.forEach(p => {
                    expect(p.upperBound).toBeDefined();
                    expect(p.lowerBound).toBeDefined();
                    expect(p.upperBound).toBeGreaterThanOrEqual(p.predictedHeat);
                    expect(p.lowerBound).toBeLessThanOrEqual(p.predictedHeat);
                });
            }
        });
    });

    describe('Confidence Calculation', () => {

        it('should decrease confidence with higher volatility', () => {
            const clusterId = 'cluster-volatile';
            const stableHistory = generateHistory(25, 50, 5);   // Low variance
            const volatileHistory = generateHistory(25, 50, 30); // High variance

            const stablePrediction = HeatPredictor.predictHeat(clusterId + '-stable', stableHistory);
            const volatilePrediction = HeatPredictor.predictHeat(clusterId + '-volatile', volatileHistory);

            expect(stablePrediction).not.toBeNull();
            expect(volatilePrediction).not.toBeNull();
            if (stablePrediction && volatilePrediction) {
                // Same horizon for fair comparison
                const sP1h = stablePrediction.predictions.find(p => p.hoursAhead === 1);
                const vP1h = volatilePrediction.predictions.find(p => p.hoursAhead === 1);

                if (sP1h && vP1h) {
                    expect(sP1h.confidence).toBeGreaterThan(vP1h.confidence);
                }
            }
        });

        it('should decrease confidence over time', () => {
            const clusterId = 'cluster-time-decay';
            const heatHistory = generateHistory(30, 50);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                const p1h = prediction.predictions.find(p => p.hoursAhead === 1);
                const p6h = prediction.predictions.find(p => p.hoursAhead === 6);
                const p24h = prediction.predictions.find(p => p.hoursAhead === 24);

                if (p1h && p6h && p24h) {
                    expect(p1h.confidence).toBeGreaterThan(p6h.confidence);
                    expect(p6h.confidence).toBeGreaterThan(p24h.confidence);
                }
            }
        });

        it('should increase confidence with more data points', () => {
            const clusterId = 'cluster-data-points';
            const shortHistory = generateHistory(25, 50);
            const longHistory = generateHistory(50, 50);

            const shortPrediction = HeatPredictor.predictHeat(clusterId + '-short', shortHistory);
            const longPrediction = HeatPredictor.predictHeat(clusterId + '-long', longHistory);

            expect(shortPrediction).not.toBeNull();
            expect(longPrediction).not.toBeNull();
            if (shortPrediction && longPrediction) {
                expect(longPrediction.confidence).toBeGreaterThanOrEqual(shortPrediction.confidence);
            }
        });

        it('should ensure confidence is between 0 and 1', () => {
            const clusterId = 'cluster-confidence-bounds';
            const heatHistory = generateHistory(30, 50);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.confidence).toBeGreaterThanOrEqual(0);
                expect(prediction.confidence).toBeLessThanOrEqual(1);

                prediction.predictions.forEach(p => {
                    expect(p.confidence).toBeGreaterThanOrEqual(0);
                    expect(p.confidence).toBeLessThanOrEqual(1);
                });
            }
        });
    });

    describe('Trajectory Determination', () => {

        it('should detect SPIKING trajectory', () => {
            const clusterId = 'cluster-spiking';
            const heatHistory = generateGrowingHistory(25, 10, 50, 2); // Fast growth

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.trajectory).toBe('SPIKING');
            }
        });

        it('should detect CRASHING trajectory', () => {
            const clusterId = 'cluster-crashing';
            const heatHistory = generateDecayingHistory(25, 100, 10, 2); // Fast decay

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.trajectory).toBe('CRASHING');
            }
        });

        it('should detect GROWING trajectory', () => {
            const clusterId = 'cluster-growing';
            const heatHistory = generateGrowingHistory(25, 40, 50, 0.5); // Moderate growth

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.trajectory).toBe('GROWING');
            }
        });

        it('should detect DECAYING trajectory', () => {
            const clusterId = 'cluster-decaying';
            const heatHistory = generateDecayingHistory(25, 60, 40, 0.5); // Moderate decay

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.trajectory).toBe('DECAYING');
            }
        });

        it('should detect STABLE trajectory', () => {
            const clusterId = 'cluster-stable';
            const heatHistory = generateHistory(25, 50, 2); // Low variance, stable

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.trajectory).toBe('STABLE');
            }
        });

        it('should handle edge cases for trajectory', () => {
            const clusterId = 'cluster-edge';
            const heatHistory = generateHistory(25, 1); // Very low heat

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(['STABLE', 'GROWING', 'DECAYING']).toContain(prediction.trajectory);
            }
        });
    });

    describe('Lifecycle Stage Classification', () => {

        it('should classify EMERGING lifecycle stage', () => {
            const clusterId = 'cluster-emerging';
            const heatHistory = [
                ...generateGrowingHistory(15, 10, 20, 1), // Recent growth
                ...generateHistory(10, 5, 2) // Low historical
            ].reverse();

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.factors.stageOfLifecycle).toBe('EMERGING');
            }
        });

        it('should classify PEAK lifecycle stage', () => {
            const clusterId = 'cluster-peak';
            const heatHistory = [
                generateHistory(1, 100)[0], // At peak
                ...generateHistory(15, 90, 5), // Near peak
                ...generateGrowingHistory(10, 10, 90, 2) // Growth to peak
            ].reverse();

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(['PEAK', 'SUSTAINED']).toContain(prediction.factors.stageOfLifecycle);
            }
        });

        it('should classify DECAYING lifecycle stage', () => {
            const clusterId = 'cluster-lifecycle-decay';
            const heatHistory = generateDecayingHistory(25, 100, 30, 1);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.factors.stageOfLifecycle).toBe('DECAYING');
            }
        });

        it('should classify SUSTAINED lifecycle stage', () => {
            const clusterId = 'cluster-sustained';
            const heatHistory = generateHistory(25, 80, 3); // High, stable

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(['SUSTAINED', 'GROWING']).toContain(prediction.factors.stageOfLifecycle);
            }
        });
    });

    describe('Prediction Factors', () => {

        it('should calculate trend direction correctly', () => {
            const clusterId = 'cluster-trend-up';
            const heatHistory = generateGrowingHistory(25, 10, 50, 1);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.factors.trendDirection).toBeGreaterThan(0);
            }
        });

        it('should detect negative trend', () => {
            const clusterId = 'cluster-trend-down';
            const heatHistory = generateDecayingHistory(25, 100, 10, 1);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.factors.trendDirection).toBeLessThan(0);
            }
        });

        it('should normalize trend direction to -1 to 1', () => {
            const clusterId = 'cluster-trend-normalized';
            const heatHistory = generateGrowingHistory(30, 10, 100, 2);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.factors.trendDirection).toBeGreaterThan(-1);
                expect(prediction.factors.trendDirection).toBeLessThan(1);
            }
        });

        it('should calculate volatility', () => {
            const clusterId = 'cluster-volatility';
            const heatHistory = generateHistory(25, 50, 15); // High variance

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.factors.volatility).toBeGreaterThan(0);
            }
        });

        it('should calculate momentum', () => {
            const clusterId = 'cluster-momentum';
            const heatHistory = generateGrowingHistory(25, 10, 50, 1);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.factors.momentum).toBeGreaterThan(0);
            }
        });

        it('should detect negative momentum', () => {
            const clusterId = 'cluster-negative-momentum';
            const heatHistory = generateDecayingHistory(25, 100, 10, 1);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.factors.momentum).toBeLessThan(0);
            }
        });
    });

    describe('batchPredict', () => {

        it('should predict for multiple clusters', () => {
            const heatHistories = new Map([
                ['cluster-1', generateHistory(25, 50)],
                ['cluster-2', generateHistory(25, 30)],
                ['cluster-3', generateHistory(25, 70)],
            ]);

            const predictions = HeatPredictor.batchPredict(heatHistories);

            expect(predictions.length).toBe(3);
            expect(predictions.every(p => p.predictions.length > 0)).toBe(true);
        });

        it('should skip clusters with insufficient history', () => {
            const heatHistories = new Map([
                ['cluster-valid', generateHistory(25, 50)],
                ['cluster-invalid', generateHistory(5, 50)],
            ]);

            const predictions = HeatPredictor.batchPredict(heatHistories);

            expect(predictions.length).toBe(1);
            expect(predictions[0].clusterId).toBe('cluster-valid');
        });

        it('should sort by confidence descending', () => {
            const heatHistories = new Map([
                ['cluster-high', generateHistory(30, 50, 2)], // High confidence
                ['cluster-low', generateHistory(25, 50, 20)], // Low confidence
            ]);

            const predictions = HeatPredictor.batchPredict(heatHistories);

            expect(predictions.length).toBeGreaterThan(1);
            for (let i = 1; i < predictions.length; i++) {
                expect(predictions[i - 1].confidence).toBeGreaterThanOrEqual(predictions[i].confidence);
            }
        });
    });

    describe('findPredictedSpikes', () => {

        it('should identify predicted spikes', () => {
            const predictions = [
                createMockPrediction('spike-1', 50, 80, 'SPIKING'), // +60%
                createMockPrediction('spike-2', 30, 50, 'GROWING'), // +66%
                createMockPrediction('normal', 50, 55, 'STABLE'),  // +10%
            ];

            const spikes = HeatPredictor.findPredictedSpikes(predictions, 0.4); // 40% threshold

            expect(spikes.length).toBe(2);
            expect(spikes[0].clusterId).toBe('spike-2'); // Sorted by confidence
            expect(spikes[1].clusterId).toBe('spike-1');
        });

        it('should return empty array when no spikes', () => {
            const predictions = [
                createMockPrediction('stable', 50, 55, 'STABLE'),
                createMockPrediction('slow', 50, 52, 'GROWING'),
            ];

            const spikes = HeatPredictor.findPredictedSpikes(predictions, 0.5);

            expect(spikes.length).toBe(0);
        });

        it('should use custom threshold', () => {
            const predictions = [
                createMockPrediction('moderate', 50, 65, 'GROWING'), // +30%
            ];

            const spikesHigh = HeatPredictor.findPredictedSpikes(predictions, 0.4);
            const spikesLow = HeatPredictor.findPredictedSpikes(predictions, 0.2);

            expect(spikesHigh.length).toBe(0);
            expect(spikesLow.length).toBe(1);
        });
    });

    describe('findPredictedCrashes', () => {

        it('should identify predicted crashes', () => {
            const predictions = [
                createMockPrediction('crash-1', 80, 20, 'CRASHING'), // -75%
                createMockPrediction('crash-2', 50, 25, 'DECAYING'), // -50%
                createMockPrediction('normal', 50, 45, 'STABLE'),   // -10%
            ];

            const crashes = HeatPredictor.findPredictedCrashes(predictions, -0.4); // -40% threshold

            expect(crashes.length).toBe(2);
        });

        it('should return empty array when no crashes', () => {
            const predictions = [
                createMockPrediction('stable', 50, 48, 'STABLE'),
                createMockPrediction('growing', 50, 55, 'GROWING'),
            ];

            const crashes = HeatPredictor.findPredictedCrashes(predictions, -0.3);

            expect(crashes.length).toBe(0);
        });
    });

    describe('generateSummary', () => {

        it('should generate summary for SPIKING trajectory', () => {
            const prediction = createMockPrediction('test', 50, 90, 'SPIKING');
            prediction.predictions = [
                { hoursAhead: 1, predictedHeat: 60, confidence: 0.9, upperBound: 70, lowerBound: 50 },
                { hoursAhead: 24, predictedHeat: 90, confidence: 0.7, upperBound: 110, lowerBound: 70 },
            ];

            const summary = HeatPredictor.generateSummary(prediction);

            expect(summary).toContain('🚀');
            expect(summary).toContain('SPIKING');
            expect(summary).toContain('%');
        });

        it('should generate summary for GROWING trajectory', () => {
            const prediction = createMockPrediction('test', 50, 60, 'GROWING');
            prediction.predictions = [
                { hoursAhead: 1, predictedHeat: 52, confidence: 0.8, upperBound: 60, lowerBound: 45 },
                { hoursAhead: 24, predictedHeat: 60, confidence: 0.6, upperBound: 75, lowerBound: 45 },
            ];

            const summary = HeatPredictor.generateSummary(prediction);

            expect(summary).toContain('📈');
            expect(summary).toContain('GROWING');
        });

        it('should generate summary for CRASHING trajectory', () => {
            const prediction = createMockPrediction('test', 100, 40, 'CRASHING');
            prediction.predictions = [
                { hoursAhead: 1, predictedHeat: 80, confidence: 0.8, upperBound: 90, lowerBound: 70 },
                { hoursAhead: 24, predictedHeat: 40, confidence: 0.6, upperBound: 60, lowerBound: 20 },
            ];

            const summary = HeatPredictor.generateSummary(prediction);

            expect(summary).toContain('💥');
            expect(summary).toContain('CRASHING');
        });

        it('should generate summary for STABLE trajectory', () => {
            const prediction = createMockPrediction('test', 50, 51, 'STABLE');
            prediction.predictions = [
                { hoursAhead: 1, predictedHeat: 50.5, confidence: 0.9, upperBound: 55, lowerBound: 46 },
                { hoursAhead: 24, predictedHeat: 51, confidence: 0.7, upperBound: 60, lowerBound: 42 },
            ];

            const summary = HeatPredictor.generateSummary(prediction);

            expect(summary).toContain('➡️');
            expect(summary).toContain('STABLE');
        });
    });

    describe('Edge Cases', () => {

        it('should handle zero heat values', () => {
            const clusterId = 'cluster-zero';
            const heatHistory = generateHistory(25, 0, 0.1); // All zeros

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.currentHeat).toBe(0);
                expect(prediction.predictions.every(p => p.predictedHeat >= 0)).toBe(true);
            }
        });

        it('should handle very high heat values', () => {
            const clusterId = 'cluster-high';
            const heatHistory = generateHistory(25, 1000, 50);

            const prediction = HeatPredictor.predictHeat(clusterId, heatHistory);

            expect(prediction).not.toBeNull();
            if (prediction) {
                expect(prediction.currentHeat).toBeGreaterThan(900);
            }
        });

        it('should handle empty history', () => {
            const prediction = HeatPredictor.predictHeat('empty', []);
            expect(prediction).toBeNull();
        });
    });
});

// Helper functions for test data generation

function generateHistory(count: number, baseValue: number, variance: number = 5): Array<{ timestamp: Date; heatScore: number }> {
    const now = new Date();
    const history: Array<{ timestamp: Date; heatScore: number }> = [];

    for (let i = count; i > 0; i--) {
        const timestamp = new Date(now.getTime() - (i * 3600000));
        const heatScore = baseValue + (Math.random() - 0.5) * variance * 2;
        history.push({ timestamp, heatScore });
    }

    return history;
}

function generateGrowingHistory(count: number, startValue: number, endValue: number, noise: number = 5): Array<{ timestamp: Date; heatScore: number }> {
    const now = new Date();
    const history: Array<{ timestamp: Date; heatScore: number }> = [];
    const step = (endValue - startValue) / count;

    for (let i = count; i > 0; i--) {
        const timestamp = new Date(now.getTime() - (i * 3600000));
        const trendValue = startValue + (step * (count - i));
        const heatScore = trendValue + (Math.random() - 0.5) * noise * 2;
        history.push({ timestamp, heatScore });
    }

    return history;
}

function generateDecayingHistory(count: number, startValue: number, endValue: number, noise: number = 5): Array<{ timestamp: Date; heatScore: number }> {
    return generateGrowingHistory(count, endValue, startValue, noise).reverse();
}

function createMockPrediction(clusterId: string, current: number, future24: number, trajectory: any): HeatPrediction {
    const change24 = future24 - current;
    return {
        clusterId,
        currentHeat: current,
        predictions: [
            {
                hoursAhead: 1,
                predictedHeat: current + (change24 / 24),
                confidence: 0.8,
                upperBound: current + (change24 / 24) + 10,
                lowerBound: current + (change24 / 24) - 10,
            },
            {
                hoursAhead: 24,
                predictedHeat: future24,
                confidence: 0.6,
                upperBound: future24 + 15,
                lowerBound: future24 - 15,
            },
        ],
        trajectory,
        confidence: 0.7,
        predictedAt: new Date(),
        factors: {
            trendDirection: trajectory === 'SPIKING' || trajectory === 'GROWING' ? 0.5 : -0.5,
            volatility: 0.3,
            momentum: trajectory === 'SPIKING' || trajectory === 'GROWING' ? 0.2 : -0.2,
            stageOfLifecycle: trajectory === 'SPIKING' ? 'EMERGING' : trajectory === 'CRASHING' ? 'DECAYING' : 'SUSTAINED',
        },
    };
}
