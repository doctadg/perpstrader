import axios from 'axios';
import * as dotenv from 'dotenv';
import { MarketData, OrderBookSnapshot, FundingRate, Trade } from './types';
import { v4 as uuidv4 } from 'uuid';
import logger from '../shared/logger';
import config from '../shared/config';
import Database from 'better-sqlite3';
import { validateCandle } from '../shared/data-validation';

dotenv.config();

interface HyperliquidOrderBookLevel {
  px: string;
  sz: string;
  n: number;
}

interface HyperliquidAllMids {
  mids: string[];
}

interface HyperliquidL2Book {
  coin: string;
  time: number;
  levels: HyperliquidOrderBookLevel[][];
}

interface HyperliquidTrades {
  trades: Array<{
    px: string;
    sz: string;
    side: string;
    coin: string;
  }>;
}

interface HyperliquidFunding {
  coin: string;
  fundingRates: string[];
  nextFundingTime: string;
}

interface HyperliquidInfo {
  mids: string[];
}

type QueuedOrderBook = {
  symbol: string;
  timestampSec: number;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  midPrice: number;
  spread: number;
};

type QueuedTrade = {
  timestampSec: number;
  price: number;
  size: number;
  side: string;
  symbol: string;
};

type QueuedFunding = {
  symbol: string;
  timestampSec: number;
  fundingRate: number;
  nextFundingTimeSec: number;
};

class MarketIngester {
  private db: Database.Database;
  private hyperliquidUrl: string;
  private wsUrl: string;
  private tradingSymbols: string[];
  private primaryTimeframe: string;
  private ws: any = null;
  private isPaperTrading: boolean = true;
  private tradeCandles: Map<string, {
    symbol: string;
    bucketStartMs: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    notional: number;
  }> = new Map();
  private tradeCandleTimer: NodeJS.Timeout | null = null;
  private marketDataQueue: MarketData[] = [];
  private orderBookQueue: QueuedOrderBook[] = [];
  private tradeQueue: QueuedTrade[] = [];
  private fundingQueue: QueuedFunding[] = [];
  private marketDataStmt: Database.Statement | null = null;
  private orderBookStmt: Database.Statement | null = null;
  private tradeStmt: Database.Statement | null = null;
  private fundingStmt: Database.Statement | null = null;
  private writeFlushTimer: NodeJS.Timeout | null = null;
  private writeFlushIntervalMs: number;
  private writeBatchSize: number;
  private isFlushing: boolean = false;
  private orderBookLogIntervalMs: number;
  private lastOrderBookLogAt: Map<string, number> = new Map();

  constructor() {
    const hyperliquidConfig = config.getSection('hyperliquid');
    this.hyperliquidUrl = hyperliquidConfig.baseUrl || 'https://api.hyperliquid.xyz';
    this.wsUrl = hyperliquidConfig.testnet
      ? 'wss://api.hyperliquid-testnet.xyz/ws'
      : 'wss://api.hyperliquid.xyz/ws';

    const tradingConfig = config.getSection('trading');
    this.tradingSymbols = tradingConfig.symbols || ['BTC', 'ETH', 'SOL'];
    this.primaryTimeframe = tradingConfig.timeframes?.[0] || '1s';

    const dbConfig = config.getSection('database');
    this.db = new Database(dbConfig.connection);
    this.initializeDatabase();
    this.prepareStatements();
    this.isPaperTrading = process.env.PAPER_TRADING === 'true';
    this.writeFlushIntervalMs = Number.parseInt(process.env.INGEST_DB_FLUSH_MS || '200', 10) || 200;
    this.writeBatchSize = Number.parseInt(process.env.INGEST_DB_BATCH_SIZE || '200', 10) || 200;
    this.orderBookLogIntervalMs = Number.parseInt(process.env.ORDER_BOOK_LOG_INTERVAL_MS || '5000', 10) || 5000;
    this.setupWriteBuffer();

    logger.info('Market Ingester initialized', {
      mode: this.isPaperTrading ? 'PAPER TRADING' : 'LIVE',
      url: this.hyperliquidUrl
    });
  }

