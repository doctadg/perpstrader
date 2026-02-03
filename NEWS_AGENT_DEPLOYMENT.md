# Global Newsfeed Agent - Deployment Guide

## Overview
24/7 autonomous newsfeed agent that searches, categorizes, and stores global news.

## Quick Start

### 1. Start the News Agent
```bash
# Test run
node /home/d/PerpsTrader/bin/news-agent.js

# Or run in background
nohup node /home/d/PerpsTrader/bin/news-agent.js > /home/d/PerpsTrader/logs/news-agent.log 2>&1 &
```

### 2. Enable Systemd Service (24/7)
```bash
# Copy service file
cp /home/d/PerpsTrader/systemd/perps-news.service ~/.config/systemd/user/

# Reload systemd
systemctl --user daemon-reload

# Start service
systemctl --user start perps-news

# Check status
systemctl --user status perps-news

# View logs
journalctl --user -u perps-news -f

# Enable at boot
systemctl --user enable perps-news
```

### 3. Access Dashboard
- Open: `http://localhost:3001/news`
- Filter by category
- Search news
- View statistics

## Features

**Search Categories:**
- CRYPTO (bitcoin, ethereum, defi, regulation)
- STOCKS (market, earnings, S&P 500, Nasdaq)
- ECONOMICS (Fed, inflation, GDP, central bank)
- GEOPOLITICS (trade war, international relations, sanctions)
- TECH (AI, startups, big tech, innovation)
- COMMODITIES (gold, oil, energy, agriculture)

**News Processing:**
- Searches every 60 seconds (configurable)
- Dynamic query planning (rotating queries + trending keywords)
- LLM categorization + fallback rules
- Duplicate detection (URL/title hash)
- Sentiment analysis (BULLISH/BEARISH/NEUTRAL)
- Importance scoring (LOW/MEDIUM/HIGH/CRITICAL)
- Tag extraction (3-5 tags per article)
- Stored locally in SQLite

**Dashboard API:**
- `GET /api/news` - Recent news (limit 50, category filter)
- `GET /api/news/stats` - Full statistics
- `GET /api/news/tags` - All unique tags
- `GET /api/news/search?q=...` - Keyword search

## Environment Variables

Already configured in systemd service:
- `SEARCH_API_URL=http://localhost:8000/api/v1` - Search server URL
- `NODE_ENV=production`

Optional tuning:
- `NEWS_DB_PATH=/home/d/PerpsTrader/data/news.db` - SQLite database path
- `NEWS_CYCLE_INTERVAL_MS=60000` - Cycle interval in milliseconds
- `NEWS_QUERIES_PER_CATEGORY=6` - Number of queries per category per cycle
- `NEWS_RESULTS_PER_QUERY=25` - Results per query
- `NEWS_QUERY_COOLDOWN_MS=300000` - Cooldown before reusing a query
- `NEWS_QUERY_CONCURRENCY=4` - Concurrent queries per category
- `NEWS_DEDUPE_TTL_MS=3600000` - Dedupe TTL for seen URLs/titles (set 0 to disable)
- `NEWS_CLEAR_CACHE_ON_START=true` - Flush cache on startup to re-pull articles
- `NEWS_RESEARCH_ENABLED=true` - Enable deep research fallback
- `NEWS_RESEARCH_THRESHOLD=8` - Trigger research if results below threshold
- `NEWS_RESEARCH_PAGES=3` - Pages to pull per research query
- `NEWS_CONTEXT_REFRESH_MS=600000` - Refresh interval for dynamic context
- `NEWS_CONTEXT_LOOKBACK=200` - Recent articles used for query expansion
- `NEWS_SCRAPE_LIMIT=120` - Max articles to scrape per cycle
- `NEWS_SCRAPE_CONCURRENCY=8` - Parallel scrape requests
- `NEWS_MIN_CONTENT_CHARS=40` - Minimum content length to accept scrape
- `NEWS_CACHE_SIZE=20000` - Cache size for seen URLs/titles

## Troubleshooting

### SQLite Database Error
If you see "Failed to initialize news database", ensure the `data/` directory is writable and `NEWS_DB_PATH` points to a valid location.

### LLM Categorization
If GLM API key is not configured, fallback categorization rules will be used. Set `ZAI_API_KEY` in `.env`.

### Search Server
Ensure search server is running:
```bash
curl http://localhost:8000/api/v1/health
```

## Files Reference

| File | Purpose |
|------|---------|
| src/shared/types.ts | News type definitions |
| src/data/news-store.ts | SQLite store |
| src/news-ingester/news-search.ts | Search API integration |
| src/news-agent/graph.ts | Orchestrator |
| src/news-agent/state.ts | Agent state |
| src/news-agent/nodes/*.ts | Individual nodes |
| src/news-agent.ts | Main entry |
| dashboard/public/news.html | Newsfeed UI |
| dashboard-server.ts | API routes |
| systemd/perps-news.service | Systemd service |
| bin/news-agent.js | Compiled entry |

## Logs

Agent logs: `/home/d/PerpsTrader/logs/news-agent.log`
Systemd logs: `journalctl --user -u perps-news`
