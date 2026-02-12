// Simplified WebSocket Candle Service
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';
const DB_PATH = './data/trading.db';

// Timeframes in ms
const TIMEFRAMES = {
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '1h': 3600000,
  '4h': 14400000,
  '1d': 86400000
};

// Candle builders
const builders = new Map();

// Connect to DB
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS candles (
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    open REAL NOT NULL,
    high REAL NOT NULL,
    low REAL NOT NULL,
    close REAL NOT NULL,
    volume REAL NOT NULL,
    PRIMARY KEY (symbol, timeframe, timestamp)
  );
  CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(symbol, timeframe, timestamp DESC);
`);

// Active symbols - top 20 by volume
const symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE', 'PEPE', 'WIF',
                 'JUP', 'RAY', 'BONK', 'WLD', 'FET', 'RENDER', 'TAO', 'LTC', 'UNI', 'AAVE'];

console.log('[Candles] Starting WebSocket candle service...');
console.log(`[Candles] Tracking ${symbols.length} symbols`);

const ws = new WebSocket(HL_WS_URL);

ws.on('open', () => {
  console.log('[Candles] Connected to Hyperliquid');
  
  // Subscribe to trades for each symbol individually
  for (const symbol of symbols) {
    ws.send(JSON.stringify({
      method: 'subscribe',
      subscription: {
        type: 'trades',
        coin: symbol
      }
    }));
  }
  
  console.log(`[Candles] Subscribed to trades for ${symbols.length} symbols`);
  
  // Send ping every 30s to keep alive
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ method: 'ping' }));
    }
  }, 30000);
});

ws.on('message', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    
    if (msg.channel === 'trades' && Array.isArray(msg.data)) {
      console.log(`[Candles] Received ${msg.data.length} trades`);
      for (const trade of msg.data) {
        processTrade(trade);
      }
    }
  } catch (e) {
    console.error('[Candles] Parse error:', e.message);
  }
});

function processTrade(trade) {
  const symbol = trade.coin;
  const price = parseFloat(trade.px);
  const size = parseFloat(trade.sz);
  const timestamp = trade.time;
  
  // Build candles for each timeframe
  for (const [tfName, tfMs] of Object.entries(TIMEFRAMES)) {
    const key = `${symbol}:${tfName}`;
    const candleStart = Math.floor(timestamp / tfMs) * tfMs;
    
    let candle = builders.get(key);
    
    if (!candle || candle.timestamp !== candleStart) {
      // Save old candle if exists
      if (candle) {
        saveCandle(candle);
      }
      
      // Create new candle
      candle = {
        symbol,
        timeframe: tfName,
        timestamp: candleStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: size
      };
      builders.set(key, candle);
    } else {
      // Update existing
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += size;
    }
  }
}

function saveCandle(candle) {
  try {
    db.prepare(`
      INSERT OR REPLACE INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(candle.symbol, candle.timeframe, candle.timestamp, candle.open, 
           candle.high, candle.low, candle.close, candle.volume);
  } catch (e) {
    console.error('[Candles] Save error:', e.message);
  }
}

// Flush candles periodically
setInterval(() => {
  const now = Date.now();
  let flushed = 0;
  
  for (const [key, candle] of builders) {
    const tfMs = TIMEFRAMES[candle.timeframe];
    if (now >= candle.timestamp + tfMs) {
      saveCandle(candle);
      flushed++;
    }
  }
  
  if (flushed > 0) {
    console.log(`[Candles] Flushed ${flushed} candles`);
  }
}, 10000);

// Log stats every minute
setInterval(() => {
  const row = db.prepare("SELECT COUNT(*) as count FROM candles WHERE timestamp > ?")
    .get(Date.now() - 60000);
  console.log(`[Candles] ${row.count} candles in last minute, ${builders.size} active`);
}, 60000);

ws.on('error', (err) => {
  console.error('[Candles] WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('[Candles] Disconnected, reconnecting in 5s...');
  setTimeout(() => {
    console.log('[Candles] Exiting to allow restart...');
    process.exit(1);
  }, 5000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Candles] Shutting down...');
  for (const candle of builders.values()) saveCandle(candle);
  ws.close();
  process.exit(0);
});
