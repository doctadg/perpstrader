// Experiment Store - SQLite-based experiment tracking for AutoResearch integration
// Follows the same DB access pattern as IdeaQueue

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import logger from '../shared/logger';
import config from '../shared/config';

export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'adopted' | 'discarded';

export interface Experiment {
  id: string;
  status: ExperimentStatus;
  experimentType: string;
  parameters: Record<string, any>;
  metrics: Record<string, number>;
  result: string;
  description: string;
  createdAt: string;
  completedAt: string | null;
  commitHash: string | null;
}

export interface ExperimentInput {
  id?: string;
  experimentType: string;
  parameters?: Record<string, any>;
  description?: string;
  commitHash?: string;
}

export interface ExperimentUpdate {
  status?: ExperimentStatus;
  metrics?: Record<string, number>;
  result?: string;
  completedAt?: string;
  commitHash?: string;
}

export interface ExperimentFilter {
  status?: ExperimentStatus;
  experimentType?: string;
}

export interface ExperimentStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  adopted: number;
  discarded: number;
  successRate: number;
  adoptionRate: number;
  avgMetrics: Record<string, number>;
}

export class ExperimentStore {
  private db: Database.Database | null = null;
  private dbPath: string;
  private initialized: boolean = false;

  constructor() {
    const dbConfig = config.getSection('database');
    this.dbPath = dbConfig.connection;
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      this.createTable();
      this.initialized = true;

      logger.info('[ExperimentStore] Database initialized successfully');
    } catch (error) {
      logger.error('[ExperimentStore] Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Create the experiments table if not exists
   */
  private createTable(): void {
    if (!this.db) return;

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

      logger.info('[ExperimentStore] Table ensured successfully');
    } catch (error) {
      logger.error('[ExperimentStore] Failed to create table:', error);
      throw error;
    }
  }

  /**
   * Insert a new experiment
   */
  async createExperiment(input: ExperimentInput): Promise<Experiment> {
    if (!this.db) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const id = input.id || uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO autoresearch_experiments (
        id, status, experiment_type, parameters, metrics, result,
        description, created_at, completed_at, commit_hash
      ) VALUES (?, 'pending', ?, ?, '{}', '', ?, ?, NULL, ?)
    `).run(
      id,
      input.experimentType,
      JSON.stringify(input.parameters || {}),
      input.description || '',
      now,
      input.commitHash || null,
    );

    logger.info(`[ExperimentStore] Created experiment ${id} (type: ${input.experimentType})`);
    return this.getExperiment(id);
  }

  /**
   * Update an existing experiment
   */
  async updateExperiment(id: string, updates: ExperimentUpdate): Promise<void> {
    if (!this.db) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const sets: string[] = [];
    const params: any[] = [];

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

    if (sets.length === 0) return;

    params.push(id);
    this.db.prepare(`
      UPDATE autoresearch_experiments
      SET ${sets.join(', ')}
      WHERE id = ?
    `).run(...params);

    logger.debug(`[ExperimentStore] Updated experiment ${id}: ${sets.join(', ')}`);
  }

  /**
   * Get a single experiment by id
   */
  async getExperiment(id: string): Promise<Experiment> {
    if (!this.db) await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare(
      'SELECT * FROM autoresearch_experiments WHERE id = ?'
    ).get(id) as any;

    if (!row) {
      throw new Error(`Experiment ${id} not found`);
    }

    return this.rowToExperiment(row);
  }

  /**
   * List experiments with optional filtering
   */
  async getExperiments(
    filter?: ExperimentFilter,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Experiment[]> {
    if (!this.db) await this.initialize();
    if (!this.db) return [];

    const conditions: string[] = [];
    const params: any[] = [];

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
    `).all(...params, limit, offset) as any[];

    return rows.map(row => this.rowToExperiment(row));
  }

  /**
   * Get best experiments ordered by a specific metric descending
   */
  async getBestExperiments(metric: string, limit: number = 10): Promise<Experiment[]> {
    if (!this.db) await this.initialize();
    if (!this.db) return [];

    const rows = this.db.prepare(`
      SELECT * FROM autoresearch_experiments
      WHERE status = 'completed'
        AND metrics IS NOT NULL
        AND json_extract(metrics, ?) IS NOT NULL
      ORDER BY json_extract(metrics, ?) DESC
      LIMIT ?
    `).all(`$.${metric}`, `$.${metric}`, limit) as any[];

    return rows.map(row => this.rowToExperiment(row));
  }

  /**
   * Get the most recently completed experiment
   */
  async getLatestResult(): Promise<Experiment | null> {
    if (!this.db) await this.initialize();
    if (!this.db) return null;

    const row = this.db.prepare(`
      SELECT * FROM autoresearch_experiments
      WHERE status = 'completed'
      ORDER BY completed_at DESC
      LIMIT 1
    `).get() as any;

    return row ? this.rowToExperiment(row) : null;
  }

  /**
   * Get aggregate statistics
   */
  async getStats(): Promise<ExperimentStats> {
    if (!this.db) await this.initialize();
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
    `).all() as { status: string; count: number }[];

    const statusMap: Record<string, number> = {};
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
    const avgMetrics: Record<string, number> = {};
    const metricRows = this.db.prepare(`
      SELECT metrics FROM autoresearch_experiments
      WHERE status IN ('completed', 'adopted')
        AND metrics IS NOT NULL
        AND metrics != '{}'
    `).all() as { metrics: string }[];

    const metricCounts: Record<string, { sum: number; count: number }> = {};
    for (const row of metricRows) {
      try {
        const metrics = JSON.parse(row.metrics) as Record<string, number>;
        for (const [key, value] of Object.entries(metrics)) {
          if (typeof value === 'number' && Number.isFinite(value)) {
            if (!metricCounts[key]) {
              metricCounts[key] = { sum: 0, count: 0 };
            }
            metricCounts[key].sum += value;
            metricCounts[key].count++;
          }
        }
      } catch {
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
  async cleanupOldExperiments(daysOld: number = 30): Promise<number> {
    if (!this.db) await this.initialize();
    if (!this.db) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const result = this.db.prepare(`
      DELETE FROM autoresearch_experiments
      WHERE status IN ('completed', 'failed', 'discarded')
        AND created_at < ?
    `).run(cutoff.toISOString());

    logger.info(`[ExperimentStore] Cleaned up ${result.changes} old experiments`);
    return result.changes;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  // Helper: map a DB row to an Experiment interface
  private rowToExperiment(row: any): Experiment {
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

// Export singleton instance
export const experimentStore = new ExperimentStore();
export default experimentStore;
