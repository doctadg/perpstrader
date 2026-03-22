
const { BacktestEngine } = require('/home/d/PerpsTrader/bin/backtest/enhanced-backtest');
const Database = require('better-sqlite3');

const db = new Database('/home/d/PerpsTrader/data/trading.db', { readonly: true });
const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

function loadData(symbols) {
  const placeholders = symbols.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT symbol, timestamp, open, high, low, close, volume
     FROM market_data WHERE symbol IN (${placeholders}) AND timestamp >= ?
     ORDER BY symbol, timestamp ASC`
  ).all(...symbols, cutoff);
  return rows.map(row => ({
    symbol: row.symbol, timestamp: new Date(row.timestamp),
    open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume,
  }));
}

async function runBT(name, type, params, risk, syms) {
  const md = loadData(syms);
  const strategy = {
    id: 'bt-' + name.replace(/[^a-z0-9]/gi, '-'),
    name, type, symbols: syms, timeframe: '5m',
    parameters: params,
    entryConditions: ['entry'], exitConditions: ['exit'],
    riskParameters: risk,
  };
  const engine = new BacktestEngine({ initialCapital: 10000, commissionRate: 0.0006, slippageBps: 3 });
  const r = await engine.runBacktest(strategy, md);
  return {
    name, type, symbols: syms.join(','),
    trades: r.totalTrades, wr: r.winRate.toFixed(1) + '%',
    pnl: '$' + (r.finalCapital - r.initialCapital).toFixed(2),
    pnlPct: ((r.finalCapital - r.initialCapital) / r.initialCapital * 100).toFixed(1) + '%',
    sharpe: (r.sharpeRatio ?? 0).toFixed(3),
    pf: (r.profitFactor ?? 0).toFixed(3),
    dd: (r.maxDrawdown ?? 0).toFixed(1) + '%',
  };
}

async function main() {
  const results = [];
  
  // Trend Following mutants
  results.push(await runBT('TF: EMA 10/30 Cross', 'TREND_FOLLOWING',
    { fastPeriod: 10, slowPeriod: 30 },
    { maxPositionSize: 0.05, stopLoss: 0.02, takeProfit: 0.04, maxLeverage: 3 },
    ['FARTCOIN', 'ETH', 'SOL']
  ));
  
  results.push(await runBT('TF: EMA 5/20 Fast', 'TREND_FOLLOWING',
    { fastPeriod: 5, slowPeriod: 20 },
    { maxPositionSize: 0.04, stopLoss: 0.015, takeProfit: 0.035, maxLeverage: 2 },
    ['FARTCOIN', 'ETH', 'SOL']
  ));

  results.push(await runBT('TF: EMA 20/50 Slow', 'TREND_FOLLOWING',
    { fastPeriod: 20, slowPeriod: 50 },
    { maxPositionSize: 0.03, stopLoss: 0.03, takeProfit: 0.06, maxLeverage: 2 },
    ['ETH', 'SOL', 'BTC']
  ));

  // Single symbol MR tests (to check if multi-symbol is the problem)
  results.push(await runBT('MR: RSI(14) FARTCOIN only', 'MEAN_REVERSION',
    { rsiPeriod: 14, oversoldThreshold: 30, overboughtThreshold: 70, bbPeriod: 20, bbStdDev: 2 },
    { maxPositionSize: 0.05, stopLoss: 0.02, takeProfit: 0.04, maxLeverage: 3 },
    ['FARTCOIN']
  ));

  results.push(await runBT('MR: RSI(14) ETH only', 'MEAN_REVERSION',
    { rsiPeriod: 14, oversoldThreshold: 30, overboughtThreshold: 70, bbPeriod: 20, bbStdDev: 2 },
    { maxPositionSize: 0.05, stopLoss: 0.02, takeProfit: 0.04, maxLeverage: 3 },
    ['ETH']
  ));

  results.push(await runBT('MR: RSI(14) SOL only', 'MEAN_REVERSION',
    { rsiPeriod: 14, oversoldThreshold: 30, overboughtThreshold: 70, bbPeriod: 20, bbStdDev: 2 },
    { maxPositionSize: 0.05, stopLoss: 0.02, takeProfit: 0.04, maxLeverage: 3 },
    ['SOL']
  ));

  console.log(JSON.stringify(results, null, 2));
  db.close();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
