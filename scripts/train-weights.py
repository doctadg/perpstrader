#!/usr/bin/env python3
# Pump.fun Weight Trainer
import sqlite3, json, yaml, pathlib, sys, re
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
            elif 'freshness:' in line and not line.strip().startswith('//'):
                weights['freshness'] = float(line.split(':')[1].strip().rstrip(','))
            elif 'websiteQuality:' in line and not line.strip().startswith('//'):
                weights['websiteQuality'] = float(line.split(':')[1].strip().rstrip(','))
            elif 'aiAnalysis:' in line and not line.strip().startswith('//'):
                weights['aiAnalysis'] = float(line.split(':')[1].strip().rstrip(','))
            elif 'tokenQuality:' in line and not line.strip().startswith('//'):
                weights['tokenQuality'] = float(line.split(':')[1].strip().rstrip(','))
            elif 'rugSafety:' in line and not line.strip().startswith('//'):
                weights['rugSafety'] = float(line.split(':')[1].strip().rstrip(','))
        
        if not weights:
            return {
                'social': 0.20, 'freshness': 0.10, 'websiteQuality': 0.05,
                'aiAnalysis': 0.25, 'tokenQuality': 0.10, 'rugSafety': 0.30, 'redFlagPenalty': 0.15
            }
        
        # Add redFlagPenalty if missing
        if 'redFlagPenalty' not in weights:
            weights['redFlagPenalty'] = 0.15
            
        return weights
    except Exception as e:
        print(f"Error reading weights: {e}")
        return {'social': 0.20, 'aiAnalysis': 0.25, 'redFlagPenalty': 0.15}

def mutate_weights(weights, analysis):
    current_weights = weights.copy()
    quick_rug_rate = analysis['quick_rug_rate']
    
    # EXTREME QUICK RUG RATE (>90%) - Emergency measures
    if quick_rug_rate > 90:
        current_weights['social'] = max(0.05, current_weights['social'] - 0.20)
        current_weights['aiAnalysis'] = min(0.50, current_weights['aiAnalysis'] + 0.20)
        current_weights['redFlagPenalty'] = min(0.40, current_weights['redFlagPenalty'] + 0.15)
        current_weights['rugSafety'] = min(0.50, current_weights['rugSafety'] + 0.10)
    
    # HIGH QUICK RUG RATE (>70%) - Aggressive red flag detection
    elif quick_rug_rate > 70:
        current_weights['aiAnalysis'] = min(0.40, current_weights['aiAnalysis'] + 0.05)
        current_weights['redFlagPenalty'] = min(0.35, current_weights['redFlagPenalty'] + 0.05)
        current_weights['rugSafety'] = min(0.45, current_weights['rugSafety'] + 0.05)
        current_weights['social'] = max(0.05, current_weights['social'] - 0.05)
    
    # NORMAL MUTATION BASED ON SCORE-OUTCOME CORRELATION
    else:
        best_bucket = max(analysis['analysis'].items(), 
                        key=lambda x: x[1]['win_rate'] if x[1]['count'] > 0 else -1)[0]
        
        if best_bucket in ['0.30-0.39', '0.40-0.49']:
            # Lower threshold would be better
            if current_weights['social'] > 0.15:
                current_weights['social'] -= 0.02
        elif best_bucket in ['0.70-1.00']:
            # High scores performing well - maintain high standards
            if current_weights['aiAnalysis'] < 0.35:
                current_weights['aiAnalysis'] += 0.02
    
    # Normalize weights to sum to 1.0 (except redFlagPenalty which is a deduction)
    positive_weights = {k: v for k, v in current_weights.items() if k != 'redFlagPenalty'}
    total = sum(positive_weights.values())
    
    if total > 0:
        for key in positive_weights:
            positive_weights[key] = positive_weights[key] / total
    
    current_weights.update(positive_weights)
    return current_weights

def apply_weights(weights):
    try:
        score_node_path = pathlib.Path('/home/d/PerpsTrader/src/pumpfun-agent/nodes/score-node.ts')
        content = score_node_path.read_text()
        
        # Update weights in the file
        for key, value in weights.items():
            if key == 'redFlagPenalty':
                continue  # Skip as it's handled separately
            
            # Find and replace the weight
            pattern = f'{key}:\\s*[0-9.]+'
            replacement = f'{key}: {value}'
            content = re.sub(pattern, replacement, content)
        
        # Write back to file
        score_node_path.write_text(content)
        
        # Also update config.yaml
        config_path = pathlib.Path('/home/d/PerpsTrader/config.yaml')
        if config_path.exists():
            cfg = yaml.safe_load(config_path.read_text()) if config_path.exists() else {}
            if 'pumpfun' not in cfg:
                cfg['pumpfun'] = {}
            if 'weights' not in cfg['pumpfun']:
                cfg['pumpfun']['weights'] = {}
            
            for key, value in weights.items():
                if key != 'redFlagPenalty':
                    cfg['pumpfun']['weights'][key] = value
            
            config_path.write_text(yaml.dump(cfg, default_flow_style=False))
        
        return True
    except Exception as e:
        print(f"Error applying weights: {e}")
        return False

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
    
    current_weights = get_current_weights()
    print("⚖️ Current Weights:", current_weights)
    
    # Check if weights need mutation
    mutated_weights = mutate_weights(current_weights, analysis)
    
    if mutated_weights != current_weights:
        print("🔄 Weights mutated:")
        for key in current_weights:
            if key in mutated_weights:
                old_val = current_weights[key]
                new_val = mutated_weights[key]
                if abs(old_val - new_val) > 0.001:
                    print(f"  {key}: {old_val:.3f} → {new_val:.3f}")
        
        if apply_weights(mutated_weights):
            print("✅ New weights applied successfully")
            return True
        else:
            print("❌ Failed to apply weights")
            return False
    else:
        print("✅ No weight changes needed")
        return True

if __name__ == "__main__":
    sys.exit(0 if main() else 1)
