#!/usr/bin/env python3
"""Try multiple recovery strategies for corrupted trading.db."""
import sqlite3, os, sys, shutil
from pathlib import Path

DB = "/home/d/PerpsTrader/data/trading.db"
WAL = DB + "-wal"
SHM = DB + "-shm"
RECOVERY = "/home/d/PerpsTrader/data/trading_recovered.db"
WAL_RECOVERY = "/home/d/PerpsTrader/data/trading_wal_recovered.db"

print(f"DB:  {os.path.getsize(DB) / 1e9:.2f} GB")
print(f"WAL: {os.path.getsize(WAL) / 1e6:.2f} MB")

# ── Strategy 1: Check if it's page-level corruption we can skip ──
print("\n=== Strategy 1: Read individual tables ===")
try:
    conn = sqlite3.connect(DB, timeout=5)
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    print(f"Found {len(tables)} tables")
    
    for (tbl,) in tables:
        try:
            count = conn.execute(f"SELECT count(*) FROM [{tbl}]").fetchone()[0]
            print(f"  {tbl}: {count} rows")
        except Exception as e:
            print(f"  {tbl}: ERROR - {e}")
    conn.close()
except Exception as e:
    print(f"  FAILED: {e}")

# ── Strategy 2: Use the .recover equivalent (iterate tables) ──
print("\n=== Strategy 2: Selective table dump to new DB ===")
try:
    src = sqlite3.connect(DB, timeout=5)
    dst = sqlite3.connect(RECOVERY)
    
    tables_to_copy = []
    for (tbl,) in src.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
        try:
            # Try to read from this table
            src.execute(f"SELECT * FROM [{tbl}] LIMIT 1").fetchone()
            tables_to_copy.append(tbl)
        except:
            print(f"  Skipping corrupted table: {tbl}")
    
    for tbl in tables_to_copy:
        try:
            # Get schema
            schema = src.execute(f"SELECT sql FROM sqlite_master WHERE name='{tbl}'").fetchone()[0]
            if schema:
                dst.execute(schema)
            
            # Copy data
            rows = src.execute(f"SELECT * FROM [{tbl}]").fetchall()
            if rows:
                cols = [d[0] for d in src.execute(f"SELECT * FROM [{tbl}] LIMIT 1").description]
                placeholders = ",".join(["?"] * len(cols))
                dst.executemany(f"INSERT INTO [{tbl}] VALUES ({placeholders})", rows)
            print(f"  Copied {tbl}: {len(rows)} rows")
        except Exception as e:
            print(f"  Error copying {tbl}: {e}")
    
    dst.commit()
    
    # Verify
    for tbl in tables_to_copy:
        count = dst.execute(f"SELECT count(*) FROM [{tbl}]").fetchone()[0]
        print(f"  Verified {tbl}: {count} rows")
    
    dst.execute("PRAGMA integrity_check;")
    result = dst.execute("PRAGMA integrity_check(1);").fetchone()[0]
    print(f"  Integrity: {result}")
    
    src.close()
    dst.close()
    print("  SUCCESS")
except Exception as e:
    print(f"  FAILED: {e}")
    import traceback
    traceback.print_exc()

# ── Strategy 3: Nuke WAL, work with main DB only ──
print("\n=== Strategy 3: Remove WAL and SHM, reopen ===")
try:
    if os.path.exists(WAL):
        os.remove(WAL)
        print(f"  Removed WAL ({os.path.getsize(WAL) if os.path.exists(WAL) else 0} bytes)")
    if os.path.exists(SHM):
        os.remove(SHM)
        print(f"  Removed SHM")
    
    conn = sqlite3.connect(DB, timeout=5)
    conn.execute("PRAGMA journal_mode=WAL;")
    
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    print(f"  Tables: {len(tables)}")
    
    for (tbl,) in tables:
        try:
            count = conn.execute(f"SELECT count(*) FROM [{tbl}]").fetchone()[0]
            print(f"    {tbl}: {count}")
        except Exception as e:
            print(f"    {tbl}: ERROR - {e}")
    
    result = conn.execute("PRAGMA integrity_check(1);").fetchone()[0]
    print(f"  Integrity: {result}")
    conn.close()
    print("  SUCCESS")
except Exception as e:
    print(f"  FAILED: {e}")

print("\nDone.")
