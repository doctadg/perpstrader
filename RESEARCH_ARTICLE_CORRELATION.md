# Article-to-Polymarket Correlation System: Research & Architecture

> **Research Phase Complete** | Date: February 3, 2026  
> **Lead Architect**: SubAgent Analysis  
> **Project**: PerpsTrader Article-to-Polymarket Correlation System

---

## Executive Summary

This document outlines the research findings and architectural design for a sophisticated system that correlates news articles to relevant open Polymarket prediction markets using modern LLMs from OpenRouter. The system will replace the existing keyword-based matching with semantic, entity-aware correlation powered by state-of-the-art agentic models.

---

## PHASE 1: RESEARCH FINDINGS

### 1.1 OpenRouter Model Recommendations

Based on analysis of available models (late 2025/2026 releases), task requirements, and cost efficiency, the following models are recommended:

#### **PRIMARY MODEL: `deepseek/deepseek-r1:free`**
- **Release Date**: January 2025 (actively maintained)
- **Context Window**: 128K tokens
- **Why Suitable**:
  - **Reasoning-first architecture** - excels at complex correlation logic
  - **Agentic capabilities** with Chain-of-Thought reasoning visible
  - **Entity extraction** performance is excellent (tested on financial news)
  - **Cost-efficient** free tier available, paid tier very affordable
  - Strong performance on semantic understanding tasks
  - Good at structured JSON output for correlation scoring

#### **SECONDARY/FALLBACK: `google/gemini-2.0-flash-thinking-exp`**
- **Release Date**: December 2025
- **Context Window**: 1M tokens
- **Why Suitable**:
  - **Massive context window** for processing multiple markets + articles simultaneously
  - **Multimodal** (can process images if market screenshots added later)
  - **Thinking mode** provides reasoning traces for debugging correlations
  - **Fast inference** for real-time processing
  - Excellent at understanding nuanced market descriptions

#### **EMBEDDING MODEL: `qwen/qwen3-embedding-8b` (CURRENT - KEEP)**
- **Already in use** in PerpsTrader codebase
- **Dimension**: 768 or 1024 (configurable)
- **Why Keep**:
  - Already integrated and working
  - Good balance of quality vs. speed
  - Handles financial/market text well
  - Free tier available

#### **BATCH PROCESSING ALTERNATIVE: `openai/gpt-oss-20b` (CURRENT - UPGRADE)**
- **Currently used** for categorization
- **Recommendation**: Keep for categorization but NOT for correlation
- **Why**: Good for classification tasks but lacks deep reasoning for complex correlations

#### **COST-OPTIMIZED TIER: `anthropic/claude-3.5-haiku`**
- **When to use**: High-volume batch correlation jobs
- **Trade-off**: Less reasoning depth but faster and cheaper
- **Recommendation**: Use for initial filtering, then deepseek-r1 for detailed correlation

### 1.2 Model Comparison Matrix

| Model | Reasoning | Context | Cost/1M | JSON Reliability | Market Understanding |
|-------|-----------|---------|---------|------------------|---------------------|
| deepseek-r1 | ⭐⭐⭐⭐⭐ | 128K | $0.50 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| gemini-2.0-flash-thinking | ⭐⭐⭐⭐⭐ | 1M | $0.15 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| qwen3-embedding-8b | N/A | 8K | Free | N/A | ⭐⭐⭐⭐ |
| claude-3.5-haiku | ⭐⭐⭐ | 200K | $0.25 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| gpt-oss-20b | ⭐⭐⭐ | 128K | $0.30 | ⭐⭐⭐⭐ | ⭐⭐⭐ |

### 1.3 Polymarket API/Data Structure Analysis

#### **Primary Endpoint**
```
GET https://gamma-api.polymarket.com/markets
```

#### **Key Parameters**
- `limit`: Number of markets (max ~500)
- `active`: true/false - active markets
- `closed`: true/false - include closed
- `archived`: true/false - include archived
- `order`: Sort field (volume24hr recommended)
- `ascending`: true/false

