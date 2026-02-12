# News-to-Polymarket Correlation Algorithm Design

## Executive Summary

This document outlines the core correlation system for matching news articles to relevant Polymarket prediction markets. The system uses a hybrid approach combining semantic embeddings with LLM-based reasoning to achieve high-precision matching.

---

## 1. Matching Algorithm Architecture

### 1.1 Embedding Strategy: Multi-Field Weighted Ensemble

**Why not just title-to-title matching?**
- News titles can be sensationalized while market questions are factual
- Market descriptions contain critical resolution criteria not in the title
- Full article content may contain relevant entities/events not in headlines

**Proposed Approach: Hierarchical Embedding Strategy**

```
┌─────────────────────────────────────────────────────────────┐
│                  ARTICLE REPRESENTATION                      │
├─────────────────────────────────────────────────────────────┤
│  Field              │ Weight │ Embedding Model              │
├─────────────────────┼────────┼──────────────────────────────┤
│  Title              │  0.30  │ text-embedding-3-small       │
│  Summary            │  0.35  │ text-embedding-3-small       │
│  Key Entities       │  0.20  │ text-embedding-3-small       │
│  Category/Tags      │  0.15  │ Categorical encoding         │
└─────────────────────────────────────────────────────────────┘
```

**Entity Extraction Pipeline:**
1. Named Entity Recognition (NER) on article content
2. Extract: Person names, organizations, locations, events, key nouns
3. Generate "entity signature": "Trump; 2024 Election; Georgia; Ballot"
4. Embed entity signature separately

**Market Representation:**
```
┌─────────────────────────────────────────────────────────────┐
│                  MARKET REPRESENTATION                       │
├─────────────────────────────────────────────────────────────┤
│  Field              │ Weight │ Notes                        │
├─────────────────────┼────────┼──────────────────────────────┤
│  Question           │  0.40  │ Primary semantic signal      │
│  Description        │  0.30  │ Resolution criteria context  │
│  Category           │  0.15  │ Hard constraint filter       │
│  Tags               │  0.15  │ Keyword boost                │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Similarity Metric: Hybrid Scoring Function

**Phase 1: Pre-Filtering (Fast, Rule-Based)**
```python
def prefilter_markets(article, markets):
    """
    Eliminate obviously irrelevant markets before embedding comparison.
    """
    candidates = []
    for market in markets:
        # Hard constraints
        if market.status != "OPEN":
            continue
        if market.end_date < now + MIN_TIME_WINDOW:  # Market closing soon
            continue
            
        # Category matching (soft filter)
        category_score = category_overlap(article.categories, market.category)
        if category_score < 0.3:
            continue
            
        # Entity overlap check
        if not entity_overlap(article.entities, market.question + market.description):
            continue
            
        candidates.append(market)
    
    return candidates[:MAX_CANDIDATES]  # Top 50 for embedding comparison
```

**Phase 2: Embedding Similarity (Semantic)**
```python
def compute_semantic_score(article, market):
    """
    Weighted cosine similarity across multiple field embeddings.
    """
    # Cosine similarities per field pair
    title_sim = cosine_sim(article.title_emb, market.question_emb)
    summary_sim = cosine_sim(article.summary_emb, market.desc_emb)
    entity_sim = cosine_sim(article.entity_emb, market.question_emb)
    
    # Weighted combination
    semantic_score = (
        0.40 * title_sim +
        0.35 * summary_sim +
        0.25 * entity_sim
    )
    
    return semantic_score
```

**Phase 3: Keyword Boost (Lexical)**
```python
def compute_keyword_score(article, market):
    """
    BM25-style keyword matching for entity names and key terms.
    """
    article_terms = set(tokenize(article.title + " " + article.summary))
    market_terms = set(tokenize(market.question + " " + market.description))
    
    overlap = len(article_terms & market_terms)
    union = len(article_terms | market_terms)
    
    jaccard = overlap / union if union > 0 else 0
    
    # Boost for exact entity name matches
    entity_boost = sum(1 for e in article.entities if e.lower() in market.question.lower())
    
    return 0.7 * jaccard + 0.3 * min(entity_boost * 0.2, 1.0)
