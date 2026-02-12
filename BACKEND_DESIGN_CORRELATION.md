# Article-Market Correlation System - Backend Design

## Executive Summary

This document outlines the backend architecture for integrating article-market correlation capabilities into the existing PerpsTrader system. The design leverages existing infrastructure (SQLite, Redis, message bus) while adding new components for correlation analysis.

## 1. Database Schema Extensions

### 1.1 New Tables

#### `article_market_correlations`
Stores correlation analysis results between articles and prediction markets.

```sql
CREATE TABLE IF NOT EXISTS article_market_correlations (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    correlation_score REAL NOT NULL CHECK(correlation_score BETWEEN 0 AND 1),
    correlation_type TEXT CHECK(correlation_type IN ('DIRECT', 'SEMANTIC', 'ENTITY', 'TOPIC', 'TEMPORAL')),
    confidence REAL NOT NULL CHECK(confidence BETWEEN 0 AND 1),
    
    -- Analysis metadata
    analysis_method TEXT NOT NULL, -- 'LLM', 'EMBEDDING', 'KEYWORD', 'HYBRID'
    analysis_version TEXT NOT NULL, -- Schema version for migrations
    
    -- Market impact prediction
    predicted_direction TEXT CHECK(predicted_direction IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
    predicted_impact_score REAL CHECK(predicted_impact_score BETWEEN 0 AND 100),
    time_to_impact_minutes INTEGER, -- Expected time for market reaction
    
    -- Verification tracking
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    actual_direction TEXT CHECK(actual_direction IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
    actual_impact_score REAL CHECK(actual_impact_score BETWEEN 0 AND 100),
    prediction_accuracy REAL CHECK(prediction_accuracy BETWEEN 0 AND 1),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP, -- Correlations become stale
    
    -- JSON metadata
    metadata TEXT, -- Stores matched entities, keywords, reasoning
    
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    UNIQUE(article_id, market_id, analysis_method)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_correlations_article ON article_market_correlations(article_id);
CREATE INDEX IF NOT EXISTS idx_correlations_market ON article_market_correlations(market_id);
CREATE INDEX IF NOT EXISTS idx_correlations_score ON article_market_correlations(correlation_score) 
    WHERE correlation_score > 0.7;
CREATE INDEX IF NOT EXISTS idx_correlations_created ON article_market_correlations(created_at);
CREATE INDEX IF NOT EXISTS idx_correlations_expires ON article_market_correlations(expires_at);
CREATE INDEX IF NOT EXISTS idx_correlations_verified ON article_market_correlations(verified, created_at);
CREATE INDEX IF NOT EXISTS idx_correlations_predicted ON article_market_correlations(predicted_direction, confidence)
    WHERE predicted_direction IS NOT NULL;
```

#### `correlation_analysis_jobs`
Tracks background correlation analysis jobs.

```sql
CREATE TABLE IF NOT EXISTS correlation_analysis_jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL CHECK(job_type IN ('ARTICLE_INGEST', 'MARKET_UPDATE', 'BATCH_RECALC', 'VERIFICATION')),
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    
    -- Job parameters
    article_id TEXT,
    market_id TEXT,
    batch_size INTEGER,
    priority INTEGER DEFAULT 5 CHECK(priority BETWEEN 1 AND 10),
    
    -- Processing metadata
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Results
    processed_count INTEGER,
    correlation_count INTEGER,
    error_message TEXT,
    
    -- Worker assignment
    worker_id TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON correlation_analysis_jobs(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_article ON correlation_analysis_jobs(article_id);
CREATE INDEX IF NOT EXISTS idx_jobs_market ON correlation_analysis_jobs(market_id);
CREATE INDEX IF NOT EXISTS idx_jobs_worker ON correlation_analysis_jobs(worker_id, status);
```

#### `market_price_impacts`
Tracks actual market price movements following article publication.

```sql
CREATE TABLE IF NOT EXISTS market_price_impacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    
    -- Price at article time
    price_at_publish REAL,
    timestamp_at_publish TIMESTAMP,
    
    -- Price movements (cents, so 0.5 = 50 cents)
    price_5min REAL,
    price_15min REAL,
    price_30min REAL,
    price_1hr REAL,
    price_4hr REAL,
    price_24hr REAL,
    
    -- Volume changes
    volume_at_publish REAL,
    volume_1hr REAL,
    volume_24hr REAL,
    
    -- Computed metrics
    price_change_5min_pct REAL,
    price_change_1hr_pct REAL,
    price_change_24hr_pct REAL,
    volatility_increase BOOLEAN,
    
    -- Correlation to prediction
    predicted_vs_actual_alignment REAL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    UNIQUE(article_id, market_id)
);

CREATE INDEX IF NOT EXISTS idx_impacts_article ON market_price_impacts(article_id);
CREATE INDEX IF NOT EXISTS idx_impacts_market ON market_price_impacts(market_id);
CREATE INDEX IF NOT EXISTS idx_impacts_created ON market_price_impacts(created_at);
CREATE INDEX IF NOT EXISTS idx_impacts_alignment ON market_price_impacts(predicted_vs_actual_alignment)
    WHERE predicted_vs_actual_alignment IS NOT NULL;
```

#### `correlation_feedback`
Stores user/AI feedback on correlation quality for model improvement.

```sql
CREATE TABLE IF NOT EXISTS correlation_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    correlation_id TEXT NOT NULL,
    feedback_type TEXT NOT NULL CHECK(feedback_type IN ('THUMBS_UP', 'THUMBS_DOWN', 'IRRELEVANT', 'MISSING_LINK')),
    feedback_source TEXT NOT NULL CHECK(feedback_source IN ('USER', 'AI_VALIDATION', 'AUTO_CORRECT')),
    
    -- Optional feedback details
    notes TEXT,
    suggested_market_id TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (correlation_id) REFERENCES article_market_correlations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedback_correlation ON correlation_feedback(correlation_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON correlation_feedback(feedback_type, feedback_source);
```

#### `embedding_cache`
Caches article and market embeddings for similarity search.

