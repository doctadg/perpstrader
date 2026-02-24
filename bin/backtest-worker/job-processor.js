"use strict";
/**
 * Backtest Job Processor
 *
 * Processes individual backtest jobs using the existing enhanced-backtest.ts engine.
 * Fetches historical data, runs the backtest, and returns structured results.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processBacktestJob = processBacktestJob;
const enhanced_backtest_1 = require("../backtest/enhanced-backtest");
const logger_1 = __importDefault(require("../shared/logger"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const result_analyzer_1 = require("./result-analyzer");
// Database path from environment or default
const DB_PATH = process.env.TRADING_DB_PATH || './data/trading.db';
/**
 * Fetch historical candle data from database
 */
async function fetchHistoricalData(symbol, timeframe, days) {
    logger_1.default.info(`[JobProcessor] Fetching ${days} days of data for ${symbol} (${timeframe})`);
    const db = new better_sqlite3_1.default(DB_PATH);
    try {
        // Calculate the cutoff timestamp
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffTimestamp = cutoffDate.toISOString();
        // Query candles from database
        // Table name pattern: candles_{symbol}_{timeframe}
        const tableName = `candles_${symbol.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${timeframe}`;
        let rows = [];
        try {
            // Try to query the specific table
            const stmt = db.prepare(`
        SELECT timestamp, open, high, low, close, volume, 
               bid, ask, bid_size, ask_size, vwap
        FROM ${tableName}
        WHERE timestamp >= ?
        ORDER BY timestamp ASC
      `);
            rows = stmt.all(cutoffTimestamp);
        }
        catch (error) {
            // Table might not exist, try generic candles table
            logger_1.default.warn(`[JobProcessor] Table ${tableName} not found, trying generic candles table`);
            const stmt = db.prepare(`
        SELECT timestamp, open, high, low, close, volume,
               bid, ask, bid_size, ask_size, vwap
        FROM candles
        WHERE symbol = ? AND timeframe = ? AND timestamp >= ?
        ORDER BY timestamp ASC
      `);
            rows = stmt.all(symbol, timeframe, cutoffTimestamp);
        }
        db.close();
        if (rows.length === 0) {
            logger_1.default.warn(`[JobProcessor] No historical data found for ${symbol} (${timeframe})`);
            return [];
        }
        // Convert to MarketData format
        const candles = rows.map(row => ({
            symbol,
            timestamp: new Date(row.timestamp),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            bid: row.bid,
            ask: row.ask,
            bidSize: row.bid_size,
            askSize: row.ask_size,
            vwap: row.vwap,
        }));
        logger_1.default.info(`[JobProcessor] Fetched ${candles.length} candles for ${symbol}`);
        return candles;
    }
    catch (error) {
        db.close();
        throw error;
    }
}
/**
 * Fetch candles from unified cache as fallback
 */
async function fetchFromCache(symbol, timeframe, days) {
    // UnifiedCache doesn't have a getCandles method - this is a placeholder
    // In production, implement a proper market data service integration
    logger_1.default.debug(`[JobProcessor] Cache fallback not implemented for ${symbol}`);
    return [];
}
/**
 * Process a single backtest job
 */
async function processBacktestJob(job) {
    const startTime = Date.now();
    const { jobId, strategy, symbol, timeframe, days, config } = job.data;
    logger_1.default.info(`[JobProcessor] Processing backtest job ${job.id} for strategy ${strategy.id} on ${symbol}`);
    try {
        // Fetch historical data
        let candles = await fetchHistoricalData(symbol, timeframe, days);
        // Fallback to cache if database has no data
        if (candles.length === 0) {
            candles = await fetchFromCache(symbol, timeframe, days);
        }
        if (candles.length === 0) {
            throw new Error(`No historical data available for ${symbol} (${timeframe}) over ${days} days`);
        }
        if (candles.length < 30) {
            logger_1.default.warn(`[JobProcessor] Limited data available: ${candles.length} candles for ${symbol}`);
        }
        // Run backtest using the enhanced backtest engine
        const engine = new enhanced_backtest_1.BacktestEngine({
            initialCapital: config?.initialCapital || 10000,
            fillModel: config?.fillModel || 'STANDARD',
            commissionRate: config?.commissionRate || 0.0005,
            slippageBps: config?.slippageBps || 5,
            latencyMs: config?.latencyMs || 10,
            randomSeed: config?.randomSeed,
        });
        const result = await engine.runBacktest(strategy, candles);
        // Assess strategy performance
        const assessment = (0, result_analyzer_1.assessStrategy)(result, strategy);
        // Store results in database
        await storeBacktestResult(result, assessment, jobId);
        // Update strategy status based on assessment
        await updateStrategyStatus(strategy.id, assessment);
        const processingTimeMs = Date.now() - startTime;
        logger_1.default.info(`[JobProcessor] Completed backtest job ${job.id} in ${processingTimeMs}ms:`, {
            strategyId: strategy.id,
            symbol,
            totalReturn: result.totalReturn.toFixed(2),
            sharpeRatio: result.sharpeRatio.toFixed(2),
            winRate: result.winRate.toFixed(1),
            viable: assessment.isViable,
        });
        return {
            jobId,
            strategyId: strategy.id,
            symbol,
            success: true,
            result,
            assessment,
            processingTimeMs,
            candlesProcessed: candles.length,
        };
    }
    catch (error) {
        const processingTimeMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger_1.default.error(`[JobProcessor] Failed to process backtest job ${job.id}:`, error);
        return {
            jobId,
            strategyId: strategy.id,
            symbol,
            success: false,
            error: errorMessage,
            processingTimeMs,
            candlesProcessed: 0,
        };
    }
}
/**
 * Store backtest result in database
 */
