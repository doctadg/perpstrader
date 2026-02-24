// Trace Store Service - Persists agent traces to SQLite for LLM analysis
// This enables daily processing of traces to improve agent strategy

import BetterSqlite3 from 'better-sqlite3';
import configManager from '../shared/config';
import logger from '../shared/logger';

// Get database path from config
const fullConfig = configManager.get();
const dbPath = fullConfig.database?.connection || './data/trading.db';

/**
 * Structure of a stored trace for analysis
 */
export interface StoredTrace {
    id: string;
    createdAt: string;
    symbol: string;
    timeframe: string;
    regime: string | null;
    agentType?: string;
    traceData: string; // JSON string
    tradeExecuted: boolean;
    success: boolean;
    analyzed: boolean;
    analysisBatchId: string | null;
}

export interface TraceSummary {
    id: string;
    createdAt: string;
    startTime: string;
    endTime: string | null;
    symbol: string;
    timeframe: string;
    regime: string | null;
    agentType?: string;
    tradeExecuted: boolean;
    success: boolean;
    analyzed: boolean;
    strategyCount: number;
    riskScore: number;
}

/**
 * The full trace data stored as JSON
 */
export interface TraceData {
    cycleId: string;
    startTime: Date | string;
    endTime: Date | string;
    symbol: string;
    timeframe: string;
    success: boolean;
    tradeExecuted: boolean;
    regime: string | null;
    indicators: Record<string, any> | null;
    marketIntel?: Record<string, any> | null;
    candles: any[];
    similarPatternsCount: number;
    strategyIdeas: any[];
    backtestResults: any[];
    selectedStrategy: any | null;
    signal: any | null;
    riskAssessment: any | null;
    executionResult: any | null;
    thoughts: string[];
    errors: string[];
    agentType?: string;
}

class TraceStore {
    private db: BetterSqlite3.Database | null = null;
    private initialized: boolean = false;
    private summaryColumnsReady: boolean = false;
    private agentTypeColumnReady: boolean = false;

    /**
     * Initialize the trace store - creates table if not exists
     */
    initialize(): void {
        if (this.initialized) return;

        try {
            this.db = new BetterSqlite3(dbPath);
            this.db.pragma('journal_mode = WAL');

            // Create agent_traces table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS agent_traces (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    regime TEXT,
                    agent_type TEXT DEFAULT 'PERPS',
                    trace_data TEXT NOT NULL,
                    trade_executed INTEGER NOT NULL DEFAULT 0,
                    success INTEGER NOT NULL DEFAULT 0,
                    analyzed INTEGER NOT NULL DEFAULT 0,
                    analysis_batch_id TEXT
                )
            `);

            // Create index for efficient querying of unanalyzed traces
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_traces_analyzed 
                ON agent_traces(analyzed, created_at)
            `);

