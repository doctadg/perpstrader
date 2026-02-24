"use strict";
// Anomaly Detection Service
// Detects unusual patterns in cluster heat and behavior
// Supports ENHANCEMENT 9: Anomaly Detection
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
var AnomalyDetector = /** @class */ (function () {
    function AnomalyDetector() {
    }
    /**
     * Detect heat anomalies using z-score analysis
     */
    AnomalyDetector.detectHeatAnomalies = function (clusterId, heatHistory, config) {
        if (config === void 0) { config = {}; }
        var fullConfig = __assign(__assign({}, AnomalyDetector.DEFAULT_CONFIG), config);
        var anomalies = [];
        if (heatHistory.length < fullConfig.minHistoryPoints) {
            logger_1.default.debug("[AnomalyDetector] Insufficient history for cluster ".concat(clusterId, ": ").concat(heatHistory.length, " < ").concat(fullConfig.minHistoryPoints));
            return anomalies;
        }
        // Use rolling window for recent data
        var window = heatHistory.slice(0, fullConfig.windowSize);
        var heats = window.map(function (h) { return h.heatScore; });
        // Calculate statistics
        var mean = AnomalyDetector.calculateMean(heats);
        var stdDev = AnomalyDetector.calculateStdDev(heats, mean);
        if (stdDev < 0.1) {
            logger_1.default.debug("[AnomalyDetector] Low variance for cluster ".concat(clusterId, ", skipping anomaly detection"));
            return anomalies;
        }
        var currentHeat = heats[0];
        var zScore = (currentHeat - mean) / stdDev;
        // Detect spike
        if (zScore >= fullConfig.spikeThreshold) {
            anomalies.push({
                clusterId: clusterId,
                type: 'SUDDEN_SPIKE',
                severity: AnomalyDetector.getSeverity(zScore),
                zScore: zScore,
                currentValue: currentHeat,
                expectedRange: [mean - (fullConfig.spikeThreshold * stdDev), mean + (fullConfig.spikeThreshold * stdDev)],
                detectedAt: new Date(),
                description: "Heat spike detected: ".concat(currentHeat.toFixed(1), " is ").concat(zScore.toFixed(1), "\u03C3 above mean ").concat(mean.toFixed(1))
            });
        }
        // Detect drop
        else if (zScore <= fullConfig.dropThreshold) {
            anomalies.push({
                clusterId: clusterId,
                type: 'SUDDEN_DROP',
                severity: AnomalyDetector.getSeverity(Math.abs(zScore)),
                zScore: zScore,
                currentValue: currentHeat,
                expectedRange: [mean + (fullConfig.dropThreshold * stdDev), mean - (fullConfig.dropThreshold * stdDev)],
                detectedAt: new Date(),
                description: "Heat drop detected: ".concat(currentHeat.toFixed(1), " is ").concat(Math.abs(zScore).toFixed(1), "\u03C3 below mean ").concat(mean.toFixed(1))
            });
        }
        // Detect velocity anomalies
        var velocities = window.filter(function (h) { return h.velocity !== undefined; }).map(function (h) { return h.velocity; });
        if (velocities.length >= fullConfig.minHistoryPoints) {
            var currentVelocity = velocities[0];
            var vMean = AnomalyDetector.calculateMean(velocities);
            var vStdDev = AnomalyDetector.calculateStdDev(velocities, vMean);
            if (vStdDev > 0) {
                var velocityZ = (currentVelocity - vMean) / vStdDev;
                if (Math.abs(velocityZ) >= fullConfig.velocityThreshold) {
                    anomalies.push({
                        clusterId: clusterId,
                        type: 'VELOCITY_ANOMALY',
                        severity: AnomalyDetector.getSeverity(Math.abs(velocityZ)),
                        zScore: velocityZ,
                        currentValue: currentHeat,
                        expectedRange: [mean - 2 * stdDev, mean + 2 * stdDev],
                        detectedAt: new Date(),
                        description: "Velocity anomaly: ".concat(currentVelocity.toFixed(1), "/hr is ").concat(velocityZ.toFixed(1), "\u03C3 from mean ").concat(vMean.toFixed(1), "/hr")
                    });
                }
            }
        }
        return anomalies;
    };
    /**
     * Detect cross-syndication events
     * Occurs when similar events appear in multiple categories simultaneously
     */
    AnomalyDetector.detectCrossSyndication = function (clusters) {
        var _a;
        var events = [];
        // Group clusters by topic key (case-insensitive)
        var topicGroups = new Map();
        for (var _i = 0, clusters_1 = clusters; _i < clusters_1.length; _i++) {
            var cluster = clusters_1[_i];
            var key = ((_a = cluster.topicKey) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
            if (!topicGroups.has(key)) {
                topicGroups.set(key, []);
            }
            topicGroups.get(key).push({
                id: cluster.id,
                category: cluster.category,
                heat: cluster.heatScore
            });
        }
        var _loop_1 = function (topicKey, clusterList) {
            if (clusterList.length < 2)
                return "continue";
            var categories = new Set(clusterList.map(function (c) { return c.category; }));
            if (categories.size > 1) {
                // Cross-category syndication detected
                var hottest_1 = clusterList.reduce(function (max, c) { return c.heat > max.heat ? c : max; }, clusterList[0]);
                events.push({
                    sourceClusterId: hottest_1.id,
                    sourceCategory: hottest_1.category,
                    targetClusters: clusterList.filter(function (c) { return c.id !== hottest_1.id; }),
                    eventTime: new Date()
                });
            }
        };
        // Find topic keys appearing in multiple categories
        for (var _b = 0, topicGroups_1 = topicGroups; _b < topicGroups_1.length; _b++) {
            var _c = topicGroups_1[_b], topicKey = _c[0], clusterList = _c[1];
            _loop_1(topicKey, clusterList);
        }
        return events;
    };
    /**
     * Detect emerging trend acceleration
     * Identifies clusters with accelerating velocity
     */
    AnomalyDetector.detectAcceleration = function (heatHistory, minAcceleration) {
        if (minAcceleration === void 0) { minAcceleration = 2.0; }
        if (heatHistory.length < 5)
            return false;
        var recentVelocity = heatHistory[0].velocity;
        var avgVelocity = heatHistory
            .filter(function (h) { return h.velocity !== undefined; })
            .map(function (h) { return h.velocity; })
            .reduce(function (a, b) { return a + b; }, 0) / heatHistory.length;
        var acceleration = recentVelocity ? (recentVelocity - avgVelocity) : 0;
        return acceleration >= minAcceleration;
    };
    /**
     * Detect pattern anomalies (unusual heat patterns)
     */
    AnomalyDetector.detectPatternAnomalies = function (heatHistory) {
        var patterns = [];
        if (heatHistory.length < 10)
            return patterns;
        var heats = heatHistory.map(function (h) { return h.heatScore; });
        // Check for oscillation (rapid up-down pattern)
        var directionChanges = 0;
        for (var i = 1; i < heats.length - 1; i++) {
            var prev = heats[i] - heats[i + 1];
            var curr = heats[i - 1] - heats[i];
            if (prev * curr < 0) {
                directionChanges++;
            }
        }
        if (directionChanges > heats.length * 0.6) {
            patterns.push('OSCILLATING_HEAT');
        }
        // Check for step pattern (sudden jump then flat)
        var jumpThreshold = Math.max.apply(Math, heats) * 0.3;
        for (var i = 1; i < heats.length; i++) {
            var jump = Math.abs(heats[i - 1] - heats[i]);
            if (jump > jumpThreshold) {
                // Check if heat stays flat after jump
                var afterJump = heats.slice(0, i);
                var variance = AnomalyDetector.calculateStdDev(afterJump, AnomalyDetector.calculateMean(afterJump));
                if (variance < jumpThreshold * 0.1) {
                    patterns.push('STEP_PATTERN');
                    break;
                }
            }
        }
        // Check for linear decay (constant downward trend)
        var upwardCount = 0;
        var downwardCount = 0;
        for (var i = 1; i < heats.length; i++) {
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
    };
    /**
     * Calculate mean of array
     */
    AnomalyDetector.calculateMean = function (values) {
        return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    };
    /**
     * Calculate standard deviation
     */
    AnomalyDetector.calculateStdDev = function (values, mean) {
        var squaredDiffs = values.map(function (v) { return Math.pow(v - mean, 2); });
        return Math.sqrt(squaredDiffs.reduce(function (a, b) { return a + b; }, 0) / values.length);
    };
    /**
     * Get severity level from z-score
     */
    AnomalyDetector.getSeverity = function (zScore) {
        var absZ = Math.abs(zScore);
        if (absZ < 2)
            return 'LOW';
        if (absZ < 3)
            return 'MEDIUM';
        if (absZ < 4)
            return 'HIGH';
        return 'CRITICAL';
    };
    /**
     * Generate anomaly alert message
     */
    AnomalyDetector.generateAlert = function (anomaly) {
        var severityEmoji = {
            LOW: '⚠️',
            MEDIUM: '🔶',
            HIGH: '🔴',
            CRITICAL: '🚨'
        };
        var prefix = severityEmoji[anomaly.severity];
        switch (anomaly.type) {
            case 'SUDDEN_SPIKE':
                return "".concat(prefix, " Heat spike: ").concat(anomaly.currentValue.toFixed(1), " is ").concat(anomaly.zScore.toFixed(1), "\u03C3 above normal");
            case 'SUDDEN_DROP':
                return "".concat(prefix, " Heat drop: ").concat(anomaly.currentValue.toFixed(1), " is ").concat(Math.abs(anomaly.zScore).toFixed(1), "\u03C3 below normal");
            case 'VELOCITY_ANOMALY':
                return "".concat(prefix, " Unusual velocity: ").concat(anomaly.description);
            case 'CROSS_SYNDICATION':
                return "".concat(prefix, " Cross-category event detected: \"").concat(anomaly.description, "\"");
            default:
                return "".concat(prefix, " Anomaly: ").concat(anomaly.description);
        }
    };
    AnomalyDetector.DEFAULT_CONFIG = {
        spikeThreshold: 3.0,
        dropThreshold: -3.0,
        velocityThreshold: 2.0,
        minHistoryPoints: 5,
        windowSize: 10
    };
    return AnomalyDetector;
}());
exports.default = AnomalyDetector;
