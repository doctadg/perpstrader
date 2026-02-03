const Database = require('better-sqlite3');
const db = new Database('./data/trading.db');

// Get traces with backtest data
const traces = db.prepare(`
    SELECT id, created_at, symbol, trace_data
    FROM agent_traces
    ORDER BY created_at DESC
    LIMIT 20
`).all();

console.log('\n=== BACKTEST & STRATEGY ANALYSIS ===\n');

traces.forEach((t, i) => {
    const data = JSON.parse(t.trace_data);
    console.log(`\n[${i+1}] ${t.created_at} - ${t.symbol}`);
    
    if (data.selectedStrategy) {
        console.log(`\n  Selected Strategy: ${data.selectedStrategy.name}`);
        if (data.selectedStrategy.parameters) {
            console.log(`  Parameters:`);
            Object.entries(data.selectedStrategy.parameters).forEach(([k,v]) => {
                console.log(`    ${k}: ${v}`);
            });
        }
    }
    
    if (data.backtestResults && data.backtestResults.length > 0) {
        console.log(`\n  Backtest Results (${data.backtestResults.length} strategies):`);
        data.backtestResults.slice(0, 3).forEach((bt, j) => {
            console.log(`    ${j+1}. ${bt.strategyName}:`);
            console.log(`       Sharpe: ${bt.sharpeRatio?.toFixed(2) || 'N/A'}`);
            console.log(`       Return: ${bt.totalReturn?.toFixed(2) || 'N/A'}%`);
            console.log(`       WinRate: ${bt.winRate?.toFixed(1) || 'N/A'}%`);
            console.log(`       Trades: ${bt.totalTrades || 'N/A'}`);
        });
    }
    
    if (data.signal) {
        console.log(`\n  Signal Generated:`);
        console.log(`    Direction: ${data.signal.direction}`);
        console.log(`    Price: ${data.signal.price}`);
        console.log(`    Confidence: ${data.signal.confidence}`);
        console.log(`    Reasoning: ${data.signal.reasoning}`);
        console.log(`    Approved: ${data.signal.approved}`);
    }
    
    if (data.indicators) {
        const indKeys = Object.keys(data.indicators);
        console.log(`\n  Indicators (showing first 5):`);
        indKeys.slice(0, 5).forEach(k => {
            const val = data.indicators[k];
            if (typeof val === 'object' && val !== null) {
                console.log(`    ${k}: ${JSON.stringify(val).substring(0, 50)}...`);
            } else {
                console.log(`    ${k}: ${val}`);
            }
        });
    }
    
    if (data.similarPatternsCount !== undefined) {
        console.log(`\n  Similar Patterns Found: ${data.similarPatternsCount}`);
    }
});

console.log('\n\n=== RSI INDICATOR VALUES ANALYSIS ===\n');

// Extract RSI values
const rsiValues = [];
traces.forEach(t => {
    const data = JSON.parse(t.trace_data);
    if (data.indicators && data.indicators.rsi) {
        const rsi = data.indicators.rsi;
        const rsiValue = Array.isArray(rsi) ? rsi[rsi.length - 1] : rsi;
        if (typeof rsiValue === 'number') {
            rsiValues.push({ symbol: t.symbol, rsi: rsiValue, time: t.created_at });
        }
    }
});

console.log(`RSI Values from recent traces:`);
rsiValues.slice(0, 15).forEach(v => {
    console.log(`  ${v.time.substring(11,19)} ${v.symbol}: RSI = ${v.rsi.toFixed(2)}`);
});

// Analyze RSI distribution
if (rsiValues.length > 0) {
    const avgRsi = rsiValues.reduce((sum, v) => sum + v.rsi, 0) / rsiValues.length;
    const minRsi = Math.min(...rsiValues.map(v => v.rsi));
    const maxRsi = Math.max(...rsiValues.map(v => v.rsi));
    
    const inOversold = rsiValues.filter(v => v.rsi < 30).length;
    const inOverbought = rsiValues.filter(v => v.rsi > 70).length;
    const inNeutral = rsiValues.length - inOversold - inOverbought;
    
    console.log(`\nRSI Distribution:`);
    console.log(`  Average: ${avgRsi.toFixed(2)}`);
    console.log(`  Range: ${minRsi.toFixed(2)} - ${maxRsi.toFixed(2)}`);
    console.log(`  Oversold (<30): ${inOversold} (${((inOversold/rsiValues.length)*100).toFixed(1)}%)`);
    console.log(`  Overbought (>70): ${inOverbought} (${((inOverbought/rsiValues.length)*100).toFixed(1)}%)`);
    console.log(`  Neutral (30-70): ${inNeutral} (${((inNeutral/rsiValues.length)*100).toFixed(1)}%)`);
}

db.close();