async function storeBacktestResult(result, assessment, jobId) {
    const db = new better_sqlite3_1.default(DB_PATH);
    try {
        // Ensure backtest_results table exists
        db.exec(`
      CREATE TABLE IF NOT EXISTS backtest_results (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        job_id TEXT,
        symbol TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        initial_capital REAL NOT NULL,
        final_capital REAL NOT NULL,
        total_return REAL NOT NULL,
        annualized_return REAL NOT NULL,
        sharpe_ratio REAL NOT NULL,
        max_drawdown REAL NOT NULL,
        win_rate REAL NOT NULL,
        total_trades INTEGER NOT NULL,
        profit_factor REAL,
        calmar_ratio REAL,
        sortino_ratio REAL,
        is_viable INTEGER NOT NULL,
        performance_tier TEXT NOT NULL,
        should_activate INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
        // Create index on strategy_id
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_backtest_strategy_id 
      ON backtest_results(strategy_id)
    `);
        // Create index on created_at
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_backtest_created_at 
      ON backtest_results(created_at DESC)
    `);
        // Insert result
        const stmt = db.prepare(`
      INSERT INTO backtest_results (
        id, strategy_id, job_id, symbol, start_date, end_date,
        initial_capital, final_capital, total_return, annualized_return,
        sharpe_ratio, max_drawdown, win_rate, total_trades,
        profit_factor, calmar_ratio, sortino_ratio,
        is_viable, performance_tier, should_activate, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(jobId, result.strategyId, jobId, result.period.start.toISOString().split('T')[0], // Store symbol from first trade or extract from elsewhere
        result.period.start.toISOString(), result.period.end.toISOString(), result.initialCapital, result.finalCapital, result.totalReturn, result.annualizedReturn, result.sharpeRatio, result.maxDrawdown, result.winRate, result.totalTrades, assessment.metrics.profitFactor, assessment.metrics.calmarRatio, assessment.metrics.sortinoRatio, assessment.isViable ? 1 : 0, assessment.performanceTier, assessment.shouldActivate ? 1 : 0, new Date().toISOString());
        logger_1.default.debug(`[JobProcessor] Stored backtest result for job ${jobId}`);
    }
    catch (error) {
        logger_1.default.error(`[JobProcessor] Failed to store backtest result:`, error);
    }
    finally {
        db.close();
    }
}
/**
 * Update strategy status in database based on assessment
 */
async function updateStrategyStatus(strategyId, assessment) {
    const db = new better_sqlite3_1.default(DB_PATH);
    try {
        // Check if strategies table exists
        const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='strategies'
    `).get();
        if (!tableCheck) {
            logger_1.default.warn(`[JobProcessor] Strategies table does not exist, skipping status update`);
            return;
        }
        // Update strategy status
        const stmt = db.prepare(`
      UPDATE strategies 
      SET is_active = ?,
          performance = json_set(COALESCE(performance, '{}'), 
            '$.totalTrades', ?,
            '$.winningTrades', ?,
            '$.losingTrades', ?,
            '$.winRate', ?,
            '$.totalPnL', ?,
            '$.sharpeRatio', ?,
            '$.maxDrawdown', ?,
            '$.averageWin', ?,
            '$.averageLoss', ?,
            '$.profitFactor', ?
          ),
          updated_at = ?
      WHERE id = ?
    `);
        const result = stmt.run(assessment.shouldActivate ? 1 : 0, assessment.metrics.totalTrades, Math.round(assessment.metrics.totalTrades * (assessment.metrics.winRate / 100)), Math.round(assessment.metrics.totalTrades * (1 - assessment.metrics.winRate / 100)), assessment.metrics.winRate, assessment.metrics.totalReturn, assessment.metrics.sharpeRatio, assessment.metrics.maxDrawdown, assessment.metrics.averageWin, assessment.metrics.averageLoss, assessment.metrics.profitFactor, new Date().toISOString(), strategyId);
        if (result.changes > 0) {
            logger_1.default.info(`[JobProcessor] Updated strategy ${strategyId}: active=${assessment.shouldActivate}, tier=${assessment.performanceTier}`);
        }
        else {
            logger_1.default.warn(`[JobProcessor] Strategy ${strategyId} not found in database`);
        }
    }
    catch (error) {
        logger_1.default.error(`[JobProcessor] Failed to update strategy status:`, error);
    }
    finally {
        db.close();
    }
}
exports.default = {
    processBacktestJob,
};
//# sourceMappingURL=job-processor.js.map