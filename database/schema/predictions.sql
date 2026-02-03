-- Predictions Database Schema
-- Run this to initialize a fresh predictions.db

CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    slug TEXT,
    title TEXT NOT NULL,
    category TEXT,
    status TEXT CHECK(status IN ('OPEN', 'CLOSED', 'RESOLVED', 'UNKNOWN')) DEFAULT 'OPEN',
    outcomes TEXT, -- JSON
    yes_price REAL,
    no_price REAL,
    volume REAL,
    volume_24hr REAL,
    volume_1wk REAL,
    volume_1mo REAL,
    liquidity REAL,
    close_time TIMESTAMP,
    source TEXT DEFAULT 'POLYMARKET',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT -- JSON
);

CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_close_time ON markets(close_time);

-- Market snapshots for tracking price history
CREATE TABLE IF NOT EXISTS market_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    yes_price REAL,
    no_price REAL,
    volume REAL,
    liquidity REAL,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_market ON market_snapshots(market_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_time ON market_snapshots(timestamp);

-- Prediction positions
CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    market_title TEXT,
    outcome TEXT CHECK(outcome IN ('YES', 'NO')),
    shares REAL DEFAULT 0,
    average_price REAL,
    last_price REAL,
    unrealized_pnl REAL DEFAULT 0,
    opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    status TEXT CHECK(status IN ('OPEN', 'CLOSED')) DEFAULT 'OPEN',
    FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE INDEX IF NOT EXISTS idx_positions_market ON positions(market_id);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);

-- Prediction trades
CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    market_title TEXT,
    outcome TEXT CHECK(outcome IN ('YES', 'NO')),
    side TEXT CHECK(side IN ('BUY', 'SELL')),
    shares REAL,
    price REAL,
    fee REAL,
    pnl REAL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK(status IN ('FILLED', 'CANCELLED')) DEFAULT 'FILLED',
    reason TEXT,
    FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_time ON trades(timestamp);

-- Portfolio snapshot
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_value REAL,
    available_balance REAL,
    used_balance REAL,
    realized_pnl REAL,
    unrealized_pnl REAL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI Ideas/Signals
CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    market_id TEXT NOT NULL,
    market_title TEXT,
    outcome TEXT CHECK(outcome IN ('YES', 'NO')),
    implied_probability REAL,
    predicted_probability REAL,
    edge REAL,
    confidence REAL,
    time_horizon TEXT,
    catalysts TEXT, -- JSON
    rationale TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'ACTIVE',
    FOREIGN KEY (market_id) REFERENCES markets(id)
);

CREATE INDEX IF NOT EXISTS idx_ideas_market ON ideas(market_id);
CREATE INDEX IF NOT EXISTS idx_ideas_confidence ON ideas(confidence);