```sql
CREATE TABLE IF NOT EXISTS embedding_cache (
    id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL CHECK(content_type IN ('ARTICLE', 'MARKET_TITLE', 'MARKET_DESCRIPTION')),
    content_id TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    embedding_dimensions INTEGER NOT NULL,
    embedding BLOB NOT NULL, -- Compressed float array
    content_hash TEXT NOT NULL, -- For invalidation
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    UNIQUE(content_type, content_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_embedding_type ON embedding_cache(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_embedding_model ON embedding_cache(embedding_model);
CREATE INDEX IF NOT EXISTS idx_embedding_expires ON embedding_cache(expires_at);
```

### 1.2 Indexes Summary

| Table | Index | Purpose |
|-------|-------|---------|
| article_market_correlations | `idx_correlations_score` | Fast high-confidence lookups |
| article_market_correlations | `idx_correlations_created` | Time-based queries |
| article_market_correlations | `idx_correlations_expires` | Cleanup stale correlations |
| correlation_analysis_jobs | `idx_jobs_status` | Worker job polling |
| market_price_impacts | `idx_impacts_alignment` | Model accuracy tracking |
| embedding_cache | `idx_embedding_expires` | Cache eviction |

### 1.3 Migration Strategy

```typescript
// src/correlation/migrations/001_initial_schema.ts
import Database from 'better-sqlite3';

const MIGRATIONS = [
  {
    version: '1.0.0',
    name: 'initial_correlation_schema',
    up: `
      -- Create correlation tables
      CREATE TABLE IF NOT EXISTS article_market_correlations (...);
      CREATE TABLE IF NOT EXISTS correlation_analysis_jobs (...);
      CREATE TABLE IF NOT EXISTS market_price_impacts (...);
      CREATE TABLE IF NOT EXISTS correlation_feedback (...);
      CREATE TABLE IF NOT EXISTS embedding_cache (...);
      
      -- Create indexes
      CREATE INDEX ...;
      
      -- Create migration tracking table
      CREATE TABLE IF NOT EXISTS correlation_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum TEXT
      );
      
      INSERT INTO correlation_migrations (version, checksum) 
      VALUES ('1.0.0', '${computeChecksum(this.up)}');
    `,
  },
  {
    version: '1.1.0',
    name: 'add_market_volatility_tracking',
    up: `
      ALTER TABLE market_price_impacts 
      ADD COLUMN volatility_before REAL;
      
      ALTER TABLE market_price_impacts 
      ADD COLUMN volatility_after REAL;
    `,
  },
];

export async function runMigrations(db: Database.Database): Promise<void> {
  // Check current version
  const currentVersion = db.prepare(
    "SELECT version FROM correlation_migrations ORDER BY version DESC LIMIT 1"
  ).get()?.version || '0.0.0';
  
  // Apply pending migrations
  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      console.log(`[Migration] Applying ${migration.version}: ${migration.name}`);
      db.exec(migration.up);
    }
  }
}
```

## 2. API Endpoints

### 2.1 REST Endpoints

#### Correlation Management

```typescript
// GET /api/correlations
// Query parameters:// - articleId?: string - Filter by article
// - marketId?: string - Filter by market
// - minScore?: number (0-1) - Minimum correlation score
// - maxScore?: number (0-1) - Maximum correlation score
// - type?: 'DIRECT' | 'SEMANTIC' | 'ENTITY' | 'TOPIC' | 'TEMPORAL'
// - direction?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' - Predicted direction
// - verified?: boolean - Only verified correlations
// - limit?: number (default 50, max 200)
// - offset?: number
// - since?: ISO timestamp
// - until?: ISO timestamp
// Response: PaginatedCorrelationResponse

// GET /api/correlations/:id
// Get single correlation by ID

// POST /api/correlations/analyze
// Trigger manual correlation analysis
// Body: {
//   articleId: string;
//   marketIds?: string[]; // Optional: specific markets to check
//   methods?: ('LLM' | 'EMBEDDING' | 'KEYWORD')[];
//   priority?: number (1-10);
// }
// Response: { jobId: string; status: string; estimatedCompletion: string }

// POST /api/correlations/batch
// Trigger batch analysis for multiple articles
// Body: {
//   articleIds?: string[]; // Empty = all recent unanalyzed
//   since?: ISO timestamp;
//   marketFilter?: 'ALL' | 'ACTIVE' | 'HIGH_VOLUME';
// }

// GET /api/correlations/markets/:marketId/articles
// Get all articles correlated with a specific market

// GET /api/correlations/articles/:articleId/markets
// Get all markets correlated with a specific article
```

#### Impact Tracking

```typescript
// GET /api/correlations/impacts
// Query parameters:
// - articleId?: string
// - marketId?: string
// - minAlignment?: number (-1 to 1)
// - timeframe?: '5min' | '1hr' | '24hr'
// Response: MarketPriceImpact[]

// GET /api/correlations/accuracy
// Get correlation prediction accuracy metrics
// Query parameters:
// - since?: ISO timestamp
// - method?: string
// Response: {
//   overallAccuracy: number;
//   byMethod: Record<string, number>;
//   byDirection: Record<string, number>;
//   totalVerified: number;
// }
```

#### Job Management

```typescript
// GET /api/correlations/jobs
// List correlation analysis jobs
// Query parameters:
// - status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
// - type?: string
// - limit?: number
// Response: CorrelationJob[]

// GET /api/correlations/jobs/:id
// Get job details and progress

// POST /api/correlations/jobs/:id/cancel
// Cancel a pending or processing job

// DELETE /api/correlations/jobs/completed
// Clean up old completed jobs
```

#### Feedback

```typescript
// POST /api/correlations/:id/feedback
// Submit feedback on a correlation
// Body: {
//   type: 'THUMBS_UP' | 'THUMBS_DOWN' | 'IRRELEVANT' | 'MISSING_LINK';
//   notes?: string;
//   suggestedMarketId?: string;
// }
```

### 2.2 WebSocket Events

