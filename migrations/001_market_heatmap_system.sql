-- Market-Based Heatmap System Migration
-- Creates new tables for organizing news by tradeable markets

-- ============================================================================
-- TABLE 1: markets - Master list of tradeable markets
-- ============================================================================
CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('hyperliquid', 'polymarket')),
    symbol TEXT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL, -- Politics, Crypto, Sports, Tech, Economics, etc.
    sub_category TEXT, -- e.g., "US Election", "Layer 1", "NBA"
    
    -- Market metadata
    active BOOLEAN DEFAULT 1,
    volume_24h REAL DEFAULT 0,
    priority INTEGER DEFAULT 50, -- 1-100, higher = more important
    
    -- Hyperliquid specific
    hl_coin TEXT, -- e.g., "BTC", "ETH"
    hl_index INTEGER,
    
    -- Polymarket specific  
    pm_market_slug TEXT,
    pm_condition_id TEXT,
    pm_question_id TEXT,
    pm_resolution_date TEXT,
    pm_volume_usd REAL DEFAULT 0,
    pm_liquidity REAL DEFAULT 0,
    pm_probability REAL, -- Current yes probability
    pm_outcomes TEXT, -- JSON array of outcomes
    
    -- Timestamps
    first_seen TEXT NOT NULL,
    last_updated TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_markets_type ON markets(type);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(active);
