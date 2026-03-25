#!/usr/bin/env python3
"""Diagnose PerpsTrader state for training cycle"""
import sqlite3
import json
from datetime import datetime, timedelta

db_path = "/home/d/PerpsTrader/data/trading.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("=" * 60)
print("PERPSTRADER DIAGNOSIS")
print("=" * 60)

# Active strategies
print("\n=== ACTIVE STRATEGIES ===")
cursor.execute("SELECT id, name, type, isActive, performance FROM strategies WHERE isActive=1")
active = cursor.fetchall()
print(f"Count: {len(active)}")
for row in active:
    perf = json.loads(row['performance']) if row['performance'] else {}
    print(f"  [{row['type']}] {row['name'][:40]}")
    print(f"    Win Rate: {perf.get('winRate', 'N/A')}, Sharpe: {perf.get('sharpeRatio', 'N/A')}, PF: {perf.get('profitFactor', 'N/A')}")

# Strategy type diversity
print("\n=== STRATEGY TYPE DIVERSITY ===")
cursor.execute("""
    SELECT type, 
           COUNT(*) as total,
           SUM(CASE WHEN isActive=1 THEN 1 ELSE 0 END) as active
    FROM strategies 
    GROUP BY type
    ORDER BY active DESC
""")
for row in cursor.fetchall():
    print(f"  {row['type']}: {row['active']} active / {row['total']} total")

# Recent trade performance
print("\n=== RECENT TRADES (last 24h) ===")
cursor.execute("""
    SELECT symbol, side, 
           COUNT(*) as trades,
           SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
           SUM(pnl) as total_pnl,
           AVG(pnl) as avg_pnl
    FROM trades 
    WHERE timestamp > datetime('now', '-24 hours')
    AND status = 'FILLED'
    GROUP BY symbol, side
    ORDER BY total_pnl DESC
""")
for row in cursor.fetchall():
    wr = (row['wins'] / row['trades'] * 100) if row['trades'] > 0 else 0
    print(f"  {row['symbol']} {row['side']}: {row['trades']} trades, {wr:.0f}% WR, ${row['total_pnl']:.4f} PnL")

# Overall trade stats
print("\n=== OVERALL STATS ===")
cursor.execute("""
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl,
        MAX(pnl) as best_trade,
        MIN(pnl) as worst_trade
    FROM trades 
    WHERE status = 'FILLED' AND pnl IS NOT NULL
""")
row = cursor.fetchone()
wr = (row['wins'] / row['total'] * 100) if row['total'] > 0 else 0
print(f"  Total trades: {row['total']}")
print(f"  Win rate: {wr:.1f}% ({row['wins']} wins, {row['losses']} losses)")
print(f"  Total PnL: ${row['total_pnl']:.4f}")
print(f"  Avg PnL: ${row['avg_pnl']:.4f}")
print(f"  Best: ${row['best_trade']:.4f}, Worst: ${row['worst_trade']:.4f}")

# Check strategy_generations for evolution history
print("\n=== STRATEGY EVOLUTION ===")
cursor.execute("SELECT COUNT(*) FROM strategy_generations")
print(f"  Generation records: {cursor.fetchone()[0]}")

cursor.execute("""
    SELECT parent_id, child_id, mutation_type, performance_delta, created_at 
    FROM strategy_generations 
    ORDER BY created_at DESC LIMIT 5
""")
for row in cursor.fetchall():
    print(f"  {row['mutation_type']}: delta={row['performance_delta']} at {row['created_at']}")

# Check for underperforming strategies
print("\n=== POTENTIAL ISSUES ===")

# Check for stale strategies (no trades recently)
cursor.execute("""
    SELECT s.id, s.name, s.type, COUNT(t.id) as recent_trades
    FROM strategies s
    LEFT JOIN trades t ON t.strategyId = s.id AND t.timestamp > datetime('now', '-24 hours')
    WHERE s.isActive = 1
    GROUP BY s.id
    HAVING recent_trades = 0
""")
stale = cursor.fetchall()
if stale:
    print(f"  ⚠ {len(stale)} active strategies with 0 trades in 24h")
    for s in stale[:5]:
        print(f"    - {s['name'][:40]}")

# Check symbols with high loss rate
cursor.execute("""
    SELECT symbol, 
           COUNT(*) as trades,
           SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses,
           SUM(pnl) as total_pnl
    FROM trades 
    WHERE timestamp > datetime('now', '-24 hours')
    AND status = 'FILLED'
    GROUP BY symbol
    HAVING losses > 2 AND total_pnl < 0
    ORDER BY total_pnl ASC
""")
losing = cursor.fetchall()
if losing:
    print(f"  ⚠ Symbols with net losses in 24h:")
    for l in losing[:5]:
        print(f"    - {l['symbol']}: {l['losses']} losses, ${l['total_pnl']:.4f}")

conn.close()
print("\n" + "=" * 60)
