"use strict";
// =============================================================================
// Persistent Agent Registry — SQLite-backed agent status tracking
// =============================================================================
//
// On startup, loads all agents from DB into an in-memory Map for fast access.
// Every mutation (register, update status, stop) writes to BOTH the Map AND SQLite.
// Call restoreAgents() on server start to hydrate the Map from the database.
//
// DB file: data/agent_registry.db
// =============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreAgents = restoreAgents;
exports.ensureAgent = ensureAgent;
exports.getAgent = getAgent;
exports.getAllAgents = getAllAgents;
exports.updateAgentStatus = updateAgentStatus;
exports.setAgentRunning = setAgentRunning;
exports.setAgentStopped = setAgentStopped;
exports.setAgentError = setAgentError;
exports.forEachAgent = forEachAgent;
exports.stopAllAgents = stopAllAgents;
exports.close = close;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const logger_1 = __importDefault(require("../shared/logger"));
// ---------------------------------------------------------------------------
// DB path — resolve relative to project root (two levels up from dist/src/...)
// ---------------------------------------------------------------------------
const DB_PATH = path_1.default.resolve(__dirname, '../../data/agent_registry.db');
// ---------------------------------------------------------------------------
// Module-level state (singleton)
// ---------------------------------------------------------------------------
let db = null;
const agentRegistry = new Map();
// ---------------------------------------------------------------------------
// Prepared statements (initialised once after DB open)
// ---------------------------------------------------------------------------
let stmtUpsert;
let stmtGetAll;
let stmtGet;
let stmtDelete;
// ---------------------------------------------------------------------------
// Internal: ensure data directory exists
// ---------------------------------------------------------------------------
function ensureDataDir() {
    const dir = path_1.default.dirname(DB_PATH);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
// ---------------------------------------------------------------------------
// Internal: open DB, create table, prepare statements
// ---------------------------------------------------------------------------
function openDb() {
    ensureDataDir();
    db = new better_sqlite3_1.default(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
    CREATE TABLE IF NOT EXISTS agent_registry (
      id               TEXT PRIMARY KEY,
      name             TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'STOPPED',
      config           TEXT DEFAULT '{}',
      pid              INTEGER,
      started_at       INTEGER,
      last_heartbeat   INTEGER,
      cycles_completed INTEGER DEFAULT 0,
      error_count      INTEGER DEFAULT 0,
      last_error       TEXT DEFAULT NULL,
      last_activity    INTEGER DEFAULT NULL,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
    // Idempotent migration: add columns that may not exist in older DBs.
    // ALTER TABLE ADD COLUMN fails silently if the column already exists (SQLite ≥ 3.25.0).
    // For older versions we swallow the error.
    const migrations = [
        'ALTER TABLE agent_registry ADD COLUMN cycles_completed INTEGER DEFAULT 0',
        'ALTER TABLE agent_registry ADD COLUMN error_count INTEGER DEFAULT 0',
        'ALTER TABLE agent_registry ADD COLUMN last_error TEXT DEFAULT NULL',
        'ALTER TABLE agent_registry ADD COLUMN last_activity INTEGER DEFAULT NULL',
    ];
    for (const sql of migrations) {
        try {
            db.exec(sql);
        }
        catch { /* column already exists */ }
    }
    stmtUpsert = db.prepare(`
    INSERT INTO agent_registry (id, name, status, config, pid, started_at, last_heartbeat, cycles_completed, error_count, last_error, last_activity, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      status           = excluded.status,
      config           = excluded.config,
      pid              = excluded.pid,
      started_at       = excluded.started_at,
      last_heartbeat   = excluded.last_heartbeat,
      cycles_completed = excluded.cycles_completed,
      error_count      = excluded.error_count,
      last_error       = excluded.last_error,
      last_activity    = excluded.last_activity,
      updated_at       = datetime('now')
  `);
    stmtGetAll = db.prepare('SELECT * FROM agent_registry');
    stmtGet = db.prepare('SELECT * FROM agent_registry WHERE id = ?');
    stmtDelete = db.prepare('DELETE FROM agent_registry WHERE id = ?');
    logger_1.default.info(`[AgentRegistry] Database opened at ${DB_PATH}`);
}
// ---------------------------------------------------------------------------
// restoreAgents() — Load all rows from DB into the in-memory Map.
// Call this once on server startup.
// ---------------------------------------------------------------------------
function restoreAgents() {
    if (!db)
        openDb();
    const rows = stmtGetAll.all();
    agentRegistry.clear();
    for (const row of rows) {
        const state = {
            status: row.status || 'STOPPED',
            startedAt: row.started_at ?? null,
            cyclesCompleted: row.cycles_completed ?? 0,
            errorCount: row.error_count ?? 0,
            lastError: row.last_error ?? null,
            lastActivity: row.last_activity ?? null,
        };
        agentRegistry.set(row.id, state);
    }
    logger_1.default.info(`[AgentRegistry] Restored ${agentRegistry.size} agent(s) from database`);
}
// ---------------------------------------------------------------------------
// ensureAgent() — Make sure an agent entry exists in both Map and DB.
// Used for initialisation on first start.
// ---------------------------------------------------------------------------
function ensureAgent(name) {
    if (!db)
        openDb();
    if (!agentRegistry.has(name)) {
        const state = {
            status: 'STOPPED',
            startedAt: null,
            cyclesCompleted: 0,
            errorCount: 0,
            lastError: null,
            lastActivity: null,
        };
        agentRegistry.set(name, state);
        persistAgent(name);
    }
}
// ---------------------------------------------------------------------------
// persistAgent() — Write current Map state for a single agent to SQLite.
// ---------------------------------------------------------------------------
function persistAgent(name) {
    const state = agentRegistry.get(name);
    if (!state || !db)
        return;
    try {
        stmtUpsert.run(name, // id
        name, // name
        state.status, // status
        '{}', // config (reserved)
        null, // pid
        state.startedAt, // started_at
        state.lastActivity, // last_heartbeat
        state.cyclesCompleted, // cycles_completed
        state.errorCount, // error_count
        state.lastError, // last_error
        state.lastActivity);
    }
    catch (err) {
        logger_1.default.error(`[AgentRegistry] Failed to persist agent ${name}:`, err);
    }
}
// ===========================================================================
// Public API — delegates to the in-memory Map and syncs to SQLite
// ===========================================================================
function getAgent(name) {
    return agentRegistry.get(name);
}
function getAllAgents() {
    return agentRegistry;
}
function updateAgentStatus(name, update) {
    const state = agentRegistry.get(name);
    if (!state)
        return;
    if (update.status !== undefined)
        state.status = update.status;
    if (update.startedAt !== undefined)
        state.startedAt = update.startedAt;
    if (update.cyclesCompleted !== undefined)
        state.cyclesCompleted = update.cyclesCompleted;
    if (update.errorCount !== undefined)
        state.errorCount = update.errorCount;
    if (update.lastError !== undefined)
        state.lastError = update.lastError;
    if (update.lastActivity !== undefined)
        state.lastActivity = update.lastActivity;
    persistAgent(name);
}
function setAgentRunning(name) {
    updateAgentStatus(name, {
        status: 'RUNNING',
        startedAt: Date.now(),
        lastError: null,
        lastActivity: Date.now(),
    });
}
function setAgentStopped(name) {
    updateAgentStatus(name, {
        status: 'STOPPED',
        startedAt: null,
        lastActivity: Date.now(),
    });
}
function setAgentError(name, error) {
    const state = agentRegistry.get(name);
    const newErrorCount = (state?.errorCount ?? 0) + 1;
    updateAgentStatus(name, {
        status: 'ERROR',
        errorCount: newErrorCount,
        lastError: error,
        lastActivity: Date.now(),
    });
}
function forEachAgent(fn) {
    agentRegistry.forEach(fn);
}
/**
 * Stop all agents (e.g. emergency stop). Persists all changes.
 */
function stopAllAgents() {
    agentRegistry.forEach((state, name) => {
        state.status = 'STOPPED';
        state.startedAt = null;
        state.lastActivity = Date.now();
        persistAgent(name);
    });
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
//# sourceMappingURL=agent-registry.js.map