```

**Phase 4: Temporal Relevance Scoring**
```python
def compute_temporal_score(article, market):
    """
    Time-decay function based on market end date vs article date.
    """
    days_to_close = (market.end_date - article.published_date).days
    
    # Markets closing within 7 days get boost (urgency factor)
    if 0 < days_to_close <= 7:
        return 1.0 + (7 - days_to_close) * 0.05  # 1.0 to 1.35
    
    # Markets closing in 8-30 days
    elif 7 < days_to_close <= 30:
        return 1.0
    
    # Markets closing > 30 days get slight penalty (lower relevance)
    elif days_to_close > 30:
        return max(0.7, 1.0 - (days_to_close - 30) / 100)
    
    # Already closed or closing today
    else:
        return 0.0  # Filter out
```

**Final Hybrid Score:**
```python
def compute_final_score(article, market):
    semantic = compute_semantic_score(article, market)
    keyword = compute_keyword_score(article, market)
    temporal = compute_temporal_score(article, market)
    
    # Hybrid: 70% semantic, 20% keyword, 10% temporal modifier
    combined = (0.70 * semantic + 0.20 * keyword) * temporal
    
    return combined
```

### 1.3 Confidence Scoring Methodology

**Confidence Tiers:**

| Tier | Score Range | Interpretation | Action |
|------|-------------|----------------|--------|
| **HIGH** | ≥ 0.85 | Strong semantic match + entity overlap | Auto-accept, alert trader |
| **MEDIUM** | 0.70 - 0.85 | Good match, needs verification | Send to LLM for review |
| **LOW** | 0.55 - 0.70 | Weak signal, possible relevance | Send to LLM with low-priority flag |
| **NONE** | < 0.55 | No meaningful correlation | Discard |

**Confidence Components:**
```python
class ConfidenceMetrics:
    """
    Multi-factor confidence breakdown for explainability.
    """
    semantic_confidence: float      # Raw embedding similarity
    entity_overlap_ratio: float     # % of article entities in market
    category_alignment: float       # Category match score
    temporal_urgency: float         # Time-to-close factor
    keyword_density: float          # Shared term density
    
    @property
    def overall(self) -> float:
        # Weighted average with semantic as anchor
        return (
            0.35 * self.semantic_confidence +
            0.25 * self.entity_overlap_ratio +
            0.20 * self.category_alignment +
            0.10 * self.temporal_urgency +
            0.10 * self.keyword_density
        )
```

---

## 2. LLM Prompt Strategy

### 2.1 Prompt Architecture

**System Prompt:**
```
You are a financial news analyst specializing in prediction markets. Your task is to 
determine if a news article is directly relevant to a specific Polymarket prediction 
market question.

Guidelines:
- Focus on CAUSAL relationships: Does this news directly impact the market outcome?
- Ignore tangential connections or general topic overlap
- Consider timing: Is this news actionable for the market?
- Be conservative: When in doubt, mark as NOT_RELEVANT

Response must be valid JSON with no markdown formatting.
```

**User Prompt Template:**
```json
{
  "task": "Evaluate news-to-market relevance",
  "article": {
    "title": "{{article.title}}",
    "summary": "{{article.summary}}",
    "published": "{{article.published_date}}",
    "categories": {{article.categories}},
    "key_entities": {{article.extracted_entities}}
  },
  "candidate_markets": [
    {
      "rank": 1,
      "market_id": "{{market.id}}",
      "question": "{{market.question}}",
      "description": "{{market.description}}",
      "category": "{{market.category}}",
      "end_date": "{{market.end_date}}",
      "semantic_score": {{market.semantic_score}}
    }
    // ... top 3-5 candidates
  ],
  "evaluation_criteria": {
    "relevance_threshold": "News must directly impact market outcome probability",
    "temporal_requirement": "Market must remain open for at least 24h after news",
    "causal_requirement": "News must provide information that changes market odds"
  }
}
```

### 2.2 Response Format (Structured JSON)

```json
{
  "evaluation": {
    "primary_match": {
      "market_id": "0x1234...",
      "relevance_verdict": "RELEVANT|NOT_RELEVANT|UNCERTAIN",
      "confidence": 0.92,
      "reasoning": "Article announces FDA approval which directly resolves the market question about drug approval by March 31."
    },
    "secondary_matches": [
      {
        "market_id": "0x5678...",
        "relevance_verdict": "TANGENTIAL",
        "reasoning": "Related topic but does not directly impact outcome."
      }
    ],
    "risk_flags": [
      "AMBIGUOUS_RESOLUTION_CRITERIA",
      "TEMPORAL_MISMATCH"
    ]
  },
  "metadata": {
    "evaluation_timestamp": "2026-02-03T19:11:00Z",
    "model_version": "openai/gpt-4o-mini",
    "processing_time_ms": 850
  }
}
```

### 2.3 Validation & Parsing

```python
from pydantic import BaseModel, Field, validator
from typing import Literal, List, Optional

