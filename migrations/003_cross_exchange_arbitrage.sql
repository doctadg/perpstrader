-- Migration: Cross-Exchange Funding Arbitrage
-- Adds tables for tracking cross-exchange arbitrage opportunities between Hyperliquid and Asterdex
-- Created: 2026-02-11

-- ==========================================
-- CROSS-EXCHANGE OPPORTUNITIES TABLE
-- ==========================================
-- Tracks funding rate arbitrage opportunities between exchanges

CREATE TABLE IF NOT EXISTS cross_exchange_opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    
    -- Funding rates from each exchange
    hyperliquidFunding REAL NOT NULL,
    asterdexFunding REAL NOT NULL,
    
    -- Spread calculations
    spread REAL NOT NULL,              -- Absolute difference in funding rates
    spreadPercent REAL NOT NULL,       -- Spread as percentage
    annualizedSpread REAL NOT NULL,    -- Annualized spread (APR)
    
    -- Recommended action
    recommendedAction TEXT CHECK(recommendedAction IN ('long_hl_short_aster', 'short_hl_long_aster')),
    
    -- Estimated returns
    estimatedYearlyYield REAL,         -- Estimated yearly yield based on spread
    
    -- Metadata
    urgency TEXT CHECK(urgency IN ('high', 'medium', 'low')),
    timestamp INTEGER NOT NULL,
    isActive INTEGER DEFAULT 1,
    
    -- Price data for execution risk assessment
    hyperliquidMarkPrice REAL DEFAULT 0,
    asterdexMarkPrice REAL DEFAULT 0,
    priceDiffPercent REAL DEFAULT 0,
    
    -- Confidence score (0-100) based on data quality
    confidence REAL DEFAULT 100
);

-- Indexes for cross_exchange_opportunities
CREATE INDEX IF NOT EXISTS idx_cross_exchange_symbol 
    ON cross_exchange_opportunities(symbol);
CREATE INDEX IF NOT EXISTS idx_cross_exchange_active 
    ON cross_exchange_opportunities(isActive);
CREATE INDEX IF NOT EXISTS idx_cross_exchange_timestamp 
    ON cross_exchange_opportunities(timestamp);
CREATE INDEX IF NOT EXISTS idx_cross_exchange_spread 
    ON cross_exchange_opportunities(annualizedSpread);
CREATE INDEX IF NOT EXISTS idx_cross_exchange_urgency 
    ON cross_exchange_opportunities(urgency);

-- ==========================================
-- EXCHANGE STATUS TABLE
-- ==========================================
-- Tracks connectivity and status of connected exchanges

CREATE TABLE IF NOT EXISTS exchange_status (
    exchange TEXT PRIMARY KEY,
    connected INTEGER DEFAULT 0,
    lastUpdate INTEGER DEFAULT 0,
    symbols TEXT,                      -- JSON array of available symbols
    errorMessage TEXT,
    wsEndpoint TEXT,                   -- WebSocket endpoint URL
    restEndpoint TEXT,                 -- REST API endpoint URL
    metadata TEXT                      -- JSON object for additional exchange metadata
);

-- ==========================================
-- CROSS-EXCHANGE EXECUTION LOG
-- ==========================================
-- Logs attempted cross-exchange arbitrage executions

CREATE TABLE IF NOT EXISTS cross_exchange_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opportunityId INTEGER,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL,              -- 'long_hl_short_aster' or 'short_hl_long_aster'
    
    -- Order details
    hlOrderId TEXT,
    asterdexOrderId TEXT,
    
    -- Fill details
    hlFilledPrice REAL,
    asterdexFilledPrice REAL,
    hlFilledAmount REAL,
    asterdexFilledAmount REAL,
    
    -- PnL tracking
    realizedPnl REAL,
    fundingCollected REAL,
    totalReturn REAL,
    
    -- Status
    status TEXT CHECK(status IN ('pending', 'filled', 'partial', 'failed', 'cancelled')),
    errorMessage TEXT,
    
    -- Timestamps
    createdAt INTEGER NOT NULL,
    executedAt INTEGER,
    closedAt INTEGER,
    
    FOREIGN KEY (opportunityId) REFERENCES cross_exchange_opportunities(id)
);

CREATE INDEX IF NOT EXISTS idx_cross_exec_symbol 
    ON cross_exchange_executions(symbol);
CREATE INDEX IF NOT EXISTS idx_cross_exec_status 
    ON cross_exchange_executions(status);
CREATE INDEX IF NOT EXISTS idx_cross_exec_created 
    ON cross_exchange_executions(createdAt);

-- ==========================================
-- EXCHANGE SYMBOL MAPPING
-- ==========================================
-- Maps symbols between exchanges (e.g., BTC-USD vs BTCUSDT)

CREATE TABLE IF NOT EXISTS exchange_symbol_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    baseSymbol TEXT NOT NULL,          -- Standardized symbol (e.g., BTC)
    exchange TEXT NOT NULL,
    exchangeSymbol TEXT NOT NULL,      -- Exchange-specific symbol (e.g., BTC-USD)
    isActive INTEGER DEFAULT 1,
    createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_symbol_mapping_unique 
    ON exchange_symbol_mapping(baseSymbol, exchange);

