#!/usr/bin/env node
"use strict";
/**
 * WebSocket Candle Ingestion Service
 *
 * Connects to Hyperliquid WebSocket for real-time candle data
 * No rate limits, continuous feed, builds history automatically
 *
 * Run: node bin/jobs/websocket-candles.js
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const logger_1 = __importDefault(require("../shared/logger"));
// Configuration
const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';
const DB_PATH = './data/trading.db';
const RECONNECT_DELAY = 5000;
const PING_INTERVAL = 30000;
class WebSocketCandleService {
    constructor() {
        this.ws = null;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.isRunning = false;
        this.activeSymbols = new Set();
        // Candle builders for each symbol/timeframe
        this.candleBuilders = new Map();
        // Timeframes to track (in milliseconds)
        this.timeframes = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000
        };
        this.db = new better_sqlite3_1.default(DB_PATH);
        this.setupDatabase();
        this.loadActiveSymbols();
    }
    setupDatabase() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS candles (
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        trades INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (symbol, timeframe, timestamp)
      );

      CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe 
        ON candles(symbol, timeframe, timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_candles_timestamp 
        ON candles(timestamp DESC);
    `);
    }
    loadActiveSymbols() {
        try {
            // Get symbols from database or use defaults
            const rows = this.db.prepare("SELECT symbol FROM tracked_symbols WHERE isActive = 1 LIMIT 50").all();
            if (rows.length > 0) {
                rows.forEach(r => this.activeSymbols.add(r.symbol));
            }
            else {
                // Default top symbols
                ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE', 'PEPE', 'WIF'].forEach(s => this.activeSymbols.add(s));
            }
            logger_1.default.info(`[WebSocketCandles] Loaded ${this.activeSymbols.size} symbols`);
        }
        catch (error) {
            logger_1.default.error('[WebSocketCandles] Failed to load symbols:', error);
            // Fallback
            ['BTC', 'ETH', 'SOL'].forEach(s => this.activeSymbols.add(s));
        }
    }
    async start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        logger_1.default.info('[WebSocketCandles] Starting WebSocket candle service...');
        await this.connect();
        // Flush candles periodically
        setInterval(() => this.flushCandles(), 10000);
        // Log stats periodically
        setInterval(() => this.logStats(), 60000);
    }
    stop() {
        logger_1.default.info('[WebSocketCandles] Stopping...');
        this.isRunning = false;
        if (this.pingTimer)
            clearInterval(this.pingTimer);
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        // Flush any remaining candles
        this.flushCandles();
    }
    async connect() {
        try {
            logger_1.default.info('[WebSocketCandles] Connecting to Hyperliquid WebSocket...');
            this.ws = new ws_1.default(HL_WS_URL);
            this.ws.on('open', () => {
                logger_1.default.info('[WebSocketCandles] Connected');
                this.subscribe();
                this.startPing();
            });
            this.ws.on('message', (data) => {
                this.handleMessage(data.toString());
            });
            this.ws.on('error', (error) => {
                logger_1.default.error('[WebSocketCandles] WebSocket error:', error.message);
            });
            this.ws.on('close', () => {
                logger_1.default.warn('[WebSocketCandles] Disconnected, reconnecting...');
                this.scheduleReconnect();
            });
        }
        catch (error) {
            logger_1.default.error('[WebSocketCandles] Connection failed:', error);
            this.scheduleReconnect();
        }
    }
    subscribe() {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN)
            return;
        // Subscribe to trades for all active symbols
        // We'll build candles from trade data
        const subscription = {
            method: 'subscribe',
            subscription: {
                type: 'trades',
                coin: Array.from(this.activeSymbols)
            }
        };
        this.ws.send(JSON.stringify(subscription));
        logger_1.default.info(`[WebSocketCandles] Subscribed to trades for ${this.activeSymbols.size} symbols`);
        // Also subscribe to candle snapshots for immediate history
        for (const symbol of this.activeSymbols) {
            const candleSub = {
                method: 'subscribe',
                subscription: {
                    type: 'candle',
                    coin: symbol,
                    interval: '1m'
                }
            };
            this.ws.send(JSON.stringify(candleSub));
        }
    }
    handleMessage(message) {
        try {
            const data = JSON.parse(message);
            if (data.channel === 'trades' && data.data && Array.isArray(data.data)) {
                // Process each trade in the batch
                for (const trade of data.data) {
                    this.processTrade(trade);
                }
            }
            else if (data.channel === 'candle' && data.data) {
                this.processCandle(data.data);
            }
            else if (data.error) {
                logger_1.default.error('[WebSocketCandles] Server error:', data.error);
            }
        }
        catch (error) {
            // Ignore parsing errors for non-JSON messages
        }
    }
    processTrade(trade) {
        const symbol = trade.coin;
        const price = parseFloat(trade.px);
        const size = parseFloat(trade.sz);
        const timestamp = trade.time;
        // Update candle builders for all timeframes
        for (const [tfName, tfMs] of Object.entries(this.timeframes)) {
            const candleKey = `${symbol}:${tfName}`;
            const candleStart = Math.floor(timestamp / tfMs) * tfMs;
            let builder = this.candleBuilders.get(candleKey);
            if (!builder || builder.timestamp !== candleStart) {
                // New candle - flush old one if exists
                if (builder) {
                    this.saveCandle(builder, tfName);
                }
                // Create new candle
                builder = {
                    symbol,
                    timeframe: tfName,
                    timestamp: candleStart,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: size,
                    trades: 1
                };
                this.candleBuilders.set(candleKey, builder);
            }
            else {
                // Update existing candle
                builder.high = Math.max(builder.high, price);
                builder.low = Math.min(builder.low, price);
                builder.close = price;
                builder.volume += size;
                builder.trades++;
            }
        }
    }
    processCandle(candleData) {
        // Direct candle data from WebSocket
        if (Array.isArray(candleData) && candleData.length >= 6) {
            const [timestamp, open, high, low, close, volume] = candleData;
            // Extract symbol from the subscription context if available
            // For now, we'll rely on the trade-based candle building
        }
    }
    saveCandle(builder, timeframe) {
        try {
            const insert = this.db.prepare(`
        INSERT OR REPLACE INTO candles 
        (symbol, timeframe, timestamp, open, high, low, close, volume, trades)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
            insert.run(builder.symbol, timeframe, builder.timestamp, builder.open, builder.high, builder.low, builder.close, builder.volume, builder.trades);
        }
        catch (error) {
            logger_1.default.error(`[WebSocketCandles] Failed to save candle:`, error);
        }
    }
    flushCandles() {
        const now = Date.now();
        let flushed = 0;
        for (const [key, builder] of this.candleBuilders.entries()) {
            const tfMs = this.timeframes[builder.timeframe];
            // Flush candles that are complete (next period has started)
            if (now >= builder.timestamp + tfMs) {
                this.saveCandle(builder, builder.timeframe);
                flushed++;
                // Keep the builder for the new candle if trades continue
                // It will be replaced in processTrade when new trades arrive
            }
        }
        if (flushed > 0) {
            logger_1.default.info(`[WebSocketCandles] Flushed ${flushed} candles`);
        }
    }
    logStats() {
        try {
            const row = this.db.prepare("SELECT COUNT(*) as count FROM candles WHERE timestamp > ?").get(Date.now() - 3600000); // Last hour
            logger_1.default.info(`[WebSocketCandles] Stats: ${row.count} candles in last hour, ${this.candleBuilders.size} active builders`);
        }
        catch (error) {
            // Ignore
        }
    }
    startPing() {
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
                this.ws.send(JSON.stringify({ method: 'ping' }));
            }
        }, PING_INTERVAL);
    }
    scheduleReconnect() {
        if (!this.isRunning)
            return;
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, RECONNECT_DELAY);
    }
}
// Create and start service
const service = new WebSocketCandleService();
// Handle graceful shutdown
process.on('SIGINT', () => service.stop());
process.on('SIGTERM', () => service.stop());
// Start
service.start().catch(err => {
    logger_1.default.error('[WebSocketCandles] Failed to start:', err);
    process.exit(1);
});
exports.default = service;
