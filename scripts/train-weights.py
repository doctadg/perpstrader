#!/usr/bin/env python3

"""
Pump.fun Weight Training Script
Analyzes trade outcomes and mutates scoring weights for optimal performance.
"""

import json
import sqlite3
import yaml
import pathlib
from datetime import datetime
import math
import os

def load_current_weights():
    """Load current weights from config or use defaults"""
    try:
        with open('../config.yaml', 'r') as f:
            config = yaml.safe_load(f)
        pumpfun_config = config.get('pumpfun', {})
        
        weights = pumpfun_config.get('weights', {
            'social': 0.30,
            'freshness': 0.20,
            'websiteQuality': 0.10,
            'aiAnalysis': 0.15,
            'tokenQuality': 0.15,
            'redFlagPenalty': 0.10
        })
        
        # Ensure weights sum to 1.0
        total = sum(weights.values())
        if abs(total - 1.0) > 0.01:
            for key in weights:
                weights[key] = weights[key] / total
                
        return weights
    except:
        return {
            'social': 0.30,
            'freshness': 0.20,
            'websiteQuality': 0.10,
            'aiAnalysis': 0.15,
            'tokenQuality': 0.15,
            'redFlagPenalty': 0.10
        }

def load_current_thresholds():
    """Load current thresholds from .env file"""
    thresholds = {
        'min_buy_score': 0.35,
        'cooldown_ms': 2000,
        'max_snipe_per_hour': 15
    }
    
    try:
        with open('../.env', 'r') as f:
            for line in f:
                if line.startswith('PUMPFUN_MIN_BUY_SCORE='):
                    thresholds['min_buy_score'] = float(line.split('=')[1])
                elif line.startswith('PUMPFUN_SNIPER_COOLDOWN_MS='):
                    thresholds['cooldown_ms'] = int(line.split('=')[1])
                elif line.startswith('PUMPFUN_MAX_SNIPE_PER_HOUR='):
                    thresholds['max_snipe_per_hour'] = int(line.split('=')[1])
    except:
        pass
    
    return thresholds

