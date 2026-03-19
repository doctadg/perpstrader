import DatabaseConstructor from 'better-sqlite3';
const Database = DatabaseConstructor;
import { BacktestEngine } from './src/backtest/enhanced-backtest.js';

async function main() {
  const db = new Database('./data/trading.db');

  const candles = db.prepare(`
    SELECT * FROM market_data 
    WHERE symbol = 'ETH' AND timestamp >= '2026-03-14T00:00:00.000Z'
    ORDER BY timestamp ASC
  `).all().map(row => ({
    ...row,
    timestamp: new Date(row.timestamp)
  }));

  console.log('Loaded ' + candles.length + ' ETH candles');

  const strategy = {
    id: 'backtest-test-001',
    name: 'Volatility Expansion 3 (backtest)',
    description: 'Test backtest',
    type: 'TREND_FOLLOWING',
    symbols: ['ETH'],
    timeframe: '1h',
    parameters: { atrPeriod: 14, breakoutPeriod: 20, volumeSpike: 2 },
    entryConditions: ['ATR expanding', 'Price breaks 20-period high', 'Volume spike'],
    exitConditions: ['ATR contracts', '2x ATR move against position'],
    riskParameters: { maxPositionSize: 0.04, stopLoss: 0.02, takeProfit: 0.08, maxLeverage: 3 },
    isActive: true,
    performance: { totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, totalPnL: 0, sharpeRatio: 0, maxDrawdown: 0 },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const engine = new BacktestEngine({
    initialCapital: 10000,
    commissionRate: 0.0005,
    slippageBps: 5,
  });

  try {
    const result = await engine.runBacktest(strategy, candles);
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('Backtest failed:', err.message);
    console.error(err.stack);
  }

  db.close();
}

main().catch(console.error);
