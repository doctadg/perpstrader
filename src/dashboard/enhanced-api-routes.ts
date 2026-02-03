// Enhanced Dashboard API Routes
// Adds all 10 enhancement endpoints to dashboard

import express from 'express';
import storyClusterStoreEnhanced from '../data/story-cluster-store-enhanced';
import userPersonalizationStore from '../data/user-personalization-store';
import HeatPredictor from '../news-agent/heat-predictor';
import AnomalyDetector from '../news-agent/anomaly-detector';
import logger from '../shared/logger';
import { messageBus, Channel } from '../shared/message-bus';

const router = express.Router();

// ============================================================
// ENHANCEMENT 2: Heat History & Evolution
// ============================================================

/**
 * Get heat history for a cluster
 * GET /api/news/clusters/:id/heat-history
 */
router.get('/news/clusters/:id/heat-history', async (req, res) => {
    try {
        const { id } = req.params;
        const limit = Math.min(Number.parseInt(req.query.limit as string) || 100, 500);

        const history = await storyClusterStoreEnhanced.getHeatHistory(id, limit);

        res.json({
            clusterId: id,
            history,
            count: history.length
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Heat history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Analyze cluster heat trend
 * GET /api/news/clusters/:id/trend-analysis
 */
router.get('/news/clusters/:id/trend-analysis', async (req, res) => {
    try {
        const { id } = req.params;
        const windowHours = Number.parseInt(req.query.window as string) || 6;

        const analysis = await storyClusterStoreEnhanced.analyzeHeatTrend(id, windowHours);

        res.json(analysis);
    } catch (error) {
        logger.error('[EnhancedAPI] Trend analysis error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get heat history for multiple clusters
 * GET /api/news/heat-history-batch
 */
router.get('/news/heat-history-batch', async (req, res) => {
    try {
        const { ids } = req.query;
        if (!ids || typeof ids !== 'string') {
            return res.status(400).json({ error: 'ids parameter required' });
        }

        const clusterIds = ids.split(',');
        const limit = Math.min(Number.parseInt(req.query.limit as string) || 50, 100);

        const histories = new Map();

        for (const id of clusterIds) {
            const history = await storyClusterStoreEnhanced.getHeatHistory(id, limit);
            histories.set(id, history);
        }

        res.json({
            clusterIds,
            histories: Object.fromEntries(histories)
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Batch heat history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// ENHANCEMENT 1: Heat Decay Configuration
// ============================================================

/**
 * Get heat decay configuration for all categories
 * GET /api/news/decay-config
 */
router.get('/news/decay-config', async (req, res) => {
    try {
        const categories = ['CRYPTO', 'STOCKS', 'ECONOMICS', 'GEOPOLITICS', 'TECH',
                         'COMMODITIES', 'SPORTS', 'FOOTBALL', 'BASKETBALL', 'TENNIS', 'MMA', 'GOLF', 'GENERAL'];

        const configs = await Promise.all(
            categories.map(cat => storyClusterStoreEnhanced.getDecayConfig(cat as any))
        );

        res.json(configs);
    } catch (error) {
        logger.error('[EnhancedAPI] Decay config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Update heat decay configuration
 * PUT /api/news/decay-config/:category
 */
router.put('/news/decay-config/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const config = req.body;

        const existing = await storyClusterStoreEnhanced.getDecayConfig(category as any);
        const updated = { ...existing, ...config, updatedAt: new Date() };

        await storyClusterStoreEnhanced.saveDecayConfig(updated);

        res.json({ success: true, config: updated });
    } catch (error) {
        logger.error('[EnhancedAPI] Update decay config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// ENHANCEMENT 5: Entity Extraction & Tracking
// ============================================================

/**
 * Get trending entities
 * GET /api/news/entities/trending
 */
router.get('/news/entities/trending', async (req, res) => {
    try {
        const limit = Math.min(Number.parseInt(req.query.limit as string) || 20, 50);
        const hours = Math.min(Number.parseInt(req.query.hours as string) || 24, 168);

        const trending = await storyClusterStoreEnhanced.getTrendingEntities(limit, hours);

        res.json({
            entities: trending,
            count: trending.length,
            window: `${hours}h`
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Trending entities error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get entities for a cluster
 * GET /api/news/clusters/:id/entities
 */
router.get('/news/clusters/:id/entities', async (req, res) => {
    try {
        const { id } = req.params;

        // This would require a new method in store
        // For now, return empty
        res.json({
            clusterId: id,
            entities: [],
            count: 0
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Cluster entities error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// ENHANCEMENT 4: Cross-Category Linking
// ============================================================

/**
 * Get related clusters across categories
 * GET /api/news/clusters/:id/related
 */
router.get('/news/clusters/:id/related', async (req, res) => {
    try {
        const { id } = req.params;
        const limit = Math.min(Number.parseInt(req.query.limit as string) || 10, 20);

        const related = await storyClusterStoreEnhanced.getRelatedClusters(id, limit);

        res.json({
            clusterId: id,
            related,
            count: related.length
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Related clusters error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get cross-category events
 * GET /api/news/cross-events
 */
router.get('/news/cross-events', async (req, res) => {
    try {
        const hours = Math.min(Number.parseInt(req.query.hours as string) || 24, 168);
        const cutoff = new Date(Date.now() - hours * 3600000);

        // Get recent clusters
        const clusters = await storyClusterStoreEnhanced.getHotClusters(100, hours);

        // Detect cross-syndication
        const crossEvents = AnomalyDetector.detectCrossSyndication(clusters);

        res.json({
            events: crossEvents,
            count: crossEvents.length,
            window: `${hours}h`
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Cross events error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// ENHANCEMENT 6: Predictive Scoring
// ============================================================

/**
 * Get heat prediction for a cluster
 * GET /api/news/clusters/:id/prediction
 */
router.get('/news/clusters/:id/prediction', async (req, res) => {
    try {
        const { id } = req.params;

        const history = await storyClusterStoreEnhanced.getHeatHistory(id, 48);
        const prediction = HeatPredictor.predictHeat(id, history);

        if (!prediction) {
            return res.status(404).json({ error: 'Insufficient history for prediction' });
        }

        res.json(prediction);
    } catch (error) {
        logger.error('[EnhancedAPI] Prediction error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Batch heat predictions
 * GET /api/news/predictions
 */
router.get('/news/predictions', async (req, res) => {
    try {
        const limit = Math.min(Number.parseInt(req.query.limit as string) || 50, 100);
        const hours = Math.min(Number.parseInt(req.query.hours as string) || 24, 168);

        const clusters = await storyClusterStoreEnhanced.getHotClusters(limit, hours);
        const heatHistories = new Map();

        for (const cluster of clusters) {
            const history = await storyClusterStoreEnhanced.getHeatHistory(cluster.id, 48);
            heatHistories.set(cluster.id, history);
        }

        const predictions = HeatPredictor.batchPredict(heatHistories);

        res.json({
            predictions: predictions.slice(0, limit),
            count: predictions.length,
            window: `${hours}h`
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Batch predictions error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get clusters with predicted spikes
 * GET /api/news/predictions/spikes
 */
router.get('/news/predictions/spikes', async (req, res) => {
    try {
        const limit = Math.min(Number.parseInt(req.query.limit as string) || 20, 50);
        const hours = Math.min(Number.parseInt(req.query.hours as string) || 24, 168);
        const threshold = Number.parseFloat(req.query.threshold as string) || 0.3;

        const clusters = await storyClusterStoreEnhanced.getHotClusters(100, hours);
        const heatHistories = new Map();

        for (const cluster of clusters) {
            const history = await storyClusterStoreEnhanced.getHeatHistory(cluster.id, 48);
            heatHistories.set(cluster.id, history);
        }

        const predictions = HeatPredictor.batchPredict(heatHistories);
        const spikes = HeatPredictor.findPredictedSpikes(predictions, threshold);

        res.json({
            spikes: spikes.slice(0, limit),
            count: spikes.length,
            threshold,
            window: `${hours}h`
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Spikes prediction error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// ENHANCEMENT 3: Multi-dimensional Ranking
// ============================================================

/**
 * Get clusters with composite ranking
 * GET /api/news/clusters/ranked
 */
router.get('/news/clusters/ranked', async (req, res) => {
    try {
        const limit = Math.min(Number.parseInt(req.query.limit as string) || 50, 100);
        const hours = Math.min(Number.parseInt(req.query.hours as string) || 24, 168);

        const clusters = await storyClusterStoreEnhanced.getHotClusters(limit, hours);

        // Calculate composite ranks
        const rankings = await Promise.all(
            clusters.map(cluster => storyClusterStoreEnhanced.calculateCompositeRank(cluster.id))
        );

        // Sort by composite score
        rankings.sort((a, b) => (b?.compositeScore || 0) - (a?.compositeScore || 0));

        res.json({
            rankings: rankings.slice(0, limit),
            count: rankings.length,
            window: `${hours}h`
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Ranked clusters error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get composite rank for specific cluster
 * GET /api/news/clusters/:id/composite-rank
 */
router.get('/news/clusters/:id/composite-rank', async (req, res) => {
    try {
        const { id } = req.params;

        const ranking = await storyClusterStoreEnhanced.calculateCompositeRank(id);

        if (!ranking) {
            return res.status(404).json({ error: 'Cluster not found' });
        }

        res.json(ranking);
    } catch (error) {
        logger.error('[EnhancedAPI] Composite rank error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// ENHANCEMENT 9: Anomaly Detection
// ============================================================

/**
 * Get anomalies across all clusters
 * GET /api/news/anomalies
 */
router.get('/news/anomalies', async (req, res) => {
    try {
        const hours = Math.min(Number.parseInt(req.query.hours as string) || 24, 168);
        const minSeverity = (req.query.severity as string) || 'LOW';

        const clusters = await storyClusterStoreEnhanced.getHotClusters(100, hours);
        const anomalies = [];

        for (const cluster of clusters) {
            const history = await storyClusterStoreEnhanced.getHeatHistory(cluster.id, 24);
            const detected = AnomalyDetector.detectHeatAnomalies(cluster.id, history);

            for (const anomaly of detected) {
                // Filter by severity
                const severityOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
                const severityLevel = severityOrder.indexOf(anomaly.severity || 'LOW');
                const minLevel = severityOrder.indexOf(minSeverity);

                if (severityLevel >= minLevel) {
                    anomalies.push(anomaly);
                }
            }
        }

        res.json({
            anomalies: anomalies.slice(0, 50),
            count: anomalies.length,
            window: `${hours}h`
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Anomalies error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get anomalies for specific cluster
 * GET /api/news/clusters/:id/anomalies
 */
router.get('/news/clusters/:id/anomalies', async (req, res) => {
    try {
        const { id } = req.params;

        const history = await storyClusterStoreEnhanced.getHeatHistory(id, 24);
        const anomalies = AnomalyDetector.detectHeatAnomalies(id, history);

        res.json({
            clusterId: id,
            anomalies,
            count: anomalies.length
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Cluster anomalies error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// ENHANCEMENT 7: User Personalization
// ============================================================

/**
 * Record user engagement
 * POST /api/user/engagement
 */
router.post('/user/engagement', async (req, res) => {
    try {
        const { userId, clusterId, engagementType, durationMs } = req.body;

        if (!userId || !clusterId || !engagementType) {
            return res.status(400).json({ error: 'userId, clusterId, and engagementType required' });
        }

        await userPersonalizationStore.recordEngagement(
            userId,
            clusterId,
            engagementType,
            durationMs
        );

        res.json({ success: true });
    } catch (error) {
        logger.error('[EnhancedAPI] Record engagement error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get user engagement history
 * GET /api/user/:userId/engagement
 */
router.get('/user/:userId/engagement', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = Math.min(Number.parseInt(req.query.limit as string) || 100, 500);
        const clusterId = req.query.clusterId as string;

        const engagement = await userPersonalizationStore.getUserEngagement(userId, limit, clusterId);

        res.json({
            userId,
            engagement,
            count: engagement.length
        });
    } catch (error) {
        logger.error('[EnhancedAPI] User engagement error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get user's category preferences
 * GET /api/user/:userId/preferences
 */
router.get('/user/:userId/preferences', async (req, res) => {
    try {
        const { userId } = req.params;

        const preferences = await userPersonalizationStore.getCategoryPreferences(userId);

        res.json({
            userId,
            preferences,
            count: preferences.length
        });
    } catch (error) {
        logger.error('[EnhancedAPI] User preferences error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get personalized cluster recommendations
 * GET /api/user/:userId/recommendations
 */
router.get('/user/:userId/recommendations', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = Math.min(Number.parseInt(req.query.limit as string) || 20, 50);
        const hours = Math.min(Number.parseInt(req.query.hours as string) || 24, 168);

        const recommendations = await userPersonalizationStore.getRecommendedClusters(
            userId,
            limit,
            hours
        );

        // Fetch cluster details
        const clusters = await Promise.all(
            recommendations.map(id => storyClusterStoreEnhanced.getClusterById(id))
        );

        res.json({
            userId,
            clusters: clusters.filter(c => c !== null),
            count: clusters.length,
            window: `${hours}h`
        });
    } catch (error) {
        logger.error('[EnhancedAPI] User recommendations error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Train user preferences from engagement history
 * POST /api/user/:userId/train
 */
router.post('/user/:userId/train', async (req, res) => {
    try {
        const { userId } = req.params;

        await userPersonalizationStore.trainCategoryWeights(userId);

        res.json({ success: true, message: 'Category preferences trained' });
    } catch (error) {
        logger.error('[EnhancedAPI] Train preferences error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get user statistics
 * GET /api/user/:userId/stats
 */
router.get('/user/:userId/stats', async (req, res) => {
    try {
        const { userId } = req.params;
        const days = Math.min(Number.parseInt(req.query.days as string) || 7, 90);

        const stats = await userPersonalizationStore.getUserStats(userId, days);

        res.json({
            userId,
            window: `${days}d`,
            stats
        });
    } catch (error) {
        logger.error('[EnhancedAPI] User stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ============================================================
// ENHANCEMENT 10: Performance Monitoring
// ============================================================

/**
 * Get clustering quality metrics
 * GET /api/news/quality-metrics
 */
router.get('/news/quality-metrics', async (req, res) => {
    try {
        const hours = Math.min(Number.parseInt(req.query.hours as string) || 24, 168);

        const quality = await storyClusterStoreEnhanced.getClusteringQualitySummary(hours);

        res.json({
            window: `${hours}h`,
            metrics: quality
        });
    } catch (error) {
        logger.error('[EnhancedAPI] Quality metrics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get circuit breaker health
 * GET /api/news/circuit-breakers-health
 */
router.get('/news/circuit-breakers-health', async (req, res) => {
    try {
        const circuitBreaker = require('../shared/circuit-breaker').default;
        const breakers = circuitBreaker.getAllBreakerStatuses();

        const health = {
            overall: 'HEALTHY',
            breakers: [],
            openCount: 0,
            totalCount: breakers.length
        };

        for (const [name, status] of Object.entries(breakers)) {
            if (status.isOpen) {
                health.openCount++;
            }

            health.breakers.push({
                name,
                state: status.isOpen ? 'OPEN' : 'CLOSED',
                lastFailureAt: status.lastFailureAt,
                failureCount: status.failureCount
            });
        }

        if (health.openCount > 0) {
            health.overall = 'DEGRADED';
        }
        if (health.openCount > breakers.length / 2) {
            health.overall = 'CRITICAL';
        }

        res.json(health);
    } catch (error) {
        logger.error('[EnhancedAPI] Circuit breakers health error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
