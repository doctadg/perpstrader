#!/usr/bin/env python3
# Pump.fun Weight Trainer
import sqlite3, json, yaml, pathlib, sys
from datetime import datetime

def get_db_connection():
    return sqlite3.connect('/home/d/PerpsTrader/pumpfun.db')

def analyze_score_outcome_correlation():
    db = get_db_connection()
    rows = db.execute("""
        SELECT entry_score, pnl_sol, pnl_pct, outcome,
               hold_time_minutes, trade_reason
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
        ORDER BY created_at DESC
    """).fetchall()
    db.close()
    
    if not rows:
        return {"error": "No trade data found"}
    
    # Group by score range and analyze
    buckets = {'0.00-0.29': [], '0.30-0.39': [], '0.40-0.49': [],
               '0.50-0.59': [], '0.60-0.69': [], '0.70-1.00': []}
    
    for row in rows:
        score, pnl_sol, pnl_pct, outcome, hold, reason = row
        pnl_pct = pnl_pct or 0
        key = '0.70-1.00' if score >= 0.7 else \
              '0.60-0.69' if score >= 0.6 else \
              '0.50-0.59' if score >= 0.5 else \
              '0.40-0.49' if score >= 0.4 else \
              '0.30-0.39' if score >= 0.3 else '0.00-0.29'
        buckets[key].append(pnl_pct)
    
    analysis = {}
    for bucket, pnls in buckets.items():
        if pnls:
            wins = sum(1 for p in pnls if p > 0)
            analysis[bucket] = {
                'count': len(pnls),
                'win_rate': round(100 * wins / len(pnls), 1),
                'avg_pnl': round(sum(pnls) / len(pnls), 2),
            }
    
    quick_rugs = [row for row in rows if row[4] < 5]
    return {
        'analysis': analysis,
        'quick_rug_rate': round(100 * len(quick_rugs) / len(rows), 1) if rows else 0,
        'total_trades': len(rows),
        'overall_win_rate': round(100 * sum(1 for row in rows if row[2] > 0) / len(rows), 1) if rows else 0,
    }

def get_current_weights():
    try:
        score_node_path = pathlib.Path('/home/d/PerpsTrader/src/pumpfun-agent/nodes/score-node.ts')
        content = score_node_path.read_text()
        weights = {}
        
        for line in content.split('\n'):
            if 'social:' in line and not line.strip().startswith('//'):
                weights['social'] = float(line.split(':')[1].strip().rstrip(','))
            elif 'aiAnalysis:' in line and not line.strip().startswith('//'):
                weights['aiAnalysis'] = float(line.split(':')[1].strip().rstrip(','))
        
        return weights or {
            'social': 0.20, 'freshness': 0.10, 'websiteQuality': 0.05,
            'aiAnalysis': 0.25, 'tokenQuality': 0.10, 'rugSafety': 0.30, 'redFlagPenalty': 0.15
        }
    except Exception as e:
        return {'social': 0.20, 'aiAnalysis': 0.25, 'redFlagPenalty': 0.15}

def mutate_weights(weights, analysis):
    current_weights = weights.copy()
    quick_rug_rate = analysis['quick_rug_rate']
    
    # EXTREME QUICK RUG RATE (>90%) - Emergency measures
    if quick_rug_rate > 90:
        current_weights['social'] = max(0.05, current_weights.get('social', 0.20) - 0.20)
        current_weights['aiAnalysis'] = min(0.50, current_weights.get('aiAnalysis', 0.25) + 0.20)
        current_weights['redFlagPenalty'] = min(0.40, current_weights.get('redFlagPenalty', 0.15) + 0.15)
        current_weights['rugSafety'] = min(0.50, current_weights.get('rugSafety', 0.10) + 0.10)
    
    # HIGH QUICK RUG RATE (>70%) - Aggressive red flag detection
    elif quick_rug_rate > 70:
        current_weights['aiAnalysis'] = min(0.40, current_weights.get('aiAnalysis', 0.25) + 0.05)
        current_weights['redFlagPenalty'] = min(0.35, current_weights.get('redFlagPenalty', 0.15) + 0.05)
        current_weights['rugSafety'] = min(0.45, current_weights.get('rugSafety', 0.10) + 0.05)
        current_weights['social'] = max(0.05, current_weights.get('social', 0.20) - 0.05)
    
    # NORMAL MUTATION BASED ON SCORE-OUTCOME CORRELATION
    else:
        best_bucket = max(analysis['analysis'].items(), 
                        key=lambda x: x[1]['win_rate'] if x[1]['count'] > 0 else -1)[0]
        
        if best_bucket in ['0.30-0.39', '0.40-0.49']:
            # Lower threshold would be better
            if current_weights.get('social', 0.20) > 0.15:
                current_weights['social'] = max(0.05, current_weights.get('social', 0.20) - 0.02)
        elif best_bucket in ['0.70-1.00']:
            # High scores performing well - maintain high standards
            if current_weights.get('aiAnalysis', 0.25) < 0.35:
                current_weights['aiAnalysis'] = min(0.40, current_weights.get('aiAnalysis', 0.25) + 0.02)
    
    # Normalize weights to sum to 1.0 (except redFlagPenalty which is a deduction)
    positive_weights = {k: v for k, v in current_weights.items() if k != 'redFlagPenalty'}
    total = sum(positive_weights.values())
    
    if total > 0:
        for key in positive_weights:
            positive_weights[key] = positive_weights[key] / total
    
    current_weights.update(positive_weights)
    return current_weights

