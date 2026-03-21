
const { processBacktestJob } = require('/home/d/PerpsTrader/bin/backtest-worker/job-processor');

const strategy = {
  id: 'hermes-a65be6f3b8ce',
  name: 'SOL RSI Convergence (Tight Risk)',
  type: 'MEAN_REVERSION',
  symbols: ['SOL'],
  parameters: {
    indicator1: 'RSI',
    indicator2: 'Bollinger Bands',
    rsiPeriod: 14,
    oversold: 30,
    overbought: 70,
    bbPeriod: 20,
    bbStdDev: 2,
    cooldownBars: 3,
    volumeFilter: 1.5
  },
  entryConditions: { condition: 'RSI crosses below 30 AND price touches lower BB AND volume > 1.5x' },
  exitConditions: { condition: 'RSI crosses above 50 OR price reaches upper BB OR stop loss' },
  riskParameters: { maxPositionSize: 0.06, stopLoss: 0.015, takeProfit: 0.03, maxLeverage: 3 }
};

const job = {
  id: 'hermes-bt-' + Date.now(),
  data: {
    jobId: 'hermes-bt-' + Date.now(),
    strategy: strategy,
    symbol: 'SOL',
    timeframe: '15m',
    days: 7,
    config: { initialCapital: 10000, commissionRate: 0.0005, slippageBps: 5 }
  }
};

processBacktestJob(job).then(result => {
  console.log(JSON.stringify(result, null, 2));
}).catch(err => {
  console.error('ERROR:', err.message);
});
