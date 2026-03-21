import Database from 'better-sqlite3';
const db = new Database('./data/trading.db', { readonly: true });

// Actual live performance per strategy (from trades table)
const livePerf = db.prepare(`
  SELECT 
    strategyId,
    COUNT(*) as total_trades,
    SUM(CASE WHEN entryExit = 'EXIT' AND status = 'FILLED' THEN 1 ELSE 0 END) as exits,
    SUM(CASE WHEN entryExit = 'EXIT' AND status = 'FILLED' AND pnl > 0 THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN entryExit = 'EXIT' AND status = 'FILLED' AND pnl < 0 THEN 1 ELSE 0 END) as losses,
    SUM(CASE WHEN entryExit = 'EXIT' AND status = 'FILLED' THEN pnl ELSE 0 END) as total_pnl,
    SUM(CASE WHEN entryExit = 'EXIT' AND status = 'FILLED' THEN pnl ELSE 0 END) / 
      NULLIF(SUM(CASE WHEN entryExit = 'EXIT' AND status = 'FILLED' THEN 1 ELSE 0 END), 0) as avg_pnl,
    SUM(CASE WHEN entryExit = 'ENTRY' AND status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
  FROM trades 
  GROUP BY strategyId 
  ORDER BY total_pnl DESC
`).all();
console.log('LIVE PERFORMANCE BY STRATEGY:');
livePerf.forEach((s: any) => {
  const winRate = s.exits > 0 ? ((s.wins / s.exits) * 100).toFixed(1) : 'N/A';
  console.log(`  ${s.strategyId ? s.strategyId.slice(0,12) : 'NONE'} | trades:${s.total_trades} exits:${s.exits} wins:${s.wins} losses:${s.losses} cancel:${s.cancelled} | PnL: $${s.total_pnl?.toFixed(4) || '0'} | WR: ${winRate}%`);
});

// Active strategy names for mapping
console.log('\nACTIVE STRATEGY IDs:');
const actives = db.prepare("SELECT id, name FROM strategies WHERE isActive = 1").all();
actives.forEach((s: any) => console.log(`  ${s.id.slice(0,12)} => ${s.name}`));

// Recent exit PnL pattern (last 50 exits)
const recentExits = db.prepare(`
  SELECT pnl, symbol, timestamp FROM trades 
  WHERE entryExit = 'EXIT' AND status = 'FILLED' 
  ORDER BY timestamp DESC LIMIT 50
`).all();
let posCount = 0, negCount = 0, zeroCount = 0, totalPnl = 0;
recentExits.forEach((t: any) => {
  if (t.pnl > 0) posCount++;
  else if (t.pnl < 0) negCount++;
  else zeroCount++;
  totalPnl += t.pnl;
});
console.log(`\nLAST 50 EXITS: ${posCount} wins, ${negCount} losses, ${zeroCount} flat | PnL: $${totalPnl.toFixed(4)} | WR: ${((posCount/(posCount+negCount+zeroCount))*100).toFixed(1)}%`);

// Strategy generations table columns
const genCols = db.prepare("PRAGMA table_info(strategy_generations)").all();
console.log('\nSTRATEGY_GENERATIONS COLUMNS:', JSON.stringify(genCols.map((r: any) => r.name)));

// Check strategy_ideas
const ideaCols = db.prepare("PRAGMA table_info(strategy_ideas)").all();
console.log('\nSTRATEGY_IDEAS COLUMNS:', JSON.stringify(ideaCols.map((r: any) => r.name)));
const pendingIdeas = db.prepare("SELECT id, name, status FROM strategy_ideas WHERE status = 'PENDING'").all();
console.log('PENDING IDEAS:', JSON.stringify(pendingIdeas));

db.close();