```typescript
// WebSocket channels for real-time updates

// correlation:new - New correlation created
interface CorrelationNewEvent {
  type: 'correlation:new';
  data: {
    correlationId: string;
    articleId: string;
    marketId: string;
    score: number;
    predictedDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    timestamp: string;
  };
}

// correlation:updated - Correlation updated (e.g., verified)
interface CorrelationUpdatedEvent {
  type: 'correlation:updated';
  data: {
    correlationId: string;
    changes: Partial<ArticleMarketCorrelation>;
    timestamp: string;
  };
}

// correlation:high-impact - High-confidence correlation detected
interface CorrelationHighImpactEvent {
  type: 'correlation:high-impact';
  data: {
    correlationId: string;
    article: NewsArticle;
    market: PredictionMarket;
    score: number;
    confidence: number;
    predictedDirection: string;
    predictedImpactScore: number;
    urgency: 'IMMEDIATE' | 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

// correlation:verified - Prediction verified against actual market movement
interface CorrelationVerifiedEvent {
  type: 'correlation:verified';
  data: {
    correlationId: string;
    articleId: string;
    marketId: string;
    predictedDirection: string;
    actualDirection: string;
    predictionAccuracy: number;
    priceChangePercent: number;
  };
}

// correlation:job-progress - Job progress update
interface CorrelationJobProgressEvent {
  type: 'correlation:job-progress';
  data: {
    jobId: string;
    status: string;
    progress: {
      processed: number;
      total: number;
      percentage: number;
    };
    eta?: string;
  };
}

// correlation:market-movement - Significant market movement detected
interface MarketMovementEvent {
  type: 'correlation:market-movement';
  data: {
    marketId: string;
    priceChange: number;
    volumeChange: number;
    timestamp: string;
    relatedArticles: string[]; // Article IDs that may have caused this
  };
}
```

### 2.3 Internal APIs

```typescript
// Internal APIs for correlation engine components

interface CorrelationEngineAPI {
  // Submit article for correlation analysis
  submitArticle(article: NewsArticle): Promise<string>; // Returns jobId
  
  // Submit market update for re-analysis
  submitMarketUpdate(market: PredictionMarket): Promise<string>;
  
  // Get correlations for trading signal generation
  getTradingSignals(
    minConfidence: number,
    timeWindow: number
  ): Promise<CorrelationTradingSignal[]>;
  
  // Record market price impact for verification
  recordPriceImpact(
    articleId: string,
    marketId: string,
    prices: PriceSnapshot
  ): Promise<void>;
  
  // Get embedding for content
  getEmbedding(
    content: string,
    type: 'ARTICLE' | 'MARKET'
  ): Promise<number[]>;
  
  // Find similar articles
  findSimilarArticles(
    articleId: string,
    threshold: number,
    limit: number
  ): Promise<SimilarArticle[]>;
  
  // Find markets related to topic
  findMarketsByTopic(
    topic: string,
    limit: number
  ): Promise<MarketTopicMatch[]>;
}
```

## 3. Integration Points

### 3.1 News Ingestion Pipeline Hook

```typescript
// src/correlation/hooks/news-ingestion-hook.ts

import { messageBus, Channel } from '../shared/message-bus';
import correlationEngine from '../correlation/engine';
import logger from '../shared/logger';

/**
 * Hook into news ingestion pipeline
 * Called after article is stored and categorized
 */
export function initializeNewsIngestionHook(): void {
  // Subscribe to news categorized events
  messageBus.subscribe(Channel.NEWS_CATEGORIZED, async (message) => {
    try {
      const { article } = message.data;
      
      // Only analyze trading-relevant articles
      if (!isTradingRelevant(article)) {
        logger.debug(`[CorrelationHook] Skipping non-trading article: ${article.id}`);
        return;
      }
      
      // Submit for correlation analysis
      const jobId = await correlationEngine.submitArticle(article, {
        priority: getPriority(article.importance),
        methods: ['EMBEDDING', 'KEYWORD', 'LLM'], // Try fast methods first
      });
      
      logger.info(`[CorrelationHook] Submitted article ${article.id} for correlation analysis (job: ${jobId})`);
      
    } catch (error) {
      logger.error('[CorrelationHook] Failed to process news event:', error);
    }
  });
  
  // Subscribe to news clustered events (higher priority stories)
  messageBus.subscribe(Channel.NEWS_CLUSTERED, async (message) => {
    try {
      const { cluster } = message.data;
      
      // High-heat clusters get immediate LLM analysis
      if (cluster.heatScore > 0.7) {
        for (const article of cluster.articles) {
          await correlationEngine.submitArticle(article, {
            priority: 10, // Highest priority
            methods: ['LLM'], // Immediate LLM analysis
            markets: 'ACTIVE_HIGH_VOLUME', // Focus on liquid markets
          });
        }
      }
    } catch (error) {
      logger.error('[CorrelationHook] Failed to process cluster event:', error);
    }
  });
}

function isTradingRelevant(article: NewsArticle): boolean {
  const tradingCategories = ['CRYPTO', 'STOCKS', 'ECONOMICS', 'GEOPOLITICS', 'TECH'];
  return article.categories.some(c => tradingCategories.includes(c));
}

function getPriority(importance: string): number {
  switch (importance) {
    case 'CRITICAL': return 9;
    case 'HIGH': return 7;
    case 'MEDIUM': return 5;
    case 'LOW': return 3;
    default: return 5;
  }
}
```

### 3.2 Polymarket Data Integration