CREATE INDEX IF NOT EXISTS idx_markets_priority ON markets(priority DESC);
CREATE INDEX IF NOT EXISTS idx_markets_volume ON markets(volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_markets_hl_coin ON markets(hl_coin) WHERE type = 'hyperliquid';
CREATE INDEX IF NOT EXISTS idx_markets_pm_slug ON markets(pm_market_slug) WHERE type = 'polymarket';

-- ============================================================================
-- TABLE 2: market_mentions - Links articles to markets with relevance scoring
-- ============================================================================
CREATE TABLE IF NOT EXISTS market_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    
    -- Relevance scoring (0-100)
    relevance_score REAL NOT NULL DEFAULT 50, -- 0-100% match confidence
    mention_count INTEGER DEFAULT 1, -- How many times mentioned
    
    -- Context extraction
    mention_context TEXT, -- Snippet showing the mention
    extracted_keywords TEXT, -- JSON array of matched keywords
    
    -- NLP-based sentiment for this specific mention
    mention_sentiment TEXT CHECK(mention_sentiment IN ('very_negative', 'negative', 'neutral', 'positive', 'very_positive')),
    sentiment_score REAL, -- -1.0 to 1.0
    
    -- Position in article (for weighting)
    mention_position TEXT CHECK(mention_position IN ('title', 'headline', 'first_paragraph', 'body', 'conclusion')),
    
    -- Extraction method
    extraction_method TEXT CHECK(extraction_method IN ('keyword', 'nlp_entity', 'semantic', 'manual')),
    
    -- Timestamps
    extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    FOREIGN KEY (article_id) REFERENCES news_articles(id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    UNIQUE(article_id, market_id)
);

CREATE INDEX IF NOT EXISTS idx_market_mentions_article ON market_mentions(article_id);
CREATE INDEX IF NOT EXISTS idx_market_mentions_market ON market_mentions(market_id);
CREATE INDEX IF NOT EXISTS idx_market_mentions_relevance ON market_mentions(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_market_mentions_sentiment ON market_mentions(mention_sentiment);
CREATE INDEX IF NOT EXISTS idx_market_mentions_extracted ON market_mentions(extracted_at);

-- ============================================================================
-- TABLE 3: market_heat - Time-series heat tracking per market
-- ============================================================================
CREATE TABLE IF NOT EXISTS market_heat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id TEXT NOT NULL,
    
    -- Heat metrics
    heat_score REAL DEFAULT 0, -- 0-100 composite score
    article_count INTEGER DEFAULT 0,
    mention_count INTEGER DEFAULT 0,
    unique_article_count INTEGER DEFAULT 0,
    
    -- Sentiment aggregation
    avg_sentiment REAL, -- -1.0 to 1.0
    sentiment_distribution TEXT, -- JSON: {positive: N, neutral: N, negative: N}
    
    -- Time window
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    period_type TEXT NOT NULL CHECK(period_type IN ('1h', '4h', '24h', '7d')),
    
    -- Trending detection
    trend_direction TEXT CHECK(trend_direction IN ('SPIKING', 'RISING', 'STABLE', 'FALLING', 'CRASHING')),
    velocity REAL DEFAULT 0, -- Change in heat score
    acceleration REAL DEFAULT 0, -- Change in velocity
    
    -- Anomaly detection
    is_anomaly BOOLEAN DEFAULT 0,
    anomaly_score REAL,
    anomaly_type TEXT,
    
    -- Related clusters
    related_cluster_ids TEXT, -- JSON array of story cluster IDs
    
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    UNIQUE(market_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_market_heat_market ON market_heat(market_id);
CREATE INDEX IF NOT EXISTS idx_market_heat_period ON market_heat(period_type, period_start);
CREATE INDEX IF NOT EXISTS idx_market_heat_score ON market_heat(heat_score DESC);
CREATE INDEX IF NOT EXISTS idx_market_heat_trend ON market_heat(trend_direction);
CREATE INDEX IF NOT EXISTS idx_market_heat_anomaly ON market_heat(is_anomaly) WHERE is_anomaly = 1;

-- ============================================================================
-- TABLE 4: market_correlations - Cross-market relationships
-- ============================================================================
CREATE TABLE IF NOT EXISTS market_correlations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_market_id TEXT NOT NULL,
    target_market_id TEXT NOT NULL,
    
    -- Correlation metrics
    correlation_coefficient REAL, -- -1.0 to 1.0
    confidence REAL, -- 0-1.0
    sample_size INTEGER,
    
    -- Relationship type
    relationship_type TEXT CHECK(relationship_type IN ('price', 'sentiment', 'news_flow', 'category')),
    
    -- Time window for correlation
    period_days INTEGER DEFAULT 7,
    calculated_at TEXT NOT NULL,
    
    FOREIGN KEY (source_market_id) REFERENCES markets(id) ON DELETE CASCADE,
    FOREIGN KEY (target_market_id) REFERENCES markets(id) ON DELETE CASCADE,
    UNIQUE(source_market_id, target_market_id, relationship_type, period_days)
);

CREATE INDEX IF NOT EXISTS idx_market_corr_source ON market_correlations(source_market_id);
CREATE INDEX IF NOT EXISTS idx_market_corr_target ON market_correlations(target_market_id);
CREATE INDEX IF NOT EXISTS idx_market_corr_coef ON market_correlations(correlation_coefficient DESC);

-- ============================================================================
-- TABLE 5: market_keywords - Keywords/synonyms for market detection
-- ============================================================================
CREATE TABLE IF NOT EXISTS market_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id TEXT NOT NULL,
    keyword TEXT NOT NULL,
    keyword_type TEXT CHECK(keyword_type IN ('primary', 'alias', 'ticker', 'related')),
    weight REAL DEFAULT 1.0, -- Multiplier for relevance scoring
    case_sensitive BOOLEAN DEFAULT 0,
    
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    UNIQUE(market_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_market_keywords_market ON market_keywords(market_id);
CREATE INDEX IF NOT EXISTS idx_market_keywords_keyword ON market_keywords(keyword);

-- ============================================================================
-- VIEWS for common queries
-- ============================================================================

-- View: Current market heat snapshot
CREATE VIEW IF NOT EXISTS v_market_heat_current AS
SELECT 
    m.*,
    mh.heat_score,
    mh.article_count,
    mh.avg_sentiment,
    mh.trend_direction,
    mh.velocity,
    mh.period_start as heat_period_start
FROM markets m
LEFT JOIN market_heat mh ON m.id = mh.market_id 
    AND mh.period_type = '24h'
    AND mh.period_start = (
        SELECT MAX(period_start) 
        FROM market_heat 
        WHERE market_id = m.id AND period_type = '24h'
    )
WHERE m.active = 1;

-- View: Top mentioned markets
CREATE VIEW IF NOT EXISTS v_top_markets AS
SELECT 
    m.id,
    m.name,
    m.type,
    m.category,
    m.volume_24h,
    COUNT(DISTINCT mm.article_id) as article_count,
    COUNT(mm.id) as total_mentions,
    AVG(mm.relevance_score) as avg_relevance,
    AVG(mm.sentiment_score) as avg_sentiment
FROM markets m
LEFT JOIN market_mentions mm ON m.id = mm.market_id
    AND mm.extracted_at > datetime('now', '-24 hours')
WHERE m.active = 1
GROUP BY m.id
ORDER BY total_mentions DESC, article_count DESC;

-- ============================================================================
-- TRIGGERS for maintaining consistency
-- ============================================================================

-- Trigger: Update market last_updated when market_mentions changes
CREATE TRIGGER IF NOT EXISTS trg_market_mentions_update
AFTER INSERT ON market_mentions
BEGIN
    UPDATE markets SET last_updated = datetime('now') WHERE id = NEW.market_id;
END;

-- Trigger: Prevent duplicate keyword entries (case-insensitive)
CREATE TRIGGER IF NOT EXISTS trg_market_keywords_unique
BEFORE INSERT ON market_keywords
WHEN EXISTS (
    SELECT 1 FROM market_keywords 
    WHERE market_id = NEW.market_id 
    AND LOWER(keyword) = LOWER(NEW.keyword)
)
BEGIN
    SELECT RAISE(IGNORE);
END;

-- ============================================================================
-- INITIAL DATA: Common market keywords
-- ============================================================================

-- Hyperliquid top coins will be populated by the sync script
-- Polymarket markets will be populated by the sync script
-- Keywords will be inserted by the sync script when markets are created

-- Note: Initial keywords removed - will be populated by market-data-sync.ts
-- when it syncs Hyperliquid markets (BTC, ETH, SOL, etc.)
