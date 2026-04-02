#!/usr/bin/env python3
"""
Pump.fun Weight Trainer - Autonomous weight mutation based on trade outcomes
"""

import sqlite3
import json
import yaml
import pathlib
import sys
import re
from datetime import datetime
import os

def analyze_score_outcome_correlation():
    """Analyze which score ranges produce best outcomes"""
    db_path = "/home/d/PerpsTrader/data/pumpfun.db"
    
    if not os.path.exists(db_path):
        print("ERROR: pumpfun.db not found")
        return {}
    
    conn = sqlite3.connect(db_path)
    rows = conn.execute("""
        SELECT entry_score, pnl_sol, pnl_pct, outcome,
               hold_time_minutes
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
        ORDER BY closed_at DESC
    """).fetchall()
    
    if len(rows) < 20:
        print(f"WARNING: Only {len(rows)} trades found, skipping mutation")
        return {'skip_mutation': True, 'count': len(rows)}
    
    # Group by score range
    buckets = {'0.00-0.29': [], '0.30-0.39': [], '0.40-0.49': [],
               '0.50-0.59': [], '0.60-0.69': [], '0.70-1.00': []}
    
    for row in rows:
        score, pnl_sol, pnl_pct, outcome, hold = row
        if score is None:
            continue
        key = '0.70-1.00' if score >= 0.7 else \
              '0.60-0.69' if score >= 0.6 else \
              '0.50-0.59' if score >= 0.5 else \
              '0.40-0.49' if score >= 0.4 else \
              '0.30-0.39' if score >= 0.3 else '0.00-0.29'
        buckets[key].append(pnl_pct or 0)
    
    # Compute per-bucket stats
    analysis = {}
    for bucket, pnls in buckets.items():
        if pnls:
            wins = sum(1 for p in pnls if p > 0)
            analysis[bucket] = {
                'count': len(pnls),
                'win_rate': round(100 * wins / len(pnls), 1),
                'avg_pnl': round(sum(pnls) / len(pnls), 2),
                'best_pnl': round(max(pnls), 2),
                'worst_pnl': round(min(pnls), 2),
            }
        else:
            analysis[bucket] = {'count': 0, 'note': 'no trades'}
    
    return analysis

def scan_for_and_fix_bugs():
    """Scan for known bugs and auto-fix them"""
    fixes_applied = []
    
    # Check for threshold bypass
    index_file = "/home/d/PerpsTrader/src/pumpfun-agent/index.ts"
    if os.path.exists(index_file):
        with open(index_file, 'r') as f:
            content = f.read()
        
        if "overallScore >= 0.40" in content:
            # Fix threshold bypass
            new_content = re.sub(r'overallScore >= 0\.40', 'topToken.overallScore >= minScoreThreshold', content)
            with open(index_file, 'w') as f:
                f.write(new_content)
            fixes_applied.append("Fixed threshold bypass in index.ts")
    
    # Check exit logic timing
    if "ageMs > 1800000" in content:  # 30 min
        new_content = re.sub(r'ageMs > 1800000', 'ageMs > 5400000', content)  # 90 min
        with open(index_file, 'w') as f:
            f.write(new_content)
        fixes_applied.append("Fixed stale exit timeout (30min → 90min)")
    
    # Check max hold time
    if "maxHoldTimeMs > 3600000" in content:  # 1 hour
        new_content = re.sub(r'maxHoldTimeMs > 3600000', 'maxHoldTimeMs > 10800000', content)  # 3 hours
        with open(index_file, 'w') as f:
            f.write(new_content)
        fixes_applied.append("Fixed max hold time (1h → 3h)")
    
    return fixes_applied

def get_current_weights():
    """Read current weights from config"""
    config_file = "/home/d/PerpsTrader/config.yaml"
    if os.path.exists(config_file):
        with open(config_file, 'r') as f:
            cfg = yaml.safe_load(f)
        
        if 'pumpfun' in cfg and 'weights' in cfg['pumpfun']:
            return cfg['pumpfun']['weights']
    
    # Default weights
    return {
        'social': 0.30,
        'freshness': 0.20,
        'websiteQuality': 0.10,
        'aiAnalysis': 0.15,
        'tokenQuality': 0.15,
        'redFlagPenalty': 0.10
    }

