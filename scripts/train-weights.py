#!/usr/bin/env python3
# Pump.fun Weight Trainer
import sqlite3, json, yaml, pathlib, sys, re
from datetime import datetime

def get_db_connection():
    return sqlite3.connect('/home/d/PerpsTrader/pumpfun.db')

def analyze_score_outcome_correlation():
    db = get_db_connection()
    rows = db.execute(
        "SELECT entry_score, pnl_sol, pnl_pct, outcome, "
        "hold_time_minutes, trade_reason "
        "FROM pumpfun_trade_outcomes "
        "WHERE entry_score IS NOT NULL "
        "ORDER BY created_at DESC"
    ).fetchall()
    db.close()
    
    if not rows:
        return {"error": "No trade data found"}
    
    # Group by score range and analyze
    buckets = {'0.00-0.29': [], '0.30-0.39': [], '0.40-0.49': [],
               '0.50-0.59': [], '0.60-0.69': [], '0.70-1.00': []}
    
    for row in rows:
        score, pnl_sol, pnl_pct, outcome, hold, reason = row
        pnl_pct = pnl_pct or 0
        key = '0.70-1.00' if score >= 0.7 else               '0.60-0.69' if score >= 0.6 else               '0.50-0.59' if score >= 0.5 else               '0.40-0.49' if score >= 0.4 else               '0.30-0.39' if score >= 0.3 else '0.00-0.29'
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
        if not score_node_path.exists():
            return {'social': 0.30, 'freshness': 0.20, 'websiteQuality': 0.10, 'aiAnalysis': 0.15, 'tokenQuality': 0.15, 'redFlagPenalty': 0.10}
        
        content = score_node_path.read_text()
        weights = {}
        
        # Enhanced parsing to handle TypeScript comments
        for line in content.split('\n'):
            if 'social:' in line and not line.strip().startswith('//'):
                match = re.search(r'social:\s*([0-9.]+)', line)
                if match:
                    weights['social'] = float(match.group(1))
            elif 'freshness:' in line and not line.strip().startswith('//'):
                match = re.search(r'freshness:\s*([0-9.]+)', line)
                if match:
                    weights['freshness'] = float(match.group(1))
            elif 'websiteQuality:' in line and not line.strip().startswith('//'):
                match = re.search(r'websiteQuality:\s*([0-9.]+)', line)
                if match:
                    weights['websiteQuality'] = float(match.group(1))
            elif 'aiAnalysis:' in line and not line.strip().startswith('//'):
                match = re.search(r'aiAnalysis:\s*([0-9.]+)', line)
                if match:
                    weights['aiAnalysis'] = float(match.group(1))
            elif 'tokenQuality:' in line and not line.strip().startswith('//'):
                match = re.search(r'tokenQuality:\s*([0-9.]+)', line)
                if match:
                    weights['tokenQuality'] = float(match.group(1))
        
        # Return default weights if none found
        if not weights:
            return {'social': 0.30, 'freshness': 0.20, 'websiteQuality': 0.10, 'aiAnalysis': 0.15, 'tokenQuality': 0.15, 'redFlagPenalty': 0.10}
        
        # Ensure redFlagPenalty exists
        if 'redFlagPenalty' not in weights:
            weights['redFlagPenalty'] = 0.10
            
        return weights
    except Exception as e:
        print(f"⚠️ Error reading weights: {e}")
        return {'social': 0.30, 'freshness': 0.20, 'websiteQuality': 0.10, 'aiAnalysis': 0.15, 'tokenQuality': 0.15, 'redFlagPenalty': 0.10}