```typescript
// src/correlation/integrations/polymarket-sync.ts

import polymarketClient from '../../prediction-markets/polymarket-client';
import correlationStore from '../store/correlation-store';
import redisCache from '../../shared/redis-cache';
import { messageBus, Channel } from '../../shared/message-bus';
import logger from '../../shared/logger';

const MARKET_CACHE_TTL = 300; // 5 minutes
const SNAPSHOT_INTERVAL_MS = 60000; // 1 minute

/**
 * Polymarket integration for correlation system
 */
export class PolymarketCorrelationSync {
  private snapshotInterval: NodeJS.Timeout | null = null;
  
  /**
   * Start periodic market data sync
   */
  start(): void {
    // Initial fetch
    void this.syncMarkets();
    
    // Periodic snapshots for price impact tracking
    this.snapshotInterval = setInterval(() => {
      void this.takeMarketSnapshots();
    }, SNAPSHOT_INTERVAL_MS);
    
    logger.info('[PolymarketSync] Started market sync');
  }
  
  /**
   * Stop sync
   */
  stop(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
  }
  
  /**
   * Fetch and cache active markets
   */
  async syncMarkets(): Promise<void> {
    try {
      // Check cache first
      const cached = await redisCache.get('markets', 'active');
      if (cached) {
        logger.debug('[PolymarketSync] Using cached markets');
        return;
      }
      
      // Fetch from Polymarket
      const markets = await polymarketClient.fetchMarkets(500);
      
      // Cache for 5 minutes
      await redisCache.set('markets', 'active', markets, MARKET_CACHE_TTL);
      
      // Store in database for persistence
      await correlationStore.upsertMarkets(markets);
      
      // Publish update event
      await messageBus.publish(Channel.MARKET_SNAPSHOT, {
        type: 'MARKET_SYNC',
        count: markets.length,
        timestamp: new Date().toISOString(),
      });
      
      logger.info(`[PolymarketSync] Synced ${markets.length} markets`);
      
    } catch (error) {
      logger.error('[PolymarketSync] Failed to sync markets:', error);
      throw error;
    }
  }
  
  /**
   * Take market snapshots for price impact tracking
   */
  async takeMarketSnapshots(): Promise<void> {
    try {
      const markets = await redisCache.get<any[]>('markets', 'active');
      if (!markets) return;
      
      const timestamp = new Date();
      
      for (const market of markets) {
        await correlationStore.saveMarketSnapshot({
          marketId: market.id,
          timestamp,
          yesPrice: market.yesPrice,
          noPrice: market.noPrice,
          volume: market.volume,
          liquidity: market.liquidity,
        });
      }
      
    } catch (error) {
      logger.error('[PolymarketSync] Failed to take snapshots:', error);
    }
  }
  
  /**
   * Get markets relevant to a topic
   */
  async getRelevantMarkets(topic: string, limit: number = 10): Promise<PredictionMarket[]> {
    // Try cache first
    const cacheKey = `topic:${topic.toLowerCase().replace(/\s+/g, '_')}`;
    const cached = await redisCache.get<PredictionMarket[]>('market_topics', cacheKey);
    if (cached) return cached;
    
    // Query database for markets matching topic
    const markets = await correlationStore.findMarketsByTopic(topic, limit);
    
    // Cache for 10 minutes
    await redisCache.set('market_topics', cacheKey, markets, 600);
    
    return markets;
  }
  
  /**
   * Get market by ID with caching
   */
  async getMarket(marketId: string): Promise<PredictionMarket | null> {
    // Try cache
    const cached = await redisCache.get<PredictionMarket>('market', marketId);
    if (cached) return cached;
    
    // Try database
    const market = await correlationStore.getMarket(marketId);
    if (market) {
      await redisCache.set('market', marketId, market, MARKET_CACHE_TTL);
    }
    
    return market;
  }
}

export default new PolymarketCorrelationSync();
```

### 3.3 Background Job Scheduling

```typescript
// src/correlation/scheduler/correlation-scheduler.ts

import { Queue, Worker, Job } from 'bullmq';
import logger from '../../shared/logger';
import correlationEngine from '../engine/correlation-engine';
import correlationStore from '../store/correlation-store';

// Redis connection for BullMQ
const QUEUE_CONFIG = {
  connection: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number.parseInt(process.env.REDIS_PORT || '6380', 10),
    password: process.env.REDIS_PASSWORD,
    db: 3, // Dedicated DB for correlation jobs
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
};

// Job types
enum CorrelationJobType {
  ANALYZE_ARTICLE = 'analyze:article',
  ANALYZE_MARKET = 'analyze:market',
  BATCH_ANALYZE = 'analyze:batch',
  VERIFY_PREDICTIONS = 'verify:predictions',
  RECALCULATE_SCORES = 'maintenance:recalc',
  CLEANUP_STALE = 'maintenance:cleanup',
}

/**
 * Correlation job scheduler
 */
export class CorrelationScheduler {
  private queue: Queue;
  private workers: Worker[] = [];
  
  constructor() {
    this.queue = new Queue('correlation-analysis', QUEUE_CONFIG);
    this.setupWorkers();
    this.setupScheduledJobs();
  }
  
  /**
   * Setup job workers
   */
  private setupWorkers(): void {
    // Main analysis worker
    const analysisWorker = new Worker(
      'correlation-analysis',
      async (job: Job) => {
        logger.info(`[CorrelationWorker] Processing job ${job.id}: ${job.name}`);
        
        switch (job.name) {
          case CorrelationJobType.ANALYZE_ARTICLE:
            return await correlationEngine.analyzeArticle(job.data);
            
          case CorrelationJobType.ANALYZE_MARKET:
            return await correlationEngine.analyzeMarket(job.data);
            
          case CorrelationJobType.BATCH_ANALYZE:
            return await correlationEngine.batchAnalyze(job.data);
            
          case CorrelationJobType.VERIFY_PREDICTIONS:
            return await correlationEngine.verifyPredictions(job.data);
            
          case CorrelationJobType.CLEANUP_STALE:
            return await correlationStore.cleanupStaleCorrelations(job.data.olderThanDays);
            
          default:
            throw new Error(`Unknown job type: ${job.name}`);
        }
      },
      {
        ...QUEUE_CONFIG,
        concurrency: 3, // Process 3 jobs concurrently
        limiter: {
          max: 10, // Max 10 jobs per
          duration: 1000, // 1 second (rate limit for LLM API)
        },
      }
    );
    
    // Event handlers
    analysisWorker.on('completed', (job) => {
      logger.info(`[CorrelationWorker] Completed job ${job?.id}`);
    });
    
    analysisWorker.on('failed', (job, error) => {
      logger.error(`[CorrelationWorker] Failed job ${job?.id}:`, error);
    });
    
    this.workers.push(analysisWorker);
  }
  
  /**
   * Setup recurring scheduled jobs
   */
  private setupScheduledJobs(): void {
    // Verify predictions every 15 minutes
    this.queue.add(
      CorrelationJobType.VERIFY_PREDICTIONS,
      {},
      { repeat: { every: 15 * 60 * 1000 } }
    );
    
    // Cleanup stale correlations daily
    this.queue.add(
      CorrelationJobType.CLEANUP_STALE,
      { olderThanDays: 7 },
      { repeat: { cron: '0 2 * * *' } } // 2 AM daily
    );
  }
  
  /**
   * Submit article analysis job
   */
  async submitArticleAnalysis(
    articleId: string,
    options: { priority?: number; methods?: string[] } = {}
  ): Promise<Job> {
    return this.queue.add(
      CorrelationJobType.ANALYZE_ARTICLE,
      { articleId, ...options },
      { priority: options.priority || 5 }
    );
  }
  
  /**
   * Submit batch analysis job
   */
  async submitBatchAnalysis(
    articleIds: string[],
    options: { priority?: number } = {}
  ): Promise<Job> {
    return this.queue.add(
      CorrelationJobType.BATCH_ANALYZE,
      { articleIds },
      { priority: options.priority || 3 }
    );
  }
  
  /**
   * Get queue status
   */
  async getStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    return {
      waiting: await this.queue.getWaitingCount(),
      active: await this.queue.getActiveCount(),
      completed: await this.queue.getCompletedCount(),
      failed: await this.queue.getFailedCount(),
    };
  }
  
  /**
   * Pause queue
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    logger.info('[CorrelationScheduler] Queue paused');
  }
  
  /**
   * Resume queue
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    logger.info('[CorrelationScheduler] Queue resumed');
  }
  
  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    await this.queue.close();
    for (const worker of this.workers) {
      await worker.close();
    }
    logger.info('[CorrelationScheduler] Shutdown complete');
  }
}

export const correlationScheduler = new CorrelationScheduler();
```

