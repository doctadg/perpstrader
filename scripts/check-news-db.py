#!/usr/bin/env python3
import sqlite3

db_path = "/home/d/PerpsTrader/data/news.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = [r[0] for r in cursor.fetchall()]
print("=== NEWS DB TABLES ===")
print(", ".join(tables))

# Check for markets table
if 'markets' in tables:
    print("\n=== MARKETS TABLE EXISTS IN NEWS.DB ===")
    cursor.execute("SELECT COUNT(*) FROM markets")
    print(f"Row count: {cursor.fetchone()[0]}")
else:
    print("\n=== MARKETS TABLE MISSING FROM NEWS.DB ===")
    print("This is the root cause of the error!")

conn.close()
