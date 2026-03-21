/**
 * Cleanup stale unpaired entries (>24h old with pnl=0)
 * These are entries that were filled but never got exit fills.
 * They pollute the DB and skew metrics.
 * 
 * Instead of deleting, we'll mark them as CANCELLED so we don't lose audit trail.
 */
const Database = require('better-sqlite3');
const db = new Database('/home/d/PerpsTrader/data/trading.db');

// Count before
const beforeCount = db.prepare(`
  SELECT COUNT(*) as cnt FROM trades 
  WHERE status='FILLED' AND entryExit='ENTRY' AND pnl=0 
  AND datetime(timestamp) < datetime('now', '-24 hours')
`).get();
console.log(`Stale entries (>24h, no exit): ${beforeCount.cnt}`);

// Also check entries older than 6h 
const older6h = db.prepare(`
  SELECT COUNT(*) as cnt FROM trades 
  WHERE status='FILLED' AND entryExit='ENTRY' AND pnl=0 
  AND datetime(timestamp) < datetime('now', '-6 hours')
`).get();
console.log(`Stale entries (>6h, no exit): ${older6h.cnt}`);

// Only clean entries older than 24h to avoid killing recent entries
// Mark as EXPIRED status
const result = db.prepare(`
  UPDATE trades SET status = 'EXPIRED'
  WHERE status = 'FILLED' AND entryExit = 'ENTRY' AND pnl = 0
  AND datetime(timestamp) < datetime('now', '-24 hours')
`).run();
console.log(`\nMarked ${result.changes} stale entries as EXPIRED`);

// Verify
const afterCount = db.prepare(`
  SELECT COUNT(*) as cnt FROM trades 
  WHERE status='FILLED' AND entryExit='ENTRY' AND pnl=0 
  AND datetime(timestamp) < datetime('now', '-24 hours')
`).get();
console.log(`Remaining stale entries (>24h): ${afterCount.cnt}`);

const totalFills = db.prepare("SELECT status, COUNT(*) as cnt FROM trades GROUP BY status").all();
console.log('\nTrade status distribution after cleanup:', JSON.stringify(totalFills));

db.close();