## 4. Caching Strategy

### 4.1 Cache Layers

```typescript
// src/correlation/cache/correlation-cache.ts

import redisCache from '../../shared/redis-cache';
import { CacheTTL } from '../../shared/redis-cache';

/**
 * Correlation-specific cache namespaces and TTLs
 */
export const CorrelationCacheConfig = {
  // Market data cache (very short TTL - market data changes fast)
  MARKET_DATA: { ttl: 60, namespace: 'corr:market' },
  
  // Market list cache
  ACTIVE_MARKETS: { ttl: 300, namespace: 'corr:markets:active' },
  
  // Correlation results (medium TTL)
  CORRELATION_RESULT: { ttl: 3600, namespace: 'corr:result' },
  
  // Article embeddings (long TTL - embeddings don't change)
  ARTICLE_EMBEDDING: { ttl: 86400 * 7, namespace: 'corr:embed:article' },
  
  // Market embeddings
  MARKET_EMBEDDING: { ttl: 86400 * 7, namespace: 'corr:embed:market' },
  
  // Similarity search results
  SIMILARITY_RESULTS: { ttl: 1800, namespace: 'corr:similar' },
  
  // LLM correlation analysis responses
  LLM_CORRELATION: { ttl: 3600, namespace: 'corr:llm' },
  
  // Topic-to-market mappings
  TOPIC_MARKETS: { ttl: 600, namespace: 'corr:topic' },
  
  // High-impact correlations (for real-time alerts)
  HIGH_IMPACT: { ttl: 300, namespace: 'corr:high_impact' },
};

/**
 * Correlation cache manager
 */
export class CorrelationCache {
  /**
   * Cache correlation result
   */
  async cacheCorrelation(
    articleId: string,
    marketId: string,
    result: CorrelationResult
  ): Promise<void> {
    const key = `${articleId}:${marketId}`;
    await redisCache.set(
      CorrelationCacheConfig.CORRELATION_RESULT.namespace,
      key,
      result,
      CorrelationCacheConfig.CORRELATION_RESULT.ttl
    );
  }
  
  /**
   * Get cached correlation
   */
  async getCorrelation(
    articleId: string,
    marketId: string
  ): Promise<CorrelationResult | null> {
    const key = `${articleId}:${marketId}`;
    return redisCache.get(
      CorrelationCacheConfig.CORRELATION_RESULT.namespace,
      key
    );
  }
  
  /**
   * Cache embedding with content hash for invalidation
   */
  async cacheEmbedding(
    contentType: 'ARTICLE' | 'MARKET',
    contentId: string,
    contentHash: string,
    embedding: number[]
  ): Promise<void> {
    const config = contentType === 'ARTICLE' 
      ? CorrelationCacheConfig.ARTICLE_EMBEDDING 
      : CorrelationCacheConfig.MARKET_EMBEDDING;
    
    // Store with content hash for validation
    await redisCache.set(config.namespace, `${contentId}:${contentHash}`, embedding, config.ttl);
    
    // Also store current hash for quick lookup
    await redisCache.set(config.namespace, `${contentId}:hash`, contentHash, config.ttl);
  }
  
  /**
   * Get cached embedding if content hasn't changed
   */
  async getEmbedding(
    contentType: 'ARTICLE' | 'MARKET',
    contentId: string,
    currentContentHash: string
  ): Promise<number[] | null> {
    const config = contentType === 'ARTICLE' 
      ? CorrelationCacheConfig.ARTICLE_EMBEDDING 
      : CorrelationCacheConfig.MARKET_EMBEDDING;
    
    // Check if hash matches
    const cachedHash = await redisCache.get<string>(config.namespace, `${contentId}:hash`);
    if (cachedHash !== currentContentHash) {
      return null; // Content changed, embedding invalid
    }
    
    return redisCache.get<number[]>(config.namespace, `${contentId}:${currentContentHash}`);
  }
  
  /**
   * Cache high-impact correlation for real-time alerts
   */
  async cacheHighImpact(correlation: HighImpactCorrelation): Promise<void> {
    await redisCache.set(
      CorrelationCacheConfig.HIGH_IMPACT.namespace,
      correlation.correlationId,
      correlation,
      CorrelationCacheConfig.HIGH_IMPACT.ttl
    );
  }
  
  /**
   * Get recent high-impact correlations
   */
  async getRecentHighImpacts(): Promise<HighImpactCorrelation[]> {
    // This would use Redis SCAN or a sorted set in production
    // For now, we'll query the database
    return [];
  }
  
  /**
   * Invalidate correlations for an article
   */
  async invalidateArticleCorrelations(articleId: string): Promise<void> {
    await redisCache.clearNamespace(`${CorrelationCacheConfig.CORRELATION_RESULT.namespace}:${articleId}`);
  }
  
  /**
   * Warm cache with high-probability correlations
   */
  async warmCache(): Promise<void> {
    // Pre-compute correlations for hot articles and active markets
    // This runs on startup to ensure fast initial responses
  }
}

export const correlationCache = new CorrelationCache();
```

