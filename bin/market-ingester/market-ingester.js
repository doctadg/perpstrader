"use strict";
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
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = __importDefault(require("../shared/config"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const data_validation_1 = require("../shared/data-validation");
const hyperliquid_all_markets_1 = __importDefault(require("./hyperliquid-all-markets"));
const reliability_1 = require("./reliability");
dotenv.config();
class MarketIngester {
    db;
    hyperliquidUrl;
    wsUrl;
    tradingSymbols;
    allSymbols = [];
    trackedSymbolSet = new Set();
    symbolVolumes = new Map();
    primaryTimeframe;
    ws = null;
    wsReconnectTimer = null;
    isStopping = false;
    subscribedSymbols = new Set();
    isSubscriptionSyncRunning = false;
    pendingSubscriptionSync = false;
    isPaperTrading = true;
    tradeCandles = new Map();
    tradeCandleTimer = null;
    pollingTimer = null;
    marketDataQueue = [];
    orderBookQueue = [];
    tradeQueue = [];
    fundingQueue = [];
    ingestionTraceQueue = [];
    marketDataStmt = null;
    orderBookStmt = null;
    tradeStmt = null;
    fundingStmt = null;
    ingestionTraceStmt = null;
    symbolHealthStmt = null;
    writeFlushTimer = null;
    writeFlushIntervalMs;
    writeBatchSize;
    isFlushing = false;
    orderBookLogIntervalMs;
    lastOrderBookLogAt = new Map();
    lastAllMidsLogAt = 0;
    symbolUpdateTimer = null;
    startedAtMs = Date.now();
    coverageTimer = null;
    coverageAuditIntervalMs;
    coverageFreshnessMs;
    coverageLogIntervalMs;
    coverageWarmupMs;
    minCoverageRatio;
    lastCoverageLogAt = 0;
    minTrackedVolume24h;
    maxWsSymbolSubscriptions;
    wsAdaptiveMaxSymbols;
    wsSubscriptionDelayMs;
    wsEnableL2Book;
    wsEnableTrades;
    wsEnableFunding;
    wsEarlyCloseThresholdMs;
    wsLastOpenAt = 0;
    wsConsecutiveEarlyCloses = 0;
    maxBackfillPerCycle;
    backfillCooldownMs;
    backfillConcurrency;
    backfillDelayMs;
    backfillLookbackMinutes;
    isBackfillRunning = false;
    enrichmentTimer = null;
    enrichmentIntervalMs;
    enrichmentBatchSize;
    enrichmentConcurrency;
    enrichmentDelayMs;
    enrichmentCursor = 0;
    enrichmentRuns = 0;
    isEnrichmentRunning = false;
    lastMarketDataAt = new Map();
    lastQuoteAt = new Map();
    lastTradeAt = new Map();
    lastBackfillAt = new Map();
    lastBackfillAttemptAt = new Map();
    symbolDataPoints = new Map();
    symbolBackfillPoints = new Map();
    constructor() {
        const hyperliquidConfig = config_1.default.getSection('hyperliquid');
        this.hyperliquidUrl = hyperliquidConfig.baseUrl || 'https://api.hyperliquid.xyz';
        this.wsUrl = hyperliquidConfig.testnet
            ? 'wss://api.hyperliquid-testnet.xyz/ws'
            : 'wss://api.hyperliquid.xyz/ws';
        const tradingConfig = config_1.default.getSection('trading');
        this.tradingSymbols = tradingConfig.symbols || ['BTC', 'ETH', 'SOL'];
        this.primaryTimeframe = tradingConfig.timeframes?.[0] || '1s';
        const dbConfig = config_1.default.getSection('database');
        this.db = new better_sqlite3_1.default(dbConfig.connection);
        this.initializeDatabase();
        this.prepareStatements();
        this.isPaperTrading = process.env.PAPER_TRADING === 'true';
        this.writeFlushIntervalMs = Number.parseInt(process.env.INGEST_DB_FLUSH_MS || '200', 10) || 200;
        this.writeBatchSize = Number.parseInt(process.env.INGEST_DB_BATCH_SIZE || '200', 10) || 200;
        this.orderBookLogIntervalMs = Number.parseInt(process.env.ORDER_BOOK_LOG_INTERVAL_MS || '5000', 10) || 5000;
        this.minTrackedVolume24h = Number.parseFloat(process.env.INGEST_MIN_VOLUME_24H || '0') || 0;
        this.maxWsSymbolSubscriptions = Number.parseInt(process.env.INGEST_MAX_WS_SYMBOLS || '40', 10) || 40;
        this.wsAdaptiveMaxSymbols = this.maxWsSymbolSubscriptions;
        this.wsSubscriptionDelayMs = Number.parseInt(process.env.INGEST_WS_SUB_DELAY_MS || '15', 10) || 15;
        this.wsEnableL2Book = process.env.INGEST_WS_ENABLE_L2 === 'true';
        this.wsEnableTrades = process.env.INGEST_WS_ENABLE_TRADES === 'true';
        this.wsEnableFunding = process.env.INGEST_WS_ENABLE_FUNDING === 'true';
        this.wsEarlyCloseThresholdMs = Number.parseInt(process.env.INGEST_WS_EARLY_CLOSE_MS || '15000', 10) || 15000;
        this.coverageAuditIntervalMs = Number.parseInt(process.env.INGEST_COVERAGE_CHECK_MS || '15000', 10) || 15000;
        this.coverageFreshnessMs = Number.parseInt(process.env.INGEST_FRESHNESS_MS || '120000', 10) || 120000;
        this.coverageLogIntervalMs = Number.parseInt(process.env.INGEST_COVERAGE_LOG_MS || '60000', 10) || 60000;
        this.coverageWarmupMs = Number.parseInt(process.env.INGEST_WARMUP_MS || '45000', 10) || 45000;
        this.minCoverageRatio = Number.parseFloat(process.env.INGEST_MIN_COVERAGE_RATIO || '0.75') || 0.75;
        this.maxBackfillPerCycle = Number.parseInt(process.env.INGEST_BACKFILL_MAX_SYMBOLS || '40', 10) || 40;
        this.backfillCooldownMs = Number.parseInt(process.env.INGEST_BACKFILL_COOLDOWN_MS || '120000', 10) || 120000;
        this.backfillConcurrency = Number.parseInt(process.env.INGEST_BACKFILL_CONCURRENCY || '4', 10) || 4;
        this.backfillDelayMs = Number.parseInt(process.env.INGEST_BACKFILL_DELAY_MS || '100', 10) || 100;
        this.backfillLookbackMinutes = Number.parseInt(process.env.INGEST_BACKFILL_LOOKBACK_MIN || '180', 10) || 180;
        this.enrichmentIntervalMs = Number.parseInt(process.env.INGEST_ENRICH_INTERVAL_MS || '20000', 10) || 20000;
        this.enrichmentBatchSize = Number.parseInt(process.env.INGEST_ENRICH_BATCH_SIZE || '25', 10) || 25;
        this.enrichmentConcurrency = Number.parseInt(process.env.INGEST_ENRICH_CONCURRENCY || '5', 10) || 5;
        this.enrichmentDelayMs = Number.parseInt(process.env.INGEST_ENRICH_DELAY_MS || '40', 10) || 40;
        this.setupWriteBuffer();
        logger_1.default.info('Market Ingester initialized', {
            mode: this.isPaperTrading ? 'PAPER TRADING' : 'LIVE',
            url: this.hyperliquidUrl,
            initialSymbols: this.tradingSymbols.length,
            maxWsSymbols: this.maxWsSymbolSubscriptions,
            wsChannels: this.getWsSymbolChannels(),
            minTrackedVolume24h: this.minTrackedVolume24h,
            enrichBatchSize: this.enrichmentBatchSize,
            enrichIntervalMs: this.enrichmentIntervalMs,
        });
    }
    initializeDatabase() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        vwap REAL,
        bid REAL,
        ask REAL,
        bidSize REAL,
        askSize REAL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_market_symbol_time ON market_data(symbol, timestamp);
      CREATE INDEX IF NOT EXISTS idx_market_symbol ON market_data(symbol);
      CREATE INDEX IF NOT EXISTS idx_market_timestamp ON market_data(timestamp);

      CREATE TABLE IF NOT EXISTS order_book (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        bids TEXT NOT NULL,
        asks TEXT NOT NULL,
        midPrice REAL NOT NULL,
        spread REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS funding_rates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        fundingRate REAL NOT NULL,
        nextFundingTime INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS market_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        price REAL NOT NULL,
        size REAL NOT NULL,
        side TEXT NOT NULL,
        symbol TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tracked_symbols (
        symbol TEXT PRIMARY KEY,
        name TEXT,
        category TEXT,
        volume24h REAL DEFAULT 0,
        maxLeverage REAL,
        szDecimals INTEGER,
        onlyIsolated INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        firstSeen INTEGER,
        lastUpdated INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_tracked_symbols_active ON tracked_symbols(isActive);

      CREATE TABLE IF NOT EXISTS ingestion_traces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        level TEXT NOT NULL,
        event TEXT NOT NULL,
        symbol TEXT,
        source TEXT,
        details TEXT,
        metrics TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ingestion_traces_ts ON ingestion_traces(timestamp);
      CREATE INDEX IF NOT EXISTS idx_ingestion_traces_symbol_ts ON ingestion_traces(symbol, timestamp);

      CREATE TABLE IF NOT EXISTS symbol_ingestion_health (
        symbol TEXT PRIMARY KEY,
        lastMarketDataTs INTEGER DEFAULT 0,
        lastQuoteTs INTEGER DEFAULT 0,
        lastTradeTs INTEGER DEFAULT 0,
        lastBackfillTs INTEGER DEFAULT 0,
        dataPoints INTEGER DEFAULT 0,
        backfillPoints INTEGER DEFAULT 0,
        updatedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_symbol_ingestion_health_market_ts ON symbol_ingestion_health(lastMarketDataTs);
    `);
        logger_1.default.info('Database tables created for market ingestion');
    }
    prepareStatements() {
        this.marketDataStmt = this.db.prepare(`
      INSERT OR REPLACE INTO market_data
      (symbol, timestamp, open, high, low, close, volume, vwap, bid, ask, bidSize, askSize)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        this.orderBookStmt = this.db.prepare(`
      INSERT INTO order_book (symbol, timestamp, bids, asks, midPrice, spread)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
        this.tradeStmt = this.db.prepare(`
      INSERT INTO market_trades (timestamp, price, size, side, symbol)
      VALUES (?, ?, ?, ?, ?)
    `);
        this.fundingStmt = this.db.prepare(`
      INSERT INTO funding_rates (symbol, timestamp, fundingRate, nextFundingTime)
      VALUES (?, ?, ?, ?)
    `);
        this.ingestionTraceStmt = this.db.prepare(`
      INSERT INTO ingestion_traces (timestamp, level, event, symbol, source, details, metrics)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        this.symbolHealthStmt = this.db.prepare(`
      INSERT INTO symbol_ingestion_health
      (symbol, lastMarketDataTs, lastQuoteTs, lastTradeTs, lastBackfillTs, dataPoints, backfillPoints, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        lastMarketDataTs = excluded.lastMarketDataTs,
        lastQuoteTs = excluded.lastQuoteTs,
        lastTradeTs = excluded.lastTradeTs,
        lastBackfillTs = excluded.lastBackfillTs,
        dataPoints = excluded.dataPoints,
        backfillPoints = excluded.backfillPoints,
        updatedAt = excluded.updatedAt
    `);
    }
    async updateSymbolsList() {
        try {
            const { markets, count } = await hyperliquid_all_markets_1.default.fetchAllMarkets();
            if (count === 0) {
                logger_1.default.warn('[MarketIngester] No markets found from Hyperliquid');
                return;
            }
            const normalizedMarkets = markets
                .map(market => ({
                ...market,
                coin: market.coin.toUpperCase(),
                volume24h: Number.isFinite(market.volume24h) ? market.volume24h : 0,
            }))
                .sort((a, b) => b.volume24h - a.volume24h || a.coin.localeCompare(b.coin));
            const trackedSymbols = (0, reliability_1.buildTrackedSymbols)(normalizedMarkets, this.minTrackedVolume24h);
            const fallbackSymbols = (0, reliability_1.buildTrackedSymbols)(normalizedMarkets, 0);
            const allTrackedSymbols = trackedSymbols.length > 0 ? trackedSymbols : fallbackSymbols;
            const wsSymbols = (0, reliability_1.rankSymbolsForStreaming)(normalizedMarkets, this.maxWsSymbolSubscriptions, this.minTrackedVolume24h);
            const timestamp = Date.now();
            const insertSymbol = this.db.prepare(`
        INSERT OR REPLACE INTO tracked_symbols
        (symbol, name, category, volume24h, maxLeverage, szDecimals, onlyIsolated, isActive, firstSeen, lastUpdated)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, COALESCE((SELECT firstSeen FROM tracked_symbols WHERE symbol = ?), ?), ?)
      `);
            const txn = this.db.transaction(() => {
                for (const market of normalizedMarkets) {
                    const category = this.categorizeSymbol(market.coin);
                    insertSymbol.run(market.coin, market.coin, category, market.volume24h, market.maxLeverage, market.szDecimals, market.onlyIsolated ? 1 : 0, market.coin, timestamp, timestamp);
                }
            });
            txn();
            this.allSymbols = allTrackedSymbols;
            this.trackedSymbolSet = new Set(this.allSymbols);
            this.symbolVolumes = new Map(normalizedMarkets.map(m => [m.coin, m.volume24h]));
            const wsLimit = Math.max(0, Math.min(this.maxWsSymbolSubscriptions, this.wsAdaptiveMaxSymbols));
            this.tradingSymbols = wsSymbols.length > 0 ? wsSymbols.slice(0, wsLimit) : allTrackedSymbols.slice(0, wsLimit);
            this.recordIngestionTrace('info', 'symbols_updated', {
                details: `tracked=${this.allSymbols.length}, ws=${this.tradingSymbols.length}, channels=${this.getWsSymbolChannels().length}`,
                metrics: {
                    trackedSymbols: this.allSymbols.length,
                    wsSymbols: this.tradingSymbols.length,
                    wsAdaptiveMaxSymbols: this.wsAdaptiveMaxSymbols,
                    wsChannels: this.getWsSymbolChannels(),
                    topTracked: this.allSymbols.slice(0, 10),
                    topWs: this.tradingSymbols.slice(0, 10),
                },
            });
            logger_1.default.info(`[MarketIngester] Updated symbols: ${this.allSymbols.length} tracked, ${this.tradingSymbols.length} WS priority (${this.getWsSymbolChannels().join(',') || 'none'})`);
            if (this.isWsOpen()) {
                void this.syncSymbolSubscriptions();
            }
        }
        catch (error) {
            logger_1.default.error('[MarketIngester] Failed to update symbols list:', error);
            this.recordIngestionTrace('error', 'symbols_update_failed', {
                details: error instanceof Error ? error.message : String(error),
            });
        }
    }
    getAllTrackedSymbols() {
        return this.allSymbols.length > 0 ? this.allSymbols : this.tradingSymbols;
    }
    startSymbolUpdates() {
        if (this.symbolUpdateTimer)
            return;
        this.symbolUpdateTimer = setInterval(() => {
            void this.updateSymbolsList();
        }, 5 * 60 * 1000);
        logger_1.default.info('[MarketIngester] Started symbol list updates (every 5 minutes)');
    }
    getWsSymbolChannels() {
        const channels = [];
        if (this.wsEnableL2Book)
            channels.push('l2Book');
        if (this.wsEnableTrades)
            channels.push('trades');
        if (this.wsEnableFunding)
            channels.push('funding');
        return channels;
    }
    refreshWsSymbolWindow() {
        const symbols = this.getAllTrackedSymbols();
        if (symbols.length === 0) {
            this.tradingSymbols = [];
            return;
        }
        const wsLimit = Math.max(0, Math.min(this.maxWsSymbolSubscriptions, this.wsAdaptiveMaxSymbols));
        const sorted = [...symbols].sort((a, b) => {
            const volumeA = this.symbolVolumes.get(a) || 0;
            const volumeB = this.symbolVolumes.get(b) || 0;
            if (volumeA !== volumeB)
                return volumeB - volumeA;
            return a.localeCompare(b);
        });
        this.tradingSymbols = sorted.slice(0, wsLimit);
    }
    categorizeSymbol(symbol) {
        const sym = symbol.toLowerCase();
        if (['btc', 'eth'].includes(sym))
            return 'Layer 1';
        if (['arb', 'op', 'base', 'mnt', 'strk', 'zk'].includes(sym))
            return 'Layer 2';
        if (['uni', 'aave', 'crv', 'comp', 'mkr', 'pendle', 'jup', 'ray'].includes(sym))
            return 'DeFi';
        if (['doge', 'shib', 'pepe', 'floki', 'bonk', 'wif', 'mog'].includes(sym))
            return 'Meme';
        if (['render', 'tao', 'fet', 'wld', 'arkm'].includes(sym))
            return 'AI';
        if (['sol', 'jto', 'jup', 'ray', 'bonk', 'wif'].includes(sym))
            return 'Solana';
        if (['axs', 'sand', 'mana', 'gala'].includes(sym))
            return 'Gaming';
        if (['ondo', 'cfg'].includes(sym))
            return 'RWA';
        if (['link', 'grt', 'pyth'].includes(sym))
            return 'Infrastructure';
        return 'Altcoin';
    }
    setupWriteBuffer() {
        if (this.writeFlushTimer)
            return;
        this.writeFlushTimer = setInterval(() => this.flushWriteBuffers(), this.writeFlushIntervalMs);
    }
    maybeFlush() {
        const queued = this.marketDataQueue.length
            + this.orderBookQueue.length
            + this.tradeQueue.length
            + this.fundingQueue.length
            + this.ingestionTraceQueue.length;
        if (queued >= this.writeBatchSize) {
            this.flushWriteBuffers();
        }
    }
    flushWriteBuffers() {
        if (this.isFlushing)
            return;
        if (!this.marketDataStmt || !this.orderBookStmt || !this.tradeStmt || !this.fundingStmt || !this.ingestionTraceStmt)
            return;
        if (this.marketDataQueue.length === 0
            && this.orderBookQueue.length === 0
            && this.tradeQueue.length === 0
            && this.fundingQueue.length === 0
            && this.ingestionTraceQueue.length === 0) {
            return;
        }
        this.isFlushing = true;
        const marketDataBatch = this.marketDataQueue.splice(0);
        const orderBookBatch = this.orderBookQueue.splice(0);
        const tradeBatch = this.tradeQueue.splice(0);
        const fundingBatch = this.fundingQueue.splice(0);
        const traceBatch = this.ingestionTraceQueue.splice(0);
        const run = this.db.transaction(() => {
            for (const data of marketDataBatch) {
                this.marketDataStmt.run(data.symbol, data.timestamp.toISOString(), data.open, data.high, data.low, data.close, data.volume, data.vwap, data.bid || 0, data.ask || 0, data.bidSize || 0, data.askSize || 0);
            }
            for (const snapshot of orderBookBatch) {
                this.orderBookStmt.run(snapshot.symbol, snapshot.timestampSec, JSON.stringify(snapshot.bids), JSON.stringify(snapshot.asks), snapshot.midPrice, snapshot.spread);
            }
            for (const trade of tradeBatch) {
                this.tradeStmt.run(trade.timestampSec, trade.price, trade.size, trade.side, trade.symbol);
            }
            for (const funding of fundingBatch) {
                this.fundingStmt.run(funding.symbol, funding.timestampSec, funding.fundingRate, funding.nextFundingTimeSec);
            }
            for (const trace of traceBatch) {
                this.ingestionTraceStmt.run(trace.timestampSec, trace.level, trace.event, trace.symbol, trace.source, trace.details, trace.metricsJson);
            }
        });
        try {
            run();
        }
        catch (error) {
            logger_1.default.error('[MarketIngester] Failed to flush write buffers, re-queueing batch:', error);
            this.marketDataQueue.unshift(...marketDataBatch);
            this.orderBookQueue.unshift(...orderBookBatch);
            this.tradeQueue.unshift(...tradeBatch);
            this.fundingQueue.unshift(...fundingBatch);
            this.ingestionTraceQueue.unshift(...traceBatch);
        }
        finally {
            this.isFlushing = false;
        }
    }
    async start() {
        try {
            this.isStopping = false;
            this.startedAtMs = Date.now();
            await this.updateSymbolsList();
            this.startSymbolUpdates();
            await this.connectWebSocket();
            this.startCandleFlushTimer();
            this.startCoverageMonitoring();
            this.startEnrichmentPolling();
            if (!this.primaryTimeframe.endsWith('s')) {
                await this.startPolling();
            }
            this.recordIngestionTrace('info', 'ingester_started', {
                details: `tracked=${this.getAllTrackedSymbols().length}, ws=${this.tradingSymbols.length}`,
            });
        }
        catch (error) {
            logger_1.default.error('Failed to start market ingester:', error);
            throw error;
        }
    }
    isWsOpen() {
        return Boolean(this.ws && this.ws.readyState === 1);
    }
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            let settled = false;
            try {
                const WebSocket = require('ws');
                this.ws = new WebSocket(this.wsUrl);
                this.ws.on('open', () => {
                    this.wsLastOpenAt = Date.now();
                    logger_1.default.info('WebSocket connected to Hyperliquid');
                    this.recordIngestionTrace('info', 'ws_connected', {
                        details: this.wsUrl,
                    });
                    void this.subscribeToData();
                    if (!settled) {
                        settled = true;
                        resolve();
                    }
                });
                this.ws.on('error', (err) => {
                    logger_1.default.warn('WebSocket error:', err.message);
                    this.recordIngestionTrace('warn', 'ws_error', {
                        details: err.message,
                    });
                    if (!settled) {
                        settled = true;
                        reject(err);
                    }
                    this.scheduleReconnect(10000);
                });
                this.ws.on('close', () => {
                    if (this.isStopping) {
                        this.ws = null;
                        this.subscribedSymbols.clear();
                        return;
                    }
                    const now = Date.now();
                    const sessionMs = this.wsLastOpenAt > 0 ? now - this.wsLastOpenAt : 0;
                    const wasEarlyClose = sessionMs > 0 && sessionMs < this.wsEarlyCloseThresholdMs;
                    if (wasEarlyClose) {
                        this.wsConsecutiveEarlyCloses += 1;
                    }
                    else {
                        this.wsConsecutiveEarlyCloses = 0;
                    }
                    if (wasEarlyClose && this.wsConsecutiveEarlyCloses >= 2 && this.wsAdaptiveMaxSymbols > 10) {
                        const reduced = Math.max(10, Math.floor(this.wsAdaptiveMaxSymbols * 0.8));
                        if (reduced < this.wsAdaptiveMaxSymbols) {
                            this.wsAdaptiveMaxSymbols = reduced;
                            this.refreshWsSymbolWindow();
                            logger_1.default.warn(`[MarketIngester] Adaptive WS limit reduced to ${this.wsAdaptiveMaxSymbols} after repeated early closes`);
                            this.recordIngestionTrace('warn', 'ws_adaptive_reduce', {
                                details: `sessionMs=${sessionMs}, adaptiveMax=${this.wsAdaptiveMaxSymbols}`,
                                metrics: {
                                    sessionMs,
                                    consecutiveEarlyCloses: this.wsConsecutiveEarlyCloses,
                                    adaptiveMax: this.wsAdaptiveMaxSymbols,
                                },
                            });
                        }
                    }
                    else if (!wasEarlyClose && sessionMs >= 120000 && this.wsAdaptiveMaxSymbols < this.maxWsSymbolSubscriptions) {
                        this.wsAdaptiveMaxSymbols = Math.min(this.maxWsSymbolSubscriptions, this.wsAdaptiveMaxSymbols + 5);
                        this.refreshWsSymbolWindow();
                    }
                    logger_1.default.warn('WebSocket closed, reconnecting in 30s...');
                    this.recordIngestionTrace('warn', 'ws_closed', {
                        details: `socket closed after ${sessionMs}ms`,
                        metrics: {
                            sessionMs,
                            consecutiveEarlyCloses: this.wsConsecutiveEarlyCloses,
                            adaptiveMax: this.wsAdaptiveMaxSymbols,
                        },
                    });
                    this.ws = null;
                    this.subscribedSymbols.clear();
                    if (!settled) {
                        settled = true;
                        reject(new Error('WebSocket closed before ready'));
                    }
                    this.scheduleReconnect(30000);
                });
                this.ws.on('message', (data) => {
                    this.handleWebSocketMessage(data);
                });
            }
            catch (error) {
                logger_1.default.error('Failed to create WebSocket connection:', error);
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            }
        });
    }
    scheduleReconnect(delayMs) {
        if (this.isStopping)
            return;
        if (this.wsReconnectTimer)
            return;
        this.wsReconnectTimer = setTimeout(() => {
            this.wsReconnectTimer = null;
            void this.connectWebSocket().catch(err => {
                logger_1.default.warn('[MarketIngester] Reconnect attempt failed:', err instanceof Error ? err.message : String(err));
            });
        }, delayMs);
    }
    async subscribeToData() {
        if (!this.isWsOpen())
            return;
        this.sendWsMessage({ method: 'subscribe', subscription: { type: 'allMids' } });
        await this.syncSymbolSubscriptions();
        const wsChannels = this.getWsSymbolChannels();
        this.recordIngestionTrace('info', 'ws_subscriptions_ready', {
            details: `allMids + ${this.subscribedSymbols.size} symbols over [${wsChannels.join(',') || 'none'}]`,
            metrics: {
                subscribedSymbols: this.subscribedSymbols.size,
                wsChannels,
                symbols: [...this.subscribedSymbols].slice(0, 20),
            },
        });
    }
    sendWsMessage(payload) {
        if (!this.isWsOpen())
            return false;
        try {
            this.ws.send(JSON.stringify(payload));
            return true;
        }
        catch (error) {
            logger_1.default.warn('[MarketIngester] Failed to send WS payload:', error instanceof Error ? error.message : String(error));
            return false;
        }
    }
    async syncSymbolSubscriptions() {
        if (!this.isWsOpen())
            return;
        if (this.isSubscriptionSyncRunning) {
            this.pendingSubscriptionSync = true;
            return;
        }
        this.isSubscriptionSyncRunning = true;
        try {
            const wsChannels = this.getWsSymbolChannels();
            const desiredSymbols = wsChannels.length === 0
                ? new Set()
                : new Set(this.tradingSymbols.map(s => s.toUpperCase()));
            const toUnsubscribe = [...this.subscribedSymbols].filter(symbol => !desiredSymbols.has(symbol));
            const toSubscribe = [...desiredSymbols].filter(symbol => !this.subscribedSymbols.has(symbol));
            for (const symbol of toUnsubscribe) {
                const ok = await this.sendSymbolSubscription(symbol, 'unsubscribe');
                if (ok) {
                    this.subscribedSymbols.delete(symbol);
                }
                if (!this.isWsOpen())
                    break;
            }
            for (const symbol of toSubscribe) {
                const ok = await this.sendSymbolSubscription(symbol, 'subscribe');
                if (ok) {
                    this.subscribedSymbols.add(symbol);
                }
                if (!this.isWsOpen())
                    break;
            }
            if (toSubscribe.length > 0 || toUnsubscribe.length > 0) {
                logger_1.default.info(`[MarketIngester] WS subscriptions synced (+${toSubscribe.length} / -${toUnsubscribe.length}), total=${this.subscribedSymbols.size}`);
            }
        }
        finally {
            this.isSubscriptionSyncRunning = false;
            if (this.pendingSubscriptionSync) {
                this.pendingSubscriptionSync = false;
                void this.syncSymbolSubscriptions();
            }
        }
    }
    async sendSymbolSubscription(symbol, method) {
        const channelTypes = this.getWsSymbolChannels();
        if (channelTypes.length === 0)
            return true;
        for (const channelType of channelTypes) {
            const ok = this.sendWsMessage({
                method,
                subscription: {
                    type: channelType,
                    coin: symbol,
                },
            });
            if (!ok) {
                return false;
            }
            if (this.wsSubscriptionDelayMs > 0) {
                await this.sleep(this.wsSubscriptionDelayMs);
            }
        }
        return true;
    }
    handleWebSocketMessage(payload) {
        try {
            const raw = typeof payload === 'string'
                ? payload
                : Buffer.isBuffer(payload)
                    ? payload.toString('utf8')
                    : String(payload);
            const parsed = JSON.parse(raw);
            if (parsed.error) {
                logger_1.default.warn('[MarketIngester] WS server error:', parsed.error);
                this.recordIngestionTrace('warn', 'ws_server_error', { details: String(parsed.error) });
                return;
            }
            if (parsed.channel === 'allMids') {
                this.handleAllMids(parsed.data);
                return;
            }
            if (parsed.channel === 'l2Book') {
                this.handleOrderBook(parsed.data);
                return;
            }
            if (parsed.channel === 'trades') {
                this.handleTrades(parsed.data);
                return;
            }
            if (parsed.channel === 'funding') {
                this.handleFunding(parsed.data);
            }
        }
        catch (error) {
            logger_1.default.warn('[MarketIngester] Failed to parse WebSocket message:', error instanceof Error ? error.message : String(error));
        }
    }
    handleAllMids(data) {
        const mids = data?.mids;
        if (!mids || typeof mids !== 'object') {
            return;
        }
        const now = Date.now();
        const tracked = this.trackedSymbolSet;
        let updated = 0;
        for (const [rawSymbol, rawPrice] of Object.entries(mids)) {
            const symbol = rawSymbol.toUpperCase();
            if (tracked.size > 0 && !tracked.has(symbol))
                continue;
            const price = Number.parseFloat(rawPrice);
            if (!Number.isFinite(price) || price <= 0)
                continue;
            updated++;
            this.lastQuoteAt.set(symbol, now);
            this.updateQuoteCandle(symbol, price);
        }
        if (updated > 0 && now - this.lastAllMidsLogAt >= 30000) {
            this.lastAllMidsLogAt = now;
            logger_1.default.info(`[MarketIngester] allMids update: ${updated} symbols`);
        }
    }
    handleOrderBook(data) {
        if (!data?.levels || !Array.isArray(data.levels) || data.levels.length < 2) {
            return;
        }
        const symbol = String(data.coin || '').toUpperCase();
        if (!symbol)
            return;
        const bids = data.levels[0] || [];
        const asks = data.levels[1] || [];
        if (bids.length === 0 || asks.length === 0)
            return;
        const bestBid = Number.parseFloat(bids[0].px);
        const bestAsk = Number.parseFloat(asks[0].px);
        if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0 || bestAsk <= 0) {
            return;
        }
        const midPrice = (bestBid + bestAsk) / 2;
        const spread = bestAsk - bestBid;
        const snapshot = {
            symbol,
            timestamp: new Date(),
            bids: bids.slice(0, 10).map(l => ({ price: Number.parseFloat(l.px), size: Number.parseFloat(l.sz) })),
            asks: asks.slice(0, 10).map(l => ({ price: Number.parseFloat(l.px), size: Number.parseFloat(l.sz) })),
            midPrice,
            spread,
        };
        this.saveOrderBook(snapshot);
        this.lastQuoteAt.set(symbol, Date.now());
        this.updateQuoteCandle(symbol, midPrice);
        const now = Date.now();
        const lastLog = this.lastOrderBookLogAt.get(symbol) || 0;
        if (now - lastLog >= this.orderBookLogIntervalMs) {
            logger_1.default.info(`[ORDER BOOK] ${symbol} mid=${midPrice} spread=${spread.toFixed(6)}`);
            this.lastOrderBookLogAt.set(symbol, now);
        }
    }
    handleTrades(data) {
        try {
            const trades = Array.isArray(data)
                ? data
                : Array.isArray(data?.trades)
                    ? data.trades
                    : [];
            if (!Array.isArray(trades) || trades.length === 0)
                return;
            for (const tradeData of trades) {
                const symbol = String(tradeData.coin || '').toUpperCase();
                if (!symbol)
                    continue;
                const price = Number.parseFloat(tradeData.px);
                const size = Number.parseFloat(tradeData.sz);
                if (!Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size < 0)
                    continue;
                const rawTime = tradeData.time ?? tradeData.t ?? Date.now();
                const timestampMs = typeof rawTime === 'number' && rawTime < 1e12 ? rawTime * 1000 : Number(rawTime);
                if (!Number.isFinite(timestampMs) || timestampMs <= 0)
                    continue;
                const trade = {
                    timestamp: new Date(timestampMs),
                    price,
                    size,
                    side: tradeData.side === 'B' ? 'buy' : 'sell',
                    symbol,
                };
                this.lastTradeAt.set(symbol, trade.timestamp.getTime());
                this.saveTrade(trade);
                this.updateTradeCandle(trade);
            }
        }
        catch (error) {
            logger_1.default.warn('Skipping malformed trades message:', error instanceof Error ? error.message : String(error));
        }
    }
    handleFunding(data) {
        if (!data)
            return;
        const fundingRaw = Array.isArray(data.fundingRates)
            ? data.fundingRates[0]
            : data.fundingRate ?? '0';
        const fundingRate = Number.parseFloat(fundingRaw || '0');
        if (!Number.isFinite(fundingRate))
            return;
        const nextFundingRaw = data.nextFundingTime ?? `${Date.now()}`;
        const nextFundingBase = Number.parseInt(nextFundingRaw, 10);
        const nextFundingMs = Number.isFinite(nextFundingBase)
            ? (nextFundingBase < 1e12 ? nextFundingBase * 1000 : nextFundingBase)
            : Date.now();
        const coins = Array.isArray(data.coin) ? data.coin : [data.coin];
        for (const rawCoin of coins) {
            const symbol = String(rawCoin || '').toUpperCase();
            if (!symbol)
                continue;
            const funding = {
                symbol,
                timestamp: new Date(),
                fundingRate,
                nextFundingTime: new Date(nextFundingMs),
            };
            this.saveFunding(funding);
        }
    }
    async startPolling() {
        if (this.pollingTimer)
            return;
        logger_1.default.info('Starting fallback REST API polling...');
        const pollCandles = async () => {
            const symbols = this.tradingSymbols.slice(0, Math.min(20, this.tradingSymbols.length));
            if (symbols.length === 0)
                return;
            const endTime = Date.now();
            const startTime = endTime - 15 * 60 * 1000;
            for (const symbol of symbols) {
                try {
                    const response = await axios_1.default.post(`${this.hyperliquidUrl}/info`, {
                        type: 'candleSnapshot',
                        req: {
                            coin: symbol,
                            interval: '1m',
                            startTime,
                            endTime,
                        },
                    }, { timeout: 10000 });
                    if (!Array.isArray(response.data) || response.data.length === 0)
                        continue;
                    const latest = (0, reliability_1.parseHyperliquidSnapshotCandle)(response.data[response.data.length - 1]);
                    if (!latest)
                        continue;
                    this.saveMarketData({
                        symbol,
                        timestamp: new Date(latest.timestampMs),
                        open: latest.open,
                        high: latest.high,
                        low: latest.low,
                        close: latest.close,
                        volume: latest.volume,
                        vwap: (latest.high + latest.low + latest.close) / 3,
                    }, 'polling');
                }
                catch (error) {
                    logger_1.default.warn(`[MarketIngester] Polling failed for ${symbol}:`, error instanceof Error ? error.message : String(error));
                }
            }
        };
        await pollCandles();
        this.pollingTimer = setInterval(() => {
            void pollCandles();
        }, 30000);
    }
    saveMarketData(data, source = 'trade') {
        const symbol = data.symbol.toUpperCase();
        const normalized = {
            ...data,
            symbol,
        };
        this.marketDataQueue.push(normalized);
        const ts = normalized.timestamp.getTime();
        this.lastMarketDataAt.set(symbol, ts);
        this.symbolDataPoints.set(symbol, (this.symbolDataPoints.get(symbol) || 0) + 1);
        if (source === 'backfill') {
            this.lastBackfillAt.set(symbol, Date.now());
            this.symbolBackfillPoints.set(symbol, (this.symbolBackfillPoints.get(symbol) || 0) + 1);
        }
        this.maybeFlush();
    }
    saveOrderBook(snapshot) {
        this.orderBookQueue.push({
            symbol: snapshot.symbol.toUpperCase(),
            timestampSec: Math.floor(snapshot.timestamp.getTime() / 1000),
            bids: snapshot.bids,
            asks: snapshot.asks,
            midPrice: snapshot.midPrice,
            spread: snapshot.spread,
        });
        this.maybeFlush();
    }
    saveTrade(trade) {
        this.tradeQueue.push({
            timestampSec: Math.floor(trade.timestamp.getTime() / 1000),
            price: trade.price,
            size: trade.size,
            side: trade.side,
            symbol: trade.symbol.toUpperCase(),
        });
        this.maybeFlush();
    }
    saveFunding(funding) {
        this.fundingQueue.push({
            symbol: funding.symbol.toUpperCase(),
            timestampSec: Math.floor(funding.timestamp.getTime() / 1000),
            fundingRate: funding.fundingRate,
            nextFundingTimeSec: Math.floor(funding.nextFundingTime.getTime() / 1000),
        });
        this.maybeFlush();
    }
    recordIngestionTrace(level, event, options) {
        this.ingestionTraceQueue.push({
            timestampSec: Math.floor(Date.now() / 1000),
            level,
            event,
            symbol: options?.symbol?.toUpperCase() || null,
            source: options?.source || null,
            details: options?.details || null,
            metricsJson: options?.metrics ? JSON.stringify(options.metrics) : null,
        });
        this.maybeFlush();
    }
    persistSymbolHealth(nowMs) {
        if (!this.symbolHealthStmt)
            return;
        const symbols = this.getAllTrackedSymbols();
        if (symbols.length === 0)
            return;
        const run = this.db.transaction(() => {
            for (const symbol of symbols) {
                this.symbolHealthStmt.run(symbol, this.lastMarketDataAt.get(symbol) || 0, this.lastQuoteAt.get(symbol) || 0, this.lastTradeAt.get(symbol) || 0, this.lastBackfillAt.get(symbol) || 0, this.symbolDataPoints.get(symbol) || 0, this.symbolBackfillPoints.get(symbol) || 0, Math.floor(nowMs / 1000));
            }
        });
        try {
            run();
        }
        catch (error) {
            logger_1.default.warn('[MarketIngester] Failed to persist symbol health snapshot:', error instanceof Error ? error.message : String(error));
        }
    }
    startCoverageMonitoring() {
        if (this.coverageTimer)
            return;
        this.coverageTimer = setInterval(() => {
            void this.runCoverageAudit();
        }, this.coverageAuditIntervalMs);
    }
    async runCoverageAudit() {
        const tracked = this.getAllTrackedSymbols();
        if (tracked.length === 0)
            return;
        const now = Date.now();
        const coverage = (0, reliability_1.computeCoverageSnapshot)({
            symbols: tracked,
            lastMarketDataAt: this.lastMarketDataAt,
            nowMs: now,
            freshnessMs: this.coverageFreshnessMs,
        });
        this.persistSymbolHealth(now);
        const shouldLog = now - this.lastCoverageLogAt >= this.coverageLogIntervalMs
            || coverage.coverageRatio < this.minCoverageRatio;
        if (shouldLog) {
            this.lastCoverageLogAt = now;
            const summary = `coverage=${(coverage.coverageRatio * 100).toFixed(1)}% fresh=${coverage.freshSymbols}/${coverage.totalSymbols} stale=${coverage.staleSymbols}`;
            if (coverage.coverageRatio < this.minCoverageRatio) {
                logger_1.default.warn(`[MarketIngester] Coverage degraded: ${summary}`);
            }
            else {
                logger_1.default.info(`[MarketIngester] Coverage: ${summary}`);
            }
            this.recordIngestionTrace(coverage.coverageRatio < this.minCoverageRatio ? 'warn' : 'info', 'coverage_snapshot', {
                details: summary,
                metrics: {
                    totalSymbols: coverage.totalSymbols,
                    freshSymbols: coverage.freshSymbols,
                    staleSymbols: coverage.staleSymbols,
                    coverageRatio: coverage.coverageRatio,
                    oldestStaleAgeMs: coverage.oldestStaleAgeMs,
                    staleSample: coverage.staleSymbolsList.slice(0, 20),
                },
            });
        }
        if (now - this.startedAtMs < this.coverageWarmupMs) {
            return;
        }
        if (coverage.staleSymbols === 0 || this.isBackfillRunning) {
            return;
        }
        const targets = (0, reliability_1.selectBackfillSymbols)({
            staleSymbols: coverage.staleSymbolsList,
            lastAttemptAt: this.lastBackfillAttemptAt,
            nowMs: now,
            cooldownMs: this.backfillCooldownMs,
            maxSymbols: this.maxBackfillPerCycle,
            volumeBySymbol: this.symbolVolumes,
        });
        if (targets.length === 0) {
            return;
        }
        void this.backfillSymbols(targets);
    }
    startEnrichmentPolling() {
        if (this.enrichmentTimer)
            return;
        const run = async () => {
            if (this.isEnrichmentRunning)
                return;
            this.isEnrichmentRunning = true;
            try {
                await this.runEnrichmentBatch();
            }
            finally {
                this.isEnrichmentRunning = false;
            }
        };
        void run();
        this.enrichmentTimer = setInterval(() => {
            void run();
        }, this.enrichmentIntervalMs);
    }
    getNextEnrichmentSymbols() {
        const symbols = this.getAllTrackedSymbols();
        if (symbols.length === 0)
            return [];
        const batchSize = Math.min(this.enrichmentBatchSize, symbols.length);
        const out = [];
        for (let i = 0; i < batchSize; i++) {
            const idx = (this.enrichmentCursor + i) % symbols.length;
            out.push(symbols[idx]);
        }
        this.enrichmentCursor = (this.enrichmentCursor + batchSize) % symbols.length;
        return out;
    }
    async runEnrichmentBatch() {
        const symbols = this.getNextEnrichmentSymbols();
        if (symbols.length === 0)
            return;
        const endTime = Date.now();
        const startTime = endTime - 10 * 60 * 1000;
        let index = 0;
        let success = 0;
        let failed = 0;
        const workerCount = Math.max(1, Math.min(this.enrichmentConcurrency, symbols.length));
        const worker = async () => {
            while (true) {
                const current = index;
                index += 1;
                if (current >= symbols.length)
                    return;
                const symbol = symbols[current];
                const ok = await this.enrichSymbol(symbol, startTime, endTime);
                if (ok)
                    success += 1;
                else
                    failed += 1;
                if (this.enrichmentDelayMs > 0) {
                    await this.sleep(this.enrichmentDelayMs);
                }
            }
        };
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
        this.enrichmentRuns += 1;
        const shouldTrace = failed > 0 || this.enrichmentRuns % 6 === 0;
        if (shouldTrace) {
            const details = `symbols=${symbols.length}, success=${success}, failed=${failed}`;
            if (failed > 0) {
                logger_1.default.warn(`[MarketIngester] Enrichment batch issues: ${details}`);
            }
            else {
                logger_1.default.info(`[MarketIngester] Enrichment batch: ${details}`);
            }
            this.recordIngestionTrace(failed > 0 ? 'warn' : 'info', 'enrichment_batch', {
                details,
                source: 'rest',
                metrics: {
                    symbols: symbols.slice(0, 30),
                    success,
                    failed,
                    total: symbols.length,
                },
            });
        }
    }
    async enrichSymbol(symbol, startTime, endTime) {
        const upper = symbol.toUpperCase();
        try {
            const response = await axios_1.default.post(`${this.hyperliquidUrl}/info`, {
                type: 'candleSnapshot',
                req: {
                    coin: upper,
                    interval: '1m',
                    startTime,
                    endTime,
                },
            }, { timeout: 10000 });
            if (!Array.isArray(response.data) || response.data.length === 0) {
                return false;
            }
            const latest = (0, reliability_1.parseHyperliquidSnapshotCandle)(response.data[response.data.length - 1]);
            if (!latest) {
                return false;
            }
            this.saveMarketData({
                symbol: upper,
                timestamp: new Date(latest.timestampMs),
                open: latest.open,
                high: latest.high,
                low: latest.low,
                close: latest.close,
                volume: latest.volume,
                vwap: (latest.high + latest.low + latest.close) / 3,
            }, 'polling');
            return true;
        }
        catch {
            return false;
        }
    }
    async backfillSymbols(symbols) {
        if (symbols.length === 0 || this.isBackfillRunning)
            return;
        this.isBackfillRunning = true;
        this.recordIngestionTrace('info', 'backfill_started', {
            details: `symbols=${symbols.length}`,
            metrics: {
                symbols,
            },
        });
        try {
            let index = 0;
            const workerCount = Math.max(1, Math.min(this.backfillConcurrency, symbols.length));
            const worker = async () => {
                while (true) {
                    const current = index;
                    index += 1;
                    if (current >= symbols.length) {
                        return;
                    }
                    const symbol = symbols[current];
                    await this.backfillSymbol(symbol);
                    if (this.backfillDelayMs > 0) {
                        await this.sleep(this.backfillDelayMs);
                    }
                }
            };
            await Promise.all(Array.from({ length: workerCount }, () => worker()));
        }
        finally {
            this.isBackfillRunning = false;
        }
    }
    async backfillSymbol(symbol) {
        const upper = symbol.toUpperCase();
        const now = Date.now();
        this.lastBackfillAttemptAt.set(upper, now);
        const endTime = now;
        const startTime = endTime - this.backfillLookbackMinutes * 60 * 1000;
        try {
            const response = await axios_1.default.post(`${this.hyperliquidUrl}/info`, {
                type: 'candleSnapshot',
                req: {
                    coin: upper,
                    interval: '1m',
                    startTime,
                    endTime,
                },
            }, { timeout: 12000 });
            if (!Array.isArray(response.data) || response.data.length === 0) {
                this.recordIngestionTrace('warn', 'backfill_no_data', {
                    symbol: upper,
                    source: 'rest',
                    details: 'empty candle response',
                });
                return;
            }
            const parsed = response.data
                .map(candle => (0, reliability_1.parseHyperliquidSnapshotCandle)(candle))
                .filter((candle) => candle !== null)
                .slice(-6);
            if (parsed.length === 0) {
                this.recordIngestionTrace('warn', 'backfill_parse_failed', {
                    symbol: upper,
                    source: 'rest',
                    details: 'unable to parse candles',
                });
                return;
            }
            for (const candle of parsed) {
                this.saveMarketData({
                    symbol: upper,
                    timestamp: new Date(candle.timestampMs),
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume,
                    vwap: (candle.high + candle.low + candle.close) / 3,
                }, 'backfill');
            }
            this.lastBackfillAt.set(upper, Date.now());
            this.recordIngestionTrace('info', 'backfill_success', {
                symbol: upper,
                source: 'rest',
                details: `candles=${parsed.length}`,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.recordIngestionTrace('warn', 'backfill_failed', {
                symbol: upper,
                source: 'rest',
                details: message,
            });
        }
    }
    async stop() {
        this.isStopping = true;
        if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
            this.wsReconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.tradeCandleTimer) {
            clearInterval(this.tradeCandleTimer);
            this.tradeCandleTimer = null;
        }
        if (this.writeFlushTimer) {
            clearInterval(this.writeFlushTimer);
            this.writeFlushTimer = null;
        }
        if (this.symbolUpdateTimer) {
            clearInterval(this.symbolUpdateTimer);
            this.symbolUpdateTimer = null;
        }
        if (this.coverageTimer) {
            clearInterval(this.coverageTimer);
            this.coverageTimer = null;
        }
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
        if (this.enrichmentTimer) {
            clearInterval(this.enrichmentTimer);
            this.enrichmentTimer = null;
        }
        this.flushWriteBuffers();
        this.persistSymbolHealth(Date.now());
        logger_1.default.info('Market ingester stopped');
    }
    mergeCandleSource(existing, incoming) {
        if (existing === incoming)
            return existing;
        if (existing === 'mixed' || incoming === 'mixed')
            return 'mixed';
        if (existing === 'trade' && incoming === 'quote')
            return 'mixed';
        if (existing === 'quote' && incoming === 'trade')
            return 'mixed';
        return incoming;
    }
    updateTradeCandle(trade) {
        const bucketStartMs = Math.floor(trade.timestamp.getTime() / 1000) * 1000;
        const key = trade.symbol.toUpperCase();
        const existing = this.tradeCandles.get(key);
        if (!existing || bucketStartMs > existing.bucketStartMs) {
            if (existing) {
                this.flushTradeCandle(existing);
            }
            this.tradeCandles.set(key, {
                symbol: key,
                bucketStartMs,
                open: trade.price,
                high: trade.price,
                low: trade.price,
                close: trade.price,
                volume: trade.size,
                notional: trade.price * trade.size,
                source: 'trade',
            });
            return;
        }
        if (bucketStartMs < existing.bucketStartMs) {
            return;
        }
        existing.high = Math.max(existing.high, trade.price);
        existing.low = Math.min(existing.low, trade.price);
        existing.close = trade.price;
        existing.volume += trade.size;
        existing.notional += trade.price * trade.size;
        existing.source = this.mergeCandleSource(existing.source, 'trade');
        const candleForValidation = {
            time: trade.timestamp,
            open: existing.open,
            high: existing.high,
            low: existing.low,
            close: existing.close,
            volume: existing.volume,
        };
        if (!(0, data_validation_1.validateCandle)(candleForValidation)) {
            logger_1.default.warn(`[MarketIngester] Invalid trade candle detected for ${trade.symbol}, skipping update`);
        }
    }
    updateQuoteCandle(symbol, price) {
        const bucketStartMs = Math.floor(Date.now() / 1000) * 1000;
        const key = symbol.toUpperCase();
        const existing = this.tradeCandles.get(key);
        if (!existing || bucketStartMs > existing.bucketStartMs) {
            if (existing) {
                this.flushTradeCandle(existing);
            }
            this.tradeCandles.set(key, {
                symbol: key,
                bucketStartMs,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0,
                notional: 0,
                source: 'quote',
            });
            return;
        }
        if (bucketStartMs < existing.bucketStartMs) {
            return;
        }
        existing.high = Math.max(existing.high, price);
        existing.low = Math.min(existing.low, price);
        existing.close = price;
        existing.source = this.mergeCandleSource(existing.source, 'quote');
    }
    flushTradeCandle(candle) {
        const vwap = candle.volume > 0 ? candle.notional / candle.volume : candle.close;
        const marketData = {
            symbol: candle.symbol,
            timestamp: new Date(candle.bucketStartMs),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            vwap,
        };
        this.saveMarketData(marketData, candle.source);
    }
    startCandleFlushTimer() {
        if (this.tradeCandleTimer)
            return;
        this.tradeCandleTimer = setInterval(() => {
            const now = Date.now();
            for (const [symbol, candle] of this.tradeCandles.entries()) {
                if (now - candle.bucketStartMs > 1500) {
                    this.flushTradeCandle(candle);
                    this.tradeCandles.delete(symbol);
                }
            }
        }, 1000);
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.default = new MarketIngester();
//# sourceMappingURL=market-ingester.js.map