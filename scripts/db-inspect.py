#!/usr/bin/env python3
import sqlite3
import json

db_path = "/home/d/PerpsTrader/data/trading.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [r[0] for r in cursor.fetchall()]
print("=== TABLES ===")
print(", ".join(tables))

# Strategies schema
print("\n=== STRATEGIES SCHEMA ===")
cursor.execute("PRAGMA table_info(strategies);")
for col in cursor.fetchall():
    print(f"  {col[1]}: {col[2]}")

# Trades schema  
print("\n=== TRADES SCHEMA ===")
cursor.execute("PRAGMA table_info(trades);")
for col in cursor.fetchall():
    print(f"  {col[1]}: {col[2]}")

# Active strategies
print("\n=== ALL STRATEGIES (first 10) ===")
cursor.execute("SELECT * FROM strategies LIMIT 10")
cols = [d[0] for d in cursor.description]
print("Columns:", cols)
for row in cursor.fetchall():
    r = dict(row)
    print({k: v for k, v in r.items() if k in ['id', 'name', 'type', 'is_active', 'win_rate', 'profit_factor']})

# Recent trades
print("\n=== RECENT TRADES (last 15) ===")
cursor.execute("SELECT id, symbol, side, status, pnl, timestamp FROM trades ORDER BY timestamp DESC LIMIT 15")
for row in cursor.fetchall():
    print(dict(row))

# Trade status breakdown
print("\n=== TRADE STATUS BREAKDOWN ===")
cursor.execute("SELECT status, COUNT(*), SUM(pnl) FROM trades GROUP BY status")
for row in cursor.fetchall():
    pnl = row[2] if row[2] else 0
    print(f"  {row[0]}: {row[1]} trades, ${pnl:.4f} pnl")

# Check if markets table exists
print("\n=== MARKETS TABLE CHECK ===")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='markets';")
markets = cursor.fetchone()
if markets:
    print("markets table EXISTS")
    cursor.execute("PRAGMA table_info(markets);")
    for col in cursor.fetchall():
        print(f"  {col[1]}: {col[2]}")
else:
    print("markets table DOES NOT EXIST")

# Check strategy type diversity
print("\n=== STRATEGY TYPES ===")
cursor.execute("SELECT type, COUNT(*) as cnt FROM strategies GROUP BY type ORDER BY cnt DESC")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]}")

# Check active strategy count
print("\n=== ACTIVE STRATEGIES ===")
cursor.execute("SELECT COUNT(*) FROM strategies WHERE is_active=1")
count = cursor.fetchone()[0]
print(f"  Active count: {count}")

conn.close()
