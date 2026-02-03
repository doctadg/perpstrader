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
dotenv.config();
class MarketIngester {
    db;
    hyperliquidUrl;
    wsUrl;
    tradingSymbols;
    primaryTimeframe;
    ws = null;
    isPaperTrading = true;
    tradeCandles = new Map();
    tradeCandleTimer = null;
    marketDataQueue = [];
    orderBookQueue = [];
    tradeQueue = [];
    fundingQueue = [];
    marketDataStmt = null;
    orderBookStmt = null;
    tradeStmt = null;
    fundingStmt = null;
    writeFlushTimer = null;
    writeFlushIntervalMs;
    writeBatchSize;
    isFlushing = false;
    orderBookLogIntervalMs;
    lastOrderBookLogAt = new Map();
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
        this.setupWriteBuffer();
        logger_1.default.info('Market Ingester initialized', {
            mode: this.isPaperTrading ? 'PAPER TRADING' : 'LIVE',
            url: this.hyperliquidUrl
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
        logger_1.default.info('Database tables created for market data');
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
            + this.fundingQueue.length;
        if (queued >= this.writeBatchSize) {
            this.flushWriteBuffers();
        }
    }
    flushWriteBuffers() {
        if (this.isFlushing)
            return;
        if (!this.marketDataStmt || !this.orderBookStmt || !this.tradeStmt || !this.fundingStmt)
            return;
        if (this.marketDataQueue.length === 0 &&
            this.orderBookQueue.length === 0 &&
            this.tradeQueue.length === 0 &&
            this.fundingQueue.length === 0) {
            return;
        }
        this.isFlushing = true;
        const marketDataBatch = this.marketDataQueue.splice(0);
        const orderBookBatch = this.orderBookQueue.splice(0);
        const tradeBatch = this.tradeQueue.splice(0);
        const fundingBatch = this.fundingQueue.splice(0);
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
        });
        try {
            run();
        }
        catch (error) {
            logger_1.default.error('[MarketIngester] Failed to flush write buffers:', error);
        }
        finally {
            this.isFlushing = false;
        }
    }
    async start() {
        try {
            await this.connectWebSocket();
            this.startCandleFlushTimer();
            if (!this.primaryTimeframe.endsWith('s')) {
                await this.startPolling();
            }
        }
        catch (error) {
            logger_1.default.error('Failed to start market ingester:', error);
            throw error;
        }
    }
    async connectWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                const WebSocket = require('ws');
                this.ws = new WebSocket(this.wsUrl);
                this.ws.on('open', () => {
                    logger_1.default.info('WebSocket connected to Hyperliquid');
                    this.subscribeToData();
                    resolve();
                });
                this.ws.on('error', (err) => {
                    logger_1.default.warn('WebSocket error:', err);
                    reject(err);
                });
                this.ws.on('close', () => {
                    logger_1.default.warn('WebSocket closed, reconnecting in 30s...');
                    setTimeout(() => this.connectWebSocket(), 30000);
                });
                this.ws.on('message', (data) => {
                    this.handleWebSocketMessage(data);
                });
            }
            catch (error) {
                logger_1.default.error('Failed to create WebSocket connection:', error);
                reject(error);
            }
        });
    }
    subscribeToData() {
        if (!this.ws)
            return;
        const subscriptions = [
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
            logger_1.default.info(`Subscribed to ${sub.subscription.type}${sub.subscription.coin ? ' for ' + sub.subscription.coin : ''}`);
        }
    }
    handleWebSocketMessage(data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed.channel === 'allMids') {
                if (!parsed.data || !parsed.data.mids) {
                    logger_1.default.warn('[ALLMIDS] No mids data in message');
                    return;
                }
                const mids = parsed.data.mids;
                const symbolList = ['BTC', 'ETH', 'SOL'];
                for (const symbol of symbolList) {
                    if (mids[symbol]) {
                        const price = parseFloat(mids[symbol]);
                        if (!isNaN(price)) {
                            logger_1.default.info(`[ALLMIDS] ${symbol} price=${price}`);
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
        }
        catch (error) {
            logger_1.default.error('Failed to parse WebSocket message:', error);
        }
    }
    handleOrderBook(data) {
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
        const snapshot = {
            symbol: data.coin,
            timestamp: new Date(),
            bids: bids.slice(0, 10).map((l) => ({ price: parseFloat(l.px), size: parseFloat(l.sz) })),
            asks: asks.slice(0, 10).map((l) => ({ price: parseFloat(l.px), size: parseFloat(l.sz) })),
            midPrice,
            spread
        };
        this.saveOrderBook(snapshot);
        this.updateQuoteCandle(data.coin, midPrice);
        const now = Date.now();
        const lastLog = this.lastOrderBookLogAt.get(data.coin) || 0;
        if (now - lastLog >= this.orderBookLogIntervalMs) {
            logger_1.default.info(`[ORDER BOOK] ${data.coin} mid=${midPrice} spread=${spread.toFixed(4)}`);
            this.lastOrderBookLogAt.set(data.coin, now);
        }
    }
    handleTrades(data) {
        try {
            const trades = Array.isArray(data)
                ? data
                : Array.isArray(data?.trades)
                    ? data.trades
                    : [];
            if (!Array.isArray(trades) || trades.length === 0) {
                return;
            }
            for (const tradeData of trades) {
                const rawTime = tradeData.time ?? tradeData.t ?? Date.now();
                const timestampMs = typeof rawTime === 'number' && rawTime < 1e12 ? rawTime * 1000 : rawTime;
                const trade = {
                    timestamp: new Date(timestampMs),
                    price: parseFloat(tradeData.px),
                    size: parseFloat(tradeData.sz),
                    side: tradeData.side === 'B' ? 'buy' : 'sell',
                    symbol: tradeData.coin
                };
                this.saveTrade(trade);
                this.updateTradeCandle(trade);
            }
        }
        catch (error) {
            logger_1.default.warn('Skipping malformed trades message:', error);
        }
    }
    handleFunding(data) {
        const coins = Array.isArray(data.coin) ? data.coin : [data.coin];
        if (coins.length === 0) {
            return;
        }
        for (const coin of coins) {
            const funding = {
                symbol: coin,
                timestamp: new Date(),
                fundingRate: parseFloat(data.fundingRates[0]),
                nextFundingTime: new Date(parseInt(data.nextFundingTime))
            };
            this.saveFunding(funding);
        }
    }
    async startPolling() {
        logger_1.default.info('Starting REST API polling...');
        const pollMetaAndCandles = async () => {
            try {
                const metaResponse = await axios_1.default.post(`${this.hyperliquidUrl}/info`, {
                    type: 'meta'
                });
                if (metaResponse.data && Array.isArray(metaResponse.data)) {
                    const coins = ['BTC', 'ETH', 'SOL'];
                    for (const coin of coins) {
                        const market = metaResponse.data.find((m) => m.name === coin);
                        if (market) {
                            const candlesResponse = await axios_1.default.post(`${this.hyperliquidUrl}/info`, {
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
                                    const marketData = {
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
            }
            catch (error) {
                logger_1.default.error('Failed to fetch market data:', error);
            }
        };
        pollMetaAndCandles();
        setInterval(() => {
            pollMetaAndCandles();
        }, 30000);
    }
    saveMarketData(data) {
        this.marketDataQueue.push(data);
        this.maybeFlush();
    }
    saveOrderBook(snapshot) {
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
    saveTrade(trade) {
        this.tradeQueue.push({
            timestampSec: Math.floor(trade.timestamp.getTime() / 1000),
            price: trade.price,
            size: trade.size,
            side: trade.side,
            symbol: trade.symbol
        });
        this.maybeFlush();
    }
    saveFunding(funding) {
        this.fundingQueue.push({
            symbol: funding.symbol,
            timestampSec: Math.floor(funding.timestamp.getTime() / 1000),
            fundingRate: funding.fundingRate,
            nextFundingTimeSec: Math.floor(funding.nextFundingTime.getTime() / 1000)
        });
        this.maybeFlush();
    }
    async stop() {
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
        logger_1.default.info('Market ingester stopped');
    }
    updateTradeCandle(trade) {
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
        if (!(0, data_validation_1.validateCandle)(candleForValidation)) {
            logger_1.default.warn(`[MarketIngester] Invalid trade candle detected for ${trade.symbol}, skipping update`);
            return;
        }
    }
    updateQuoteCandle(symbol, price) {
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
            vwap
        };
        this.saveMarketData(marketData);
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
}
exports.default = new MarketIngester();
//# sourceMappingURL=market-ingester.js.map