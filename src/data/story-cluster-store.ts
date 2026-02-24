// Story Cluster Store - SQLite
// Manages metadata for news story clusters/events

import BetterSqlite3 from 'better-sqlite3';
import logger from '../shared/logger';
import crypto from 'crypto';
import { NewsItem, NewsCategory } from '../shared/types';

export interface StoryCluster {
    id: string;
    topic: string;
    topicKey?: string;
    summary?: string;
    category: NewsCategory;
    keywords: string[];
    heatScore: number;
    articleCount: number;
    uniqueTitleCount?: number;
    trendDirection?: 'UP' | 'DOWN' | 'NEUTRAL';
    urgency?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    subEventType?: string;
    firstSeen?: Date;
    createdAt: Date;
    updatedAt: Date;
    articles?: NewsItem[];
}

class StoryClusterStore {
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

            this.db.exec(`
                CREATE TABLE IF NOT EXISTS story_clusters (
                    id TEXT PRIMARY KEY,
                    topic TEXT NOT NULL,
                    topic_key TEXT,
                    summary TEXT,
                    category TEXT NOT NULL,
                    keywords TEXT,
                    heat_score REAL DEFAULT 0,
                    article_count INTEGER DEFAULT 0,
                    trend_direction TEXT DEFAULT 'NEUTRAL',
                    urgency TEXT DEFAULT 'MEDIUM',
                    sub_event_type TEXT,
                    first_seen TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            `);

            this.db.exec(`
                CREATE TABLE IF NOT EXISTS cluster_articles (
                    cluster_id TEXT NOT NULL,
                    article_id TEXT NOT NULL,
                    added_at TEXT NOT NULL,
                    trend_direction TEXT DEFAULT 'NEUTRAL',
                    PRIMARY KEY (cluster_id, article_id),
                    FOREIGN KEY(cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE
                )
            `);

