/**
 * Prometheus Metrics Exporter for PerpsTrader
 *
 * Exposes metrics endpoint at /metrics for Prometheus scraping
 *
 * Usage:
 *   npm run metrics-exporter
 *   or
 *   ts-node monitoring/prometheus/metrics-exporter.ts
 */

import express from 'express';
import promClient from 'prom-client';

const app = express();
const PORT = process.env.METRICS_PORT || 9090;

// Create a Registry to register the metrics
const register = new promClient.Registry();

// Enable default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// ============================================
// Clustering Metrics
// ============================================

/**
 * Enhanced clustering duration in seconds
 * Labels: cluster_type
 */
const clusteringDuration = new promClient.Histogram({
  name: 'clustering_duration_seconds',
  help: 'Duration of enhanced clustering operations',
  labelNames: ['cluster_type'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120] // seconds
});
register.registerMetric(clusteringDuration);

/**
 * Clustering throughput - number of clusters processed
 */
const clusteringThroughput = new promClient.Counter({
  name: 'clustering_throughput_total',
  help: 'Total number of clusters processed',
  labelNames: ['cluster_type', 'status'] as const
});
register.registerMetric(clusteringThroughput);

// ============================================
// Anomaly Detection Metrics
// ============================================

/**
 * Anomaly detection count
 * Labels: severity, type
 */
const anomalyDetectionCount = new promClient.Counter({
  name: 'anomaly_detection_count',
  help: 'Total number of anomalies detected',
  labelNames: ['severity', 'type'] as const
});
register.registerMetric(anomalyDetectionCount);

/**
 * Active anomalies gauge
 * Labels: severity
 */
const anomaliesActive = new promClient.Gauge({
  name: 'anomalies_active',
  help: 'Number of currently active anomalies',
  labelNames: ['severity'] as const
});
register.registerMetric(anomaliesActive);

/**
 * Anomaly response time histogram
 */
const anomalyResponseTime = new promClient.Histogram({
  name: 'anomaly_response_time_seconds',
  help: 'Time to respond to detected anomalies',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5] // seconds
});
register.registerMetric(anomalyResponseTime);

// ============================================
// Prediction Metrics
// ============================================

/**
 * Prediction generation count
 * Labels: model, status
 */
const predictionGenerationCount = new promClient.Counter({
  name: 'prediction_generation_count',
  help: 'Total number of predictions generated',
  labelNames: ['model', 'status'] as const
});
register.registerMetric(predictionGenerationCount);

/**
 * Heat prediction accuracy gauge
 * Labels: model
 */
const heatPredictionAccuracy = new promClient.Gauge({
  name: 'heat_prediction_accuracy',
  help: 'Current heat prediction accuracy (0-1)',
  labelNames: ['model'] as const,
  min: 0,
  max: 1
});
register.registerMetric(heatPredictionAccuracy);

/**
 * Prediction error rate
 * Labels: error_type
 */
const predictionErrorRate = new promClient.Counter({
  name: 'prediction_error_count',
  help: 'Number of prediction errors',
  labelNames: ['error_type', 'model'] as const
});
register.registerMetric(predictionErrorRate);

// ============================================
// Entity Metrics
// ============================================

/**
 * Entity extraction count
 * Labels: entity_type
 */
const entityExtractionCount = new promClient.Counter({
  name: 'entity_extraction_count',
  help: 'Total number of entities extracted',
  labelNames: ['entity_type'] as const
});
register.registerMetric(entityExtractionCount);

/**
 * Entity mention count
 * Labels: entity
 */
const entityMentionsCount = new promClient.Counter({
  name: 'entity_mentions_count',
  help: 'Number of mentions for each entity',
  labelNames: ['entity'] as const
});
register.registerMetric(entityMentionsCount);

/**
 * Current entity count by type
 * Labels: entity_type
 */
const entityCount = new promClient.Gauge({
  name: 'entity_count',
  help: 'Current number of entities tracked by type',
  labelNames: ['entity_type'] as const
});
register.registerMetric(entityCount);

