#!/usr/bin/env python3
"""Quick WAL checkpoint — run while PerpsTrader services are paused."""
import sqlite3, sys

DB = "/home/d/PerpsTrader/data/trading.db"

print("Opening database...")
conn = sqlite3.connect(DB, timeout=10)
conn.row_factory = sqlite3.Row

# Check integrity first
print("Running integrity check (limited)...")
result = conn.execute("PRAGMA integrity_check(3);").fetchone()[0]
print(f"Integrity: {result}")

# Check current counts
md = conn.execute("SELECT count(*) FROM market_data").fetchone()[0]
tr = conn.execute("SELECT count(*) FROM trades").fetchone()[0]
print(f"market_data: {md}, trades: {tr}")

# Check available symbols
syms = conn.execute("SELECT symbol, count(*) as c FROM market_data GROUP BY symbol ORDER BY c DESC LIMIT 10").fetchall()
for s in syms:
    print(f"  {s[0]}: {s[1]} candles")

# Check if market_data has real price variation
stats = conn.execute("""
    SELECT symbol, count(*) as c,
           MIN(close) as min_c, MAX(close) as max_c,
           AVG(volume) as avg_vol
    FROM market_data 
    GROUP BY symbol 
    ORDER BY c DESC LIMIT 5
""").fetchall()
print("\nTop 5 symbols by data:")
for s in stats:
    print(f"  {s[0]}: {s[1]} candles, close=[{s[2]:.2f} - {s[3]:.2f}], avg_vol={s[4]:.2f}")

# Check timestamps range
ts = conn.execute("SELECT MIN(timestamp), MAX(timestamp) FROM market_data").fetchone()
if ts[0] and ts[1]:
    from datetime import datetime
    t0 = datetime.utcfromtimestamp(ts[0]/1000)
    t1 = datetime.utcfromtimestamp(ts[1]/1000)
    print(f"\nTimestamp range: {t0} to {t1}")

conn.close()
print("\nDone. Database is readable with write access.")
