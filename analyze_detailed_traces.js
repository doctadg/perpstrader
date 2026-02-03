const Database = require('better-sqlite3');
const db = new Database('./data/trading.db');

// Get the last 50 traces with full trace_data
const traces = db.prepare(`
    SELECT id, created_at, symbol, trace_data, trade_executed, success
    FROM agent_traces
    ORDER BY created_at DESC
    LIMIT 50
`).all();

console.log('\n=== DETAILED TRACE ANALYSIS ===\n');

const strategyStats = {};
const signalStats = { generated: 0, approved: 0, executed: 0 };
const riskAssessmentStats = {};
let totalPnl = 0;
let totalFees = 0;

traces.forEach((t, i) => {
    const data = JSON.parse(t.trace_data);
    
    // Track strategies
    if (data.selectedStrategy) {
        const strat = data.selectedStrategy.name;
        if (!strategyStats[strat]) strategyStats[strat] = { count: 0, trades: 0 };
        strategyStats[strat].count++;
        if (t.trade_executed) strategyStats[strat].trades++;
    }
    
    // Track signals
    if (data.signal) {
        signalStats.generated++;
        if (data.signal.approved) signalStats.approved++;
        if (t.trade_executed) signalStats.executed++;
    }
    
    // Track risk assessments
    if (data.riskAssessment) {
        const risk = data.riskAssessment.approved ? 'APPROVED' : 'REJECTED';
        riskAssessmentStats[risk] = (riskAssessmentStats[risk] || 0) + 1;
    }
    
    // Track PnL
    if (data.executionResult) {
        const pnl = typeof data.executionResult.pnl === 'number' ? data.executionResult.pnl : 0;
        const fee = typeof data.executionResult.fee === 'number' ? data.executionResult.fee : 0;
        totalPnl += pnl;
        totalFees += fee;
    }
    
    // Show first 5 in detail
    if (i < 5) {
        console.log(`\n[${i+1}] ${t.created_at} - ${t.symbol}`);
        console.log(`  Regime: ${data.regime || 'NULL'}`);
        console.log(`  Strategy: ${data.selectedStrategy?.name || 'none'}`);
        console.log(`  Signal: ${data.signal ? `${data.signal.direction} @ ${data.signal.price}` : 'none'}`);
        console.log(`  Signal Approved: ${data.signal?.approved ? 'YES' : 'NO'}`);
        console.log(`  Risk Assessment: ${data.riskAssessment ? `${data.riskAssessment.riskLevel} (${data.riskAssessment.approved ? 'APPROVED' : 'REJECTED'})` : 'none'}`);
        console.log(`  Trade Executed: ${t.trade_executed ? 'YES' : 'NO'}`);
        console.log(`  Execution: ${data.executionResult ? `${data.executionResult.entryExit} @ ${data.executionResult.price}` : 'none'}`);
        if (data.executionResult?.pnl !== undefined) {
            console.log(`  PnL: ${data.executionResult.pnl} | Fee: ${data.executionResult.fee}`);
        }
        console.log(`  Thoughts count: ${data.thoughts?.length || 0}`);
        if (data.thoughts && data.thoughts.length > 0) {
            console.log(`  Latest thought: ${data.thoughts[data.thoughts.length - 1]}`);
        }
        if (data.errors && data.errors.length > 0) {
            console.log(`  Errors: ${data.errors.join(', ')}`);
        }
    }
});

console.log('\n=== STRATEGY STATS ===');
Object.entries(strategyStats).forEach(([strat, stats]) => {
    console.log(`  ${strat}: ${stats.count} traces, ${stats.trades} trades (${((stats.trades/stats.count)*100).toFixed(1)}%)`);
});

console.log('\n=== SIGNAL STATS ===');
console.log(`  Signals Generated: ${signalStats.generated}`);
console.log(`  Signals Approved: ${signalStats.approved} (${signalStats.generated > 0 ? ((signalStats.approved/signalStats.generated)*100).toFixed(1) : 0}%)`);
console.log(`  Signals Executed: ${signalStats.executed}`);

console.log('\n=== RISK ASSESSMENT STATS ===');
Object.entries(riskAssessmentStats).forEach(([risk, count]) => {
    console.log(`  ${risk}: ${count}`);
});

console.log('\n=== FINANCIALS ===');
console.log(`  Total PnL: ${totalPnl.toFixed(2)}`);
console.log(`  Total Fees: ${totalFees.toFixed(2)}`);
console.log(`  Net PnL: ${(totalPnl - totalFees).toFixed(2)}`);

// Look for patterns in thoughts
console.log('\n=== COMMON THOUGHT PATTERNS ===');
const thoughtsMap = {};
traces.forEach(t => {
    const data = JSON.parse(t.trace_data);
    data.thoughts?.forEach(thought => {
        // Extract key phrases
        const phrases = [
            thought.includes('No actionable') ? 'No actionable signal' : null,
            thought.includes('risk') ? 'Risk assessment' : null,
            thought.includes('Sharpe') ? 'Sharpe ratio mentioned' : null,
            thought.includes('WinRate') ? 'WinRate mentioned' : null,
            thought.includes('Pattern') ? 'Pattern mentioned' : null,
            thought.includes('regime') ? 'Regime mentioned' : null
        ].filter(p => p);
        phrases.forEach(p => thoughtsMap[p] = (thoughtsMap[p] || 0) + 1);
    });
});

Object.entries(thoughtsMap)
    .sort((a,b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([phrase, count]) => console.log(`  ${phrase}: ${count}`));

db.close();
