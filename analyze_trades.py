#!/usr/bin/env python3
import sqlite3
from datetime import datetime

conn = sqlite3.connect('data/pumpfun.db')
c = conn.cursor()

# Get date range of trades by score bucket
print('--- Trade date ranges by score ---')

# Low score trades (0.40-0.49)
c.execute("""
    SELECT MIN(closed_at), MAX(closed_at), COUNT(*)
    FROM pumpfun_trade_outcomes 
    WHERE entry_score >= 0.40 AND entry_score < 0.50
""")
row = c.fetchone()
print(f'0.40-0.49: {row[2]} trades, range: {row[0]} to {row[1]}')

# High score trades (0.60+)
c.execute("""
    SELECT MIN(closed_at), MAX(closed_at), COUNT(*)
    FROM pumpfun_trade_outcomes 
    WHERE entry_score >= 0.60
""")
row = c.fetchone()
print(f'0.60+: {row[2]} trades, range: {row[0]} to {row[1]}')

# Check recent trades (last 7 days)
c.execute("""
    SELECT 
        CASE 
            WHEN entry_score < 0.30 THEN '0.00-0.29'
            WHEN entry_score < 0.40 THEN '0.30-0.39'
            WHEN entry_score < 0.50 THEN '0.40-0.49'
            WHEN entry_score < 0.60 THEN '0.50-0.59'
            WHEN entry_score < 0.70 THEN '0.60-0.69'
            ELSE '0.70-1.00'
        END as bucket,
        COUNT(*) as cnt
    FROM pumpfun_trade_outcomes 
    WHERE closed_at >= datetime('now', '-7 days')
    GROUP BY bucket
""")
print('\n--- Last 7 days trades by score ---')
for row in c.fetchall():
    print(f'{row[0]}: {row[1]} trades')

# Win rate by score bucket
print('\n--- Win rate by score bucket ---')
c.execute("""
    SELECT 
        CASE 
            WHEN entry_score < 0.30 THEN '0.00-0.29'
            WHEN entry_score < 0.40 THEN '0.30-0.39'
            WHEN entry_score < 0.50 THEN '0.40-0.49'
            WHEN entry_score < 0.60 THEN '0.50-0.59'
            WHEN entry_score < 0.70 THEN '0.60-0.69'
            ELSE '0.70-1.00'
        END as bucket,
        COUNT(*) as cnt,
        SUM(CASE WHEN pnl_pct > 0 THEN 1 ELSE 0 END) as wins,
        AVG(pnl_pct) as avg_pnl,
        MIN(closed_at) as oldest,
        MAX(closed_at) as newest
    FROM pumpfun_trade_outcomes 
    GROUP BY bucket
    ORDER BY bucket
""")
for row in c.fetchall():
    win_rate = (row[2] / row[1] * 100) if row[1] > 0 else 0
    print(f'{row[0]}: {row[1]} trades, {win_rate:.1f}% WR, avg PnL {row[3]:.1f}%, dates: {row[4]} to {row[5]}')

conn.close()