class MarketEvaluation(BaseModel):
    market_id: str
    relevance_verdict: Literal["RELEVANT", "NOT_RELEVANT", "UNCERTAIN", "TANGENTIAL"]
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning: str = Field(..., min_length=10)

class LLMResponse(BaseModel):
    primary_match: MarketEvaluation
    secondary_matches: List[MarketEvaluation] = []
    risk_flags: List[str] = []
    
    @validator('primary_match')
    def validate_confidence_threshold(cls, v):
        if v.relevance_verdict == "RELEVANT" and v.confidence < 0.7:
            raise ValueError("RELEVANT verdict requires confidence >= 0.7")
        return v

def parse_llm_response(raw_response: str) -> LLMResponse:
    """
    Parse and validate LLM response with error handling.
    """
    # Clean markdown code blocks if present
    cleaned = raw_response.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    
    try:
        data = json.loads(cleaned.strip())
        return LLMResponse(**data)
    except (json.JSONDecodeError, ValidationError) as e:
        logger.error(f"Failed to parse LLM response: {e}")
        raise LLMParsingError(f"Invalid response format: {e}")
```

### 2.4 Fallback Strategy

**Failure Modes & Responses:**

| Failure | Fallback Action |
|---------|-----------------|
| LLM timeout (>10s) | Use embedding-only score if ≥ 0.80, else discard |
| Invalid JSON | Retry once with stricter prompt, else use embedding score |
| Empty/ambiguous response | Flag for human review, store in queue |
| API rate limit | Queue for retry with exponential backoff |
| All candidates rejected | Log for analysis, may indicate poor pre-filtering |

```python
async def evaluate_with_fallback(article, candidates):
    """
    LLM evaluation with comprehensive fallback chain.
    """
    max_retries = 2
    for attempt in range(max_retries):
        try:
            response = await call_openrouter(prompt)
            parsed = parse_llm_response(response)
            return parsed
        except (TimeoutError, LLMParsingError) as e:
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                continue
            
            # Final fallback: use embedding scores
            best_candidate = max(candidates, key=lambda c: c.semantic_score)
            if best_candidate.semantic_score >= 0.80:
                logger.warning(f"LLM failed, using embedding fallback for {article.id}")
                return create_fallback_evaluation(best_candidate)
            else:
                logger.info(f"No strong match found for {article.id}")
                return None
