#!/bin/bash
# PerpsTrader Metrics Export for Hermes Training Loop
# Dumps current state as JSON for the self-improvement cycle
set -eo pipefail

DB="/home/d/PerpsTrader/data/trading.db"
OUT="/home/d/PerpsTrader/data/hermes-metrics-latest.json"
HISTORY_DIR="/home/d/PerpsTrader/data/hermes-metrics-history"
mkdir -p "$HISTORY_DIR"

python3 << 'PYEOF'
import sqlite3, json, os, time

DB = "/home/d/PerpsTrader/data/trading.db"
OUT = "/home/d/PerpsTrader/data/hermes-metrics-latest.json"
HISTORY_DIR = "/home/d/PerpsTrader/data/hermes-metrics-history"

def q(sql, params=None):
    try:
        c = sqlite3.connect(DB)
        c.row_factory = sqlite3.Row
        r = c.execute(sql, params or []).fetchall()
        c.close()
        return r
    except:
        return []

def q1(sql, params=None):
    try:
        c = sqlite3.connect(DB)
        c.row_factory = sqlite3.Row
        r = c.execute(sql, params or []).fetchone()
        c.close()
        return r[0] if r else 0
    except:
        return 0

def update_strategy_performance():
    """Update strategies.performance from live trades - CRITICAL for Hermes training"""
    import datetime
    try:
        c = sqlite3.connect(DB)
        c.row_factory = sqlite3.Row
        
        # Get all strategies with exits
        rows = c.execute("""SELECT strategyId, 
            COUNT(*) as total_trades,
            SUM(CASE WHEN status='FILLED' THEN 1 ELSE 0 END) as filled,
            SUM(CASE WHEN entryExit='EXIT' AND status='FILLED' THEN 1 ELSE 0 END) as exits,
            SUM(CASE WHEN entryExit='EXIT' AND status='FILLED' THEN pnl ELSE 0 END) as total_pnl,
            SUM(CASE WHEN entryExit='EXIT' AND status='FILLED' AND pnl > 0 THEN 1 ELSE 0 END) as wins,
            SUM(CASE WHEN entryExit='EXIT' AND status='FILLED' AND pnl < 0 THEN 1 ELSE 0 END) as losses,
            SUM(CASE WHEN entryExit='EXIT' AND status='FILLED' AND pnl > 0 THEN pnl ELSE 0 END) as win_pnl,
            SUM(CASE WHEN entryExit='EXIT' AND status='FILLED' AND pnl < 0 THEN ABS(pnl) ELSE 0 END) as loss_pnl
            FROM trades GROUP BY strategyId HAVING exits > 0""").fetchall()
        
        now = datetime.datetime.utcnow().isoformat() + 'Z'
        for r in rows:
            sid = r['strategyId']
            exits = r['exits']
            wins = r['wins']
            losses = r['losses']
            win_rate = (wins / exits * 100) if exits > 0 else 0
            profit_factor = r['win_pnl'] / r['loss_pnl'] if r['loss_pnl'] > 0 else 999.0
            sharpe = (profit_factor * win_rate / 100) * 0.5 if profit_factor < 999 else 10
            
            perf = json.dumps({
                "totalTrades": r['total_trades'],
                "exits": exits,
                "winningTrades": int(wins),
                "losingTrades": int(losses),
                "winRate": round(win_rate, 2),
                "totalPnL": round(r['total_pnl'] or 0, 6),
                "profitFactor": round(profit_factor, 4) if profit_factor < 999 else 999,
                "sharpeRatio": round(sharpe, 4),
                "lastUpdated": now
            })
            c.execute("UPDATE strategies SET performance = ?, updatedAt = ? WHERE id = ?", (perf, now, sid))
        c.commit()
        c.close()
        return len(rows)
    except Exception as e:
        return 0

# Update strategy performance from live trades
updated = update_strategy_performance()

# Trading metrics
entries = q1("SELECT COUNT(*) FROM trades WHERE entryExit='ENTRY' AND status='FILLED'")
exits = q1("SELECT COUNT(*) FROM trades WHERE entryExit='EXIT' AND status='FILLED'")
cancelled = q1("SELECT COUNT(*) FROM trades WHERE entryExit='ENTRY' AND status='CANCELLED'")
realized_pnl = q1("SELECT COALESCE(SUM(pnl),0) FROM trades WHERE entryExit='EXIT' AND status='FILLED'")
wins = q1("SELECT COUNT(*) FROM trades WHERE entryExit='EXIT' AND status='FILLED' AND pnl > 0")
losses = q1("SELECT COUNT(*) FROM trades WHERE entryExit='EXIT' AND status='FILLED' AND pnl < 0")
total = entries + cancelled
cancel_rate = round(cancelled * 100 / total, 1) if total > 0 else 0
win_rate = round(wins * 100 / exits, 1) if exits > 0 else 0