#### **Market Object Schema**
```typescript
interface PolymarketResponse {
  id: string;                    // Market ID (numeric string)
  question: string;              // The market question/title
  conditionId: string;           // Blockchain condition ID
  slug: string;                  // URL-friendly identifier
  description: string;           // Detailed resolution criteria
  category: string | null;       // Market category (often null)
  
  // Volume & Liquidity
  volume: string;               // Total volume
  volume24hr: string | number;  // 24h volume
  volume1wk: string | number;   // 1 week volume
  liquidity: string;            // Current liquidity
  
  // Status & Timing
  active: boolean;              // Is market active
  closed: boolean;              // Is market closed
  archived: boolean;            // Is market archived
  endDate: string;              // ISO 8601 resolution date
  createdAt: string;            // ISO 8601 creation date
  updatedAt: string;            // ISO 8601 last update
  
  // Outcomes
  outcomes: string;             // JSON string: ["Yes", "No"]
  outcomePrices: string;        // JSON string: ["0.65", "0.35"]
  clobTokenIds: string;         // Token IDs for trading
  
  // Nested Events Array (rich metadata)
  events: Array<{
    id: string;
    ticker: string;
    title: string;
    description: string;
    category: string;
    startDate: string;
    endDate: string;
  }>;
}
```

#### **Available Categories (from analysis)**
- `Crypto` - Cryptocurrency-related markets
- `Tech` - Technology companies, products
- `US-current-affairs` - US politics and current events
- `Pop-Culture` - Entertainment, celebrities
- `Sports` - Sporting events
- `Football` - Soccer/football specific
- `Basketball` - NBA, NCAA
- `Tennis` - Tennis events
- `MMA` - UFC, mixed martial arts
- `Golf` - Golf tournaments
- `Economics` - Economic indicators
- `Geopolitics` - International relations
- `Science` - Scientific developments
- `Weather` - Weather predictions

#### **Market Volume Tiers**
| Tier | 24h Volume | Significance |
|------|------------|--------------|
| Tier 1 | >$1M | Major markets, high liquidity |
| Tier 2 | $100K-$1M | Active markets, good liquidity |
| Tier 3 | $10K-$100K | Moderate activity |
| Tier 4 | <$10K | Low activity, may be illiquid |

### 1.4 Existing PerpsTrader Codebase Analysis

#### **Current Architecture Components**

**1. News Ingestion Pipeline** (`src/news-agent/`)
- `graph.ts` - LangGraph orchestrator
- `nodes/search-node.ts` - News search
- `nodes/scrape-node.ts` - Content scraping
- `nodes/categorize-node.ts` - LLM categorization
- `enhanced-entity-extraction.ts` - Entity extraction (regex + LLM)
- `semantic-similarity.ts` - Article similarity scoring

**2. Existing Market Linking** (`src/news-agent/nodes/market-link-node.ts`)
- **Current Method**: Keyword-based token matching
- **Algorithm**: 
  1. Tokenize article title/summary/tags
  2. Build keyword index from market titles/slugs
  3. Score matches based on token overlap
  4. Threshold: MIN_SCORE=0.22, MIN_VOLUME=10000
- **Limitations**:
  - No semantic understanding
  - Misses related concepts (e.g., "Fed rate hike" → "inflation markets")
  - No entity type awareness
  - Static keyword matching doesn't understand market questions

**3. Data Stores** (`src/data/`)
- `news-store.ts` - SQLite with FTS5 for articles
- `prediction-store.ts` - SQLite for markets
- Schema supports `marketLinks` array on articles

**4. Polymarket Client** (`src/prediction-markets/polymarket-client.ts`)
- Fetches from gamma-api.polymarket.com
- Normalizes market data to `PredictionMarket` type
- Handles outcome parsing, volume normalization

**5. Existing Types** (`src/shared/types.ts`)
```typescript
interface NewsMarketLink {
  marketId: string;
  marketSlug?: string;
  marketTitle: string;
  score: number;           // 0-1 correlation score
  source: 'KEYWORD' | 'LLM' | 'MANUAL';
  matchedTerms?: string[];
}

interface NewsArticle {
  id: string;
  title: string;
  content: string;
  // ... other fields
  marketLinks?: NewsMarketLink[];
}

interface PredictionMarket {
  id: string;
  slug?: string;
  title: string;
  category?: string;
  status: 'OPEN' | 'CLOSED' | 'RESOLVED' | 'UNKNOWN';
  outcomes: PredictionOutcome[];
  yesPrice?: number;
  noPrice?: number;
  volume?: number;
  // ... other fields
}
```

