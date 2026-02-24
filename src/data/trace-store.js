"use strict";
// Trace Store Service - Persists agent traces to SQLite for LLM analysis
// This enables daily processing of traces to improve agent strategy
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
var better_sqlite3_1 = require("better-sqlite3");
var config_1 = require("../shared/config");
var logger_1 = require("../shared/logger");
// Get database path from config
var fullConfig = config_1.default.get();
var dbPath = ((_a = fullConfig.database) === null || _a === void 0 ? void 0 : _a.connection) || './data/trading.db';
var TraceStore = /** @class */ (function () {
    function TraceStore() {
        this.db = null;
        this.initialized = false;
        this.summaryColumnsReady = false;
        this.agentTypeColumnReady = false;
    }
    /**
     * Initialize the trace store - creates table if not exists
     */
    TraceStore.prototype.initialize = function () {
        if (this.initialized)
            return;
        try {
            this.db = new better_sqlite3_1.default(dbPath);
            this.db.pragma('journal_mode = WAL');
            // Create agent_traces table
            this.db.exec("\n                CREATE TABLE IF NOT EXISTS agent_traces (\n                    id TEXT PRIMARY KEY,\n                    created_at TEXT NOT NULL,\n                    symbol TEXT NOT NULL,\n                    timeframe TEXT NOT NULL,\n                    regime TEXT,\n                    agent_type TEXT DEFAULT 'PERPS',\n                    trace_data TEXT NOT NULL,\n                    trade_executed INTEGER NOT NULL DEFAULT 0,\n                    success INTEGER NOT NULL DEFAULT 0,\n                    analyzed INTEGER NOT NULL DEFAULT 0,\n                    analysis_batch_id TEXT\n                )\n            ");
            // Create index for efficient querying of unanalyzed traces
            this.db.exec("\n                CREATE INDEX IF NOT EXISTS idx_traces_analyzed \n                ON agent_traces(analyzed, created_at)\n            ");
            // Create index for symbol-based queries
            this.db.exec("\n                CREATE INDEX IF NOT EXISTS idx_traces_symbol \n                ON agent_traces(symbol, created_at)\n            ");
            // Create index for recent trace retrieval
            this.db.exec("\n                CREATE INDEX IF NOT EXISTS idx_traces_created_at \n                ON agent_traces(created_at)\n            ");
            this.ensureSummaryColumns();
            this.initialized = true;
            logger_1.default.info('[TraceStore] Initialized successfully');
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to initialize:', error);
            throw error;
        }
    };
    /**
     * Store a completed cycle trace
     */
    TraceStore.prototype.storeTrace = function (trace) {
        var _a, _b, _c;
        if (!this.db) {
            this.initialize();
        }
        try {
            var createdAt = new Date().toISOString();
            var startTime = this.toIsoString(trace.startTime) || createdAt;
            var endTime = this.toIsoString(trace.endTime);
            var strategyCount = ((_a = trace.strategyIdeas) === null || _a === void 0 ? void 0 : _a.length) || 0;
            var riskScore = (_c = (_b = trace.riskAssessment) === null || _b === void 0 ? void 0 : _b.riskScore) !== null && _c !== void 0 ? _c : 0;
            var agentType = trace.agentType || 'PERPS';
            if (this.summaryColumnsReady && this.agentTypeColumnReady) {
                var stmt = this.db.prepare("\n                    INSERT INTO agent_traces (\n                        id, created_at, symbol, timeframe, regime, agent_type,\n                        trace_data, trade_executed, success, analyzed,\n                        start_time, end_time, strategy_count, risk_score\n                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)\n                ");
                stmt.run(trace.cycleId, createdAt, trace.symbol, trace.timeframe || '1h', trace.regime, agentType, JSON.stringify(trace), trace.tradeExecuted ? 1 : 0, trace.success ? 1 : 0, startTime, endTime, strategyCount, riskScore);
            }
            else if (this.summaryColumnsReady) {
                var stmt = this.db.prepare("\n                    INSERT INTO agent_traces (\n                        id, created_at, symbol, timeframe, regime,\n                        trace_data, trade_executed, success, analyzed,\n                        start_time, end_time, strategy_count, risk_score\n                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)\n                ");
                stmt.run(trace.cycleId, createdAt, trace.symbol, trace.timeframe || '1h', trace.regime, JSON.stringify(trace), trace.tradeExecuted ? 1 : 0, trace.success ? 1 : 0, startTime, endTime, strategyCount, riskScore);
            }
            else if (this.agentTypeColumnReady) {
                var stmt = this.db.prepare("\n                    INSERT INTO agent_traces (\n                        id, created_at, symbol, timeframe, regime, agent_type,\n                        trace_data, trade_executed, success, analyzed\n                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)\n                ");
                stmt.run(trace.cycleId, createdAt, trace.symbol, trace.timeframe || '1h', trace.regime, agentType, JSON.stringify(trace), trace.tradeExecuted ? 1 : 0, trace.success ? 1 : 0);
            }
            else {
                var stmt = this.db.prepare("\n                    INSERT INTO agent_traces (\n                        id, created_at, symbol, timeframe, regime,\n                        trace_data, trade_executed, success, analyzed\n                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)\n                ");
                stmt.run(trace.cycleId, createdAt, trace.symbol, trace.timeframe || '1h', trace.regime, JSON.stringify(trace), trace.tradeExecuted ? 1 : 0, trace.success ? 1 : 0);
            }
            logger_1.default.debug("[TraceStore] Stored trace ".concat(trace.cycleId, " for ").concat(trace.symbol));
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to store trace:', error);
            throw error;
        }
    };
    /**
     * Get traces that haven't been analyzed yet
     */
    TraceStore.prototype.getUnanalyzedTraces = function (limit) {
        if (limit === void 0) { limit = 100; }
        if (!this.db) {
            this.initialize();
        }
        try {
            var stmt = this.db.prepare("\n                SELECT * FROM agent_traces \n                WHERE analyzed = 0 \n                ORDER BY created_at ASC \n                LIMIT ?\n            ");
            var rows = stmt.all(limit);
            return rows.map(function (row) { return ({
                id: row.id,
                createdAt: row.created_at,
                symbol: row.symbol,
                timeframe: row.timeframe,
                regime: row.regime,
                traceData: row.trace_data,
                tradeExecuted: row.trade_executed === 1,
                success: row.success === 1,
                analyzed: row.analyzed === 1,
                analysisBatchId: row.analysis_batch_id,
            }); });
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to get unanalyzed traces:', error);
            return [];
        }
    };
    /**
     * Get traces for a specific date range
     */
    TraceStore.prototype.getTracesByDateRange = function (startDate, endDate, symbol) {
        if (!this.db) {
            this.initialize();
        }
        try {
            var query = "\n                SELECT * FROM agent_traces \n                WHERE created_at >= ? AND created_at <= ?\n            ";
            var params = [startDate.toISOString(), endDate.toISOString()];
            if (symbol) {
                query += ' AND symbol = ?';
                params.push(symbol);
            }
            query += ' ORDER BY created_at ASC';
            var stmt = this.db.prepare(query);
            var rows = stmt.all.apply(stmt, params);
            return rows.map(function (row) { return ({
                id: row.id,
                createdAt: row.created_at,
                symbol: row.symbol,
                timeframe: row.timeframe,
                regime: row.regime,
                traceData: row.trace_data,
                tradeExecuted: row.trade_executed === 1,
                success: row.success === 1,
                analyzed: row.analyzed === 1,
                analysisBatchId: row.analysis_batch_id,
            }); });
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to get traces by date range:', error);
            return [];
        }
    };
    /**
     * Mark traces as analyzed
     */
    TraceStore.prototype.markTracesAnalyzed = function (traceIds, batchId) {
        if (!this.db) {
            this.initialize();
        }
        if (traceIds.length === 0)
            return;
        try {
            var placeholders = traceIds.map(function () { return '?'; }).join(',');
            var stmt = this.db.prepare("\n                UPDATE agent_traces \n                SET analyzed = 1, analysis_batch_id = ?\n                WHERE id IN (".concat(placeholders, ")\n            "));
            stmt.run.apply(stmt, __spreadArray([batchId], traceIds, false));
            logger_1.default.info("[TraceStore] Marked ".concat(traceIds.length, " traces as analyzed (batch: ").concat(batchId, ")"));
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to mark traces as analyzed:', error);
            throw error;
        }
    };
    /**
     * Get recent traces (for dashboard display)
     */
    TraceStore.prototype.getRecentTraces = function (limit, agentType) {
        if (limit === void 0) { limit = 50; }
        if (!this.db) {
            this.initialize();
        }
        try {
            var resolvedLimit = Number.isFinite(limit) ? limit : 50;
            var hasAgentType = this.agentTypeColumnReady && agentType;
            var stmt = this.db.prepare("\n                SELECT * FROM agent_traces\n                ".concat(hasAgentType ? 'WHERE agent_type = ?' : '', "\n                ORDER BY created_at DESC\n                LIMIT ?\n            "));
            var rows = (hasAgentType
                ? stmt.all(agentType, resolvedLimit)
                : stmt.all(resolvedLimit));
            return rows.map(function (row) { return ({
                id: row.id,
                createdAt: row.created_at,
                symbol: row.symbol,
                timeframe: row.timeframe,
                regime: row.regime,
                agentType: row.agent_type || undefined,
                traceData: row.trace_data,
                tradeExecuted: row.trade_executed === 1,
                success: row.success === 1,
                analyzed: row.analyzed === 1,
                analysisBatchId: row.analysis_batch_id,
            }); });
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to get recent traces:', error);
            return [];
        }
    };
    TraceStore.prototype.getRecentTraceSummaries = function (limit, agentType) {
        var _this = this;
        if (limit === void 0) { limit = 50; }
        if (!this.db) {
            this.initialize();
        }
        try {
            var resolvedLimit = Number.isFinite(limit) ? limit : 50;
            var hasAgentType = this.agentTypeColumnReady && agentType;
            var agentTypeSelect = this.agentTypeColumnReady ? 'agent_type,' : '';
            if (this.summaryColumnsReady) {
                var stmt_1 = this.db.prepare("\n                    SELECT id, created_at, symbol, timeframe, regime, ".concat(agentTypeSelect, "\n                           trade_executed, success, analyzed,\n                           start_time, end_time, strategy_count, risk_score\n                    FROM agent_traces\n                    ").concat(hasAgentType ? 'WHERE agent_type = ?' : '', "\n                    ORDER BY created_at DESC\n                    LIMIT ?\n                "));
                var rows_1 = (hasAgentType
                    ? stmt_1.all(agentType, resolvedLimit)
                    : stmt_1.all(resolvedLimit));
                return rows_1.map(function (row) { return ({
                    id: row.id,
                    createdAt: row.created_at,
                    startTime: row.start_time || row.created_at,
                    endTime: row.end_time || null,
                    symbol: row.symbol,
                    timeframe: row.timeframe,
                    regime: row.regime,
                    agentType: row.agent_type || undefined,
                    tradeExecuted: row.trade_executed === 1,
                    success: row.success === 1,
                    analyzed: row.analyzed === 1,
                    strategyCount: Number.isFinite(row.strategy_count) ? row.strategy_count : 0,
                    riskScore: Number.isFinite(row.risk_score) ? row.risk_score : 0,
                }); });
            }
            var stmt = this.db.prepare("\n                SELECT id, created_at, symbol, timeframe, regime, ".concat(agentTypeSelect, "\n                       trade_executed, success, analyzed, trace_data\n                FROM agent_traces\n                ").concat(hasAgentType ? 'WHERE agent_type = ?' : '', "\n                ORDER BY created_at DESC\n                LIMIT ?\n            "));
            var rows = (hasAgentType
                ? stmt.all(agentType, resolvedLimit)
                : stmt.all(resolvedLimit));
            return rows.map(function (row) {
                var _a, _b, _c;
                var traceData = null;
                try {
                    traceData = JSON.parse(row.trace_data);
                }
                catch (error) {
                    traceData = null;
                }
                return {
                    id: row.id,
                    createdAt: row.created_at,
                    startTime: _this.toIsoString(traceData === null || traceData === void 0 ? void 0 : traceData.startTime) || row.created_at,
                    endTime: _this.toIsoString(traceData === null || traceData === void 0 ? void 0 : traceData.endTime),
                    symbol: row.symbol,
                    timeframe: row.timeframe,
                    regime: row.regime,
                    agentType: row.agent_type || (traceData === null || traceData === void 0 ? void 0 : traceData.agentType),
                    tradeExecuted: row.trade_executed === 1,
                    success: row.success === 1,
                    analyzed: row.analyzed === 1,
                    strategyCount: ((_a = traceData === null || traceData === void 0 ? void 0 : traceData.strategyIdeas) === null || _a === void 0 ? void 0 : _a.length) || 0,
                    riskScore: (_c = (_b = traceData === null || traceData === void 0 ? void 0 : traceData.riskAssessment) === null || _b === void 0 ? void 0 : _b.riskScore) !== null && _c !== void 0 ? _c : 0,
                };
            });
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to get recent trace summaries:', error);
            return [];
        }
    };
    /**
     * Get a specific trace by ID
     */
    TraceStore.prototype.getTraceById = function (id) {
        if (!this.db) {
            this.initialize();
        }
        try {
            var stmt = this.db.prepare('SELECT * FROM agent_traces WHERE id = ?');
            var row = stmt.get(id);
            if (!row)
                return null;
            return {
                id: row.id,
                createdAt: row.created_at,
                symbol: row.symbol,
                timeframe: row.timeframe,
                regime: row.regime,
                agentType: row.agent_type || undefined,
                traceData: row.trace_data,
                tradeExecuted: row.trade_executed === 1,
                success: row.success === 1,
                analyzed: row.analyzed === 1,
                analysisBatchId: row.analysis_batch_id,
            };
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to get trace by ID:', error);
            return null;
        }
    };
    /**
     * Get trace statistics
     */
    TraceStore.prototype.getStats = function () {
        if (!this.db) {
            this.initialize();
        }
        try {
            var totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM agent_traces');
            var unanalyzedStmt = this.db.prepare('SELECT COUNT(*) as count FROM agent_traces WHERE analyzed = 0');
            var bySymbolStmt = this.db.prepare('SELECT symbol, COUNT(*) as count FROM agent_traces GROUP BY symbol');
            var total = totalStmt.get().count;
            var unanalyzed = unanalyzedStmt.get().count;
            var bySymbolRows = bySymbolStmt.all();
            var bySymbol = {};
            for (var _i = 0, bySymbolRows_1 = bySymbolRows; _i < bySymbolRows_1.length; _i++) {
                var row = bySymbolRows_1[_i];
                bySymbol[row.symbol] = row.count;
            }
            return { total: total, unanalyzed: unanalyzed, bySymbol: bySymbol };
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to get stats:', error);
            return { total: 0, unanalyzed: 0, bySymbol: {} };
        }
    };
    /**
     * Clean up old analyzed traces (retention policy)
     */
    TraceStore.prototype.cleanupOldTraces = function (daysToKeep) {
        if (daysToKeep === void 0) { daysToKeep = 30; }
        if (!this.db) {
            this.initialize();
        }
        try {
            var cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
            var stmt = this.db.prepare("\n                DELETE FROM agent_traces \n                WHERE analyzed = 1 AND created_at < ?\n            ");
            var result = stmt.run(cutoffDate.toISOString());
            logger_1.default.info("[TraceStore] Cleaned up ".concat(result.changes, " old traces"));
            return result.changes;
        }
        catch (error) {
            logger_1.default.error('[TraceStore] Failed to cleanup old traces:', error);
            return 0;
        }
    };
    TraceStore.prototype.ensureSummaryColumns = function () {
        if (!this.db)
            return;
        var columns = new Set(this.db.prepare("PRAGMA table_info('agent_traces')").all()
            .map(function (row) { return row.name; }));
        var required = ['start_time', 'end_time', 'strategy_count', 'risk_score'];
        for (var _i = 0, required_1 = required; _i < required_1.length; _i++) {
            var column = required_1[_i];
            if (!columns.has(column)) {
                try {
                    this.db.exec("ALTER TABLE agent_traces ADD COLUMN ".concat(column, " ").concat(this.columnType(column)));
                }
                catch (error) {
                    logger_1.default.warn("[TraceStore] Failed to add column ".concat(column, ":"), error);
                }
            }
        }
        if (!columns.has('agent_type')) {
            try {
                this.db.exec('ALTER TABLE agent_traces ADD COLUMN agent_type TEXT DEFAULT \'PERPS\'');
            }
            catch (error) {
                logger_1.default.warn('[TraceStore] Failed to add column agent_type:', error);
            }
        }
        var refreshed = new Set(this.db.prepare("PRAGMA table_info('agent_traces')").all()
            .map(function (row) { return row.name; }));
        this.summaryColumnsReady = required.every(function (column) { return refreshed.has(column); });
        this.agentTypeColumnReady = refreshed.has('agent_type');
    };
    TraceStore.prototype.columnType = function (column) {
        switch (column) {
            case 'strategy_count':
                return 'INTEGER';
            case 'risk_score':
                return 'REAL';
            default:
                return 'TEXT';
        }
    };
    TraceStore.prototype.toIsoString = function (value) {
        if (!value)
            return null;
        var date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime()))
            return null;
        return date.toISOString();
    };
    return TraceStore;
}());
// Singleton instance
var traceStore = new TraceStore();
exports.default = traceStore;
