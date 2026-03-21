/**
 * Hermes Training Cycle - Backtest Runner (conservative)
 * Loads pending ideas, runs enhanced backtests, stores results.
 * Uses realistic settings: 5bp slippage, 0.05% commission, next-bar execution.
 */
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const DB_PATH = '/home/d/PerpsTrader/data/trading.db';
const db = new Database(DB_PATH);

async function main() {
  // Get pending ideas (max 5)
  const ideas = db.prepare(`
    SELECT * FROM strategy_ideas WHERE status = 'PENDING' ORDER BY confidence DESC LIMIT 5
  `).all();
  
  console.log(`Found ${ideas.length} pending ideas to backtest\n`);

  if (ideas.length === 0) {
    console.log('No pending ideas. Exiting.');
    db.close();
    return;
  }

  // Import backtest engine
  const { BacktestEngine } = require(path.join('/home/d/PerpsTrader', 'src/backtest/enhanced-backtest'));
  const { default: dataManager } = require(path.join('/home/d/PerpsTrader', 'src/data-manager/data-manager'));

  // Load market data from DB
  console.log('Loading market data...');
  const marketDataRows = db.prepare(`
    SELECT symbol, timestamp, open, high, low, close, volume 
    FROM market_data 
    WHERE timestamp >= datetime('now', '-30 days')
    ORDER BY symbol, timestamp
  `).all();
  
  // Group by symbol
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
  for (const [sym, candles] of Object.entries(candlesBySymbol)) {
    console.log(`  ${sym}: ${candles.length} candles`);
  }

  // Backtest each idea
  const results = [];
  
  for (const idea of ideas) {
    const params = JSON.parse(idea.parameters);
    const riskParams = JSON.parse(idea.risk_parameters);
    const symbols = JSON.parse(idea.symbols);
    
    // Filter to symbols we have data for
    const availableSymbols = symbols.filter(s => candlesBySymbol[s] && candlesBySymbol[s].length > 100);
    if (availableSymbols.length === 0) {
      console.log(`\nSKIP ${idea.name}: no market data for ${symbols.join(',')}`);
      continue;
    }

    // Build strategy object for backtest engine
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

    // Combine all candles for the strategy's symbols
    const allCandles = availableSymbols.flatMap(s => candlesBySymbol[s] || []);
    if (allCandles.length < 200) {
      console.log(`\nSKIP ${idea.name}: only ${allCandles.length} candles (need 200+)`);
      continue;
    }

    console.log(`\n=== BACKTESTING: ${idea.name} ===`);
    console.log(`  Type: ${idea.type}, Symbols: ${availableSymbols.join(',')}`);
    console.log(`  Candles: ${allCandles.length}`);

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
      
      console.log(`  RESULT: Return=${result.totalReturn?.toFixed(2)}%, Sharpe=${result.sharpeRatio?.toFixed(2)}, WinRate=${result.winRate?.toFixed(1)}%, MaxDD=${result.maxDrawdown?.toFixed(2)}%, Trades=${result.totalTrades}`);
      
      // Store backtest result
      const btId = `bt-${Date.now()}-${idea.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      db.prepare(`
        INSERT INTO backtest_results (id, strategyId, periodStart, periodEnd, initialCapital, finalCapital, totalReturn, annualizedReturn, sharpeRatio, maxDrawdown, winRate, totalTrades, trades, metrics, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        btId, idea.id, 
        new Date(allCandles[0].timestamp).toISOString(),
        new Date(allCandles[allCandles.length-1].timestamp).toISOString(),
        10000,
        result.finalCapital || 10000,
        result.totalReturn || 0,
        result.annualizedReturn || 0,
        result.sharpeRatio || 0,
        result.maxDrawdown || 0,
        result.winRate || 0,
        result.totalTrades || 0,
        JSON.stringify(result.trades || []),
        JSON.stringify({ avgPnl: result.avgPnl, profitFactor: result.profitFactor, calmarRatio: result.calmarRatio }),
        new Date().toISOString()
      );

      // Update idea status
      db.prepare("UPDATE strategy_ideas SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), idea.id);
      
      results.push({
        name: idea.name,
        return: result.totalReturn,
        sharpe: result.sharpeRatio,
        winRate: result.winRate,
        maxDD: result.maxDrawdown,
        trades: result.totalTrades,
        passGate: (result.sharpeRatio > 0.5 && result.winRate > 45 && result.maxDrawdown < 20)
      });
      
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      db.prepare("UPDATE strategy_ideas SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), idea.id);
    }
  }

  // Summary
  console.log('\n=== BACKTEST SUMMARY ===');
  const passed = results.filter(r => r.passGate);
  const failed = results.filter(r => !r.passGate);
  console.log(`Passed gate (Sharpe>0.5, WR>45%, DD<20%): ${passed.length}/${results.length}`);
  for (const r of passed) {
    console.log(`  PASS: ${r.name} (Return=${r.return?.toFixed(1)}%, Sharpe=${r.sharpe?.toFixed(2)}, WR=${r.winRate?.toFixed(1)}%, DD=${r.maxDD?.toFixed(1)}%)`);
  }
  for (const r of failed) {
    console.log(`  FAIL: ${r.name} (Return=${r.return?.toFixed(1)}%, Sharpe=${r.sharpe?.toFixed(2)}, WR=${r.winRate?.toFixed(1)}%, DD=${r.maxDD?.toFixed(1)}%)`);
  }

  db.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