/**
 * Entity heat value
 * Labels: entity
 */
const entityHeatValue = new promClient.Gauge({
  name: 'entity_heat_value',
  help: 'Current heat value for entities',
  labelNames: ['entity'] as const,
  min: 0,
  max: 1
});
register.registerMetric(entityHeatValue);

/**
 * Heat deviation score (for anomaly detection)
 * Labels: entity
 */
const heatDeviationScore = new promClient.Gauge({
  name: 'heat_deviation_score',
  help: 'Deviation score of entity heat from expected values',
  labelNames: ['entity'] as const,
  min: 0,
  max: 1
});
register.registerMetric(heatDeviationScore);

// ============================================
// HTTP Endpoints
// ============================================

/**
 * GET /metrics
 * Expose Prometheus metrics
 */
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end((err as Error).message);
  }
});

/**
 * POST /metrics/clustering/track
 * Track clustering operation duration
 */
app.post('/metrics/clustering/track', express.json(), (req, res) => {
  const { cluster_type, duration_seconds, status } = req.body;

  if (!cluster_type || duration_seconds === undefined || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  clusteringDuration.observe({ cluster_type }, duration_seconds);
  clusteringThroughput.inc({ cluster_type, status });

  res.json({ success: true });
});

/**
 * POST /metrics/anomaly/track
 * Track anomaly detection
 */
app.post('/metrics/anomaly/track', express.json(), (req, res) => {
  const { severity, type, response_time } = req.body;

  if (!severity || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  anomalyDetectionCount.inc({ severity, type });
  anomaliesActive.inc({ severity });

  if (response_time) {
    anomalyResponseTime.observe(response_time);
  }

  res.json({ success: true });
});

/**
 * POST /metrics/prediction/track
 * Track prediction generation
 */
app.post('/metrics/prediction/track', express.json(), (req, res) => {
  const { model, status, accuracy } = req.body;

  if (!model || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  predictionGenerationCount.inc({ model, status });

  if (accuracy !== undefined) {
    heatPredictionAccuracy.set({ model }, accuracy);
  }

  res.json({ success: true });
});

/**
 * POST /metrics/entity/track
 * Track entity extraction and heat
 */
app.post('/metrics/entity/track', express.json(), (req, res) => {
  const { action, entity, entity_type, heat_value, deviation_score } = req.body;

  if (action === 'extract') {
    if (!entity_type) {
      return res.status(400).json({ error: 'entity_type required' });
    }
    entityExtractionCount.inc({ entity_type });
  } else if (action === 'mention') {
    if (!entity) {
      return res.status(400).json({ error: 'entity required' });
    }
    entityMentionsCount.inc({ entity });
  } else if (action === 'update_heat') {
    if (!entity || heat_value === undefined) {
      return res.status(400).json({ error: 'entity and heat_value required' });
    }
    entityHeatValue.set({ entity }, heat_value);

    if (deviation_score !== undefined) {
      heatDeviationScore.set({ entity }, deviation_score);
    }
  }

  res.json({ success: true });
});

/**
 * POST /metrics/anomaly/close
 * Close an active anomaly
 */
app.post('/metrics/anomaly/close', express.json(), (req, res) => {
  const { severity } = req.body;

  if (!severity) {
    return res.status(400).json({ error: 'severity required' });
  }

  anomaliesActive.dec({ severity });

  res.json({ success: true });
});

// ============================================
// Start Server
// ============================================

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Prometheus metrics exporter listening on port ${PORT}`);
    console.log(`Metrics available at http://localhost:${PORT}/metrics`);
  });
}

// Export metrics for use in other modules
export {
  clusteringDuration,
  clusteringThroughput,
  anomalyDetectionCount,
  anomaliesActive,
  anomalyResponseTime,
  predictionGenerationCount,
  heatPredictionAccuracy,
  predictionErrorRate,
  entityExtractionCount,
  entityMentionsCount,
  entityCount,
  entityHeatValue,
  heatDeviationScore,
  register
};