def mutate_weights(analysis, current_weights):
    """Mutate weights based on analysis results"""
    if analysis.get('skip_mutation'):
        return current_weights, []
    
    # Find best performing bucket
    best_bucket = None
    best_win_rate = 0
    
    for bucket, stats in analysis.items():
        if stats.get('win_rate', 0) > best_win_rate and stats.get('count', 0) > 0:
            best_win_rate = stats['win_rate']
            best_bucket = bucket
    
    new_weights = current_weights.copy()
    changes = []
    
    # Mutation rules
    if best_bucket == '0.70-1.00':
        # High scores performing well - boost AI/social
        new_weights['aiAnalysis'] = min(0.30, new_weights['aiAnalysis'] + 0.05)
        new_weights['social'] = min(0.50, new_weights['social'] + 0.05)
        changes.append("High-score trades winning → +aiAnalysis, +social")
    elif best_bucket in ['0.30-0.39', '0.40-0.49']:
        # Mid scores performing well - reduce threshold, reduce AI/social
        changes.append("Mid-score trades winning → maintain current weights")
    else:
        # Low scores winning or unclear - increase safety weights
        new_weights['websiteQuality'] = min(0.20, new_weights['websiteQuality'] + 0.05)
        new_weights['redFlagPenalty'] = min(0.30, new_weights['redFlagPenalty'] + 0.05)
        changes.append("Unclear signal → +websiteQuality, +redFlagPenalty")
    
    # Renormalize to sum = 1.0
    total = sum(new_weights.values())
    for key in new_weights:
        new_weights[key] = round(new_weights[key] / total, 3)
    
    return new_weights, changes

def write_new_weights(new_weights):
    """Write new weights to config"""
    config_file = "/home/d/PerpsTrader/config.yaml"
    
    with open(config_file, 'r') as f:
        cfg = yaml.safe_load(f)
    
    if 'pumpfun' not in cfg:
        cfg['pumpfun'] = {}
    
    cfg['pumpfun']['weights'] = new_weights
    
    with open(config_file, 'w') as f:
        yaml.dump(cfg, f, default_flow_style=False)
    
    print("Weights updated in config.yaml")

def log_training_cycle(analysis, old_weights, new_weights, fixes_applied, changes):
    """Log training cycle results"""
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_dir = "/home/d/PerpsTrader/data/pumpfun-training-history"
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = f"{log_dir}/cycle-{timestamp}.md"
    
    with open(log_file, 'w') as f:
        f.write(f"# Pump.fun Training Cycle - {timestamp}\n\n")
        f.write("## Analysis Results\n\n")
        f.write(f"Total trades analyzed: {sum(stats.get('count', 0) for stats in analysis.values())}\n\n")
        
        f.write("### Score Bucket Performance\n")
        for bucket, stats in analysis.items():
            f.write(f"- **{bucket}**: {stats.get('count', 0)} trades, {stats.get('win_rate', 0)}% WR, {stats.get('avg_pnl', 0)}% avg PnL\n")
        
        f.write("\n## Code Fixes Applied\n")
        for fix in fixes_applied:
            f.write(f"- {fix}\n")
        
        f.write("\n## Weight Changes\n")
        for key in old_weights:
            old_val = old_weights[key]
            new_val = new_weights[key]
            if old_val != new_val:
                f.write(f"- **{key}**: {old_val:.3f} → {new_val:.3f}\n")
        
        f.write("\n## Rationale\n")
        for change in changes:
            f.write(f"- {change}\n")
    
    return log_file

def main():
    print("Starting pump.fun weight training cycle...")
    
    # Step 1: Analyze correlation
    print("Analyzing score-outcome correlation...")
    analysis = analyze_score_outcome_correlation()
    
    if analysis.get('skip_mutation'):
        print(f"Insufficient data ({analysis.get('count')} trades), skipping mutation")
        sys.exit(0)
    
    # Step 2: Scan and fix bugs
    print("Scanning for bugs and auto-fixing...")
    fixes_applied = scan_for_and_fix_bugs()
    
    # Step 3: Get current weights
    current_weights = get_current_weights()
    print(f"Current weights: {current_weights}")
    
    # Step 4: Mutate weights
    new_weights, changes = mutate_weights(analysis, current_weights)
    print(f"New weights: {new_weights}")
    
    # Step 5: Write new weights
    write_new_weights(new_weights)
    
    # Step 6: Log results
    log_file = log_training_cycle(analysis, current_weights, new_weights, fixes_applied, changes)
    print(f"Training cycle logged to: {log_file}")
    
    # Print summary
    print("\n=== TRAINING SUMMARY ===")
    total_trades = sum(stats.get('count', 0) for stats in analysis.values())
    print(f"Trades analyzed: {total_trades}")
    
    best_bucket = max(analysis.items(), key=lambda x: x[1].get('win_rate', 0))
    print(f"Best performing bucket: {best_bucket[0]} ({best_bucket[1].get('win_rate', 0)}% WR)")
    
    if fixes_applied:
        print(f"Code fixes applied: {len(fixes_applied)}")
    
    if changes:
        print("Weight mutations:")
        for change in changes:
            print(f"  - {change}")

if __name__ == "__main__":
    main()