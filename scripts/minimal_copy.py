#!/usr/bin/env python3
"""Minimal clean copy of market_data and trades."""
import sqlite3, os, time

DB = "/home/d/PerpsTrader/data/trading.db"
CLEAN = "/home/d/PerpsTrader/data/trading_clean.db"

t0 = time.time()
src = sqlite3.connect(f"file:{DB}?immutable=1", uri=True, timeout=30)
src.row_factory = sqlite3.Row

if os.path.exists(CLEAN):
    os.remove(CLEAN)
dst = sqlite3.connect(CLEAN)
dst.execute("PRAGMA journal_mode=WAL;")

for tbl in ["market_data", "trades", "strategies"]:
    print(f"Copying {tbl}...", flush=True)
    try:
        schema = src.execute(f"SELECT sql FROM sqlite_master WHERE name='{tbl}'").fetchone()
        if not schema or not schema[0]:
            print(f"  No schema, skipping")
            continue
        dst.execute(schema[0])
        
        cursor = src.execute(f"SELECT * FROM [{tbl}]")
        cols = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
        
        if rows:
            ph = ",".join(["?"] * len(cols))
            dst.executemany(
                f"INSERT INTO [{tbl}] VALUES ({ph})",
                [tuple(row[c] for c in cols) for row in rows]
            )
        dst.commit()
        print(f"  {len(rows)} rows ({time.time()-t0:.1f}s)", flush=True)
    except Exception as e:
        print(f"  Error: {e}", flush=True)

# Verify
for tbl in ["market_data", "trades"]:
    count = dst.execute(f"SELECT count(*) FROM [{tbl}]").fetchone()[0]
    print(f"Verify {tbl}: {count} rows")

print(f"Integrity: {dst.execute('PRAGMA integrity_check;').fetchone()[0]}")
print(f"Size: {os.path.getsize(CLEAN)/1024:.1f} KB ({time.time()-t0:.1f}s)")
src.close()
dst.close()
