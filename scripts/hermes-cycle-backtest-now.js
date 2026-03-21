/**
 * Hermes Training Cycle - Quick backtest of pending ideas
 * Runs one strategy at a time with timeout
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = '/home/d/PerpsTrader/data/trading.db';
const db = new Database(DB_PATH);

async function main() {
  const ideas = db.prepare(`
    SELECT * FROM strategy_ideas WHERE status = 'PENDING' AND id LIKE 'hermes-%' ORDER BY confidence DESC LIMIT 5
  `).all();
  
  console.log('Found ' + ideas.length + ' pending hermes ideas to backtest');
  if (ideas.length === 0) { db.close(); return; }
  
  // Check how much candle data we have
  const dataCount = db.prepare('SELECT COUNT(*) as cnt FROM market_data WHERE timestamp >= datetime(\'now\', \'-30 days\')').get();
  console.log('Market data rows (30d): ' + dataCount.cnt);
  
  const symbolCount = db.prepare('SELECT COUNT(DISTINCT symbol) as cnt FROM market_data WHERE timestamp >= datetime(\'now\', \'-30 days\')').get();
  console.log('Symbols with data: ' + symbolCount.cnt);
  
  const { BacktestEngine } = require(path.join('/home/d/PerpsTrader', 'bin/backtest/enhanced-backtest'));
  
  // Load market data with memory limit
  const topSymbols = db.prepare(`
    SELECT symbol FROM market_data 
    WHERE timestamp >= datetime('now', '-30 days') 
    GROUP BY symbol 
    HAVING COUNT(*) > 500
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `).all().map(r => r.symbol);
  
  console.log('Top symbols: ' + topSymbols.join(', '));
  
  const marketDataRows = db.prepare(`
    SELECT symbol, timestamp, open, high, low, close, volume 
    FROM market_data 
    WHERE timestamp >= datetime('now', '-30 days')
    AND symbol IN (${topSymbols.map(() => '?').join(',')})
    ORDER BY symbol, timestamp
  `).all(topSymbols);
  
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
  
  console.log('Loaded candles for ' + Object.keys(candlesBySymbol).length + ' symbols');
  
  const results = [];
  
  for (const idea of ideas) {
    try {
      const params = JSON.parse(idea.parameters);
      const riskParams = JSON.parse(idea.risk_parameters);
      const symbols = JSON.parse(idea.symbols);
      
      const availableSymbols = symbols.filter(s => candlesBySymbol[s] && candlesBySymbol[s].length > 100);
      if (availableSymbols.length === 0) {
        console.log('SKIP ' + idea.name + ': no data for ' + symbols.join(','));
        db.prepare("UPDATE strategy_ideas SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), idea.id);
        continue;
      }

      const strategy = {
        id: idea.id,
        name: idea.name,
        type: idea.type,
        symbols: availableSymbols,
        timeframe: idea.timeframe || '15m',
        parameters: params,
        entryConditions: typeof idea.entry_conditions === 'string' ? JSON.parse(idea.entry_conditions) : idea.entry_conditions,
        exitConditions: typeof idea.exit_conditions === 'string' ? JSON.parse(idea.exit_conditions) : idea.exit_conditions,
        riskParameters: riskParams,
      };

      // Use candles for the specific symbols only, limit to last 7 days for speed
      const allCandles = availableSymbols.flatMap(s => {
        const c = candlesBySymbol[s] || [];
        return c.length > 672 ? c.slice(-672) : c; // 7 days of 15m candles
      });
      
      if (allCandles.length < 200) {
        console.log('SKIP ' + idea.name + ': only ' + allCandles.length + ' candles');
        db.prepare("UPDATE strategy_ideas SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), idea.id);
        continue;
      }

      console.log('\n=== ' + idea.name + ' (' + availableSymbols.join(',') + ', ' + allCandles.length + ' candles) ===');

      const engine = new BacktestEngine({
        initialCapital: 10000,
        fillModel: 'STANDARD',
        commissionRate: 0.0005,
        slippageBps: 5,
        latencyMs: 50,
        randomSeed: 42,
      });

      // Run with timeout
      const result = await Promise.race([
        engine.runBacktest(strategy, allCandles),
        new Promise((_, reject) => setTimeout(() => reject(new Error('BACKTEST TIMEOUT 30s')), 30000))
      ]);
      
      const ret = result.totalReturn || 0;
      const sharpe = result.sharpeRatio || 0;
      const wr = result.winRate || 0;
      const dd = result.maxDrawdown || 0;
      const trades = result.totalTrades || 0;
      const pf = result.profitFactor || 0;
      
      console.log('  Return=' + ret.toFixed(2) + '% Sharpe=' + sharpe.toFixed(2) + ' WR=' + wr.toFixed(1) + '% DD=' + dd.toFixed(2) + '% Trades=' + trades + ' PF=' + pf.toFixed(2));
      
      const passGate = sharpe > 0.5 && wr > 45 && dd < 20;
      results.push({ 
        id: idea.id, name: idea.name, type: idea.type, symbols: availableSymbols,
        params, riskParams, entryConditions: strategy.entryConditions, exitConditions: strategy.exitConditions,
        return: ret, sharpe, winRate: wr, maxDD: dd, trades, profitFactor: pf, passGate 
      });

      // Store backtest result
      try {
        const btId = 'bt-' + Date.now() + '-' + idea.name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 30);
        db.prepare(`
          INSERT INTO backtest_results (id, strategyId, periodStart, periodEnd, initialCapital, finalCapital, totalReturn, annualizedReturn, sharpeRatio, maxDrawdown, winRate, totalTrades, trades, metrics, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          btId, idea.id,
          new Date(allCandles[0].timestamp).toISOString(),
          new Date(allCandles[allCandles.length - 1].timestamp).toISOString(),
          10000, result.finalCapital || 10000, ret,
          result.annualizedReturn || 0, sharpe, dd, wr, trades,
          JSON.stringify(result.trades || []),
          JSON.stringify({ avgPnl: result.avgPnl, profitFactor: pf }),
          new Date().toISOString()
        );
      } catch (e) {
        console.log('  (Could not store backtest result: ' + e.message + ')');
      }

      db.prepare("UPDATE strategy_ideas SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), idea.id);
      
    } catch (err) {
      console.log('  ERROR: ' + err.message);
      db.prepare("UPDATE strategy_ideas SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(new Date().toISOString(), idea.id);
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    const status = r.passGate ? 'PASS' : 'FAIL';
    console.log(status + ': ' + r.name + ' (R=' + r.return.toFixed(1) + '% S=' + r.sharpe.toFixed(2) + ' WR=' + r.winRate.toFixed(1) + '% DD=' + r.maxDD.toFixed(1) + '% T=' + r.trades + ')');
  }
  
  // Check for promotion candidates
  const winners = results.filter(r => r.passGate);
  if (winners.length > 0) {
    console.log('\n=== PROMOTION CANDIDATES ===');
    for (const w of winners) {
      console.log('Candidate: ' + w.name + ' (Sharpe=' + w.sharpe.toFixed(2) + ', WR=' + w.winRate.toFixed(1) + '%)');
    }
  }

  db.close();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
