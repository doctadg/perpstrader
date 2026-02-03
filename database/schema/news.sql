-- News Agent Database Schema
-- Run this to initialize a fresh news.db

CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    summary TEXT,
    source TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    published_at TIMESTAMP,
    categories TEXT, -- JSON array
    tags TEXT, -- JSON array
    sentiment TEXT CHECK(sentiment IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
    importance TEXT CHECK(importance IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    snippet TEXT,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    market_links TEXT, -- JSON
    metadata TEXT -- JSON
);

CREATE INDEX IF NOT EXISTS idx_articles_categories ON articles(categories);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_created ON articles(created_at);
CREATE INDEX IF NOT EXISTS idx_articles_sentiment ON articles(sentiment);

-- Embeddings table for semantic search
CREATE TABLE IF NOT EXISTS article_embeddings (
    article_id TEXT PRIMARY KEY,
    embedding TEXT NOT NULL, -- JSON array of floats
    model TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

-- Market links table
CREATE TABLE IF NOT EXISTS market_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    market_slug TEXT,
    market_title TEXT,
    score REAL,
    source TEXT,
    matched_terms TEXT, -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_links_article ON market_links(article_id);
CREATE INDEX IF NOT EXISTS idx_market_links_market ON market_links(market_id);