### 4.2 Cache Invalidation Strategy

```typescript
// src/correlation/cache/invalidation.ts

/**
 * Cache invalidation rules:
 * 
 * 1. Market data: Invalidate every 60 seconds (background refresh)
 * 2. Correlations: Invalidate when:
 *    - Article content is updated
 *    - Market title/description changes
 *    - New price data significantly changes market context
 * 3. Embeddings: Only invalidate if content hash changes
 * 4. LLM responses: Invalidate based on TTL (1 hour)
 * 
 * Invalidation triggers:
 */

interface InvalidationTrigger {
  event: string;
  action: () => Promise<void>;
}

const invalidationTriggers: InvalidationTrigger[] = [
  {
    event: 'article:updated',
    action: async (articleId: string) => {
      await correlationCache.invalidateArticleCorrelations(articleId);
      await correlationCache.invalidateEmbedding('ARTICLE', articleId);
    },
  },
  {
    event: 'market:updated',
    action: async (marketId: string) => {
      await correlationCache.invalidateMarketCache(marketId);
    },
  },
  {
    event: 'correlation:stale',
    action: async () => {
      // Run cleanup job
      await correlationScheduler.submitCleanupJob();
    },
  },
];
```

## 5. Error Handling

### 5.1 LLM API Failure Handling

```typescript
// src/correlation/errors/llm-error-handler.ts

import circuitBreaker from '../../shared/circuit-breaker-optimized';
import logger from '../../shared/logger';
import { CorrelationMethod } from '../types';

interface LLMErrorContext {
  method: CorrelationMethod;
  articleId: string;
  marketId?: string;
  promptLength: number;
  retryCount: number;
}

/**
 * LLM API error handler with fallback strategies
 */
export class LLMErrorHandler {
  /**
   * Execute LLM correlation with error handling and fallbacks
   */
  async executeWithFallback<T>(
    context: LLMErrorContext,
    primaryOperation: () => Promise<T>,
    fallbackOperations: Array<() => Promise<T>>
  ): Promise<T | null> {
    const { method, articleId, retryCount } = context;
    
    try {
      // Try primary operation with circuit breaker
      return await circuitBreaker.execute(
        'llm-correlation',
        primaryOperation,
        async () => {
          // Fallback if circuit open
          logger.warn(`[LLMErrorHandler] Circuit open for ${method}, trying fallbacks`);
          return this.tryFallbacks(fallbackOperations);
        }
      );
      
    } catch (error) {
      logger.error(`[LLMErrorHandler] Primary failed for ${articleId}:`, error);
      
      // Try fallbacks
      return this.tryFallbacks(fallbackOperations);
    }
  }
  
  /**
   * Try fallback operations in sequence
   */
  private async tryFallbacks<T>(
    fallbacks: Array<() => Promise<T>>
  ): Promise<T | null> {
    for (let i = 0; i < fallbacks.length; i++) {
      try {
        logger.debug(`[LLMErrorHandler] Trying fallback ${i + 1}/${fallbacks.length}`);
        return await fallbacks[i]();
      } catch (error) {
        logger.warn(`[LLMErrorHandler] Fallback ${i + 1} failed:`, error);
      }
    }
    
    logger.error('[LLMErrorHandler] All fallbacks exhausted');
    return null;
  }
  
  /**
   * Get fallback correlation methods
   */
  getFallbackMethods(primaryMethod: CorrelationMethod): CorrelationMethod[] {
    const fallbackChains: Record<CorrelationMethod, CorrelationMethod[]> = {
      'LLM': ['EMBEDDING', 'KEYWORD', 'RULE_BASED'],
      'EMBEDDING': ['KEYWORD', 'RULE_BASED'],
      'KEYWORD': ['RULE_BASED'],
      'RULE_BASED': [],
    };
    
    return fallbackChains[primaryMethod] || [];
  }
}

/**
 * Retry configuration for LLM operations
 */
export const LLMRetryConfig = {
  maxRetries: 3,
  backoffMultiplier: 2,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  
  // Retryable error patterns
  retryableErrors: [
    'rate limit',
    'timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    '503',
    '429',
    'temporary',
  ],
  
  shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;
    
    const errorMessage = error.message.toLowerCase();
    return this.retryableErrors.some(pattern => 
      errorMessage.includes(pattern.toLowerCase())
    );
  },
  
  calculateDelay(attempt: number): number {
    const delay = this.initialDelayMs * Math.pow(this.backoffMultiplier, attempt);
    return Math.min(delay, this.maxDelayMs);
  },
};
```

### 5.2 Polymarket API Failure Handling

