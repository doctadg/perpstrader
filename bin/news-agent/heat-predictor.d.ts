export interface HeatPredictionConfig {
    windowSize: number;
    forecastHorizon: number[];
    minConfidence: number;
    trendWeight: number;
    seasonalityWeight: number;
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
        trendDirection: number;
        volatility: number;
        momentum: number;
        stageOfLifecycle: string;
    };
}
declare class HeatPredictor {
    private static readonly DEFAULT_CONFIG;
    /**
     * Predict future heat values for a cluster
     */
    static predictHeat(clusterId: string, heatHistory: Array<{
        timestamp: Date;
        heatScore: number;
    }>, config?: Partial<HeatPredictionConfig>): HeatPrediction | null;
    /**
     * Calculate predictive factors from heat history
     */
    private static calculateFactors;
    /**
     * Calculate linear trend (slope)
     */
    private static calculateLinearTrend;
    /**
     * Determine lifecycle stage
     */
    private static determineLifecycleStage;
    /**
     * Predict heat at specific time horizon
     */
    private static predictAtHorizon;
    /**
     * Determine overall trajectory from predictions
     */
    private static determineTrajectory;
    /**
     * Batch predict for multiple clusters
     */
    static batchPredict(heatHistories: Map<string, Array<{
        timestamp: Date;
        heatScore: number;
    }>>, config?: Partial<HeatPredictionConfig>): HeatPrediction[];
    /**
     * Generate prediction summary text
     */
    static generateSummary(prediction: HeatPrediction): string;
    /**
     * Identify clusters with predicted spikes
     */
    static findPredictedSpikes(predictions: HeatPrediction[], threshold?: number): HeatPrediction[];
    /**
     * Identify clusters with predicted crashes
     */
    static findPredictedCrashes(predictions: HeatPrediction[], threshold?: number): HeatPrediction[];
}
export default HeatPredictor;
//# sourceMappingURL=heat-predictor.d.ts.map