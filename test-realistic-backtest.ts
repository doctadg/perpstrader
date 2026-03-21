import DatabaseConstructor from 'better-sqlite3';
const Database = DatabaseConstructor;
import { vectorizedBacktest } from './src/langgraph/nodes/backtester.js';

const db = new Database('./data/trading.db');

async function main() {
  const db = new Database('./data/trading.db');

  const candles = db.prepare(`
    SELECT * FROM market_data 
    WHERE symbol = 'ETH' AND timestamp >= '2026-03-01T00:00:00.000Z'
    ORDER BY timestamp ASC
  `).all().map(row => ({
    ...row,
    timestamp: new Date(row.timestamp)
  }));

  console.log('Loaded ' + candles.length + ' candles');

  const idea = {
    type: 'TREND_FOLLOWING',
    symbols: ['ETH'],
    parameters: { fastPeriod: 10, slowPeriod: 30 },
    riskParameters: { maxPositionSize: 0.04, stopLoss: 0.02, takeProfit: 0.08 },
  };

  const result = await vectorizedBacktest(idea, candles);
  console.log('=== REALISTIC BACKTEST RESULTS ===');
  console.log('Return:', result.totalReturn.toFixed(2) + '%');
  console.log('Annualized:', result.annualizedReturn.toFixed(2) + '%');
  console.log('Sharpe:', result.sharpeRatio.toFixed(3));
  console.log('Sortino:', result.metrics.sortinoRatio.toFixed(3));
  console.log('Max DD:', result.maxDrawdown.toFixed(2) + '%');
  console.log('Win Rate:', result.winRate.toFixed(1) + '%');
  console.log('Trades:', result.totalTrades);
  console.log('Profit Factor:', result.profitFactor.toFixed(2));
  console.log('Total Fees:', '$' + result.metrics.totalFees.toFixed(2));
  console.log('Avg Slippage/Trade:', '$' + result.metrics.avgSlippageCost.toFixed(4));
  console.log('Avg Win:', '$' + result.metrics.avgWin.toFixed(2));
  console.log('Avg Loss:', '$' + result.metrics.avgLoss.toFixed(2));
  console.log('Max Cons Losses:', result.metrics.maxConsecutiveLosses);
  console.log('Expectancy:', '$' + result.metrics.expectancy.toFixed(4));
  console.log('VaR95:', result.metrics.var95.toFixed(2) + '%');
  console.log('Calmar:', result.metrics.calmarRatio.toFixed(3));

  db.close();
}

main().catch(console.error);
