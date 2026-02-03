# PerpsTrader Enhanced API Reference

Complete API documentation for all 10 enhancements.

**Base URL**: `http://0.0.0.0:3000` (or your configured host)

**API Version**: v1

**Content-Type**: `application/json`

---

## Table of Contents

- [Enhancement 1: Heat Decay Configuration](#enhancement-1-heat-decay-configuration)
- [Enhancement 2: Heat History & Evolution](#enhancement-2-heat-history--evolution)
- [Enhancement 3: Multi-dimensional Ranking](#enhancement-3-multi-dimensional-ranking)
- [Enhancement 4: Cross-Category Linking](#enhancement-4-cross-category-linking)
- [Enhancement 5: Entity Extraction & Tracking](#enhancement-5-entity-extraction--tracking)
- [Enhancement 6: Predictive Scoring](#enhancement-6-predictive-scoring)
- [Enhancement 7: User Personalization](#enhancement-7-user-personalization)
- [Enhancement 9: Anomaly Detection](#enhancement-9-anomaly-detection)
- [Enhancement 10: Performance Monitoring](#enhancement-10-performance-monitoring)

---

## Enhancement 1: Heat Decay Configuration

### GET /api/news/decay-config

Get heat decay configuration for all categories.

**Query Parameters**: None

**Response Schema**:
```typescript
{
  configs: Array<{
    category: string;                    // Category name
    decayConstant: number;              // Decay factor (0-1)
    activityBoostHours: number;         // Hours of boost after new activity
    spikeMultiplier: number;            // Multiplier for viral spikes
    baseHalfLifeHours: number;          // Base half-life in hours
    description?: string;               // Optional description
    updatedAt: string;                  // ISO 8601 timestamp
  }>;
}
```

**Example Response**:
```json
{
  "configs": [
    {
      "category": "CRYPTO",
      "decayConstant": 0.95,
      "activityBoostHours": 2,
      "spikeMultiplier": 1.5,
      "baseHalfLifeHours": 6,
      "description": "Fast-moving crypto news",
      "updatedAt": "2024-01-15T10:30:00Z"
    },
    {
      "category": "STOCKS",
      "decayConstant": 0.97,
      "activityBoostHours": 4,
      "spikeMultiplier": 1.3,
      "baseHalfLifeHours": 12,
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Error Codes**:
- `500`: Internal server error

---

### PUT /api/news/decay-config/:category

Update heat decay configuration for a specific category.

**Path Parameters**:
- `category` (string, required): Category name

**Request Body**:
```typescript
{
  decayConstant?: number;              // Decay factor (0-1)
  activityBoostHours?: number;         // Hours of boost after new activity
  spikeMultiplier?: number;            // Multiplier for viral spikes
  baseHalfLifeHours?: number;          // Base half-life in hours
  description?: string;               // Optional description
}
```

**Example Request**:
```json
{
  "decayConstant": 0.96,
  "activityBoostHours": 3,
  "spikeMultiplier": 1.4
}
```

**Response Schema**:
```typescript
{
  success: boolean;
  config: {
    category: string;
    decayConstant: number;
    activityBoostHours: number;
    spikeMultiplier: number;
    baseHalfLifeHours: number;
    description?: string;
    updatedAt: string;
  };
}
```

**Example Response**:
```json
{
  "success": true,
  "config": {
    "category": "CRYPTO",
    "decayConstant": 0.96,
    "activityBoostHours": 3,
    "spikeMultiplier": 1.4,
    "baseHalfLifeHours": 6,
    "updatedAt": "2024-01-15T11:00:00Z"
  }
}
```

**Error Codes**:
- `400`: Invalid category name
- `500`: Internal server error

---

## Enhancement 2: Heat History & Evolution

### GET /api/news/clusters/:id/heat-history

Get heat history for a specific cluster.

**Path Parameters**:
- `id` (string, required): Cluster ID

**Query Parameters**:
- `limit` (integer, optional): Maximum number of history points (default: 100, max: 500)

**Response Schema**:
```typescript
{
  clusterId: string;
  history: Array<{
    id: number;
    clusterId: string;
    heatScore: number;                // Current heat score
    articleCount: number;              // Number of articles
    uniqueTitleCount: number;          // Unique titles count
    velocity: number;                  // Rate of change
    timestamp: string;                 // ISO 8601 timestamp
  }>;
  count: number;
}
```

**Example Response**:
```json
{
  "clusterId": "crypto_btc_halving_2024",
  "history": [
    {
      "id": 1,
      "clusterId": "crypto_btc_halving_2024",
      "heatScore": 85.2,
      "articleCount": 42,
      "uniqueTitleCount": 38,
      "velocity": 12.5,
      "timestamp": "2024-01-15T12:00:00Z"
    },
    {
      "id": 2,
      "clusterId": "crypto_btc_halving_2024",
      "heatScore": 72.8,
      "articleCount": 38,
      "uniqueTitleCount": 34,
      "velocity": 8.3,
      "timestamp": "2024-01-15T11:00:00Z"
    }
  ],
  "count": 48
}
```

**Error Codes**:
- `404`: Cluster not found
- `500`: Internal server error

---

### GET /api/news/clusters/:id/trend-analysis

Analyze cluster heat trend over time.

**Path Parameters**:
- `id` (string, required): Cluster ID

**Query Parameters**:
- `window` (integer, optional): Analysis window in hours (default: 6)

**Response Schema**:
```typescript
{
  clusterId: string;
  currentHeat: number;
  velocity: number;                    // Current rate of change
  acceleration: number;                 // Rate of change of velocity
  trend: 'ACCELERATING' | 'STABLE' | 'DECELERATING';
  predictedTrajectory: 'SPIKE' | 'SUSTAINED' | 'DECAY';
  confidence: number;                   // 0-1
  lifecycleStage: 'EMERGING' | 'SUSTAINED' | 'DECAYING' | 'DEAD';
  timeToPeak?: number;                  // Hours until predicted peak
  timeToDecay?: number;                  // Hours until significant decay
}
```

**Example Response**:
```json
{
  "clusterId": "crypto_btc_halving_2024",
  "currentHeat": 85.2,
  "velocity": 12.5,
  "acceleration": 3.2,
  "trend": "ACCELERATING",
  "predictedTrajectory": "SPIKE",
  "confidence": 0.85,
  "lifecycleStage": "EMERGING",
  "timeToPeak": 4.5,
  "timeToDecay": 18
}
```

**Error Codes**:
- `404`: Cluster not found
- `500`: Internal server error

---

### GET /api/news/heat-history-batch

Get heat history for multiple clusters.

**Query Parameters**:
- `ids` (string, required): Comma-separated cluster IDs
- `limit` (integer, optional): Maximum history points per cluster (default: 50, max: 100)

**Response Schema**:
```typescript
{
  clusterIds: string[];
  histories: {
    [clusterId: string]: Array<{
      id: number;
      clusterId: string;
      heatScore: number;
      articleCount: number;
      uniqueTitleCount: number;
      velocity: number;
      timestamp: string;
    }>;
  };
}
```

**Example Response**:
```json
{
  "clusterIds": ["cluster_1", "cluster_2"],
  "histories": {
    "cluster_1": [
      {
        "id": 1,
        "clusterId": "cluster_1",
        "heatScore": 75.3,
        "articleCount": 28,
        "uniqueTitleCount": 25,
        "velocity": 5.2,
        "timestamp": "2024-01-15T12:00:00Z"
      }
    ],
    "cluster_2": [
      {
        "id": 1,
        "clusterId": "cluster_2",
        "heatScore": 42.1,
        "articleCount": 15,
        "uniqueTitleCount": 13,
        "velocity": -2.3,
        "timestamp": "2024-01-15T12:00:00Z"
      }
    ]
  }
}
```

**Error Codes**:
- `400`: Missing or invalid `ids` parameter
- `500`: Internal server error

---

## Enhancement 3: Multi-dimensional Ranking

### GET /api/news/clusters/ranked

Get clusters ranked by composite score.

**Query Parameters**:
- `limit` (integer, optional): Maximum clusters to return (default: 50, max: 100)
- `hours` (integer, optional): Time window in hours (default: 24, max: 168)

**Response Schema**:
```typescript
{
  rankings: Array<{
    clusterId: string;
    heatScore: number;
    articleCount: number;
    sentimentVelocity: number;
    sourceAuthorityScore: number;
    marketCorrelationScore?: number;
    entityHeatScore: number;
    compositeScore: number;
    category: string;
  }>;
  count: number;
  window: string;                      // e.g., "24h"
}
```

**Example Response**:
```json
{
  "rankings": [
    {
      "clusterId": "crypto_btc_halving_2024",
      "heatScore": 85.2,
      "articleCount": 42,
      "sentimentVelocity": 8.5,
      "sourceAuthorityScore": 7.8,
      "marketCorrelationScore": 9.2,
      "entityHeatScore": 8.1,
      "compositeScore": 82.3,
      "category": "CRYPTO"
    },
    {
      "clusterId": "stocks_nvidia_earnings",
      "heatScore": 78.9,
      "articleCount": 35,
      "sentimentVelocity": 6.2,
      "sourceAuthorityScore": 8.5,
      "entityHeatScore": 7.9,
      "compositeScore": 76.4,
      "category": "STOCKS"
    }
  ],
  "count": 50,
  "window": "24h"
}
```

**Error Codes**:
- `500`: Internal server error

---

### GET /api/news/clusters/:id/composite-rank

Get composite ranking for a specific cluster.

**Path Parameters**:
- `id` (string, required): Cluster ID

**Response Schema**:
```typescript
{
  clusterId: string;
  heatScore: number;
  articleCount: number;
  sentimentVelocity: number;
  sourceAuthorityScore: number;
  marketCorrelationScore?: number;
  entityHeatScore: number;
  compositeScore: number;
  category: string;
}
```

**Example Response**:
```json
{
  "clusterId": "crypto_btc_halving_2024",
  "heatScore": 85.2,
  "articleCount": 42,
  "sentimentVelocity": 8.5,
  "sourceAuthorityScore": 7.8,
  "marketCorrelationScore": 9.2,
  "entityHeatScore": 8.1,
  "compositeScore": 82.3,
  "category": "CRYPTO"
}
```

**Error Codes**:
- `404`: Cluster not found
- `500`: Internal server error

---

## Enhancement 4: Cross-Category Linking

### GET /api/news/clusters/:id/related

Get related clusters across categories.

**Path Parameters**:
- `id` (string, required): Cluster ID

**Query Parameters**:
- `limit` (integer, optional): Maximum related clusters (default: 10, max: 20)

**Response Schema**:
```typescript
{
  clusterId: string;
  related: Array<{
    clusterId: string;
    category: string;
    similarity: number;                 // 0-1
    relationshipType: 'SOFT_REF' | 'RELATED' | 'PART_OF' | 'CAUSES';
  }>;
  count: number;
}
```

**Example Response**:
```json
{
  "clusterId": "crypto_btc_halving_2024",
  "related": [
    {
      "clusterId": "stocks_microstrategy_holdings",
      "category": "STOCKS",
      "similarity": 0.82,
      "relationshipType": "RELATED"
    },
    {
      "clusterId": "tech_bitcoin_etf_approval",
      "category": "TECH",
      "similarity": 0.75,
      "relationshipType": "CAUSES"
    },
    {
      "clusterId": "econ_fed_crypto_regulation",
      "category": "ECONOMICS",
      "similarity": 0.68,
      "relationshipType": "PART_OF"
    }
  ],
  "count": 3
}
```

**Error Codes**:
- `404`: Cluster not found
- `500`: Internal server error

---

### GET /api/news/cross-events

Get cross-category events (similar topics in multiple categories).

**Query Parameters**:
- `hours` (integer, optional): Time window in hours (default: 24, max: 168)

**Response Schema**:
```typescript
{
  events: Array<{
    sourceClusterId: string;
    sourceCategory: string;
    targetClusters: Array<{
      clusterId: string;
      category: string;
      similarity: number;
    }>;
    eventTime: string;
  }>;
  count: number;
  window: string;                      // e.g., "24h"
}
```

**Example Response**:
```json
{
  "events": [
    {
      "sourceClusterId": "crypto_btc_halving_2024",
      "sourceCategory": "CRYPTO",
      "targetClusters": [
        {
          "clusterId": "stocks_microstrategy_holdings",
          "category": "STOCKS",
          "similarity": 0.82
        },
        {
          "clusterId": "tech_bitcoin_etf_approval",
          "category": "TECH",
          "similarity": 0.75
        }
      ],
      "eventTime": "2024-01-15T12:00:00Z"
    }
  ],
  "count": 1,
  "window": "24h"
}
```

**Error Codes**:
- `500`: Internal server error

---

## Enhancement 5: Entity Extraction & Tracking

### GET /api/news/entities/trending

Get trending entities.

**Query Parameters**:
- `limit` (integer, optional): Maximum entities to return (default: 20, max: 50)
- `hours` (integer, optional): Time window in hours (default: 24, max: 168)

**Response Schema**:
```typescript
{
  entities: Array<{
    entityId: number;
    entityName: string;
    entityType: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'TOKEN' | 'PROTOCOL' | 'COUNTRY' | 'GOVERNMENT_BODY';
    totalHeat: number;
    clusterCount: number;
    trendingDirection: 'UP' | 'DOWN' | 'NEUTRAL';
    lastUpdated: string;
  }>;
  count: number;
  window: string;
}
```

**Example Response**:
```json
{
  "entities": [
    {
      "entityId": 1,
      "entityName": "Bitcoin",
      "entityType": "TOKEN",
      "totalHeat": 1250.5,
      "clusterCount": 28,
      "trendingDirection": "UP",
      "lastUpdated": "2024-01-15T12:00:00Z"
    },
    {
      "entityId": 2,
      "entityName": "Federal Reserve",
      "entityType": "GOVERNMENT_BODY",
      "totalHeat": 890.2,
      "clusterCount": 18,
      "trendingDirection": "UP",
      "lastUpdated": "2024-01-15T12:00:00Z"
    }
  ],
  "count": 20,
  "window": "24h"
}
```

**Error Codes**:
- `500`: Internal server error

---

### GET /api/news/clusters/:id/entities

Get entities for a specific cluster.

**Path Parameters**:
- `id` (string, required): Cluster ID

**Response Schema**:
```typescript
{
  clusterId: string;
  entities: Array<{
    entityId: number;
    entityName: string;
    entityType: string;
    heatContribution: number;
  }>;
  count: number;
}
```

**Example Response**:
```json
{
  "clusterId": "crypto_btc_halving_2024",
  "entities": [
    {
      "entityId": 1,
      "entityName": "Bitcoin",
      "entityType": "TOKEN",
      "heatContribution": 35.2
    },
    {
      "entityId": 3,
      "entityName": "NVIDIA",
      "entityType": "ORGANIZATION",
      "heatContribution": 12.8
    }
  ],
  "count": 2
}
```

**Error Codes**:
- `404`: Cluster not found
- `500`: Internal server error

---

## Enhancement 6: Predictive Scoring

### GET /api/news/clusters/:id/prediction

Get heat prediction for a specific cluster.

**Path Parameters**:
- `id` (string, required): Cluster ID

**Response Schema**:
```typescript
{
  clusterId: string;
  currentHeat: number;
  predictions: Array<{
    hoursAhead: number;
    predictedHeat: number;
    confidence: number;                // 0-1
    upperBound: number;
    lowerBound: number;
  }>;
  trajectory: 'SPIKING' | 'GROWING' | 'STABLE' | 'DECAYING' | 'CRASHING';
  confidence: number;
  predictedAt: string;
  factors: {
    trendDirection: number;           // -1 to 1
    volatility: number;               // 0 to 1
    momentum: number;                 // -1 to 1
    stageOfLifecycle: string;         // 'EMERGING' | 'PEAK' | 'DECAYING' | 'GROWING' | 'STABLE'
  };
}
```

**Example Response**:
```json
{
  "clusterId": "crypto_btc_halving_2024",
  "currentHeat": 85.2,
  "predictions": [
    {
      "hoursAhead": 1,
      "predictedHeat": 92.5,
      "confidence": 0.85,
      "upperBound": 98.3,
      "lowerBound": 86.7
    },
    {
      "hoursAhead": 6,
      "predictedHeat": 88.3,
      "confidence": 0.72,
      "upperBound": 102.1,
      "lowerBound": 74.5
    },
    {
      "hoursAhead": 24,
      "predictedHeat": 65.2,
      "confidence": 0.58,
      "upperBound": 89.7,
      "lowerBound": 40.7
    }
  ],
  "trajectory": "SPIKING",
  "confidence": 0.72,
  "predictedAt": "2024-01-15T12:00:00Z",
  "factors": {
    "trendDirection": 0.65,
    "volatility": 0.42,
    "momentum": 0.58,
    "stageOfLifecycle": "EMERGING"
  }
}
```

**Error Codes**:
- `404`: Cluster not found
- `500`: Internal server error

---

### GET /api/news/predictions

Get batch predictions for multiple clusters.

**Query Parameters**:
- `limit` (integer, optional): Maximum predictions (default: 50, max: 100)
- `hours` (integer, optional): Time window (default: 24, max: 168)

**Response Schema**:
```typescript
{
  predictions: Array<{
    clusterId: string;
    currentHeat: number;
    predictions: Array<{
      hoursAhead: number;
      predictedHeat: number;
      confidence: number;
      upperBound: number;
      lowerBound: number;
    }>;
    trajectory: 'SPIKING' | 'GROWING' | 'STABLE' | 'DECAYING' | 'CRASHING';
    confidence: number;
    predictedAt: string;
    factors: {
      trendDirection: number;
      volatility: number;
      momentum: number;
      stageOfLifecycle: string;
    };
  }>;
  count: number;
  window: string;
}
```

**Example Response**:
```json
{
  "predictions": [
    {
      "clusterId": "crypto_btc_halving_2024",
      "currentHeat": 85.2,
      "predictions": [
        {
          "hoursAhead": 1,
          "predictedHeat": 92.5,
          "confidence": 0.85,
          "upperBound": 98.3,
          "lowerBound": 86.7
        }
      ],
      "trajectory": "SPIKING",
      "confidence": 0.72,
      "predictedAt": "2024-01-15T12:00:00Z",
      "factors": {
        "trendDirection": 0.65,
        "volatility": 0.42,
        "momentum": 0.58,
        "stageOfLifecycle": "EMERGING"
      }
    }
  ],
  "count": 50,
  "window": "24h"
}
```

**Error Codes**:
- `500`: Internal server error

---

### GET /api/news/predictions/spikes

Get clusters with predicted heat spikes.

**Query Parameters**:
- `limit` (integer, optional): Maximum spikes (default: 20, max: 50)
- `hours` (integer, optional): Time window (default: 24, max: 168)
- `threshold` (number, optional): Minimum increase threshold (default: 0.3 = 30%)

**Response Schema**:
```typescript
{
  spikes: Array<{
    clusterId: string;
    currentHeat: number;
    predictions: Array<{
      hoursAhead: number;
      predictedHeat: number;
      confidence: number;
      upperBound: number;
      lowerBound: number;
    }>;
    trajectory: 'SPIKING' | 'GROWING' | 'STABLE' | 'DECAYING' | 'CRASHING';
    confidence: number;
    predictedAt: string;
    factors: {
      trendDirection: number;
      volatility: number;
      momentum: number;
      stageOfLifecycle: string;
    };
  }>;
  count: number;
  threshold: number;
  window: string;
}
```

**Example Response**:
```json
{
  "spikes": [
    {
      "clusterId": "crypto_btc_halving_2024",
      "currentHeat": 85.2,
      "predictions": [
        {
          "hoursAhead": 1,
          "predictedHeat": 110.8,
          "confidence": 0.85,
          "upperBound": 118.2,
          "lowerBound": 103.4
        }
      ],
      "trajectory": "SPIKING",
      "confidence": 0.72,
      "predictedAt": "2024-01-15T12:00:00Z",
      "factors": {
        "trendDirection": 0.65,
        "volatility": 0.42,
        "momentum": 0.58,
        "stageOfLifecycle": "EMERGING"
      }
    }
  ],
  "count": 5,
  "threshold": 0.3,
  "window": "24h"
}
```

**Error Codes**:
- `500`: Internal server error

---

## Enhancement 7: User Personalization

### POST /api/user/engagement

Record user engagement event.

**Request Body**:
```typescript
{
  userId: string;                      // User identifier
  clusterId: string;                   // Cluster ID
  engagementType: 'VIEW' | 'CLICK' | 'SHARE' | 'SAVE' | 'DISMISS';
  durationMs?: number;                 // Optional engagement duration
}
```

**Example Request**:
```json
{
  "userId": "user_12345",
  "clusterId": "crypto_btc_halving_2024",
  "engagementType": "CLICK",
  "durationMs": 15000
}
```

**Response Schema**:
```typescript
{
  success: boolean;
}
```

**Example Response**:
```json
{
  "success": true
}
```

**Error Codes**:
- `400`: Missing required fields
- `500`: Internal server error

---

### GET /api/user/:userId/engagement

Get user engagement history.

**Path Parameters**:
- `userId` (string, required): User identifier

**Query Parameters**:
- `limit` (integer, optional): Maximum records (default: 100, max: 500)
- `clusterId` (string, optional): Filter by specific cluster

**Response Schema**:
```typescript
{
  userId: string;
  engagement: Array<{
    id: number;
    userId: string;
    clusterId: string;
    engagementType: 'VIEW' | 'CLICK' | 'SHARE' | 'SAVE' | 'DISMISS';
    durationMs?: number;
    timestamp: string;
  }>;
  count: number;
}
```

**Example Response**:
```json
{
  "userId": "user_12345",
  "engagement": [
    {
      "id": 1,
      "userId": "user_12345",
      "clusterId": "crypto_btc_halving_2024",
      "engagementType": "CLICK",
      "durationMs": 15000,
      "timestamp": "2024-01-15T12:00:00Z"
    },
    {
      "id": 2,
      "userId": "user_12345",
      "clusterId": "stocks_nvidia_earnings",
      "engagementType": "SHARE",
      "timestamp": "2024-01-15T11:45:00Z"
    }
  ],
  "count": 2
}
```

**Error Codes**:
- `500`: Internal server error

---

### GET /api/user/:userId/preferences

Get user category preferences.

**Path Parameters**:
- `userId` (string, required): User identifier

**Response Schema**:
```typescript
{
  userId: string;
  preferences: Array<{
    userId: string;
    category: string;
    weight: number;                    // Preference weight
    lastUpdated: string;
  }>;
  count: number;
}
```

**Example Response**:
```json
{
  "userId": "user_12345",
  "preferences": [
    {
      "userId": "user_12345",
      "category": "CRYPTO",
      "weight": 0.85,
      "lastUpdated": "2024-01-15T12:00:00Z"
    },
    {
      "userId": "user_12345",
      "category": "STOCKS",
      "weight": 0.72,
      "lastUpdated": "2024-01-15T12:00:00Z"
    }
  ],
  "count": 2
}
```

**Error Codes**:
- `500`: Internal server error

---

### GET /api/user/:userId/recommendations

Get personalized cluster recommendations.

**Path Parameters**:
- `userId` (string, required): User identifier

**Query Parameters**:
- `limit` (integer, optional): Maximum recommendations (default: 20, max: 50)
- `hours` (integer, optional): Time window (default: 24, max: 168)

**Response Schema**:
```typescript
{
  userId: string;
  clusters: Array<{
    id: string;
    category: string;
    topicKey: string;
    heatScore: number;
    articleCount: number;
    [other cluster fields...]
  }>;
  count: number;
  window: string;
}
```

**Example Response**:
```json
{
  "userId": "user_12345",
  "clusters": [
    {
      "id": "crypto_btc_halving_2024",
      "category": "CRYPTO",
      "topicKey": "btc_halving",
      "heatScore": 85.2,
      "articleCount": 42
    },
    {
      "id": "crypto_eth_upgrade",
      "category": "CRYPTO",
      "topicKey": "eth_upgrade",
      "heatScore": 72.8,
      "articleCount": 35
    }
  ],
  "count": 20,
  "window": "24h"
}
```

**Error Codes**:
- `500`: Internal server error

---

### POST /api/user/:userId/train

Train user preferences from engagement history.

**Path Parameters**:
- `userId` (string, required): User identifier

**Response Schema**:
```typescript
{
  success: boolean;
  message: string;
}
```

**Example Response**:
```json
{
  "success": true,
  "message": "Category preferences trained"
}
```

**Error Codes**:
- `500`: Internal server error

---

### GET /api/user/:userId/stats

Get user statistics.

**Path Parameters**:
- `userId` (string, required): User identifier

**Query Parameters**:
- `days` (integer, optional): Time window in days (default: 7, max: 90)

**Response Schema**:
```typescript
{
  userId: string;
  window: string;
  stats: {
    totalEngagements: number;
    engagementByType: {
      VIEW: number;
      CLICK: number;
      SHARE: number;
      SAVE: number;
      DISMISS: number;
    };
    avgEngagementDurationMs: number;
    topCategories: Array<{
      category: string;
      engagementCount: number;
    }>;
    uniqueClustersViewed: number;
    retentionRate: number;
  };
}
```

**Example Response**:
```json
{
  "userId": "user_12345",
  "window": "7d",
  "stats": {
    "totalEngagements": 156,
    "engagementByType": {
      "VIEW": 85,
      "CLICK": 42,
      "SHARE": 18,
      "SAVE": 8,
      "DISMISS": 3
    },
    "avgEngagementDurationMs": 28450,
    "topCategories": [
      {
        "category": "CRYPTO",
        "engagementCount": 68
      },
      {
        "category": "STOCKS",
        "engagementCount": 45
      }
    ],
    "uniqueClustersViewed": 52,
    "retentionRate": 0.78
  }
}
```

**Error Codes**:
- `500`: Internal server error

---

## Enhancement 9: Anomaly Detection

### GET /api/news/anomalies

Get anomalies across all clusters.

**Query Parameters**:
- `hours` (integer, optional): Time window (default: 24, max: 168)
- `severity` (string, optional): Minimum severity (default: 'LOW')

**Response Schema**:
```typescript
{
  anomalies: Array<{
    clusterId: string;
    type: 'SUDDEN_SPIKE' | 'SUDDEN_DROP' | 'VELOCITY_ANOMALY' | 'CROSS_SYNDICATION';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    zScore: number;
    currentValue: number;
    expectedRange: [number, number];
    detectedAt: string;
    description: string;
  }>;
  count: number;
  window: string;
}
```

**Example Response**:
```json
{
  "anomalies": [
    {
      "clusterId": "crypto_btc_halving_2024",
      "type": "SUDDEN_SPIKE",
      "severity": "HIGH",
      "zScore": 4.2,
      "currentValue": 125.8,
      "expectedRange": [65.2, 85.7],
      "detectedAt": "2024-01-15T12:00:00Z",
      "description": "Heat spike detected: 125.8 is 4.2σ above mean 78.5"
    },
    {
      "clusterId": "stocks_nvidia_earnings",
      "type": "VELOCITY_ANOMALY",
      "severity": "MEDIUM",
      "zScore": 2.8,
      "currentValue": 72.3,
      "expectedRange": [45.6, 68.2],
      "detectedAt": "2024-01-15T11:45:00Z",
      "description": "Velocity anomaly: 18.5/hr is 2.8σ from mean 6.2/hr"
    }
  ],
  "count": 2,
  "window": "24h"
}
```

**Error Codes**:
- `500`: Internal server error

---

### GET /api/news/clusters/:id/anomalies

Get anomalies for a specific cluster.

**Path Parameters**:
- `id` (string, required): Cluster ID

**Response Schema**:
```typescript
{
  clusterId: string;
  anomalies: Array<{
    type: 'SUDDEN_SPIKE' | 'SUDDEN_DROP' | 'VELOCITY_ANOMALY' | 'CROSS_SYNDICATION';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    zScore: number;
    currentValue: number;
    expectedRange: [number, number];
    detectedAt: string;
    description: string;
  }>;
  count: number;
}
```

**Example Response**:
```json
{
  "clusterId": "crypto_btc_halving_2024",
  "anomalies": [
    {
      "type": "SUDDEN_SPIKE",
      "severity": "HIGH",
      "zScore": 4.2,
      "currentValue": 125.8,
      "expectedRange": [65.2, 85.7],
      "detectedAt": "2024-01-15T12:00:00Z",
      "description": "Heat spike detected: 125.8 is 4.2σ above mean 78.5"
    }
  ],
  "count": 1
}
```

**Error Codes**:
- `404`: Cluster not found
- `500`: Internal server error

---

## Enhancement 10: Performance Monitoring

### GET /api/news/quality-metrics

Get clustering quality metrics.

**Query Parameters**:
- `hours` (integer, optional): Time window (default: 24, max: 168)

**Response Schema**:
```typescript
{
  window: string;
  metrics: {
    precision?: number;
    recall?: number;
    cohesion?: number;
    separation?: number;
    f1Score?: number;
    categoryMetrics?: {
      [category: string]: {
        precision?: number;
        recall?: number;
        cohesion?: number;
        separation?: number;
      };
    };
  };
}
```

**Example Response**:
```json
{
  "window": "24h",
  "metrics": {
    "precision": 0.87,
    "recall": 0.82,
    "cohesion": 0.79,
    "separation": 0.84,
    "f1Score": 0.84,
    "categoryMetrics": {
      "CRYPTO": {
        "precision": 0.91,
        "recall": 0.88,
        "cohesion": 0.85,
        "separation": 0.89
      },
      "STOCKS": {
        "precision": 0.84,
        "recall": 0.79,
        "cohesion": 0.76,
        "separation": 0.82
      }
    }
  }
}
```

**Error Codes**:
- `500`: Internal server error

---

### GET /api/news/circuit-breakers-health

Get circuit breaker health status.

**Query Parameters**: None

**Response Schema**:
```typescript
{
  overall: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  breakers: Array<{
    name: string;
    state: 'OPEN' | 'CLOSED';
    lastFailureAt?: string;
    failureCount: number;
  }>;
  openCount: number;
  totalCount: number;
}
```

**Example Response**:
```json
{
  "overall": "HEALTHY",
  "breakers": [
    {
      "name": "hyperliquid-api",
      "state": "CLOSED",
      "lastFailureAt": null,
      "failureCount": 0
    },
    {
      "name": "search-server",
      "state": "CLOSED",
      "lastFailureAt": "2024-01-15T10:30:00Z",
      "failureCount": 2
    },
    {
      "name": "embedding-service",
      "state": "OPEN",
      "lastFailureAt": "2024-01-15T11:45:00Z",
      "failureCount": 5
    }
  ],
  "openCount": 1,
  "totalCount": 3
}
```

**Error Codes**:
- `500`: Internal server error

---

## Common Error Responses

All endpoints may return these common errors:

### 400 Bad Request
```json
{
  "error": "Bad request message here"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting

API endpoints are rate-limited as follows:

| Endpoint | Rate Limit | Burst |
|----------|------------|-------|
| Heat History | 60 req/min | 10 |
| Predictions | 30 req/min | 5 |
| Anomalies | 60 req/min | 10 |
| User Engagement | 120 req/min | 20 |
| All other endpoints | 100 req/min | 15 |

**Rate Limit Headers**:
- `X-RateLimit-Limit`: Request limit per minute
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Unix timestamp when limit resets

---

## Pagination

For endpoints returning lists (e.g., `/api/news/clusters/ranked`):

**Query Parameters**:
- `limit`: Maximum items to return (enforced per endpoint)
- `offset`: Starting offset (not currently implemented, reserved for future use)

**Response Headers**:
- `X-Total-Count`: Total number of items available
- `X-Page-Limit`: Maximum items per page

---

## Authentication

Currently, the API does not require authentication for read operations. Write operations (POST, PUT) may require authentication in future versions.

**Future Authentication Header**:
```
Authorization: Bearer <api_key>
```

---

## WebSocket Events

For real-time updates, connect to the WebSocket endpoint:

**WebSocket URL**: `ws://0.0.0.0:3000/ws`

**Supported Events**:
- `cluster:update`: Cluster heat update
- `anomaly:detect`: New anomaly detected
- `entity:trend`: Entity trend update
- `prediction:update`: Heat prediction update

**Example WebSocket Message**:
```json
{
  "type": "cluster:update",
  "data": {
    "clusterId": "crypto_btc_halving_2024",
    "heatScore": 92.5,
    "timestamp": "2024-01-15T12:00:00Z"
  }
}
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const client = axios.create({
  baseURL: 'http://0.0.0.0:3000',
  timeout: 10000
});

// Get heat predictions
async function getPredictions() {
  const response = await client.get('/api/news/predictions', {
    params: { limit: 20, hours: 24 }
  });
  return response.data;
}

// Record engagement
async function recordEngagement(userId, clusterId, type) {
  const response = await client.post('/api/user/engagement', {
    userId,
    clusterId,
    engagementType: type
  });
  return response.data;
}
```

### Python

```python
import requests

BASE_URL = 'http://0.0.0.0:3000'

def get_predictions(limit=20, hours=24):
    response = requests.get(f'{BASE_URL}/api/news/predictions', params={
        'limit': limit,
        'hours': hours
    })
    return response.json()

def record_engagement(user_id, cluster_id, engagement_type):
    response = requests.post(f'{BASE_URL}/api/user/engagement', json={
        'userId': user_id,
        'clusterId': cluster_id,
        'engagementType': engagement_type
    })
    return response.json()
```

---

## Changelog

### Version 1.0.0 (2024-01-15)
- Initial release of all 10 enhancement endpoints
- Complete API documentation
- WebSocket support for real-time updates

---

## Support

For issues or questions:
- Check the logs: `journalctl -u perps-dashboard -f`
- Review this documentation
- Contact the development team
