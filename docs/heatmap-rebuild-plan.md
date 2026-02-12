# Heatmap System Rebuild Documentation

## Current System Analysis (Pre-Rebuild)

### Existing Tables
1. **news_articles** - Main article storage with `market_links` column (JSON array)
2. **story_clusters** - Topic-based clusters with heat scores
3. **cluster_articles** - Many-to-many linking
4. **named_entities** - Entity extraction (people, orgs, tokens)
5. **entity_article_links** - Links entities to articles
6. **cluster_heat_history** - Time-series heat tracking

### Current Limitations
- Categories are generic: CRYPTO, STOCKS, ECONOMICS, GEOPOLITICS, TECH, etc.
- No direct mapping to tradeable markets
- Market links stored as JSON in articles but not systematically linked
- Heatmap shows topic clusters, not market activity

### Files to Replace/Modify
1. `/src/data/story-cluster-store.ts` - Add market linking
2. `/src/data/news-store.ts` - Enhance market extraction
3. `/src/news-agent/enhanced-story-cluster-node.ts` - Add market mention extraction
4. `/src/dashboard/dashboard-server.ts` - Add new API routes
5. `/dashboard/public/enhanced-heatmap.html` - Replace with new visualizations
6. `/dashboard/public/js/enhanced-heatmap.js` - Replace with market-based JS

## New System Design

### Core Tables
1. **markets** - Master list of tradeable markets
2. **market_mentions** - Article-market linking with relevance scores
3. **market_heat** - Time-series heat per market
4. **market_categories** - Grouping (Politics, Crypto, Sports, etc.)

### Market Sources
- **Hyperliquid**: Top 50 coins by volume
- **Polymarket**: Active prediction markets

### Visualization Types
1. **Bubble Map**: X=category, Y=volume, size=article count, color=sentiment
2. **Heatmap Grid**: Markets × Time periods, color intensity = activity + sentiment

## Migration Strategy
1. Create new tables alongside existing ones
2. Backfill market data from existing articles
3. Update news processing pipeline
4. Build new visualizations
5. Deprecate old tables (soft delete first)
