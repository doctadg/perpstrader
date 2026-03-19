"use strict";
// Experiment Store - SQLite-based experiment tracking for AutoResearch integration
// Follows the same DB access pattern as IdeaQueue
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.experimentStore = exports.ExperimentStore = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = __importDefault(require("../shared/config"));
class ExperimentStore {
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
            this.createTable();
            this.initialized = true;
            logger_1.default.info('[ExperimentStore] Database initialized successfully');
        }
        catch (error) {
            logger_1.default.error('[ExperimentStore] Failed to initialize database:', error);
            throw error;
        }
    }
    /**
     * Create the experiments table if not exists
     */
    createTable() {
        if (!this.db)
            return;
        try {
            this.db.exec(`
        CREATE TABLE IF NOT EXISTS autoresearch_experiments (
          id TEXT PRIMARY KEY,
          status TEXT DEFAULT 'pending',
          experiment_type TEXT,
          parameters TEXT,
          metrics TEXT,
          result TEXT,
          description TEXT,
          created_at TEXT NOT NULL,
          completed_at TEXT,
          commit_hash TEXT
        )
      `);
            // Index on status for filtering
            this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_experiments_status ON autoresearch_experiments(status)
      `);
            // Index on experiment_type for filtering
            this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_experiments_type ON autoresearch_experiments(experiment_type)
      `);
            // Index on created_at for ordering
            this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_experiments_created ON autoresearch_experiments(created_at)
      `);
            logger_1.default.info('[ExperimentStore] Table ensured successfully');
        }
        catch (error) {
            logger_1.default.error('[ExperimentStore] Failed to create table:', error);
            throw error;
        }
    }
    /**
     * Insert a new experiment
     */
    async createExperiment(input) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        const id = input.id || (0, uuid_1.v4)();
        const now = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO autoresearch_experiments (
        id, status, experiment_type, parameters, metrics, result,
        description, created_at, completed_at, commit_hash
      ) VALUES (?, 'pending', ?, ?, '{}', '', ?, ?, NULL, ?)
    `).run(id, input.experimentType, JSON.stringify(input.parameters || {}), input.description || '', now, input.commitHash || null);
        logger_1.default.info(`[ExperimentStore] Created experiment ${id} (type: ${input.experimentType})`);
        return this.getExperiment(id);
    }
    /**
     * Update an existing experiment
     */
    async updateExperiment(id, updates) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        const sets = [];
        const params = [];
        if (updates.status !== undefined) {
            sets.push('status = ?');
            params.push(updates.status);
        }
        if (updates.metrics !== undefined) {
            sets.push('metrics = ?');
            params.push(JSON.stringify(updates.metrics));
        }
        if (updates.result !== undefined) {
            sets.push('result = ?');
            params.push(updates.result);
        }
        if (updates.completedAt !== undefined) {
            sets.push('completed_at = ?');
            params.push(updates.completedAt);
        }
        if (updates.commitHash !== undefined) {
            sets.push('commit_hash = ?');
            params.push(updates.commitHash);
        }
        if (sets.length === 0)
            return;
        params.push(id);
        this.db.prepare(`
      UPDATE autoresearch_experiments
      SET ${sets.join(', ')}
      WHERE id = ?
    `).run(...params);
        logger_1.default.debug(`[ExperimentStore] Updated experiment ${id}: ${sets.join(', ')}`);
    }
    /**
     * Get a single experiment by id
     */
    async getExperiment(id) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            throw new Error('Database not initialized');
        const row = this.db.prepare('SELECT * FROM autoresearch_experiments WHERE id = ?').get(id);
        if (!row) {
            throw new Error(`Experiment ${id} not found`);
        }
        return this.rowToExperiment(row);
    }
    /**
     * List experiments with optional filtering
     */
    async getExperiments(filter, limit = 50, offset = 0) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return [];
        const conditions = [];
        const params = [];
        if (filter?.status) {
            conditions.push('status = ?');
            params.push(filter.status);
        }
        if (filter?.experimentType) {
            conditions.push('experiment_type = ?');
            params.push(filter.experimentType);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const rows = this.db.prepare(`
      SELECT * FROM autoresearch_experiments
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);
        return rows.map(row => this.rowToExperiment(row));
    }
    /**
     * Get best experiments ordered by a specific metric descending
     */
    async getBestExperiments(metric, limit = 10) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return [];
        const rows = this.db.prepare(`
      SELECT * FROM autoresearch_experiments
      WHERE status = 'completed'
        AND metrics IS NOT NULL
        AND json_extract(metrics, ?) IS NOT NULL
      ORDER BY json_extract(metrics, ?) DESC
      LIMIT ?
    `).all(`$.${metric}`, `$.${metric}`, limit);
        return rows.map(row => this.rowToExperiment(row));
    }
    /**
     * Get the most recently completed experiment
     */
    async getLatestResult() {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return null;
        const row = this.db.prepare(`
      SELECT * FROM autoresearch_experiments
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `).get();
        return row ? this.rowToExperiment(row) : null;
    }
    /**
     * Get aggregate statistics
     */
    async getStats() {
        if (!this.db)
            await this.initialize();
        if (!this.db) {
            return {
                total: 0,
                pending: 0,
                running: 0,
                completed: 0,
                failed: 0,
                adopted: 0,
                discarded: 0,
                successRate: 0,
                adoptionRate: 0,
                avgMetrics: {},
            };
        }
        // Count by status
        const counts = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM autoresearch_experiments
      GROUP BY status
    `).all();
        const statusMap = {};
        for (const row of counts) {
            statusMap[row.status] = row.count;
        }
        const total = Object.values(statusMap).reduce((sum, c) => sum + c, 0);
        const completed = statusMap['completed'] || 0;
        const adopted = statusMap['adopted'] || 0;
        const successRate = completed > 0
            ? ((adopted / completed) * 100)
            : 0;
        const adoptionRate = total > 0
            ? ((adopted / total) * 100)
            : 0;
        // Compute average metrics across completed experiments
        const avgMetrics = {};
        const metricRows = this.db.prepare(`
      SELECT metrics FROM autoresearch_experiments
      WHERE status IN ('completed', 'adopted')
        AND metrics IS NOT NULL
        AND metrics != '{}'
    `).all();
        const metricCounts = {};
        for (const row of metricRows) {
            try {
                const metrics = JSON.parse(row.metrics);
                for (const [key, value] of Object.entries(metrics)) {
                    if (typeof value === 'number' && Number.isFinite(value)) {
                        if (!metricCounts[key]) {
                            metricCounts[key] = { sum: 0, count: 0 };
                        }
                        metricCounts[key].sum += value;
                        metricCounts[key].count++;
                    }
                }
            }
            catch {
                // Skip malformed JSON
            }
        }
        for (const [key, agg] of Object.entries(metricCounts)) {
            avgMetrics[key] = agg.sum / agg.count;
        }
        return {
            total,
            pending: statusMap['pending'] || 0,
            running: statusMap['running'] || 0,
            completed,
            failed: statusMap['failed'] || 0,
            adopted,
            discarded: statusMap['discarded'] || 0,
            successRate: Math.round(successRate * 100) / 100,
            adoptionRate: Math.round(adoptionRate * 100) / 100,
            avgMetrics,
        };
    }
    /**
     * Remove experiments older than the given number of days
     */
    async cleanupOldExperiments(daysOld = 30) {
        if (!this.db)
            await this.initialize();
        if (!this.db)
            return 0;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysOld);
        const result = this.db.prepare(`
      DELETE FROM autoresearch_experiments
      WHERE status IN ('completed', 'failed', 'discarded')
        AND created_at < ?
    `).run(cutoff.toISOString());
        logger_1.default.info(`[ExperimentStore] Cleaned up ${result.changes} old experiments`);
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
    // Helper: map a DB row to an Experiment interface
    rowToExperiment(row) {
        return {
            id: row.id,
            status: row.status,
            experimentType: row.experiment_type,
            parameters: JSON.parse(row.parameters || '{}'),
            metrics: JSON.parse(row.metrics || '{}'),
            result: row.result || '',
            description: row.description || '',
            createdAt: row.created_at,
            completedAt: row.completed_at,
            commitHash: row.commit_hash,
        };
    }
}
exports.ExperimentStore = ExperimentStore;
// Export singleton instance
exports.experimentStore = new ExperimentStore();
exports.default = exports.experimentStore;
//# sourceMappingURL=experiment-store.js.map