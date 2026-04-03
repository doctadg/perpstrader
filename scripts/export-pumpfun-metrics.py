#!/usr/bin/env python3
import sqlite3
import json
from datetime import datetime
import os

def export_metrics():
    print("📊 Exporting pump.fun metrics...")
    
    # Ensure data directory exists
    os.makedirs("data/pumpfun-metrics-history", exist_ok=True)
    
    # Generate timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Connect to database
    conn = sqlite3.connect("data/pumpfun.db")
    cursor = conn.cursor()
    
    # Export trade outcomes
    cursor.execute("""
        SELECT 
            mint_address,
            token_symbol,
            entry_score,
            entry_sol,
            exit_sol,
            pnl_sol,
            pnl_pct,
            max_multiplier,
            outcome,
            hold_time_minutes,
            partial_sells_count,
            tp_levels_hit,
            closed_at
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
        ORDER BY closed_at DESC
    """)
    
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    
    # Convert to list of dictionaries
    data = [dict(zip(columns, row)) for row in rows]
    
    # Write to JSON file
    output_file = f"data/pumpfun-metrics-{timestamp}.json"
    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    # Update latest symlink
    os.makedirs("data", exist_ok=True)
    if os.path.exists("data/pumpfun-metrics-latest.json"):
        os.remove("data/pumpfun-metrics-latest.json")
    os.symlink(output_file, "data/pumpfun-metrics-latest.json")
    
    print(f"✅ Metrics exported to {output_file}")
    
    # Export basic statistics
    cursor.execute("""
        SELECT 
            COUNT(*) as total_trades,
            COUNT(CASE WHEN outcome = 'WIN' THEN 1 END) as wins,
            COUNT(CASE WHEN outcome = 'LOSS' THEN 1 END) as losses,
            ROUND(COUNT(CASE WHEN outcome = 'WIN' THEN 1 END) * 100.0 / COUNT(*), 2) as win_rate,
            ROUND(AVG(pnl_pct), 2) as avg_pnl_pct,
            ROUND(MAX(pnl_pct), 2) as best_pnl_pct,
            ROUND(MIN(pnl_pct), 2) as worst_pnl_pct,
            ROUND(AVG(hold_time_minutes), 2) as avg_hold_time_min,
            COUNT(CASE WHEN outcome = 'WIN' AND tp_levels_hit IS NOT NULL AND tp_levels_hit != '' THEN 1 END) as tp_wins
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
    """)
    
    stats = cursor.fetchone()
    print(f"📈 Trade Statistics:")
    print(f"   Total trades: {stats[0]}")
    print(f"   Wins: {stats[1]}")
    print(f"   Losses: {stats[2]}")
    print(f"   Win rate: {stats[3]}%")
    print(f"   Avg PnL%: {stats[4]}%")
    print(f"   Best PnL%: {stats[5]}%")
    print(f"   Worst PnL%: {stats[6]}%")
    print(f"   Avg hold time: {stats[7]} min")
    print(f"   TP wins: {stats[8]}")
    
    # Analyze by score buckets
    print(f"\n📊 Score Analysis:")
    cursor.execute("""
        SELECT 
            CASE 
                WHEN entry_score >= 0.7 THEN '0.70-1.00'
                WHEN entry_score >= 0.6 THEN '0.60-0.69'
                WHEN entry_score >= 0.5 THEN '0.50-0.59'
                WHEN entry_score >= 0.4 THEN '0.40-0.49'
                WHEN entry_score >= 0.3 THEN '0.30-0.39'
                ELSE '0.00-0.29'
            END as score_bucket,
            COUNT(*) as count,
            COUNT(CASE WHEN outcome = 'WIN' THEN 1 END) as wins,
            ROUND(COUNT(CASE WHEN outcome = 'WIN' THEN 1 END) * 100.0 / COUNT(*), 2) as win_rate,
            ROUND(AVG(pnl_pct), 2) as avg_pnl_pct
        FROM pumpfun_trade_outcomes
        WHERE entry_score IS NOT NULL
        GROUP BY score_bucket
        ORDER BY score_bucket DESC
    """)
    
    bucket_stats = cursor.fetchall()
    for bucket in bucket_stats:
        print(f"   {bucket[0]}: {bucket[1]} trades, {bucket[2]} wins, {bucket[3]}% WR, {bucket[4]}% avg PnL")
    
    conn.close()
    print("📈 Metrics analysis complete")

if __name__ == "__main__":
    export_metrics()