```

---

## 3. Data Pipeline Architecture

### 3.1 Pipeline Trigger Strategy: Hybrid Real-Time + Batch

**Why not purely real-time?**
- LLM calls are expensive ($0.001-0.01 per evaluation)
- Market data changes slowly (minutes/hours, not seconds)
- Batch allows for cross-article entity clustering

**Proposed: Tiered Processing Pipeline**

```
┌─────────────────────────────────────────────────────────────────┐
│                     INGESTION LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  News Ingest ────┐                                               │
│  (WebSocket/     │                                               │
│   Polling)       │    ┌──────────────────┐                      │
│                  ├───▶│  Article Queue   │                      │
│  Article Update ─┤    │  (Redis/RabbitMQ)│                      │
│                  │    └────────┬─────────┘                      │
│  Batch Import ───┘             │                                 │
│                                ▼                                 │
│                    ┌───────────────────────┐                     │
│                    │  Fast Pre-Filter      │                     │
│                    │  (Embedding Search)   │                     │
│                    └───────────┬───────────┘                     │
│                                │                                 │
│              ┌─────────────────┼─────────────────┐               │
│              ▼                 ▼                 ▼               │
│     ┌─────────────┐  ┌──────────────┐  ┌──────────────┐         │
│     │ HIGH CONF   │  │ MEDIUM CONF  │  │ LOW CONF     │         │
│     │ (≥ 0.85)    │  │ (0.70-0.85)  │  │ (0.55-0.70)  │         │
│     └──────┬──────┘  └──────┬───────┘  └──────┬───────┘         │
│            │                │                  │                │
│            ▼                ▼                  ▼                │
│     ┌─────────────┐  ┌──────────────┐  ┌──────────────┐         │
│     │ Auto-Accept │  │ LLM Review   │  │ Discard/Log  │         │
│     │ + Alert     │  │ (Prioritized)│  │              │         │
│     └─────────────┘  └──────────────┘  └──────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Real-Time Path (High Confidence):**
- Trigger: Immediate on article ingest
- Condition: Semantic score ≥ 0.85 AND entity overlap ≥ 0.6
- Action: Store correlation, send alert, skip LLM

**Batch Path (Medium Confidence):**
- Trigger: Every 5 minutes OR queue size ≥ 10
- Process: LLM evaluation of accumulated candidates
- Benefit: Amortize API costs, potential batching optimization

### 3.2 Market Data Caching Strategy

**Cache Architecture:**

```python
class MarketCache:
    """
    Multi-layer cache for Polymarket data.
    """
    
    # L1: In-memory (Python dict) - Current open markets only
    _memory_cache: Dict[str, Market] = {}
    _memory_ttl: int = 300  # 5 minutes
    
    # L2: Redis - Full market index with embeddings
    _redis_client: redis.Redis
    _redis_ttl: int = 3600  # 1 hour
    
    # L3: Vector DB (Pinecone/Weaviate) - Embedding search
    _vector_index: VectorIndex

    async def get_candidate_markets(self, article: Article) -> List[Market]:
        """
        Retrieve candidate markets using cache layers.
        """
        # L1: Check memory for recent markets
        open_markets = [
            m for m in self._memory_cache.values()
            if m.status == "OPEN" and m.end_date > now
        ]
        
        if len(open_markets) < MIN_MARKETS_THRESHOLD:
            # Refresh from L2/L3
            await self._refresh_cache()
        
        # L3: Semantic search for top candidates
        candidates = await self._vector_index.similarity_search(
            query_vector=article.combined_embedding,
            filter={"status": "OPEN", "end_date": {"$gt": now}},
            top_k=50
        )
        
        return candidates
```

**Cache Invalidation Rules:**

| Event | Action |
|-------|--------|
| Market closes | Immediate removal from L1, mark in L2/L3 |
| New market listed | Add to all cache layers, trigger re-evaluation of recent articles |
| Market description updated | Update embeddings, re-evaluate affected correlations |
| Scheduled (every 5 min) | Full L1 refresh, incremental L2 refresh |

### 3.3 Handling Updates & Lifecycle Events

**Article Updates:**
```python
async def handle_article_update(article_id: str, update_type: str):
    """
    Re-evaluate correlations when articles change.
    """
    article = await fetch_article(article_id)
    
    # Invalidate existing correlations
    await invalidate_correlations(article_id)
    
    # Re-run pipeline
    if update_type in ["CONTENT_MAJOR", "CATEGORY_CHANGE"]:
        # Full re-evaluation
        await run_correlation_pipeline(article)
    elif update_type == "METADATA_ONLY":
        # Just update stored metadata
        await update_correlation_metadata(article_id)
```

**Market Lifecycle:**
```python
async def handle_market_event(event: MarketEvent):
    """
    Respond to market state changes.
    """
    if event.type == "MARKET_CLOSED":
        # Archive correlations, send summary
        await archive_correlations(event.market_id)
        await generate_trade_summary(event.market_id)
        
    elif event.type == "MARKET_LISTED":
        # Index new market, check against recent articles (last 24h)
        await index_market(event.market)
        recent_articles = await fetch_articles_since(hours=24)
        await evaluate_against_market(event.market, recent_articles)
        
    elif event.type == "MARKET_RESOLVED":
        # Mark correlations as resolved, calculate accuracy
        await mark_resolved(event.market_id, event.outcome)
        await update_accuracy_metrics(event.market_id)
```

