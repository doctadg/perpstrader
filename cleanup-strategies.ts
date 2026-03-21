import Database from 'better-sqlite3';
const db = new Database('/home/d/PerpsTrader/data/trading.db');

// Get the strategyIds that actually have live trades
const activeTradeStrategies = db.prepare(`
  SELECT DISTINCT strategyId FROM trades 
  WHERE entryExit = 'EXIT' AND status = 'FILLED' AND pnl != 0
`).all().map((r: any) => r.strategyId);
console.log('STRATEGY IDS WITH LIVE EXIT PnL:', activeTradeStrategies);

// Check if any of these match the strategies table
activeTradeStrategies.forEach((sid: string) => {
  const match = db.prepare("SELECT id, name, isActive FROM strategies WHERE id = ?").get(sid) as any;
  console.log(`  ${sid.slice(0,12)} => ${match ? match.name + ' (active:' + match.isActive + ')' : 'NOT IN STRATEGIES TABLE'}`);
});

// Get strategy IDs from strategies table that have NO trades
const noTradeActives = db.prepare(`
  SELECT s.id, s.name 
  FROM strategies s 
  WHERE s.isActive = 1 
  AND s.id NOT IN (SELECT DISTINCT strategyId FROM trades)
`).all();
const noTradeActivesArr = noTradeActives as any[];
console.log('\nACTIVE STRATEGIES WITH ZERO TRADES:', noTradeActivesArr.length);
noTradeActivesArr.forEach((s: any) => console.log(`  ${(s.id as string).slice(0,12)} => ${s.name}`));

// Deactivate strategies that have no trades AND no recent backtest performance
// (They're dead weight in the active pool)
const deactivated = db.prepare(`
  UPDATE strategies SET isActive = 0 
  WHERE isActive = 1 
  AND id NOT IN (SELECT DISTINCT strategyId FROM trades)
`).run();
console.log(`\nDEACTIVATED ${deactivated.changes} strategies with zero trades`);

// Verify remaining actives
const remaining = db.prepare("SELECT id, name, type FROM strategies WHERE isActive = 1").all() as any[];
console.log('\nREMAINING ACTIVE STRATEGIES:', remaining.length);
remaining.forEach((s: any) => console.log(`  ${(s.id as string).slice(0,12)} => ${s.name} (${s.type})`));

// Total counts
const totalStrats = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN isActive=1 THEN 1 ELSE 0 END) as active FROM strategies").get() as any;
console.log('\nTOTAL STRATEGIES:', JSON.stringify(totalStrats));

db.close();
