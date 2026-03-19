/**
 * Strategy Activation Pipeline
 * 
 * Bridges the gap between generated strategies and active trading strategies.
 * 
 * What this does:
 * 1. Evaluates all strategies in the `strategies` table using performance metrics
 * 2. Deactivates all strategies (sets isActive=0)
 * 3. Activates the top N strategies (sets isActive=1) based on composite scoring
 * 4. Promotes top strategies from `strategy_performance` (research engine pipeline)
 * 5. Reports strategy diversity and health metrics
 * 
 * Usage:
 *   npx ts-node src/scripts/strategy-activator.ts [--top N] [--min-trades N] [--dry-run]
 */

import DatabaseConstructor from 'better-sqlite3';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const Database = DatabaseConstructor as any;

// Configuration
const DB_PATH = path.resolve(__dirname, '../../data/trading.db');
const DEFAULT_TOP_N = 10;
const DEFAULT_MIN_TRADES = 10;
const DEFAULT_MIN_SHARPE = -1;
const DEFAULT_MAX_DRAWDOWN = 0.5; // 50%

interface ActivatedStrategy {
  id: string;
  name: string;
  type: string;
  symbols: string[];
  score: number;
  sharpe: number;
  winRate: number;
  pnl: number;
  drawdown: number;
  trades: number;
  source: 'strategies' | 'research_pipeline';
}

function parseArgs(): {
  topN: number;
  minTrades: number;
  minSharpe: number;
  maxDrawdown: number;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let topN = DEFAULT_TOP_N;
  let minTrades = DEFAULT_MIN_TRADES;
  let minSharpe = DEFAULT_MIN_SHARPE;
  let maxDrawdown = DEFAULT_MAX_DRAWDOWN;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--top': topN = parseInt(args[++i]) || DEFAULT_TOP_N; break;
      case '--min-trades': minTrades = parseInt(args[++i]) || DEFAULT_MIN_TRADES; break;
      case '--min-sharpe': minSharpe = parseFloat(args[++i]) || DEFAULT_MIN_SHARPE; break;
      case '--max-drawdown': maxDrawdown = parseFloat(args[++i]) || DEFAULT_MAX_DRAWDOWN; break;
      case '--dry-run': dryRun = true; break;
    }
  }

  return { topN, minTrades, minSharpe, maxDrawdown, dryRun };
}

/**
 * Composite score: weighted combination of performance metrics.
 * Higher is better.
 * 
 * Weights:
 *  - Sharpe Ratio: 30% (risk-adjusted return)
 *  - Win Rate: 20% (consistency)
 *  - Total PnL (normalized): 20% (absolute return)
 *  - Drawdown penalty: 15% (capital preservation)
 *  - Trade count bonus: 10% (statistical significance)
 *  - Diversity bonus: 5% (unique symbol/type combos)
 */
function calculateCompositeScore(
  sharpe: number,
  winRate: number,
  pnl: number,
  drawdown: number,
  trades: number
): number {
  // Normalize sharpe to 0-1 range (cap at 10)
  const sharpeScore = Math.min(Math.max((sharpe + 2) / 12, 0), 1) * 0.30;

  // Win rate 0-100 mapped to 0-1
  const winRateScore = Math.min(winRate / 100, 1) * 0.20;

  // PnL: use log scale for large values, normalize to 0-1
  const pnlNormalized = Math.min(Math.log1p(Math.max(pnl, 0)) / Math.log1p(10000), 1);
  const pnlScore = pnlNormalized * 0.20;

  // Drawdown penalty: lower drawdown = higher score
  const ddScore = Math.max(1 - drawdown / 0.5, 0) * 0.15;

  // Trade count significance: bonus for more trades, caps at 100
  const tradeScore = Math.min(Math.sqrt(trades) / 10, 1) * 0.10;

  // Diversity bonus is added externally
  
  return sharpeScore + winRateScore + pnlScore + tradeScore + ddScore;
}

