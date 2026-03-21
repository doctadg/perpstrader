/**
 * Hermes Training Cycle - Backtest Runner (conservative)
 * Loads pending ideas, runs enhanced backtests, stores results.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = '/home/d/PerpsTrader/data/trading.db';
const db = new Database(DB_PATH);

async function main() {
  const ideas = db.prepare(`
    SELECT * FROM strategy_ideas WHERE status = 'PENDING' ORDER BY confidence DESC LIMIT 5
  `).all();
  
  console.log(`Found ${ideas.length} pending ideas to backtest`);

  if (ideas.length === 0) {
    console.log('No pending ideas. Exiting.');
    db.close();
    return;
  }

  const { BacktestEngine } = require(path.join('/home/d/PerpsTrader', 'src/backtest/enhanced-backtest'));

  // Load market data
  const marketDataRows = db.prepare(`
    SELECT symbol, timestamp, open, high, low, close, volume 
    FROM market_data 
    WHERE timestamp >= datetime('now', '-30 days')
    ORDER BY symbol, timestamp
  `).all();
  
  const candlesBySymbol = {};
  for (const row of marketDataRows) {
    if (!candlesBySymbol[row.symbol]) candlesBySymbol[row.symbol] = [];
    candlesBySymbol[row.symbol].push({
      symbol: row.symbol,
      timestamp: new Date(row.timestamp).getTime(),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume
    });
  }
  
  console.log(`Loaded candles for ${Object.keys(candlesBySymbol).length} symbols`);

  const results = [];
  
  for (const idea of ideas) {
    const params = JSON.parse(idea.parameters);
    const riskParams = JSON.parse(idea.risk_parameters);
    const symbols = JSON.parse(idea.symbols);
    
    const availableSymbols = symbols.filter(s => candlesBySymbol[s] && candlesBySymbol[s].length > 100);
    if (availableSymbols.length === 0) {
      console.log(`SKIP ${idea.name}: no data for ${symbols.join(',')}`);
      continue;
    }

    const strategy = {
      id: idea.id,
      name: idea.name,
      type: idea.type,
      symbols: availableSymbols,
      timeframe: idea.timeframe,
      parameters: params,
      entryConditions: JSON.parse(idea.entry_conditions),
      exitConditions: JSON.parse(idea.exit_conditions),
      riskParameters: riskParams,
    };

    const allCandles = availableSymbols.flatMap(s => candlesBySymbol[s] || []);
    if (allCandles.length < 200) {
      console.log(`SKIP ${idea.name}: only ${allCandles.length} candles`);
      continue;
    }

    console.log(`\n=== ${idea.name} (${availableSymbols.join(',')}, ${allCandles.length} candles) ===`);

    try {
      const engine = new BacktestEngine({
        initialCapital: 10000,
        fillModel: 'STANDARD',
        commissionRate: 0.0005,
        slippageBps: 5,
        latencyMs: 50,
        randomSeed: 42,
      });

      const result = await engine.runBacktest(strategy, allCandles);
      
      const ret = result.totalReturn || 0;
      const sharpe = result.sharpeRatio || 0;
      const wr = result.winRate || 0;
      const dd = result.maxDrawdown || 0;
      const trades = result.totalTrades || 0;
      
      console.log(`  Return=${ret.toFixed(2)}% Sharpe=${sharpe.toFixed(2)} WR=${wr.toFixed(1)}% DD=${dd.toFixed(2)}% Trades=${trades}`);
      
      const btId = `bt-${Date.now()}-${idea.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0,30)}`;
      db.prepare(`
        INSERT INTO backtest_results (id, strategyId, periodStart, periodEnd, initialCapital, finalCapital, totalReturn, annualizedReturn, sharpeRatio, maxDrawdown, winRate, totalTrades, trades, metrics, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        btId, idea.id, 
        new Date(allCandles[0].timestamp).toISOString(),
        new Date(allCandles[allCandles.length-1].timestamp).toISOString(),
        10000, result.finalCapital || 10000, ret,
        result.annualizedReturn || 0, sharpe, dd, wr, trades,
        JSON.stringify(result.trades || []),
        JSON.stringify({ avgPnl: result.avgPnl, profitFactor: result.profitFactor }),
        new Date().toISOString()
      );

      db.prepare("UPDATE strategy_ideas SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), idea.id);
      
      const passGate = sharpe > 0.5 && wr > 45 && dd < 20;
      results.push({ name: idea.name, return: ret, sharpe, winRate: wr, maxDD: dd, trades, passGate });
      
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      db.prepare("UPDATE strategy_ideas SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), idea.id);
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    const status = r.passGate ? 'PASS' : 'FAIL';
    console.log(`${status}: ${r.name} (R=${r.return.toFixed(1)}% S=${r.sharpe.toFixed(2)} WR=${r.winRate.toFixed(1)}% DD=${r.maxDD.toFixed(1)}% T=${r.trades})`);
  }

  db.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