**Backfill Strategy:**
```python
async def backfill_correlations(start_date: datetime, end_date: datetime):
    """
    Batch re-processing for historical analysis or model improvement.
    """
    articles = await fetch_articles_in_range(start_date, end_date)
    
    # Process in batches with rate limiting
    for batch in chunks(articles, size=100):
        tasks = [run_correlation_pipeline(a) for a in batch]
        await asyncio.gather(*tasks)
        await asyncio.sleep(1)  # Rate limit protection
```

---

## 4. Performance & Cost Optimization

### 4.1 Cost Estimates

| Component | Unit Cost | Volume/Month | Monthly Cost |
|-----------|-----------|--------------|--------------|
| Embeddings (OpenAI) | $0.02 / 1M tokens | ~50M tokens | ~$1.00 |
| Vector DB (Pinecone) | $0.10 / 100K vectors | ~1M vectors | ~$1.00 |
| LLM (GPT-4o-mini via OpenRouter) | $0.15 / 1K calls | ~5K calls | ~$0.75 |
| LLM (Fallback to GPT-4o) | $2.50 / 1K calls | ~500 calls | ~$1.25 |
| **TOTAL** | | | **~$4.00/month** |

### 4.2 Optimization Strategies

1. **Embedding Caching**: Cache article embeddings for 24h to handle duplicate ingests
2. **Batch LLM Calls**: Group 3-5 similar articles into single LLM prompt when possible
3. **Smart Pre-filtering**: Aggressive rule-based filtering reduces LLM calls by ~80%
4. **Vector Quantization**: Use binary/INT8 embeddings for initial candidate retrieval

---

## 5. Evaluation & Monitoring

### 5.1 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Precision | > 85% | Manual review of random sample monthly |
| Recall | > 70% | Track % of "obvious" matches caught |
| Latency (p95) | < 3s | End-to-end correlation time |
| LLM Fallback Rate | < 5% | % of evaluations using fallback |
| Cost per Article | < $0.005 | Total pipeline cost / articles processed |

### 5.2 A/B Testing Framework

```python
class CorrelationExperiment:
    """
    Test embedding models, weights, or prompt variations.
    """
    name: str
    treatment_ratio: float = 0.1  # 10% traffic
    
    async def evaluate(self, article: Article):
        if random.random() < self.treatment_ratio:
            return await self.treatment_algorithm(article)
        else:
            return await self.control_algorithm(article)
```

---

## 6. Implementation Roadmap

### Phase 1: MVP (Week 1-2)
- [ ] Basic embedding pipeline (title + summary only)
- [ ] Simple cosine similarity matching
- [ ] Hard threshold (≥ 0.80) without LLM
- [ ] Redis cache for market data

### Phase 2: Enhanced Matching (Week 3-4)
- [ ] Add entity extraction
- [ ] Implement hybrid scoring (semantic + keyword)
- [ ] Add temporal relevance
- [ ] Confidence tier system

### Phase 3: LLM Integration (Week 5-6)
- [ ] OpenRouter integration
- [ ] Structured prompt templates
- [ ] Response validation & fallback chain
- [ ] Batch processing queue

### Phase 4: Production Hardening (Week 7-8)
- [ ] Monitoring & alerting
- [ ] A/B testing framework
- [ ] Backfill tooling
- [ ] Performance optimization

---

## 7. Open Questions

1. **Entity Extraction**: Should we use spaCy, NLTK, or LLM-based NER?
2. **Vector DB**: Pinecone vs Weaviate vs pgvector for self-hosting?
3. **Market Coverage**: Do we need historical market embeddings for analysis?
4. **Multi-language**: Handle non-English news sources?
5. **Real-time Markets**: How to handle rapidly-updating crypto/political markets?

---

*Document Version: 1.0*
*Last Updated: 2026-02-03*
*Author: ML Engineering Subagent*
