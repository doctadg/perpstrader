-- ============================================================
-- ENHANCEMENT 2: Cluster Evolution Tracking
-- ============================================================

-- Heat history table for tracking cluster heat over time
CREATE TABLE IF NOT EXISTS cluster_heat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id TEXT NOT NULL,
    heat_score REAL NOT NULL,
    article_count INTEGER NOT NULL,
    unique_title_count INTEGER NOT NULL,
    velocity REAL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_heat_history_cluster_time
    ON cluster_heat_history(cluster_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_heat_history_time
    ON cluster_heat_history(timestamp DESC);

-- ============================================================
-- ENHANCEMENT 5: Entity Extraction & Linking
-- ============================================================

-- Named entities extracted from news articles
CREATE TABLE IF NOT EXISTS named_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,  -- PERSON, ORGANIZATION, LOCATION, TOKEN, PROTOCOL, COUNTRY, GOVERNMENT_BODY
    normalized_name TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    is_verified BOOLEAN DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_normalized
    ON named_entities(normalized_name);

CREATE INDEX IF NOT EXISTS idx_entities_type
    ON named_entities(entity_type);

CREATE INDEX IF NOT EXISTS idx_entities_name
    ON named_entities(entity_name);

-- Entity-article links
CREATE TABLE IF NOT EXISTS entity_article_links (
    entity_id INTEGER NOT NULL,
    article_id TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    extracted_at TEXT NOT NULL,
    PRIMARY KEY (entity_id, article_id),
    FOREIGN KEY(entity_id) REFERENCES named_entities(id) ON DELETE CASCADE,
    FOREIGN KEY(article_id) REFERENCES news_articles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entity_links_article
    ON entity_article_links(article_id);

CREATE INDEX IF NOT EXISTS idx_entity_links_entity
    ON entity_article_links(entity_id);

-- Entity-cluster links for entity-centric heat tracking
CREATE TABLE IF NOT EXISTS entity_cluster_links (
    entity_id INTEGER NOT NULL,
    cluster_id TEXT NOT NULL,
    article_count INTEGER DEFAULT 0,
    heat_contribution REAL DEFAULT 0,
    first_linked TEXT NOT NULL,
    last_linked TEXT NOT NULL,
    PRIMARY KEY (entity_id, cluster_id),
    FOREIGN KEY(entity_id) REFERENCES named_entities(id) ON DELETE CASCADE,
    FOREIGN KEY(cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entity_clusters_cluster
    ON entity_cluster_links(cluster_id);

CREATE INDEX IF NOT EXISTS idx_entity_clusters_entity
    ON entity_cluster_links(entity_id);

-- ============================================================
-- ENHANCEMENT 4: Cross-category Linking
-- ============================================================

-- Cross-references between clusters in different categories
CREATE TABLE IF NOT EXISTS cluster_cross_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_cluster_id TEXT NOT NULL,
    target_cluster_id TEXT NOT NULL,
    reference_type TEXT NOT NULL,  -- SOFT_REF, RELATED, PART_OF, CAUSES
    confidence REAL DEFAULT 0.5,
    created_at TEXT NOT NULL,
    FOREIGN KEY(source_cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE,
    FOREIGN KEY(target_cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cross_refs_unique
    ON cluster_cross_refs(source_cluster_id, target_cluster_id);

CREATE INDEX IF NOT EXISTS idx_cross_refs_source
    ON cluster_cross_refs(source_cluster_id);

CREATE INDEX IF NOT EXISTS idx_cross_refs_target
    ON cluster_cross_refs(target_cluster_id);

-- Parent-child cluster hierarchy for mega-events
CREATE TABLE IF NOT EXISTS cluster_hierarchy (
    parent_cluster_id TEXT NOT NULL,
    child_cluster_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,  -- PARENT, CHILD, MERGED_INTO, SPLIT_FROM
    created_at TEXT NOT NULL,
    PRIMARY KEY (parent_cluster_id, child_cluster_id),
    FOREIGN KEY(parent_cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE,
    FOREIGN KEY(child_cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hierarchy_parent
    ON cluster_hierarchy(parent_cluster_id);

CREATE INDEX IF NOT EXISTS idx_hierarchy_child
    ON cluster_hierarchy(child_cluster_id);

-- ============================================================
-- ENHANCEMENT 7: User Personalization
-- ============================================================

-- User engagement tracking (if user system exists)
CREATE TABLE IF NOT EXISTS user_engagement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,  -- External user ID
    cluster_id TEXT NOT NULL,
    engagement_type TEXT NOT NULL,  -- VIEW, CLICK, SHARE, SAVE, DISMISS
    duration_ms INTEGER,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_engagement_user
    ON user_engagement(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_user_engagement_cluster
    ON user_engagement(cluster_id);

-- User category preferences
CREATE TABLE IF NOT EXISTS user_category_preferences (
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    last_updated TEXT NOT NULL,
    PRIMARY KEY (user_id, category)
);

-- ============================================================
-- ENHANCEMENT 10: Performance Monitoring
-- ============================================================

-- Clustering quality metrics
CREATE TABLE IF NOT EXISTS clustering_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL,  -- PRECISION, RECALL, COHESION, SEPARATION, F1_SCORE
    category TEXT,
    value REAL NOT NULL,
    sample_size INTEGER,
    calculated_at TEXT NOT NULL,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_clustering_metrics_type_time
    ON clustering_metrics(metric_type, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_clustering_metrics_category
    ON clustering_metrics(category, calculated_at DESC);

-- AI label accuracy tracking
CREATE TABLE IF NOT EXISTS label_quality_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT NOT NULL,
    label_type TEXT NOT NULL,  -- TOPIC, CATEGORY, SENTIMENT, URGENCY
    original_label TEXT NOT NULL,
    corrected_label TEXT,  -- NULL if not corrected
    accuracy_score REAL,  -- 0-1
    feedback_source TEXT,  -- USER, SYSTEM, CROSS_CHECK
    created_at TEXT NOT NULL,
    FOREIGN KEY(article_id) REFERENCES news_articles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_label_quality_article
    ON label_quality_tracking(article_id);

CREATE INDEX IF NOT EXISTS idx_label_quality_type
    ON label_quality_tracking(label_type, created_at DESC);

-- Circuit breaker health metrics
CREATE TABLE IF NOT EXISTS circuit_breaker_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    breaker_name TEXT NOT NULL,
    state TEXT NOT NULL,  -- CLOSED, OPEN, HALF_OPEN
    open_count INTEGER DEFAULT 0,
    last_opened_at TEXT,
    last_closed_at TEXT,
    total_failures INTEGER DEFAULT 0,
    total_successes INTEGER DEFAULT 0,
    avg_response_time_ms REAL,
    recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_name_time
    ON circuit_breaker_metrics(breaker_name, recorded_at DESC);

-- ============================================================
-- ENHANCEMENT 1: Heat Decay Configuration
-- ============================================================

-- Category-specific heat decay configuration
CREATE TABLE IF NOT EXISTS heat_decay_config (
    category TEXT PRIMARY KEY,
    decay_constant REAL NOT NULL DEFAULT 0.2,  -- Higher = faster decay
    activity_boost_hours INTEGER DEFAULT 2,
    spike_multiplier REAL DEFAULT 1.5,
    base_half_life_hours REAL DEFAULT 3.5,
    description TEXT,
    updated_at TEXT NOT NULL
);

-- Insert default decay configurations
INSERT OR REPLACE INTO heat_decay_config (category, decay_constant, base_half_life_hours, description, updated_at)
VALUES
    ('CRYPTO', 0.25, 3.0, 'Fast-paced crypto markets', datetime('now')),
    ('STOCKS', 0.2, 4.0, 'Stock market standard decay', datetime('now')),
    ('ECONOMICS', 0.15, 5.0, 'Economic events linger longer', datetime('now')),
    ('GEOPOLITICS', 0.1, 7.0, 'Geopolitical events have long tails', datetime('now')),
    ('TECH', 0.2, 4.0, 'Tech news standard decay', datetime('now')),
    ('COMMODITIES', 0.18, 4.5, 'Commodities medium decay', datetime('now')),
    ('SPORTS', 0.3, 2.0, 'Sports news decays fast', datetime('now')),
    ('FOOTBALL', 0.3, 2.0, 'Football news decays fast', datetime('now')),
    ('BASKETBALL', 0.3, 2.0, 'Basketball news decays fast', datetime('now')),
    ('TENNIS', 0.3, 2.0, 'Tennis news decays fast', datetime('now')),
    ('MMA', 0.3, 2.0, 'MMA news decays fast', datetime('now')),
    ('GOLF', 0.3, 2.0, 'Golf news decays fast', datetime('now')),
    ('GENERAL', 0.2, 3.5, 'Default decay', datetime('now'));

-- ============================================================
-- Additional columns for existing tables
-- ============================================================

-- Add velocity tracking to story_clusters
ALTER TABLE story_clusters ADD COLUMN heat_velocity REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN acceleration REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN predicted_heat REAL;
ALTER TABLE story_clusters ADD COLUMN prediction_confidence REAL;

-- Add cross-category flags
ALTER TABLE story_clusters ADD COLUMN is_cross_category BOOLEAN DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN parent_cluster_id TEXT;

-- Add entity heat scores
ALTER TABLE story_clusters ADD COLUMN entity_heat_score REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN source_authority_score REAL DEFAULT 1.0;

-- Add multi-dimensional ranking fields
ALTER TABLE story_clusters ADD COLUMN sentiment_velocity REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN market_correlation_score REAL;
ALTER TABLE story_clusters ADD COLUMN composite_rank_score REAL DEFAULT 0;

-- Add anomaly detection flags
ALTER TABLE story_clusters ADD COLUMN is_anomaly BOOLEAN DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN anomaly_type TEXT;
ALTER TABLE story_clusters ADD COLUMN anomaly_score REAL DEFAULT 0;

-- Add lifecycle tracking
ALTER TABLE story_clusters ADD COLUMN lifecycle_stage TEXT;  -- EMERGING, SUSTAINED, DECAYING, DEAD
ALTER TABLE story_clusters ADD COLUMN peak_heat REAL;
ALTER TABLE story_clusters ADD COLUMN peak_time TEXT;