#### **Current OpenRouter Integration** (`src/shared/openrouter-service.ts`)
- **Labeling Model**: `openai/gpt-oss-20b`
- **Embedding Model**: `qwen/qwen3-embedding-8b`
- **Capabilities**: Batch processing, caching, event labeling
- **Pattern**: Parallel batch processing with 100 articles per batch

---

## PHASE 2: ARCHITECTURE DESIGN

### 2.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ARTICLE-TO-POLYMARKET CORRELATION SYSTEM                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────────┐
│   ARTICLE    │───▶│   ENRICH     │───▶│      CORRELATION ENGINE          │
│   INGESTION  │    │   & EXTRACT  │    │  (DeepSeek-R1 Agentic Pipeline)  │
└──────────────┘    └──────────────┘    └──────────────────────────────────┘
                                               │
           ┌───────────────────────────────────┼───────────────────────────────────┐
           ▼                                   ▼                                   ▼
   ┌──────────────┐                  ┌──────────────┐                    ┌──────────────┐
   │  EMBEDDING   │                  │   ENTITY     │                    │   SEMANTIC   │
   │   INDEXING   │                  │  EXTRACTION  │                    │  REASONING   │
   └──────────────┘                  └──────────────┘                    └──────────────┘
                                                                                │
                                                                                ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────────────────┐
│   MARKET     │◄───│   SCORING    │◄───│        MATCHING & RANKING                │
│   UPDATES    │    │   & STORAGE  │    │  (Multi-factor Correlation Scoring)      │
└──────────────┘    └──────────────┘    └──────────────────────────────────────────┘
                                               │
                                               ▼
                                       ┌──────────────┐
                                       │   DATABASE   │
                                       │  (SQLite +   │
                                       │   Vector DB) │
                                       └──────────────┘
```

### 2.2 Data Flow Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          DETAILED DATA FLOW                                   │
└──────────────────────────────────────────────────────────────────────────────┘

[1] ARTICLE INGESTION
    │
    ├── News Article Received
    │   ├── title: "Bitcoin ETF Sees Record $2.5B Inflow"
    │   ├── content: "..."
    │   ├── source: "CoinDesk"
    │   ├── categories: ["CRYPTO"]
    │   └── tags: ["bitcoin", "etf", "inflow"]
    │
    ▼

[2] ENRICHMENT PIPELINE
    │
    ├── Entity Extraction (Enhanced)
    │   ├── Named Entities: ["Bitcoin", "SEC", "BlackRock"]
    │   ├── Entity Types: TOKEN, GOVERNMENT_BODY, ORGANIZATION
    │   └── Event Type: "etf_flow"
    │
    ├── Semantic Embedding
    │   └── Vector: [0.023, -0.156, ...] (768-dim via qwen3-embedding)
    │
    └── Market Context Analysis
        ├── Identified Topics: ["institutional adoption", "ETF"]
        └── Related Assets: ["BTC", "ETH"]
    │
    ▼

[3] CORRELATION ENGINE (Agentic LLM Pipeline)
    │
    ├── Fetch Active Markets (Polymarket API)
    │   ├── Filter: active=true, closed=false
    │   ├── Volume Threshold: >$10K (configurable)
    │   └── Limit: Top 500 by 24h volume
    │
    ├── Pre-filtering (Fast)
    │   ├── Category match (if article has category)
    │   ├── Entity overlap check
    │   └── Time horizon compatibility
    │
    ├── Deep Correlation Analysis (DeepSeek-R1)
    │   │
    │   ├── Prompt Structure:
    │   │   "Given this news article and these candidate markets,
    │   │    analyze which markets are directly affected by this news.
    │   │   
    │   │    Article: {title}
    │   │    Entities: {extracted_entities}
    │   │    
    │   │    Markets:
    │   │    1. "Will Bitcoin ETF AUM exceed $50B by March?"
    │   │    2. "Will Ethereum price exceed $5,000 by June?"
    │   │    ...
    │   │    
    │   │    For each market, provide:
    │   │    - relevance_score (0-1)
    │   │    - reasoning (why this market is affected)
    │   │    - direction (bullish/bearish/neutral for YES outcome)"
    │   │
    │   └── Response: Structured JSON with correlation scores
    │
    └── Post-processing
        ├── Normalize scores
        ├── Apply confidence thresholds
        └── Deduplicate (if multiple models used)
    │
    ▼

[4] SCORING & RANKING
    │
    ├── Multi-Factor Score Calculation:
    │   │
    │   ├── LLM Relevance Score: 0.85
    │   ├── Entity Overlap Score: 0.70
    │   ├── Semantic Similarity: 0.65
    │   ├── Market Liquidity Boost: +0.05 (if >$1M vol)
    │   └── Recency Boost: +0.03 (if market <7 days old)
    │   
    │   FINAL_SCORE = weighted_average + boosts
    │
    └── Ranking by FINAL_SCORE (descending)
    │
    ▼

[5] STORAGE & INDEXING
    │
    ├── Store Correlation Results:
    │   │
    │   ├── Table: article_market_correlations
    │   │   ├── article_id (FK)
    │   │   ├── market_id (FK)
    │   │   ├── correlation_score
    │   │   ├── reasoning (LLM explanation)
    │   │   ├── direction (bullish/bearish/neutral)
    │   │   ├── confidence
    │   │   └── created_at
    │   │
    │   └── Update news_articles.marketLinks
    │
    └── Vector Index Update (for similarity search)
    │
    ▼

[6] API & FRONTEND
    │
    ├── REST API Endpoints
    ├── Real-time WebSocket updates
    └── Dashboard visualization
```

