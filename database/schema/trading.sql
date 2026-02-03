-- Trading Database Schema
-- Run this to initialize a fresh trading.db

CREATE TABLE IF NOT EXISTS strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT CHECK(type IN ('MARKET_MAKING', 'TREND_FOLLOWING', 'MEAN_REVERSION', 'ARBITRAGE', 'AI_PREDICTION')),
    symbols TEXT, -- JSON array
    timeframe TEXT,
    parameters TEXT, -- JSON
    entry_conditions TEXT, -- JSON
    exit_conditions TEXT, -- JSON
    risk_parameters TEXT, -- JSON
    is_active BOOLEAN DEFAULT 1,
    performance TEXT, -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_strategies_active ON strategies(is_active);

-- Trading signals
CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    action TEXT CHECK(action IN ('BUY', 'SELL', 'HOLD')),
    size REAL,
    price REAL,
    type TEXT CHECK(type IN ('MARKET', 'LIMIT')),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confidence REAL,
    strategy_id TEXT,
    reason TEXT,
    executed BOOLEAN DEFAULT 0,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);

CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_time ON signals(timestamp);
CREATE INDEX IF NOT EXISTS idx_signals_strategy ON signals(strategy_id);

-- Positions
CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    side TEXT CHECK(side IN ('LONG', 'SHORT')),
    size REAL,
    entry_price REAL,
    mark_price REAL,
    unrealized_pnl REAL,
    leverage REAL,
    margin_used REAL,
    entry_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    status TEXT CHECK(status IN ('OPEN', 'CLOSED')) DEFAULT 'OPEN',
    close_price REAL,
    realized_pnl REAL
);

CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);

-- Trades
CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    strategy_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT CHECK(side IN ('BUY', 'SELL')),
    size REAL,
    price REAL,
    fee REAL,
    pnl REAL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    type TEXT CHECK(type IN ('MARKET', 'LIMIT')),
    status TEXT CHECK(status IN ('FILLED', 'PARTIAL', 'CANCELLED')),
    entry_exit TEXT CHECK(entry_exit IN ('ENTRY', 'EXIT')),
    FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_time ON trades(timestamp);

-- AI Insights
CREATE TABLE IF NOT EXISTS ai_insights (
    id TEXT PRIMARY KEY,
    type TEXT CHECK(type IN ('STRATEGY', 'RISK', 'MARKET', 'PERFORMANCE', 'paper_portfolio')),
    title TEXT,
    description TEXT,
    confidence REAL,
    actionable BOOLEAN DEFAULT 0,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data TEXT -- JSON
);

CREATE INDEX IF NOT EXISTS idx_insights_type ON ai_insights(type);
CREATE INDEX IF NOT EXISTS idx_insights_time ON ai_insights(timestamp);

-- Market data cache
CREATE TABLE IF NOT EXISTS market_data (
    symbol TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    vwap REAL,
    bid REAL,
    ask REAL,
    bid_size REAL,
    ask_size REAL,
    PRIMARY KEY (symbol, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON market_data(symbol);
CREATE INDEX IF NOT EXISTS idx_market_data_time ON market_data(timestamp);

-- Backtest results
CREATE TABLE IF NOT EXISTS backtests (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    initial_capital REAL,
    final_capital REAL,
    total_return REAL,
    annualized_return REAL,
    sharpe_ratio REAL,
    max_drawdown REAL,
    win_rate REAL,
    total_trades INTEGER,
    metrics TEXT, -- JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (strategy_id) REFERENCES strategies(id)
);

CREATE INDEX IF NOT EXISTS idx_backtests_strategy ON backtests(strategy_id);
