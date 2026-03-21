#!/usr/bin/env python3
"""Pump.fun metrics export for Hermes autonomous training.
Outputs structured JSON to data/pumpfun-metrics-latest.json
Usage: python3 /home/d/PerpsTrader/scripts/pumpfun-metrics.py
"""

import sqlite3
import json
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'pumpfun.db')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'pumpfun-metrics-history')
OUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'pumpfun-metrics-latest.json')

os.makedirs(OUT_DIR, exist_ok=True)

def query(db, sql, params=None):
    try:
        return db.execute(sql, params or []).fetchall()
    except Exception:
        return []

def query_one(db, sql, params=None):
    try:
        row = db.execute(sql, params or []).fetchone()
        return row[0] if row else None
    except Exception:
        return None

def main():
    if not os.path.exists(DB_PATH):
        out = {"error": "pumpfun.db not found", "timestamp": datetime.now(timezone.utc).isoformat()}
        with open(OUT_FILE, 'w') as f:
            json.dump(out, f, indent=2)
        return

    db = sqlite3.connect(DB_PATH)
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    # Portfolio summary
    open_pos = query_one(db, "SELECT COUNT(*) FROM pumpfun_positions WHERE status='OPEN'")
    closed_pos = query_one(db, "SELECT COUNT(*) FROM pumpfun_positions WHERE status='CLOSED'")
    total_invested = query_one(db, "SELECT COALESCE(SUM(sol_spent), 0) FROM pumpfun_positions")
    total_realized = query_one(db, "SELECT COALESCE(SUM(exit_sol - entry_sol), 0) FROM pumpfun_trade_outcomes")
    total_pnl = query_one(db, "SELECT COALESCE(SUM(pnl_sol), 0) FROM pumpfun_trade_outcomes")
    total_entry = query_one(db, "SELECT SUM(entry_sol) FROM pumpfun_trade_outcomes")
    pnl_pct = round(100.0 * total_pnl / total_entry, 2) if total_entry and total_entry > 0 else 0

    portfolio = {
        "open_positions": open_pos or 0,
        "closed_positions": closed_pos or 0,
        "total_invested_sol": round(total_invested, 4) if total_invested else 0,
        "total_realized_sol": round(total_realized, 4) if total_realized else 0,
        "total_pnl_sol": round(total_pnl, 4) if total_pnl else 0,
        "total_pnl_pct": pnl_pct,
    }

    # Trade stats
    total_buys = query_one(db, "SELECT COUNT(*) FROM pumpfun_trades WHERE side='BUY'")
    total_sells = query_one(db, "SELECT COUNT(*) FROM pumpfun_trades WHERE side='SELL'")
    trades_24h = query_one(db, "SELECT COUNT(*) FROM pumpfun_trades WHERE timestamp > datetime('now', '-24 hours')")
    trades_7d = query_one(db, "SELECT COUNT(*) FROM pumpfun_trades WHERE timestamp > datetime('now', '-7 days')")

    trade_stats = {
        "total_buys": total_buys,
        "total_sells": total_sells,
        "trades_last_24h": trades_24h,
        "trades_last_7d": trades_7d,
    }

    # Outcome breakdown
    outcomes = []
    for row in db.execute("""
        SELECT outcome, COUNT(*) as cnt,
               ROUND(AVG(pnl_sol), 4) as avg_pnl,
               ROUND(AVG(pnl_pct), 2) as avg_pnl_pct,
               ROUND(AVG(hold_time_minutes), 1) as avg_hold,
               ROUND(SUM(pnl_sol), 4) as total_pnl
        FROM pumpfun_trade_outcomes
        GROUP BY outcome
    """).fetchall():
        outcomes.append({
            "outcome": row[0], "count": row[1], "avg_pnl_sol": row[2],
            "avg_pnl_pct": row[3], "avg_hold_min": row[4], "total_pnl_sol": row[5],
        })

    # Win rate
    total_outcomes = query_one(db, "SELECT COUNT(*) FROM pumpfun_trade_outcomes")
    wins = query_one(db, "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE pnl_sol > 0")
    losses = query_one(db, "SELECT COUNT(*) FROM pumpfun_trade_outcomes WHERE pnl_sol <= 0")
    win_rate = round(100.0 * wins / total_outcomes, 1) if total_outcomes and total_outcomes > 0 else 0

    # Score accuracy analysis
    score_analysis = []
    for row in db.execute("""
        SELECT
            CASE
                WHEN entry_score >= 0.7 THEN '0.70-1.00'
                WHEN entry_score >= 0.5 THEN '0.50-0.69'
                WHEN entry_score >= 0.3 THEN '0.30-0.49'
                ELSE '0.00-0.29'
            END as score_range,
            COUNT(*) as cnt,
            ROUND(AVG(pnl_sol), 4) as avg_pnl,
            ROUND(AVG(pnl_pct), 2) as avg_pnl_pct,
            SUM(CASE WHEN pnl_sol > 0 THEN 1 ELSE 0 END) as wins
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
        GROUP BY score_range
        ORDER BY score_range DESC
    """).fetchall():
        wr = round(100.0 * row[4] / row[1], 1) if row[1] > 0 else 0
        score_analysis.append({
            "score_range": row[0], "count": row[1], "avg_pnl_sol": row[2],
            "avg_pnl_pct": row[3], "win_rate": wr,
        })

    # Recent trades (last 20)
    recent_trades = []
    for row in db.execute("""
        SELECT token_symbol, side, ROUND(sol_amount, 4), ROUND(pnl, 4),
               trade_reason, ROUND(entry_score, 2), timestamp
        FROM pumpfun_trades ORDER BY timestamp DESC LIMIT 20
    """).fetchall():
        recent_trades.append({
            "token": row[0], "side": row[1], "sol": row[2], "pnl": row[3],
            "reason": row[4], "score": row[5], "timestamp": row[6],
        })

    # Open positions
    open_positions = []
    for row in db.execute("""
        SELECT token_symbol, ROUND(sol_spent, 4), ROUND(tokens_owned, 0),
               ROUND(entry_score, 2), ROUND(current_multiplier, 3),
               ROUND(max_multiplier, 3), buy_timestamp
        FROM pumpfun_positions WHERE status = 'OPEN'
    """).fetchall():
        buy_ts = datetime.fromisoformat(row[6].replace('Z', '+00:00'))
        hold_min = round((datetime.now(timezone.utc) - buy_ts).total_seconds() / 60, 1)
        open_positions.append({
            "token": row[0], "sol_spent": row[1], "tokens_owned": row[2],
            "entry_score": row[3], "current_mult": row[4], "max_mult": row[5],
            "hold_min": hold_min,
        })

    # Discovery stats
    total_analyzed = query_one(db, "SELECT COUNT(*) FROM pumpfun_tokens")
    buy_recs = query_one(db, "SELECT COUNT(*) FROM pumpfun_tokens WHERE recommendation = 'BUY'")
    hold_recs = query_one(db, "SELECT COUNT(*) FROM pumpfun_tokens WHERE recommendation = 'HOLD'")
    avg_score = query_one(db, "SELECT ROUND(AVG(overall_score), 3) FROM (SELECT overall_score FROM pumpfun_tokens ORDER BY created_at DESC LIMIT 100)")
    high_conf = query_one(db, "SELECT COUNT(*) FROM pumpfun_tokens WHERE overall_score >= 0.7")

    discovery = {
        "total_analyzed": total_analyzed or 0,
        "total_buy_recs": buy_recs or 0,
        "total_hold_recs": hold_recs or 0,
        "avg_score_last_100": avg_score or 0,
        "high_confidence_available": high_conf or 0,
    }

    # TP analysis
    tp_initial = query_one(db, "SELECT COUNT(*) FROM pumpfun_trades WHERE trade_reason LIKE 'TP_INITIAL%'")
    tp_safe = query_one(db, "SELECT COUNT(*) FROM pumpfun_trades WHERE trade_reason LIKE 'TP_SAFE%'")
    tp_moon = query_one(db, "SELECT COUNT(*) FROM pumpfun_trades WHERE trade_reason LIKE 'TP_MOON%'")
    stop_losses = query_one(db, "SELECT COUNT(*) FROM pumpfun_trades WHERE trade_reason = 'STOP_LOSS'")
    emergency = query_one(db, "SELECT COUNT(*) FROM pumpfun_trades WHERE trade_reason = 'EMERGENCY'")

    tp_analysis = {
        "tp_initial_hit": tp_initial, "tp_safe_hit": tp_safe, "tp_moon_hit": tp_moon,
        "stop_losses": stop_losses, "emergency_sells": emergency,
    }

    # Assemble
    metrics = {
        "timestamp": ts,
        "service": "pumpfun-sniper",
        "portfolio": portfolio,
        "trade_stats": trade_stats,
        "outcomes": outcomes,
        "win_rate": {"overall_win_rate": win_rate, "profitable_trades": wins, "losing_trades": losses},
        "score_analysis": score_analysis,
        "recent_trades": recent_trades,
        "open_positions": open_positions,
        "discovery": discovery,
        "tp_analysis": tp_analysis,
    }

    with open(OUT_FILE, 'w') as f:
        json.dump(metrics, f, indent=2)

    # Save to history
    hist_file = os.path.join(OUT_DIR, f"metrics-{ts}.json")
    with open(hist_file, 'w') as f:
        json.dump(metrics, f, indent=2)

    # Prune old history (keep last 200)
    hist_files = sorted(os.listdir(OUT_DIR))
    for old in hist_files[:-200]:
        os.remove(os.path.join(OUT_DIR, old))

    print(f"Metrics exported to {OUT_FILE}")

if __name__ == '__main__':
    main()
