# Enhanced Clustering Features Documentation

## Overview

The enhanced clustering system adds 10 powerful enhancements to the news clustering pipeline, providing deeper insights, better predictions, and user personalization capabilities.

## Table of Contents

1. [Features](#features)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [API Endpoints](#api-endpoints)
5. [Database Schema](#database-schema)
6. [WebSocket Events](#websocket-events)
7. [Testing Checklist](#testing-checklist)
8. [Deployment](#deployment)

---

## Features

### Enhancement 1: Heat Decay Configuration
Category-specific heat decay rates for more accurate clustering scores.

- **Purpose**: Different news categories have different lifespans (e.g., sports news decays fast, geopolitical events linger)
- **Key Features**:
  - Configurable decay constants per category
  - Activity boost for recent spikes
  - Customizable half-life periods

### Enhancement 2: Heat History & Evolution
Track cluster heat evolution over time for trend analysis.

- **Purpose**: Understand how stories develop and identify emerging trends
- **Key Features**:
  - Historical heat score tracking
  - Velocity and acceleration calculations
  - Heat trend analysis with configurable windows

### Enhancement 3: Multi-dimensional Ranking
Composite scoring system considering multiple factors.

- **Purpose**: Better ranking of clusters beyond simple heat scores
- **Key Features**:
  - Sentiment velocity tracking
  - Market correlation scores
  - Composite rank scores combining multiple dimensions

### Enhancement 4: Cross-Category Linking
Detect relationships between clusters in different categories.

- **Purpose**: Find connections between seemingly unrelated news
- **Key Features**:
  - Entity-based cross-references
  - Cluster hierarchy for mega-events
  - Cross-syndication detection

### Enhancement 5: Entity Extraction & Tracking
Identify and track named entities (people, organizations, tokens, etc.).

- **Purpose**: Entity-centric news discovery and tracking
- **Key Features**:
  - Automatic entity extraction from articles
  - Entity-cluster linking for entity heat tracking
  - Trending entities detection

### Enhancement 6: Predictive Scoring
Predict future cluster heat using historical data.

- **Purpose**: Anticipate which stories will spike
- **Key Features**:
  - Time series prediction models
  - Spike prediction with configurable thresholds
  - Batch predictions for multiple clusters

### Enhancement 7: User Personalization
Learn user preferences and deliver personalized content.

- **Purpose**: Tailor news discovery to individual users
- **Key Features**:
  - User engagement tracking
  - Category preference learning
  - Personalized cluster recommendations

### Enhancement 8: Real-time Quality Control (Existing)
Live quality filtering during clustering.

- **Purpose**: Maintain high-quality clusters
- **Key Features**:
  - Inline language filtering
  - Real-time quality validation
  - Fail-fast behavior

### Enhancement 9: Anomaly Detection
Detect unusual clustering patterns and spikes.

- **Purpose**: Identify breaking news and unusual patterns
- **Key Features**:
  - Heat anomaly detection
  - Configurable severity thresholds
  - Anomaly alerts via WebSocket

### Enhancement 10: Performance Monitoring
Track clustering quality and system health.

- **Purpose**: Continuous improvement and debugging
- **Key Features**:
  - Clustering quality metrics
  - AI label accuracy tracking
  - Circuit breaker health monitoring

---

## Installation

### Prerequisites

- Node.js >= 18.x
- SQLite3
- Redis (for message bus)

### Quick Start

```bash
# Clone repository
cd /home/d/PerpsTrader

# Install dependencies
npm install

# Run setup script
npm run setup:enhanced

# Build TypeScript
npm run build

# Configure environment variables (see Configuration section)
cp .env.enhanced.example .env
# Edit .env with your settings

# Start enhanced news agent
npm run start:news-agent

# Start dashboard
npm run start:dashboard
```

### Manual Installation Steps

1. **Database Migration**

```bash
# Run migration script
bash migrations/run-002.sh
```

Or manually:

```bash
sqlite3 data/trading.db < migrations/002_cluster_enhancements.sql
```

2. **Build TypeScript**

```bash
npm run build:typescript
```

3. **Verify Installation**

```bash
# Check dashboard is running
curl http://localhost:3001/api/health

# Check enhanced endpoints
curl http://localhost:3001/api/enhanced/news/decay-config
```

---

## Configuration

### Environment Variables

#### Enhanced Feature Toggles

```bash
# Master toggle for all enhanced features
ENHANCED_CLUSTERING_ENABLED=true

# Individual feature toggles
ENTITY_EXTRACTION_ENABLED=true
ANOMALY_DETECTION_ENABLED=true
HEAT_PREDICTION_ENABLED=true
USER_PERSONALIZATION_ENABLED=true
```

#### News Agent Configuration

```bash
# Cycle timing
NEWS_CYCLE_INTERVAL_MS=60000
NEWS_ROTATION_MODE=true
NEWS_QUERIES_PER_CATEGORY=3

# Enhanced clustering options
CLUSTER_BATCH_SIZE=20
CLUSTER_MERGE_HOURS_THRESHOLD=48
CLUSTER_MERGE_SIMILARITY_THRESHOLD=0.85

# Vector configuration
NEWS_VECTOR_DISTANCE_THRESHOLD=0.70
NEWS_VECTOR_FILTER_BY_CATEGORY=true

# Fallback options
NEWS_USE_GLM=false
NEWS_FALLBACK_TO_BASIC=true
```

#### Dashboard Configuration

```bash
DASHBOARD_PORT=3001
DASHBOARD_ALLOWED_ORIGINS=http://localhost:3001,https://localhost:3001
NEWS_DASHBOARD_POLL_MS=10000
NEWS_DASHBOARD_POLL_LIMIT=25
```

#### Prediction Markets

```bash
PREDICTION_MIN_VOLUME=1000
```

### Default Decay Configurations

The migration includes default heat decay configurations for each category:

| Category | Decay Constant | Half-Life (hours) | Description |
|----------|----------------|-------------------|-------------|
| CRYPTO | 0.25 | 3.0 | Fast-paced crypto markets |
| STOCKS | 0.2 | 4.0 | Stock market standard decay |
| ECONOMICS | 0.15 | 5.0 | Economic events linger longer |
| GEOPOLITICS | 0.1 | 7.0 | Geopolitical events have long tails |
| TECH | 0.2 | 4.0 | Tech news standard decay |
| COMMODITIES | 0.18 | 4.5 | Commodities medium decay |
| SPORTS | 0.3 | 2.0 | Sports news decays fast |
| FOOTBALL | 0.3 | 2.0 | Football news decays fast |
| BASKETBALL | 0.3 | 2.0 | Basketball news decays fast |
| TENNIS | 0.3 | 2.0 | Tennis news decays fast |
| MMA | 0.3 | 2.0 | MMA news decays fast |
| GOLF | 0.3 | 2.0 | Golf news decays fast |
| GENERAL | 0.2 | 3.5 | Default decay |

These can be updated via API: `PUT /api/enhanced/news/decay-config/:category`

---

## API Endpoints

All enhanced endpoints are mounted under `/api/enhanced`.

### Heat History & Evolution

#### Get Heat History for Cluster
```http
GET /api/enhanced/news/clusters/:id/heat-history?limit=100
```

**Response:**
```json
{
  "clusterId": "uuid",
  "history": [
    {
      "timestamp": "2024-01-28T12:00:00Z",
      "heatScore": 85.5,
      "articleCount": 42,
      "uniqueTitleCount": 38,
      "velocity": 2.3
    }
  ],
  "count": 100
}
```

#### Analyze Cluster Heat Trend
```http
GET /api/enhanced/news/clusters/:id/trend-analysis?window=6
```

**Response:**
```json
{
  "clusterId": "uuid",
  "windowHours": 6,
  "trend": "RISING",
  "trendScore": 0.85,
  "peakHeat": 92.3,
  "currentHeat": 85.5,
  "predictedNext": 89.2
}
```

#### Batch Heat History
```http
GET /api/enhanced/news/heat-history-batch?ids=id1,id2,id3&limit=50
```

### Heat Decay Configuration

#### Get All Decay Configs
```http
GET /api/enhanced/news/decay-config
```

**Response:**
```json
[
  {
    "category": "CRYPTO",
    "decayConstant": 0.25,
    "baseHalfLifeHours": 3.0,
    "activityBoostHours": 2,
    "spikeMultiplier": 1.5,
    "description": "Fast-paced crypto markets",
    "updatedAt": "2024-01-28T12:00:00Z"
  }
]
```

#### Update Decay Config
```http
PUT /api/enhanced/news/decay-config/:category
Content-Type: application/json

{
  "decayConstant": 0.3,
  "baseHalfLifeHours": 2.5
}
```

### Entity Extraction & Tracking

#### Get Trending Entities
```http
GET /api/enhanced/news/entities/trending?limit=20&hours=24
```

**Response:**
```json
{
  "entities": [
    {
      "name": "Bitcoin",
      "type": "TOKEN",
      "normalized": "bitcoin",
      "heatScore": 95.3,
      "clusterCount": 12,
      "articleCount": 87
    }
  ],
  "count": 20,
  "window": "24h"
}
```

#### Get Cluster Entities
```http
GET /api/enhanced/news/clusters/:id/entities
```

### Cross-Category Linking

#### Get Related Clusters
```http
GET /api/enhanced/news/clusters/:id/related?limit=10
```

**Response:**
```json
{
  "clusterId": "uuid",
  "related": [
    {
      "clusterId": "uuid2",
      "category": "STOCKS",
      "similarity": 0.85,
      "referenceType": "RELATED"
    }
  ],
  "count": 10
}
```

#### Get Cross-Category Events
```http
GET /api/enhanced/news/cross-events?hours=24
```

### Predictive Scoring

#### Get Cluster Prediction
```http
GET /api/enhanced/news/clusters/:id/prediction
```

**Response:**
```json
{
  "clusterId": "uuid",
  "prediction": 89.2,
  "confidence": 0.78,
  "horizon": "1h",
  "currentHeat": 85.5,
  "trend": "RISING"
}
```

#### Batch Predictions
```http
GET /api/enhanced/news/predictions?limit=50&hours=24
```

#### Get Predicted Spikes
```http
GET /api/enhanced/news/predictions/spikes?limit=20&threshold=0.3
```

### Multi-dimensional Ranking

#### Get Ranked Clusters
```http
GET /api/enhanced/news/clusters/ranked?limit=50&hours=24
```

**Response:**
```json
{
  "rankings": [
    {
      "clusterId": "uuid",
      "topic": "Bitcoin ETF Approval",
      "category": "CRYPTO",
      "compositeScore": 92.5,
      "heatScore": 88.3,
      "entityScore": 85.2,
      "sentimentScore": 90.1,
      "velocityScore": 87.8
    }
  ],
  "count": 50,
  "window": "24h"
}
```

#### Get Cluster Composite Rank
```http
GET /api/enhanced/news/clusters/:id/composite-rank
```

### Anomaly Detection

#### Get All Anomalies
```http
GET /api/enhanced/news/anomalies?hours=24&severity=LOW
```

**Response:**
```json
{
  "anomalies": [
    {
      "clusterId": "uuid",
      "isAnomaly": true,
      "anomalyType": "SUDDEN_SPIKE",
      "anomalyScore": 0.92,
      "severity": "HIGH",
      "detectedAt": "2024-01-28T12:00:00Z",
      "description": "Sudden heat spike detected"
    }
  ],
  "count": 5,
  "window": "24h"
}
```

#### Get Cluster Anomalies
```http
GET /api/enhanced/news/clusters/:id/anomalies
```

### User Personalization

#### Record User Engagement
```http
POST /api/enhanced/user/engagement
Content-Type: application/json

{
  "userId": "user123",
  "clusterId": "uuid",
  "engagementType": "VIEW",
  "durationMs": 5000
}
```

#### Get User Engagement History
```http
GET /api/enhanced/user/:userId/engagement?limit=100
```

#### Get User Preferences
```http
GET /api/enhanced/user/:userId/preferences
```

**Response:**
```json
{
  "userId": "user123",
  "preferences": [
    {
      "category": "CRYPTO",
      "weight": 1.5
    },
    {
      "category": "STOCKS",
      "weight": 1.2
    }
  ],
  "count": 13
}
```

#### Get User Recommendations
```http
GET /api/enhanced/user/:userId/recommendations?limit=20&hours=24
```

#### Train User Preferences
```http
POST /api/enhanced/user/:userId/train
```

#### Get User Stats
```http
GET /api/enhanced/user/:userId/stats?days=7
```

### Performance Monitoring

#### Get Clustering Quality Metrics
```http
GET /api/enhanced/news/quality-metrics?hours=24
```

**Response:**
```json
{
  "window": "24h",
  "metrics": {
    "precision": 0.92,
    "recall": 0.88,
    "cohesion": 0.85,
    "separation": 0.90,
    "f1Score": 0.90
  }
}
```

#### Get Circuit Breakers Health
```http
GET /api/enhanced/news/circuit-breakers-health
```

**Response:**
```json
{
  "overall": "HEALTHY",
  "openCount": 0,
  "totalCount": 5,
  "breakers": [
    {
      "name": "news-execution",
      "state": "CLOSED",
      "lastFailureAt": null,
      "failureCount": 0
    }
  ]
}
```

---

## Database Schema

### New Tables

#### cluster_heat_history
```sql
CREATE TABLE cluster_heat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_id TEXT NOT NULL,
    heat_score REAL NOT NULL,
    article_count INTEGER NOT NULL,
    unique_title_count INTEGER NOT NULL,
    velocity REAL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY(cluster_id) REFERENCES story_clusters(id) ON DELETE CASCADE
);
```

#### named_entities
```sql
CREATE TABLE named_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    is_verified BOOLEAN DEFAULT 0
);
```

#### entity_article_links
```sql
CREATE TABLE entity_article_links (
    entity_id INTEGER NOT NULL,
    article_id TEXT NOT NULL,
    confidence REAL DEFAULT 1.0,
    extracted_at TEXT NOT NULL,
    PRIMARY KEY (entity_id, article_id)
);
```

#### entity_cluster_links
```sql
CREATE TABLE entity_cluster_links (
    entity_id INTEGER NOT NULL,
    cluster_id TEXT NOT NULL,
    article_count INTEGER DEFAULT 0,
    heat_contribution REAL DEFAULT 0,
    first_linked TEXT NOT NULL,
    last_linked TEXT NOT NULL,
    PRIMARY KEY (entity_id, cluster_id)
);
```

#### cluster_cross_refs
```sql
CREATE TABLE cluster_cross_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_cluster_id TEXT NOT NULL,
    target_cluster_id TEXT NOT NULL,
    reference_type TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    created_at TEXT NOT NULL
);
```

#### cluster_hierarchy
```sql
CREATE TABLE cluster_hierarchy (
    parent_cluster_id TEXT NOT NULL,
    child_cluster_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (parent_cluster_id, child_cluster_id)
);
```

#### user_engagement
```sql
CREATE TABLE user_engagement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    cluster_id TEXT NOT NULL,
    engagement_type TEXT NOT NULL,
    duration_ms INTEGER,
    timestamp TEXT NOT NULL
);
```

#### user_category_preferences
```sql
CREATE TABLE user_category_preferences (
    user_id TEXT NOT NULL,
    category TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    last_updated TEXT NOT NULL,
    PRIMARY KEY (user_id, category)
);
```

#### clustering_metrics
```sql
CREATE TABLE clustering_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_type TEXT NOT NULL,
    category TEXT,
    value REAL NOT NULL,
    sample_size INTEGER,
    calculated_at TEXT NOT NULL,
    notes TEXT
);
```

#### label_quality_tracking
```sql
CREATE TABLE label_quality_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id TEXT NOT NULL,
    label_type TEXT NOT NULL,
    original_label TEXT NOT NULL,
    corrected_label TEXT,
    accuracy_score REAL,
    feedback_source TEXT,
    created_at TEXT NOT NULL
);
```

#### circuit_breaker_metrics
```sql
CREATE TABLE circuit_breaker_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    breaker_name TEXT NOT NULL,
    state TEXT NOT NULL,
    open_count INTEGER DEFAULT 0,
    last_opened_at TEXT,
    last_closed_at TEXT,
    total_failures INTEGER DEFAULT 0,
    total_successes INTEGER DEFAULT 0,
    avg_response_time_ms REAL,
    recorded_at TEXT NOT NULL
);
```

#### heat_decay_config
```sql
CREATE TABLE heat_decay_config (
    category TEXT PRIMARY KEY,
    decay_constant REAL NOT NULL DEFAULT 0.2,
    activity_boost_hours INTEGER DEFAULT 2,
    spike_multiplier REAL DEFAULT 1.5,
    base_half_life_hours REAL DEFAULT 3.5,
    description TEXT,
    updated_at TEXT NOT NULL
);
```

### Enhanced story_clusters Table Columns

```sql
ALTER TABLE story_clusters ADD COLUMN heat_velocity REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN acceleration REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN predicted_heat REAL;
ALTER TABLE story_clusters ADD COLUMN prediction_confidence REAL;
ALTER TABLE story_clusters ADD COLUMN is_cross_category BOOLEAN DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN parent_cluster_id TEXT;
ALTER TABLE story_clusters ADD COLUMN entity_heat_score REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN source_authority_score REAL DEFAULT 1.0;
ALTER TABLE story_clusters ADD COLUMN sentiment_velocity REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN market_correlation_score REAL;
ALTER TABLE story_clusters ADD COLUMN composite_rank_score REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN is_anomaly BOOLEAN DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN anomaly_type TEXT;
ALTER TABLE story_clusters ADD COLUMN anomaly_score REAL DEFAULT 0;
ALTER TABLE story_clusters ADD COLUMN lifecycle_stage TEXT;
ALTER TABLE story_clusters ADD COLUMN peak_heat REAL;
ALTER TABLE story_clusters ADD COLUMN peak_time TEXT;
```

---

## WebSocket Events

### NEWS_CLUSTERED
Emitted when clustering cycle completes.

```javascript
socket.on('news_clustered', (data) => {
  console.log('Clustering complete:', data);
});
```

**Payload:**
```json
{
  "timestamp": "2024-01-28T12:00:00Z",
  "totalProcessed": 150,
  "newClusters": 25,
  "existingClusters": 120,
  "mergedClusters": 5,
  "entitiesExtracted": 87,
  "anomaliesDetected": 2,
  "predictionsGenerated": 50,
  "trendingEntities": [...]
}
```

### NEWS_ANOMALY
Emitted when anomaly is detected.

```javascript
socket.on('news_anomaly', (data) => {
  console.log('Anomaly detected:', data);
});
```

**Payload:**
```json
{
  "clusterId": "uuid",
  "isAnomaly": true,
  "anomalyType": "SUDDEN_SPIKE",
  "anomalyScore": 0.92,
  "detectedAt": "2024-01-28T12:00:00Z",
  "description": "Sudden heat spike detected"
}
```

### NEWS_PREDICTION
Emitted when heat prediction is generated.

```javascript
socket.on('news_prediction', (data) => {
  console.log('Prediction:', data);
});
```

**Payload:**
```json
{
  "clusterId": "uuid",
  "prediction": 89.2,
  "confidence": 0.78,
  "horizon": "1h",
  "currentHeat": 85.5,
  "trend": "RISING"
}
```

---

## Testing Checklist

### API Endpoints Verification

```bash
# Health check
curl http://localhost:3001/api/health | jq

# Decay config
curl http://localhost:3001/api/enhanced/news/decay-config | jq

# Quality metrics
curl http://localhost:3001/api/enhanced/news/quality-metrics | jq

# Circuit breakers health
curl http://localhost:3001/api/enhanced/news/circuit-breakers-health | jq

# Trending entities
curl http://localhost:3001/api/enhanced/news/entities/trending | jq

# Anomalies
curl http://localhost:3001/api/enhanced/news/anomalies | jq

# Predictions
curl http://localhost:3001/api/enhanced/news/predictions | jq

# Ranked clusters
curl http://localhost:3001/api/enhanced/news/clusters/ranked | jq
```

### WebSocket Events Testing

```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
  console.log('Connected to dashboard');

  // Subscribe to events
  socket.on('news_clustered', (data) => {
    console.log('✓ NEWS_CLUSTERED event received:', data);
  });

  socket.on('news_anomaly', (data) => {
    console.log('✓ NEWS_ANOMALY event received:', data);
  });

  socket.on('news_prediction', (data) => {
    console.log('✓ NEWS_PREDICTION event received:', data);
  });
});
```

### Database Verification

```bash
# Check tables exist
sqlite3 data/trading.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

# Check cluster heat history
sqlite3 data/trading.db "SELECT COUNT(*) FROM cluster_heat_history;"

# Check entities
sqlite3 data/trading.db "SELECT COUNT(*) FROM named_entities;"

# Check cross-refs
sqlite3 data/trading.db "SELECT COUNT(*) FROM cluster_cross_refs;"

# Check story_clusters has new columns
sqlite3 data/trading.db "PRAGMA table_info(story_clusters);"
```

### Entity Extraction Testing

```bash
# Get trending entities
curl http://localhost:3001/api/enhanced/news/entities/trending?limit=10 | jq '.entities[]'

# Get entities for a cluster
# First get a cluster ID
CLUSTER_ID=$(curl -s http://localhost:3001/api/news/clusters | jq -r '.[0].id')
curl http://localhost:3001/api/enhanced/news/clusters/$CLUSTER_ID/entities | jq
```

### Heat Prediction Testing

```bash
# Get predictions for clusters
curl http://localhost:3001/api/enhanced/news/predictions?limit=10 | jq '.predictions[]'

# Get predicted spikes
curl http://localhost:3001/api/enhanced/news/predictions/spikes?threshold=0.3 | jq '.spikes[]'

# Get prediction for specific cluster
CLUSTER_ID=$(curl -s http://localhost:3001/api/news/clusters | jq -r '.[0].id')
curl http://localhost:3001/api/enhanced/news/clusters/$CLUSTER_ID/prediction | jq
```

### Anomaly Detection Testing

```bash
# Get anomalies
curl http://localhost:3001/api/enhanced/news/anomalies | jq '.anomalies[]'

# Get anomalies for specific cluster
CLUSTER_ID=$(curl -s http://localhost:3001/api/news/clusters | jq -r '.[0].id')
curl http://localhost:3001/api/enhanced/news/clusters/$CLUSTER_ID/anomalies | jq
```

### User Personalization Testing

```bash
# Record engagement
curl -X POST http://localhost:3001/api/enhanced/user/engagement \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "clusterId": "test-cluster-id",
    "engagementType": "VIEW",
    "durationMs": 5000
  }' | jq

# Get user preferences
curl http://localhost:3001/api/enhanced/user/test-user/preferences | jq

# Train preferences
curl -X POST http://localhost:3001/api/enhanced/user/test-user/train | jq

# Get recommendations
curl http://localhost:3001/api/enhanced/user/test-user/recommendations | jq
```

---

## Deployment

### Production Checklist

- [ ] Database migration run on production database
- [ ] Environment variables configured in production
- [ ] Enhanced clustering enabled (`ENHANCED_CLUSTERING_ENABLED=true`)
- [ ] Redis message bus connected
- [ ] Vector store initialized
- [ ] OpenRouter API key configured
- [ ] Dashboard port configured (`DASHBOARD_PORT`)
- [ ] CORS origins configured
- [ ] Backup strategy in place
- [ ] Monitoring and alerting setup
- [ ] Load testing performed

### Rollback Plan

If issues arise:

1. **Disable Enhanced Clustering**
   ```bash
   # Set environment variable
   ENHANCED_CLUSTERING_ENABLED=false
   ```

2. **Restart Services**
   ```bash
   # Restart news agent
   pm2 restart news-agent

   # Restart dashboard
   pm2 restart dashboard
   ```

3. **Restore Database** (if needed)
   ```bash
   # Restore from backup
   cp data/backups/trading.db.pre-002.YYYYMMDD_HHMMSS.bak data/trading.db
   ```

### Performance Tuning

#### Clustering Performance

- **Batch Size**: Adjust `CLUSTER_BATCH_SIZE` based on CPU
  - High CPU: 30-50
  - Medium CPU: 20-30 (default)
  - Low CPU: 10-20

- **Merge Threshold**: Adjust `CLUSTER_MERGE_SIMILARITY_THRESHOLD`
  - Higher (0.9+): Fewer, larger clusters
  - Lower (0.75-0.85): More, smaller clusters (default)

#### Database Performance

- Enable WAL mode:
  ```sql
  PRAGMA journal_mode=WAL;
  PRAGMA synchronous=NORMAL;
  ```

- Create additional indexes if needed:
  ```sql
  CREATE INDEX idx_cluster_heat_history_cluster_time
    ON cluster_heat_history(cluster_id, timestamp DESC);
  ```

#### Memory Usage

- Limit vector store size
- Adjust cache TTL settings
- Monitor heap usage with Node.js flags

---

## Troubleshooting

### Enhanced Clustering Not Working

**Problem**: Clustering uses basic mode instead of enhanced

**Solution**:
```bash
# Check environment variable
echo $ENHANCED_CLUSTERING_ENABLED

# Should output: true

# If not, set it
export ENHANCED_CLUSTERING_ENABLED=true

# Or add to .env file
echo "ENHANCED_CLUSTERING_ENABLED=true" >> .env
```

### Migration Failures

**Problem**: Migration script fails

**Solution**:
```bash
# Check SQLite version (should be >= 3.35.0 for ALTER TABLE)
sqlite3 --version

# Run migration manually
sqlite3 data/trading.db < migrations/002_cluster_enhancements.sql

# Check for existing columns that might conflict
sqlite3 data/trading.db "PRAGMA table_info(story_clusters);"
```

### WebSocket Events Not Received

**Problem**: Not receiving NEWS_CLUSTERED, NEWS_ANOMALY, NEWS_PREDICTION events

**Solution**:
```bash
# Check message bus connection
curl http://localhost:3001/api/health | jq '.messageBus.connected'

# Should be: true

# Check if news agent is running
ps aux | grep news-agent

# Check logs for errors
tail -f logs/news-agent.log
```

### API Endpoints Return 404

**Problem**: Enhanced endpoints not found

**Solution**:
```bash
# Verify enhanced routes are mounted
curl http://localhost:3001/api/enhanced/news/decay-config

# If 404, check dashboard server is built
npm run build

# Restart dashboard
pm2 restart dashboard
```

---

## Support

For issues or questions:

1. Check logs: `tail -f logs/*.log`
2. Review this documentation
3. Check test output: `npm test`
4. Verify configuration: `cat .env`

---

**Last Updated**: January 28, 2024
**Version**: 2.0.0
