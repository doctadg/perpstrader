"use strict";
// Trading Mode Controller - Core Service
// Manages paper/testnet/live mode across all trading subsystems
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingModeController = void 0;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const logger_1 = __importDefault(require("../shared/logger"));
const message_bus_1 = __importStar(require("../shared/message-bus"));
const SUBSYSTEM_INFO = {
    perps: { description: 'Perpetual futures (Hyperliquid)', envVar: 'PAPER_TRADING' },
    predictions: { description: 'Prediction markets (Polymarket)', envVar: 'PREDICTION_PAPER_TRADING' },
    pumpfun: { description: 'Meme coin sniping (Solana)', envVar: 'PUMPFUN_PAPER_MODE' },
};
const CONFIRMATION_TTL_MS = 10 * 60 * 1000; // 10 minutes
function getDbPath() {
    const base = process.env.DATABASE_URL || path_1.default.join(__dirname, '../../data/trading.db');
    // Ensure parent directory exists
    return base;
}
function detectModeFromEnv(subsystem) {
    switch (subsystem) {
        case 'perps': {
            if (process.env.PAPER_TRADING === 'true')
                return 'paper';
            if (process.env.HYPERLIQUID_TESTNET === 'true')
                return 'testnet';
            if (process.env.PAPER_TRADING === 'false')
                return 'live';
            return 'paper';
        }
        case 'predictions': {
            if (process.env.PREDICTION_PAPER_TRADING === 'false')
                return 'live';
            return 'paper'; // default to paper (true or unset)
        }
        case 'pumpfun': {
            if (process.env.PUMPFUN_PAPER_MODE === 'false')
                return 'live';
            return 'paper'; // default to paper (true or unset)
        }
    }
}
function getDefaultState() {
    const globalMode = process.env.TRADING_MODE || 'paper';
    return {
        global: globalMode,
        perps: detectModeFromEnv('perps'),
        predictions: detectModeFromEnv('predictions'),
        pumpfun: detectModeFromEnv('pumpfun'),
        perpsEnabled: true,
        predictionsEnabled: true,
        pumpfunEnabled: true,
        updatedAt: new Date().toISOString(),
        updatedBy: 'config',
        source: 'config',
    };
}
class TradingModeController {
    static instance = null;
    db;
    state;
    pendingConfirmation = null;
    initialized = false;
    constructor(dbPath) {
        const resolvedPath = dbPath || getDbPath();
        this.db = new better_sqlite3_1.default(resolvedPath);
        this.db.pragma('journal_mode = WAL');
        this.initTables();
        this.state = this.loadState();
        this.initialized = true;
        logger_1.default.info('[TradingMode] Controller initialized', {
            perps: this.state.perps,
            predictions: this.state.predictions,
            pumpfun: this.state.pumpfun,
        });
    }
    static getInstance(dbPath) {
        if (!TradingModeController.instance) {
            TradingModeController.instance = new TradingModeController(dbPath);
        }
        return TradingModeController.instance;
    }
    static resetInstance() {
        if (TradingModeController.instance) {
            TradingModeController.instance.close();
            TradingModeController.instance = null;
        }
    }
    initTables() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS trading_mode_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        state_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trading_mode_audit (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        subsystem TEXT NOT NULL,
        from_mode TEXT NOT NULL,
        to_mode TEXT NOT NULL,
        source TEXT NOT NULL,
        confirmed INTEGER NOT NULL DEFAULT 0,
        confirmed_by TEXT,
        reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_trading_mode_audit_timestamp
        ON trading_mode_audit(timestamp DESC);
    `);
    }
    loadState() {
        try {
            const row = this.db.prepare('SELECT state_json FROM trading_mode_state WHERE id = 1').get();
            if (row) {
                return JSON.parse(row.state_json);
            }
        }
        catch (error) {
            logger_1.default.warn('[TradingMode] Could not load state from DB, using env defaults:', error);
        }
        // First run: detect from env and persist
        const defaultState = getDefaultState();
        this.persistState(defaultState);
        return defaultState;
    }
    persistState(state) {
        this.db.prepare('INSERT INTO trading_mode_state (id, state_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json').run(JSON.stringify(state));
    }
    persistAudit(record) {
        this.db
            .prepare('INSERT INTO trading_mode_audit (id, timestamp, subsystem, from_mode, to_mode, source, confirmed, confirmed_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(record.id, record.timestamp, record.subsystem, record.fromMode, record.toMode, record.source, record.confirmed ? 1 : 0, record.confirmedBy || null, record.reason || null);
    }
    // ---------------------------------------------------------------------------
    // Public API
    // ---------------------------------------------------------------------------
    getEffectiveMode(subsystem) {
        if ((subsystem === 'perps' && !this.state.perpsEnabled) ||
            (subsystem === 'predictions' && !this.state.predictionsEnabled) ||
            (subsystem === 'pumpfun' && !this.state.pumpfunEnabled)) {
            // Disabled subsystems still report their mode (the caller decides what to do)
        }
        return this.state[subsystem];
    }
    /**
     * Set mode for a subsystem or all subsystems.
     * Returns the pending confirmation if switching to live, otherwise returns null.
     */
    setMode(subsystem, mode, source = 'api', reason) {
        const now = new Date().toISOString();
        // Live mode always requires confirmation
        if (mode === 'live') {
            const targets = subsystem === 'all' ? ['global'] : [subsystem];
            // Check current mode for each target
            const currentModes = targets.map((t) => {
                if (t === 'global') {
                    return { target: 'global', current: this.state.global };
                }
                return { target: t, current: this.state[t] };
            });
            // If already live, no confirmation needed
            const allAlreadyLive = currentModes.every((m) => m.current === 'live');
            if (allAlreadyLive) {
                return null;
            }
            // Generate confirmation token
            const token = crypto_1.default.randomBytes(16).toString('hex');
            const target = subsystem === 'all' ? 'global' : subsystem;
            const currentMode = targets[0] === 'global' ? this.state.global : this.state[targets[0]];
            this.pendingConfirmation = {
                token,
                subsystem: target,
                targetMode: mode,
                currentMode,
                createdAt: now,
                expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString(),
                source,
            };
            logger_1.default.warn('[TradingMode] Live mode requested - confirmation required', {
                subsystem,
                token: token.slice(0, 8) + '...',
                source,
            });
            return this.pendingConfirmation;
        }
        // Non-live modes: apply immediately
        return this.applyModeChange(subsystem, mode, source, reason);
    }
    /**
     * Confirm a pending live mode switch.
     */
    confirmModeChange(token) {
        if (!this.pendingConfirmation) {
            return { success: false, state: this.state, error: 'No pending confirmation' };
        }
        if (this.pendingConfirmation.token !== token) {
            return { success: false, state: this.state, error: 'Invalid confirmation token' };
        }
        if (new Date(this.pendingConfirmation.expiresAt) < new Date()) {
            this.pendingConfirmation = null;
            return { success: false, state: this.state, error: 'Confirmation token expired' };
        }
        const confirmation = this.pendingConfirmation;
        this.pendingConfirmation = null;
        // Apply the mode change
        const result = this.applyModeChange(confirmation.subsystem === 'global' ? 'all' : confirmation.subsystem, confirmation.targetMode, confirmation.source, 'Confirmed via token');
        // Mark audit records as confirmed
        this.markRecentAsConfirmed(confirmation.subsystem, token);
        logger_1.default.warn('[TradingMode] Live mode CONFIRMED and applied', {
            subsystem: confirmation.subsystem,
        });
        return { success: true, state: this.state };
    }
    markRecentAsConfirmed(subsystem, token) {
        this.db
            .prepare('UPDATE trading_mode_audit SET confirmed = 1, confirmed_by = ? WHERE subsystem = ? AND to_mode = ? AND confirmed = 0 ORDER BY timestamp DESC LIMIT 10')
            .run(token.slice(0, 16), subsystem, 'live');
    }
    applyModeChange(subsystem, mode, source, reason) {
        const now = new Date().toISOString();
        const subsystems = subsystem === 'all' ? ['perps', 'predictions', 'pumpfun'] : [subsystem];
        for (const sub of subsystems) {
            const fromMode = this.state[sub];
            if (fromMode === mode)
                continue;
            // Create audit record
            const record = {
                id: `${Date.now()}-${crypto_1.default.randomBytes(4).toString('hex')}`,
                timestamp: now,
                subsystem: subsystem === 'all' ? sub : sub,
                fromMode,
                toMode: mode,
                source,
                confirmed: mode !== 'live',
                reason,
            };
            this.persistAudit(record);
            // Update state
            this.state[sub] = mode;
        }
        if (subsystem === 'all') {
            const fromGlobal = this.state.global;
            this.state.global = mode;
            // Also create a global audit record
            const globalRecord = {
                id: `${Date.now()}-global-${crypto_1.default.randomBytes(4).toString('hex')}`,
                timestamp: now,
                subsystem: 'global',
                fromMode: fromGlobal,
                toMode: mode,
                source,
                confirmed: mode !== 'live',
                reason,
            };
            this.persistAudit(globalRecord);
        }
        this.state.updatedAt = now;
        this.state.updatedBy = source;
        this.state.source = source;
        this.persistState(this.state);
        // Broadcast via message bus (graceful fallback if not connected)
        this.broadcastModeChange(subsystem, mode, source);
        return null;
    }
    broadcastModeChange(subsystem, mode, source) {
        try {
            void message_bus_1.default.publish(message_bus_1.Channel.MODE_CHANGE, {
                subsystem,
                mode,
                state: { ...this.state },
                timestamp: new Date().toISOString(),
                source,
            });
        }
        catch {
            // Message bus not available - that's ok, mode is still persisted
            logger_1.default.debug('[TradingMode] Message bus not available, skipping broadcast');
        }
    }
    getHistory(limit = 50) {
        try {
            const rows = this.db
                .prepare('SELECT * FROM trading_mode_audit ORDER BY timestamp DESC LIMIT ?')
                .all(limit);
            return rows.map((row) => ({
                id: row.id,
                timestamp: row.timestamp,
                subsystem: row.subsystem,
                fromMode: row.from_mode,
                toMode: row.to_mode,
                source: row.source,
                confirmed: row.confirmed === 1,
                confirmedBy: row.confirmed_by || undefined,
                reason: row.reason || undefined,
            }));
        }
        catch (error) {
            logger_1.default.error('[TradingMode] Failed to read audit log:', error);
            return [];
        }
    }
    getStatus() {
        return {
            state: { ...this.state },
            audit: this.getHistory(20),
            pendingConfirmation: this.pendingConfirmation
                ? { ...this.pendingConfirmation }
                : null,
            subsystems: {
                perps: {
                    mode: this.state.perps,
                    enabled: this.state.perpsEnabled,
                    description: SUBSYSTEM_INFO.perps.description,
                    envVar: SUBSYSTEM_INFO.perps.envVar,
                },
                predictions: {
                    mode: this.state.predictions,
                    enabled: this.state.predictionsEnabled,
                    description: SUBSYSTEM_INFO.predictions.description,
                    envVar: SUBSYSTEM_INFO.predictions.envVar,
                },
                pumpfun: {
                    mode: this.state.pumpfun,
                    enabled: this.state.pumpfunEnabled,
                    description: SUBSYSTEM_INFO.pumpfun.description,
                    envVar: SUBSYSTEM_INFO.pumpfun.envVar,
                },
            },
        };
    }
    /**
     * Returns the env var overrides each subsystem should use based on current mode.
     */
    exportEnvOverrides() {
        const overrides = {};
        // Perps
        switch (this.state.perps) {
            case 'paper':
                overrides.PAPER_TRADING = 'true';
                break;
            case 'testnet':
                overrides.PAPER_TRADING = 'false';
                overrides.HYPERLIQUID_TESTNET = 'true';
                break;
            case 'live':
                overrides.PAPER_TRADING = 'false';
                overrides.HYPERLIQUID_TESTNET = 'false';
                break;
        }
        // Predictions
        switch (this.state.predictions) {
            case 'paper':
                overrides.PREDICTION_PAPER_TRADING = 'true';
                break;
            case 'testnet':
                overrides.PREDICTION_PAPER_TRADING = 'true';
                break;
            case 'live':
                overrides.PREDICTION_PAPER_TRADING = 'false';
                break;
        }
        // Pumpfun
        switch (this.state.pumpfun) {
            case 'paper':
                overrides.PUMPFUN_PAPER_MODE = 'true';
                break;
            case 'testnet':
                overrides.PUMPFUN_PAPER_MODE = 'true';
                break;
            case 'live':
                overrides.PUMPFUN_PAPER_MODE = 'false';
                break;
        }
        return overrides;
    }
    enableSubsystem(subsystem) {
        const key = `${subsystem}Enabled`;
        this.state[key] = true;
        this.state.updatedAt = new Date().toISOString();
        this.state.source = 'config';
        this.persistState(this.state);
        return { ...this.state };
    }
    disableSubsystem(subsystem) {
        const key = `${subsystem}Enabled`;
        this.state[key] = false;
        this.state.updatedAt = new Date().toISOString();
        this.state.source = 'config';
        this.persistState(this.state);
        return { ...this.state };
    }
    close() {
        try {
            this.db.close();
        }
        catch {
            // ignore
        }
    }
}
exports.TradingModeController = TradingModeController;
exports.default = TradingModeController;
//# sourceMappingURL=controller.js.map