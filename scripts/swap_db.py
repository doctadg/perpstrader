#!/usr/bin/env python3
"""Swap trading.db — copy essential tables, skip bloat."""
import sqlite3, os, shutil

DB = "/home/d/PerpsTrader/data/trading.db"
CLEAN = "/home/d/PerpsTrader/data/trading_clean.db"
WAL = DB + "-wal"
SHM = DB + "-shm"
BACKUP = "/home/d/PerpsTrader/data/trading_old_corrupted.db"

# Essential tables for trading + research
ESSENTIAL = {
    "market_data", "trades", "strategies", "backtest_results",
    "tracked_symbols", "funding_rates", "safety_events",
    "strategy_ideas", "strategy_performance", "backtest_jobs",
    "system_status", "ai_insights", "research_data",
}

# Skip these — large bloat, not needed for trading
SKIP = {"agent_traces", "ingestion_traces", "symbol_ingestion_health", "order_book", "market_trades"}

print("Copying essential tables from immutable source...")
DB_SRC = sqlite3.connect(f"file:{DB}?immutable=1", uri=True, timeout=10)
CLEAN_DST = sqlite3.connect(CLEAN)
CLEAN_DST.execute("PRAGMA journal_mode=WAL;")

all_tables = DB_SRC.execute(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).fetchall()

for name, sql in all_tables:
    if not sql:
        continue
    
    if name in SKIP:
        print(f"  SKIP {name} (bloat)")
        continue
    
    exists = CLEAN_DST.execute(
        "SELECT count(*) FROM sqlite_master WHERE name=?", (name,)
    ).fetchone()[0]
    if exists:
        continue
    
    print(f"  {name}...", end=" ", flush=True)
    CLEAN_DST.execute(sql)
    
    try:
        cursor = DB_SRC.execute(f"SELECT * FROM [{name}]")
        cols = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
        if rows:
            ph = ",".join(["?"] * len(cols))
            CLEAN_DST.executemany(
                f"INSERT INTO [{name}] VALUES ({ph})",
                [tuple(row[c] for c in cols) for row in rows]
            )
        CLEAN_DST.commit()
        print(f"{len(rows)} rows")
    except Exception as e:
        print(f"error: {e}")
        CLEAN_DST.rollback()

# Copy indexes
for (sql,) in DB_SRC.execute(
    "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"
).fetchall():
    try:
        CLEAN_DST.execute(sql)
    except:
        pass
CLEAN_DST.commit()

CLEAN_DST.close()
DB_SRC.close()

# Verify
print("\nVerifying...")
check = sqlite3.connect(CLEAN)
result = check.execute("PRAGMA integrity_check;").fetchone()[0]
for (t,) in check.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
    c = check.execute(f"SELECT count(*) FROM [{t}]").fetchone()[0]
    if c > 0:
        print(f"  {t}: {c}")
check.close()
print(f"Integrity: {result}")

# Swap
print("\nSwapping...")
# Remove old recovery file to free space
for f in ["/home/d/PerpsTrader/data/trading_recovered.db",
          "/home/d/PerpsTrader/data/trading_recovered.db-shm",
          "/home/d/PerpsTrader/data/trading_recovered.db-wal"]:
    if os.path.exists(f):
        os.remove(f)
        print(f"  Removed old recovery file: {os.path.basename(f)}")

shutil.move(DB, BACKUP)
shutil.move(CLEAN, DB)
for f in [WAL, SHM]:
    if os.path.exists(f):
        os.remove(f)

print(f"\nDone.")
print(f"  Corrupted DB -> {BACKUP}")
print(f"  New DB: {DB} ({os.path.getsize(DB)/1024:.1f} KB)")
print(f"  Free space recovered: ~{os.path.getsize(BACKUP)/1e9:.1f} GB")
