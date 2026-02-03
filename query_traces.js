const Database = require('better-sqlite3');
const db = new Database('./data/trading.db');

// Get the last 200 traces
const traces = db.prepare(`
    SELECT id, created_at, symbol, timeframe, regime, trade_executed, success, analyzed
    FROM agent_traces
    ORDER BY created_at DESC
    LIMIT 200
`).all();

console.log(`\n=== LAST 200 TRACES SUMMARY ===\n`);
console.log(`Total traces retrieved: ${traces.length}`);
console.log(`Date range: ${traces[traces.length-1]?.created_at} to ${traces[0]?.created_at}\n`);

// Basic stats
let tradesExecuted = 0;
let successful = 0;
let analyzed = 0;
const bySymbol = {};
const byRegime = {};

traces.forEach(t => {
    if (t.trade_executed) tradesExecuted++;
    if (t.success) successful++;
    if (t.analyzed) analyzed++;
    
    bySymbol[t.symbol] = (bySymbol[t.symbol] || 0) + 1;
    byRegime[t.regime || 'NULL'] = (byRegime[t.regime || 'NULL'] || 0) + 1;
});

console.log('=== BASIC STATS ===');
console.log(`Trades executed: ${tradesExecuted} (${((tradesExecuted/traces.length)*100).toFixed(1)}%)`);
console.log(`Successful trades: ${successful} (${tradesExecuted > 0 ? ((successful/tradesExecuted)*100).toFixed(1) : 0}%)`);
console.log(`Analyzed traces: ${analyzed} (${((analyzed/traces.length)*100).toFixed(1)}%)\n`);

console.log('=== BY SYMBOL ===');
Object.entries(bySymbol).sort((a,b) => b[1] - a[1]).forEach(([sym, count]) => {
    console.log(`  ${sym}: ${count} traces`);
});

console.log('\n=== BY REGIME ===');
Object.entries(byRegime).sort((a,b) => b[1] - a[1]).forEach(([reg, count]) => {
    console.log(`  ${reg}: ${count} traces`);
});

// Get detailed data for last 10 traces
console.log('\n=== LAST 10 DETAILED TRACES ===');
traces.slice(0, 10).forEach((t, i) => {
    console.log(`\n${i+1}. ID: ${t.id}`);
    console.log(`   Created: ${t.created_at}`);
    console.log(`   Symbol: ${t.symbol} | Timeframe: ${t.timeframe}`);
    console.log(`   Regime: ${t.regime || 'NULL'}`);
    console.log(`   Trade Executed: ${t.trade_executed ? 'YES' : 'NO'}`);
    console.log(`   Success: ${t.success ? 'YES' : 'NO'}`);
    console.log(`   Analyzed: ${t.analyzed ? 'YES' : 'NO'}`);
    
    // Get trace_data for recent traces
    const data = db.prepare('SELECT trace_data FROM agent_traces WHERE id = ?').get(t.id);
    if (data) {
        const traceData = JSON.parse(data.trace_data);
        console.log(`   Thoughts: ${traceData.thoughts?.slice(-2).join('; ') || 'none'}`);
        console.log(`   Strategy: ${traceData.selectedStrategy?.name || 'none'}`);
        if (traceData.executionResult) {
            console.log(`   PnL: ${traceData.executionResult.pnl || 'N/A'} | Fee: ${traceData.executionResult.fee || 'N/A'}`);
        }
    }
});

// Get error patterns
console.log('\n=== RECENT ERRORS FROM TRACE DATA ===');
traces.slice(0, 20).forEach(t => {
    const data = db.prepare('SELECT trace_data FROM agent_traces WHERE id = ?').get(t.id);
    if (data) {
        const traceData = JSON.parse(data.trace_data);
        if (traceData.errors && traceData.errors.length > 0) {
            console.log(`\n[${t.created_at}] ${t.symbol}:`);
            traceData.errors.forEach(e => console.log(`  - ${e}`));
        }
    }
});

db.close();
