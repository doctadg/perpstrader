/**
 * Hermes Backtest Runner v2 - typed correctly for evolution engine
 */
import { GeneticOptimizer } from '../src/evolution-engine/genetic-optimizer';
import { StrategyGenome, StrategyParameters } from '../src/evolution-engine/types';
import Database from 'better-sqlite3';

function makeGenome(
  id: string,
  params: StrategyParameters,
  parentIds: string[] = []
): StrategyGenome {
  return {
    id,
    parentIds,
    generation: parentIds.length > 0 ? 1 : 0,
    parameters: params,
    createdAt: new Date(),
  };
}

const MUTANTS: StrategyGenome[] = [
  // Mutant 004: Tight momentum scalper (from mutant-002, Sharpe 1.87)
  makeGenome('mutant-004-momentum-tight', {
    entryThresholds: { rsiOverbought: 80, rsiOversold: 20, emaFast: 3, emaSlow: 15, volumeThreshold: 2.5, macdSignalThreshold: 0.1 },
    riskParameters: { stopLoss: 0.005, takeProfit: 0.015, maxPositionSize: 0.02, maxLeverage: 5, trailingStop: 0.003 },
    timingParameters: { timeframe: '1m', maxHoldTime: 30, minHoldTime: 1 },
    filterParameters: { minVolatility: 0.01, maxVolatility: 0.08, trendStrength: 0.4, correlationThreshold: 0.5 },
  }, ['mutant-002-momentum']),

  // Mutant 005: Wider squeeze breakout (from mutant-003, DD 6.2%)
  makeGenome('mutant-005-squeeze-wider', {
    entryThresholds: { rsiOverbought: 70, rsiOversold: 30, emaFast: 5, emaSlow: 20, volumeThreshold: 1.5, macdSignalThreshold: 0.2 },
    riskParameters: { stopLoss: 0.03, takeProfit: 0.10, maxPositionSize: 0.05, maxLeverage: 3, trailingStop: 0.01 },
    timingParameters: { timeframe: '1h', maxHoldTime: 1440, minHoldTime: 30 },
    filterParameters: { minVolatility: 0.005, maxVolatility: 0.12, trendStrength: 0.6, correlationThreshold: 0.3 },
  }, ['mutant-003-squeeze']),

  // Mutant 006: Multi-TF RSI confluence (from mutant-001, Sharpe 1.46)
  makeGenome('mutant-006-rsi-multi-tf', {
    entryThresholds: { rsiOverbought: 80, rsiOversold: 20, emaFast: 7, emaSlow: 21, volumeThreshold: 1.8, macdSignalThreshold: 0.15 },
    riskParameters: { stopLoss: 0.02, takeProfit: 0.08, maxPositionSize: 0.03, maxLeverage: 2, trailingStop: 0.005 },
    timingParameters: { timeframe: '15m', maxHoldTime: 240, minHoldTime: 15 },
    filterParameters: { minVolatility: 0.008, maxVolatility: 0.06, trendStrength: 0.3, correlationThreshold: 0.4 },
  }, ['mutant-001-tight-rsi']),

  // Mutant 007: SOL-focused scalper (new, targeting best live PnL symbol)
  makeGenome('mutant-007-sol-focus', {
    entryThresholds: { rsiOverbought: 65, rsiOversold: 35, emaFast: 3, emaSlow: 9, volumeThreshold: 2.0, macdSignalThreshold: 0.05 },
    riskParameters: { stopLoss: 0.003, takeProfit: 0.005, maxPositionSize: 0.04, maxLeverage: 5, trailingStop: 0.001 },
    timingParameters: { timeframe: '1m', maxHoldTime: 5, minHoldTime: 1 },
    filterParameters: { minVolatility: 0.015, maxVolatility: 0.10, trendStrength: 0.5, correlationThreshold: 0.3 },
  }),

  // Mutant 008: Trend-reversion hybrid (new, targets SOL+LINK+kPEPE)
  makeGenome('mutant-008-hybrid-trend-rev', {
    entryThresholds: { rsiOverbought: 75, rsiOversold: 25, emaFast: 8, emaSlow: 21, volumeThreshold: 1.5, macdSignalThreshold: 0.2 },
    riskParameters: { stopLoss: 0.015, takeProfit: 0.05, maxPositionSize: 0.03, maxLeverage: 3, trailingStop: 0.008 },
    timingParameters: { timeframe: '15m', maxHoldTime: 240, minHoldTime: 5 },
    filterParameters: { minVolatility: 0.01, maxVolatility: 0.08, trendStrength: 0.5, correlationThreshold: 0.4 },
  }),
];

async function runBacktests() {
  const optimizer = new GeneticOptimizer({
    population: { populationSize: 1 },
    mutation: { mutationRate: 0 },
    selection: {}
  });

  console.log('[hermes-backtest] Initializing optimizer...');
  await optimizer.initialize();
  console.log('[hermes-backtest] Optimizer ready. Testing ' + MUTANTS.length + ' mutants.');

  const db = new Database('./data/trading.db');
  const results: Record<string, any> = {};

  for (const genome of MUTANTS) {
    console.log(`\n[hermes-backtest] Testing ${genome.id}...`);
    try {
      const fitness = await optimizer.evaluateGenome(genome);
      results[genome.id] = fitness;

      // Save to strategy_performance
      const now = new Date().toISOString();
      db.prepare(`
        INSERT OR REPLACE INTO strategy_performance (id, strategy_id, sharpe, win_rate, pnl, max_drawdown, total_trades, profit_factor, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `perf-${genome.id}-${Date.now()}`,
        genome.id,
        fitness.sharpeRatio ?? 0,
        fitness.winRate ?? 0,
        fitness.totalReturn ?? 0,
        fitness.maxDrawdown ?? 0,
        fitness.totalTrades ?? 0,
        fitness.profitFactor ?? 0,
        now
      );

      const pass = fitness.sharpeRatio > 0.5 && fitness.winRate > 0.45;
      console.log(`  Sharpe: ${fitness.sharpeRatio?.toFixed(4)}, WR: ${(fitness.winRate * 100).toFixed(1)}%, DD: ${(fitness.maxDrawdown * 100).toFixed(1)}%, PF: ${fitness.profitFactor?.toFixed(2)}, Trades: ${fitness.totalTrades} ${pass ? '[PASS]' : '[FAIL]'}`);
    } catch (e: any) {
      console.error(`  FAILED: ${e.message}`);
      results[genome.id] = { error: e.message };
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const [id, r] of Object.entries(results)) {
    if ('error' in (r as any)) {
      console.log(`${id}: ERROR - ${(r as any).error}`);
    } else {
      const f = r as any;
      const pass = f.sharpeRatio > 0.5 && f.winRate > 0.45;
      console.log(`${id}: Sharpe=${f.sharpeRatio?.toFixed(4)} WR=${(f.winRate * 100).toFixed(1)}% DD=${(f.maxDrawdown * 100).toFixed(1)}% PF=${f.profitFactor?.toFixed(2)} ${pass ? 'PASS' : 'FAIL'}`);
    }
  }

  db.close();
}

runBacktests().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