            // Create index for symbol-based queries
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_traces_symbol 
                ON agent_traces(symbol, created_at)
            `);

            // Create index for recent trace retrieval
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_traces_created_at 
                ON agent_traces(created_at)
            `);

            this.ensureSummaryColumns();

            this.initialized = true;
            logger.info('[TraceStore] Initialized successfully');
        } catch (error) {
            logger.error('[TraceStore] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Store a completed cycle trace
     */
    storeTrace(trace: TraceData): void {
        if (!this.db) {
            this.initialize();
        }

        try {
            const createdAt = new Date().toISOString();
            const startTime = this.toIsoString(trace.startTime) || createdAt;
            const endTime = this.toIsoString(trace.endTime);
            const strategyCount = trace.strategyIdeas?.length || 0;
            const riskScore = trace.riskAssessment?.riskScore ?? 0;
            const agentType = trace.agentType || 'PERPS';

            if (this.summaryColumnsReady && this.agentTypeColumnReady) {
                const stmt = this.db!.prepare(`
                    INSERT INTO agent_traces (
                        id, created_at, symbol, timeframe, regime, agent_type,
                        trace_data, trade_executed, success, analyzed,
                        start_time, end_time, strategy_count, risk_score
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
                `);

                stmt.run(
                    trace.cycleId,
                    createdAt,
                    trace.symbol,
                    trace.timeframe || '1h',
                    trace.regime,
                    agentType,
                    JSON.stringify(trace),
                    trace.tradeExecuted ? 1 : 0,
                    trace.success ? 1 : 0,
                    startTime,
                    endTime,
                    strategyCount,
                    riskScore
                );
            } else if (this.summaryColumnsReady) {
                const stmt = this.db!.prepare(`
                    INSERT INTO agent_traces (
                        id, created_at, symbol, timeframe, regime,
                        trace_data, trade_executed, success, analyzed,
                        start_time, end_time, strategy_count, risk_score
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
                `);

                stmt.run(
                    trace.cycleId,
                    createdAt,
                    trace.symbol,
                    trace.timeframe || '1h',
                    trace.regime,
                    JSON.stringify(trace),
                    trace.tradeExecuted ? 1 : 0,
                    trace.success ? 1 : 0,
                    startTime,
                    endTime,
                    strategyCount,
                    riskScore
                );
            } else if (this.agentTypeColumnReady) {
                const stmt = this.db!.prepare(`
                    INSERT INTO agent_traces (
                        id, created_at, symbol, timeframe, regime, agent_type,
                        trace_data, trade_executed, success, analyzed
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                `);

                stmt.run(
                    trace.cycleId,
                    createdAt,
                    trace.symbol,
                    trace.timeframe || '1h',
                    trace.regime,
                    agentType,
                    JSON.stringify(trace),
                    trace.tradeExecuted ? 1 : 0,
                    trace.success ? 1 : 0
                );
            } else {
                const stmt = this.db!.prepare(`
                    INSERT INTO agent_traces (
                        id, created_at, symbol, timeframe, regime,
                        trace_data, trade_executed, success, analyzed
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                `);

                stmt.run(
                    trace.cycleId,
                    createdAt,
                    trace.symbol,
                    trace.timeframe || '1h',
                    trace.regime,
                    JSON.stringify(trace),
                    trace.tradeExecuted ? 1 : 0,
                    trace.success ? 1 : 0
                );
            }

            logger.debug(`[TraceStore] Stored trace ${trace.cycleId} for ${trace.symbol}`);
        } catch (error) {
            logger.error('[TraceStore] Failed to store trace:', error);
            throw error;
        }
    }

    /**
     * Get traces that haven't been analyzed yet
     */
    getUnanalyzedTraces(limit: number = 100): StoredTrace[] {
        if (!this.db) {
            this.initialize();
        }

        try {
            const stmt = this.db!.prepare(`
                SELECT * FROM agent_traces 
                WHERE analyzed = 0 
                ORDER BY created_at ASC 
                LIMIT ?
            `);

            const rows = stmt.all(limit) as any[];

            return rows.map(row => ({
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
            }));
        } catch (error) {
            logger.error('[TraceStore] Failed to get unanalyzed traces:', error);
            return [];
        }
    }

    /**
     * Get traces for a specific date range
     */
    getTracesByDateRange(startDate: Date, endDate: Date, symbol?: string): StoredTrace[] {
        if (!this.db) {
            this.initialize();
        }

        try {
            let query = `
                SELECT * FROM agent_traces 
                WHERE created_at >= ? AND created_at <= ?
            `;
            const params: any[] = [startDate.toISOString(), endDate.toISOString()];

            if (symbol) {
                query += ' AND symbol = ?';
                params.push(symbol);
            }

            query += ' ORDER BY created_at ASC';

            const stmt = this.db!.prepare(query);
            const rows = stmt.all(...params) as any[];

            return rows.map(row => ({
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
            }));
        } catch (error) {
            logger.error('[TraceStore] Failed to get traces by date range:', error);
            return [];
        }
    }

    /**
     * Mark traces as analyzed
     */
    markTracesAnalyzed(traceIds: string[], batchId: string): void {
        if (!this.db) {
            this.initialize();
        }

        if (traceIds.length === 0) return;

        try {
            const placeholders = traceIds.map(() => '?').join(',');
            const stmt = this.db!.prepare(`
                UPDATE agent_traces 
                SET analyzed = 1, analysis_batch_id = ?
                WHERE id IN (${placeholders})
            `);

            stmt.run(batchId, ...traceIds);
            logger.info(`[TraceStore] Marked ${traceIds.length} traces as analyzed (batch: ${batchId})`);
        } catch (error) {
            logger.error('[TraceStore] Failed to mark traces as analyzed:', error);
            throw error;
        }
    }

    /**
     * Get recent traces (for dashboard display)
     */
    getRecentTraces(limit: number = 50, agentType?: string): StoredTrace[] {
        if (!this.db) {
            this.initialize();
        }

        try {
            const resolvedLimit = Number.isFinite(limit) ? limit : 50;
            const hasAgentType = this.agentTypeColumnReady && agentType;
            const stmt = this.db!.prepare(`
                SELECT * FROM agent_traces
                ${hasAgentType ? 'WHERE agent_type = ?' : ''}
                ORDER BY created_at DESC
                LIMIT ?
            `);

            const rows = (hasAgentType
                ? stmt.all(agentType, resolvedLimit)
                : stmt.all(resolvedLimit)) as any[];

            return rows.map(row => ({
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
            }));
        } catch (error) {
            logger.error('[TraceStore] Failed to get recent traces:', error);
            return [];
        }
    }

    getRecentTraceSummaries(limit: number = 50, agentType?: string): TraceSummary[] {
        if (!this.db) {
            this.initialize();
        }

        try {
            const resolvedLimit = Number.isFinite(limit) ? limit : 50;
            const hasAgentType = this.agentTypeColumnReady && agentType;
            const agentTypeSelect = this.agentTypeColumnReady ? 'agent_type,' : '';
            if (this.summaryColumnsReady) {
                const stmt = this.db!.prepare(`
                    SELECT id, created_at, symbol, timeframe, regime, ${agentTypeSelect}
                           trade_executed, success, analyzed,
                           start_time, end_time, strategy_count, risk_score
                    FROM agent_traces
                    ${hasAgentType ? 'WHERE agent_type = ?' : ''}
                    ORDER BY created_at DESC
                    LIMIT ?
                `);

                const rows = (hasAgentType
                    ? stmt.all(agentType, resolvedLimit)
                    : stmt.all(resolvedLimit)) as any[];
                return rows.map(row => ({
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
                }));
            }

            const stmt = this.db!.prepare(`
                SELECT id, created_at, symbol, timeframe, regime, ${agentTypeSelect}
                       trade_executed, success, analyzed, trace_data
                FROM agent_traces
                ${hasAgentType ? 'WHERE agent_type = ?' : ''}
                ORDER BY created_at DESC
                LIMIT ?
            `);

            const rows = (hasAgentType
                ? stmt.all(agentType, resolvedLimit)
                : stmt.all(resolvedLimit)) as any[];
            return rows.map(row => {
                let traceData: TraceData | null = null;
                try {
                    traceData = JSON.parse(row.trace_data);
                } catch (error) {
                    traceData = null;
                }

                return {
                    id: row.id,
                    createdAt: row.created_at,
                    startTime: this.toIsoString(traceData?.startTime) || row.created_at,
                    endTime: this.toIsoString(traceData?.endTime),
                    symbol: row.symbol,
                    timeframe: row.timeframe,
                    regime: row.regime,
                    agentType: row.agent_type || traceData?.agentType,
                    tradeExecuted: row.trade_executed === 1,
                    success: row.success === 1,
                    analyzed: row.analyzed === 1,
                    strategyCount: traceData?.strategyIdeas?.length || 0,
                    riskScore: traceData?.riskAssessment?.riskScore ?? 0,
                };
            });
        } catch (error) {
            logger.error('[TraceStore] Failed to get recent trace summaries:', error);
            return [];
        }
    }

    /**
     * Get a specific trace by ID
     */
    getTraceById(id: string): StoredTrace | null {
        if (!this.db) {
            this.initialize();
        }

        try {
            const stmt = this.db!.prepare('SELECT * FROM agent_traces WHERE id = ?');
            const row = stmt.get(id) as any;

            if (!row) return null;

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
        } catch (error) {
            logger.error('[TraceStore] Failed to get trace by ID:', error);
            return null;
        }
    }

    /**
     * Get trace statistics
     */
    getStats(): { total: number; unanalyzed: number; bySymbol: Record<string, number> } {
        if (!this.db) {
            this.initialize();
        }

        try {
            const totalStmt = this.db!.prepare('SELECT COUNT(*) as count FROM agent_traces');
            const unanalyzedStmt = this.db!.prepare('SELECT COUNT(*) as count FROM agent_traces WHERE analyzed = 0');
            const bySymbolStmt = this.db!.prepare('SELECT symbol, COUNT(*) as count FROM agent_traces GROUP BY symbol');

            const total = (totalStmt.get() as any).count;
            const unanalyzed = (unanalyzedStmt.get() as any).count;
            const bySymbolRows = bySymbolStmt.all() as any[];

            const bySymbol: Record<string, number> = {};
            for (const row of bySymbolRows) {
                bySymbol[row.symbol] = row.count;
            }

            return { total, unanalyzed, bySymbol };
        } catch (error) {
            logger.error('[TraceStore] Failed to get stats:', error);
            return { total: 0, unanalyzed: 0, bySymbol: {} };
        }
    }

    /**
     * Clean up old analyzed traces (retention policy)
     */
    cleanupOldTraces(daysToKeep: number = 30): number {
        if (!this.db) {
            this.initialize();
        }

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const stmt = this.db!.prepare(`
                DELETE FROM agent_traces 
                WHERE analyzed = 1 AND created_at < ?
            `);

            const result = stmt.run(cutoffDate.toISOString());
            logger.info(`[TraceStore] Cleaned up ${result.changes} old traces`);
            return result.changes;
        } catch (error) {
            logger.error('[TraceStore] Failed to cleanup old traces:', error);
            return 0;
        }
    }

    private ensureSummaryColumns(): void {
        if (!this.db) return;

        const columns = new Set(
            (this.db.prepare("PRAGMA table_info('agent_traces')").all() as any[])
                .map(row => row.name)
        );

        const required = ['start_time', 'end_time', 'strategy_count', 'risk_score'];
        for (const column of required) {
            if (!columns.has(column)) {
                try {
                    this.db.exec(`ALTER TABLE agent_traces ADD COLUMN ${column} ${this.columnType(column)}`);
                } catch (error) {
                    logger.warn(`[TraceStore] Failed to add column ${column}:`, error);
                }
            }
        }

        if (!columns.has('agent_type')) {
            try {
                this.db.exec('ALTER TABLE agent_traces ADD COLUMN agent_type TEXT DEFAULT \'PERPS\'');
            } catch (error) {
                logger.warn('[TraceStore] Failed to add column agent_type:', error);
            }
        }

        const refreshed = new Set(
            (this.db.prepare("PRAGMA table_info('agent_traces')").all() as any[])
                .map(row => row.name)
        );

        this.summaryColumnsReady = required.every(column => refreshed.has(column));
        this.agentTypeColumnReady = refreshed.has('agent_type');
    }

    private columnType(column: string): string {
        switch (column) {
            case 'strategy_count':
                return 'INTEGER';
            case 'risk_score':
                return 'REAL';
            default:
                return 'TEXT';
        }
    }

    private toIsoString(value: Date | string | null | undefined): string | null {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toISOString();
    }
}

// Singleton instance
const traceStore = new TraceStore();
export default traceStore;
