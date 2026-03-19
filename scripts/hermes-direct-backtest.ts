/**
 * Hermes Direct Backtest Runner - bypasses slow evolution engine
 * Loads SOL market data directly, runs BacktestEngine for each mutant
 */
import { BacktestEngine } from '../src/backtest/enhanced-backtest';
import { Strategy } from '../src/shared/types';
import Database from 'better-sqlite3';

const SYMBOL = 'SOL';
const CUTOFF = '2026-03-17T00:00:00.000Z';

function makeStrategy(
  id: string,
  name: string,
  type: Strategy['type'],
  params: Record<string, any>,
  risk: { stopLoss: number; takeProfit: number; maxPositionSize: number; maxLeverage: number }
): Strategy {
  return {
    id,
    name,
    description: `Hermes mutant: ${name}`,
    type,
    symbols: [SYMBOL],
    timeframe: '1h',
    parameters: params,
    entryConditions: ['Auto-generated'],
    exitConditions: [`SL ${risk.stopLoss}`, `TP ${risk.takeProfit}`],
    riskParameters: risk,
    isActive: false,
    performance: {
      totalTrades: 0, winningTrades: 0, losingTrades: 0,
      winRate: 0, totalPnL: 0, sharpeRatio: 0, maxDrawdown: 0,
      averageWin: 0, averageLoss: 0, profitFactor: 0,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const MUTANTS = [
  makeStrategy('mutant-004', 'Momentum Tight', 'TREND_FOLLOWING',
    { emaFast: 3, emaSlow: 15, volumeMultiplier: 2.5, atrPeriod: 10 },
    { stopLoss: 0.005, takeProfit: 0.015, maxPositionSize: 0.02, maxLeverage: 5 }),
  makeStrategy('mutant-005', 'Squeeze Wide', 'TREND_FOLLOWING' as any,
    { bbPeriod: 20, bbStdDev: 2, squeezeThreshold: 0.015, confirmationCandles: 1 },
    { stopLoss: 0.03, takeProfit: 0.10, maxPositionSize: 0.05, maxLeverage: 3 }),
  makeStrategy('mutant-006', 'RSI Multi-TF', 'MEAN_REVERSION',
    { rsiPeriodFast: 7, rsiPeriodSlow: 21, oversold: 20, overbought: 80, emaTrend: 200 },
    { stopLoss: 0.02, takeProfit: 0.08, maxPositionSize: 0.03, maxLeverage: 2 }),
  makeStrategy('mutant-007', 'SOL Scalper', 'MEAN_REVERSION' as any,
    { emaFast: 3, emaSlow: 9, rsiPeriod: 5, bbPeriod: 10, bbStdDev: 1.5 },
    { stopLoss: 0.003, takeProfit: 0.005, maxPositionSize: 0.04, maxLeverage: 5 }),
  makeStrategy('mutant-008', 'Hybrid Trend-Rev', 'TREND_FOLLOWING',
    { emaFast: 8, emaSlow: 21, rsiExit: 75, atrPeriod: 14, atrTrail: 2 },
    { stopLoss: 0.015, takeProfit: 0.05, maxPositionSize: 0.03, maxLeverage: 3 }),
];

async function main() {
  console.log(`[hermes-direct-bt] Loading ${SYMBOL} market data from ${CUTOFF}...`);
  const db = new Database('./data/trading.db');
  const rows = db.prepare(`
    SELECT symbol, timestamp, open, high, low, close, volume, vwap, bid, ask, bidSize, askSize
    FROM market_data
    WHERE symbol = ? AND timestamp >= ?
    ORDER BY timestamp ASC
  `).all(SYMBOL, CUTOFF) as any[];

  console.log(`[hermes-direct-bt] Loaded ${rows.length} rows.`);

  // Convert timestamps
  const marketData = rows.map(r => ({
    ...r,
    timestamp: new Date(r.timestamp),
  }));

  for (const strategy of MUTANTS) {
    console.log(`\n[hermes-direct-bt] Backtesting ${strategy.name}...`);
    const engine = new BacktestEngine({
      initialCapital: 10000,
      commissionRate: 0.0005,
      slippageBps: 5,
      randomSeed: 42,
    });

    try {
      const result = await engine.runBacktest(strategy, marketData);
      const pass = result.sharpeRatio > 0.5 && result.winRate > 45;
      console.log(`  Sharpe: ${result.sharpeRatio?.toFixed(4)}, WR: ${result.winRate?.toFixed(1)}%, DD: ${result.maxDrawdown?.toFixed(1)}%, Return: ${result.totalReturn?.toFixed(2)}%, Trades: ${result.totalTrades} ${pass ? 'PASS' : 'FAIL'}`);

      // Save performance
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO strategy_performance (id, strategy_id, sharpe, win_rate, pnl, max_drawdown, total_trades, profit_factor, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `perf-${strategy.id}-${Date.now()}`,
        strategy.id,
        result.sharpeRatio ?? 0,
        result.winRate ?? 0,
        result.totalReturn ?? 0,
        result.maxDrawdown ?? 0,
        result.totalTrades ?? 0,
        result.profitFactor ?? 0,
        now
      );
    } catch (e: any) {
      console.error(`  FAILED: ${e.message}`);
    }
  }

  db.close();
  console.log('\n[hermes-direct-bt] Done.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