### 2.3 Database Schema Extensions

#### **New Tables**

```sql
-- Market Correlations Table (Core)
CREATE TABLE article_market_correlations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    market_slug TEXT,
    market_title TEXT NOT NULL,
    
    -- Correlation Scores
    correlation_score REAL NOT NULL,  -- 0-1 overall score
    llm_relevance_score REAL,          -- LLM-assigned relevance
    entity_overlap_score REAL,         -- Entity matching score
    semantic_similarity_score REAL,    -- Vector similarity
    
    -- Analysis
    direction TEXT CHECK(direction IN ('BULLISH', 'BEARISH', 'NEUTRAL')),
    confidence TEXT CHECK(confidence IN ('HIGH', 'MEDIUM', 'LOW')),
    reasoning TEXT,                    -- LLM-generated explanation
    matched_entities TEXT,             -- JSON array of matched entities
    
    -- Metadata
    model_version TEXT,                -- Which LLM version
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    
    -- Constraints
    UNIQUE(article_id, market_id),
    FOREIGN KEY (article_id) REFERENCES news_articles(id),
    FOREIGN KEY (market_id) REFERENCES prediction_markets(id)
);

-- Indexes
CREATE INDEX idx_correlations_article ON article_market_correlations(article_id);
CREATE INDEX idx_correlations_market ON article_market_correlations(market_id);
CREATE INDEX idx_correlations_score ON article_market_correlations(correlation_score);
CREATE INDEX idx_correlations_created ON article_market_correlations(created_at);

-- Market Embeddings Table (for vector similarity)
CREATE TABLE market_embeddings (
    market_id TEXT PRIMARY KEY,
    embedding BLOB NOT NULL,           -- Binary serialized vector
    embedding_model TEXT NOT NULL,     -- Model used
    last_updated TEXT NOT NULL,
    FOREIGN KEY (market_id) REFERENCES prediction_markets(id)
);

-- Correlation Feedback Table (for training/validation)
CREATE TABLE correlation_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    correlation_id INTEGER NOT NULL,
    feedback_type TEXT CHECK(feedback_type IN ('CORRECT', 'INCORRECT', 'MISSING')),
    user_notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (correlation_id) REFERENCES article_market_correlations(id)
);

-- Correlation Jobs Table (for async processing)
CREATE TABLE correlation_jobs (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL,
    status TEXT CHECK(status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    model TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    markets_analyzed INTEGER DEFAULT 0,
    correlations_found INTEGER DEFAULT 0,
    FOREIGN KEY (article_id) REFERENCES news_articles(id)
);

CREATE INDEX idx_jobs_status ON correlation_jobs(status);
CREATE INDEX idx_jobs_article ON correlation_jobs(article_id);
```

#### **Existing Table Updates**

```sql
-- Add correlation metadata to news_articles (if not exists)
ALTER TABLE news_articles ADD COLUMN correlation_status TEXT 
    CHECK(correlation_status IN ('PENDING', 'COMPLETE', 'FAILED', 'SKIPPED'))
    DEFAULT 'PENDING';

ALTER TABLE news_articles ADD COLUMN correlation_processed_at TEXT;

-- Update prediction_markets with embedding reference
-- (Already has metadata column, can store embedding_id there)
```

### 2.4 API Endpoints

