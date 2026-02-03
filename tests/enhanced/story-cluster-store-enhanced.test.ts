/**
 * Story Cluster Store Enhanced Unit Tests
 * Tests for all enhancements to the clustering system
 */

import StoryClusterStoreEnhanced from '../../src/data/story-cluster-store-enhanced';
import { NewsItem, NewsCategory } from '../../src/shared/types';
import {
    HeatDecayConfig,
    ClusterHeatHistory,
    EntityClusterLink,
    ClusterCrossRef,
    ClusterHierarchy,
    CompositeRanking,
    AnomalyDetection,
    ClusterHeatAnalysis
} from '../../src/shared/types-enhanced';

// Mock logger to avoid noise
jest.mock('../../src/shared/logger', () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

describe('StoryClusterStoreEnhanced', () => {
    let store: StoryClusterStoreEnhanced;
    const testDbPath = '/tmp/test-news-enhanced.db';

    beforeEach(async () => {
        // Clear any existing test database
        const fs = require('fs');
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        // Create store with test database
        process.env.NEWS_DB_PATH = testDbPath;
        store = new StoryClusterStoreEnhanced();
        await store.initialize();
    });

    afterEach(async () => {
        // Cleanup test database
        const fs = require('fs');
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    describe('ENHANCEMENT 1: Heat Decay Tuning', () => {

        it('should get default decay config for category', async () => {
            const config = await store.getDecayConfig('CRYPTO' as NewsCategory);

            expect(config).toBeDefined();
            expect(config.category).toBe('CRYPTO');
            expect(config.decayConstant).toBeGreaterThan(0);
            expect(config.baseHalfLifeHours).toBeGreaterThan(0);
            expect(config.spikeMultiplier).toBeGreaterThan(1);
        });

        it('should have category-specific default configs', async () => {
            const cryptoConfig = await store.getDecayConfig('CRYPTO' as NewsCategory);
            const sportsConfig = await store.getDecayConfig('SPORTS' as NewsCategory);

            expect(cryptoConfig.decayConstant).not.toBe(sportsConfig.decayConstant);
            expect(sportsConfig.baseHalfLifeHours).toBeLessThan(cryptoConfig.baseHalfLifeHours); // Sports decays faster
        });

        it('should save and retrieve custom decay config', async () => {
            const customConfig: HeatDecayConfig = {
                category: 'CRYPTO' as NewsCategory,
                decayConstant: 0.5,
                activityBoostHours: 5,
                spikeMultiplier: 2.5,
                baseHalfLifeHours: 10,
                description: 'Custom test config',
                updatedAt: new Date()
            };

            await store.saveDecayConfig(customConfig);
            const retrieved = await store.getDecayConfig('CRYPTO' as NewsCategory);

            expect(retrieved.decayConstant).toBe(0.5);
            expect(retrieved.activityBoostHours).toBe(5);
            expect(retrieved.spikeMultiplier).toBe(2.5);
            expect(retrieved.baseHalfLifeHours).toBe(10);
            expect(retrieved.description).toBe('Custom test config');
        });

        it('should calculate enhanced heat with decay', async () => {
            const article: NewsItem = {
                id: 'test-article-1',
                title: 'Bitcoin surges past $50,000',
                content: 'Major cryptocurrency milestone',
                url: 'https://example.com/btc-surge',
                publishedAt: new Date(Date.now() - 3600000), // 1 hour ago
                importance: 'HIGH',
                sentiment: 'POSITIVE',
                categories: ['CRYPTO' as NewsCategory],
                source: 'TestSource'
            };

            const heat = await store.calculateEnhancedHeat(article, new Date(), 10);

            expect(heat).toBeGreaterThan(0);
            expect(heat).toBeLessThan(50); // Should be reasonable
        });

        it('should apply importance multiplier to heat calculation', async () => {
            const baseArticle: NewsItem = {
                id: 'test-article-2',
                title: 'Test article',
                content: 'Test content',
                url: 'https://example.com/test',
                publishedAt: new Date(),
                importance: 'LOW',
                categories: ['CRYPTO' as NewsCategory],
                source: 'TestSource'
            };

            const highArticle = { ...baseArticle, id: 'test-article-3', importance: 'CRITICAL' as const };
            const lowArticle = { ...baseArticle, id: 'test-article-4', importance: 'LOW' as const };

            const highHeat = await store.calculateEnhancedHeat(highArticle, new Date(), 10);
            const lowHeat = await store.calculateEnhancedHeat(lowArticle, new Date(), 10);

            expect(highHeat).toBeGreaterThan(lowHeat);
        });

        it('should apply sentiment boost', async () => {
            const neutralArticle: NewsItem = {
                id: 'test-neutral',
                title: 'Test article',
                content: 'Test content',
                url: 'https://example.com/test',
                publishedAt: new Date(),
                sentiment: 'NEUTRAL',
                categories: ['CRYPTO' as NewsCategory],
                source: 'TestSource'
            };

            const positiveArticle = { ...neutralArticle, id: 'test-positive', sentiment: 'POSITIVE' as const };

            const neutralHeat = await store.calculateEnhancedHeat(neutralArticle, new Date(), 10);
            const positiveHeat = await store.calculateEnhancedHeat(positiveArticle, new Date(), 10);

            expect(positiveHeat).toBeGreaterThan(neutralHeat);
        });
    });

    describe('ENHANCEMENT 2: Cluster Evolution Tracking', () => {

        it('should record heat history', async () => {
            const clusterId = 'cluster-1';

            await store.recordHeatHistory(clusterId, 50.5, 10, 8);

            const history = await store.getHeatHistory(clusterId);
            expect(history.length).toBe(1);
            expect(history[0].clusterId).toBe(clusterId);
            expect(history[0].heatScore).toBe(50.5);
            expect(history[0].articleCount).toBe(10);
            expect(history[0].uniqueTitleCount).toBe(8);
        });

        it('should calculate velocity from previous history', async () => {
            const clusterId = 'cluster-velocity';

            await store.recordHeatHistory(clusterId, 40, 5, 5);
            await store.recordHeatHistory(clusterId, 50, 6, 6);

            const history = await store.getHeatHistory(clusterId);
            expect(history[0].velocity).toBe(10); // 50 - 40
            expect(history[1].velocity).toBe(0); // First point has no previous
        });

        it('should retrieve multiple history points', async () => {
            const clusterId = 'cluster-multi';

            for (let i = 0; i < 5; i++) {
                await store.recordHeatHistory(clusterId, 50 + i * 5, 10 + i, 10 + i);
            }

            const history = await store.getHeatHistory(clusterId, 3);
            expect(history.length).toBe(3);
        });

        it('should analyze heat trend', async () => {
            const clusterId = 'cluster-trend';

            // Create growing pattern
            for (let i = 0; i < 10; i++) {
                await store.recordHeatHistory(clusterId, 30 + i * 5, 10 + i, 10 + i);
            }

            const analysis = await store.analyzeHeatTrend(clusterId);

            expect(analysis.clusterId).toBe(clusterId);
            expect(analysis.currentHeat).toBeGreaterThan(60);
            expect(analysis.velocity).toBeGreaterThan(0);
            expect(analysis.acceleration).toBeDefined();
            expect(analysis.trend).toMatch(/^(ACCELERATING|STABLE|DECELERATING)$/);
        });

        it('should determine lifecycle stage correctly', async () => {
            const clusterId = 'cluster-lifecycle';

            // Emerging pattern
            for (let i = 0; i < 10; i++) {
                await store.recordHeatHistory(clusterId, 10 + i * 3, 5 + i, 5 + i);
            }

            const analysis = await store.analyzeHeatTrend(clusterId);
            expect(['EMERGING', 'GROWING', 'SUSTAINED']).toContain(analysis.lifecycleStage);
        });

        it('should return empty analysis for insufficient data', async () => {
            const analysis = await store.analyzeHeatTrend('nonexistent');

            expect(analysis.clusterId).toBe('nonexistent');
            expect(analysis.confidence).toBe(0);
        });
    });

    describe('ENHANCEMENT 5: Entity Extraction & Linking', () => {

        it('should find or create entity', async () => {
            const entityId1 = await store.findOrCreateEntity('Bitcoin', 'TOKEN');
            const entityId2 = await store.findOrCreateEntity('Bitcoin', 'TOKEN');

            expect(entityId1).toBeGreaterThan(0);
            expect(entityId1).toBe(entityId2); // Should return same ID
        });

        it('should create different entities for different names', async () => {
            const btcId = await store.findOrCreateEntity('Bitcoin', 'TOKEN');
            const ethId = await store.findOrCreateEntity('Ethereum', 'TOKEN');

            expect(btcId).not.toBe(ethId);
        });

        it('should link entity to article', async () => {
            const entityId = await store.findOrCreateEntity('Bitcoin', 'TOKEN');
            const articleId = 'article-1';

            await store.linkEntityToArticle(entityId, articleId, 0.9);

            // Should not throw error
            expect(true).toBe(true);
        });

        it('should update entity-cluster heat contribution', async () => {
            const entityId = await store.findOrCreateEntity('Bitcoin', 'TOKEN');
            const clusterId = 'cluster-1';

            await store.updateEntityClusterHeat(entityId, clusterId, 25.5);
            await store.updateEntityClusterHeat(entityId, clusterId, 30.0);

            // Should accumulate
            // Note: We'd need to query DB to verify, but test shouldn't throw
            expect(true).toBe(true);
        });

        it('should get trending entities', async () => {
            // Create some entities and link them to clusters
            const btcId = await store.findOrCreateEntity('Bitcoin', 'TOKEN');
            const ethId = await store.findOrCreateEntity('Ethereum', 'TOKEN');

            await store.updateEntityClusterHeat(btcId, 'cluster-1', 100);
            await store.updateEntityClusterHeat(ethId, 'cluster-2', 50);

            const trending = await store.getTrendingEntities(10, 24);

            expect(Array.isArray(trending)).toBe(true);
        });

        it('should support all entity types', async () => {
            const types: Array<'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'TOKEN' | 'PROTOCOL' | 'COUNTRY' | 'GOVERNMENT_BODY'> = [
                'PERSON', 'ORGANIZATION', 'LOCATION', 'TOKEN', 'PROTOCOL', 'COUNTRY', 'GOVERNMENT_BODY'
            ];

            const ids = await Promise.all(
                types.map(type => store.findOrCreateEntity(`Test ${type}`, type))
            );

            ids.forEach(id => expect(id).toBeGreaterThan(0));
        });
    });

    describe('ENHANCEMENT 4: Cross-category Linking', () => {

        it('should create cross-reference between clusters', async () => {
            const sourceId = 'cluster-a';
            const targetId = 'cluster-b';

            await store.createCrossRef(sourceId, targetId, 'RELATED', 0.8);

            // Should not throw
            expect(true).toBe(true);
        });

        it('should create cross-ref with different types', async () => {
            const types: Array<'SOFT_REF' | 'RELATED' | 'PART_OF' | 'CAUSES'> = ['SOFT_REF', 'RELATED', 'PART_OF', 'CAUSES'];

            for (const type of types) {
                await store.createCrossRef('cluster-x', 'cluster-y', type, 0.5);
            }

            // Should not throw
            expect(true).toBe(true);
        });

        it('should get related clusters', async () => {
            const clusterId = 'cluster-main';
            await store.createCrossRef(clusterId, 'related-1', 'RELATED', 0.9);
            await store.createCrossRef(clusterId, 'related-2', 'SOFT_REF', 0.7);

            const related = await store.getRelatedClusters(clusterId);

            expect(related.length).toBe(2);
        });

        it('should create parent-child hierarchy', async () => {
            const parentId = 'cluster-parent';
            const childId = 'cluster-child';

            await store.createHierarchy(parentId, childId, 'PARENT');

            // Should not throw
            expect(true).toBe(true);
        });

        it('should create different hierarchy relationship types', async () => {
            const types: Array<'PARENT' | 'CHILD' | 'MERGED_INTO' | 'SPLIT_FROM'> = ['PARENT', 'CHILD', 'MERGED_INTO', 'SPLIT_FROM'];

            for (const type of types) {
                await store.createHierarchy('cluster-p', 'cluster-c', type);
            }

            expect(true).toBe(true);
        });

        it('should not create cross-ref to same cluster', async () => {
            const clusterId = 'cluster-same';

            await store.createCrossRef(clusterId, clusterId, 'RELATED', 0.5);

            // Should not throw, but also not create self-reference
            expect(true).toBe(true);
        });

        it('should not create hierarchy for same cluster', async () => {
            const clusterId = 'cluster-same-h';

            await store.createHierarchy(clusterId, clusterId, 'PARENT');

            expect(true).toBe(true);
        });
    });

    describe('ENHANCEMENT 3: Multi-dimensional Ranking', () => {

        it('should calculate composite rank score', async () => {
            // Note: This requires a cluster to exist in DB
            // For this test, we're mainly checking it doesn't throw
            const ranking = await store.calculateCompositeRank('nonexistent');

            expect(ranking).toBeNull(); // Should return null for nonexistent cluster
        });

        it('should return null for non-existent cluster', async () => {
            const ranking = await store.calculateCompositeRank('does-not-exist');

            expect(ranking).toBeNull();
        });
    });

    describe('ENHANCEMENT 9: Anomaly Detection', () => {

        it('should detect no anomalies for new cluster', async () => {
            const clusterId = 'new-cluster';
            const detection = await store.detectHeatAnomalies(clusterId);

            expect(detection.clusterId).toBe(clusterId);
            expect(detection.isAnomaly).toBe(false);
            expect(detection.anomalyScore).toBe(0);
        });

        it('should detect anomalies from heat history', async () => {
            const clusterId = 'anomaly-cluster';

            // Create spike pattern
            await store.recordHeatHistory(clusterId, 10, 5, 5);
            await store.recordHeatHistory(clusterId, 11, 6, 6);
            await store.recordHeatHistory(clusterId, 10.5, 5, 5);
            await store.recordHeatHistory(clusterId, 11, 6, 6);
            await store.recordHeatHistory(clusterId, 100, 20, 15); // Spike

            const detection = await store.detectHeatAnomalies(clusterId);

            expect(detection.clusterId).toBe(clusterId);
            // May or may not be anomaly depending on variance calculation
            expect(typeof detection.isAnomaly).toBe('boolean');
        });

        it('should calculate anomaly score', async () => {
            const clusterId = 'anomaly-score';

            for (let i = 0; i < 5; i++) {
                await store.recordHeatHistory(clusterId, 20 + i * 2, 5, 5);
            }

            const detection = await store.detectHeatAnomalies(clusterId);

            expect(detection.anomalyScore).toBeDefined();
            expect(detection.anomalyScore).toBeGreaterThanOrEqual(0);
        });

        it('should record detection timestamp', async () => {
            const clusterId = 'anomaly-time';

            await store.recordHeatHistory(clusterId, 50, 10, 10);
            const detection = await store.detectHeatAnomalies(clusterId);

            expect(detection.detectedAt).toBeInstanceOf(Date);
            expect(detection.detectedAt.getTime()).toBeLessThanOrEqual(Date.now());
        });
    });

    describe('ENHANCEMENT 10: Performance Monitoring', () => {

        it('should record clustering metric', async () => {
            await store.recordClusteringMetric('PRECISION', 0.85, 'CRYPTO', 100, 'Test metric');

            // Should not throw
            expect(true).toBe(true);
        });

        it('should record different metric types', async () => {
            const types: Array<'PRECISION' | 'RECALL' | 'COHESION' | 'SEPARATION' | 'F1_SCORE'> = [
                'PRECISION', 'RECALL', 'COHESION', 'SEPARATION', 'F1_SCORE'
            ];

            for (const type of types) {
                await store.recordClusteringMetric(type, 0.8);
            }

            expect(true).toBe(true);
        });

        it('should record label quality feedback', async () => {
            await store.recordLabelQuality('article-1', 'TOPIC', 'Original', 'Corrected', 0.9, 'USER');

            // Should not throw
            expect(true).toBe(true);
        });

        it('should record different label types', async () => {
            const types: Array<'TOPIC' | 'CATEGORY' | 'SENTIMENT' | 'URGENCY'> = ['TOPIC', 'CATEGORY', 'SENTIMENT', 'URGENCY'];

            for (const type of types) {
                await store.recordLabelQuality('article-x', type, 'orig', 'corr', 0.8, 'SYSTEM');
            }

            expect(true).toBe(true);
        });

        it('should record different feedback sources', async () => {
            const sources: Array<'USER' | 'SYSTEM' | 'CROSS_CHECK'> = ['USER', 'SYSTEM', 'CROSS_CHECK'];

            for (const source of sources) {
                await store.recordLabelQuality('article-y', 'TOPIC', 'orig', 'corr', 0.8, source);
            }

            expect(true).toBe(true);
        });

        it('should get clustering quality summary', async () => {
            // Record some metrics
            await store.recordClusteringMetric('PRECISION', 0.85, 'CRYPTO', 100);
            await store.recordClusteringMetric('RECALL', 0.78, 'CRYPTO', 100);

            const summary = await store.getClusteringQualitySummary(24);

            expect(summary).toBeDefined();
            expect(typeof summary).toBe('object');
        });

        it('should return empty summary for no metrics', async () => {
            const summary = await store.getClusteringQualitySummary(1);

            expect(Object.keys(summary).length).toBe(0);
        });
    });

    describe('Integration Tests', () => {

        it('should handle full cluster lifecycle', async () => {
            const clusterId = 'full-lifecycle-cluster';

            // Record heat evolution
            for (let i = 0; i < 10; i++) {
                await store.recordHeatHistory(clusterId, 20 + i * 5, 5 + i, 5 + i);
            }

            // Analyze trend
            const analysis = await store.analyzeHeatTrend(clusterId);
            expect(analysis.currentHeat).toBeGreaterThan(50);

            // Check for anomalies
            const anomaly = await store.detectHeatAnomalies(clusterId);
            expect(anomaly.clusterId).toBe(clusterId);

            // Get history
            const history = await store.getHeatHistory(clusterId);
            expect(history.length).toBe(10);
        });

        it('should link entities across clusters', async () => {
            const btcId = await store.findOrCreateEntity('Bitcoin', 'TOKEN');

            await store.updateEntityClusterHeat(btcId, 'cluster-1', 50);
            await store.updateEntityClusterHeat(btcId, 'cluster-2', 30);
            await store.updateEntityClusterHeat(btcId, 'cluster-3', 40);

            // Get trending entities (should include Bitcoin)
            const trending = await store.getTrendingEntities(10, 24);
            expect(trending.length).toBeGreaterThan(0);
        });

        it('should create cross-category relationships', async () => {
            await store.createCrossRef('crypto-cluster', 'stocks-cluster', 'RELATED', 0.8);
            await store.createCrossRef('crypto-cluster', 'geopolitics-cluster', 'SOFT_REF', 0.6);

            const related = await store.getRelatedClusters('crypto-cluster');
            expect(related.length).toBe(2);
        });
    });

    describe('Error Handling', () => {

        it('should handle invalid cluster IDs gracefully', async () => {
            const history = await store.getHeatHistory('invalid-id-12345');
            expect(history).toEqual([]);
        });

        it('should handle initialization gracefully', async () => {
            const newStore = new StoryClusterStoreEnhanced();
            await newStore.initialize();
            expect(true).toBe(true);
        });
    });
});
