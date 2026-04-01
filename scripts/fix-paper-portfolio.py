#!/usr/bin/env python3
import json
import sqlite3

# Connect to the database
conn = sqlite3.connect('/home/d/PerpsTrader/data/trading.db')
cursor = conn.cursor()

# Get current state
cursor.execute("SELECT data FROM ai_insights WHERE type='paper_portfolio' ORDER BY timestamp DESC LIMIT 1")
row = cursor.fetchone()
if not row:
    print("No paper portfolio state found")
    conn.close()
    exit(0)

data = json.loads(row[0])

# Filter out corrupted positions (null entryPrice or size)
original_count = len(data['positions'])
data['positions'] = [p for p in data['positions'] 
                     if p.get('entryPrice') is not None 
                     and p.get('size') is not None
                     and p.get('entryPrice') > 0
                     and p.get('size') > 0]

# Update the record
updated_json = json.dumps(data)
cursor.execute("""
    UPDATE ai_insights 
    SET data = ?, timestamp = datetime('now')
    WHERE type = 'paper_portfolio'
""", (updated_json,))

conn.commit()
print(f"Updated paper portfolio: removed {original_count - len(data['positions'])} corrupted positions")
print(f"Remaining: {[p['symbol'] for p in data['positions']]}")
conn.close()