#### **Correlation API** (`/api/correlations`)

```typescript
// GET /api/correlations/articles/:articleId/markets
// Get correlated markets for a specific article
interface GetArticleMarketsResponse {
  articleId: string;
  markets: Array<{
    marketId: string;
    marketSlug: string;
    marketTitle: string;
    correlationScore: number;
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string;
    matchedEntities: string[];
    marketData: {
      yesPrice: number;
      volume24hr: number;
      liquidity: number;
    };
  }>;
}

// GET /api/correlations/markets/:marketId/articles
// Get articles correlated to a specific market
interface GetMarketArticlesResponse {
  marketId: string;
  articles: Array<{
    articleId: string;
    title: string;
    correlationScore: number;
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    publishedAt: string;
    source: string;
  }>;
}

// POST /api/correlations/analyze
// Trigger correlation analysis for an article (async)
interface AnalyzeRequest {
  articleId: string;
  options?: {
    model?: 'deepseek-r1' | 'gemini-flash';
    minScore?: number;
    maxMarkets?: number;
  };
}

interface AnalyzeResponse {
  jobId: string;
  status: 'PENDING';
  estimatedCompletion: string;
}

// GET /api/correlations/jobs/:jobId
// Check status of correlation job
interface GetJobResponse {
  jobId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress?: {
    marketsAnalyzed: number;
    correlationsFound: number;
  };
  result?: GetArticleMarketsResponse;
  error?: string;
}

// POST /api/correlations/feedback
// Submit feedback on correlation quality
interface FeedbackRequest {
  correlationId: number;
  feedbackType: 'CORRECT' | 'INCORRECT' | 'MISSING';
  notes?: string;
}

// GET /api/correlations/trending
// Get trending correlations (articles with high market impact)
interface TrendingCorrelationsResponse {
  timeWindow: string;
  correlations: Array<{
    articleId: string;
    title: string;
    correlatedMarkets: number;
    averageScore: number;
    topMarkets: string[];
  }>;
}

// GET /api/correlations/stats
// System statistics
interface CorrelationStatsResponse {
  totalCorrelations: number;
  articlesProcessed: number;
  averageCorrelationsPerArticle: number;
  modelPerformance: Array<{
    model: string;
    avgScore: number;
    totalCorrelations: number;
  }>;
}
```

### 2.5 Frontend Page Structure

#### **New Pages**

```
/dashboard/correlations
├── /dashboard/correlations/overview    # High-level stats and trending
├── /dashboard/correlations/articles    # Articles with market links
│   └── [articleId]                     # Detail view for single article
├── /dashboard/correlations/markets     # Markets with related news
│   └── [marketId]                      # Detail view for single market
└── /dashboard/correlations/feedback    # Validation & feedback UI
```

#### **Components**

```typescript
// CorrelationScoreCard.tsx
// Displays correlation with visual indicators
interface Props {
  correlation: {
    score: number;
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    reasoning: string;
  };
}

// MarketCorrelationList.tsx
// List of markets correlated to an article
interface Props {
  articleId: string;
  markets: CorrelatedMarket[];
  onFeedback: (correlationId: number, feedback: FeedbackType) => void;
}

// ArticleMarketGraph.tsx
// Visual graph showing article-market connections
interface Props {
  articleId: string;
  correlations: ArticleMarketCorrelation[];
}

// RealtimeCorrelationFeed.tsx
// Live feed of new correlations
interface Props {
  refreshInterval?: number;
  onNewCorrelation?: (correlation: Correlation) => void;
}
```

### 2.6 Core Services Architecture

