#!/usr/bin/env python3
"""Pump.fun weight trainer — analyzes trade outcomes and mutates scoring weights.

Usage:
  python3 train-weights.py [--dry-run] [--output DIR]

Reads pumpfun.db outcomes, computes per-bucket win rates, applies
mutation rules, and writes updated weights to config.yaml.
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path("/home/d/PerpsTrader")
DB_PATH = PROJECT_ROOT / "data" / "pumpfun.db"
CONFIG_PATH = PROJECT_ROOT / "config" / "config.json"
HISTORY_DIR = PROJECT_ROOT / "data" / "pumpfun-training-history"
METRICS_FILE = PROJECT_ROOT / "data" / "pumpfun-metrics-latest.json"

MIN_TRADES_FOR_MUTATION = 20
MUTATION_STEP = 0.05

# Default weights (must match score-node.ts)
DEFAULT_WEIGHTS = {
    "social": 0.30,
    "freshness": 0.20,
    "websiteQuality": 0.10,
    "aiAnalysis": 0.15,
    "tokenQuality": 0.15,
    "redFlagPenalty": 0.10,
}

WEIGHT_BOUNDS = {
    "social": (0.05, 0.50),
    "freshness": (0.05, 0.40),
    "websiteQuality": (0.00, 0.20),
    "aiAnalysis": (0.00, 0.30),
    "tokenQuality": (0.00, 0.30),
    "redFlagPenalty": (0.00, 0.30),
}


def read_config_weights():
    """Read current pumpfun weights from config.json."""
    if not CONFIG_PATH.exists():
        return dict(DEFAULT_WEIGHTS)

    try:
        with open(CONFIG_PATH) as f:
            config = json.load(f)
        weights = config.get("pumpfun", {}).get("weights", {})
        # Merge with defaults for any missing keys
        result = dict(DEFAULT_WEIGHTS)
        for k in DEFAULT_WEIGHTS:
            if k in weights:
                result[k] = weights[k]
        return result
    except (json.JSONDecodeError, KeyError):
        return dict(DEFAULT_WEIGHTS)


def analyze_outcomes(db):
    """Analyze trade outcomes grouped by entry score."""
    rows = db.execute("""
        SELECT entry_score, pnl_sol, pnl_pct, outcome,
               hold_time_minutes, tp_levels_hit
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
        ORDER BY closed_at DESC
    """).fetchall()

    buckets = {
        "0.00-0.29": [], "0.30-0.39": [], "0.40-0.49": [],
        "0.50-0.59": [], "0.60-0.69": [], "0.70-1.00": [],
    }

    quick_rugs = []  # losses with hold < 5 min

    for row in rows:
        score, pnl_sol, pnl_pct, outcome, hold, tp_hit = row
        pnl_pct = pnl_pct or 0
        hold = hold or 0

        if score >= 0.7:       key = "0.70-1.00"
        elif score >= 0.6:     key = "0.60-0.69"
        elif score >= 0.5:     key = "0.50-0.59"
        elif score >= 0.4:     key = "0.40-0.49"
        elif score >= 0.3:     key = "0.30-0.39"
        else:                  key = "0.00-0.29"

        buckets[key].append({"pnl_pct": pnl_pct, "hold": hold, "outcome": outcome})

        if pnl_pct < -20 and hold < 5:
            quick_rugs.append({"score": score, "pnl": pnl_pct, "hold": hold, "outcome": outcome})

    analysis = {}
    for bucket, trades in buckets.items():
        if trades:
            wins = sum(1 for t in trades if t["pnl_pct"] > 0)
            pnls = [t["pnl_pct"] for t in trades]
            avg_hold = sum(t["hold"] for t in trades) / len(trades)
            analysis[bucket] = {
                "count": len(trades),
                "win_rate": round(100 * wins / len(trades), 1),
                "avg_pnl_pct": round(sum(pnls) / len(pnls), 2),
                "best_pnl": round(max(pnls), 2),
                "worst_pnl": round(min(pnls), 2),
                "avg_hold_min": round(avg_hold, 1),
            }
        else:
            analysis[bucket] = {"count": 0, "note": "no trades"}

    return analysis, quick_rugs, len(rows)


def mutate_weights(current_weights, analysis, quick_rugs, dry_run=False):
    """Apply mutation rules based on analysis results. Returns (new_weights, rationale)."""
    weights = dict(current_weights)
    rationale = []

    # Rule 1: High-score underperformance
    high = analysis.get("0.70-1.00", {})
    mid = analysis.get("0.40-0.59", {})
    if high.get("count", 0) >= 5 and mid.get("count", 0) >= 5:
        if high["win_rate"] < mid["win_rate"] - 10:
            weights["aiAnalysis"] = max(WEIGHT_BOUNDS["aiAnalysis"][0], weights["aiAnalysis"] - MUTATION_STEP)
            weights["social"] = max(WEIGHT_BOUNDS["social"][0], weights["social"] - MUTATION_STEP)
            weights["freshness"] = min(WEIGHT_BOUNDS["freshness"][1], weights["freshness"] + MUTATION_STEP)
            weights["tokenQuality"] = min(WEIGHT_BOUNDS["tokenQuality"][1], weights["tokenQuality"] + MUTATION_STEP)
            rationale.append(
                f"High-score WR ({high['win_rate']}%) < mid ({mid['win_rate']}%): "
                f"-aiAnalysis -social +freshness +tokenQuality"
            )

    # Rule 2: Low-score outperformance → lower threshold (flag only, don't change .env)
    low = analysis.get("0.30-0.39", {})
    if low.get("count", 0) >= 5 and low["win_rate"] > 50:
        rationale.append(
            f"Low-score (0.30-0.39) WR is {low['win_rate']}% — consider lowering PUMPFUN_MIN_BUY_SCORE"
        )

    # Rule 3: Quick rugs → increase pre-screening weight
    if len(quick_rugs) >= 3:
        weights["websiteQuality"] = min(WEIGHT_BOUNDS["websiteQuality"][1], weights["websiteQuality"] + MUTATION_STEP)
        weights["redFlagPenalty"] = min(WEIGHT_BOUNDS["redFlagPenalty"][1], weights["redFlagPenalty"] + MUTATION_STEP)
        rationale.append(
            f"{len(quick_rugs)} quick rugs detected: +websiteQuality +redFlagPenalty"
        )

    # Rule 4: Good WR but negative PnL → TP too early
    all_outcomes = [v for v in analysis.values() if isinstance(v.get("avg_pnl_pct"), (int, float))]
    if all_outcomes:
        avg_wr = sum(v.get("win_rate", 0) for v in all_outcomes) / len(all_outcomes)
        avg_pnl = sum(v.get("avg_pnl_pct", 0) for v in all_outcomes) / len(all_outcomes)
        if avg_wr > 45 and avg_pnl < -5:
            rationale.append(
                f"WR {avg_wr:.0f}% but avg PnL {avg_pnl:.1f}% — TP levels may be too early, consider code change"
            )

    # Rule 5: Mid-score bleeding while high-score outperforms → RAISE THRESHOLD
    mid_low = analysis.get("0.40-0.49", {})
    mid_high = analysis.get("0.50-0.59", {})
    high_60 = analysis.get("0.60-0.69", {})
    high_70 = analysis.get("0.70-1.00", {})

    mid_total = mid_low.get("count", 0) + mid_high.get("count", 0)
    high_total = high_60.get("count", 0) + high_70.get("count", 0)

    if mid_total >= 20 and high_total >= 5:
        mid_wr = (mid_low.get("win_rate", 0) * mid_low.get("count", 1) +
                  mid_high.get("win_rate", 0) * mid_high.get("count", 1)) / max(mid_total, 1)
        high_wr = (high_60.get("win_rate", 0) * high_60.get("count", 1) +
                   high_70.get("win_rate", 0) * high_70.get("count", 1)) / max(high_total, 1)

        if mid_wr < 20 and high_wr >= 80:
            rationale.append(
                f"CRITICAL: Mid-score (0.40-0.59) WR={mid_wr:.1f}% vs High-score (0.60+) WR={high_wr:.1f}% — "
                f"RAISE PUMPFUN_MIN_BUY_SCORE to 0.60 to cut bleeding"
            )

    # Renormalize positive weights to sum to 1.0
    pos_keys = ["social", "freshness", "websiteQuality", "aiAnalysis", "tokenQuality"]
    pos_sum = sum(weights[k] for k in pos_keys)
    if pos_sum > 0:
        for k in pos_keys:
            weights[k] = round(weights[k] / pos_sum, 4)

    # Check if anything actually changed
    changed = any(abs(weights[k] - current_weights[k]) > 0.001 for k in current_weights)

    return weights, rationale, changed


def write_weights_to_config(new_weights, dry_run=False):
    """Write mutated weights back to config.json."""
    if dry_run:
        return "DRY RUN — config not modified"

    if not CONFIG_PATH.exists():
        return "ERROR: config.json not found"

    try:
        with open(CONFIG_PATH) as f:
            config = json.load(f)

        # Ensure pumpfun section exists
        if "pumpfun" not in config:
            config["pumpfun"] = {}
        config["pumpfun"]["weights"] = new_weights

        with open(CONFIG_PATH, "w") as f:
            json.dump(config, f, indent=2)

        return "Config updated"
    except (json.JSONDecodeError, KeyError) as e:
        return f"ERROR: Failed to update config.json: {e}"


def save_report(weights, new_weights, analysis, quick_rugs, rationale, changed, dry_run):
    """Save training cycle report."""
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    report = f"""# Pump.fun Training Cycle — {ts}