function main() {
  const config = parseArgs();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Strategy Activation Pipeline');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  DB: ${DB_PATH}`);
  console.log(`  Top N: ${config.topN}`);
  console.log(`  Min trades: ${config.minTrades}`);
  console.log(`  Min Sharpe: ${config.minSharpe}`);
  console.log(`  Max drawdown: ${config.maxDrawdown}`);
  console.log(`  Dry run: ${config.dryRun}`);
  console.log('');

  const db = new Database(DB_PATH, { readonly: config.dryRun });

  try {
    // ── Step 1: Analyze current state ──
    console.log('── Step 1: Analyzing current database state ──');

    const totalStrategies = (db.prepare('SELECT COUNT(*) as c FROM strategies').get() as any).c;
    const activeStrategies = (db.prepare('SELECT COUNT(*) as c FROM strategies WHERE isActive = 1').get() as any).c;
    const totalIdeas = (db.prepare('SELECT COUNT(*) as c FROM strategy_ideas').get() as any).c;
    const totalPerformance = (db.prepare('SELECT COUNT(*) as c FROM strategy_performance').get() as any).c;

    console.log(`  strategies table: ${totalStrategies} total, ${activeStrategies} active`);
    console.log(`  strategy_ideas table: ${totalIdeas}`);
    console.log(`  strategy_performance table: ${totalPerformance}`);
    console.log('');

    // ── Step 2: Evaluate strategies from the strategies table ──
    console.log('── Step 2: Evaluating strategies by performance metrics ──');

    const rows = db.prepare(`
      SELECT 
        id, name, type, symbols, parameters, riskParameters, 
        json_extract(performance, '$.sharpeRatio') as sharpe,
        json_extract(performance, '$.winRate') as winRate,
        json_extract(performance, '$.totalPnL') as pnl,
        json_extract(performance, '$.maxDrawdown') as drawdown,
        json_extract(performance, '$.totalTrades') as trades
      FROM strategies
      WHERE json_extract(performance, '$.totalTrades') >= ?
        AND json_extract(performance, '$.sharpeRatio') >= ?
        AND json_extract(performance, '$.maxDrawdown') <= ?
      ORDER BY sharpe DESC
    `).all(config.minTrades, config.minSharpe, config.maxDrawdown) as any[];

    console.log(`  Found ${rows.length} strategies passing quality filters`);
    console.log('');

    if (rows.length === 0) {
      console.log('  WARNING: No strategies pass quality filters!');
      console.log('  Using relaxed criteria to find at least some candidates...');
      
      // Relaxed: just need some trades
      const relaxedRows = db.prepare(`
        SELECT 
          id, name, type, symbols, parameters, riskParameters,
          json_extract(performance, '$.sharpeRatio') as sharpe,
          json_extract(performance, '$.winRate') as winRate,
          json_extract(performance, '$.totalPnL') as pnl,
          json_extract(performance, '$.maxDrawdown') as drawdown,
          json_extract(performance, '$.totalTrades') as trades
        FROM strategies
        WHERE json_extract(performance, '$.totalTrades') >= 3
        ORDER BY json_extract(performance, '$.sharpeRatio') DESC
        LIMIT ?
      `).all(config.topN * 3) as any[];

      if (relaxedRows.length === 0) {
        console.log('  FATAL: No strategies with any trades found. Cannot activate.');
        process.exit(1);
      }
      
      rows.push(...relaxedRows);
    }

    // Score and rank all candidates
    const candidates: ActivatedStrategy[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      symbols: JSON.parse(row.symbols || '[]'),
      score: calculateCompositeScore(row.sharpe, row.winRate, row.pnl, row.drawdown, row.trades),
      sharpe: row.sharpe,
      winRate: row.winRate,
      pnl: row.pnl,
      drawdown: row.drawdown,
      trades: row.trades,
      source: 'strategies' as const,
    }));

    // Sort by composite score
    candidates.sort((a, b) => b.score - a.score);

    // ── Step 3: Also evaluate research pipeline strategies ──
    console.log('── Step 3: Evaluating research pipeline strategies ──');

    const researchRows = db.prepare(`
      SELECT 
        p.strategy_id as id, i.name, i.type, i.symbols, i.parameters, i.risk_parameters as riskParameters,
        p.sharpe, p.win_rate as winRate, p.pnl, p.max_drawdown as drawdown, p.total_trades as trades
      FROM strategy_performance p
      JOIN strategy_ideas i ON p.strategy_id = i.id
      WHERE p.total_trades >= ?
        AND p.sharpe >= ?
        AND p.max_drawdown <= ?
      ORDER BY p.sharpe DESC
    `).all(config.minTrades, config.minSharpe, config.maxDrawdown) as any[];

    console.log(`  Found ${researchRows.length} research pipeline strategies passing quality filters`);

    for (const row of researchRows) {
      candidates.push({
        id: row.id,
        name: row.name,
        type: row.type,
        symbols: JSON.parse(row.symbols || '[]'),
        score: calculateCompositeScore(row.sharpe, row.winRate, row.pnl, row.drawdown, row.trades),
        sharpe: row.sharpe,
        winRate: row.winRate,
        pnl: row.pnl,
        drawdown: row.drawdown,
        trades: row.trades,
        source: 'research_pipeline' as const,
      });
    }

    // Re-sort after adding research candidates
    candidates.sort((a, b) => b.score - a.score);

    // ── Step 4: Select diverse top N ──
    console.log('── Step 4: Selecting diverse top strategies ──');

    const selected: ActivatedStrategy[] = [];
    const usedKeys = new Set<string>(); // Track unique (type, symbols_hash) combos

    for (const candidate of candidates) {
      if (selected.length >= config.topN) break;

      const symbolKey = candidate.symbols.sort().join(',');
      const key = `${candidate.type}:${symbolKey}`;

      // Allow up to 3 of the same type, but prefer diversity
      const sameTypeCount = selected.filter(s => s.type === candidate.type).length;
      if (sameTypeCount >= Math.ceil(config.topN * 0.6)) {
        continue; // Max 60% of one type
      }

      // Diversity bonus: prefer unique symbol combinations
      const diversityBonus = usedKeys.has(key) ? 0 : 0.05;
      candidate.score += diversityBonus;

      selected.push(candidate);
      usedKeys.add(key);
    }

    console.log(`  Selected ${selected.length} diverse strategies`);
    console.log('');

    // ── Step 5: Display selected strategies ──
    console.log('── Step 5: Top selected strategies ──');
    console.log('');
    
    selected.forEach((s, i) => {
      console.log(`  ${i + 1}. [${s.source === 'research_pipeline' ? 'R' : 'S'}] ${s.name}`);
      console.log(`     Type: ${s.type} | Symbols: ${s.symbols.join(', ')}`);
      console.log(`     Score: ${s.score.toFixed(4)} | Sharpe: ${s.sharpe.toFixed(2)} | WR: ${s.winRate.toFixed(1)}% | PnL: $${s.pnl.toFixed(2)} | DD: ${(s.drawdown * 100).toFixed(1)}% | Trades: ${s.trades}`);
    });

    // ── Step 6: Activate selected strategies ──
    if (config.dryRun) {
      console.log('');
      console.log('── DRY RUN: No changes made ──');
      console.log(`  Would deactivate ${totalStrategies} strategies`);
      console.log(`  Would activate ${selected.length} strategies`);
    } else {
      console.log('');
      console.log('── Step 6: Activating selected strategies ──');

      // Deactivate ALL strategies first
      const deactivateResult = db.prepare('UPDATE strategies SET isActive = 0').run();
      console.log(`  Deactivated ${deactivateResult.changes} strategies`);

      // Activate the selected ones (only those from strategies table)
      let activated = 0;
      const activateStmt = db.prepare('UPDATE strategies SET isActive = 1 WHERE id = ?');

      for (const s of selected) {
        if (s.source === 'strategies') {
          const result = activateStmt.run(s.id);
          if (result.changes > 0) activated++;
        } else {
          // Promote research pipeline strategy to strategies table
          const idea = db.prepare('SELECT * FROM strategy_ideas WHERE id = ?').get(s.id) as any;
          if (idea) {
            const perf = db.prepare('SELECT * FROM strategy_performance WHERE strategy_id = ?').get(s.id) as any;
            
            const strategyId = uuidv4();
            const now = new Date().toISOString();
            
            db.prepare(`
              INSERT OR REPLACE INTO strategies (
                id, name, description, type, symbols, timeframe, parameters,
                entryConditions, exitConditions, riskParameters, isActive,
                performance, createdAt, updatedAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            `).run(
              strategyId,
              idea.name,
              idea.description || `Promoted from research pipeline. Sharpe: ${perf?.sharpe?.toFixed(2)}`,
              idea.type,
              idea.symbols,
              idea.timeframe,
              idea.parameters,
              idea.entry_conditions,
              idea.exit_conditions,
              idea.risk_parameters,
              JSON.stringify({
                totalTrades: perf?.total_trades || 0,
                winningTrades: Math.round((perf?.total_trades || 0) * (perf?.win_rate || 0)),
                losingTrades: Math.round((perf?.total_trades || 0) * (1 - (perf?.win_rate || 0))),
                winRate: (perf?.win_rate || 0) * 100,
                totalPnL: perf?.pnl || 0,
                sharpeRatio: perf?.sharpe || 0,
                maxDrawdown: perf?.max_drawdown || 0,
                averageWin: 0,
                averageLoss: 0,
                profitFactor: perf?.profit_factor || 0,
              }),
              now,
              now
            );
            activated++;
            console.log(`  Promoted research strategy: ${idea.name} → ${strategyId}`);
          }
        }
      }

      console.log(`  Activated ${activated} strategies`);

      // Verify
      const newActive = (db.prepare('SELECT COUNT(*) as c FROM strategies WHERE isActive = 1').get() as any).c;
      const newInactive = (db.prepare('SELECT COUNT(*) as c FROM strategies WHERE isActive = 0').get() as any).c;
      console.log(`  Verification: ${newActive} active, ${newInactive} inactive`);
    }

    // ── Summary ──
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════════════════');
    
    const typeCounts = new Map<string, number>();
    for (const s of selected) {
      typeCounts.set(s.type, (typeCounts.get(s.type) || 0) + 1);
    }
    
    console.log(`  Activated: ${selected.length} strategies`);
    for (const [type, count] of typeCounts) {
      console.log(`    - ${type}: ${count}`);
    }
    console.log(`  Avg Sharpe: ${selected.length > 0 ? (selected.reduce((a, s) => a + s.sharpe, 0) / selected.length).toFixed(2) : 'N/A'}`);
    console.log(`  Avg Win Rate: ${selected.length > 0 ? (selected.reduce((a, s) => a + s.winRate, 0) / selected.length).toFixed(1) : 'N/A'}%`);
    console.log(`  Avg Trades: ${selected.length > 0 ? (selected.reduce((a, s) => a + s.trades, 0) / selected.length).toFixed(0) : 'N/A'}`);

    // ── Diagnostics ──
    console.log('');
    console.log('── Diagnostic Issues Found ──');
    
    // Check for strategies with 0 maxDrawdown (likely data issues)
    const zeroDdCount = (db.prepare("SELECT COUNT(*) as c FROM strategies WHERE json_extract(performance, '$.maxDrawdown') = 0 AND json_extract(performance, '$.totalTrades') > 0").get() as any).c;
    if (zeroDdCount > 0) {
      console.log(`  ⚠ ${zeroDdCount} strategies report 0 maxDrawdown with trades > 0 (suspicious)`);
    }

    // Check for suspiciously high Sharpe ratios
    const highSharpeCount = (db.prepare("SELECT COUNT(*) as c FROM strategies WHERE json_extract(performance, '$.sharpeRatio') > 100").get() as any).c;
    if (highSharpeCount > 0) {
      console.log(`  ⚠ ${highSharpeCount} strategies with Sharpe > 100 (likely overfit with tiny sample)`);
    }

    // Check strategies with very few trades
    const lowTradeCount = (db.prepare("SELECT COUNT(*) as c FROM strategies WHERE json_extract(performance, '$.totalTrades') < 5").get() as any).c;
    if (lowTradeCount > 0) {
      console.log(`  ⚠ ${lowTradeCount} strategies with < 5 trades (low statistical significance)`);
    }

    console.log('');
    console.log('  Architecture notes:');
    console.log('  - The trading cycle generates fresh strategies each cycle (does not reuse DB strategies)');
    console.log('  - The strategies table is a historical log of past cycle selections');
    console.log('  - To make active strategies matter, the strategy-ideation node should read from the DB');
    console.log('  - The research engine pipeline (strategy_ideas → strategy_performance) is separate');
    console.log('');

  } catch (error) {
    console.error('Pipeline failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