def write_weights_to_config(weights):
    try:
        cfg_path = pathlib.Path('/home/d/PerpsTrader/config.yaml')
        cfg = yaml.safe_load(cfg_path.read_text()) if cfg_path.exists() else {}
        
        if 'pumpfun' not in cfg:
            cfg['pumpfun'] = {}
        
        cfg['pumpfun']['weights'] = weights
        
        cfg_path.write_text(yaml.dump(cfg, default_flow_style=False))
        print("✅ Weights written to config.yaml")
        return True
    except Exception as e:
        print(f"❌ Failed to write weights: {e}")
        return False

def log_training_cycle(analysis, old_weights, new_weights, threshold_change):
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_dir = pathlib.Path('/home/d/PerpsTrader/data/pumpfun-training-history')
    log_dir.mkdir(exist_ok=True)
    
    log_file = log_dir / f"cycle-{timestamp}.md"
    
    with open(log_file, 'w') as f:
        f.write(f"# Pump.fun Training Cycle - {timestamp}\n\n")
        f.write(f"## Metrics Summary\n")
        f.write(f"- Total Trades: {analysis['total_trades']}\n")
        f.write(f"- Overall Win Rate: {analysis['overall_win_rate']}%\n")
        f.write(f"- Quick Rug Rate: {analysis['quick_rug_rate']}%\n")
        f.write(f"- Average PnL%: {analysis.get('avg_pnl_pct', 'N/A')}\n\n")
        
        f.write(f"## Score Bucket Analysis\n")
        for bucket, stats in analysis['analysis'].items():
            f.write(f"- {bucket}: {stats['count']} trades, {stats['win_rate']}% win rate\n")
        
        f.write(f"\n## Weight Changes\n")
        for key in old_weights:
            old_val = old_weights.get(key, 0)
            new_val = new_weights.get(key, 0)
            if abs(old_val - new_val) > 0.001:
                f.write(f"- {key}: {old_val:.3f} → {new_val:.3f}\n")
        
        f.write(f"\n## Threshold Adjustment\n")
        f.write(f"- PUMPFUN_MIN_BUY_SCORE: {threshold_change}\n")
        
        if analysis['quick_rug_rate'] > 70:
            f.write(f"\n## ⚠️ CRITICAL: High Quick Rug Rate Detected\n")
            f.write(f"Applied emergency weight mutations to improve red flag detection.\n")
    
    print(f"📝 Training cycle logged to: {log_file}")
    return log_file

def main():
    print("🧠 Starting pump.fun weight training cycle...")
    analysis = analyze_score_outcome_correlation()
    
    if 'error' in analysis:
        print(f"❌ {analysis['error']}")
        return False
    
    if analysis['total_trades'] < 20:
        print(f"❌ Insufficient data ({analysis['total_trades']} trades < 20 minimum)")
        return False
    
    print(f"📈 Analysis: {analysis['total_trades']} trades, {analysis['overall_win_rate']}% win rate")
    
    if analysis['quick_rug_rate'] > 70:
        print(f"⚠️  CRITICAL: Quick rug rate at {analysis['quick_rug_rate']}% - emergency measures applied")
    
    current_weights = get_current_weights()
    print("⚖️ Current Weights:", current_weights)
    
    # Mutate weights based on analysis
    new_weights = mutate_weights(current_weights, analysis)
    
    # Check if weights actually changed
    weights_changed = any(abs(current_weights.get(k, 0) - new_weights.get(k, 0)) > 0.001 
                         for k in new_weights.keys())
    
    if weights_changed:
        print("✅ New Weights:", new_weights)
        
        # Write weights to config
        if write_weights_to_config(new_weights):
            # Log the training cycle
            log_training_cycle(analysis, current_weights, new_weights, "No change")
            print("🎯 Weight training completed successfully")
            return True
        else:
            print("❌ Failed to update weights in config")
            return False
    else:
        print("📊 No weight changes needed - current configuration optimal")
        # Still log the analysis
        log_training_cycle(analysis, current_weights, current_weights, "No change")
        return True

if __name__ == "__main__":
    sys.exit(0 if main() else 1)