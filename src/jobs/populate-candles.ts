#!/usr/bin/env node
/**
 * Candle Data Population Job
 * 
 * Fetches historical candle data for all active trading symbols
 * Run with: node bin/populate-candles.js
 * Cron: Every 15 minutes + on startup
 */

import axios from 'axios';
import Database from 'better-sqlite3';
import logger from '../shared/logger';
import config from '../shared/config';

// Timeframes to populate
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const CANDLE_LIMIT = 500; // Number of candles to fetch per symbol
const BATCH_SIZE = 3; // Process this many symbols concurrently (reduced for rate limiting)
const REQUEST_DELAY_MS = 500; // Delay between API requests

interface Candle {
  symbol: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

class CandlePopulationJob {
  private db: Database.Database;
  private hyperliquidUrl: string = 'https://api.hyperliquid.xyz/info';
  private isRunning: boolean = false;
  private updateTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Connect to trading database
    this.db = new Database('./data/trading.db');
    this.setupDatabase();
  }

  private setupDatabase(): void {
    // Ensure candles table exists
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
        created_at INTEGER DEFAULT (unixepoch()),
        PRIMARY KEY (symbol, timeframe, timestamp)
      );

      CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe 
        ON candles(symbol, timeframe, timestamp DESC);
      
      CREATE INDEX IF NOT EXISTS idx_candles_timestamp 
        ON candles(timestamp DESC);

      CREATE TABLE IF NOT EXISTS candle_last_update (
        symbol TEXT PRIMARY KEY,
        last_candle_timestamp INTEGER,
        updated_at INTEGER DEFAULT (unixepoch())
      );
    `);
  }

  /**
   * Get all active symbols from database
   */
  private getActiveSymbols(): string[] {
    try {
      const rows = this.db.prepare(
        "SELECT symbol FROM tracked_symbols WHERE isActive = 1 ORDER BY volume24h DESC LIMIT 100"
      ).all() as Array<{ symbol: string }>;
      
      return rows.map(r => r.symbol);
    } catch (error) {
      logger.error('[CandleJob] Failed to get active symbols:', error);
      // Return default symbols
      return ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE'];
    }
  }

  /**
   * Get last candle timestamp for symbol
   */
  private getLastCandleTimestamp(symbol: string, timeframe: string): number {
    try {
      const row = this.db.prepare(
        "SELECT MAX(timestamp) as last_ts FROM candles WHERE symbol = ? AND timeframe = ?"
      ).get(symbol, timeframe) as { last_ts: number } | undefined;
      
      return row?.last_ts || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Sleep helper for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch candles from Hyperliquid with retry logic
   */
  private async fetchCandles(
    symbol: string, 
    timeframe: string, 
    startTime: number,
    endTime: number,
    retries: number = 3
  ): Promise<Candle[]> {
    try {
      // Add delay to avoid rate limiting
      await this.sleep(REQUEST_DELAY_MS);

      // Convert timeframe to Hyperliquid format
      const intervalMap: Record<string, string> = {
        '1m': '1m',
        '5m': '5m', 
        '15m': '15m',
        '1h': '1h',
        '4h': '4h',
        '1d': '1d'
      };

      const response = await axios.post(this.hyperliquidUrl, {
        type: 'candleSnapshot',
        req: {
          coin: symbol,
          interval: intervalMap[timeframe] || '1h',
          startTime: startTime,
          endTime: endTime
        }
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      // Hyperliquid returns: [timestamp, open, high, low, close, volume]
      return response.data.map((candle: number[]) => ({
        symbol,
        timestamp: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }));
    } catch (error: any) {
      if (error.response?.status === 429 && retries > 0) {
        // Rate limited - wait longer and retry
        const delay = (4 - retries) * 2000; // 2s, 4s, 6s
        logger.warn(`[CandleJob] Rate limited for ${symbol}, retrying in ${delay}ms...`);
        await this.sleep(delay);
        return this.fetchCandles(symbol, timeframe, startTime, endTime, retries - 1);
      }
      logger.error(`[CandleJob] Failed to fetch candles for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Store candles in database
   */
  private storeCandles(candles: Candle[], timeframe: string): void {
    if (candles.length === 0) return;

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO candles 
      (symbol, timeframe, timestamp, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateLast = this.db.prepare(`
      INSERT OR REPLACE INTO candle_last_update 
      (symbol, last_candle_timestamp, updated_at)
      VALUES (?, ?, unixepoch())
    `);

    const transaction = this.db.transaction(() => {
      let lastTimestamp = 0;
      
      for (const candle of candles) {
        insert.run(
          candle.symbol,
          timeframe,
          candle.timestamp,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume
        );
        
        if (candle.timestamp > lastTimestamp) {
          lastTimestamp = candle.timestamp;
        }
      }

      // Update last timestamp
      if (lastTimestamp > 0 && candles.length > 0) {
        updateLast.run(candles[0].symbol, lastTimestamp);
      }
    });

    transaction();
  }

  /**
   * Process a single symbol
   */
  private async processSymbol(symbol: string): Promise<number> {
    let totalCandles = 0;
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);

    for (const timeframe of TIMEFRAMES) {
      const lastTs = this.getLastCandleTimestamp(symbol, timeframe);
      const startTime = lastTs > 0 ? lastTs : dayAgo;
      
      // Fetch candles
      const candles = await this.fetchCandles(symbol, timeframe, startTime, now);
      
      if (candles.length > 0) {
        this.storeCandles(candles, timeframe);
        totalCandles += candles.length;
      }
    }

    return totalCandles;
  }

  /**
   * Run the population job
   */
  async run(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[CandleJob] Already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      logger.info('[CandleJob] Starting candle population...');

      // Get active symbols
      const symbols = this.getActiveSymbols();
      logger.info(`[CandleJob] Processing ${symbols.length} symbols`);

      let totalCandles = 0;
      let processedSymbols = 0;
      let errorSymbols = 0;

      // Process in batches
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(symbol => this.processSymbol(symbol))
        );

        results.forEach((result, idx) => {
          const symbol = batch[idx];
          if (result.status === 'fulfilled') {
            totalCandles += result.value;
            processedSymbols++;
            if (result.value > 0) {
              logger.info(`[CandleJob] ${symbol}: ${result.value} candles`);
            }
          } else {
            errorSymbols++;
            logger.error(`[CandleJob] ${symbol} failed:`, result.reason);
          }
        });
      }

      const duration = Date.now() - startTime;
      logger.info(`[CandleJob] Complete: ${processedSymbols} symbols, ${totalCandles} candles in ${duration}ms`);
      
      if (errorSymbols > 0) {
        logger.warn(`[CandleJob] ${errorSymbols} symbols had errors`);
      }

    } catch (error) {
      logger.error('[CandleJob] Job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start periodic updates
   */
  start(): void {
    logger.info('[CandleJob] Starting candle population service...');
    
    // Run immediately
    this.run();
    
    // Then every 15 minutes
    this.updateTimer = setInterval(() => {
      this.run();
    }, 15 * 60 * 1000);
    
    logger.info('[CandleJob] Service started (updates every 15 minutes)');
  }

  /**
   * Stop the service
   */
  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    logger.info('[CandleJob] Service stopped');
  }
}

// Create instance
const candleJob = new CandlePopulationJob();

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('[CandleJob] SIGINT received, shutting down...');
  candleJob.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('[CandleJob] SIGTERM received, shutting down...');
  candleJob.stop();
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  candleJob.start();
}

export default candleJob;
