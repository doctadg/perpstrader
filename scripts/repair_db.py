#!/usr/bin/env python3
"""Diagnose trading.db corruption and attempt repair."""
import sqlite3, os, sys, shutil, time
from pathlib import Path

DB = "/home/d/PerpsTrader/data/trading.db"
WAL = DB + "-wal"
SHM = DB + "-shm"
RECOVERY = "/home/d/PerpsTrader/data/trading_recovered.db"

print(f"DB size:  {os.path.getsize(DB) / 1e9:.1f} GB")
print(f"WAL size: {os.path.getsize(WAL) / 1e6:.1f} MB")
print(f"SHM size: {os.path.getsize(SHM) / 1024:.1f} KB")

# ── Attempt 1: Backup API from immutable source ──
print("\n=== Attempt 1: Backup API (immutable source) ===")
try:
    src = sqlite3.connect(f"file:{DB}?immutable=1", uri=True)
    dst = sqlite3.connect(RECOVERY)
    src.backup(dst)
    dst.close()
    src.close()
    
    # Verify the backup
    check = sqlite3.connect(RECOVERY)
    count = check.execute("SELECT count(*) FROM market_data").fetchone()[0]
    trades = check.execute("SELECT count(*) FROM trades").fetchone()[0]
    print(f"  SUCCESS: {count} market_data rows, {trades} trades")
    check.close()
    
    # Integrity check
    check = sqlite3.connect(RECOVERY)
    result = check.execute("PRAGMA integrity_check(5);").fetchone()[0]
    print(f"  Integrity: {result}")
    check.close()
    
    if result == "ok":
        print("  Recovery DB is clean. Ready to swap.")
    else:
        print(f"  WARNING: integrity check returned: {result}")
    
    sys.exit(0)
except Exception as e:
    print(f"  FAILED: {e}")

# ── Attempt 2: Direct checkpoint (requires no other connections) ──
print("\n=== Attempt 2: Direct checkpoint ===")
try:
    conn = sqlite3.connect(DB, timeout=5)
    result = conn.execute("PRAGMA wal_checkpoint(TRUNCATE);").fetchone()
    print(f"  Checkpoint result: {result}")
    count = conn.execute("SELECT count(*) FROM market_data").fetchone()[0]
    print(f"  market_data: {count} rows")
    conn.close()
    print("  SUCCESS - WAL checkpointed")
    sys.exit(0)
except Exception as e:
    print(f"  FAILED: {e}")

# ── Attempt 3: Reopen without WAL ──
print("\n=== Attempt 3: Delete WAL and reopen ===")
print("  This loses uncommitted WAL data but repairs the DB.")
try:
    os.remove(WAL)
    os.remove(SHM)
    conn = sqlite3.connect(DB, timeout=5)
    conn.execute("PRAGMA journal_mode=WAL;")
    count = conn.execute("SELECT count(*) FROM market_data").fetchone()[0]
    trades = conn.execute("SELECT count(*) FROM trades").fetchone()[0]
    print(f"  market_data: {count} rows, trades: {trades}")
    result = conn.execute("PRAGMA integrity_check(5);").fetchone()[0]
    print(f"  Integrity: {result}")
    conn.close()
    print("  SUCCESS")
    sys.exit(0)
except Exception as e:
    print(f"  FAILED: {e}")

print("\nAll attempts failed. Manual intervention needed.")
sys.exit(1)