  private initializeDatabase(): void {
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

      CREATE INDEX IF NOT EXISTS idx_market_symbol ON market_data(symbol);
      CREATE INDEX IF NOT EXISTS idx_market_timestamp ON market_data(timestamp);
    `);

    logger.info('Database tables created for market data');
  }

  private prepareStatements(): void {
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
  }

  private setupWriteBuffer(): void {
    if (this.writeFlushTimer) return;
    this.writeFlushTimer = setInterval(() => this.flushWriteBuffers(), this.writeFlushIntervalMs);
  }

  private maybeFlush(): void {
    const queued = this.marketDataQueue.length
      + this.orderBookQueue.length
      + this.tradeQueue.length
      + this.fundingQueue.length;
    if (queued >= this.writeBatchSize) {
      this.flushWriteBuffers();
    }
  }

  private flushWriteBuffers(): void {
    if (this.isFlushing) return;
    if (!this.marketDataStmt || !this.orderBookStmt || !this.tradeStmt || !this.fundingStmt) return;
    if (
      this.marketDataQueue.length === 0 &&
      this.orderBookQueue.length === 0 &&
      this.tradeQueue.length === 0 &&
      this.fundingQueue.length === 0
    ) {
      return;
    }

    this.isFlushing = true;
    const marketDataBatch = this.marketDataQueue.splice(0);
    const orderBookBatch = this.orderBookQueue.splice(0);
    const tradeBatch = this.tradeQueue.splice(0);
    const fundingBatch = this.fundingQueue.splice(0);

    const run = this.db.transaction(() => {
      for (const data of marketDataBatch) {
        this.marketDataStmt!.run(
          data.symbol,
          data.timestamp.toISOString(),
          data.open,
          data.high,
          data.low,
          data.close,
          data.volume,
          data.vwap,
          data.bid || 0,
          data.ask || 0,
          data.bidSize || 0,
          data.askSize || 0
        );
      }

      for (const snapshot of orderBookBatch) {
        this.orderBookStmt!.run(
          snapshot.symbol,
          snapshot.timestampSec,
          JSON.stringify(snapshot.bids),
          JSON.stringify(snapshot.asks),
          snapshot.midPrice,
          snapshot.spread
        );
      }

      for (const trade of tradeBatch) {
        this.tradeStmt!.run(
          trade.timestampSec,
          trade.price,
          trade.size,
          trade.side,
          trade.symbol
        );
      }

      for (const funding of fundingBatch) {
        this.fundingStmt!.run(
          funding.symbol,
          funding.timestampSec,
          funding.fundingRate,
          funding.nextFundingTimeSec
        );
      }
    });

    try {
      run();
    } catch (error) {
      logger.error('[MarketIngester] Failed to flush write buffers:', error);
    } finally {
      this.isFlushing = false;
    }
  }

  async start(): Promise<void> {
    try {
      await this.connectWebSocket();
      this.startCandleFlushTimer();
      if (!this.primaryTimeframe.endsWith('s')) {
        await this.startPolling();
      }
    } catch (error) {
      logger.error('Failed to start market ingester:', error);
      throw error;
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const WebSocket = require('ws');
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          logger.info('WebSocket connected to Hyperliquid');
          this.subscribeToData();
          resolve();
        });

        this.ws.on('error', (err: Error) => {
          logger.warn('WebSocket error:', err);
          reject(err);
        });

        this.ws.on('close', () => {
          logger.warn('WebSocket closed, reconnecting in 30s...');
          setTimeout(() => this.connectWebSocket(), 30000);
        });

        this.ws.on('message', (data: string) => {
          this.handleWebSocketMessage(data);
        });

      } catch (error) {
        logger.error('Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  private subscribeToData(): void {
    if (!this.ws) return;

    const subscriptions: Array<{ method: string; subscription: { type: string; coin?: string } }> = [
      { method: 'subscribe', subscription: { type: 'allMids' } },
      ...this.tradingSymbols.map(symbol => ({
        method: 'subscribe',
        subscription: { type: 'l2Book', coin: symbol }
      })),
      ...this.tradingSymbols.map(symbol => ({
        method: 'subscribe',
        subscription: { type: 'trades', coin: symbol }
      })),
      ...this.tradingSymbols.map(symbol => ({
        method: 'subscribe',
        subscription: { type: 'funding', coin: symbol }
      }))
    ];

    for (const sub of subscriptions) {
      this.ws.send(JSON.stringify(sub));
      logger.info(`Subscribed to ${sub.subscription.type}${sub.subscription.coin ? ' for ' + sub.subscription.coin : ''}`);
    }
  }

  private handleWebSocketMessage(data: string): void {
    try {
      const parsed = JSON.parse(data);

      if (parsed.channel === 'allMids') {
        if (!parsed.data || !parsed.data.mids) {
          logger.warn('[ALLMIDS] No mids data in message');
          return;
        }

        const mids = parsed.data.mids as Record<string, string>;
        const symbolList = ['BTC', 'ETH', 'SOL'];

        for (const symbol of symbolList) {
          if (mids[symbol]) {
            const price = parseFloat(mids[symbol]);
            if (!isNaN(price)) {
              logger.info(`[ALLMIDS] ${symbol} price=${price}`);
            }
          }
        }
      }

      if (parsed.channel === 'l2Book') {
        this.handleOrderBook(parsed.data);
      }

      if (parsed.channel === 'trades') {
        this.handleTrades(parsed.data);
      }

      if (parsed.channel === 'funding') {
        this.handleFunding(parsed.data);
      }
    } catch (error) {
      logger.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleOrderBook(data: HyperliquidL2Book): void {
    if (!data.levels || !Array.isArray(data.levels) || data.levels.length < 2) {
      return;
    }

    const bids = data.levels[0] || [];
    const asks = data.levels[1] || [];
    
    if (bids.length === 0 || asks.length === 0) {
      return;
    }

    const midPrice = (parseFloat(bids[0].px) + parseFloat(asks[0].px)) / 2;
    const spread = parseFloat(asks[0].px) - parseFloat(bids[0].px);

    const snapshot: OrderBookSnapshot = {
      symbol: data.coin,
      timestamp: new Date(),
      bids: bids.slice(0, 10).map((l: any) => ({ price: parseFloat(l.px), size: parseFloat(l.sz) })),
      asks: asks.slice(0, 10).map((l: any) => ({ price: parseFloat(l.px), size: parseFloat(l.sz) })),
      midPrice,
      spread
    };

    this.saveOrderBook(snapshot);
    this.updateQuoteCandle(data.coin, midPrice);
    const now = Date.now();
    const lastLog = this.lastOrderBookLogAt.get(data.coin) || 0;
    if (now - lastLog >= this.orderBookLogIntervalMs) {
      logger.info(`[ORDER BOOK] ${data.coin} mid=${midPrice} spread=${spread.toFixed(4)}`);
      this.lastOrderBookLogAt.set(data.coin, now);
    }
  }

  private handleTrades(data: HyperliquidTrades | HyperliquidTrades['trades'] | unknown): void {
    try {
      const trades = Array.isArray(data)
        ? data
        : Array.isArray((data as HyperliquidTrades | null)?.trades)
          ? (data as HyperliquidTrades).trades
          : [];

      if (!Array.isArray(trades) || trades.length === 0) {
        return;
      }

      for (const tradeData of trades) {
        const rawTime = (tradeData as any).time ?? (tradeData as any).t ?? Date.now();
        const timestampMs = typeof rawTime === 'number' && rawTime < 1e12 ? rawTime * 1000 : rawTime;
        const trade: Trade = {
          timestamp: new Date(timestampMs),
          price: parseFloat(tradeData.px),
          size: parseFloat(tradeData.sz),
          side: tradeData.side === 'B' ? 'buy' : 'sell',
          symbol: tradeData.coin
        };

        this.saveTrade(trade);
        this.updateTradeCandle(trade);
      }
    } catch (error) {
      logger.warn('Skipping malformed trades message:', error);
    }
  }

  private handleFunding(data: HyperliquidFunding): void {
    const coins = Array.isArray(data.coin) ? data.coin : [data.coin];
    if (coins.length === 0) {
      return;
    }

    for (const coin of coins) {
      const funding: FundingRate = {
        symbol: coin,
        timestamp: new Date(),
        fundingRate: parseFloat(data.fundingRates[0]),
        nextFundingTime: new Date(parseInt(data.nextFundingTime))
      };

      this.saveFunding(funding);
    }
  }

  private async startPolling(): Promise<void> {
    logger.info('Starting REST API polling...');

    const pollMetaAndCandles = async () => {
      try {
        const metaResponse = await axios.post(`${this.hyperliquidUrl}/info`, {
          type: 'meta'
        });

        if (metaResponse.data && Array.isArray(metaResponse.data)) {
          const coins = ['BTC', 'ETH', 'SOL'];
          for (const coin of coins) {
            const market = metaResponse.data.find((m: any) => m.name === coin);
            if (market) {
              const candlesResponse = await axios.post(`${this.hyperliquidUrl}/info`, {
                type: 'candleSnapshot',
                req: {
                  coin: coin,
                  interval: '1m',
                  startTime: Math.floor((Date.now() - 3600000) / 1000),
                  endTime: Math.floor(Date.now() / 1000)
                }
              });

              if (candlesResponse.data && Array.isArray(candlesResponse.data)) {
                for (const candle of candlesResponse.data.slice(-1)) {
                  const marketData: MarketData = {
                    symbol: coin,
                    timestamp: new Date(candle.t * 1000),
                    open: parseFloat(candle.o),
                    high: parseFloat(candle.h),
                    low: parseFloat(candle.l),
                    close: parseFloat(candle.c),
                    volume: parseFloat(candle.n),
                    vwap: parseFloat(market.oraclePrice)
                  };

                  this.saveMarketData(marketData);
                }
              }
            }
          }
        }
      } catch (error) {
        logger.error('Failed to fetch market data:', error);
      }
    };

    pollMetaAndCandles();

    setInterval(() => {
      pollMetaAndCandles();
    }, 30000);
  }

  private saveMarketData(data: MarketData): void {
    this.marketDataQueue.push(data);
    this.maybeFlush();
  }

  private saveOrderBook(snapshot: OrderBookSnapshot): void {
    this.orderBookQueue.push({
      symbol: snapshot.symbol,
      timestampSec: Math.floor(snapshot.timestamp.getTime() / 1000),
      bids: snapshot.bids,
      asks: snapshot.asks,
      midPrice: snapshot.midPrice,
      spread: snapshot.spread
    });
    this.maybeFlush();
  }

  private saveTrade(trade: Trade): void {
    this.tradeQueue.push({
      timestampSec: Math.floor(trade.timestamp.getTime() / 1000),
      price: trade.price,
      size: trade.size,
      side: trade.side,
      symbol: trade.symbol
    });
    this.maybeFlush();
  }

  private saveFunding(funding: FundingRate): void {
    this.fundingQueue.push({
      symbol: funding.symbol,
      timestampSec: Math.floor(funding.timestamp.getTime() / 1000),
      fundingRate: funding.fundingRate,
      nextFundingTimeSec: Math.floor(funding.nextFundingTime.getTime() / 1000)
    });
    this.maybeFlush();
  }

  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close();
    }
    if (this.tradeCandleTimer) {
      clearInterval(this.tradeCandleTimer);
      this.tradeCandleTimer = null;
    }
    if (this.writeFlushTimer) {
      clearInterval(this.writeFlushTimer);
      this.writeFlushTimer = null;
    }
    this.flushWriteBuffers();
    logger.info('Market ingester stopped');
  }

  private updateTradeCandle(trade: Trade): void {
    const bucketStartMs = Math.floor(trade.timestamp.getTime() / 1000) * 1000;
    const key = trade.symbol;
    const existing = this.tradeCandles.get(key);

    if (!existing || bucketStartMs > existing.bucketStartMs) {
      if (existing) {
        this.flushTradeCandle(existing);
      }
      this.tradeCandles.set(key, {
        symbol: trade.symbol,
        bucketStartMs,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.size,
        notional: trade.price * trade.size
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

    // Validate updated candle
    const candleForValidation = {
      time: trade.timestamp,
      open: existing.open,
      high: existing.high,
      low: existing.low,
      close: existing.close,
      volume: existing.volume
    };

    if (!validateCandle(candleForValidation)) {
      logger.warn(`[MarketIngester] Invalid trade candle detected for ${trade.symbol}, skipping update`);
      return;
    }
  }

  private updateQuoteCandle(symbol: string, price: number): void {
    const bucketStartMs = Math.floor(Date.now() / 1000) * 1000;
    const existing = this.tradeCandles.get(symbol);

    if (!existing || bucketStartMs > existing.bucketStartMs) {
      if (existing) {
        this.flushTradeCandle(existing);
      }
      this.tradeCandles.set(symbol, {
        symbol,
        bucketStartMs,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        notional: 0
      });
      return;
    }

    if (bucketStartMs < existing.bucketStartMs) {
      return;
    }

    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
  }

  private flushTradeCandle(candle: {
    symbol: string;
    bucketStartMs: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    notional: number;
  }): void {
    const vwap = candle.volume > 0 ? candle.notional / candle.volume : candle.close;
    const marketData: MarketData = {
      symbol: candle.symbol,
      timestamp: new Date(candle.bucketStartMs),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      vwap
    };

    this.saveMarketData(marketData);
  }

  private startCandleFlushTimer(): void {
    if (this.tradeCandleTimer) return;
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
}

export default new MarketIngester();
