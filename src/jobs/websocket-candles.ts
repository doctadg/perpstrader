#!/usr/bin/env node
/**
 * WebSocket Candle Ingestion Service
 * 
 * Connects to Hyperliquid WebSocket for real-time candle data
 * No rate limits, continuous feed, builds history automatically
 * 
 * Run: node bin/jobs/websocket-candles.js
 */

import WebSocket from 'ws';
import Database from 'better-sqlite3';
import logger from '../shared/logger';

// Configuration
const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';
const DB_PATH = './data/trading.db';
const RECONNECT_DELAY = 5000;
const PING_INTERVAL = 30000;

// Track candle building from trades
interface CandleBuilder {
  symbol: string;
  timeframe: string;
  timestamp: number;  // Candle start time
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

class WebSocketCandleService {
  private db: Database.Database;
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private activeSymbols: Set<string> = new Set();
  
  // Candle builders for each symbol/timeframe
  private candleBuilders: Map<string, CandleBuilder> = new Map();
  
  // Timeframes to track (in milliseconds)
  private timeframes = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
  };

  constructor() {
    this.db = new Database(DB_PATH);
    this.setupDatabase();
    this.loadActiveSymbols();
  }

  private setupDatabase(): void {
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

  private loadActiveSymbols(): void {
    try {
      // Get symbols from database or use defaults
      const rows = this.db.prepare(
        "SELECT symbol FROM tracked_symbols WHERE isActive = 1 LIMIT 50"
      ).all() as Array<{ symbol: string }>;
      
      if (rows.length > 0) {
        rows.forEach(r => this.activeSymbols.add(r.symbol));
      } else {
        // Default top symbols
        ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE', 'PEPE', 'WIF'].forEach(s => 
          this.activeSymbols.add(s)
        );
      }
      logger.info(`[WebSocketCandles] Loaded ${this.activeSymbols.size} symbols`);
    } catch (error) {
      logger.error('[WebSocketCandles] Failed to load symbols:', error);
      // Fallback
      ['BTC', 'ETH', 'SOL'].forEach(s => this.activeSymbols.add(s));
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.info('[WebSocketCandles] Starting WebSocket candle service...');
    
    await this.connect();
    
    // Flush candles periodically
    setInterval(() => this.flushCandles(), 10000);
    
    // Log stats periodically
    setInterval(() => this.logStats(), 60000);
  }

  stop(): void {
    logger.info('[WebSocketCandles] Stopping...');
    this.isRunning = false;
    
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Flush any remaining candles
    this.flushCandles();
  }

  private async connect(): Promise<void> {
    try {
      logger.info('[WebSocketCandles] Connecting to Hyperliquid WebSocket...');
      
      this.ws = new WebSocket(HL_WS_URL);
      
      this.ws.on('open', () => {
        logger.info('[WebSocketCandles] Connected');
        this.subscribe();
        this.startPing();
      });
      
      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString());
      });
      
      this.ws.on('error', (error) => {
        logger.error('[WebSocketCandles] WebSocket error:', error.message);
      });
      
      this.ws.on('close', () => {
        logger.warn('[WebSocketCandles] Disconnected, reconnecting...');
        this.scheduleReconnect();
      });
      
    } catch (error) {
      logger.error('[WebSocketCandles] Connection failed:', error);
      this.scheduleReconnect();
    }
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
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
    logger.info(`[WebSocketCandles] Subscribed to trades for ${this.activeSymbols.size} symbols`);
    
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

  private handleMessage(message: string): void {
    try {
      const data = JSON.parse(message);
      
      if (data.channel === 'trades' && data.data && Array.isArray(data.data)) {
        // Process each trade in the batch
        for (const trade of data.data) {
          this.processTrade(trade);
        }
      } else if (data.channel === 'candle' && data.data) {
        this.processCandle(data.data);
      } else if (data.error) {
        logger.error('[WebSocketCandles] Server error:', data.error);
      }
    } catch (error) {
      // Ignore parsing errors for non-JSON messages
    }
  }

  private processTrade(trade: any): void {
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
      } else {
        // Update existing candle
        builder.high = Math.max(builder.high, price);
        builder.low = Math.min(builder.low, price);
        builder.close = price;
        builder.volume += size;
        builder.trades++;
      }
    }
  }

  private processCandle(candleData: any): void {
    // Direct candle data from WebSocket
    if (Array.isArray(candleData) && candleData.length >= 6) {
      const [timestamp, open, high, low, close, volume] = candleData;
      
      // Extract symbol from the subscription context if available
      // For now, we'll rely on the trade-based candle building
    }
  }

  private saveCandle(builder: CandleBuilder, timeframe: string): void {
    try {
      const insert = this.db.prepare(`
        INSERT OR REPLACE INTO candles 
        (symbol, timeframe, timestamp, open, high, low, close, volume, trades)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      insert.run(
        builder.symbol,
        timeframe,
        builder.timestamp,
        builder.open,
        builder.high,
        builder.low,
        builder.close,
        builder.volume,
        builder.trades
      );
    } catch (error) {
      logger.error(`[WebSocketCandles] Failed to save candle:`, error);
    }
  }

  private flushCandles(): void {
    const now = Date.now();
    let flushed = 0;
    
    for (const [key, builder] of this.candleBuilders.entries()) {
      const tfMs = this.timeframes[builder.timeframe as keyof typeof this.timeframes];
      
      // Flush candles that are complete (next period has started)
      if (now >= builder.timestamp + tfMs) {
        this.saveCandle(builder, builder.timeframe);
        flushed++;
        
        // Keep the builder for the new candle if trades continue
        // It will be replaced in processTrade when new trades arrive
      }
    }
    
    if (flushed > 0) {
      logger.info(`[WebSocketCandles] Flushed ${flushed} candles`);
    }
  }

  private logStats(): void {
    try {
      const row = this.db.prepare(
        "SELECT COUNT(*) as count FROM candles WHERE timestamp > ?"
      ).get(Date.now() - 3600000) as { count: number }; // Last hour
      
      logger.info(`[WebSocketCandles] Stats: ${row.count} candles in last hour, ${this.candleBuilders.size} active builders`);
    } catch (error) {
      // Ignore
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, PING_INTERVAL);
  }

  private scheduleReconnect(): void {
    if (!this.isRunning) return;
    
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
  logger.error('[WebSocketCandles] Failed to start:', err);
  process.exit(1);
});

export default service;
