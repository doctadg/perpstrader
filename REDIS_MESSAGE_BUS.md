# Redis Message Bus Architecture for PerpsTrader

## Overview

An isolated Redis instance (port 6380) provides ultra-fast message passing, caching, and job queuing for the PerpsTrader system. This completely replaces the inefficient polling architecture.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         REDIS MESSAGE BUS (Port 6380)                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                         │
│  │   DB 0       │  │   DB 1       │  │   DB 2       │                         │
│  │  Pub/Sub     │  │   Cache      │  │  Job Queues  │                         │
│  │              │  │              │  │              │                         │
│  │ - Real-time  │  │ - LLM resp   │  │ - categorize │                         │
│  │   events     │  │ - Embeddings │  │ - label      │                         │
│  │ - Updates    │  │ - Categories │  │ - cluster    │                         │
│  │ - Status     │  │ - Clusters   │  │ - backtest   │                         │
│  └──────────────┘  └──────────────┘  └──────────────┘                         │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Database Layout

| Database | Purpose | Key Pattern |
|----------|---------|-------------|
| **DB 0** | Pub/Sub messages | `trading:*`, `news:*`, `system:*` |
| **DB 1** | Cache | `perps:cache:{namespace}:{key}` |
| **DB 2** | Job Queues | `bull:{queue}:*` |

## Services

### 1. perps-redis.service
Isolated Redis instance on port 6380 (separate from system Redis on 6379)

### 2. perps-news-worker.service
Background worker for async news processing jobs

## Key Features

### Pub/Sub Channels (`src/shared/message-bus.ts`)

```typescript
// Trading cycle events
trading:cycle:start
trading:cycle:complete
trading:cycle:step

// News events
news:scrape:start
news:categorized
news:clustered
news:hot

// Execution events
execution:submit
execution:filled
execution:failed

// Position events
position:opened
position:closed
position:updated

// System events
system:health
circuit:breaker:open
circuit:breaker:closed
```

### Cache Namespaces (`src/shared/redis-cache.ts`)

| Namespace | TTL | Purpose |
|-----------|-----|---------|
| `llm` | 1 hour | OpenRouter/GLM responses |
| `embedding` | 24 hours | Text embeddings |
| `categorization` | 30 min | Article categories |
| `event_label` | 30 min | Event topic labels |
| `cluster` | 10 min | Cluster lookups |

### Job Queues (`src/shared/job-queue.ts`)

| Queue | Job Types | Worker |
|-------|-----------|--------|
| `categorization` | `news:categorize` | news-worker |
| `labeling` | `news:label` | news-worker |
| `embeddings` | `news:embed` | news-worker |
| `news-processing` | `news:cluster` | news-worker |
| `backtesting` | `trading:backtest` | (future) |
| `pattern-search` | `trading:pattern-search` | (future) |

## Performance Improvements

### Before (Polling)
```
Dashboard ──poll──> News DB (every 10s)
News Agent ──sequential──> Clustering (15-40s)
```

### After (Pub/Sub + Cache + Queues)
```
News Agent ──publish──> Redis ──push──> Dashboard
              │
              ├──> Cache (LLM responses)
              └──> Job Queue ──worker──> Parallel processing
```

**Expected Speedup**: 10-20x faster clustering, 30-50% LLM cache hit rate

## Installation

```bash
# Run setup script
sudo ./scripts/setup-redis.sh

# Or manual setup
sudo cp systemd/perps-redis.service /etc/systemd/system/
sudo cp systemd/perps-news-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now perps-redis
sudo systemctl enable --now perps-news-worker
```

## Usage Examples

### Publishing Events
```typescript
import messageBus, { Channel } from './shared/message-bus';

// Publish trading cycle complete
await messageBus.publish(Channel.CYCLE_COMPLETE, {
  symbol: 'BTC',
  pnl: 150,
  tradeExecuted: true,
});
```

### Subscribing to Events
```typescript
// Subscribe to news updates
await messageBus.subscribe(Channel.NEWS_CLUSTERED, (message) => {
  console.log('New clusters:', message.data);
});
```

### Using Cache
```typescript
import redisCache from './shared/redis-cache';

// Check cache before LLM call
const cached = await redisCache.getLLMResponse(prompt, 'gpt-4');
if (cached) return cached;

// Call LLM and cache result
const result = await openrouterService.generateEventLabel(input);
await redisCache.setLLMResponse(prompt, 'gpt-4', result);
```

### Using Job Queues
```typescript
import jobQueueManager from './shared/job-queue';

// Add async job
await jobQueueManager.addLabelJob({
  articles: [...],
  priority: 5,
});

// Job is processed by worker in background
```

## Monitoring

```bash
# Redis status
redis-cli -p 6380 INFO

# Queue stats
redis-cli -p 6380 KEYS "bull:*"

# Cache stats
redis-cli -p 6380 DBSIZE  # Switch DB first: SELECT 1

# Service logs
journalctl -u perps-redis -f
journalctl -u perps-news-worker -f
```

## Configuration

Environment variables (`.env` or `config/redis.env`):

```bash
# Connection
REDIS_HOST=127.0.0.1
REDIS_PORT=6380
REDIS_PASSWORD=
REDIS_DB=0

# Cache
REDIS_CACHE_DB=1
REDIS_CACHE_PREFIX=perps:cache:

# Queues
REDIS_QUEUE_DB=2

# Performance
NEWS_WORKER_CONCURRENCY=10
OPENROUTER_CONCURRENCY=8
```

## Migration Path

1. **Phase 1**: Install Redis, start services (non-blocking)
2. **Phase 2**: Wire message bus into dashboard (replace polling)
3. **Phase 3**: Add cache layer to LLM calls
4. **Phase 4**: Migrate clustering to job queues (parallel processing)
5. **Phase 5**: Add more workers for backtesting, pattern search

## Files Created

- `systemd/perps-redis.service` - Isolated Redis instance
- `systemd/perps-news-worker.service` - Background worker
- `config/redis.conf` - Redis configuration
- `src/shared/message-bus.ts` - Pub/Sub service
- `src/shared/redis-cache.ts` - Cache layer
- `src/shared/job-queue.ts` - Job queue manager
- `src/workers/news-worker.ts` - News processing worker
- `scripts/setup-redis.sh` - Installation script
