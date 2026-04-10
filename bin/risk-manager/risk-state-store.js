"use strict";
// =============================================================================
// Persistent Risk State Store — SQLite-backed risk manager state
// =============================================================================
//
// Persists risk manager state (dailyPnL, consecutiveLosses, cooldowns, etc.)
// so it survives restarts.  Each setState() call writes immediately to SQLite.
//
// DB file: data/risk_state.db
// =============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RISK_KEYS = void 0;
exports.restoreState = restoreState;
exports.getState = getState;
exports.setState = setState;
exports.getAll = getAll;
exports.resetDaily = resetDaily;
exports.removeState = removeState;
exports.close = close;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const logger_1 = __importDefault(require("../shared/logger"));
// ---------------------------------------------------------------------------
// DB path
// ---------------------------------------------------------------------------
const DB_PATH = path_1.default.resolve(__dirname, '../../data/risk_state.db');
// ---------------------------------------------------------------------------
// Module-level state (singleton)
// ---------------------------------------------------------------------------
let db = null;
let stmtUpsert;
let stmtGet;
let stmtGetAll;
let stmtDelete;
// ---------------------------------------------------------------------------
// Known keys — used for documentation & resetDaily()
// ---------------------------------------------------------------------------
exports.RISK_KEYS = {
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
};
// Keys that should be reset at the start of a new day
const DAILY_RESET_KEYS = [
    exports.RISK_KEYS.dailyPnL,
    exports.RISK_KEYS.dailyLossAlert1Triggered,
    exports.RISK_KEYS.dailyLossAlert2Triggered,
];
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function ensureDataDir() {
    const dir = path_1.default.dirname(DB_PATH);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
function openDb() {
    ensureDataDir();
    db = new better_sqlite3_1.default(DB_PATH);
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
    logger_1.default.info(`[RiskStateStore] Database opened at ${DB_PATH}`);
}
// ---------------------------------------------------------------------------
// restoreState() — Load all persisted state into a plain object.
// Call this on RiskManager construction to hydrate in-memory fields.
// ---------------------------------------------------------------------------
function restoreState() {
    if (!db)
        openDb();
    const rows = stmtGetAll.all();
    const state = {};
    for (const row of rows) {
        try {
            state[row.key] = JSON.parse(row.value);
        }
        catch {
            state[row.key] = row.value;
        }
    }
    logger_1.default.info(`[RiskStateStore] Restored ${rows.length} state key(s) from database`);
    return state;
}
// ===========================================================================
// Public API
// ===========================================================================
/**
 * Get a persisted value by key.  Returns the parsed JSON value or the
 * raw string if JSON parsing fails.  Returns `undefined` if key not found.
 */
function getState(key) {
    if (!db)
        openDb();
    const row = stmtGet.get(key);
    if (!row)
        return undefined;
    try {
        return JSON.parse(row.value);
    }
    catch {
        return row.value;
    }
}
/**
 * Set a persisted value.  Value is JSON-serialised before storage.
 * Writes to SQLite immediately (risk state changes are infrequent).
 */
function setState(key, value) {
    if (!db)
        openDb();
    try {
        const serialised = JSON.stringify(value);
        stmtUpsert.run(key, serialised);
    }
    catch (err) {
        logger_1.default.error(`[RiskStateStore] Failed to set state for key "${key}":`, err);
    }
}
/**
 * Get all persisted state as a plain object.
 */
function getAll() {
    if (!db)
        openDb();
    const rows = stmtGetAll.all();
    const state = {};
    for (const row of rows) {
        try {
            state[row.key] = JSON.parse(row.value);
        }
        catch {
            state[row.key] = row.value;
        }
    }
    return state;
}
/**
 * Reset daily counters.  Called at the start of each new trading day.
 */
function resetDaily() {
    if (!db)
        openDb();
    for (const key of DAILY_RESET_KEYS) {
        try {
            stmtUpsert.run(key, key === exports.RISK_KEYS.dailyPnL ? '0' : 'false');
        }
        catch (err) {
            logger_1.default.error(`[RiskStateStore] Failed to reset daily key "${key}":`, err);
        }
    }
    // Always record when we reset
    setState(exports.RISK_KEYS.lastResetDate, new Date().toISOString());
    logger_1.default.info('[RiskStateStore] Daily state reset completed');
}
/**
 * Remove a specific key from the store.
 */
function removeState(key) {
    if (!db)
        openDb();
    try {
        stmtDelete.run(key);
    }
    catch (err) {
        logger_1.default.error(`[RiskStateStore] Failed to remove key "${key}":`, err);
    }
}
/**
 * Close the database connection. Call on graceful shutdown.
 */
function close() {
    if (db) {
        try {
            db.close();
        }
        catch { /* ignore */ }
        db = null;
    }
}
//# sourceMappingURL=risk-state-store.js.map