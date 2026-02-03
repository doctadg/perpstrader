// Heat Prediction Service
// Predicts future cluster heat trajectories using time-series analysis
// Supports ENHANCEMENT 6: Predictive Scoring

import logger from '../shared/logger';

export interface HeatPredictionConfig {
    windowSize: number;           // Number of historical points to use
    forecastHorizon: number[];     // Hours ahead to forecast (e.g., [1, 6, 24])
    minConfidence: number;         // Minimum confidence for prediction
    trendWeight: number;           // Weight of trend in prediction
    seasonalityWeight: number;      // Weight of seasonality (if detected)
}

export interface HeatPrediction {
    clusterId: string;
    currentHeat: number;
    predictions: Array<{
        hoursAhead: number;
        predictedHeat: number;
        confidence: number;
        upperBound: number;
        lowerBound: number;
    }>;
    trajectory: 'SPIKING' | 'GROWING' | 'STABLE' | 'DECAYING' | 'CRASHING';
    confidence: number;
    predictedAt: Date;
    factors: {
        trendDirection: number;     // -1 to 1
        volatility: number;         // 0 to 1
        momentum: number;           // -1 to 1
        stageOfLifecycle: string;   // EMERGING, PEAK, DECAYING
    };
}

class HeatPredictor {
    private static readonly DEFAULT_CONFIG: HeatPredictionConfig = {
        windowSize: 24,
        forecastHorizon: [1, 6, 24],
        minConfidence: 0.3,
        trendWeight: 0.7,
        seasonalityWeight: 0.3
    };

    /**
     * Predict future heat values for a cluster
     */
    static predictHeat(
        clusterId: string,
        heatHistory: Array<{ timestamp: Date; heatScore: number }>,
        config: Partial<HeatPredictionConfig> = {}
    ): HeatPrediction | null {
        const fullConfig = { ...HeatPredictor.DEFAULT_CONFIG, ...config };

        if (heatHistory.length < fullConfig.windowSize) {
            logger.debug(`[HeatPredictor] Insufficient history for cluster ${clusterId}: ${heatHistory.length} < ${fullConfig.windowSize}`);
            return null;
        }

        // Use recent window
        const window = heatHistory.slice(0, fullConfig.windowSize);
        const heats = window.map(h => h.heatScore);

        // Calculate factors
        const factors = HeatPredictor.calculateFactors(heats);

        // Generate predictions for each horizon
        const predictions = fullConfig.forecastHorizon.map(hoursAhead => {
            const result = HeatPredictor.predictAtHorizon(
                heats,
                hoursAhead,
                factors,
                fullConfig
            );

            return {
                hoursAhead,
                predictedHeat: result.predicted,
                confidence: result.confidence,
                upperBound: result.upperBound,
                lowerBound: result.lowerBound
            };
        });

        // Determine overall trajectory
        const trajectory = HeatPredictor.determineTrajectory(predictions, factors);

        // Overall confidence (weighted by horizon)
        const confidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;

        return {
            clusterId,
            currentHeat: heats[0],
            predictions,
            trajectory,
            confidence,
            predictedAt: new Date(),
            factors
        };
    }

    /**
     * Calculate predictive factors from heat history
     */
    private static calculateFactors(heats: number[]): HeatPrediction['factors'] {
        // Trend direction (linear regression slope)
        const trendDirection = HeatPredictor.calculateLinearTrend(heats);

        // Volatility (coefficient of variation)
        const mean = heats.reduce((a, b) => a + b, 0) / heats.length;
        const stdDev = Math.sqrt(heats.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / heats.length);
        const volatility = mean > 0 ? stdDev / mean : 0;

        // Momentum (rate of change)
        const recent = heats.slice(0, 5);
        const older = heats.slice(5, 10);
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const momentum = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

        // Lifecycle stage
        const stageOfLifecycle = HeatPredictor.determineLifecycleStage(heats);

        return {
            trendDirection,
            volatility,
            momentum,
            stageOfLifecycle
        };
    }

    /**
     * Calculate linear trend (slope)
     */
    private static calculateLinearTrend(heats: number[]): number {
        const n = heats.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = heats;

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

        // Normalize to -1 to 1 range
        const avgY = sumY / n;
        const normalizedSlope = avgY > 0 ? slope / avgY : 0;

        return Math.max(-1, Math.min(1, normalizedSlope));
    }

    /**
     * Determine lifecycle stage
     */
    private static determineLifecycleStage(heats: number[]): string {
        const current = heats[0];
        const max = Math.max(...heats);
        const min = Math.min(...heats);
        const range = max - min;

        if (range < 1) return 'STABLE';

        const positionInCycle = (current - min) / range;

        // Position in cycle + trend
        const recentTrend = heats[0] - heats[3];

        if (positionInCycle < 0.2 && recentTrend > 0) {
            return 'EMERGING';
        } else if (positionInCycle > 0.8 && recentTrend < 0) {
            return 'PEAK';
        } else if (recentTrend < 0) {
            return 'DECAYING';
        } else if (recentTrend > 0) {
            return 'GROWING';
        } else {
            return 'STABLE';
        }
    }

