#!/usr/bin/env python3

# Create sample pumpfun trade data for testing the training system

import sqlite3
import json
import datetime
from pathlib import Path

def create_sample_database():
    """Create sample pumpfun trade data for testing"""
    
    # Create database
    conn = sqlite3.connect("pumpfun.db")
    cursor = conn.cursor()
    
    # Create table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pumpfun_trade_outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_symbol TEXT,
            entry_score REAL,
            pnl_sol REAL,
            pnl_pct REAL,
            outcome TEXT,
            hold_time_minutes INTEGER,
            trade_reason TEXT,
            created_at TEXT,
            max_multiplier REAL
        )
    """)
    
    # Insert sample data with realistic patterns
    sample_trades = [
        # High score trades - some winners, some losers
        ("METH", 0.85, 2.5, 25.0, "TAKE_PROFIT", 45, "SNIPER", datetime.datetime.now().isoformat(), 3.2),
        ("COIN", 0.78, -1.0, -10.0, "LOSS_STOP", 12, "SNIPER", datetime.datetime.now().isoformat(), 0.8),
        ("TOKEN", 0.72, 1.8, 18.0, "TAKE_PROFIT", 38, "SNIPER", datetime.datetime.now().isoformat(), 2.8),
        ("MEME", 0.68, -0.5, -5.0, "LOSS_STOP", 8, "SNIPER", datetime.datetime.now().isoformat(), 0.9),
        ("GEM", 0.65, 3.2, 32.0, "TAKE_PROFIT", 62, "SNIPER", datetime.datetime.now().isoformat(), 4.1),
        
        # Mid score trades - mixed results
        ("COIN2", 0.55, -1.2, -12.0, "LOSS_STOP", 15, "SNIPER", datetime.datetime.now().isoformat(), 0.7),
        ("TOKEN2", 0.52, 0.8, 8.0, "TAKE_PROFIT", 35, "SNIPER", datetime.datetime.now().isoformat(), 1.9),
        ("MEME2", 0.48, -0.8, -8.0, "LOSS_STOP", 22, "SNIPER", datetime.datetime.now().isoformat(), 0.8),
        ("GEM2", 0.45, 1.5, 15.0, "TAKE_PROFIT", 48, "SNIPER", datetime.datetime.now().isoformat(), 2.5),
        
        # Low score trades - mostly losers with some winners
        ("RUG1", 0.35, -0.3, -3.0, "LOSS_STOP", 4, "SNIPER", datetime.datetime.now().isoformat(), 0.9),
        ("RUG2", 0.32, -1.5, -15.0, "LOSS_STOP", 6, "SNIPER", datetime.datetime.now().isoformat(), 0.6),
        ("OK1", 0.38, 0.5, 5.0, "TAKE_PROFIT", 25, "SNIPER", datetime.datetime.now().isoformat(), 1.8),
        ("RUG3", 0.29, -0.7, -7.0, "LOSS_STOP", 3, "SNIPER", datetime.datetime.now().isoformat(), 0.8),
        
        # Quick rugs - very short hold times, losses
        ("RUG4", 0.42, -0.4, -4.0, "LOSS_STOP", 2, "SNIPER", datetime.datetime.now().isoformat(), 0.95),
        ("RUG5", 0.38, -0.6, -6.0, "LOSS_STOP", 3, "SNIPER", datetime.datetime.now().isoformat(), 0.85),
        ("RUG6", 0.35, -0.9, -9.0, "LOSS_STOP", 1, "SNIPER", datetime.datetime.now().isoformat(), 0.7),
        
        # Additional trades for better statistics
        ("GOOD1", 0.58, 2.1, 21.0, "TAKE_PROFIT", 55, "SNIPER", datetime.datetime.now().isoformat(), 3.2),
        ("OK2", 0.41, -0.2, -2.0, "LOSS_STOP", 18, "SNIPER", datetime.datetime.now().isoformat(), 0.95),
        ("GEM3", 0.75, 1.9, 19.0, "TAKE_PROFIT", 42, "SNIPER", datetime.datetime.now().isoformat(), 2.9),
        ("RUG7", 0.31, -1.1, -11.0, "LOSS_STOP", 5, "SNIPER", datetime.datetime.now().isoformat(), 0.75),
    ]
    
    # Insert sample trades
    for trade in sample_trades:
        cursor.execute("""
            INSERT INTO pumpfun_trade_outcomes 
            (token_symbol, entry_score, pnl_sol, pnl_pct, outcome, hold_time_minutes, trade_reason, created_at, max_multiplier)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, trade)
    
    conn.commit()
    conn.close()
    
    print(f"✅ Created sample database with {len(sample_trades)} trades")

if __name__ == "__main__":
    create_sample_database()