#!/usr/bin/env python3
"""Fix remaining tables that failed to copy."""
import sqlite3

DB = "/home/d/PerpsTrader/data/trading.db"
OLD = "/home/d/PerpsTrader/data/trading_old_corrupted.db"

# Open both
old = sqlite3.connect(f"file:{OLD}?immutable=1", uri=True, timeout=10)
new = sqlite3.connect(DB)
new.execute("PRAGMA journal_mode=WAL;")

for tbl in ["ai_insights", "tracked_symbols", "strategy_ideas", 
            "backtest_jobs", "strategy_performance", "safety_events"]:
    try:
        schema = old.execute(f"SELECT sql FROM sqlite_master WHERE name='{tbl}'").fetchone()
        if not schema or not schema[0]:
            print(f"  {tbl}: no schema, skip")
            continue
        
        exists = new.execute(
            "SELECT count(*) FROM sqlite_master WHERE name=?", (tbl,)
        ).fetchone()[0]
        
        if not exists:
            new.execute(schema[0])
        
        cursor = old.execute(f"SELECT * FROM [{tbl}]")
        cols = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
        
        if rows:
            ph = ",".join(["?"] * len(cols))
            new.executemany(
                f"INSERT OR IGNORE INTO [{tbl}] VALUES ({ph})",
                [tuple(r[i] for i in range(len(cols))) for r in rows]
            )
        new.commit()
        print(f"  {tbl}: {len(rows)} rows copied")
    except Exception as e:
        print(f"  {tbl}: {e}")

# Also copy indexes
for (sql,) in old.execute(
    "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL"
).fetchall():
    try:
        new.execute(sql)
    except:
        pass
new.commit()

# Verify
print("\nFinal check:")
for (t,) in new.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
    c = new.execute(f"SELECT count(*) FROM [{t}]").fetchone()[0]
    print(f"  {t}: {c}")
result = new.execute("PRAGMA integrity_check;").fetchone()[0]
print(f"Integrity: {result}")

old.close()
new.close()
