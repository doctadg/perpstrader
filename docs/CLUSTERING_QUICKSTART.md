# Quick Start Guide - Enhanced Clustering

## Overview
This guide helps you get started with the improved semantic clustering system.

## What's New

### 1. Title Semantic Clustering
- **File:** `src/shared/title-semantic-clustering.ts`
- **Purpose:** Groups similar titles using multi-factor similarity
- **Key Features:**
  - Entity overlap detection (40% weight)
  - Topic similarity (35% weight)
  - Phrase overlap (25% weight)
  - LRU caching for performance

### 2. Enhanced Entity Extraction
- **File:** `src/news-agent/enhanced-entity-extraction.ts`
- **Purpose:** Better entity recognition with 100+ patterns
- **Key Features:**
  - Hybrid extraction (regex + LLM)
  - 10 entity types supported
  - Confidence scoring

### 3. Semantic Similarity Service
- **File:** `src/news-agent/semantic-similarity.ts`
- **Purpose:** Advanced article similarity calculation
- **Key Features:**
  - Cosine similarity on embeddings
  - Entity-based similarity with type weights
  - Batch processing

### 4. Enhanced Story Cluster Node v2
- **File:** `src/news-agent/enhanced-story-cluster-node.ts`
- **Purpose:** Improved clustering pipeline
- **Key Features:**
  - Title pre-clustering phase
  - Semantic similarity fallback
  - New metrics tracking

## Quick Setup

### 1. Environment Variables
Add to your `.env` file:

```bash
# Enable enhanced semantic clustering (default: true)
USE_ENHANCED_SEMANTIC_CLUSTERING=true

# Optional: Enable LLM-based similarity
USE_LLM_SIMILARITY=false

# Updated thresholds for better recall
NEWS_VECTOR_DISTANCE_THRESHOLD=0.65
CLUSTER_MERGE_SIMILARITY_THRESHOLD=0.80
```

### 2. Restart Services

```bash
cd /home/d/PerpsTrader
./scripts/perps-control restart news-agent
```

### 3. Verify Operation

Check logs for clustering metrics:
```bash
tail -f news-agent.log | grep "EnhancedClusterNode"
```

Expected output:
```
[EnhancedClusterNode] Processing 150 articles with enhanced clustering (v2.0)...
[EnhancedClusterNode] Created 42 title-based clusters
[EnhancedClusterNode] Clustering complete: 15 new, 127 existing, 3 merged, 89 semantic, 2 anomalies, 18 predictions
```

## Configuration Options

### Similarity Thresholds

| Threshold | Default | Description |
|-----------|---------|-------------|
| `TITLE_SIMILARITY_THRESHOLD` | 0.70 | Min similarity for title clustering |
| `SEMANTIC_SIMILARITY_THRESHOLD` | 0.65 | Min similarity for semantic matching |
| `VECTOR_SIMILARITY_THRESHOLD` | 0.65 | Min similarity for vector search |
| `KEYWORD_SIMILARITY_THRESHOLD` | 0.55 | Min similarity for keyword fallback |
| `CLUSTER_MERGE_SIMILARITY_THRESHOLD` | 0.80 | Min similarity for cluster merging |

### Caching

All services use LRU caching:
- Title analysis: 1000 entries
- Embeddings: 1000 entries
- LLM responses: 500 entries

Clear caches if needed:
```typescript
titleSemanticClustering.clearCache();
semanticSimilarityService.clearCache();
enhancedEntityExtractor.clearCache();
```

## Testing

### Run Benchmarks

```bash
cd /home/d/PerpsTrader
npx ts-node scripts/benchmark-clustering.ts
```

### Manual Testing

Test title similarity:
```typescript
import titleSemanticClustering from './src/shared/title-semantic-clustering';

const result = await titleSemanticClustering.calculateSimilarity(
  "Bitcoin Surges Past $45,000 as ETF Inflows Continue",
  "BTC Breaks $45K Barrier Amid Strong ETF Demand"
);
console.log(result.similarityScore); // Expected: > 0.80
```

Test entity extraction:
```typescript
import enhancedEntityExtractor from './src/news-agent/enhanced-entity-extraction';

const result = await enhancedEntityExtractor.extractHybrid(
  "Bitcoin ETF Gets SEC Approval",
  undefined,
  "article-123"
);
console.log(result.entities); // Expected: Bitcoin (TOKEN), ETF (EVENT), SEC (GOVERNMENT_BODY)
```

## Monitoring

### New Metrics

The enhanced clustering tracks additional metrics:

```typescript
stats: {
  totalProcessed: number;
  newClusters: number;
  existingClusters: number;
  mergedClusters: number;
  entitiesExtracted: number;
  anomaliesDetected: number;
  predictionsGenerated: number;
  titleClustersCreated: number;  // NEW
  semanticMatches: number;        // NEW
}
```

### Key Performance Indicators

Monitor these in your logs:

1. **Title Clustering Efficiency**
   - `titleClustersCreated` vs `totalProcessed`
   - Target: 20-40% of article count

2. **Semantic Matching Rate**
   - `semanticMatches` vs `existingClusters`
   - Target: > 30% of assignments

3. **Entity Extraction**
   - `entitiesExtracted` vs `totalProcessed`
   - Target: > 3 entities per article

## Troubleshooting

### Issue: Low semantic match rate

**Symptoms:** `semanticMatches` is very low (< 10%)

**Solutions:**
1. Lower `SEMANTIC_SIMILARITY_THRESHOLD` to 0.60
2. Check OpenRouter API connectivity
3. Verify embedding generation is working

### Issue: Too many clusters

**Symptoms:** `titleClustersCreated` equals `totalProcessed`

**Solutions:**
1. Lower `TITLE_SIMILARITY_THRESHOLD` to 0.65
2. Check if titles are truly unique
3. Verify entity extraction is working

### Issue: Slow clustering

**Symptoms:** Clustering takes > 60 seconds

**Solutions:**
1. Increase `CLUSTER_BATCH_SIZE` to 50
2. Disable `USE_LLM_SIMILARITY` (if enabled)
3. Check Redis cache performance

### Issue: Memory usage high

**Symptoms:** Node memory > 500MB

**Solutions:**
1. Clear caches periodically
2. Reduce cache sizes in code
3. Process smaller batches

## Rollback

If issues occur, rollback to original:

```bash
cd /home/d/PerpsTrader
cp src/news-agent/enhanced-story-cluster-node-original.ts src/news-agent/enhanced-story-cluster-node.ts
npm run build
./scripts/perps-control restart news-agent
```

## Performance Expectations

### Timing
- Title similarity: ~15ms per comparison
- Semantic similarity: ~50ms per comparison
- Entity extraction: ~25ms per article
- Full clustering: ~2-5 seconds per 100 articles

### Accuracy
- Title clustering: ~85% accuracy
- Entity extraction: ~4 entities per article
- Cluster consolidation: 3.5:1 reduction ratio

## Support

For issues or questions:
1. Check logs: `news-agent.log`
2. Run benchmark: `scripts/benchmark-clustering.ts`
3. Review documentation: `docs/CLUSTERING_IMPROVEMENTS.md`
4. Check original spec: `ENHANCEMENTS-COMPLETE.md`
