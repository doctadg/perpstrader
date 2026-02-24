"use strict";
// Idea Queue - Manages queue of strategy ideas waiting to be backtested
// Handles database operations for strategy_ideas, backtest_jobs, and strategy_performance tables
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ideaQueue = exports.IdeaQueue = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = __importDefault(require("../shared/config"));
class IdeaQueue {
    db = null;
    dbPath;
    initialized = false;
    constructor() {
        const dbConfig = config_1.default.getSection('database');
        this.dbPath = dbConfig.connection;
    }
    /**
     * Initialize database connection and create tables
     */
    async initialize() {
        if (this.initialized)
            return;
        try {
            // Ensure data directory exists
            const dataDir = path_1.default.dirname(this.dbPath);
            if (!fs_1.default.existsSync(dataDir)) {
                fs_1.default.mkdirSync(dataDir, { recursive: true });
            }
            this.db = new better_sqlite3_1.default(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            this.createTables();
            this.initialized = true;
            logger_1.default.info('[IdeaQueue] Database initialized successfully');
        }
        catch (error) {
            logger_1.default.error('[IdeaQueue] Failed to initialize database:', error);
            throw error;
        }
    }
    /**
     * Create database tables
     */
    createTables() {
        if (!this.db)
            return;
        try {
            // Strategy ideas table
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS strategy_ideas (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          type TEXT NOT NULL,
          symbols TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          parameters TEXT NOT NULL,
          entry_conditions TEXT NOT NULL,
          exit_conditions TEXT NOT NULL,
          risk_parameters TEXT NOT NULL,
          confidence REAL DEFAULT 0.5,
          rationale TEXT,
          status TEXT DEFAULT 'PENDING',
          market_context TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
            // Create index on status for faster queries
            this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_strategy_ideas_status ON strategy_ideas(status)
      `);
            // Backtest jobs table
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS backtest_jobs (
          id TEXT PRIMARY KEY,
          strategy_id TEXT NOT NULL,
          status TEXT DEFAULT 'PENDING',
          results TEXT,
          started_at TEXT,
          completed_at TEXT,
          error TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (strategy_id) REFERENCES strategy_ideas(id)
        )
      `);
            // Create indexes on backtest jobs
            this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_backtest_jobs_status ON backtest_jobs(status)
      `);
            this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_backtest_jobs_strategy ON backtest_jobs(strategy_id)
      `);
            // Strategy performance table
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS strategy_performance (
          id TEXT PRIMARY KEY,
          strategy_id TEXT NOT NULL UNIQUE,
          sharpe REAL DEFAULT 0,
          win_rate REAL DEFAULT 0,
          pnl REAL DEFAULT 0,
          max_drawdown REAL DEFAULT 0,
          total_trades INTEGER DEFAULT 0,
          profit_factor REAL DEFAULT 0,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (strategy_id) REFERENCES strategy_ideas(id)
        )
      `);
            // Create index on performance metrics
            this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_strategy_performance_sharpe ON strategy_performance(sharpe)
      `);
            logger_1.default.info('[IdeaQueue] Database tables created successfully');
        }
        catch (error) {
            logger_1.default.error('[IdeaQueue] Failed to create tables:', error);
            throw error;
        }
    }
    /**
     * Add strategy ideas to the queue
     */
    async addIdeas(ideas) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        let added = 0;
        const insert = this.db.prepare(`
      INSERT INTO strategy_ideas (
        id, name, description, type, symbols, timeframe, parameters,
        entry_conditions, exit_conditions, risk_parameters, confidence,
        rationale, status, market_context, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const insertJob = this.db.prepare(`
      INSERT INTO backtest_jobs (id, strategy_id, status, created_at)
      VALUES (?, ?, 'PENDING', ?)
    `);
        const transaction = this.db.transaction((items) => {
            for (const idea of items) {
                try {
                    // Check if idea with same name already exists and is pending
                    const existing = this.db.prepare('SELECT id FROM strategy_ideas WHERE name = ? AND status = ?').get(idea.name, 'PENDING');
                    if (existing) {
                        logger_1.default.debug(`[IdeaQueue] Skipping duplicate idea: ${idea.name}`);
                        continue;
                    }
                    insert.run(idea.id, idea.name, idea.description, idea.type, JSON.stringify(idea.symbols), idea.timeframe, JSON.stringify(idea.parameters), JSON.stringify(idea.entryConditions), JSON.stringify(idea.exitConditions), JSON.stringify(idea.riskParameters), idea.confidence, idea.rationale, idea.status, JSON.stringify(idea.marketContext || {}), idea.createdAt.toISOString(), idea.updatedAt.toISOString());
                    // Create backtest job for this idea
                    insertJob.run((0, uuid_1.v4)(), idea.id, new Date().toISOString());
                    added++;
                }
                catch (error) {
                    logger_1.default.error(`[IdeaQueue] Failed to add idea ${idea.name}:`, error);
                }
            }
        });
        transaction(ideas);
        logger_1.default.info(`[IdeaQueue] Added ${added}/${ideas.length} ideas to queue`);
        return added;
    }
    /**
     * Get pending ideas
     */
    async getPendingIdeas(limit) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        const sql = `
      SELECT * FROM strategy_ideas 
      WHERE status = 'PENDING'
      ORDER BY confidence DESC, created_at DESC
      ${limit ? 'LIMIT ?' : ''}
    `;
        const stmt = this.db.prepare(sql);
        const rows = limit ? stmt.all(limit) : stmt.all();
        return rows.map(row => this.rowToIdea(row));
    }
    /**
     * Get count of pending ideas
     */
    async getPendingCount() {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return 0;
        const result = this.db.prepare("SELECT COUNT(*) as count FROM strategy_ideas WHERE status = 'PENDING'").get();
        return result.count;
    }
    /**
     * Update idea status
     */
    async updateIdeaStatus(id, status) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        this.db.prepare(`
      UPDATE strategy_ideas 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(status, new Date().toISOString(), id);
    }
    /**
     * Get pending backtest jobs
     */
    async getPendingBacktestJobs(limit = 10) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return [];
        const rows = this.db.prepare(`
      SELECT * FROM backtest_jobs 
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);
        return rows.map(row => this.rowToBacktestJob(row));
    }
    /**
     * Get count of pending backtest jobs
     */
    async getPendingBacktestCount() {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return 0;
        const result = this.db.prepare("SELECT COUNT(*) as count FROM backtest_jobs WHERE status = 'PENDING'").get();
        return result.count;
    }
    /**
     * Get count of completed backtest jobs
     */
    async getCompletedBacktestCount() {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return 0;
        const result = this.db.prepare("SELECT COUNT(*) as count FROM backtest_jobs WHERE status = 'COMPLETED'").get();
        return result.count;
    }
    /**
     * Update backtest job status
     */
    async updateBacktestJobStatus(id, status) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        const updates = ['status = ?'];
        const params = [status];
        if (status === 'RUNNING') {
            updates.push('started_at = ?');
            params.push(new Date().toISOString());
        }
        params.push(id);
        this.db.prepare(`
      UPDATE backtest_jobs 
      SET ${updates.join(', ')}
      WHERE id = ?
    `).run(...params);
    }
    /**
     * Complete backtest job and save results
     */
    async completeBacktestJob(id, results) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        const now = new Date().toISOString();
        // Update backtest job
        this.db.prepare(`
      UPDATE backtest_jobs 
      SET status = 'COMPLETED', results = ?, completed_at = ?
      WHERE id = ?
    `).run(JSON.stringify(results), now, id);
        // Get strategy ID from job
        const job = this.db.prepare('SELECT strategy_id FROM backtest_jobs WHERE id = ?').get(id);
        if (!job)
            return;
        // Update strategy status
        this.db.prepare(`
      UPDATE strategy_ideas 
      SET status = 'COMPLETED', updated_at = ?
      WHERE id = ?
    `).run(now, job.strategy_id);
        // Save or update performance metrics
        this.savePerformanceMetrics(job.strategy_id, results);
    }
    /**
     * Save strategy performance metrics
     */
    async savePerformanceMetrics(strategyId, results) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        const now = new Date().toISOString();
        this.db.prepare(`
      INSERT OR REPLACE INTO strategy_performance (
        id, strategy_id, sharpe, win_rate, pnl, max_drawdown,
        total_trades, profit_factor, updated_at
      ) VALUES (
        COALESCE((SELECT id FROM strategy_performance WHERE strategy_id = ?), ?),
        ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(strategyId, (0, uuid_1.v4)(), strategyId, results.sharpeRatio || 0, results.winRate || 0, results.pnl || 0, results.maxDrawdown || 0, results.totalTrades || 0, results.profitFactor || 0, now);
    }
    /**
     * Get top performing strategies
     */
    async getTopStrategies(limit = 10) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return [];
        const rows = this.db.prepare(`
      SELECT p.*, i.name as strategy_name, i.type, i.symbols
      FROM strategy_performance p
      JOIN strategy_ideas i ON p.strategy_id = i.id
      WHERE p.sharpe > 0
      ORDER BY p.sharpe DESC, p.win_rate DESC
      LIMIT ?
    `).all(limit);
        return rows.map(row => ({
            id: row.id,
            strategyId: row.strategy_id,
            strategyName: row.strategy_name,
            type: row.type,
            symbols: JSON.parse(row.symbols || '[]'),
            sharpe: row.sharpe,
            winRate: row.win_rate,
            pnl: row.pnl,
            maxDrawdown: row.max_drawdown,
            totalTrades: row.total_trades,
            profitFactor: row.profit_factor,
            updatedAt: new Date(row.updated_at),
        }));
    }
    /**
     * Get ideas by status
     */
    async getIdeasByStatus(status) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return [];
        const rows = this.db.prepare(`
      SELECT * FROM strategy_ideas WHERE status = ?
      ORDER BY created_at DESC
    `).all(status);
        return rows.map(row => this.rowToIdea(row));
    }
    /**
     * Delete old completed ideas
     */
    async cleanupOldIdeas(ageDays = 30) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return 0;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - ageDays);
        const result = this.db.prepare(`
      DELETE FROM strategy_ideas 
      WHERE status IN ('COMPLETED', 'FAILED', 'REJECTED')
      AND created_at < ?
    `).run(cutoff.toISOString());
        logger_1.default.info(`[IdeaQueue] Cleaned up ${result.changes} old ideas`);
        return result.changes;
    }
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.initialized = false;
        }
    }
    // Helper methods
    rowToIdea(row) {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            type: row.type,
            symbols: JSON.parse(row.symbols || '[]'),
            timeframe: row.timeframe,
            parameters: JSON.parse(row.parameters || '{}'),
            entryConditions: JSON.parse(row.entry_conditions || '[]'),
            exitConditions: JSON.parse(row.exit_conditions || '[]'),
            riskParameters: JSON.parse(row.risk_parameters || '{}'),
            confidence: row.confidence,
            rationale: row.rationale,
            status: row.status,
            marketContext: JSON.parse(row.market_context || '{}'),
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
    }
    rowToBacktestJob(row) {
        return {
            id: row.id,
            strategyId: row.strategy_id,
            status: row.status,
            results: row.results ? JSON.parse(row.results) : undefined,
            startedAt: row.started_at ? new Date(row.started_at) : undefined,
            completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
            error: row.error,
        };
    }
}
exports.IdeaQueue = IdeaQueue;
// Export singleton instance
exports.ideaQueue = new IdeaQueue();
exports.default = exports.ideaQueue;
//# sourceMappingURL=idea-queue.js.map