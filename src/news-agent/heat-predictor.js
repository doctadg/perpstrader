"use strict";
// Heat Prediction Service
// Predicts future cluster heat trajectories using time-series analysis
// Supports ENHANCEMENT 6: Predictive Scoring
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var logger_1 = require("../shared/logger");
var HeatPredictor = /** @class */ (function () {
    function HeatPredictor() {
    }
    /**
     * Predict future heat values for a cluster
     */
    HeatPredictor.predictHeat = function (clusterId, heatHistory, config) {
        if (config === void 0) { config = {}; }
        var fullConfig = __assign(__assign({}, HeatPredictor.DEFAULT_CONFIG), config);
        if (heatHistory.length < fullConfig.windowSize) {
            logger_1.default.debug("[HeatPredictor] Insufficient history for cluster ".concat(clusterId, ": ").concat(heatHistory.length, " < ").concat(fullConfig.windowSize));
            return null;
        }
        // Use recent window
        var window = heatHistory.slice(0, fullConfig.windowSize);
        var heats = window.map(function (h) { return h.heatScore; });
        // Calculate factors
        var factors = HeatPredictor.calculateFactors(heats);
        // Generate predictions for each horizon
        var predictions = fullConfig.forecastHorizon.map(function (hoursAhead) {
            var result = HeatPredictor.predictAtHorizon(heats, hoursAhead, factors, fullConfig);
            return {
                hoursAhead: hoursAhead,
                predictedHeat: result.predicted,
                confidence: result.confidence,
                upperBound: result.upperBound,
                lowerBound: result.lowerBound
            };
        });
        // Determine overall trajectory
        var trajectory = HeatPredictor.determineTrajectory(predictions, factors);
        // Overall confidence (weighted by horizon)
        var confidence = predictions.reduce(function (sum, p) { return sum + p.confidence; }, 0) / predictions.length;
        return {
            clusterId: clusterId,
            currentHeat: heats[0],
            predictions: predictions,
            trajectory: trajectory,
            confidence: confidence,
            predictedAt: new Date(),
            factors: factors
        };
    };
    /**
     * Calculate predictive factors from heat history
     */
    HeatPredictor.calculateFactors = function (heats) {
        // Trend direction (linear regression slope)
        var trendDirection = HeatPredictor.calculateLinearTrend(heats);
        // Volatility (coefficient of variation)
        var mean = heats.reduce(function (a, b) { return a + b; }, 0) / heats.length;
        var stdDev = Math.sqrt(heats.reduce(function (sq, n) { return sq + Math.pow(n - mean, 2); }, 0) / heats.length);
        var volatility = mean > 0 ? stdDev / mean : 0;
        // Momentum (rate of change)
        var recent = heats.slice(0, 5);
        var older = heats.slice(5, 10);
        var recentAvg = recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
        var olderAvg = older.reduce(function (a, b) { return a + b; }, 0) / older.length;
        var momentum = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
        // Lifecycle stage
        var stageOfLifecycle = HeatPredictor.determineLifecycleStage(heats);
        return {
            trendDirection: trendDirection,
            volatility: volatility,
            momentum: momentum,
            stageOfLifecycle: stageOfLifecycle
        };
    };
    /**
     * Calculate linear trend (slope)
     */
    HeatPredictor.calculateLinearTrend = function (heats) {
        var n = heats.length;
        var x = Array.from({ length: n }, function (_, i) { return i; });
        var y = heats;
        var sumX = x.reduce(function (a, b) { return a + b; }, 0);
        var sumY = y.reduce(function (a, b) { return a + b; }, 0);
        var sumXY = x.reduce(function (sum, xi, i) { return sum + xi * y[i]; }, 0);
        var sumXX = x.reduce(function (sum, xi) { return sum + xi * xi; }, 0);
        var slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        // Normalize to -1 to 1 range
        var avgY = sumY / n;
        var normalizedSlope = avgY > 0 ? slope / avgY : 0;
        return Math.max(-1, Math.min(1, normalizedSlope));
    };
    /**
     * Determine lifecycle stage
     */
    HeatPredictor.determineLifecycleStage = function (heats) {
        var current = heats[0];
        var max = Math.max.apply(Math, heats);
        var min = Math.min.apply(Math, heats);
        var range = max - min;
        if (range < 1)
            return 'STABLE';
        var positionInCycle = (current - min) / range;
        // Position in cycle + trend
        var recentTrend = heats[0] - heats[3];
        if (positionInCycle < 0.2 && recentTrend > 0) {
            return 'EMERGING';
        }
        else if (positionInCycle > 0.8 && recentTrend < 0) {
            return 'PEAK';
        }
        else if (recentTrend < 0) {
            return 'DECAYING';
        }
        else if (recentTrend > 0) {
            return 'GROWING';
        }
        else {
            return 'STABLE';
        }
    };
    /**
     * Predict heat at specific time horizon
     */
    HeatPredictor.predictAtHorizon = function (heats, hoursAhead, factors, config) {
        var currentHeat = heats[0];
        var mean = heats.reduce(function (a, b) { return a + b; }, 0) / heats.length;
        var stdDev = Math.sqrt(heats.reduce(function (sq, n) { return sq + Math.pow(n - mean, 2); }, 0) / heats.length);
        // Base prediction: trend extrapolation
        var predicted = currentHeat + (factors.trendDirection * stdDev * hoursAhead * 0.5);
        // Apply lifecycle adjustments
        switch (factors.stageOfLifecycle) {
            case 'EMERGING':
                predicted *= Math.pow(1.05, hoursAhead); // Growth acceleration
                break;
            case 'PEAK':
                predicted *= Math.pow(0.98, hoursAhead); // Decay from peak
                break;
            case 'DECAYING':
                predicted *= Math.pow(0.95, hoursAhead); // Accelerating decay
                break;
            case 'GROWING':
                predicted *= Math.pow(1.02, hoursAhead); // Steady growth
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
        var timeDecay = Math.exp(-hoursAhead / 12); // Half confidence at 12h
        var volatilityPenalty = Math.exp(-factors.volatility * 2);
        var confidence = timeDecay * volatilityPenalty;
        // Calculate confidence bounds (prediction ± error margin)
        var errorMargin = stdDev * Math.sqrt(hoursAhead) * (1 + factors.volatility);
        var upperBound = predicted + errorMargin * 1.96; // 95% CI
        var lowerBound = Math.max(0, predicted - errorMargin * 1.96);
        return { predicted: predicted, confidence: confidence, upperBound: upperBound, lowerBound: lowerBound };
    };
    /**
     * Determine overall trajectory from predictions
     */
    HeatPredictor.determineTrajectory = function (predictions, factors) {
        var _a, _b;
        var current = predictions[0].hoursAhead === 0 ?
            predictions[0].predictedHeat : predictions[0].predictedHeat;
        var future1h = ((_a = predictions.find(function (p) { return p.hoursAhead === 1; })) === null || _a === void 0 ? void 0 : _a.predictedHeat) || current;
        var future24h = ((_b = predictions.find(function (p) { return p.hoursAhead === 24; })) === null || _b === void 0 ? void 0 : _b.predictedHeat) || current;
        var change1h = (future1h - current) / (current || 1);
        var change24h = (future24h - current) / (current || 1);
        // Combine momentum and trend
        var momentum = factors.momentum;
        var trend = factors.trendDirection;
        if (change1h > 0.2 && change24h > 0.5) {
            return 'SPIKING';
        }
        else if (change1h < -0.2 && change24h < -0.5) {
            return 'CRASHING';
        }
        else if (change1h > 0.05 || (trend > 0.1 && momentum > 0.1)) {
            return 'GROWING';
        }
        else if (change1h < -0.05 || (trend < -0.1 && momentum < -0.1)) {
            return 'DECAYING';
        }
        else {
            return 'STABLE';
        }
    };
    /**
     * Batch predict for multiple clusters
     */
    HeatPredictor.batchPredict = function (heatHistories, config) {
        if (config === void 0) { config = {}; }
        var predictions = [];
        for (var _i = 0, heatHistories_1 = heatHistories; _i < heatHistories_1.length; _i++) {
            var _a = heatHistories_1[_i], clusterId = _a[0], history_1 = _a[1];
            var prediction = HeatPredictor.predictHeat(clusterId, history_1, config);
            if (prediction) {
                predictions.push(prediction);
            }
        }
        return predictions.sort(function (a, b) { return b.confidence - a.confidence; });
    };
    /**
     * Generate prediction summary text
     */
    HeatPredictor.generateSummary = function (prediction) {
        var trajectoryEmojis = {
            SPIKING: '🚀',
            GROWING: '📈',
            STABLE: '➡️',
            DECAYING: '📉',
            CRASHING: '💥'
        };
        var emoji = trajectoryEmojis[prediction.trajectory];
        var p24h = prediction.predictions.find(function (p) { return p.hoursAhead === 24; });
        if (!p24h) {
            return "".concat(emoji, " ").concat(prediction.trajectory, " trajectory (insufficient data)");
        }
        var change24h = p24h.predictedHeat - prediction.currentHeat;
        var changePct = ((change24h / prediction.currentHeat) * 100).toFixed(1);
        var direction = change24h >= 0 ? '+' : '';
        return "".concat(emoji, " ").concat(prediction.trajectory, ": ").concat(direction).concat(changePct, "% in 24h (confidence: ").concat((prediction.confidence * 100).toFixed(0), "%)");
    };
    /**
     * Identify clusters with predicted spikes
     */
    HeatPredictor.findPredictedSpikes = function (predictions, threshold) {
        if (threshold === void 0) { threshold = 0.3; }
        return predictions.filter(function (p) {
            var p1h = p.predictions.find(function (pr) { return pr.hoursAhead === 1; });
            return p1h ? (p1h.predictedHeat - p.currentHeat) / p.currentHeat >= threshold : false;
        });
    };
    /**
     * Identify clusters with predicted crashes
     */
    HeatPredictor.findPredictedCrashes = function (predictions, threshold) {
        if (threshold === void 0) { threshold = -0.3; }
        return predictions.filter(function (p) {
            var p1h = p.predictions.find(function (pr) { return pr.hoursAhead === 1; });
            return p1h ? (p1h.predictedHeat - p.currentHeat) / p.currentHeat <= threshold : false;
        });
    };
    HeatPredictor.DEFAULT_CONFIG = {
        windowSize: 24,
        forecastHorizon: [1, 6, 24],
        minConfidence: 0.3,
        trendWeight: 0.7,
        seasonalityWeight: 0.3
    };
    return HeatPredictor;
}());
exports.default = HeatPredictor;
