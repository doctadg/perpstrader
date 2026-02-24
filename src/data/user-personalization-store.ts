// User Personalization Store
// Manages user preferences and engagement tracking
// Supports ENHANCEMENT 7: User Personalization

import BetterSqlite3 from 'better-sqlite3';
import logger from '../shared/logger';
import { UserEngagement, UserCategoryPreferences } from '../shared/types-enhanced';

class UserPersonalizationStore {
    private db: BetterSqlite3.Database | null = null;
    private initialized: boolean = false;
    private dbPath: string;

    constructor() {
        this.dbPath = process.env.NEWS_DB_PATH || './data/news.db';
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            this.db = new BetterSqlite3(this.dbPath);
            this.db.pragma('journal_mode = WAL');

            // Tables should already exist from migration, just verify
            this.initialized = true;
            logger.info('[UserPersonalizationStore] Initialized successfully');
        } catch (error) {
            logger.error('[UserPersonalizationStore] Initialization failed:', error);
            this.db = null;
        }
    }

    /**
     * Record user engagement with a cluster
     */
    async recordEngagement(
        userId: string,
        clusterId: string,
        engagementType: 'VIEW' | 'CLICK' | 'SHARE' | 'SAVE' | 'DISMISS',
        durationMs?: number
    ): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            this.db.prepare(`
                INSERT INTO user_engagement
                (user_id, cluster_id, engagement_type, duration_ms, timestamp)
                VALUES (?, ?, ?, ?, ?)
            `).run(userId, clusterId, engagementType, durationMs || null, new Date().toISOString());
        } catch (error) {
            logger.error('[UserPersonalizationStore] Failed to record engagement:', error);
        }
    }

    /**
     * Get user's engagement history
     */
    async getUserEngagement(
        userId: string,
        limit: number = 100,
        clusterId?: string
    ): Promise<UserEngagement[]> {
        await this.initialize();
        if (!this.db) return [];

        try {
            let query = 'SELECT * FROM user_engagement WHERE user_id = ?';
            const params: any[] = [userId];

            if (clusterId) {
                query += ' AND cluster_id = ?';
                params.push(clusterId);
            }

            query += ' ORDER BY timestamp DESC LIMIT ?';
            params.push(limit);

            const rows = this.db.prepare(query).all(...params) as any[];

            return rows.map(row => ({
                id: row.id,
                userId: row.user_id,
                clusterId: row.cluster_id,
                engagementType: row.engagement_type,
                durationMs: row.duration_ms,
                timestamp: new Date(row.timestamp)
            }));
        } catch (error) {
            logger.error('[UserPersonalizationStore] Failed to get user engagement:', error);
            return [];
        }
    }

    /**
     * Get user's category preferences
     */
    async getCategoryPreferences(userId: string): Promise<UserCategoryPreferences[]> {
        await this.initialize();
        if (!this.db) return [];

        try {
            const rows = this.db.prepare(`
                SELECT * FROM user_category_preferences
                WHERE user_id = ?
                ORDER BY weight DESC
            `).all(userId) as any[];

            return rows.map(row => ({
                userId: row.user_id,
                category: row.category,
                weight: row.weight,
                lastUpdated: new Date(row.last_updated)
            }));
        } catch (error) {
            logger.error('[UserPersonalizationStore] Failed to get category preferences:', error);
            return [];
        }
    }

    /**
     * Update category weight
     */
    async updateCategoryWeight(
        userId: string,
        category: string,
        weight: number
    ): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            this.db.prepare(`
                INSERT OR REPLACE INTO user_category_preferences
                (user_id, category, weight, last_updated)
                VALUES (?, ?, ?, ?)
            `).run(userId, category, weight, new Date().toISOString());
        } catch (error) {
            logger.error('[UserPersonalizationStore] Failed to update category weight:', error);
        }
    }

    /**
     * Calculate personalized cluster weights based on user history
     */
    async calculatePersonalizedWeights(
        userId: string,
        clusterIds: string[]
    ): Promise<Map<string, number>> {
        await this.initialize();
        if (!this.db) {
            // Return neutral weights if DB unavailable
            return new Map(clusterIds.map(id => [id, 1.0]));
        }

        try {
            const weights = new Map<string, number>();

            // Get user's category preferences
            const categoryPrefs = await this.getCategoryPreferences(userId);
            const categoryWeightMap = new Map(
                categoryPrefs.map(p => [p.category, p.weight])
            );

            // Get recent engagements
            const recentEngagements = await this.getUserEngagement(userId, 500);

            // Calculate engagement frequency per cluster
            const engagementFreq = new Map<string, number>();
            for (const eng of recentEngagements) {
                const count = engagementFreq.get(eng.clusterId) || 0;
                engagementFreq.set(eng.clusterId, count + 1);

                // Boost category weight on engagement
                const typeBoost: Record<string, number> = {
                    VIEW: 0.01,
                    CLICK: 0.05,
                    SHARE: 0.1,
                    SAVE: 0.15,
                    DISMISS: -0.1
                };

                const boost = typeBoost[eng.engagementType] || 0;
                const currentWeight = categoryWeightMap.get(eng.clusterId) || 1.0;
                categoryWeightMap.set(eng.clusterId, Math.max(0.1, currentWeight + boost));
            }

            // Calculate personalized weight for each cluster
            for (const clusterId of clusterIds) {
                let weight = 1.0;

                // Category weight
                const cluster = await this.db.prepare('SELECT category FROM story_clusters WHERE id = ?')
                    .get(clusterId) as { category: string } | undefined;

                if (cluster) {
                    const categoryWeight = categoryWeightMap.get(cluster.category) || 1.0;
                    weight *= categoryWeight;
                }

                // Engagement frequency boost
                const freq = engagementFreq.get(clusterId) || 0;
                weight *= 1 + (freq * 0.1);

                // Normalize
                weights.set(clusterId, weight);
            }

            return weights;
        } catch (error) {
            logger.error('[UserPersonalizationStore] Failed to calculate personalized weights:', error);
            return new Map(clusterIds.map(id => [id, 1.0]));
        }
    }

    /**
     * Get recommended clusters for user
     */
    async getRecommendedClusters(
        userId: string,
        limit: number = 20,
        hours: number = 24
    ): Promise<string[]> {
        await this.initialize();
        if (!this.db) return [];

        try {
            // Get user's category preferences
            const categoryPrefs = await this.getCategoryPreferences(userId);

            if (categoryPrefs.length === 0) {
                // No preferences, return hot clusters
                const clusters = await this.db.prepare(`
                    SELECT id FROM story_clusters
                    WHERE updated_at > ?
                    ORDER BY heat_score DESC
                    LIMIT ?
                `).all(new Date(Date.now() - hours * 3600000).toISOString(), limit) as any[];

                return clusters.map(c => c.id);
            }

            // Build weighted query based on preferences
            const categoryWeights = categoryPrefs.map(p =>
                `(category = '${p.category}' * ${p.weight})`
            ).join(' + ');

            const query = `
                SELECT id FROM story_clusters
                WHERE updated_at > ?
                ORDER BY (${categoryWeights}) * heat_score DESC
                LIMIT ?
            `;

            const rows = this.db.prepare(query).all(
                new Date(Date.now() - hours * 3600000).toISOString(),
                limit
            ) as any[];

            return rows.map(r => r.id);
        } catch (error) {
            logger.error('[UserPersonalizationStore] Failed to get recommended clusters:', error);
            return [];
        }
    }

    /**
     * Train category weights from user behavior
     */
    async trainCategoryWeights(userId: string): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            // Get recent engagements (last 30 days)
            const cutoff = new Date(Date.now() - 30 * 24 * 3600000).toISOString();

            const rows = this.db.prepare(`
                SELECT
                    sc.category,
                    ue.engagement_type,
                    COUNT(*) as count
                FROM user_engagement ue
                JOIN story_clusters sc ON ue.cluster_id = sc.id
                WHERE ue.user_id = ? AND ue.timestamp > ?
                GROUP BY sc.category, ue.engagement_type
            `).all(userId, cutoff) as Array<{ category: string; engagement_type: string; count: number }>;

            // Calculate category weights
            const categoryScores = new Map<string, number>();

            for (const row of rows) {
                const currentScore = categoryScores.get(row.category) || 0;

                const typeWeights: Record<string, number> = {
                    VIEW: 1,
                    CLICK: 3,
                    SHARE: 5,
                    SAVE: 7,
                    DISMISS: -10
                };

                const weight = typeWeights[row.engagement_type] || 0;
                categoryScores.set(row.category, currentScore + (weight * row.count));
            }

            // Normalize weights to 0.1-2.0 range
            const scores = Array.from(categoryScores.values());
            const maxScore = Math.max(...scores, 1);
            const minScore = Math.min(...scores, -10);

            for (const [category, score] of categoryScores) {
                const normalizedScore = (score - minScore) / (maxScore - minScore);
                const weight = 0.1 + (normalizedScore * 1.9); // 0.1 to 2.0

                await this.updateCategoryWeight(userId, category, weight);
            }

            logger.info(`[UserPersonalizationStore] Trained category weights for user ${userId}`);
        } catch (error) {
            logger.error('[UserPersonalizationStore] Failed to train category weights:', error);
        }
    }

    /**
     * Get user engagement statistics
     */
    async getUserStats(userId: string, days: number = 7): Promise<any> {
        await this.initialize();
        if (!this.db) return {};

        try {
            const cutoff = new Date(Date.now() - days * 24 * 3600000).toISOString();

            const rows = this.db.prepare(`
                SELECT
                    engagement_type,
                    COUNT(*) as count,
                    SUM(COALESCE(duration_ms, 0)) as total_duration_ms
                FROM user_engagement
                WHERE user_id = ? AND timestamp > ?
                GROUP BY engagement_type
            `).all(userId, cutoff) as any[];

            const stats: any = {
                totalEngagements: 0,
                byType: {},
                totalDurationMs: 0,
                avgDurationMs: 0,
                topCategories: []
            };

            for (const row of rows) {
                stats.byType[row.engagement_type] = {
                    count: row.count,
                    totalDurationMs: row.total_duration_ms
                };

                stats.totalEngagements += row.count;
                stats.totalDurationMs += row.total_duration_ms || 0;
            }

            // Calculate average duration
            const durationRows = rows.filter(r => r.total_duration_ms > 0);
            if (durationRows.length > 0) {
                stats.avgDurationMs = stats.totalDurationMs / stats.totalEngagements;
            }

            // Get top categories
            const categoryRows = this.db.prepare(`
                SELECT
                    sc.category,
                    COUNT(*) as count
                FROM user_engagement ue
                JOIN story_clusters sc ON ue.cluster_id = sc.id
                WHERE ue.user_id = ? AND ue.timestamp > ?
                GROUP BY sc.category
                ORDER BY count DESC
                LIMIT 5
            `).all(userId, cutoff) as any[];

            stats.topCategories = categoryRows;

            return stats;
        } catch (error) {
            logger.error('[UserPersonalizationStore] Failed to get user stats:', error);
            return {};
        }
    }
}

const userPersonalizationStore = new UserPersonalizationStore();
export default userPersonalizationStore;