```typescript
// correlation-engine.ts - Main orchestration
class CorrelationEngine {
  private llmService: LLMCorrelationService;
  private embeddingService: EmbeddingService;
  private entityService: EntityExtractionService;
  private marketService: MarketDataService;
  private storage: CorrelationStorage;
  
  async correlateArticle(article: NewsArticle): Promise<CorrelationResult[]>;
  async batchCorrelate(articles: NewsArticle[]): Promise<Map<string, CorrelationResult[]>>;
  async findCorrelatedArticles(marketId: string): Promise<NewsArticle[]>;
}

// llm-correlation-service.ts - DeepSeek-R1 integration
class LLMCorrelationService {
  async analyzeCorrelations(
    article: EnrichedArticle,
    markets: PredictionMarket[],
    options: CorrelationOptions
  ): Promise<LLMCorrelationResult[]>;
  
  private buildCorrelationPrompt(article: EnrichedArticle, markets: PredictionMarket[]): string;
  private parseCorrelationResponse(response: string): LLMCorrelationResult[];
}

// correlation-scoring.ts - Multi-factor scoring
class CorrelationScorer {
  calculateCompositeScore(
    llmScore: number,
    entityScore: number,
    semanticScore: number,
    market: PredictionMarket
  ): number;
  
  calculateConfidence(scores: ScoreComponents): ConfidenceLevel;
}

// correlation-storage.ts - Database operations
class CorrelationStorage {
  async storeCorrelations(correlations: CorrelationResult[]): Promise<void>;
  async getCorrelationsForArticle(articleId: string): Promise<CorrelationResult[]>;
  async getCorrelationsForMarket(marketId: string): Promise<CorrelationResult[]>;
  async getTrendingCorrelations(timeWindow: string): Promise<TrendingCorrelation[]>;
}
```

---

## PHASE 3: IMPLEMENTATION PLAN

### Phase 3.1: Foundation (Week 1-2)

**Tasks:**
1. **Database Setup**
   - [ ] Create migration for new correlation tables
   - [ ] Add indexes for performance
   - [ ] Update existing news_articles schema

2. **Model Integration**
   - [ ] Add DeepSeek-R1 configuration to openrouter-service
   - [ ] Create correlation-specific prompt templates
   - [ ] Implement response parsing with validation

3. **Market Data Pipeline**
   - [ ] Extend polymarket-client with embedding support
   - [ ] Create market embedding cache
   - [ ] Implement market pre-filtering logic

**Deliverables:**
- Database migrations applied
- DeepSeek-R1 service integrated and tested
- Market data pipeline operational

### Phase 3.2: Core Engine (Week 3-4)

**Tasks:**
1. **Correlation Engine**
   - [ ] Implement CorrelationEngine class
   - [ ] Build LLMCorrelationService
   - [ ] Create multi-factor scoring algorithm
   - [ ] Add caching layer for market embeddings

2. **Entity Integration**
   - [ ] Extend existing entity extraction
   - [ ] Build entity-to-market mapping
   - [ ] Implement entity overlap scoring

3. **Async Processing**
   - [ ] Create correlation job queue
   - [ ] Implement job status tracking
   - [ ] Add retry logic for failures

**Deliverables:**
- Correlation engine processing articles end-to-end
- Unit tests passing (>80% coverage)
- Performance benchmarks established

### Phase 3.3: API & Storage (Week 5-6)

**Tasks:**
1. **REST API**
   - [ ] Implement /api/correlations endpoints
   - [ ] Add authentication/authorization
   - [ ] Create request validation middleware

2. **WebSocket Support**
   - [ ] Real-time correlation updates
   - [ ] Subscribe to article/market channels

3. **Storage Layer**
   - [ ] CorrelationStorage implementation
   - [ ] Query optimization
   - [ ] Caching strategy

**Deliverables:**
- API endpoints functional
- WebSocket real-time updates working
- Storage layer optimized

### Phase 3.4: Frontend (Week 7-8)

**Tasks:**
1. **Dashboard Components**
   - [ ] Correlation overview page
   - [ ] Article detail with market links
   - [ ] Market detail with related news

2. **Visualization**
   - [ ] Correlation graph component
   - [ ] Score indicators
   - [ ] Trending correlations widget

3. **Feedback System**
   - [ ] Feedback UI components
   - [ ] Feedback submission
   - [ ] Feedback analytics

**Deliverables:**
- Frontend pages complete
- Visualizations rendering
- Feedback system operational

### Phase 3.5: Integration & Polish (Week 9-10)

**Tasks:**
1. **News Pipeline Integration**
   - [ ] Integrate correlation into news-agent graph
   - [ ] Add correlation step after categorization
   - [ ] Update store-node to save correlations

2. **Monitoring**
   - [ ] Add correlation metrics
   - [ ] Create performance dashboards
   - [ ] Set up alerts for failures

3. **Documentation**
   - [ ] API documentation
   - [ ] User guide
   - [ ] Runbook for operations

**Deliverables:**
- Full integration complete
- Monitoring in place
- Documentation published

---

## PHASE 4: TESTING STRATEGY

