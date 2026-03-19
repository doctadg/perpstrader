#!/usr/bin/env python3
"""Copy data from immutable source to a clean new database."""
import sqlite3, os, sys, time

DB = "/home/d/PerpsTrader/data/trading.db"
CLEAN = "/home/d/PerpsTrader/data/trading_clean.db"

src = sqlite3.connect(f"file:{DB}?immutable=1", uri=True)
src.row_factory = sqlite3.Row

# Remove existing clean db
if os.path.exists(CLEAN):
    os.remove(CLEAN)

dst = sqlite3.connect(CLEAN)
dst.execute("PRAGMA journal_mode=WAL;")
dst.execute("PRAGMA synchronous=NORMAL;")

print("Reading schema from source...")
tables_info = src.execute(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
).fetchall()

for name, sql in tables_info:
    if not sql:
        continue
    print(f"\n  Table: {name}")
    dst.execute(sql)
    
    # Get column info
    cols = [r[1] for r in src.execute(f"PRAGMA table_info([{name}])").fetchall()]
    placeholders = ",".join(["?"] * len(cols))
    
    # Copy in batches
    batch_size = 5000
    offset = 0
    total = 0
    t0 = time.time()
    
    while True:
        rows = src.execute(
            f"SELECT * FROM [{name}] LIMIT {batch_size} OFFSET {offset}"
        ).fetchall()
        
        if not rows:
            break
        
        row_tuples = [tuple(r[c] for c in cols) for r in rows]
        dst.executemany(f"INSERT INTO [{name}] VALUES ({placeholders})", row_tuples)
        total += len(rows)
        offset += batch_size
        
        if total % 5000 == 0:
            elapsed = time.time() - t0
            print(f"    {total} rows ({elapsed:.1f}s)")
    
    dst.commit()
    elapsed = time.time() - t0
    print(f"  -> {total} rows copied ({elapsed:.1f}s)")

# Also copy indexes
print("\nCopying indexes...")
indexes = src.execute(
    "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"
).fetchall()
for (sql,) in indexes:
    try:
        dst.execute(sql)
    except Exception as e:
        print(f"  Index error (skipping): {e}")
dst.commit()

# Integrity check
print("\nVerifying...")
result = dst.execute("PRAGMA integrity_check(3);").fetchone()[0]
print(f"Integrity: {result}")

md = dst.execute("SELECT count(*) FROM market_data").fetchone()[0]
tr = dst.execute("SELECT count(*) FROM trades").fetchone()[0]
print(f"market_data: {md}, trades: {tr}")

dst.close()
src.close()

print(f"\nClean DB written to: {CLEAN}")
print(f"Size: {os.path.getsize(CLEAN) / 1024:.1f} KB")
