const Database = require('better-sqlite3');
const db = new Database('/home/d/PerpsTrader/data/trading.db');

// Exit trade statistics
const stats = db.prepare(`
  SELECT COUNT(*) as total_exits, 
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins, 
    SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses, 
    SUM(CASE WHEN pnl = 0 THEN 1 ELSE 0 END) as flat,
    ROUND(SUM(pnl),6) as total_pnl, 
    ROUND(AVG(pnl),6) as avg_pnl 
  FROM trades WHERE status='FILLED' AND entryExit='EXIT'
`).get();
console.log('EXIT TRADE STATS:', JSON.stringify(stats));

// Best performing symbols
const bySymbol = db.prepare(`
  SELECT symbol, side, COUNT(*) as trades, 
    ROUND(SUM(pnl),4) as total_pnl, 
    ROUND(AVG(pnl),4) as avg_pnl
  FROM trades WHERE status='FILLED' AND entryExit='EXIT'
  GROUP BY symbol, side HAVING trades >= 2
  ORDER BY total_pnl DESC
`).all();
console.log('\nTOP SYMBOL/SIDE COMBOS:', JSON.stringify(bySymbol.slice(0, 10), null, 2));

// Active strategy parameters (sample)
const active = db.prepare(`
  SELECT name, type, parameters, riskParameters 
  FROM strategies WHERE isActive=1 
  ORDER BY createdAt DESC LIMIT 3
`).all();
console.log('\nSAMPLE ACTIVE STRATEGIES:', JSON.stringify(active, null, 2));

// Stale entries (entries >24h old with no exit)
const stale = db.prepare(`
  SELECT COUNT(*) as cnt FROM trades 
  WHERE status='FILLED' AND entryExit='ENTRY' AND pnl=0 
  AND datetime(timestamp) < datetime('now', '-24 hours')
`).get();
console.log('\nSTALE ENTRIES (>24h, no exit):', stale.cnt);

// Recent entries (<24h old, no exit yet - these may still be working)
const recent = db.prepare(`
  SELECT COUNT(*) as cnt FROM trades 
  WHERE status='FILLED' AND entryExit='ENTRY' AND pnl=0 
  AND datetime(timestamp) >= datetime('now', '-24 hours')
`).get();
console.log('RECENT OPEN ENTRIES (<24h):', recent.cnt);

db.close();