            // Table for tracking title fingerprints within clusters (for duplicate detection)
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS cluster_title_fingerprints (
                    cluster_id TEXT NOT NULL,
                    title_fingerprint TEXT NOT NULL,
                    count INTEGER DEFAULT 1,
                    first_seen TEXT NOT NULL,
                    PRIMARY KEY (cluster_id, title_fingerprint),
                    FOREIGN KEY(cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE
                )
            `);

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_clusters_heat 
                ON story_clusters(heat_score DESC)
            `);

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_clusters_updated 
                ON story_clusters(updated_at DESC)
            `);

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_clusters_category
                ON story_clusters(category)
            `);

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_clusters_topic_key
                ON story_clusters(topic_key)
            `);

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_title_fingerprints_cluster
                ON cluster_title_fingerprints(cluster_id)
            `);

            this.ensureColumns();

            this.initialized = true;
            logger.info('[StoryClusterStore] Initialized successfully');
        } catch (error) {
            logger.error('[StoryClusterStore] Initialization failed:', error);
            this.db = null;
        }
    }

    private ensureColumns(): void {
        if (!this.db) return;

        const columns = new Set(
            (this.db.prepare("PRAGMA table_info('story_clusters')").all() as any[])
                .map(row => row.name)
        );

        const newColumns = [
            { name: 'topic_key', type: 'TEXT' },
            { name: 'trend_direction', type: 'TEXT DEFAULT "NEUTRAL"' },
            { name: 'urgency', type: 'TEXT DEFAULT "MEDIUM"' },
            { name: 'sub_event_type', type: 'TEXT' },
            { name: 'first_seen', type: 'TEXT' },
            { name: 'unique_title_count', type: 'INTEGER DEFAULT 0' },
        ];

        for (const col of newColumns) {
            if (!columns.has(col.name)) {
                try {
                    this.db.exec(`ALTER TABLE story_clusters ADD COLUMN ${col.name} ${col.type}`);
                } catch (error) {
                    logger.warn(`[StoryClusterStore] Failed to add ${col.name} column:`, error);
                }
            }
        }

        const articleColumns = new Set(
            (this.db.prepare("PRAGMA table_info('cluster_articles')").all() as any[])
                .map(row => row.name)
        );

        if (!articleColumns.has('trend_direction')) {
            try {
                this.db.exec('ALTER TABLE cluster_articles ADD COLUMN trend_direction TEXT DEFAULT "NEUTRAL"');
            } catch (error) {
                logger.warn('[StoryClusterStore] Failed to add trend_direction column to cluster_articles:', error);
            }
        }
    }

    /**
     * Normalize topic key for clustering while preserving semantic meaning.
     * Preserves colons, hyphens, and other meaningful separators to prevent
     * different topics from colliding due to over-aggressive normalization.
     */
    private normalizeTopicKey(raw: string): string {
        if (!raw) return '';

        let normalized = raw.toLowerCase();

        // Replace ampersands
        normalized = normalized.replace(/&/g, ' and ');

        // Replace multiple spaces with single space, then convert to underscores
        normalized = normalized.replace(/\s+/g, ' ').trim();

        // Convert to topic key format: spaces to underscores, preserve meaningful separators
        // Keep: hyphens, colons, periods, plus signs (they often have semantic meaning)
        // Remove: quotes, parentheses, commas, slashes (use for uniformity)
        normalized = normalized
            .replace(/["'()\/\\]/g, '') // Remove quotes, parens, slashes
            .replace(/[,\s]+/g, '_')     // Commas and spaces -> underscore
            .replace(/_+/g, '_')         // Multiple underscores -> single
            .replace(/^_+|_+$/g, '');    // Trim underscores

        // Limit length but ensure we don't cut mid-word
        const maxLength = 180;
        if (normalized.length > maxLength) {
            // Find the last complete word within limit
            const truncated = normalized.slice(0, maxLength);
            const lastUnderscore = truncated.lastIndexOf('_');
            if (lastUnderscore > maxLength * 0.8) {
                normalized = truncated.slice(0, lastUnderscore);
            } else {
                normalized = truncated;
            }
        }

        return normalized;
    }

    private normalizeTopicKeyFromTopic(topic: string): string {
        return this.normalizeTopicKey(topic || '');
    }

    async clearAllClusters(): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            const txn = this.db.transaction(() => {
                this.db!.exec('DELETE FROM cluster_articles;');
                this.db!.exec('DELETE FROM story_clusters;');
            });
            txn();
        } catch (error) {
            logger.error('[StoryClusterStore] Failed to clear clusters:', error);
        }
    }

    async upsertCluster(cluster: Partial<StoryCluster> & { id: string }): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            const now = new Date().toISOString();

            const existing = this.db.prepare('SELECT created_at, first_seen FROM story_clusters WHERE id = ?').get(cluster.id) as { created_at: string; first_seen: string } | undefined;
            const createdAt = existing ? existing.created_at : now;
            const firstSeen = existing?.first_seen || now;

            this.db.prepare(`
                INSERT OR REPLACE INTO story_clusters (
                    id, topic, topic_key, summary, category, keywords,
                    heat_score, article_count, unique_title_count, trend_direction, urgency,
                    sub_event_type, first_seen, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                cluster.id,
                cluster.topic || 'Untitled Event',
                this.normalizeTopicKey(cluster.topicKey || this.normalizeTopicKeyFromTopic(cluster.topic || 'Untitled Event')),
                cluster.summary || null,
                cluster.category || 'GENERAL',
                JSON.stringify(cluster.keywords || []),
                cluster.heatScore || 0,
                cluster.articleCount || 1,
                cluster.uniqueTitleCount || cluster.articleCount || 1,
                cluster.trendDirection || 'NEUTRAL',
                cluster.urgency || 'MEDIUM',
                cluster.subEventType || null,
                firstSeen,
                createdAt,
                now
            );
        } catch (error) {
            logger.error(`[StoryClusterStore] Failed to upsert cluster ${cluster.id}:`, error);
        }
    }

    async getClusterIdByTopicKey(topic: string): Promise<string | null> {
        await this.initialize();
        if (!this.db) return null;

        const key = this.normalizeTopicKey(topic);
        if (!key) return null;

        try {
            const row = this.db.prepare(`
                SELECT id FROM story_clusters
                WHERE topic_key = ?
                ORDER BY updated_at DESC
                LIMIT 1
            `).get(key) as { id: string } | undefined;
            return row?.id || null;
        } catch (error) {
            logger.error('[StoryClusterStore] Failed to get cluster by topic_key:', error);
            return null;
        }
    }

    async getClusterById(id: string): Promise<StoryCluster | null> {
        await this.initialize();
        if (!this.db) return null;

        try {
            const row = this.db.prepare('SELECT * FROM story_clusters WHERE id = ?').get(id) as any;
            if (!row) return null;

            return {
                id: row.id,
                topic: row.topic,
                topicKey: row.topic_key || undefined,
                summary: row.summary,
                category: row.category as NewsCategory,
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
            };
        } catch (error) {
            logger.error(`[StoryClusterStore] Failed to get cluster by id ${id}:`, error);
            return null;
        }
    }

    async addArticleToCluster(
        clusterId: string,
        articleId: string,
        titleFingerprint: string,
        heatDelta: number = 0,
        trendDirection?: 'UP' | 'DOWN' | 'NEUTRAL'
    ): Promise<{ wasNew: boolean; duplicateIndex: number; penaltyMultiplier: number }> {
        await this.initialize();
        if (!this.db) return { wasNew: false, duplicateIndex: 0, penaltyMultiplier: 1.0 };

        try {
            const now = new Date().toISOString();

            const txn = this.db.transaction(() => {
                // Link article to cluster
                const linkResult = this.db!.prepare(`
                    INSERT OR IGNORE INTO cluster_articles (cluster_id, article_id, added_at, trend_direction)
                    VALUES (?, ?, ?, ?)
                `).run(clusterId, articleId, now, trendDirection || 'NEUTRAL');

                const wasNew = linkResult.changes > 0;

                // Track title fingerprint for duplicate detection
                let duplicateIndex = 0;
                let penaltyMultiplier = 1.0;

                if (wasNew && titleFingerprint) {
                    // Check if this title fingerprint already exists in the cluster
                    const existing = this.db!.prepare(`
                        SELECT count FROM cluster_title_fingerprints
                        WHERE cluster_id = ? AND title_fingerprint = ?
                    `).get(clusterId, titleFingerprint) as { count: number } | undefined;

                    if (existing) {
                        // This is a duplicate title
                        duplicateIndex = existing.count;
                        this.db!.prepare(`
                            UPDATE cluster_title_fingerprints
                            SET count = count + 1
                            WHERE cluster_id = ? AND title_fingerprint = ?
                        `).run(clusterId, titleFingerprint);
                    } else {
                        // First time seeing this title in this cluster
                        this.db!.prepare(`
                            INSERT INTO cluster_title_fingerprints (cluster_id, title_fingerprint, count, first_seen)
                            VALUES (?, ?, 1, ?)
                        `).run(clusterId, titleFingerprint, now);
                    }

                    // Calculate penalty based on duplicate index
                    // 0 = first unique, 1 = second occurrence, etc.
                    const penalties = [1.0, 0.15, 0.05, 0.02];
                    penaltyMultiplier = penalties[Math.min(duplicateIndex, penalties.length - 1)];
                }

                // Update cluster stats
                const shouldBumpHeat = wasNew && penaltyMultiplier > 0.01;
                const adjustedHeatDelta = heatDelta * penaltyMultiplier;

                this.db!.prepare(`
                    UPDATE story_clusters
                    SET article_count = (SELECT COUNT(*) FROM cluster_articles WHERE cluster_id = ?),
                        unique_title_count = (SELECT COUNT(DISTINCT title_fingerprint) FROM cluster_articles ca
                            JOIN cluster_title_fingerprints ctf ON ca.cluster_id = ctf.cluster_id
                            WHERE ca.cluster_id = ?),
                        updated_at = ?,
                        heat_score = CASE
                            WHEN ? THEN heat_score + ?
                            ELSE heat_score
                        END
                    WHERE id = ?
                `).run(clusterId, clusterId, now, shouldBumpHeat ? 1 : 0, adjustedHeatDelta, clusterId);

                return { wasNew, duplicateIndex, penaltyMultiplier };
            });

            return txn();
        } catch (error) {
            logger.error(`[StoryClusterStore] Failed to add article ${articleId} to cluster ${clusterId}:`, error);
            return { wasNew: false, duplicateIndex: 0, penaltyMultiplier: 1.0 };
        }
    }

    // Backward compatible method without title fingerprint
    async addArticleToClusterLegacy(clusterId: string, articleId: string, heatDelta: number = 0, trendDirection?: 'UP' | 'DOWN' | 'NEUTRAL'): Promise<void> {
        await this.initialize();
        if (!this.db) return;

        try {
            const now = new Date().toISOString();

            const txn = this.db.transaction(() => {
                const linkResult = this.db!.prepare(`
                    INSERT OR IGNORE INTO cluster_articles (cluster_id, article_id, added_at, trend_direction)
                    VALUES (?, ?, ?, ?)
                `).run(clusterId, articleId, now, trendDirection || 'NEUTRAL');

                const shouldBumpHeat = linkResult.changes > 0;

                this.db!.prepare(`
                    UPDATE story_clusters
                    SET article_count = (SELECT COUNT(*) FROM cluster_articles WHERE cluster_id = ?),
                        updated_at = ?,
                        heat_score = CASE
                            WHEN ? THEN heat_score + ?
                            ELSE heat_score
                        END
                    WHERE id = ?
                `).run(clusterId, now, shouldBumpHeat ? 1 : 0, heatDelta, clusterId);
            });

            txn();
        } catch (error) {
            logger.error(`[StoryClusterStore] Failed to add article ${articleId} to cluster ${clusterId}:`, error);
        }
    }

    async getHotClusters(limit: number = 20, sinceHours: number = 24, category?: NewsCategory): Promise<StoryCluster[]> {
        await this.initialize();
        if (!this.db) return [];

        try {
            const cutoff = new Date(Date.now() - (sinceHours * 60 * 60 * 1000)).toISOString();

            let query = `
                SELECT * FROM story_clusters 
                WHERE updated_at > ?
            `;
            const params: any[] = [cutoff];

            if (category && category !== 'ALL' as any) {
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
                category: row.category as NewsCategory,
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
            logger.error('[StoryClusterStore] Failed to get hot clusters:', error);
            return [];
        }
    }

    async getClusterDetails(id: string): Promise<StoryCluster | null> {
        await this.initialize();
        if (!this.db) return null;

        try {
            const row = this.db.prepare('SELECT * FROM story_clusters WHERE id = ?').get(id) as any;
            if (!row) return null;

            const articleRows = this.db.prepare(`
                SELECT n.* FROM news_articles n
                JOIN cluster_articles ca ON n.id = ca.article_id
                WHERE ca.cluster_id = ?
                ORDER BY n.created_at DESC
            `).all(id) as any[];

            const articles: NewsItem[] = articleRows.map(r => ({
                id: r.id,
                title: r.title,
                content: r.content,
                summary: r.summary,
                source: r.source,
                url: r.url,
                publishedAt: new Date(r.published_at),
                categories: JSON.parse(r.categories || '[]'),
                tags: JSON.parse(r.tags || '[]'),
                sentiment: r.sentiment as any,
                importance: r.importance as any,
                snippet: r.snippet,
                scrapedAt: new Date(r.scraped_at),
                createdAt: new Date(r.created_at)
            }));

            return {
                id: row.id,
                topic: row.topic,
                topicKey: row.topic_key || undefined,
                summary: row.summary,
                category: row.category as NewsCategory,
                keywords: JSON.parse(row.keywords || '[]'),
                heatScore: row.heat_score,
                articleCount: row.article_count,
                uniqueTitleCount: row.unique_title_count || row.article_count,
                trendDirection: (row.trend_direction as 'UP' | 'DOWN' | 'NEUTRAL') || 'NEUTRAL',
                urgency: (row.urgency as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') || 'MEDIUM',
                subEventType: row.sub_event_type || undefined,
                firstSeen: row.first_seen ? new Date(row.first_seen) : undefined,
                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
                articles
            };
        } catch (error) {
            logger.error(`[StoryClusterStore] Failed to get cluster details ${id}:`, error);
            return null;
        }
    }

    async getClusterSampleTitles(clusterId: string, limit: number = 5): Promise<string[]> {
        await this.initialize();
        if (!this.db) return [];
        if (!clusterId) return [];

        const resolvedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 20) : 5;

        try {
            const rows = this.db.prepare(`
                SELECT n.title AS title
                FROM news_articles n
                JOIN cluster_articles ca ON n.id = ca.article_id
                WHERE ca.cluster_id = ?
                ORDER BY COALESCE(n.published_at, n.created_at) DESC
                LIMIT ?
            `).all(clusterId, resolvedLimit) as Array<{ title: string }>;
            return rows.map(r => r.title).filter(Boolean);
        } catch (error) {
            logger.error('[StoryClusterStore] Failed to fetch cluster sample titles:', error);
            return [];
        }
    }

    async mergeClusters(targetClusterId: string, sourceClusterId: string): Promise<{ moved: number; deleted: boolean }>{
        await this.initialize();
        if (!this.db) return { moved: 0, deleted: false };
        if (!targetClusterId || !sourceClusterId) return { moved: 0, deleted: false };
        if (targetClusterId === sourceClusterId) return { moved: 0, deleted: false };

        try {
            const now = new Date().toISOString();

            const txn = this.db.transaction(() => {
                const sourceRow = this.db!.prepare('SELECT heat_score FROM story_clusters WHERE id = ?').get(sourceClusterId) as { heat_score: number } | undefined;
                if (!sourceRow) return { moved: 0, deleted: false };

                const insert = this.db!.prepare(`
                    INSERT OR IGNORE INTO cluster_articles (cluster_id, article_id, added_at)
                    SELECT ?, article_id, ?
                    FROM cluster_articles
                    WHERE cluster_id = ?
                `);
                const insertResult = insert.run(targetClusterId, now, sourceClusterId);

                const del = this.db!.prepare('DELETE FROM story_clusters WHERE id = ?').run(sourceClusterId);

                this.db!.prepare(`
                    UPDATE story_clusters
                    SET article_count = (SELECT COUNT(*) FROM cluster_articles WHERE cluster_id = ?),
                        heat_score = heat_score + ?,
                        updated_at = ?
                    WHERE id = ?
                `).run(targetClusterId, sourceRow.heat_score || 0, now, targetClusterId);

                return { moved: insertResult.changes || 0, deleted: del.changes > 0 };
            });

            return txn();
        } catch (error) {
            logger.error('[StoryClusterStore] Failed to merge clusters:', error);
            return { moved: 0, deleted: false };
        }
    }

    async clusterExists(clusterId: string): Promise<boolean> {
        await this.initialize();
        if (!this.db) return false;
        if (!clusterId) return false;

        try {
            const row = this.db.prepare('SELECT 1 AS ok FROM story_clusters WHERE id = ? LIMIT 1').get(clusterId) as { ok: 1 } | undefined;
            return !!row?.ok;
        } catch (error) {
            logger.error('[StoryClusterStore] Failed to check cluster existence:', error);
            return false;
        }
    }

    async findClusterIdsByArticleIds(articleIds: string[]): Promise<Map<string, string>> {
        await this.initialize();
        if (!this.db) return new Map();
        if (!articleIds.length) return new Map();

        try {
            const placeholders = articleIds.map(() => '?').join(',');
            const rows = this.db.prepare(`
                SELECT cluster_id, article_id
                FROM cluster_articles
                WHERE article_id IN (${placeholders})
            `).all(...articleIds) as Array<{ cluster_id: string; article_id: string }>;

            return new Map(rows.map(row => [row.article_id, row.cluster_id]));
        } catch (error) {
            logger.error('[StoryClusterStore] Failed to find clusters by article ids:', error);
            return new Map();
        }
    }
}

const storyClusterStore = new StoryClusterStore();
export default storyClusterStore;
