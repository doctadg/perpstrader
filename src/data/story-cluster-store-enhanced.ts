// Story Cluster Store - Enhanced Version
// Adds all 10 enhancements to the clustering system

import BetterSqlite3 from 'better-sqlite3';
import logger from '../shared/logger';
import crypto from 'crypto';
import { NewsItem, NewsCategory } from '../shared/types';
import { StoryCluster } from './story-cluster-store';
import {
    HeatDecayConfig,
    ClusterHeatHistory,
    NamedEntity,
    EntityClusterLink,
    ClusterCrossRef,
    ClusterHierarchy,
    UserEngagement,
    UserCategoryPreferences,
    ClusteringMetric,
    LabelQualityTracking,
    CircuitBreakerMetrics,
    CompositeRanking,
    AnomalyDetection,
    ClusterLifecycle,
    HeatPrediction,
    EntityHeat,
    ClusterHeatAnalysis,
    ClusterSimilarityResult
} from '../shared/types-enhanced';

export interface EnhancedStoryCluster extends StoryCluster {
    heatVelocity?: number;
    acceleration?: number;
    predictedHeat?: number;
    predictionConfidence?: number;
    isCrossCategory?: boolean;
    parentClusterId?: string;
    entityHeatScore?: number;
    sourceAuthorityScore?: number;
    sentimentVelocity?: number;
    marketCorrelationScore?: number;
    compositeRankScore?: number;
    isAnomaly?: boolean;
    anomalyType?: string;
    anomalyScore?: number;
    lifecycleStage?: 'EMERGING' | 'SUSTAINED' | 'DECAYING' | 'DEAD';
    peakHeat?: number;
    peakTime?: Date;
}

class StoryClusterStoreEnhanced {
    private db: BetterSqlite3.Database | null = null;
    private initialized: boolean = false;
    private dbPath: string;
    private decayConfigCache: Map<string, HeatDecayConfig> = new Map();
    private lastDecayConfigFetch: number = 0;
    private DECAY_CONFIG_CACHE_TTL = 300000; // 5 minutes

