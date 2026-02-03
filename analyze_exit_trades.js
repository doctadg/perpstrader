const Database = require('better-sqlite3');
const db = new Database('./data/trading.db');

// Get all traces with EXIT execution results
console.log('=== EXIT TRADES WITH REALIZED PnL ===');
const traces = db.prepare(`
    SELECT id, created_at, symbol, trace_data
    FROM agent_traces
    WHERE trace_data LIKE '%entryExit%EXIT%'
    ORDER BY created_at DESC
    LIMIT 500
`).all();

let totalPnl = 0;
let totalFees = 0;
let wins = 0;
let losses = 0;
let exitCount = 0;
const pnlBySymbol = {};
const pnlByStrategy = {};
const profitableTrades = [];
const losingTrades = [];
const allTrades = [];

traces.forEach(t => {
    try {
        const data = JSON.parse(t.trace_data);
        const exec = data.executionResult;
        if (exec && exec.entryExit === 'EXIT') {
            exitCount++;
            const pnl = exec.pnl || 0;
            const fee = exec.fee || 0;
            const netPnl = pnl - fee;

            totalPnl += pnl;
            totalFees += fee;

            if (pnl > 0) wins++; else losses++;

            // Track by symbol
            if (!pnlBySymbol[t.symbol]) pnlBySymbol[t.symbol] = { count: 0, pnl: 0, fees: 0 };
            pnlBySymbol[t.symbol].count++;
            pnlBySymbol[t.symbol].pnl += pnl;
            pnlBySymbol[t.symbol].fees += fee;

            // Track by strategy
            const strat = data.selectedStrategy?.name || 'unknown';
            if (!pnlByStrategy[strat]) pnlByStrategy[strat] = { count: 0, pnl: 0, fees: 0 };
            pnlByStrategy[strat].count++;
            pnlByStrategy[strat].pnl += pnl;
            pnlByStrategy[strat].fees += fee;

            // Track trades
            if (pnl > 0) {
                profitableTrades.push({
                    time: t.created_at,
                    symbol: t.symbol,
                    pnl: pnl,
                    fee: fee,
                    net: netPnl,
                    strategy: strat,
                    price: exec.price,
                    direction: exec.direction
                });
            } else {
                losingTrades.push({
                    time: t.created_at,
                    symbol: t.symbol,
                    pnl: pnl,
                    fee: fee,
                    net: netPnl,
                    strategy: strat,
                    price: exec.price,
                    direction: exec.direction
                });
            }

            allTrades.push({
                time: t.created_at,
                symbol: t.symbol,
                pnl: pnl,
                fee: fee,
                net: netPnl,
                strategy: strat,
                price: exec.price,
                direction: exec.direction
            });
        }
    } catch (e) {
        // Skip invalid traces
    }
});

console.log('Total Exit Trades found: ' + exitCount);

if (exitCount > 0) {
    // Sort by date
    allTrades.sort((a,b) => new Date(a.time) - new Date(b.time));

    console.log('\n=== ALL EXIT TRADES (chronological) ===');
    allTrades.forEach(t => {
        const marker = t.pnl > 0 ? '[WIN]' : '[LOSS]';
        console.log(`${marker} ${t.time.substring(0, 19)} ${t.symbol} ${t.direction || ''} @ ${t.price} | PnL: $${t.pnl.toFixed(2)} Fee: $${t.fee.toFixed(2)} Net: $${t.net.toFixed(2)} | ${t.strategy}`);
    });

    console.log('\n=== SUMMARY ===');
    console.log(`Total PnL: $${totalPnl.toFixed(2)}`);
    console.log(`Total Fees: $${totalFees.toFixed(2)}`);
    console.log(`Net PnL: $${(totalPnl - totalFees).toFixed(2)}`);
    console.log(`Wins: ${wins} | Losses: ${losses}`);
    console.log(`Win Rate: ${((wins/exitCount)*100).toFixed(1)}%`);

    console.log('\n=== PnL BY SYMBOL ===');
    Object.entries(pnlBySymbol).sort((a,b) => (b[1].pnl - b[1].fees) - (a[1].pnl - a[1].fees)).forEach(([sym, s]) => {
        console.log(`${sym}: ${s.count} trades | Net: $${(s.pnl - s.fees).toFixed(2)}`);
    });

    console.log('\n=== PnL BY STRATEGY ===');
    Object.entries(pnlByStrategy).sort((a,b) => (b[1].pnl - b[1].fees) - (a[1].pnl - a[1].fees)).forEach(([strat, s]) => {
        console.log(`${strat}: ${s.count} trades | Net: $${(s.pnl - s.fees).toFixed(2)}`);
    });

    if (profitableTrades.length > 0) {
        console.log('\n=== TOP PROFITABLE TRADES ===');
        profitableTrades.sort((a,b) => b.net - a.net).slice(0, 20).forEach(t => {
            console.log(`${t.time.substring(0, 19)} ${t.symbol} +$${t.net.toFixed(2)} @ ${t.price} | ${t.strategy}`);
        });
    }

    if (losingTrades.length > 0) {
        console.log('\n=== WORST LOSING TRADES ===');
        losingTrades.sort((a,b) => a.net - b.net).slice(0, 10).forEach(t => {
            console.log(`${t.time.substring(0, 19)} ${t.symbol} $${t.net.toFixed(2)} @ ${t.price} | ${t.strategy}`);
        });
    }

    // Look for patterns in profitable trades
    console.log('\n=== PATTERNS IN PROFITABLE TRADES ===');
    profitableTrades.sort((a,b) => b.net - a.net);
    const byDirection = { LONG: 0, SHORT: 0, undefined: 0 };
    const byRegime = {};
    profitableTrades.forEach(t => {
        byDirection[t.direction || 'undefined']++;
        // Find regime for this trade
        const trace = traces.find(tr => {
            try {
                const d = JSON.parse(tr.trace_data);
                const exec = d.executionResult;
                return exec && exec.price === t.price && exec.pnl === t.pnl;
            } catch { return false; }
        });
        if (trace) {
            try {
                const d = JSON.parse(trace.trace_data);
                const regime = d.regime || 'unknown';
                byRegime[regime] = (byRegime[regime] || 0) + 1;
            } catch {}
        }
    });
    console.log('By Direction:', JSON.stringify(byDirection));
    console.log('By Regime:', JSON.stringify(byRegime));
} else {
    console.log('No EXIT trades found. Looking for any traces with non-zero PnL...');

    const anyPnl = db.prepare(`
        SELECT id, created_at, symbol, trace_data
        FROM agent_traces
        WHERE trace_data LIKE '%pnl%'
        ORDER BY created_at DESC
        LIMIT 50
    `).all();

    console.log('Traces with pnl field:', anyPnl.length);
}

db.close();