# Recent 24h
recent_24h = q1("SELECT COUNT(*) FROM trades WHERE timestamp > datetime('now', '-24 hours')")
recent_filled = q1("SELECT COUNT(*) FROM trades WHERE timestamp > datetime('now', '-24 hours') AND status='FILLED'")
recent_cancelled = q1("SELECT COUNT(*) FROM trades WHERE timestamp > datetime('now', '-24 hours') AND status='CANCELLED'")

# Timestamps
last_entry = q("SELECT timestamp FROM trades WHERE entryExit='ENTRY' ORDER BY timestamp DESC LIMIT 1")
last_exit = q("SELECT timestamp FROM trades WHERE entryExit='EXIT' ORDER BY timestamp DESC LIMIT 1")

# Strategies
active_strats = q1("SELECT COUNT(*) FROM strategies WHERE isActive=1")
active_types_raw = q("SELECT DISTINCT type FROM strategies WHERE isActive=1")
active_types = [r[0] for r in active_types_raw]
pending_ideas = q1("SELECT COUNT(*) FROM strategy_ideas WHERE status='PENDING'")
total_backtested = q1("SELECT COUNT(*) FROM strategy_performance")

# Top backtested strategies
# NOTE: strategy_performance has no name/type columns — must JOIN with strategies
top_strats = q("""
    SELECT s.name, s.type, sp.sharpe, sp.win_rate, sp.profit_factor, sp.max_drawdown, sp.total_trades
    FROM strategy_performance sp
    JOIN strategies s ON sp.strategy_id = s.id
    WHERE sp.total_trades > 10
    ORDER BY sp.sharpe DESC LIMIT 5
""")

# Type performance (aggregate via strategies table for type info)
type_perf = q("""
    SELECT s.type, COUNT(*) as cnt,
           ROUND(AVG(sp.sharpe),2) as avg_sharpe,
           ROUND(AVG(sp.win_rate*100),1) as avg_wr,
           ROUND(AVG(sp.profit_factor),2) as avg_pf
    FROM strategy_performance sp
    JOIN strategies s ON sp.strategy_id = s.id
    WHERE sp.total_trades > 0
    GROUP BY s.type ORDER BY AVG(sp.sharpe) DESC
""")

# Best exits
best_exits = q("""
    SELECT symbol, side, ROUND(pnl,6) as pnl, timestamp
    FROM trades WHERE entryExit='EXIT' AND status='FILLED'
    ORDER BY pnl DESC LIMIT 5
""")

# System PID
pid = 0
try:
    import subprocess
    p = subprocess.run(["pgrep", "-f", "bin/main.js"], capture_output=True, text=True)
    pid = int(p.stdout.strip().split()[0]) if p.stdout.strip() else 0
except:
    pass

metrics = {
    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "system": {"pid": pid},
    "trading": {
        "total_trades": total,
        "entries_filled": entries,
        "entries_cancelled": cancelled,
        "exits_filled": exits,
        "cancel_rate": cancel_rate,
        "realized_pnl": round(realized_pnl, 6),
        "wins": wins,
        "losses": losses,
        "win_rate": win_rate,
        "last_entry": last_entry[0][0] if last_entry else "NEVER",
        "last_exit": last_exit[0][0] if last_exit else "NEVER",
        "recent_24h": {
            "total": recent_24h,
            "filled": recent_filled,
            "cancelled": recent_cancelled
        }
    },
    "strategies": {
        "active_count": active_strats,
        "active_types": active_types,
        "pending_ideas": pending_ideas,
        "total_backtested": total_backtested,
        "top_backtested": [{"name": r[0], "type": r[1], "sharpe": r[2], "wr": r[3], "pf": r[4], "dd": r[5], "trades": r[6]} for r in top_strats],
        "type_performance": [{"type": r[0], "count": r[1], "avg_sharpe": r[2], "avg_wr": r[3], "avg_pf": r[4]} for r in type_perf]
    },
    "best_exits": [{"symbol": r[0], "side": r[1], "pnl": r[2], "timestamp": r[3]} for r in best_exits]
}

os.makedirs(HISTORY_DIR, exist_ok=True)
with open(OUT, "w") as f:
    json.dump(metrics, f, indent=2)

# Save to history
hist_file = os.path.join(HISTORY_DIR, f"metrics-{time.strftime('%Y%m%d-%H%M%S', time.gmtime())}.json")
with open(hist_file, "w") as f:
    json.dump(metrics, f, indent=2)

# Keep last 100
hist_files = sorted(os.listdir(HISTORY_DIR))
for old in hist_files[:-100]:
    os.remove(os.path.join(HISTORY_DIR, old))

print(f"OK {metrics['timestamp']}")
PYEOF
