import Database from 'better-sqlite3';
const db = new Database('/home/d/PerpsTrader/data/trading.db');

// Reactivate strategies that have actual live trades with positive PnL
// These are the ones the prediction-agent is actually using
const profitableLive = db.prepare(`
  SELECT strategyId, SUM(COALESCE(pnl,0)) as total_pnl, COUNT(*) as trade_count
  FROM trades 
  WHERE entryExit = 'EXIT' AND status = 'FILLED'
  GROUP BY strategyId 
  HAVING total_pnl > 0
  ORDER BY total_pnl DESC
`).all() as any[];

console.log('REACTIVATING PROFITABLE LIVE STRATEGIES:');
const reactivate = db.prepare("UPDATE strategies SET isActive = 1 WHERE id = ?");
let reactivated = 0;
profitableLive.forEach((s: any) => {
  const result = reactivate.run(s.strategyId);
  if (result.changes > 0) {
    reactivated++;
    console.log(`  ${s.strategyId.slice(0,12)} => PnL: $${s.total_pnl.toFixed(4)}, trades: ${s.trade_count}`);
  }
});

// Also reactivate strategies with trades but flat/neutral PnL (they're still in use)
const neutralLive = db.prepare(`
  SELECT strategyId, SUM(COALESCE(pnl,0)) as total_pnl, COUNT(*) as trade_count
  FROM trades 
  WHERE entryExit = 'EXIT' AND status = 'FILLED'
  GROUP BY strategyId 
  HAVING total_pnl = 0
`).all() as any[];

neutralLive.forEach((s: any) => {
  const result = reactivate.run(s.strategyId);
  if (result.changes > 0) {
    reactivated++;
    console.log(`  ${s.strategyId.slice(0,12)} => NEUTRAL, trades: ${s.trade_count}`);
  }
});

console.log(`\nTOTAL REACTIVATED: ${reactivated}`);

// Verify final state
const finalState = db.prepare(`
  SELECT COUNT(*) as total, 
         SUM(CASE WHEN isActive=1 THEN 1 ELSE 0 END) as active,
         SUM(CASE WHEN isActive=0 THEN 1 ELSE 0 END) as inactive
  FROM strategies
`).get() as any;
console.log(`FINAL STATE: ${finalState.total} total, ${finalState.active} active, ${finalState.inactive} inactive`);

// Show active strategies
const activeStrats = db.prepare("SELECT id, name, type, isActive FROM strategies WHERE isActive = 1").all() as any[];
console.log('\nACTIVE STRATEGIES:');
activeStrats.forEach((s: any) => console.log(`  ${(s.id as string).slice(0,12)} => ${s.name} (${s.type})`));

db.close();
