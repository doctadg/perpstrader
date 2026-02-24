-- Evolution Engine Database Schema
-- Adds strategy_generations table for genetic algorithm tracking

-- Table to track evolved strategy generations
CREATE TABLE IF NOT EXISTS strategy_generations (
    id TEXT PRIMARY KEY,
    parent_id TEXT,                    -- Comma-separated parent IDs for lineage tracking
    generation INTEGER NOT NULL,       -- Generation number (0 = initial seed)
    parameters TEXT NOT NULL,          -- JSON-encoded StrategyParameters
    fitness REAL,                      -- Calculated fitness score
    sharpe_ratio REAL,                 -- Sharpe ratio from backtest
    total_return REAL,                 -- Total return from backtest
    max_drawdown REAL,                 -- Maximum drawdown from backtest
    win_rate REAL,                     -- Win rate from backtest
    total_trades INTEGER,              -- Number of trades in backtest
    backtest_result TEXT,              -- Full backtest result JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_strategy_gen_generation ON strategy_generations(generation);
CREATE INDEX IF NOT EXISTS idx_strategy_gen_parent ON strategy_generations(parent_id);
CREATE INDEX IF NOT EXISTS idx_strategy_gen_fitness ON strategy_generations(fitness);
CREATE INDEX IF NOT EXISTS idx_strategy_gen_created ON strategy_generations(created_at);

-- Table to track evolution sessions
CREATE TABLE IF NOT EXISTS evolution_sessions (
    id TEXT PRIMARY KEY,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    config TEXT,                       -- JSON-encoded evolution configuration
    status TEXT DEFAULT 'running',     -- running, completed, failed
    best_genome_id TEXT,               -- Reference to best strategy_generations
    generations_completed INTEGER DEFAULT 0,
    final_fitness REAL,
    termination_reason TEXT            -- converged, max_generations, stagnation, error
);

-- View for top evolved strategies
CREATE VIEW IF NOT EXISTS top_evolved_strategies AS
SELECT 
    id,
    generation,
    fitness,
    sharpe_ratio,
    total_return,
    max_drawdown,
    win_rate,
    total_trades,
    created_at
FROM strategy_generations
WHERE fitness IS NOT NULL
ORDER BY fitness DESC;

-- View for strategy lineage
CREATE VIEW IF NOT EXISTS strategy_lineage AS
SELECT 
    sg.id,
    sg.parent_id,
    sg.generation,
    sg.fitness,
    sg.sharpe_ratio,
    CASE 
        WHEN sg.parent_id IS NULL OR sg.parent_id = '' THEN 'seed'
        WHEN INSTR(sg.parent_id, ',') > 0 THEN 'crossover'
        ELSE 'mutation'
    END as origin_type,
    sg.created_at
FROM strategy_generations sg
ORDER BY sg.generation, sg.fitness DESC;