    constructor() {
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            this.db = new BetterSqlite3(this.dbPath);
            this.db.pragma('journal_mode = WAL');

            // Run migration if needed
            await this.ensureEnhancedSchema();

            this.initialized = true;
            logger.info('[StoryClusterStoreEnhanced] Initialized successfully');
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Initialization failed:', error);
            this.db = null;
        }
    }

    private async ensureEnhancedSchema(): Promise<void> {
        if (!this.db) return;

        // Check if migration has been run by looking for heat_decay_config table
        const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='heat_decay_config'").get() as any;

        if (!tables) {
            logger.info('[StoryClusterStoreEnhanced] Running enhancement migration...');
            const migrationPath = process.env.MIGRATION_PATH || './migrations/002_cluster_enhancements.sql';
            try {
                const fs = require('fs');
                const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
                this.db.exec(migrationSQL);
                logger.info('[StoryClusterStoreEnhanced] Migration completed successfully');
            } catch (error) {
                logger.error('[StoryClusterStoreEnhanced] Migration failed:', error);
                // Don't throw - continue with partial schema
            }
        }

        // Ensure all new columns exist
        this.ensureEnhancedColumns();
    }

    private ensureEnhancedColumns(): void {
        if (!this.db) return;

        const columns = new Set(
            (this.db.prepare("PRAGMA table_info('story_clusters')").all() as any[])
                .map(row => row.name)
        );

        const enhancedColumns = [
            'heat_velocity', 'acceleration', 'predicted_heat', 'prediction_confidence',
            'is_cross_category', 'parent_cluster_id', 'entity_heat_score', 'source_authority_score',
            'sentiment_velocity', 'market_correlation_score', 'composite_rank_score',
            'is_anomaly', 'anomaly_type', 'anomaly_score',
            'lifecycle_stage', 'peak_heat', 'peak_time'
        ];

        for (const col of enhancedColumns) {
            if (!columns.has(col)) {
                try {
                    const columnType = col.includes('time') || col.includes('date') ? 'TEXT' :
                                   col.includes('score') || col.includes('velocity') || col.includes('acceleration') ? 'REAL' :
                                   col.includes('is_') ? 'BOOLEAN' : 'TEXT';
                    this.db.exec(`ALTER TABLE story_clusters ADD COLUMN ${col} ${columnType}`);
                    logger.debug(`[StoryClusterStoreEnhanced] Added column: ${col}`);
                } catch (error) {
                    logger.warn(`[StoryClusterStoreEnhanced] Failed to add column ${col}:`, error);
                }
            }
        }
    }

    // ============================================================
    // ENHANCEMENT 1: Heat Decay Tuning
    // ============================================================

    /**
     * Get heat decay configuration for a category (with caching)
     */
    async getDecayConfig(category: NewsCategory): Promise<HeatDecayConfig> {
        const now = Date.now();

        // Check cache
        if (this.decayConfigCache.has(category) &&
            (now - this.lastDecayConfigFetch) < this.DECAY_CONFIG_CACHE_TTL) {
            return this.decayConfigCache.get(category)!;
        }

        await this.initialize();
        if (!this.db) {
            return this.getDefaultDecayConfig(category);
        }

        try {
            const row = this.db.prepare('SELECT * FROM heat_decay_config WHERE category = ?').get(category) as any;

            if (row) {
                const config: HeatDecayConfig = {
                    category: row.category,
                    decayConstant: row.decay_constant,
                    activityBoostHours: row.activity_boost_hours,
                    spikeMultiplier: row.spike_multiplier,
                    baseHalfLifeHours: row.base_half_life_hours,
                    description: row.description,
                    updatedAt: new Date(row.updated_at)
                };
                this.decayConfigCache.set(category, config);
                this.lastDecayConfigFetch = now;
                return config;
            }

            // Use default if not found
            const defaultConfig = this.getDefaultDecayConfig(category);
            // Save default to DB
            await this.saveDecayConfig(defaultConfig);
            return defaultConfig;
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to get decay config:', error);
            return this.getDefaultDecayConfig(category);
        }
    }

    private getDefaultDecayConfig(category: NewsCategory): HeatDecayConfig {
        const defaultConfigs: Record<string, Partial<HeatDecayConfig>> = {
            CRYPTO: { decayConstant: 0.25, baseHalfLifeHours: 3.0, description: 'Fast-paced crypto markets' },
            STOCKS: { decayConstant: 0.2, baseHalfLifeHours: 4.0, description: 'Stock market standard decay' },
            ECONOMICS: { decayConstant: 0.15, baseHalfLifeHours: 5.0, description: 'Economic events linger longer' },
            GEOPOLITICS: { decayConstant: 0.1, baseHalfLifeHours: 7.0, description: 'Geopolitical events have long tails' },
            SPORTS: { decayConstant: 0.3, baseHalfLifeHours: 2.0, description: 'Sports news decays fast' }
        };

        const config = defaultConfigs[category] || { decayConstant: 0.2, baseHalfLifeHours: 3.5 };

        return {
            category,
            decayConstant: config.decayConstant || 0.2,
            activityBoostHours: 2,
            spikeMultiplier: 1.5,
            baseHalfLifeHours: config.baseHalfLifeHours || 3.5,
            description: config.description || 'Default decay',
            updatedAt: new Date()
        };
    }

    async saveDecayConfig(config: HeatDecayConfig): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            this.db.prepare(`
                INSERT OR REPLACE INTO heat_decay_config
                (category, decay_constant, activity_boost_hours, spike_multiplier, base_half_life_hours, description, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                config.category,
                config.decayConstant,
                config.activityBoostHours,
                config.spikeMultiplier,
                config.baseHalfLifeHours,
                config.description || null,
                config.updatedAt.toISOString()
            );

            // Update cache
            this.decayConfigCache.set(config.category, config);
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to save decay config:', error);
        }
    }

    /**
     * Calculate heat score with category-specific decay
     */
    async calculateEnhancedHeat(
        article: NewsItem,
        clusterDate: Date,
        baseHeat: number = 10
    ): Promise<number> {
        const category = article.categories?.[0] || 'GENERAL' as NewsCategory;
        const config = await this.getDecayConfig(category);

        // Apply importance multiplier
        const importanceMultipliers: Record<string, number> = {
            CRITICAL: config.spikeMultiplier * 3,
            HIGH: 2,
            MEDIUM: 1.5,
            LOW: 1
        };
        const importanceMultiplier = importanceMultipliers[article.importance || 'MEDIUM'] || 1;

        let heat = baseHeat * importanceMultiplier;

        // Sentiment boost (non-neutral gets +10%)
        if (article.sentiment && article.sentiment !== 'NEUTRAL') {
            heat *= 1.1;
        }

        // Time decay
        const hoursSinceArticle = (Date.now() - (article.publishedAt?.getTime() || Date.now())) / 3600000;
        const decayFactor = Math.exp(-config.decayConstant * hoursSinceArticle);

        // Activity boost
        const hoursSinceUpdate = (Date.now() - clusterDate.getTime()) / 3600000;
        const activityBoost = hoursSinceUpdate < config.activityBoostHours ? 1.3 : 1.0;

        return heat * decayFactor * activityBoost;
    }

    // ============================================================
    // ENHANCEMENT 2: Cluster Evolution Tracking
    // ============================================================

    /**
     * Record heat history point for a cluster
     */
    async recordHeatHistory(
        clusterId: string,
        heatScore: number,
        articleCount: number,
        uniqueTitleCount: number
    ): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            const now = new Date().toISOString();

            // Calculate velocity (change from last point)
            const lastHistory = this.db.prepare(`
                SELECT heat_score FROM cluster_heat_history
                WHERE cluster_id = ?
                ORDER BY timestamp DESC LIMIT 1
            `).get(clusterId) as { heat_score: number } | undefined;

            const velocity = lastHistory ? heatScore - lastHistory.heat_score : 0;

            this.db.prepare(`
                INSERT INTO cluster_heat_history
                (cluster_id, heat_score, article_count, unique_title_count, velocity, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(clusterId, heatScore, articleCount, uniqueTitleCount, velocity, now);

            // Update cluster with current velocity
            this.db.prepare(`
                UPDATE story_clusters
                SET heat_velocity = ?,
                    updated_at = ?
                WHERE id = ?
            `).run(velocity, now, clusterId);
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to record heat history:', error);
        }
    }

    /**
     * Get heat history for a cluster
     */
    async getHeatHistory(clusterId: string, limit: number = 100): Promise<ClusterHeatHistory[]> {
        await this.initialize();
        if (!this.db) return [];

        try {
            const rows = this.db.prepare(`
                SELECT * FROM cluster_heat_history
                WHERE cluster_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `).all(clusterId, limit) as any[];

            return rows.map(row => ({
                id: row.id,
                clusterId: row.cluster_id,
                heatScore: row.heat_score,
                articleCount: row.article_count,
                uniqueTitleCount: row.unique_title_count,
                velocity: row.velocity,
                timestamp: new Date(row.timestamp)
            }));
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to get heat history:', error);
            return [];
        }
    }

    /**
     * Analyze cluster heat trajectory
     */
    async analyzeHeatTrend(clusterId: string, windowHours: number = 6): Promise<ClusterHeatAnalysis> {
        await this.initialize();
        if (!this.db) {
            return this.getEmptyHeatAnalysis(clusterId);
        }

        try {
            const cutoff = new Date(Date.now() - (windowHours * 3600000)).toISOString();

            const rows = this.db.prepare(`
                SELECT heat_score, velocity, timestamp
                FROM cluster_heat_history
                WHERE cluster_id = ? AND timestamp > ?
                ORDER BY timestamp ASC
            `).all(clusterId, cutoff) as Array<{ heat_score: number; velocity: number; timestamp: string }>;

            if (rows.length < 3) {
                return this.getEmptyHeatAnalysis(clusterId);
            }

            // Calculate acceleration (change in velocity)
            const velocities = rows.map(r => r.velocity);
            const acceleration = velocities.length > 1 ?
                (velocities[velocities.length - 1] - velocities[0]) / velocities.length : 0;

            // Determine trend
            const recentVelocity = velocities[velocities.length - 1];
            const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;

            let trend: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
            if (acceleration > 0.5) {
                trend = 'ACCELERATING';
            } else if (acceleration < -0.5) {
                trend = 'DECELERATING';
            } else {
                trend = 'STABLE';
            }

            // Predict trajectory
            let predictedTrajectory: 'SPIKE' | 'SUSTAINED' | 'DECAY';
            const confidence = Math.min(1, velocities.length / 24); // Higher confidence with more data points

            if (acceleration > 2 && recentVelocity > 10) {
                predictedTrajectory = 'SPIKE';
            } else if (acceleration > 0 && recentVelocity > 0) {
                predictedTrajectory = 'SUSTAINED';
            } else {
                predictedTrajectory = 'DECAY';
            }

            // Determine lifecycle stage
            const currentHeat = rows[rows.length - 1].heat_score;
            const maxHeat = Math.max(...rows.map(r => r.heat_score));
            const heatRatio = currentHeat / (maxHeat || 1);

            let lifecycleStage: 'EMERGING' | 'SUSTAINED' | 'DECAYING' | 'DEAD';
            if (heatRatio < 0.3 && trend === 'ACCELERATING') {
                lifecycleStage = 'EMERGING';
            } else if (heatRatio >= 0.7 && trend === 'STABLE') {
                lifecycleStage = 'SUSTAINED';
            } else if (trend === 'DECELERATING') {
                lifecycleStage = 'DECAYING';
            } else if (currentHeat < 5) {
                lifecycleStage = 'DEAD';
            } else {
                lifecycleStage = 'SUSTAINED';
            }

            return {
                clusterId,
                currentHeat,
                velocity: recentVelocity,
                acceleration,
                trend,
                predictedTrajectory,
                confidence,
                lifecycleStage
            };
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to analyze heat trend:', error);
            return this.getEmptyHeatAnalysis(clusterId);
        }
    }

    private getEmptyHeatAnalysis(clusterId: string): ClusterHeatAnalysis {
        return {
            clusterId,
            currentHeat: 0,
            velocity: 0,
            acceleration: 0,
            trend: 'STABLE',
            predictedTrajectory: 'SUSTAINED',
            confidence: 0,
            lifecycleStage: 'SUSTAINED'
        };
    }

    // ============================================================
    // ENHANCEMENT 5: Entity Extraction & Linking
    // ============================================================

    /**
     * Find or create entity
     */
    async findOrCreateEntity(
        entityName: string,
        entityType: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'TOKEN' | 'PROTOCOL' | 'COUNTRY' | 'GOVERNMENT_BODY'
    ): Promise<number> {
        await this.initialize();
        if (!this.db) return 0;

        try {
            const normalizedName = entityName.toLowerCase().trim();
            const now = new Date().toISOString();

            // Try to find existing
            const existing = this.db.prepare('SELECT id, occurrence_count FROM named_entities WHERE normalized_name = ?')
                .get(normalizedName) as { id: number; occurrence_count: number } | undefined;

            if (existing) {
                // Update last_seen and count
                this.db.prepare(`
                    UPDATE named_entities
                    SET last_seen = ?,
                        occurrence_count = occurrence_count + 1
                    WHERE id = ?
                `).run(now, existing.id);
                return existing.id;
            }

            // Create new entity
            const result = this.db.prepare(`
                INSERT INTO named_entities
                (entity_name, entity_type, normalized_name, first_seen, last_seen, occurrence_count)
                VALUES (?, ?, ?, ?, ?, 1)
            `).run(entityName, entityType, normalizedName, now, now);

            return result.lastInsertRowid as number;
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to find/create entity:', error);
            return 0;
        }
    }

    /**
     * Link entity to article
     */
    async linkEntityToArticle(
        entityId: number,
        articleId: string,
        confidence: number = 1.0
    ): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            const now = new Date().toISOString();
            this.db.prepare(`
                INSERT OR IGNORE INTO entity_article_links
                (entity_id, article_id, confidence, extracted_at)
                VALUES (?, ?, ?, ?)
            `).run(entityId, articleId, confidence, now);
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to link entity to article:', error);
        }
    }

    /**
     * Update entity-cluster heat contribution
     */
    async updateEntityClusterHeat(
        entityId: number,
        clusterId: string,
        heatContribution: number
    ): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            const now = new Date().toISOString();

            const existing = this.db.prepare(`
                SELECT article_count, heat_contribution FROM entity_cluster_links
                WHERE entity_id = ? AND cluster_id = ?
            `).get(entityId, clusterId) as { article_count: number; heat_contribution: number } | undefined;

            if (existing) {
                this.db.prepare(`
                    UPDATE entity_cluster_links
                    SET article_count = article_count + 1,
                        heat_contribution = heat_contribution + ?,
                        last_linked = ?
                    WHERE entity_id = ? AND cluster_id = ?
                `).run(heatContribution, now, entityId, clusterId);
            } else {
                this.db.prepare(`
                    INSERT INTO entity_cluster_links
                    (entity_id, cluster_id, article_count, heat_contribution, first_linked, last_linked)
                    VALUES (?, ?, 1, ?, ?, ?)
                `).run(entityId, clusterId, heatContribution, now, now);
            }
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to update entity cluster heat:', error);
        }
    }

    /**
     * Get trending entities
     */
    async getTrendingEntities(
        limit: number = 20,
        hours: number = 24
    ): Promise<EntityHeat[]> {
        await this.initialize();
        if (!this.db) return [];

        try {
            const cutoff = new Date(Date.now() - (hours * 3600000)).toISOString();

            const rows = this.db.prepare(`
                SELECT
                    e.id as entity_id,
                    e.entity_name,
                    e.entity_type,
                    SUM(ecl.heat_contribution) as total_heat,
                    COUNT(DISTINCT ecl.cluster_id) as cluster_count
                FROM named_entities e
                JOIN entity_cluster_links ecl ON e.id = ecl.entity_id
                JOIN story_clusters sc ON ecl.cluster_id = sc.id
                WHERE sc.updated_at > ?
                GROUP BY e.id
                ORDER BY total_heat DESC
                LIMIT ?
            `).all(cutoff, limit) as any[];

            return rows.map(row => {
                // Determine trending direction based on recent activity
                const recentRows = this.db.prepare(`
                    SELECT COUNT(*) as count
                    FROM entity_cluster_links ecl
                    JOIN story_clusters sc ON ecl.cluster_id = sc.id
                    WHERE ecl.entity_id = ? AND sc.updated_at > ?
                `).get(row.entity_id, cutoff) as { count: number };

                const trendingDirection = (recentRows?.count || 0) > 5 ? 'UP' : 'NEUTRAL';

                return {
                    entityId: row.entity_id,
                    entityName: row.entity_name,
                    entityType: row.entity_type,
                    totalHeat: row.total_heat,
                    clusterCount: row.cluster_count,
                    trendingDirection,
                    lastUpdated: new Date()
                };
            });
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to get trending entities:', error);
            return [];
        }
    }

    // ============================================================
    // ENHANCEMENT 4: Cross-category Linking
    // ============================================================

    /**
     * Create cross-reference between clusters
     */
    async createCrossRef(
        sourceClusterId: string,
        targetClusterId: string,
        referenceType: 'SOFT_REF' | 'RELATED' | 'PART_OF' | 'CAUSES',
        confidence: number = 0.5
    ): Promise<void> {
        await this.initialize();
        if (!this.db) return;
        if (sourceClusterId === targetClusterId) return;

        try {
            const now = new Date().toISOString();
            this.db.prepare(`
                INSERT OR IGNORE INTO cluster_cross_refs
                (source_cluster_id, target_cluster_id, reference_type, confidence, created_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(sourceClusterId, targetClusterId, referenceType, confidence, now);

            // Mark clusters as cross-category
            this.db.prepare(`
                UPDATE story_clusters
                SET is_cross_category = 1
                WHERE id IN (?, ?)
            `).run(sourceClusterId, targetClusterId);
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to create cross-ref:', error);
        }
    }

    /**
     * Create parent-child hierarchy
     */
    async createHierarchy(
        parentClusterId: string,
        childClusterId: string,
        relationshipType: 'PARENT' | 'CHILD' | 'MERGED_INTO' | 'SPLIT_FROM'
    ): Promise<void> {
        await this.initialize();
        if (!this.db) return;
        if (parentClusterId === childClusterId) return;

        try {
            const now = new Date().toISOString();
            this.db.prepare(`
                INSERT OR IGNORE INTO cluster_hierarchy
                (parent_cluster_id, child_cluster_id, relationship_type, created_at)
                VALUES (?, ?, ?, ?)
            `).run(parentClusterId, childClusterId, relationshipType, now);

            // Update child cluster parent reference
            this.db.prepare(`
                UPDATE story_clusters
                SET parent_cluster_id = ?
                WHERE id = ?
            `).run(parentClusterId, childClusterId);
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to create hierarchy:', error);
        }
    }

    /**
     * Get related clusters across categories
     */
    async getRelatedClusters(clusterId: string, limit: number = 10): Promise<ClusterCrossRef[]> {
        await this.initialize();
        if (!this.db) return [];

        try {
            const rows = this.db.prepare(`
                SELECT * FROM cluster_cross_refs
                WHERE source_cluster_id = ? OR target_cluster_id = ?
                ORDER BY confidence DESC
                LIMIT ?
            `).all(clusterId, clusterId, limit) as any[];

            return rows.map(row => ({
                id: row.id,
                sourceClusterId: row.source_cluster_id,
                targetClusterId: row.target_cluster_id,
                referenceType: row.reference_type,
                confidence: row.confidence,
                createdAt: new Date(row.created_at)
            }));
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to get related clusters:', error);
            return [];
        }
    }

    // ============================================================
    // ENHANCEMENT 3: Multi-dimensional Ranking
    // ============================================================

    /**
     * Calculate composite rank score for cluster
     */
    async calculateCompositeRank(clusterId: string): Promise<CompositeRanking | null> {
        await this.initialize();
        if (!this.db) return null;

        try {
            const row = this.db.prepare(`
                SELECT
                    sc.*,
                    (SELECT SUM(heat_contribution) FROM entity_cluster_links WHERE cluster_id = sc.id) as entity_heat
                FROM story_clusters sc
                WHERE sc.id = ?
            `).get(clusterId) as any;

            if (!row) return null;

            // Normalize components (0-1 range based on expected max)
            const maxHeat = 1000;
            const maxArticleCount = 50;
            const maxVelocity = 100;

            const heatNorm = Math.min(1, row.heat_score / maxHeat);
            const countNorm = Math.min(1, row.article_count / maxArticleCount);
            const velocityNorm = Math.min(1, Math.abs(row.heat_velocity || 0) / maxVelocity);
            const entityNorm = Math.min(1, (row.entity_heat || 0) / 100);
            const authorityNorm = row.source_authority_score || 1;

            // Weighted composite score
            const compositeScore = (
                heatNorm * 0.30 +           // Heat is most important
                countNorm * 0.25 +         // Article count matters
                velocityNorm * 0.15 +       // Trending velocity
                entityNorm * 0.15 +         // Entity relevance
                authorityNorm * 0.15         // Source authority
            );

            // Save composite score
            this.db.prepare(`
                UPDATE story_clusters
                SET composite_rank_score = ?
                WHERE id = ?
            `).run(compositeScore, clusterId);

            return {
                clusterId,
                heatScore: row.heat_score,
                articleCount: row.article_count,
                sentimentVelocity: row.sentiment_velocity || 0,
                sourceAuthorityScore: authorityNorm,
                marketCorrelationScore: row.market_correlation_score,
                entityHeatScore: row.entity_heat || 0,
                compositeScore,
                category: row.category
            };
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to calculate composite rank:', error);
            return null;
        }
    }

    // ============================================================
    // ENHANCEMENT 9: Anomaly Detection
    // ============================================================

    /**
     * Detect anomalies in cluster heat patterns
     */
    async detectHeatAnomalies(clusterId: string): Promise<AnomalyDetection> {
        await this.initialize();
        if (!this.db) {
            return { clusterId, isAnomaly: false, anomalyScore: 0, detectedAt: new Date() };
        }

        try {
            const history = await this.getHeatHistory(clusterId, 24);
            if (history.length < 5) {
                return { clusterId, isAnomaly: false, anomalyScore: 0, detectedAt: new Date() };
            }

            // Calculate statistics
            const heats = history.map(h => h.heatScore);
            const mean = heats.reduce((a, b) => a + b, 0) / heats.length;
            const stdDev = Math.sqrt(heats.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / heats.length);

            const currentHeat = heats[0];
            const zScore = stdDev > 0 ? (currentHeat - mean) / stdDev : 0;

            // Detect anomalies
            let isAnomaly = false;
            let anomalyType: string | undefined;
            let anomalyScore = Math.abs(zScore);

            if (zScore > 3) {
                isAnomaly = true;
                anomalyType = 'SUDDEN_SPIKE';
            } else if (zScore < -3) {
                isAnomaly = true;
                anomalyType = 'SUDDEN_DROP';
            }

            // Check for velocity anomalies
            const velocities = history.map(h => h.velocity);
            const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
            const currentVelocity = velocities[0];

            if (Math.abs(currentVelocity - avgVelocity) > 2 * stdDev) {
                isAnomaly = true;
                anomalyType = (anomalyType || 'VELOCITY_ANOMALY') as any;
                anomalyScore = Math.max(anomalyScore, Math.abs(currentVelocity - avgVelocity) / stdDev);
            }

            const detection: AnomalyDetection = {
                clusterId,
                isAnomaly,
                anomalyType: anomalyType as any,
                anomalyScore,
                detectedAt: new Date()
            };

            // Update cluster
            if (isAnomaly) {
                this.db.prepare(`
                    UPDATE story_clusters
                    SET is_anomaly = 1,
                        anomaly_type = ?,
                        anomaly_score = ?
                    WHERE id = ?
                `).run(anomalyType, anomalyScore, clusterId);
            } else {
                this.db.prepare(`
                    UPDATE story_clusters
                    SET is_anomaly = 0,
                        anomaly_type = NULL,
                        anomaly_score = 0
                    WHERE id = ?
                `).run(clusterId);
            }

            return detection;
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to detect anomalies:', error);
            return { clusterId, isAnomaly: false, anomalyScore: 0, detectedAt: new Date() };
        }
    }

    // ============================================================
    // ENHANCEMENT 10: Performance Monitoring
    // ============================================================

    /**
     * Record clustering metric
     */
    async recordClusteringMetric(
        metricType: 'PRECISION' | 'RECALL' | 'COHESION' | 'SEPARATION' | 'F1_SCORE',
        value: number,
        category?: string,
        sampleSize?: number,
        notes?: string
    ): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            this.db.prepare(`
                INSERT INTO clustering_metrics
                (metric_type, category, value, sample_size, calculated_at, notes)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(metricType, category, value, sampleSize, new Date().toISOString(), notes || null);
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to record clustering metric:', error);
        }
    }

    /**
     * Record label quality feedback
     */
    async recordLabelQuality(
        articleId: string,
        labelType: 'TOPIC' | 'CATEGORY' | 'SENTIMENT' | 'URGENCY',
        originalLabel: string,
        correctedLabel?: string,
        accuracyScore?: number,
        feedbackSource?: 'USER' | 'SYSTEM' | 'CROSS_CHECK'
    ): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            this.db.prepare(`
                INSERT INTO label_quality_tracking
                (article_id, label_type, original_label, corrected_label, accuracy_score, feedback_source, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(articleId, labelType, originalLabel, correctedLabel, accuracyScore, feedbackSource, new Date().toISOString());
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to record label quality:', error);
        }
    }

    /**
     * Get clustering quality summary
     */
    async getClusteringQualitySummary(hours: number = 24): Promise<Record<string, any>> {
        await this.initialize();
        if (!this.db) return {};

        try {
            const cutoff = new Date(Date.now() - (hours * 3600000)).toISOString();

            const rows = this.db.prepare(`
                SELECT
                    metric_type,
                    AVG(value) as avg_value,
                    COUNT(*) as sample_count
                FROM clustering_metrics
                WHERE calculated_at > ?
                GROUP BY metric_type
            `).all(cutoff) as any[];

            const summary: Record<string, any> = {};
            rows.forEach(row => {
                summary[row.metric_type] = {
                    average: row.avg_value,
                    sampleCount: row.sample_count
                };
            });

            return summary;
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to get quality summary:', error);
            return {};
        }
    }

    /**
     * Get hot clusters (copied from original store for API compatibility)
     */
    async getHotClusters(limit: number = 20, sinceHours: number = 24, category?: string): Promise<any[]> {
        await this.initialize();
        if (!this.db) return [];

        try {
            const cutoff = new Date(Date.now() - (sinceHours * 60 * 60 * 1000)).toISOString();

            let query = `
                SELECT * FROM story_clusters 
                WHERE updated_at > ?
            `;
            const params: any[] = [cutoff];

            if (category && category !== 'ALL') {
                query += ` AND category = ?`;
                params.push(category);
            }

            query += ` ORDER BY heat_score DESC LIMIT ?`;
            params.push(limit);

            const rows = this.db.prepare(query).all(...params) as any[];

            return rows.map(row => ({
                id: row.id,
                topic: row.topic,
                topicKey: row.topic_key || undefined,
                summary: row.summary,
                category: row.category,
                keywords: JSON.parse(row.keywords || '[]'),
                heatScore: row.heat_score,
                articleCount: row.article_count,
                uniqueTitleCount: row.unique_title_count || row.article_count,
                trendDirection: (row.trend_direction as 'UP' | 'DOWN' | 'NEUTRAL') || 'NEUTRAL',
                urgency: (row.urgency as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') || 'MEDIUM',
                subEventType: row.sub_event_type || undefined,
                firstSeen: row.first_seen ? new Date(row.first_seen) : undefined,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at)
            }));
        } catch (error) {
            logger.error('[StoryClusterStoreEnhanced] Failed to get hot clusters:', error);
            return [];
        }
    }
}

const storyClusterStoreEnhanced = new StoryClusterStoreEnhanced();
export default storyClusterStoreEnhanced;