```typescript
// src/correlation/errors/polymarket-error-handler.ts

import logger from '../../shared/logger';
import redisCache from '../../shared/redis-cache';

interface PolymarketErrorContext {
  operation: 'FETCH_MARKETS' | 'FETCH_CANDLES' | 'FETCH_SNAPSHOT';
  marketId?: string;
  timestamp: Date;
}

/**
 * Polymarket API error handler
 */
export class PolymarketErrorHandler {
  private static readonly STALE_DATA_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  
  /**
   * Handle Polymarket API error with stale cache fallback
   */
  async handleWithStaleFallback<T>(
    context: PolymarketErrorContext,
    operation: () => Promise<T>,
    cacheKey: { namespace: string; key: string }
  ): Promise<T | null> {
    try {
      // Try fresh fetch
      return await operation();
      
    } catch (error) {
      logger.error(`[PolymarketErrorHandler] ${context.operation} failed:`, error);
      
      // Try to return stale cached data
      const stale = await redisCache.get<T>(cacheKey.namespace, cacheKey.key);
      
      if (stale) {
        logger.warn(`[PolymarketErrorHandler] Returning stale data for ${cacheKey.key}`);
        
        // Record that we're using stale data
        await this.recordStaleDataUsage(context);
        
        return stale;
      }
      
      throw error; // No cache available, propagate error
    }
  }
  
  /**
   * Record usage of stale data for monitoring
   */
  private async recordStaleDataUsage(context: PolymarketErrorContext): Promise<void> {
    // Publish alert to message bus
    await messageBus.publish(Channel.SYSTEM_ERROR, {
      type: 'STALE_MARKET_DATA',
      severity: 'WARNING',
      context,
      timestamp: new Date().toISOString(),
    });
  }
  
  /**
   * Check if cached data is acceptable as fallback
   */
  isCacheAcceptable(cachedAt: Date): boolean {
    const age = Date.now() - cachedAt.getTime();
    return age < PolymarketErrorHandler.STALE_DATA_THRESHOLD_MS;
  }
}

/**
 * Polymarket circuit breaker configuration
 */
export const PolymarketCircuitBreakerConfig = {
  name: 'polymarket-api',
  threshold: 5, // Open after 5 failures
  timeout: 60000, // Stay open for 1 minute
  
  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const markets = await polymarketClient.fetchMarkets(1);
      return markets.length > 0;
    } catch {
      return false;
    }
  },
};
```

### 5.3 Circuit Breaker Configuration

```typescript
// src/correlation/circuit-breakers.ts

import optimizedCircuitBreaker from '../shared/circuit-breaker-optimized';

/**
 * Register correlation-specific circuit breakers
 */
export function registerCorrelationCircuitBreakers(): void {
  // LLM correlation circuit breaker
  optimizedCircuitBreaker.registerBreaker('llm-correlation', {
    threshold: 5,
    timeout: 120000, // 2 minutes
  });
  
  // Embedding service circuit breaker
  optimizedCircuitBreaker.registerBreaker('embedding-service', {
    threshold: 3,
    timeout: 60000,
  });
  
  // Polymarket data fetcher
  optimizedCircuitBreaker.registerBreaker('polymarket-fetch', {
    threshold: 5,
    timeout: 60000,
  });
  
  // Database operations
  optimizedCircuitBreaker.registerBreaker('correlation-db', {
    threshold: 10,
    timeout: 30000,
  });
  
  // External API (OpenRouter)
  optimizedCircuitBreaker.registerBreaker('openrouter-api', {
    threshold: 5,
    timeout: 120000,
  });
}

/**
 * Get correlation circuit breaker health
 */
export async function getCorrelationCircuitHealth(): Promise<{
  component: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  isOpen: boolean;
}[]> {
  const breakers = [
    'llm-correlation',
    'embedding-service',
    'polymarket-fetch',
    'correlation-db',
    'openrouter-api',
  ];
  
  return breakers.map(name => {
    const status = optimizedCircuitBreaker.getBreakerStatus(name);
    return {
      component: name,
      status: status?.isOpen ? 'UNHEALTHY' : 'HEALTHY',
      isOpen: status?.isOpen || false,
    };
  });
}
```

### 5.4 Retry Logic