def analyze_trade_data(db_path):
    """Analyze trade outcomes by score buckets"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get trade data
    cursor.execute("""
        SELECT entry_score, pnl_pct, outcome, hold_time_minutes, trade_reason
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
        ORDER BY created_at DESC
    """)
    
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        return None
    
    # Group by score range
    buckets = {
        '0.00-0.29': [], '0.30-0.39': [], '0.40-0.49': [],
        '0.50-0.59': [], '0.60-0.69': [], '0.70-1.00': []
    }
    
    quick_rugs = []
    
    for row in rows:
        score, pnl_pct, outcome, hold_time, reason = row
        pnl_pct = pnl_pct or 0
        
        # Determine bucket
        if score >= 0.7:
            key = '0.70-1.00'
        elif score >= 0.6:
            key = '0.60-0.69'
        elif score >= 0.5:
            key = '0.50-0.59'
        elif score >= 0.4:
            key = '0.40-0.49'
        elif score >= 0.3:
            key = '0.30-0.39'
        else:
            key = '0.00-0.29'
        
        buckets[key].append(pnl_pct)
        
        # Track quick rugs (hold time < 5 min)
        if hold_time < 5:
            quick_rugs.append({
                'score': score,
                'pnl_pct': pnl_pct,
                'hold_time': hold_time,
                'bucket': key
            })
    
    # Compute statistics per bucket
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
                'median_pnl': round(sorted(pnls)[len(pnls)//2], 2)
            }
        else:
            analysis[bucket] = {'count': 0, 'note': 'no trades'}
    
    return {
        'total_trades': len(rows),
        'quick_rugs_count': len(quick_rugs),
        'quick_rugs_rate': round(100 * len(quick_rugs) / len(rows), 1),
        'buckets': analysis,
        'quick_rugs_examples': quick_rugs[:5]  # Top 5 quick rugs
    }

def mutate_weights(weights, analysis, current_threshold):
    """Mutate weights based on analysis results"""
    if analysis['total_trades'] < 20:
        return weights, current_threshold, "Insufficient data for weight mutation"
    
    buckets = analysis['buckets']
    new_weights = weights.copy()
    
    # Find optimal score range
    best_bucket = None
    best_performance = -float('inf')
    
    for bucket, stats in buckets.items():
        if stats['count'] > 0 and 'note' not in stats:
            # Score based on win rate and average PnL
            performance = (stats['win_rate'] / 100) * (1 + stats['avg_pnl'] / 100)
            if performance > best_performance:
                best_performance = performance
                best_bucket = bucket
    
    # Mutation logic
    mutation_reasons = []
    
    # If high scores (0.7+) are performing poorly, reduce their influence
    if '0.70-1.00' in buckets and buckets['0.70-1.00']['count'] > 0:
        high_score_wr = buckets['0.70-1.00']['win_rate']
        if high_score_wr < 30:  # Poor performance in high scores
            mutation_reasons.append("High scores (0.7+) underperforming - reducing aiAnalysis and social weights")
            new_weights['aiAnalysis'] = max(0.05, new_weights['aiAnalysis'] - 0.05)
            new_weights['social'] = max(0.05, new_weights['social'] - 0.05)
            new_weights['freshness'] = min(0.35, new_weights['freshness'] + 0.05)
            new_weights['tokenQuality'] = min(0.25, new_weights['tokenQuality'] + 0.05)
    
    # If quick rug rate is high, increase red flag detection
    if analysis['quick_rugs_rate'] > 70:
        mutation_reasons.append(f"High quick rug rate ({analysis['quick_rugs_rate']}%) - increasing red flag detection")
        new_weights['redFlagPenalty'] = min(0.25, new_weights['redFlagPenalty'] + 0.05)
        new_weights['websiteQuality'] = min(0.20, new_weights['websiteQuality'] + 0.05)
        new_weights['aiAnalysis'] = max(0.05, new_weights['aiAnalysis'] - 0.05)
    
    # If optimal range is below current threshold, lower threshold
    threshold_change = None
    if best_bucket and best_bucket.startswith('0.'):
        optimal_threshold = float(best_bucket.split('-')[1]) + 0.01
        if optimal_threshold < current_threshold - 0.05:
            threshold_change = optimal_threshold
            mutation_reasons.append(f"Optimal score range ({best_bucket}) below current threshold - lowering threshold")
        elif optimal_threshold > current_threshold + 0.05:
            threshold_change = optimal_threshold
            mutation_reasons.append(f"Optimal score range ({best_bucket}) above current threshold - raising threshold")
    
    # Renormalize weights to sum to 1.0
    total = sum(new_weights.values())
    for key in new_weights:
        new_weights[key] = new_weights[key] / total
    
    return new_weights, threshold_change, "; ".join(mutation_reasons) if mutation_reasons else "No significant changes needed"

def save_weights_and_thresholds(weights, threshold):
    """Save updated weights and thresholds"""
    # Update config.yaml
    try:
        with open('../config.yaml', 'r') as f:
            config = yaml.safe_load(f)
    except:
        config = {}
    
    if 'pumpfun' not in config:
        config['pumpfun'] = {}
    
    config['pumpfun']['weights'] = weights
    
    with open('../config.yaml', 'w') as f:
        yaml.dump(config, f, default_flow_style=False)
    
    # Update .env
    if threshold is not None:
        with open('../.env', 'r') as f:
            lines = f.readlines()
        
        with open('../.env', 'w') as f:
            for line in lines:
                if line.startswith('PUMPFUN_MIN_BUY_SCORE='):
                    f.write(f'PUMPFUN_MIN_BUY_SCORE={threshold}
')
                else:
                    f.write(line)

def main():
    db_path = '../data/pumpfun.db'
    
    # Load current configuration
    current_weights = load_current_weights()
    current_threshold = load_current_thresholds()['min_buy_score']
    
    print("=== Pump.fun Training Cycle ===")
    print(f"Current weights: {current_weights}")
    print(f"Current threshold: {current_threshold}")
    print()
    
    # Analyze trade data
    analysis = analyze_trade_data(db_path)
    
    if not analysis:
        print("No trade data found for analysis")
        return False
    
    print(f"Total trades analyzed: {analysis['total_trades']}")
    print(f"Quick rug rate: {analysis['quick_rugs_rate']}% ({analysis['quick_rugs_count']} trades)")
    print()
    
    # Display bucket analysis
    print("Score Bucket Analysis:")
    for bucket, stats in analysis['buckets'].items():
        if stats['count'] > 0:
            print(f"  {bucket}: {stats['count']} trades, {stats['win_rate']}% win rate, avg PnL: {stats['avg_pnl']}%")
    
    print()
    
    # Mutate weights
    new_weights, new_threshold, mutation_reason = mutate_weights(
        current_weights, analysis, current_threshold
    )
    
    print("Mutation Reason:")
    print(f"  {mutation_reason}")
    print()
    
    if new_weights != current_weights:
        print("Weight Changes:")
        for factor, old_val in current_weights.items():
            new_val = new_weights[factor]
            if abs(old_val - new_val) > 0.001:
                print(f"  {factor}: {old_val:.3f} → {new_val:.3f}")
        print()
    
    if new_threshold is not None and abs(new_threshold - current_threshold) > 0.001:
        print(f"Threshold Change: {current_threshold:.3f} → {new_threshold:.3f}")
        print()
    
    # Save changes if any
    changes_made = False
    if new_weights != current_weights:
        save_weights_and_thresholds(new_weights, new_threshold)
        changes_made = True
        print("✓ New weights saved to config.yaml")
    elif new_threshold is not None:
        save_weights_and_thresholds(current_weights, new_threshold)
        changes_made = True
        print("✓ New threshold saved to .env")
    else:
        print("No changes made - current configuration appears optimal")
    
    # Generate report
    report = {
        'timestamp': datetime.now().isoformat(),
        'total_trades': analysis['total_trades'],
        'quick_rugs_count': analysis['quick_rugs_count'],
        'quick_rugs_rate': analysis['quick_rugs_rate'],
        'buckets_analysis': analysis['buckets'],
        'old_weights': current_weights,
        'new_weights': new_weights,
        'old_threshold': current_threshold,
        'new_threshold': new_threshold,
        'mutation_reason': mutation_reason,
        'changes_made': changes_made
    }
    
    # Save report
    report_path = f'../data/pumpfun-training-history/cycle-{datetime.now().strftime("%Y%m%d-%H%M%S")}.json'
    pathlib.Path('../data/pumpfun-training-history').mkdir(exist_ok=True)
    
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"✓ Training report saved to {report_path}")
    
    return changes_made

if __name__ == "__main__":
    changed = main()
    exit(0 if changed else 1)
