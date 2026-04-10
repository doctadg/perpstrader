// =============================================================================
// Persistent Risk State Store — SQLite-backed risk manager state
// =============================================================================
//
// Persists risk manager state (dailyPnL, consecutiveLosses, cooldowns, etc.)
// so it survives restarts.  Each setState() call writes immediately to SQLite.
//
// DB file: data/risk_state.db
// =============================================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '../shared/logger';

// ---------------------------------------------------------------------------
// DB path
// ---------------------------------------------------------------------------
const DB_PATH = path.resolve(__dirname, '../../data/risk_state.db');

// ---------------------------------------------------------------------------
// Module-level state (singleton)
// ---------------------------------------------------------------------------
let db: Database.Database | null = null;
let stmtUpsert: Database.Statement;
let stmtGet: Database.Statement;
let stmtGetAll: Database.Statement;
let stmtDelete: Database.Statement;

// ---------------------------------------------------------------------------
// Known keys — used for documentation & resetDaily()
// ---------------------------------------------------------------------------
export const RISK_KEYS = {
  dailyPnL: 'daily_pnl',
  consecutiveLosses: 'consecutive_losses',
  totalTrades: 'total_trades',
  maxDrawdown: 'max_drawdown',
  cooldownUntil: 'cooldown_until',
  emergencyStopActive: 'emergency_stop_active',
  emergencyStopReason: 'emergency_stop_reason',
  lastResetDate: 'last_reset_date',
  dailyLossAlert1Triggered: 'daily_loss_alert_1_triggered',
  dailyLossAlert2Triggered: 'daily_loss_alert_2_triggered',
} as const;

// Keys that should be reset at the start of a new day
const DAILY_RESET_KEYS = [
  RISK_KEYS.dailyPnL,
  RISK_KEYS.dailyLossAlert1Triggered,
  RISK_KEYS.dailyLossAlert2Triggered,
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function ensureDataDir(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function openDb(): void {
  ensureDataDir();
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS risk_state (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  stmtUpsert = db.prepare(`
    INSERT INTO risk_state (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value      = excluded.value,
      updated_at = datetime('now')
  `);

  stmtGet = db.prepare('SELECT value FROM risk_state WHERE key = ?');
  stmtGetAll = db.prepare('SELECT key, value FROM risk_state');
  stmtDelete = db.prepare('DELETE FROM risk_state WHERE key = ?');

  logger.info(`[RiskStateStore] Database opened at ${DB_PATH}`);
}

// ---------------------------------------------------------------------------
// restoreState() — Load all persisted state into a plain object.
// Call this on RiskManager construction to hydrate in-memory fields.
// ---------------------------------------------------------------------------
export function restoreState(): Record<string, any> {
  if (!db) openDb();

  const rows = stmtGetAll.all() as Array<{ key: string; value: string }>;
  const state: Record<string, any> = {};

  for (const row of rows) {
    try {
      state[row.key] = JSON.parse(row.value);
    } catch {
      state[row.key] = row.value;
    }
  }

  logger.info(`[RiskStateStore] Restored ${rows.length} state key(s) from database`);
  return state;
}

// ===========================================================================
// Public API
// ===========================================================================

/**
 * Get a persisted value by key.  Returns the parsed JSON value or the
 * raw string if JSON parsing fails.  Returns `undefined` if key not found.
 */
export function getState<T = any>(key: string): T | undefined {
  if (!db) openDb();

  const row = stmtGet.get(key) as { value: string } | undefined;
  if (!row) return undefined;

  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as unknown as T;
  }
}

/**
 * Set a persisted value.  Value is JSON-serialised before storage.
 * Writes to SQLite immediately (risk state changes are infrequent).
 */
export function setState(key: string, value: any): void {
  if (!db) openDb();

  try {
    const serialised = JSON.stringify(value);
    stmtUpsert.run(key, serialised);
  } catch (err) {
    logger.error(`[RiskStateStore] Failed to set state for key "${key}":`, err);
  }
}

/**
 * Get all persisted state as a plain object.
 */
export function getAll(): Record<string, any> {
  if (!db) openDb();

  const rows = stmtGetAll.all() as Array<{ key: string; value: string }>;
  const state: Record<string, any> = {};

  for (const row of rows) {
    try {
      state[row.key] = JSON.parse(row.value);
    } catch {
      state[row.key] = row.value;
    }
  }

  return state;
}

/**
 * Reset daily counters.  Called at the start of each new trading day.
 */
export function resetDaily(): void {
  if (!db) openDb();

  for (const key of DAILY_RESET_KEYS) {
    try {
      stmtUpsert.run(key, key === RISK_KEYS.dailyPnL ? '0' : 'false');
    } catch (err) {
      logger.error(`[RiskStateStore] Failed to reset daily key "${key}":`, err);
    }
  }

  // Always record when we reset
  setState(RISK_KEYS.lastResetDate, new Date().toISOString());
  logger.info('[RiskStateStore] Daily state reset completed');
}

/**
 * Remove a specific key from the store.
 */
export function removeState(key: string): void {
  if (!db) openDb();
  try {
    stmtDelete.run(key);
  } catch (err) {
    logger.error(`[RiskStateStore] Failed to remove key "${key}":`, err);
  }
}

/**
 * Close the database connection. Call on graceful shutdown.
 */
export function close(): void {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
    db = null;
  }
}
