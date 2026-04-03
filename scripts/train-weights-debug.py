#!/usr/bin/env python3

# Pump.fun Weight Trainer
# Analyzes trade outcomes and mutates scoring weights for optimal performance

import sqlite3
import json
import yaml
import pathlib
import datetime
import sys
from typing import Dict, List, Tuple

class PumpfunTrainer:
    def __init__(self):
        self.db_path = pathlib.Path("data/pumpfun.db")
        self.config_path = pathlib.Path("/home/d/PerpsTrader/config.yaml")
        self.training_history_dir = pathlib.Path("/home/d/PerpsTrader/data/pumpfun-training-history")
        self.training_history_dir.mkdir(exist_ok=True)
        
        # Current weights from config
        self.current_weights = {
            'social': 0.441,
            'freshness': 0.101,
            'websiteQuality': 0.051,
            'aiAnalysis': 0.281,
            'tokenQuality': 0.077,
            'redFlagPenalty': 0.051
        }
        
        # Mutation parameters
        self.mutation_magnitude = 0.05
        self.min_trades_for_training = 20
        
    def check_known_bugs(self) -> List[str]:
        """Scan for and auto-fix known bugs"""
        bugs_found = []
        
        # Check for hardcoded threshold in index.ts
        try:
            with open("/home/d/PerpsTrader/src/pumpfun-agent/index.ts", "r") as f:
                content = f.read()
                if "overallScore >= 0." in content:
                    bugs_found.append("HARDCODED_THRESHOLD")
                    print("🔧 Auto-fixing hardcoded threshold bug...")
                    # Fix: Replace hardcoded threshold with config variable
                    content = content.replace("overallScore >= 0.", "overallScore >= minScoreThreshold")
                    with open("/home/d/PerpsTrader/src/pumpfun-agent/index.ts", "w") as f:
                        f.write(content)
        except FileNotFoundError:
            pass
        
        # Check for emergencySell hardcoded outcomes
        try:
            with open("src/pumpfun-agent/services/bonding-curve.ts", "r") as f:
                content = f.read()
                if "outcome = 'LOSS_STOP'" in content:
                    bugs_found.append("HARDCODED_OUTCOMES")
                    print("🔧 Auto-fixing hardcoded outcome bug...")
                    # Fix: Add proper outcome mapping
                    if "outcomeMap" not in content:
                        # Add outcome mapping before the emergency sell function
                        fix = """
    // Map exit reasons to outcomes
    const outcomeMap: Record<string, string> = {
        'STOP_LOSS': 'LOSS_STOP',
        'STALE_EXIT': 'STALE_EXIT', 
        'TIME_EXIT': 'TIME_EXIT',
        'TAKE_PROFIT': 'TAKE_PROFIT',
    };
"""
                        content = content.replace("async emergencySell(", fix + "async emergencySell(")
                    
                    # Replace hardcoded outcome with proper mapping
                    content = content.replace("const outcome = 'LOSS_STOP'", "const outcome = outcomeMap[reason] || 'LOSS_STOP'")
                    with open("src/pumpfun-agent/services/bonding-curve.ts", "w") as f:
                        f.write(content)
        except FileNotFoundError:
            pass
        
        return bugs_found
    
    def analyze_trade_data(self) -> Dict:
        """Analyze trade outcomes and score correlations"""
        if not self.db_path.exists():
            raise Exception("pumpfun.db not found")
        
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        
        # Get all trade outcomes
        cursor = conn.execute("""
            SELECT entry_score, pnl_sol, pnl_pct, outcome,
                   hold_time_minutes, closed_at, max_multiplier, token_symbol
            FROM pumpfun_trade_outcomes
            WHERE entry_score IS NOT NULL
            ORDER BY closed_at DESC
        """)
        
        rows = cursor.fetchall()
        conn.close()
        
        if len(rows) < self.min_trades_for_training:
            raise Exception(f"Insufficient trade data: {len(rows)} trades (min: {self.min_trades_for_training})")
        
        # Group by score range
        buckets = {
            '0.00-0.29': [],
            '0.30-0.39': [],
            '0.40-0.49': [],
            '0.50-0.59': [],
            '0.60-0.69': [],
            '0.70-1.00': []
        }
        
        quick_rugs = []
        total_trades = len(rows)
        
        for row in rows:
            score = row['entry_score']
            pnl_pct = row['pnl_pct'] or 0
            hold_time = row['hold_time_minutes'] or 0
            
            # Classify score bucket
            if score >= 0.7:
                bucket = '0.70-1.00'
            elif score >= 0.6:
                bucket = '0.60-0.69'
            elif score >= 0.5:
                bucket = '0.50-0.59'
            elif score >= 0.4:
                bucket = '0.40-0.49'
            elif score >= 0.3:
                bucket = '0.30-0.39'
            else:
                bucket = '0.00-0.29'
            
            buckets[bucket].append({
                'pnl_pct': pnl_pct,
                'hold_time': hold_time,
                'outcome': row['outcome'],
'trade_reason': 'unknown'
            })
            
            # Track quick rugs
            if hold_time < 5 and pnl_pct < 0:
                quick_rugs.append({
                    'score': score,
                    'pnl_pct': pnl_pct,
                    'hold_time': hold_time,
                    'token_symbol': row['token_symbol']
                })
        
        # Calculate statistics per bucket
        analysis = {}
        for bucket, trades in buckets.items():
            if trades:
                pnls = [t['pnl_pct'] for t in trades]
                wins = sum(1 for p in pnls if p > 0)
                
                analysis[bucket] = {
                    'count': len(trades),
                    'win_rate': round(100 * wins / len(trades), 1),
                    'avg_pnl': round(sum(pnls) / len(trades), 2),
                    'best_pnl': round(max(pnls), 2),
                    'worst_pnl': round(min(pnls), 2),
                    'avg_hold_time': round(sum(t['hold_time'] for t in trades) / len(trades), 1)
                }
            else:
                analysis[bucket] = {'count': 0, 'note': 'no trades'}
        
        return {
            'total_trades': total_trades,
            'quick_rugs_count': len(quick_rugs),
            'quick_rugs_rate': round(100 * len(quick_rugs) / total_trades, 1),
            'score_buckets': analysis,
            'quick_rugs_examples': quick_rugs[:5]
        }
    
    def mutate_weights(self, analysis: Dict) -> Tuple[Dict, str]:
        """Mutate weights based on analysis"""
        new_weights = self.current_weights.copy()
        rationale = []
        
        # Find best performing score bucket
        best_bucket = None
        best_wr = 0
        for bucket, stats in analysis['score_buckets'].items():
            if stats['count'] > 0 and 'win_rate' in stats and stats['win_rate'] > best_wr:
                best_wr = stats['win_rate']
                best_bucket = (bucket, stats)
        
        # Rule 1: If high-score trades (0.7+) underperform mid-score
        if (best_bucket and best_bucket[0] != '0.70-1.00' and 
            analysis['score_buckets']['0.70-1.00']['count'] > 0 and
            analysis['score_buckets']['0.70-1.00']['win_rate'] < 50):
            
            rationale.append("High-score trades underperforming, reducing aiAnalysis/social weights")
            new_weights['aiAnalysis'] = max(0.05, new_weights['aiAnalysis'] - self.mutation_magnitude)
            new_weights['social'] = max(0.05, new_weights['social'] - self.mutation_magnitude)
            new_weights['freshness'] = min(0.35, new_weights['freshness'] + self.mutation_magnitude)
            new_weights['tokenQuality'] = min(0.25, new_weights['tokenQuality'] + self.mutation_magnitude)
        
        # Rule 2: If low-score trades (0.3-0.4) have high win rate
        if (analysis['score_buckets']['0.30-0.39']['count'] > 0 and
            analysis['score_buckets']['0.30-0.39']['win_rate'] > 60):
            
            rationale.append("Low-score trades performing well, should lower buy threshold")
            # This would be handled in the threshold adjustment, not weights
        
        # Rule 3: If many quick rugs detected
        if analysis['quick_rugs_rate'] > 20:  # More than 20% quick rugs
            rationale.append(f"High quick rug rate ({analysis['quick_rugs_rate']:.1f}%), increasing websiteQuality")
            new_weights['websiteQuality'] = min(0.20, new_weights['websiteQuality'] + self.mutation_magnitude)
            new_weights['aiAnalysis'] = min(0.35, new_weights['aiAnalysis'] + self.mutation_magnitude)
            new_weights['redFlagPenalty'] = min(0.20, new_weights['redFlagPenalty'] + self.mutation_magnitude)
        
        # Rule 4: If overall win rate is low across all buckets
        total_weighted_wr = 0
        total_count = 0
        for bucket, stats in analysis['score_buckets'].items():
            if stats['count'] > 0 and 'win_rate' in stats:
                total_weighted_wr += stats['win_rate'] * stats['count']
                total_count += stats['count']
        
        overall_wr = total_weighted_wr / total_count if total_count > 0 else 0
        if overall_wr < 40:  # Less than 40% win rate
            rationale.append("Low overall win rate, increasing aiAnalysis for better selection")
            new_weights['aiAnalysis'] = min(0.35, new_weights['aiAnalysis'] + self.mutation_magnitude)
        
        # Renormalize weights to sum to 1.0
        total = sum(new_weights.values())
        for key in new_weights:
            new_weights[key] = new_weights[key] / total
        
        return new_weights, "; ".join(rationale) if rationale else "No significant pattern detected"
    
    def update_config(self, new_weights: Dict):
        """Update config.yaml with new weights"""
        # Load current config
        with open(self.config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        # Update pumpfun weights
        if 'pumpfun' not in config:
            config['pumpfun'] = {}
        
        config['pumpfun']['weights'] = new_weights
        
        # Write back
        with open(self.config_path, 'w') as f:
            yaml.dump(config, f, default_flow_style=False)
        
        print(f"✅ Updated weights in config.yaml")
    
    def run_training_cycle(self):
        """Execute the full training cycle"""
        print("🎯 Starting pump.fun training cycle...")
        
        # Step 1: Check for known bugs and auto-fix
        bugs_found = self.check_known_bugs()
        if bugs_found:
            print(f"🔧 Auto-fixed {len(bugs_found)} bugs: {', '.join(bugs_found)}")
        
        # Step 2: Analyze trade data
        try:
            analysis = self.analyze_trade_data()
            print(f"📊 Analyzed {analysis['total_trades']} trades")
            
            if analysis['quick_rugs_count'] > 0:
                print(f"🚨 Detected {analysis['quick_rugs_count']} quick rugs ({analysis['quick_rugs_rate']:.1f}%)")
            
        except Exception as e:
            print(f"❌ Training failed: {e}")
            return False
        
        # Step 3: Mutate weights
        new_weights, rationale = self.mutate_weights(analysis)
        
        # Check if weights changed significantly
        weight_changes = {k: (old, round(new_weights[k], 3)) 
                         for k, old in self.current_weights.items() 
                         if abs(old - new_weights[k]) > 0.001}
        
        if weight_changes:
            print(f"🔄 Weight mutations based on: {rationale}")
            for k, (old, new) in weight_changes.items():
                print(f"  {k}: {old:.3f} → {new:.3f}")
            
            # Update config
            self.update_config(new_weights)
            
            # Step 4: Generate training report
            self.generate_training_report(analysis, new_weights, bugs_found, rationale)
            
            print("✅ Training cycle completed successfully")
            return True
        else:
            print("📊 No significant weight changes needed")
            self.generate_training_report(analysis, self.current_weights, bugs_found, "No changes needed")
            return False
    
    def generate_training_report(self, analysis: Dict, new_weights: Dict, bugs_found: List[str], rationale: str):
        """Generate training cycle report"""
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = self.training_history_dir / f"cycle-{timestamp}.md"
        
        report = f"""# Pump.fun Training Cycle Report - {timestamp}

## Summary
- **Trades Analyzed**: {analysis['total_trades']}
- **Quick Rugs**: {analysis['quick_rugs_count']} ({analysis['quick_rugs_rate']:.1f}%)
- **Bugs Fixed**: {len(bugs_found)}
- **Weight Changes**: {'Yes' if len(new_weights) > 0 else 'No'}

## Score Bucket Performance
"""
        
        for bucket, stats in analysis['score_buckets'].items():
            if stats['count'] > 0:
                report += f"- **{bucket}**: {stats['count']} trades, {stats['win_rate']:.1f}% WR, avg PnL: {stats['avg_pnl']:.2f}%\n"
            else:
                report += f"- **{bucket}**: No trades\n"
        
        if bugs_found:
            report += f"""
## Bugs Fixed
"""
            for bug in bugs_found:
                report += f"- {bug}\n"
        
        if rationale and "No significant pattern" not in rationale:
            report += f"""
## Weight Rationale
{rationale}
"""
        
        report += f"""
## Weight Changes
| Factor | Before | After | Change |
|--------|--------|-------|---------|
"""
        
        for factor in self.current_weights:
            old = self.current_weights[factor]
            new = new_weights[factor]
            change = new - old
            report += f"| {factor} | {old:.3f} | {new:.3f} | {change:+.3f} |\n"
        
        report += f"""
## Recommendations
"""
        
        if analysis['quick_rugs_rate'] > 20:
            report += f"- High quick rug rate detected. Consider increasing PUMPFUN_MIN_BUY_SCORE\n"
# Calculate overall statistics
        total_weighted_wr = 0
        total_count = 0
        for bucket, stats in analysis['score_buckets'].items():
            if stats['count'] > 0 and 'win_rate' in stats:
                total_weighted_wr += stats['win_rate'] * stats['count']
                total_count += stats['count']
        
        overall_wr = total_weighted_wr / total_count if total_count > 0 else 0
        if overall_wr < 40:
            report += f"- Low overall win rate ({overall_wr:.1f}%). Consider raising buy threshold\n"
        
        with open(report_file, 'w') as f:
            f.write(report)
        
        print(f"📋 Training report saved to: {report_file}")

if __name__ == "__main__":
    trainer = PumpfunTrainer()
    success = trainer.run_training_cycle()
    sys.exit(0 if success else 1)