    /**
     * Predict heat at specific time horizon
     */
    private static predictAtHorizon(
        heats: number[],
        hoursAhead: number,
        factors: HeatPrediction['factors'],
        config: HeatPredictionConfig
    ): { predicted: number; confidence: number; upperBound: number; lowerBound: number } {
        const currentHeat = heats[0];
        const mean = heats.reduce((a, b) => a + b, 0) / heats.length;
        const stdDev = Math.sqrt(heats.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / heats.length);

        // Base prediction: trend extrapolation
        let predicted = currentHeat + (factors.trendDirection * stdDev * hoursAhead * 0.5);

        // Apply lifecycle adjustments
        switch (factors.stageOfLifecycle) {
            case 'EMERGING':
                predicted *= 1.05 ** hoursAhead; // Growth acceleration
                break;
            case 'PEAK':
                predicted *= 0.98 ** hoursAhead; // Decay from peak
                break;
            case 'DECAYING':
                predicted *= 0.95 ** hoursAhead; // Accelerating decay
                break;
            case 'GROWING':
                predicted *= 1.02 ** hoursAhead; // Steady growth
                break;
            case 'STABLE':
                // No adjustment
                break;
        }

        // Apply momentum boost
        predicted *= 1 + (factors.momentum * 0.1 * hoursAhead);

        // Ensure non-negative
        predicted = Math.max(0, predicted);

        // Calculate confidence (decreases with time horizon)
        const timeDecay = Math.exp(-hoursAhead / 12); // Half confidence at 12h
        const volatilityPenalty = Math.exp(-factors.volatility * 2);
        const confidence = timeDecay * volatilityPenalty;

        // Calculate confidence bounds (prediction ± error margin)
        const errorMargin = stdDev * Math.sqrt(hoursAhead) * (1 + factors.volatility);
        const upperBound = predicted + errorMargin * 1.96; // 95% CI
        const lowerBound = Math.max(0, predicted - errorMargin * 1.96);

        return { predicted, confidence, upperBound, lowerBound };
    }

    /**
     * Determine overall trajectory from predictions
     */
    private static determineTrajectory(
        predictions: Array<{ hoursAhead: number; predictedHeat: number }>,
        factors: HeatPrediction['factors']
    ): 'SPIKING' | 'GROWING' | 'STABLE' | 'DECAYING' | 'CRASHING' {
        const current = predictions[0].hoursAhead === 0 ?
            predictions[0].predictedHeat : predictions[0].predictedHeat;

        const future1h = predictions.find(p => p.hoursAhead === 1)?.predictedHeat || current;
        const future24h = predictions.find(p => p.hoursAhead === 24)?.predictedHeat || current;

        const change1h = (future1h - current) / (current || 1);
        const change24h = (future24h - current) / (current || 1);

        // Combine momentum and trend
        const momentum = factors.momentum;
        const trend = factors.trendDirection;

        if (change1h > 0.2 && change24h > 0.5) {
            return 'SPIKING';
        } else if (change1h < -0.2 && change24h < -0.5) {
            return 'CRASHING';
        } else if (change1h > 0.05 || (trend > 0.1 && momentum > 0.1)) {
            return 'GROWING';
        } else if (change1h < -0.05 || (trend < -0.1 && momentum < -0.1)) {
            return 'DECAYING';
        } else {
            return 'STABLE';
        }
    }

    /**
     * Batch predict for multiple clusters
     */
    static batchPredict(
        heatHistories: Map<string, Array<{ timestamp: Date; heatScore: number }>>,
        config: Partial<HeatPredictionConfig> = {}
    ): HeatPrediction[] {
        const predictions: HeatPrediction[] = [];

        for (const [clusterId, history] of heatHistories) {
            const prediction = HeatPredictor.predictHeat(clusterId, history, config);
            if (prediction) {
                predictions.push(prediction);
            }
        }

        return predictions.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Generate prediction summary text
     */
    static generateSummary(prediction: HeatPrediction): string {
        const trajectoryEmojis = {
            SPIKING: '🚀',
            GROWING: '📈',
            STABLE: '➡️',
            DECAYING: '📉',
            CRASHING: '💥'
        };

        const emoji = trajectoryEmojis[prediction.trajectory];
        const p24h = prediction.predictions.find(p => p.hoursAhead === 24);

        if (!p24h) {
            return `${emoji} ${prediction.trajectory} trajectory (insufficient data)`;
        }

        const change24h = p24h.predictedHeat - prediction.currentHeat;
        const changePct = ((change24h / prediction.currentHeat) * 100).toFixed(1);
        const direction = change24h >= 0 ? '+' : '';

        return `${emoji} ${prediction.trajectory}: ${direction}${changePct}% in 24h (confidence: ${(prediction.confidence * 100).toFixed(0)}%)`;
    }

    /**
     * Identify clusters with predicted spikes
     */
    static findPredictedSpikes(
        predictions: HeatPrediction[],
        threshold: number = 0.3
    ): HeatPrediction[] {
        return predictions.filter(p => {
            const p1h = p.predictions.find(pr => pr.hoursAhead === 1);
            return p1h ? (p1h.predictedHeat - p.currentHeat) / p.currentHeat >= threshold : false;
        });
    }

    /**
     * Identify clusters with predicted crashes
     */
    static findPredictedCrashes(
        predictions: HeatPrediction[],
        threshold: number = -0.3
    ): HeatPrediction[] {
        return predictions.filter(p => {
            const p1h = p.predictions.find(pr => pr.hoursAhead === 1);
            return p1h ? (p1h.predictedHeat - p.currentHeat) / p.currentHeat <= threshold : false;
        });
    }
}

export default HeatPredictor;