def mutate_weights(weights, analysis):
    current_weights = weights.copy()
    quick_rug_rate = analysis.get('quick_rug_rate', 0)
    
    # EXTREME QUICK RUG RATE (>90%) - Emergency measures
    if quick_rug_rate > 90:
        current_weights['social'] = max(0.05, current_weights.get('social', 0.30) - 0.20)
        current_weights['aiAnalysis'] = min(0.50, current_weights.get('aiAnalysis', 0.15) + 0.20)
        current_weights['redFlagPenalty'] = min(0.40, current_weights.get('redFlagPenalty', 0.10) + 0.15)
    
    # HIGH QUICK RUG RATE (>70%) - Aggressive red flag detection
    elif quick_rug_rate > 70:
        current_weights['aiAnalysis'] = min(0.40, current_weights.get('aiAnalysis', 0.15) + 0.05)
        current_weights['redFlagPenalty'] = min(0.35, current_weights.get('redFlagPenalty', 0.10) + 0.05)
        current_weights['social'] = max(0.05, current_weights.get('social', 0.30) - 0.05)
    
    # NORMAL MUTATION BASED ON SCORE-OUTCOME CORRELATION
    else:
        analysis_data = analysis.get('analysis', {})
        if analysis_data:
            best_bucket = max(analysis_data.items(), 
                            key=lambda x: x[1]['win_rate'] if x[1]['count'] > 0 else -1)[0]
            
            if best_bucket in ['0.30-0.39', '0.40-0.49']:
                # Lower threshold would be better
                if current_weights.get('social', 0.30) > 0.15:
                    current_weights['social'] = max(0.05, current_weights.get('social', 0.30) - 0.02)
            elif best_bucket in ['0.70-1.00']:
                # High scores performing well - maintain high standards
                if current_weights.get('aiAnalysis', 0.15) < 0.35:
                    current_weights['aiAnalysis'] = min(0.50, current_weights.get('aiAnalysis', 0.15) + 0.02)
    
    # ZERO WIN RATE EMERGENCY FIX
    if analysis.get('overall_win_rate', 0) == 0 and analysis.get('total_trades', 0) > 0:
        current_weights['aiAnalysis'] = min(0.45, current_weights.get('aiAnalysis', 0.15) + 0.10)
        current_weights['redFlagPenalty'] = min(0.40, current_weights.get('redFlagPenalty', 0.10) + 0.10)
    
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
        config_path = pathlib.Path('/home/d/PerpsTrader/config.yaml')
        if config_path.exists():
            cfg = yaml.safe_load(config_path.read_text())
        else:
            cfg = {}
        
        if 'pumpfun' not in cfg:
            cfg['pumpfun'] = {}
        
        cfg['pumpfun']['weights'] = weights
        
        config_path.write_text(yaml.dump(cfg, default_flow_style=False))
        print("✅ Weights written to config.yaml")
        return True
    except Exception as e:
        print(f"❌ Error writing weights to config: {e}")
        return False

def main():
    print("🧠 Starting pump.fun weight training cycle...")
    
    # Check if database exists and has data
    db_path = pathlib.Path('/home/d/PerpsTrader/pumpfun.db')
    if not db_path.exists() or db_path.stat().st_size == 0:
        print("❌ No pumpfun database found or database is empty")
        return False
    
    analysis = analyze_score_outcome_correlation()
    
    if 'error' in analysis:
        print(f"❌ {analysis['error']}")
        return False
    
    if analysis['total_trades'] < 20:
        print(f"❌ Insufficient data ({analysis['total_trades']} trades < 20 minimum)")
        print("📊 Analysis would be unreliable - skipping weight mutation")
        return False
    
    print(f"📈 Analysis: {analysis['total_trades']} trades, {analysis['overall_win_rate']}% win rate")
    
    current_weights = get_current_weights()
    print("⚖️ Current Weights:", current_weights)
    
    # Mutate weights based on analysis
    new_weights = mutate_weights(current_weights, analysis)
    print("🔄 New Weights:", new_weights)
    
    # Check if weights changed significantly
    weight_changed = any(abs(new_weights.get(k, 0) - current_weights.get(k, 0)) > 0.001 for k in new_weights.keys())
    
    if weight_changed:
        print("📝 Writing updated weights to config...")
        write_weights_to_config(new_weights)
        return True
    else:
        print("✅ Weights already optimized - no changes needed")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