## Trade Outcome Analysis

| Score Range | Trades | Win Rate | Avg PnL% | Best | Worst | Avg Hold |
|---|---|---|---|---|---|---|
"""
    for bucket in ["0.70-1.00", "0.60-0.69", "0.50-0.59", "0.40-0.49", "0.30-0.39", "0.00-0.29"]:
        a = analysis.get(bucket, {})
        if a.get("count", 0) > 0:
            report += f"| {bucket} | {a['count']} | {a['win_rate']}% | {a['avg_pnl_pct']}% | {a['best_pnl']}% | {a['worst_pnl']}% | {a.get('avg_hold_min', 'N/A')} min |\n"
        else:
            report += f"| {bucket} | 0 | - | - | - | - | - |\n"

    report += f"\nQuick rugs (< 5 min, > 20% loss): {len(quick_rugs)}\n"

    report += "\n## Weight Changes\n\n"
    for k in DEFAULT_WEIGHTS:
        old = weights[k]
        new = new_weights[k]
        arrow = ">" if new > old else ("<" if new < old else "=")
        report += f"  {k}: {old:.4f} {arrow} {new:.4f}\n"

    report += f"\nChanged: {changed}\n"
    report += f"Mode: {'DRY RUN' if dry_run else 'LIVE'}\n"

    report += "\n## Rationale\n"
    if rationale:
        for r in rationale:
            report += f"  - {r}\n"
    else:
        report += "  No mutations triggered.\n"

    report_path = HISTORY_DIR / f"cycle-{ts}.md"
    report_path.write_text(report)
    return str(report_path)


def main():
    parser = argparse.ArgumentParser(description="Pump.fun weight trainer")
    parser.add_argument("--dry-run", action="store_true", help="Analyze but don't write config")
    parser.add_argument("--output", type=str, help="Override history output directory")
    args = parser.parse_args()

    if not DB_PATH.exists():
        print(json.dumps({"error": "pumpfun.db not found", "timestamp": datetime.now(timezone.utc).isoformat()}))
        sys.exit(1)

    db = sqlite3.connect(DB_PATH)
    current_weights = read_config_weights()

    print(f"Current weights: {json.dumps(current_weights)}")

    analysis, quick_rugs, total_trades = analyze_outcomes(db)
    print(f"Total outcomes analyzed: {total_trades}")
    print(f"Score analysis: {json.dumps(analysis, indent=2)}")
    print(f"Quick rugs: {len(quick_rugs)}")

    if total_trades < MIN_TRADES_FOR_MUTATION:
        result = {
            "status": "skipped",
            "reason": f"Only {total_trades} trades (need {MIN_TRADES_FOR_MUTATION})",
            "analysis": analysis,
            "quick_rugs": len(quick_rugs),
        }
        print(json.dumps(result, indent=2))
        return

    new_weights, rationale, changed = mutate_weights(current_weights, analysis, quick_rugs, args.dry_run)

    print(f"\nNew weights: {json.dumps(new_weights)}")
    print(f"Rationale: {rationale}")
    print(f"Changed: {changed}")

    write_result = write_weights_to_config(new_weights, args.dry_run)
    print(f"Config: {write_result}")

    report_path = save_report(current_weights, new_weights, analysis, quick_rugs, rationale, changed, args.dry_run)
    print(f"Report: {report_path}")

    result = {
        "status": "mutated" if changed and not args.dry_run else ("dry_run" if args.dry_run else "no_change"),
        "old_weights": current_weights,
        "new_weights": new_weights,
        "rationale": rationale,
        "analysis": analysis,
        "quick_rugs": len(quick_rugs),
        "total_trades": total_trades,
        "report": report_path,
        "config_write": write_result,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
