#!/usr/bin/env node
/**
 * Recalculate Strategy Performance from Actual Trades
 * 
 * This script recalculates performance metrics for all strategies
 * based on actual trades in the trades table, not backtest simulations.
 * 
 * Run: node scripts/recalc-performance.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../data/trading.db');

function recalculatePerformance() {
  const db = new Database(DB_PATH);
  
  console.log('[recalc-performance] Recalculating strategy performance from actual trades...');
  console.log('[recalc-performance] DB:', DB_PATH);
  
  // Get all strategies
  const strategies = db.prepare('SELECT id, name, isActive FROM strategies').all();
  console.log(`[recalc-performance] Found ${strategies.length} strategies`);
  
  const updates = [];
  
  for (const strategy of strategies) {
    // Get all EXIT trades for this strategy
    const trades = db.prepare(`
      SELECT 
        pnl,
        timestamp
      FROM trades
      WHERE strategyId = ? AND entryExit = 'EXIT' AND status = 'FILLED'
      ORDER BY timestamp
    `).all(strategy.id);
    
    if (trades.length === 0) continue;
    
    const pnls = trades.map(t => t.pnl || 0);
    const totalPnL = pnls.reduce((a, b) => a + b, 0);
    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p < 0);
    const totalWins = wins.reduce((a, b) => a + b, 0);
    const totalLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
    
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
    
    // Calculate Sharpe from trade returns
    const avgReturn = pnls.length > 0 ? totalPnL / pnls.length : 0;
    const variance = pnls.length > 1 
      ? pnls.reduce((sum, p) => sum + Math.pow(p - avgReturn, 2), 0) / (pnls.length - 1)
      : 0;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    
    // Calculate max drawdown from equity curve
    let peak = 0;
    let maxDD = 0;
    let running = 0;
    for (const pnl of pnls) {
      running += pnl;
      if (running > peak) peak = running;
      const dd = peak > 0 ? (peak - running) / peak : 0;
      if (dd > maxDD) maxDD = dd;
    }
    
    updates.push({
      id: strategy.id,
      name: strategy.name,
      isActive: strategy.isActive,
      trades: trades.length,
      winRate: winRate.toFixed(2),
      totalPnL: totalPnL.toFixed(4),
      sharpeRatio: sharpeRatio.toFixed(2),
      profitFactor: profitFactor.toFixed(2),
      maxDrawdown: (maxDD * 100).toFixed(2),
      avgWin: avgWin.toFixed(4),
      avgLoss: avgLoss.toFixed(4)
    });
  }
  
  // Apply updates
  const updateStmt = db.prepare(`
    UPDATE strategies 
    SET performance = json_set(COALESCE(performance, '{}'),
      '$.totalTrades', ?,
      '$.winningTrades', ?,
      '$.losingTrades', ?,
      '$.winRate', ?,
      '$.totalPnL', ?,
      '$.sharpeRatio', ?,
      '$.maxDrawdown', ?,
      '$.averageWin', ?,
      '$.averageLoss', ?,
      '$.profitFactor', ?,
      '$.source', 'live',
      '$.lastUpdated', ?
    ),
    updatedAt = ?
    WHERE id = ?
  `);
  
  const now = new Date().toISOString();
  
  for (const u of updates) {
    updateStmt.run(
      u.trades,
      Math.round(u.trades * u.winRate / 100),
      Math.round(u.trades * (1 - u.winRate / 100)),
      parseFloat(u.winRate),
      parseFloat(u.totalPnL),
      parseFloat(u.sharpeRatio),
      parseFloat(u.maxDrawdown) / 100,
      parseFloat(u.avgWin),
      parseFloat(u.avgLoss),
      parseFloat(u.profitFactor),
      now,
      now,
      u.id
    );
    const activeFlag = u.isActive ? '[ACTIVE]' : '[inactive]';
    console.log(`[recalc-performance] ${activeFlag} ${u.name}: ${u.trades} trades, WR ${u.winRate}%, PnL $${u.totalPnL}, Sharpe ${u.sharpeRatio}`);
  }
  
  db.close();
  console.log(`[recalc-performance] Updated ${updates.length} strategies with live performance data`);
  return updates;
}

recalculatePerformance();