```typescript
// src/correlation/retry/correlation-retry.ts

import logger from '../../shared/logger';

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'rate limit',
    'timeout',
    '429',
    '503',
    'temporary',
  ],
};

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if we should retry
      if (attempt >= opts.maxRetries || !shouldRetry(error as Error, opts)) {
        throw error;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = calculateDelay(attempt, opts);
      
      logger.warn(
        `[Retry] Attempt ${attempt + 1}/${opts.maxRetries + 1} failed, ` +
        `retrying in ${delay}ms: ${(error as Error).message}`
      );
      
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, error as Error, delay);
      }
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

function shouldRetry(error: Error, options: RetryOptions): boolean {
  const errorMessage = error.message.toLowerCase();
  return options.retryableErrors.some(pattern =>
    errorMessage.includes(pattern.toLowerCase())
  );
}

function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.baseDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  
  // Add jitter (±20%) to prevent thundering herd
  const jitter = cappedDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.floor(cappedDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## 6. System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORRELATION SYSTEM ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   News Agent    │    │  Polymarket     │    │   Dashboard     │          │
│  │   (Existing)    │    │   Client        │    │   (Existing)    │          │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘          │
│           │                      │                      │                    │
│           │ publish              │ fetch                │ subscribe          │
│           ▼                      ▼                      ▼                    │
│  ┌─────────────────────────────────────────────────────────────┐             │
│  │                    Message Bus (Redis)                       │             │
│  │  Channels: NEWS_CATEGORIZED, MARKET_SNAPSHOT,                │             │
│  │            CORRELATION_HIGH_IMPACT, etc.                     │             │
│  └─────────────────────────────────────────────────────────────┘             │
│           │                      │                      │                    │
│           ▼                      ▼                      ▼                    │
│  ┌─────────────────────────────────────────────────────────────┐             │
│  │              Correlation Ingestion Hooks                     │             │
│  │         ┌───────────────────────────────────┐                │             │
│  │         │  News Ingestion Hook              │                │             │
│  │         │  - Filter trading-relevant        │                │             │
│  │         │  - Priority queue by importance   │                │             │
│  │         └───────────────────────────────────┘                │             │
│  │         ┌───────────────────────────────────┐                │             │
│  │         │  Market Update Hook               │                │             │
│  │         │  - Cache invalidation             │                │             │
│  │         │  - Price impact tracking          │                │             │
│  │         └───────────────────────────────────┘                │             │
│  └────────────────────────┬────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────┐             │
│  │              Correlation Job Queue (BullMQ)                  │             │
│  │  Jobs: ANALYZE_ARTICLE, BATCH_ANALYZE, VERIFY_PREDICTIONS   │             │
│  └────────────────────────┬────────────────────────────────────┘             │
│                           │                                                  │
│                           ▼                                                  │
│  ┌─────────────────────────────────────────────────────────────┐             │
│  │              Correlation Analysis Engine                     │             │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │             │
│  │  │   Method    │  │   Method    │  │   Method    │          │             │
│  │  │  EMBEDDING  │  │   KEYWORD   │  │     LLM     │          │             │
│  │  │  (Fast)     │  │   (Fast)    │  │  (Thorough) │          │             │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │             │
│  │         │                │                │                  │             │
│  │         └────────────────┴────────────────┘                  │             │
│  │                          │                                   │             │
│  │                    ┌─────┴─────┐                             │             │
│  │                    │  Ensemble │                             │             │
│  │                    │  Scoring  │                             │             │
│  │                    └─────┬─────┘                             │             │
│  │                          │                                   │             │
│  │         ┌────────────────┼────────────────┐                  │             │
│  │         ▼                ▼                ▼                  │             │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │             │
│  │  │   Store     │  │   Cache     │  │   Alert     │          │             │
│  │  │   Result    │  │   Result    │  │   if High   │          │             │
│  │  │             │  │             │  │   Impact    │          │             │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │             │
│  └────────────────────────┬────────────────────────────────────┘             │
│                           │                                                  │
│           ┌───────────────┼───────────────┐                                  │
│           ▼               ▼               ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐             │
│  │                     Data Layer                              │             │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │             │
│  │  │   SQLite    │  │    Redis    │  │   Vector    │          │             │
│  │  │  (Primary)  │  │   (Cache)   │  │   (Search)  │          │             │
│  │  │             │  │             │  │             │          │             │
│  │  │ article_    │  │  corr:      │  │  article_   │          │             │
│  │  │ market_     │  │  result:    │  │  embeddings │          │             │
│  │  │ correlations│  │  embed:     │  │             │          │             │
│  │  │             │  │  market:    │  │             │          │             │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │             │
│  └─────────────────────────────────────────────────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 7. File Structure

```
src/correlation/
├── api/
│   ├── rest-routes.ts          # Express routes for REST API
│   ├── websocket-handlers.ts   # WebSocket event handlers
│   └── middleware/
│       ├── auth.ts
│       ├── rate-limit.ts
│       └── validation.ts
├── cache/
│   ├── correlation-cache.ts    # Cache manager
│   └── invalidation.ts         # Cache invalidation rules
├── engine/
│   ├── correlation-engine.ts   # Main analysis engine
│   ├── methods/
│   │   ├── embedding-method.ts # Semantic similarity
│   │   ├── keyword-method.ts   # Keyword matching
│   │   ├── llm-method.ts       # LLM-based analysis
│   │   └── rule-based-method.ts # Rule-based matching
│   └── ensemble.ts             # Ensemble scoring
├── errors/
│   ├── llm-error-handler.ts
│   ├── polymarket-error-handler.ts
│   └── retry/
│       └── correlation-retry.ts
├── hooks/
│   └── news-ingestion-hook.ts
├── integrations/
│   └── polymarket-sync.ts
├── migrations/
│   └── 001_initial_schema.ts
├── retry/
│   └── correlation-retry.ts
├── scheduler/
│   └── correlation-scheduler.ts
├── store/
│   └── correlation-store.ts    # Database operations
├── types/
│   └── index.ts                # TypeScript types
├── cache.ts                    # Cache configuration
├── circuit-breakers.ts         # Circuit breaker setup
└── index.ts                    # Main export
```

## 8. Environment Variables

```bash
# Correlation System Configuration
CORRELATION_ENABLED=true
CORRELATION_MIN_SCORE_THRESHOLD=0.6
CORRELATION_HIGH_IMPACT_THRESHOLD=0.85

# Job Queue
CORRELATION_QUEUE_DB=3
CORRELATION_WORKER_CONCURRENCY=3
CORRELATION_RATE_LIMIT_MAX=10
CORRELATION_RATE_LIMIT_DURATION=1000

# Cache Configuration
CORRELATION_CACHE_TTL=3600
CORRELATION_EMBEDDING_CACHE_TTL=604800
CORRELATION_MARKET_CACHE_TTL=300

# Analysis Methods (comma-separated priority order)
CORRELATION_METHODS=EMBEDDING,KEYWORD,LLM

# LLM Configuration for Correlations
CORRELATION_LLM_MODEL=google/gemini-flash-1.5
CORRELATION_LLM_TIMEOUT=30000
CORRELATION_LLM_MAX_TOKENS=1000

# Circuit Breaker
CORRELATION_CIRCUIT_THRESHOLD=5
CORRELATION_CIRCUIT_TIMEOUT=120000

# Verification Schedule
CORRELATION_VERIFY_INTERVAL_MS=900000  # 15 minutes
CORRELATION_CLEANUP_CRON=0 2 * * *      # Daily at 2 AM
```

## 9. Performance Considerations

### 9.1 Query Optimization

- Use partial indexes for high-confidence correlations (`score > 0.7`)
- Partition `market_price_impacts` by time for efficient cleanup
- Use covering indexes for common query patterns
- Implement cursor-based pagination for large result sets

### 9.2 Scaling Considerations

- Worker concurrency can be increased based on LLM API rate limits
- Embedding computation can be batched (up to 100 at a time)
- Cache warming on startup reduces cold start latency
- Read replicas for SQLite can be considered if read load becomes high

### 9.3 Monitoring Metrics

```typescript
interface CorrelationMetrics {
  // Throughput
  correlationsPerMinute: number;
  articlesAnalyzedPerMinute: number;
  
  // Quality
  averageCorrelationScore: number;
  predictionAccuracy: number;
  verifiedCorrelationsRatio: number;
  
  // Performance
  averageAnalysisTimeMs: number;
  cacheHitRate: number;
  queueDepth: number;
  
  // Reliability
  llmApiSuccessRate: number;
  circuitBreakerOpenCount: number;
  retryCount: number;
}
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-02-03 | Backend Engineer | Initial design document |
