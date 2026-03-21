#!/usr/bin/env python3
"""Hermes Metrics Export — structured state snapshot for the training loop."""
import sqlite3
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

PROJECT_DIR = "/home/d/PerpsTrader"
DATA_DIR = f"{PROJECT_DIR}/data"
DB_PATH = f"{DATA_DIR}/trading.db"
METRICS_FILE = f"{DATA_DIR}/hermes-metrics-latest.json"
HISTORY_DIR = f"{DATA_DIR}/hermes-metrics-history"

os.makedirs(HISTORY_DIR, exist_ok=True)

def query(sql, params=()):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return rows
    except Exception as e:
        return []

def query_one(sql, params=()):
    try:
        conn = sqlite3.connect(DB_PATH)
        val = conn.execute(sql, params).fetchone()
        conn.close()
        return val[0] if val else 0
    except Exception as e:
        return 0

def query_json(sql, params=()):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        return []

def pm2_grep(pattern, lines=2000):
    try:
        r = subprocess.run(
            ["pm2", "logs", "perps-trader", "--lines", str(lines), "--nostream"],
            capture_output=True, text=True, timeout=10
        )
        text = r.stdout + r.stderr
        count = text.count(pattern)
        return count
    except:
        return 0

def pm2_extract(pattern, lines=500):
    try:
        r = subprocess.run(
            ["pm2", "logs", "perps-trader", "--lines", str(lines), "--nostream"],
            capture_output=True, text=True, timeout=10
        )
        text = r.stdout + r.stderr
        import re
        matches = re.findall(pattern, text)
        return matches[-1] if matches else None
    except:
        return None

def get_pm2_uptime():
    try:
        r = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=10)
        procs = json.loads(r.stdout)
        for p in procs:
            if p.get("name") == "perps-trader":
                return p.get("pm2_env", {}).get("uptime", 0)
        return 0
    except:
        return 0

# Gather data
ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
total_trades = query_one("SELECT COUNT(*) FROM trades")
closed_trades = query_one("SELECT COUNT(*) FROM trades WHERE entryExit='EXIT' AND status='FILLED'")
cancelled_trades = query_one("SELECT COUNT(*) FROM trades WHERE status='CANCELLED'")
open_trades = query_one("SELECT COUNT(*) FROM trades WHERE entryExit='ENTRY' AND status='FILLED'")
total_pnl = query_one("SELECT COALESCE(SUM(pnl), 0) FROM trades WHERE entryExit='EXIT' AND status='FILLED'")
avg_pnl = query_one("SELECT COALESCE(AVG(pnl), 0) FROM trades WHERE entryExit='EXIT' AND status='FILLED'")
winning = query_one("SELECT COUNT(*) FROM trades WHERE entryExit='EXIT' AND status='FILLED' AND pnl > 0")
losing = query_one("SELECT COUNT(*) FROM trades WHERE entryExit='EXIT' AND status='FILLED' AND pnl < 0")
win_rate = round(winning * 100 / closed_trades, 2) if closed_trades > 0 else 0
cancel_rate = round(cancelled_trades * 100 / total_trades, 2) if total_trades > 0 else 0

last_trades = query_json("""
    SELECT id, symbol, side, size, price, pnl, status, timestamp 
    FROM trades ORDER BY rowid DESC LIMIT 10
""")

active_strats = query_json("""
    SELECT id, name, type, parameters, risk_parameters, performance 
    FROM strategies WHERE isActive=1 LIMIT 20
""")

total_strategies = query_one("SELECT COUNT(*) FROM strategies")
active_count = query_one("SELECT COUNT(*) FROM strategies WHERE isActive=1")
total_generations = query_one("SELECT COUNT(*) FROM strategy_generations")
recent_24h = query_one("SELECT COUNT(*) FROM trades WHERE timestamp > datetime('now', '-24 hours')")

symbol_breakdown = query_json("""
    SELECT 
        symbol, 
        COUNT(*) as total,
        SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END) as cancelled,
        SUM(CASE WHEN entryExit='EXIT' AND status='FILLED' AND pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN entryExit='EXIT' AND status='FILLED' AND pnl < 0 THEN 1 ELSE 0 END) as losses,
        COALESCE(SUM(pnl), 0) as total_pnl
    FROM trades 
    WHERE timestamp > datetime('now', '-7 days')
    GROUP BY symbol 
    ORDER BY total DESC 
    LIMIT 15
""")

equity = pm2_extract(r'Account equity: (\$[\d.]+)') or "unknown"
coverage = pm2_extract(r'coverage=([\d.]+)') or "0"
cycle_count = pm2_grep("CYCLE")
critical_count = pm2_grep("CRITICAL")
perps_uptime = get_pm2_uptime()

metrics = {
    "timestamp": ts,
    "account": {"equity": equity, "exchange": "hyperliquid-testnet"},
    "trades": {
        "total": total_trades, "closed": closed_trades, "open": open_trades,
        "cancelled": cancelled_trades, "last_24h": recent_24h,
        "win_rate_pct": win_rate, "cancel_rate_pct": cancel_rate,
        "total_pnl": total_pnl, "avg_pnl": avg_pnl,
        "winning": winning, "losing": losing,
    },
    "last_trades": last_trades,
    "strategies": {"total": total_strategies, "active": active_count, "active_list": active_strats},
    "evolution": {"total_generations": total_generations},
    "symbol_breakdown_7d": symbol_breakdown,
    "system": {
        "cycles_recent": cycle_count,
        "critical_events_recent": critical_count,
        "market_coverage_pct": coverage,
        "perps_uptime_s": perps_uptime,
    },
}

with open(METRICS_FILE, "w") as f:
    json.dump(metrics, f, indent=2, default=str)

# History copy
history_file = f"{HISTORY_DIR}/metrics-{ts}.json"
with open(history_file, "w") as f:
    json.dump(metrics, f, indent=2, default=str)

# Cleanup old history (keep 96 = 24h at 15min)
try:
    import glob
    files = sorted(glob.glob(f"{HISTORY_DIR}/metrics-*.json"))
    for f in files[:-96]:
        os.remove(f)
except:
    pass

print(f"[{ts}] OK trades={total_trades} closed={closed_trades} cancel_rate={cancel_rate}% strategies={active_count} coverage={coverage}%")
