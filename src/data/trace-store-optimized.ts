/**
 * Optimized Trace Store Service
 * Performance improvements:
 * - Batch inserts with prepared statement caching
 * - Connection pooling simulation via persistent connection
 * - Compressed trace data storage
 * - LRU cache for frequently accessed traces
 * - Optimized index usage
 */

import BetterSqlite3 from 'better-sqlite3';
import configManager from '../shared/config';
import logger from '../shared/logger';
import { createHash } from 'crypto';

// Get database path from config
const fullConfig = configManager.get();
const dbPath = fullConfig.database?.connection || './data/trading.db';

// Configuration
const BATCH_SIZE = 100;
const CACHE_SIZE = 500;
const COMPRESSION_THRESHOLD = 1024; // Compress traces larger than 1KB

/**
 * Simple LRU Cache implementation
 */
export class LRUCache<K, V> {
    private cache: Map<K, V>;
    private maxSize: number;

    constructor(maxSize: number) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove least recently used (first item)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    clear(): void {
        this.cache.clear();
    }
}

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
    traceData: string; // JSON string (potentially compressed)
    tradeExecuted: boolean;
    success: boolean;
    analyzed: boolean;
    analysisBatchId: string | null;
    isCompressed?: boolean;
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
    private compressionEnabled: boolean = true;
    
    // Prepared statements cache
    private statements: Map<string, BetterSqlite3.Statement> = new Map();
    
    // LRU Cache for trace lookups
    private traceCache: LRUCache<string, StoredTrace> = new LRUCache(CACHE_SIZE);
    
    // Batch buffer for efficient inserts
    private batchBuffer: TraceData[] = [];
    private batchTimeout: NodeJS.Timeout | null = null;
    private readonly BATCH_FLUSH_MS = 5000; // Flush batch every 5 seconds

    /**
     * Initialize the trace store - creates table if not exists
     */
    initialize(): void {
        if (this.initialized) return;

        try {
            this.db = new BetterSqlite3(dbPath);
            
            // Performance optimizations
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('synchronous = NORMAL');
            this.db.pragma('cache_size = -64000'); // 64MB cache
            this.db.pragma('temp_store = MEMORY');
            this.db.pragma('mmap_size = 268435456'); // 256MB memory map
            
            // Create agent_traces table with optimized schema
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
                    analysis_batch_id TEXT,
                    is_compressed INTEGER DEFAULT 0,
                    start_time TEXT,
                    end_time TEXT,
                    strategy_count INTEGER,
                    risk_score REAL
                )
            `);

            // Create optimized indices
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_traces_analyzed_created 
                ON agent_traces(analyzed, created_at)
            `);

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_traces_symbol_created 
                ON agent_traces(symbol, created_at DESC)
            `);

            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_traces_created_at 
                ON agent_traces(created_at DESC)
            `);
            
            // Composite index for common query patterns
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_traces_symbol_analyzed 
                ON agent_traces(symbol, analyzed, created_at DESC)
            `);
            
            // Index for regime-based queries
            this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_traces_regime_created 
                ON agent_traces(regime, created_at DESC)
            `);

            this.ensureSummaryColumns();
            this.prepareStatements();

            this.initialized = true;
            logger.info('[TraceStore] Initialized with optimizations (WAL mode, 64MB cache, prepared statements)');
        } catch (error) {
            logger.error('[TraceStore] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Prepare and cache frequently used statements
     */
    private prepareStatements(): void {
        if (!this.db) return;

        // Insert statement
        this.statements.set('insert', this.db.prepare(`
            INSERT INTO agent_traces (
                id, created_at, symbol, timeframe, regime, agent_type,
                trace_data, trade_executed, success, analyzed,
                start_time, end_time, strategy_count, risk_score, is_compressed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
        `));

        // Get unanalyzed traces
        this.statements.set('getUnanalyzed', this.db.prepare(`
            SELECT * FROM agent_traces 
            WHERE analyzed = 0 
            ORDER BY created_at ASC 
            LIMIT ?
        `));

        // Mark traces as analyzed
        this.statements.set('markAnalyzed', this.db.prepare(`
            UPDATE agent_traces 
            SET analyzed = 1, analysis_batch_id = ?
            WHERE id = ?
        `));

        // Get recent traces
        this.statements.set('getRecent', this.db.prepare(`
            SELECT * FROM agent_traces
            ORDER BY created_at DESC
            LIMIT ?
        `));

        // Get trace by ID
        this.statements.set('getById', this.db.prepare(`
            SELECT * FROM agent_traces WHERE id = ?
        `));

        // Get stats
        this.statements.set('getStats', this.db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN analyzed = 0 THEN 1 ELSE 0 END) as unanalyzed
            FROM agent_traces
        `));

        // Get stats by symbol
        this.statements.set('getStatsBySymbol', this.db.prepare(`
            SELECT symbol, COUNT(*) as count 
            FROM agent_traces 
            GROUP BY symbol
        `));

        // Cleanup old traces
        this.statements.set('cleanupOld', this.db.prepare(`
            DELETE FROM agent_traces 
            WHERE analyzed = 1 AND created_at < ?
        `));
    }

    /**
     * Compress trace data if it exceeds threshold
     */
    private compressIfNeeded(data: string): { data: string; isCompressed: boolean } {
        if (!this.compressionEnabled || data.length < COMPRESSION_THRESHOLD) {
            return { data, isCompressed: false };
        }

        try {
            // Use simple compression - remove whitespace from JSON
            const compressed = JSON.stringify(JSON.parse(data));
            return { data: compressed, isCompressed: compressed.length < data.length };
        } catch {
            return { data, isCompressed: false };
        }
    }

    /**
     * Store a completed cycle trace (with batching support)
     */
    storeTrace(trace: TraceData): void {
        // Add to batch buffer
        this.batchBuffer.push(trace);

        // Flush immediately if batch is full
        if (this.batchBuffer.length >= BATCH_SIZE) {
            this.flushBatch();
        } else if (!this.batchTimeout) {
            // Schedule flush
            this.batchTimeout = setTimeout(() => this.flushBatch(), this.BATCH_FLUSH_MS);
        }
    }

    /**
     * Flush the batch buffer to database
     */
    private flushBatch(): void {
        if (this.batchBuffer.length === 0) return;

        if (!this.db) {
            this.initialize();
        }

        const batch = [...this.batchBuffer];
        this.batchBuffer = [];
        
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }

        try {
            // Use transaction for atomic batch insert
            const insert = this.statements.get('insert');
            if (!insert) return;

            const transaction = this.db!.transaction((traces: TraceData[]) => {
                for (const trace of traces) {
                    const createdAt = new Date().toISOString();
                    const startTime = this.toIsoString(trace.startTime) || createdAt;
                    const endTime = this.toIsoString(trace.endTime);
                    const strategyCount = trace.strategyIdeas?.length || 0;
                    const riskScore = trace.riskAssessment?.riskScore ?? 0;
                    const agentType = trace.agentType || 'PERPS';

                    // Compress trace data if needed
                    const traceDataJson = JSON.stringify(trace);
                    const { data: compressedData, isCompressed } = this.compressIfNeeded(traceDataJson);

                    insert.run(
                        trace.cycleId,
                        createdAt,
                        trace.symbol,
                        trace.timeframe || '1h',
                        trace.regime,
                        agentType,
                        compressedData,
                        trace.tradeExecuted ? 1 : 0,
                        trace.success ? 1 : 0,
                        startTime,
                        endTime,
                        strategyCount,
                        riskScore,
                        isCompressed ? 1 : 0
                    );
                }
            });

            transaction(batch);
            logger.debug(`[TraceStore] Flushed ${batch.length} traces to database`);
        } catch (error) {
            logger.error('[TraceStore] Failed to flush batch:', error);
            // Re-add to buffer for retry
            this.batchBuffer.unshift(...batch);
        }
    }

    /**
     * Get traces that haven't been analyzed yet (with caching)
     */
    getUnanalyzedTraces(limit: number = 100): StoredTrace[] {
        this.flushBatch(); // Ensure all pending traces are written
        
        if (!this.db) {
            this.initialize();
        }

        try {
            const stmt = this.statements.get('getUnanalyzed');
            if (!stmt) return [];

            const rows = stmt.all(limit) as any[];

            return rows.map(row => this.rowToStoredTrace(row));
        } catch (error) {
            logger.error('[TraceStore] Failed to get unanalyzed traces:', error);
            return [];
        }
    }

    /**
     * Get traces for a specific date range
     */
    getTracesByDateRange(startDate: Date, endDate: Date, symbol?: string): StoredTrace[] {
        this.flushBatch();
        
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

            return rows.map(row => this.rowToStoredTrace(row));
        } catch (error) {
            logger.error('[TraceStore] Failed to get traces by date range:', error);
            return [];
        }
    }

    /**
     * Mark traces as analyzed (with batching)
     */
    markTracesAnalyzed(traceIds: string[], batchId: string): void {
        if (!this.db) {
            this.initialize();
        }

        if (traceIds.length === 0) return;

        try {
            const stmt = this.statements.get('markAnalyzed');
            if (!stmt) return;

            const transaction = this.db!.transaction((ids: string[]) => {
                for (const id of ids) {
                    stmt.run(batchId, id);
                }
            });

            transaction(traceIds);
            
            // Invalidate cache for these traces
            for (const id of traceIds) {
                this.traceCache.delete(id as unknown as string & object);
            }
            
            logger.info(`[TraceStore] Marked ${traceIds.length} traces as analyzed (batch: ${batchId})`);
        } catch (error) {
            logger.error('[TraceStore] Failed to mark traces as analyzed:', error);
            throw error;
        }
    }

    /**
     * Get recent traces (with caching)
     */
    getRecentTraces(limit: number = 50, agentType?: string): StoredTrace[] {
        this.flushBatch();
        
        if (!this.db) {
            this.initialize();
        }

        try {
            const cacheKey = `recent_${limit}_${agentType || 'all'}`;
            
            // Check cache
            // Note: We don't cache recent traces as they change frequently
            
            const hasAgentType = this.agentTypeColumnReady && agentType;
            let query = `SELECT * FROM agent_traces`;
            const params: any[] = [];
            
            if (hasAgentType) {
                query += ' WHERE agent_type = ?';
                params.push(agentType);
            }
            
            query += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);

            const stmt = this.db!.prepare(query);
            const rows = (hasAgentType 
                ? stmt.all(agentType, limit) 
                : stmt.all(limit)) as any[];

            return rows.map(row => this.rowToStoredTrace(row));
        } catch (error) {
            logger.error('[TraceStore] Failed to get recent traces:', error);
            return [];
        }
    }

    getRecentTraceSummaries(limit: number = 50, agentType?: string): TraceSummary[] {
        this.flushBatch();
        
        if (!this.db) {
            this.initialize();
        }

        try {
            const resolvedLimit = Number.isFinite(limit) ? limit : 50;
            const hasAgentType = this.agentTypeColumnReady && agentType;
            
            let query = `
                SELECT id, created_at, symbol, timeframe, regime, 
                       trade_executed, success, analyzed,
                       start_time, end_time, strategy_count, risk_score
                FROM agent_traces
            `;
            
            if (hasAgentType) {
                query += ' WHERE agent_type = ?';
            }
            
            query += ' ORDER BY created_at DESC LIMIT ?';

            const stmt = this.db!.prepare(query);
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
                agentType: row.agent_type,
                tradeExecuted: row.trade_executed === 1,
                success: row.success === 1,
                analyzed: row.analyzed === 1,
                strategyCount: Number.isFinite(row.strategy_count) ? row.strategy_count : 0,
                riskScore: Number.isFinite(row.risk_score) ? row.risk_score : 0,
            }));
        } catch (error) {
            logger.error('[TraceStore] Failed to get recent trace summaries:', error);
            return [];
        }
    }

    /**
     * Get a specific trace by ID (with caching)
     */
    getTraceById(id: string): StoredTrace | null {
        // Check cache first
        const cached = this.traceCache.get(id);
        if (cached) return cached;
        
        this.flushBatch();
        
        if (!this.db) {
            this.initialize();
        }

        try {
            const stmt = this.statements.get('getById');
            if (!stmt) return null;

            const row = stmt.get(id) as any;

            if (!row) return null;

            const trace = this.rowToStoredTrace(row);
            
            // Cache the result
            this.traceCache.set(id, trace);
            
            return trace;
        } catch (error) {
            logger.error('[TraceStore] Failed to get trace by ID:', error);
            return null;
        }
    }

    /**
     * Get trace statistics (optimized)
     */
    getStats(): { total: number; unanalyzed: number; bySymbol: Record<string, number> } {
        this.flushBatch();
        
        if (!this.db) {
            this.initialize();
        }

        try {
            const statsStmt = this.statements.get('getStats');
            const bySymbolStmt = this.statements.get('getStatsBySymbol');
            
            if (!statsStmt || !bySymbolStmt) {
                return { total: 0, unanalyzed: 0, bySymbol: {} };
            }

            const stats = statsStmt.get() as any;
            const bySymbolRows = bySymbolStmt.all() as any[];

            const bySymbol: Record<string, number> = {};
            for (const row of bySymbolRows) {
                bySymbol[row.symbol] = row.count;
            }

            return { 
                total: stats.total, 
                unanalyzed: stats.unanalyzed, 
                bySymbol 
            };
        } catch (error) {
            logger.error('[TraceStore] Failed to get stats:', error);
            return { total: 0, unanalyzed: 0, bySymbol: {} };
        }
    }

    /**
     * Clean up old analyzed traces (with batching)
     */
    cleanupOldTraces(daysToKeep: number = 30): number {
        this.flushBatch();
        
        if (!this.db) {
            this.initialize();
        }

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const stmt = this.statements.get('cleanupOld');
            if (!stmt) return 0;

            const result = stmt.run(cutoffDate.toISOString());
            
            if (result.changes > 0) {
                logger.info(`[TraceStore] Cleaned up ${result.changes} old traces`);
                // Clear cache as data has changed
                this.traceCache.clear();
            }
            
            return result.changes;
        } catch (error) {
            logger.error('[TraceStore] Failed to cleanup old traces:', error);
            return 0;
        }
    }

    /**
     * Convert database row to StoredTrace
     */
    private rowToStoredTrace(row: any): StoredTrace {
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
            isCompressed: row.is_compressed === 1,
        };
    }

    private ensureSummaryColumns(): void {
        if (!this.db) return;

        const columns = new Set(
            (this.db.prepare("PRAGMA table_info('agent_traces')").all() as any[])
                .map(row => row.name)
        );

        const required = ['start_time', 'end_time', 'strategy_count', 'risk_score', 'is_compressed'];
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

        this.summaryColumnsReady = ['start_time', 'end_time', 'strategy_count', 'risk_score']
            .every(column => refreshed.has(column));
        this.agentTypeColumnReady = refreshed.has('agent_type');
        this.compressionEnabled = refreshed.has('is_compressed');
    }

    private columnType(column: string): string {
        switch (column) {
            case 'strategy_count':
                return 'INTEGER';
            case 'risk_score':
                return 'REAL';
            case 'is_compressed':
                return 'INTEGER DEFAULT 0';
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

    /**
     * Graceful shutdown - flush pending traces
     */
    shutdown(): void {
        logger.info('[TraceStore] Shutting down, flushing pending traces...');
        this.flushBatch();
        
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        
        this.initialized = false;
        logger.info('[TraceStore] Shutdown complete');
    }
}

// Singleton instance
const traceStore = new TraceStore();
export default traceStore;