-- ==========================================
-- SEED DATA
-- ==========================================

-- Insert initial exchange status records
INSERT OR IGNORE INTO exchange_status (exchange, connected, lastUpdate, wsEndpoint, restEndpoint)
VALUES 
    ('hyperliquid', 0, 0, 'wss://api.hyperliquid.xyz/ws', 'https://api.hyperliquid.xyz'),
    ('asterdex', 0, 0, 'wss://api.asterdex.io/ws/v1', 'https://api.asterdex.io/v1');

-- Insert common symbol mappings
INSERT OR IGNORE INTO exchange_symbol_mapping (baseSymbol, exchange, exchangeSymbol)
VALUES 
    ('BTC', 'hyperliquid', 'BTC'),
    ('BTC', 'asterdex', 'BTC-USD'),
    ('ETH', 'hyperliquid', 'ETH'),
    ('ETH', 'asterdex', 'ETH-USD'),
    ('SOL', 'hyperliquid', 'SOL'),
    ('SOL', 'asterdex', 'SOL-USD'),
    ('AVAX', 'hyperliquid', 'AVAX'),
    ('AVAX', 'asterdex', 'AVAX-USD'),
    ('ARB', 'hyperliquid', 'ARB'),
    ('ARB', 'asterdex', 'ARB-USD'),
    ('OP', 'hyperliquid', 'OP'),
    ('OP', 'asterdex', 'OP-USD'),
    ('LINK', 'hyperliquid', 'LINK'),
    ('LINK', 'asterdex', 'LINK-USD'),
    ('DOGE', 'hyperliquid', 'DOGE'),
    ('DOGE', 'asterdex', 'DOGE-USD'),
    ('PEPE', 'hyperliquid', 'PEPE'),
    ('PEPE', 'asterdex', 'PEPE-USD'),
    ('WIF', 'hyperliquid', 'WIF'),
    ('WIF', 'asterdex', 'WIF-USD');

-- ==========================================
-- VIEWS
-- ==========================================

-- Active opportunities view (most recent per symbol)
CREATE VIEW IF NOT EXISTS v_active_cross_exchange_opportunities AS
SELECT 
    o.*,
    CASE 
        WHEN o.urgency = 'high' THEN 3
        WHEN o.urgency = 'medium' THEN 2
        ELSE 1
    END as urgency_rank
FROM cross_exchange_opportunities o
INNER JOIN (
    SELECT symbol, MAX(timestamp) as max_ts
    FROM cross_exchange_opportunities
    WHERE isActive = 1
    GROUP BY symbol
) latest ON o.symbol = latest.symbol AND o.timestamp = latest.max_ts
WHERE o.isActive = 1
ORDER BY ABS(o.annualizedSpread) DESC;

-- Cross-exchange performance summary
CREATE VIEW IF NOT EXISTS v_cross_exchange_summary AS
SELECT 
    symbol,
    COUNT(*) as opportunity_count,
    AVG(ABS(annualizedSpread)) as avg_spread,
    MAX(ABS(annualizedSpread)) as max_spread,
    AVG(confidence) as avg_confidence,
    COUNT(CASE WHEN urgency = 'high' THEN 1 END) as high_urgency_count,
    COUNT(CASE WHEN urgency = 'medium' THEN 1 END) as medium_urgency_count,
    COUNT(CASE WHEN urgency = 'low' THEN 1 END) as low_urgency_count,
    MAX(timestamp) as last_seen
FROM cross_exchange_opportunities
WHERE isActive = 1
  AND timestamp >= (strftime('%s', 'now') * 1000) - (24 * 60 * 60 * 1000) -- Last 24 hours
GROUP BY symbol
ORDER BY avg_spread DESC;

-- ==========================================
-- TRIGGERS
-- ==========================================

-- Auto-deactivate old opportunities when new one is inserted
CREATE TRIGGER IF NOT EXISTS trg_deactivate_old_opportunities
AFTER INSERT ON cross_exchange_opportunities
BEGIN
    UPDATE cross_exchange_opportunities
    SET isActive = 0
    WHERE symbol = NEW.symbol
      AND id != NEW.id
      AND isActive = 1;
END;

-- Update timestamp on opportunity update
CREATE TRIGGER IF NOT EXISTS trg_update_opportunity_timestamp
AFTER UPDATE ON cross_exchange_opportunities
BEGIN
    UPDATE cross_exchange_opportunities
    SET timestamp = (strftime('%s', 'now') * 1000)
    WHERE id = NEW.id
      AND NEW.isActive != OLD.isActive;
END;

-- ==========================================
-- CLEANUP PROCEDURE
-- ==========================================

-- Note: Run periodically to clean old data
-- DELETE FROM cross_exchange_opportunities WHERE timestamp < (strftime('%s', 'now') * 1000) - (7 * 24 * 60 * 60 * 1000);
-- DELETE FROM cross_exchange_executions WHERE createdAt < (strftime('%s', 'now') * 1000) - (30 * 24 * 60 * 60 * 1000);