### 4.1 Validation Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Precision@3 | >0.75 | % of top-3 correlations rated "correct" by humans |
| Recall@10 | >0.80 | % of relevant markets found in top-10 |
| Mean Reciprocal Rank | >0.60 | Average of 1/rank for first correct correlation |
| Latency (p99) | <5s | Time to correlate single article |
| Throughput | >100/min | Articles processed per minute |

### 4.2 Test Datasets

**Golden Dataset (500 articles):**
- 100 Crypto articles with known market correlations
- 100 Political articles
- 100 Tech articles
- 100 Sports articles
- 100 Mixed/edge cases

**Annotation Process:**
1. Human annotators review article + all active markets
2. Label each market as: RELEVANT, NOT_RELEVANT, UNCERTAIN
3. Score article-market pairs for correlation strength
4. Calculate ground truth metrics

### 4.3 Testing Phases

**Unit Tests**
- Individual service methods
- Score calculation algorithms
- Prompt template rendering
- Response parsing

**Integration Tests**
- End-to-end correlation flow
- Database operations
- API endpoint behavior
- WebSocket message flow

**A/B Testing**
- DeepSeek-R1 vs Gemini-2.0 vs Current Keyword method
- Different prompt variations
- Scoring weight adjustments

**Human Evaluation**
- Weekly sampling of 50 correlations
- Blind rating (don't show scores)
- Track precision/recall over time
- Feedback loop for model improvement

### 4.4 Continuous Validation

```typescript
// Automated quality checks
interface QualityMonitor {
  // Daily quality reports
  generateDailyReport(): QualityReport;
  
  // Alert if metrics drop below thresholds
  checkThresholds(): Alert[];
  
  // Track model drift
  detectModelDrift(window: string): DriftReport;
  
  // Feedback analysis
  analyzeFeedback(): FeedbackInsights;
}
```

---

## APPENDIX

### A. Example Correlation Prompt

```
You are a financial market analyst specializing in prediction markets. 
Your task is to identify which Polymarket prediction markets are directly 
affected by a given news article.

## NEWS ARTICLE
Title: {{article.title}}
Summary: {{article.summary}}
Entities: {{article.entities | join(', ')}}
Category: {{article.category}}

## CANDIDATE MARKETS
{{#each markets}}
{{@index}}. ID: {{id}}
   Question: {{question}}
   Description: {{description}}
   Category: {{category}}
   Volume (24h): ${{volume24hr}}
{{/each}}

## TASK
For each market, analyze whether this news article directly affects the 
probability of the market's outcome. Consider:

1. DIRECT IMPACT: Does the news directly change the likelihood of the outcome?
2. CAUSAL CHAIN: Is there a clear causal link between news and outcome?
3. MARKET CONTEXT: Does the market's description align with the news topic?

## RESPONSE FORMAT
Return ONLY a JSON array with this exact structure:
[
  {
    "marketId": "string",
    "relevanceScore": 0.0-1.0,
    "direction": "BULLISH|BEARISH|NEUTRAL",
    "confidence": "HIGH|MEDIUM|LOW",
    "reasoning": "2-3 sentence explanation",
    "matchedEntities": ["entity1", "entity2"]
  }
]

Scores should reflect:
- 0.9-1.0: Direct, unambiguous impact (e.g., SEC approves ETF → ETF market)
- 0.7-0.89: Strong indirect impact (e.g., Fed raises rates → crypto markets)
- 0.5-0.69: Moderate relevance (e.g., general tech news → tech stock markets)
- 0.3-0.49: Weak relevance (tangential connection)
- 0.0-0.29: No meaningful relevance

Be conservative - only include markets with clear relevance (score > 0.5).
```

### B. Cost Estimates

| Component | Monthly Cost | Notes |
|-----------|--------------|-------|
| DeepSeek-R1 | $50-100 | ~200K tokens/day |
| Gemini-2.0 (fallback) | $20-40 | ~100K tokens/day |
| Embeddings (qwen3) | Free | Using free tier |
| **Total** | **$70-140/month** | Scales with article volume |

### C. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM API failures | Circuit breaker + fallback to Gemini |
| High latency | Async processing with job queue |
| Poor correlations | Human feedback loop + A/B testing |
| Cost overruns | Rate limiting + caching |
| Data inconsistency | Transactional updates + validation |

---

**END OF DOCUMENT**

*This research document was generated as part of the Article-to-Polymarket Correlation System design phase. For questions or updates, refer to the PerpsTrader project documentation.*
