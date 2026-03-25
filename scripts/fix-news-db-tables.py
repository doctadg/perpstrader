#!/usr/bin/env python3
"""
Fix for missing markets and market_mentions tables in news.db
These tables are needed by MarketMentionExtractor for the dashboard heatmap.
"""
import sqlite3

db_path = "/home/d/PerpsTrader/data/news.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("Creating missing tables in news.db...")

# Create markets table
cursor.execute("""
CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'crypto',
    category TEXT DEFAULT 'spot',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
)
""")
print("  ✓ markets table created")

# Create market_mentions table  
cursor.execute("""
CREATE TABLE IF NOT EXISTS market_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    relevance_score REAL DEFAULT 0.5,
    sentiment_score REAL DEFAULT 0.0,
    extracted_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (market_id) REFERENCES markets(id),
    FOREIGN KEY (article_id) REFERENCES news_articles(id)
)
""")
print("  ✓ market_mentions table created")

# Create index for performance
cursor.execute("""
CREATE INDEX IF NOT EXISTS idx_market_mentions_extracted_at 
ON market_mentions(extracted_at)
""")
cursor.execute("""
CREATE INDEX IF NOT EXISTS idx_market_mentions_market_id 
ON market_mentions(market_id)
""")
print("  ✓ indexes created")

# Populate markets from trading.db if available
trading_db_path = "/home/d/PerpsTrader/data/trading.db"
try:
    trading_conn = sqlite3.connect(trading_db_path)
    trading_cursor = trading_conn.cursor()
    
    # Get markets from trading.db
    trading_cursor.execute("SELECT id, name, type, category, active FROM markets WHERE active=1")
    markets = trading_cursor.fetchall()
    
    if markets:
        cursor.executemany(
            "INSERT OR IGNORE INTO markets (id, name, type, category, active) VALUES (?, ?, ?, ?, ?)",
            markets
        )
        print(f"  ✓ Copied {len(markets)} markets from trading.db")
    
    trading_conn.close()
except Exception as e:
    print(f"  ⚠ Could not copy markets from trading.db: {e}")

conn.commit()
conn.close()
print("\nDone! news.db now has markets and market_mentions tables.")
