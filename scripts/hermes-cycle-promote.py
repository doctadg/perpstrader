#!/usr/bin/env python3
"""Hermes Training Cycle - Strategy Promotion (20260321-2348)"""
import sqlite3, json, hashlib

DB_PATH = '/home/d/PerpsTrader/data/trading.db'
db = sqlite3.connect(DB_PATH)
db.row_factory = sqlite3.Row

def params_hash(params):
    return hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:12]

strategies = [
    {
        "name": "Winners Elite RSI BB Scalp v2",
        "description": "Upgraded Winners Only. 8 proven winning symbols. RSI 27/73, BB 20/2.0.",
        "type": "MEAN_REVERSION",
        "symbols": ["SOL", "ETH", "FARTCOIN", "BCH", "kPEPE", "ZEC", "PUMP", "TRUMP"],
        "timeframe": "15m",
        "parameters": {"indicator1": "RSI", "indicator2": "Bollinger Bands", "rsiPeriod": 12, "oversold": 27, "overbought": 73, "bbPeriod": 20, "bbStdDev": 2.0, "minSignalStrength": 0.8, "cooldownBars": 3, "volumeFilter": 1.5},
        "entryConditions": ["RSI < 27 AND price < lower BB", "Volume > 1.5x avg"],
        "exitConditions": ["RSI > 73 OR price > upper BB", "Stop loss 1.5%", "Take profit 3%"],
        "riskParameters": {"maxPositionSize": 0.06, "stopLoss": 0.015, "takeProfit": 0.03, "maxLeverage": 3},
    },
    {
        "name": "FARTCOIN RSI BB Scalp v2",
        "description": "FARTCOIN dedicated. $5 PnL 7d, 90% WR. Wider bands 2.2, higher TP 5%.",
        "type": "MEAN_REVERSION",
        "symbols": ["FARTCOIN"],
        "timeframe": "15m",
        "parameters": {"indicator1": "RSI", "indicator2": "Bollinger Bands", "rsiPeriod": 10, "oversold": 25, "overbought": 75, "bbPeriod": 18, "bbStdDev": 2.2, "cooldownBars": 4, "volumeFilter": 1.8},
        "entryConditions": ["RSI < 25 AND price < lower BB", "Volume spike > 1.8x"],
        "exitConditions": ["RSI > 75 OR price > upper BB", "Trailing stop 2%", "Take profit 5%"],
        "riskParameters": {"maxPositionSize": 0.04, "stopLoss": 0.025, "takeProfit": 0.05, "maxLeverage": 4},
    },
    {
        "name": "SOL ETH BCH Consolidated MR",
        "description": "3 large caps, all >75% WR. EMA50 trend filter for safety.",
        "type": "MEAN_REVERSION",
        "symbols": ["SOL", "ETH", "BCH"],
        "timeframe": "15m",
        "parameters": {"indicator1": "RSI", "indicator2": "Bollinger Bands", "rsiPeriod": 14, "oversold": 30, "overbought": 70, "bbPeriod": 20, "bbStdDev": 2.0, "cooldownBars": 3, "volumeFilter": 1.3, "emaTrend": 50},
        "entryConditions": ["RSI < 30 AND price < lower BB", "Price > EMA 50", "Volume > 1.3x avg"],
        "exitConditions": ["RSI > 70 OR price > upper BB", "Stop loss 1.5%", "Take profit 3%"],
        "riskParameters": {"maxPositionSize": 0.05, "stopLoss": 0.015, "takeProfit": 0.03, "maxLeverage": 3},
    }
]

empty_perf = json.dumps({"totalTrades":0,"winningTrades":0,"losingTrades":0,"winRate":0,"totalPnL":0,"sharpeRatio":0,"maxDrawdown":0,"averageWin":0,"averageLoss":0,"profitFactor":0})

for s in strategies:
    sid = f"hermes-{hashlib.md5(s['name'].encode()).hexdigest()[:16]}"
    ph = params_hash(s['parameters'])

    existing = db.execute("SELECT id FROM strategies WHERE params_hash=?", (ph,)).fetchone()
    if existing:
        print(f"SKIP (dup): {s['name']} -> {existing['id']}")
        db.execute("UPDATE strategies SET isActive=1, updatedAt=datetime('now') WHERE id=?", (existing['id'],))
        continue

    db.execute("""
        INSERT INTO strategies (id, name, description, type, symbols, timeframe, parameters, entryConditions, exitConditions, riskParameters, isActive, performance, createdAt, updatedAt, params_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    """, (
        sid, s['name'], s['description'], s['type'],
        json.dumps(s['symbols']), s['timeframe'],
        json.dumps(s['parameters']), json.dumps(s['entryConditions']),
        json.dumps(s['exitConditions']), json.dumps(s['riskParameters']),
        1, empty_perf, ph
    ))
    print(f"INSERTED: {s['name']} -> {sid} (hash={ph})")

# Record generations
for s in strategies:
    sid = f"hermes-{hashlib.md5(s['name'].encode()).hexdigest()[:16]}"
    gen_id = f"gen-{sid[:20]}"
    try:
        db.execute("""
            INSERT INTO strategy_generations (id, strategy_id, parent_id, generation, parameters, mutation_type, created_at)
            VALUES (?, ?, 'hermes-fd40e2f6fea8', 3, ?, 'hermes_live_promotion', datetime('now'))
        """, (gen_id, sid, json.dumps(s['parameters'])))
        print(f"GEN: {gen_id}")
    except Exception as e:
        print(f"GEN SKIP: {e}")

db.commit()

# Verify
active = db.execute("SELECT id, name, type, symbols FROM strategies WHERE isActive=1").fetchall()
print(f"\nACTIVE: {len(active)}")
for row in active:
    print(f"  {row['id']}: {row['name']} ({row['type']}) {row['symbols']}")

db.close()
