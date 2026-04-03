// OpenRouter Service
// Provides embeddings and labeling for news/heatmap system via OpenRouter API
// Primary for news components, with GLM as fallback for trading components
// Enhanced with Redis caching for ultra-fast responses
// Enhanced with circuit breaker + retry with backoff to prevent 429 storms

import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import http from 'http';
import configManager from './config';
import logger from './logger';
import redisCache from './redis-cache';
import { acquireRateLimitSlot, reportRateLimitHit, reportSuccess } from './shared-rate-limiter';
import { getTitleFingerprint } from './title-cleaner';

const config = configManager.get();

// Create shared axios instance with connection pooling for better performance
const axiosInstance: AxiosInstance = axios.create({
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10, maxFreeSockets: 5 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10, maxFreeSockets: 5 }),
});

interface OpenRouterChatResponse {
  choices: { message: { content: string } }[];
}

interface OpenRouterEmbeddingResponse {
  data: [{ embedding: number[] }];
}

interface EventLabelResult {
  topic: string;
  subEventType: string;
  trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  keywords: string[];
}

interface CategorizationResult {
  categories: string[];
  tags: string[];
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary?: string;
  trendTopic?: string;
  trendKeywords?: string[];
}

// ── Circuit Breaker ──────────────────────────────────────────────────────
// Prevents API calls when the endpoint is consistently failing (429s, 5xx).
// After `failureThreshold` consecutive failures, opens for `resetTimeoutMs`.
// Then allows one probe call; if it succeeds, closes again.

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly backoffMultiplier: number;
  private readonly maxResetTimeoutMs: number;
  private nextAttemptTime = 0;
  private readonly name: string;

  constructor(name: string, opts?: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    backoffMultiplier?: number;
    maxResetTimeoutMs?: number;
  }) {
    this.name = name;
    this.failureThreshold = opts?.failureThreshold ?? 5;
    this.resetTimeoutMs = opts?.resetTimeoutMs ?? 30_000;
    this.backoffMultiplier = opts?.backoffMultiplier ?? 2;
    this.maxResetTimeoutMs = opts?.maxResetTimeoutMs ?? 120_000;
  }

  canExecute(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) return false;
      this.state = 'HALF_OPEN';
      logger.info(`[CircuitBreaker:${this.name}] Entering HALF_OPEN — allowing one probe call`);
      return true;
    }
    // HALF_OPEN: allow one call
    return true;
  }

  recordSuccess(): void {
    if (this.state !== 'CLOSED') {
      logger.info(`[CircuitBreaker:${this.name}] Closing — probe succeeded`);
    }
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold) {
      const timeout = Math.min(
        this.resetTimeoutMs * Math.pow(this.backoffMultiplier, Math.floor(this.consecutiveFailures / this.failureThreshold) - 1),
        this.maxResetTimeoutMs
      );
      this.nextAttemptTime = Date.now() + timeout;
      if (this.state !== 'OPEN') {
        logger.warn(
          `[CircuitBreaker:${this.name}] OPENING after ${this.consecutiveFailures} consecutive failures — cooldown ${Math.round(timeout / 1000)}s`
        );
      }
      this.state = 'OPEN';
    }
  }

  getState(): CircuitState { return this.state; }
  getConsecutiveFailures(): number { return this.consecutiveFailures; }
}

class OpenRouterService {
  private baseUrl: string;
  private apiKey: string;
  private labelingModel: string;
  private embeddingModel: string;
  private timeout: number;

  // Cache metrics
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  // Circuit breaker: shared across all API calls in this service
  private circuitBreaker: CircuitBreaker;

  // Retry config
  private static readonly MAX_RETRIES = 5;
  private static readonly RETRY_BASE_DELAY_MS = 1000;
  private static readonly RETRY_MAX_DELAY_MS = 30_000;

  constructor() {
    this.baseUrl = config.openrouter.baseUrl;
    this.apiKey = config.openrouter.apiKey;
    this.labelingModel = config.openrouter.labelingModel;
    this.embeddingModel = config.openrouter.embeddingModel;
    this.timeout = config.openrouter.timeout;
    this.circuitBreaker = new CircuitBreaker('OpenRouter', {
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      maxResetTimeoutMs: 120_000,
    });
  }

  canUseService(): boolean {
    // Check live config as fallback — constructor-captured apiKey can be empty
    // if configManager loaded before dotenv populated process.env
    const key = this.apiKey || configManager.get().openrouter.apiKey;
    return !!key && key.length > 0 && key !== 'your-api-key-here';
  }

  /**
   * Get circuit breaker state for observability
   */
  getCircuitBreakerState(): { state: string; failures: number } {
    return {
      state: this.circuitBreaker.getState(),
      failures: this.circuitBreaker.getConsecutiveFailures(),
    };
  }

  /**
   * Execute an API call with circuit breaker check, retry with exponential backoff,
   * and proper 429 handling using Retry-After header.
   * Returns null if circuit breaker is open or all retries exhausted.
   */
  private async callWithRetry<T>(
    caller: string,
    rateLimitKey: string,
    apiCall: () => Promise<T>
  ): Promise<T | null> {
    // Circuit breaker check
    if (!this.circuitBreaker.canExecute()) {
      logger.warn(
        `[OpenRouter] ${caller}: circuit breaker OPEN — skipping call (failures: ${this.circuitBreaker.getConsecutiveFailures()})`
      );
      return null;
    }

    let lastError: any;

    for (let attempt = 1; attempt <= OpenRouterService.MAX_RETRIES; attempt++) {
      try {
        // Rate limit slot
        await acquireRateLimitSlot(rateLimitKey);

        const result = await apiCall();

        // Success — reset circuit breaker and rate limiter
        this.circuitBreaker.recordSuccess();
        reportSuccess();
        return result;

      } catch (error: any) {
        lastError = error;
        const status = error?.response?.status;

        // Report 429 to shared rate limiter for adaptive backoff
        if (status === 429) {
          const retryAfter = error?.response?.headers?.['retry-after'];
          let retryAfterMs: number | undefined;
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed)) retryAfterMs = parsed < 100 ? parsed * 1000 : parsed;
          }
          reportRateLimitHit(rateLimitKey, retryAfterMs);

          this.circuitBreaker.recordFailure();

          if (attempt < OpenRouterService.MAX_RETRIES) {
            const backoff = retryAfterMs
              || Math.min(
                  OpenRouterService.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500,
                  OpenRouterService.RETRY_MAX_DELAY_MS
                );
            logger.warn(`[OpenRouter] ${caller}: 429 on attempt ${attempt}/${OpenRouterService.MAX_RETRIES}, retrying in ${Math.round(backoff)}ms...`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }

          logger.warn(`[OpenRouter] ${caller}: 429 exhausted all ${OpenRouterService.MAX_RETRIES} retries`);
          return null;
        }

        // Non-429 error: retry with exponential backoff for transient errors
        if (status >= 500 || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ECONNREFUSED') {
          this.circuitBreaker.recordFailure();

          if (attempt < OpenRouterService.MAX_RETRIES) {
            const backoff = Math.min(
              OpenRouterService.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500,
              OpenRouterService.RETRY_MAX_DELAY_MS
            );
            logger.warn(`[OpenRouter] ${caller}: ${status || error?.code} error on attempt ${attempt}/${OpenRouterService.MAX_RETRIES}, retrying in ${Math.round(backoff)}ms...`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
        }

        // Non-retryable error (4xx except 429, or unknown)
        logger.debug(`[OpenRouter] ${caller}: non-retryable error: ${this.safeErrorMessage(error)}`);
        return null;
      }
    }

    logger.warn(`[OpenRouter] ${caller}: all ${OpenRouterService.MAX_RETRIES} retries exhausted: ${this.safeErrorMessage(lastError)}`);
    return null;
  }

  private safeErrorMessage(error: any): string {
    const status = error?.response?.status;
    const apiMessage = error?.response?.data?.error?.message || error?.response?.data?.message;
    const code = error?.code;
    const message = error?.message;
    return [
      status ? `HTTP ${status}` : null,
      code ? `code=${code}` : null,
      apiMessage ? `api=${String(apiMessage)}` : null,
      message ? `msg=${String(message)}` : null,
    ].filter(Boolean).join(' ');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
  }

  /**
   * Generate embeddings for text.
   * DISABLED: z.ai API has no embeddings endpoint, and the old code sent a chat
   * completion request while parsing it as an embedding response — fundamentally broken.
   * All callers already fall back to local SHA256 feature hashing (local-embeddings.ts).
   * Returning null immediately avoids the rate-limit storm (680+ waits/cycle).
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    // z.ai has no embedding endpoint — skip the API call entirely.
    // Callers (news-vector-store, semantic-similarity) already fall back to embedText().
    return null;
  }

  /**
   * Generate event label for a single news article with cache
   * DISABLED: OpenRouter API key is dead (401 User not found).
   * Returns null immediately to avoid retry storms.
   */
  async generateEventLabel(input: {
    title: string;
    content?: string;
    category?: string;
    tags?: string[];
  }): Promise<EventLabelResult | null> {
    // OpenRouter key dead - skip to avoid 401 retry storm
    return null;
  }

  /**
   * Generate event labels for multiple articles with PARALLEL batch processing and Redis cache
   */
  async batchEventLabels(inputs: Array<{
    id: string;
    title: string;
    category?: string;
    tags?: string[];
  }>): Promise<Map<string, EventLabelResult>> {
    // OpenRouter key dead - skip to avoid 401 retry storm
    return new Map();
  }

  /**
   * Process a single batch for categorization with cache
   */
  private async processCategorizationBatch(
    batch: Array<{ id: string; title: string; content?: string; snippet?: string; source?: string }>,
    batchIndex: number
  ): Promise<Map<string, CategorizationResult>> {
    const results = new Map<string, CategorizationResult>();

    // Check cache for all items first
    const uncached: typeof batch = [];
    for (const article of batch) {
      const fingerprint = getTitleFingerprint(article.title);
      const cached = await redisCache.getCategorization(fingerprint);
      if (cached) {
        this.cacheHits++;
        results.set(article.id, cached);
      } else {
        this.cacheMisses++;
        uncached.push(article);
      }
    }

    if (uncached.length === 0) {
      logger.debug(`[OpenRouter] Categorization batch ${batchIndex}: All ${batch.length} from cache`);
      return results;
    }

    logger.debug(`[OpenRouter] Categorization batch ${batchIndex}: Cache hit ${batch.length - uncached.length}/${batch.length}, LLM processing ${uncached.length}`);

    const articlesText = uncached
      .map((article, index) => {
        const contentPreview = article.content ? article.content.substring(0, 500) : article.snippet || '';
        return `${index + 1}. ID: ${article.id}
   Title: ${article.title}
   Content: ${contentPreview}...
   Source: ${article.source || 'Unknown'}`;
      })
      .join('\n\n');

    const prompt = `You are an expert news categorizer for a trading dashboard.

Categorize these news articles. For each article, provide:
1. Primary categories (choose from: CRYPTO, STOCKS, ECONOMICS, GEOPOLITICS, TECH, COMMODITIES, SPORTS, FOOTBALL, BASKETBALL, TENNIS, MMA, GOLF)
2. Tags (3-5 relevant keywords/phrases, avoid generic terms like "news", "update", "report")
3. Sentiment (BULLISH, BEARISH, NEUTRAL)
4. Importance (LOW, MEDIUM, HIGH, CRITICAL)
5. Brief summary (2-3 sentences capturing key points for traders)
6. Trend topic label (3-8 words, human-readable Title Case, include entities + what's happening)
   - Good: "Spot Bitcoin ETF Approvals", "Federal Reserve Rate Decision"
   - Bad: "btc_etf", "fed news" (abbreviations, underscores, unclear)
7. Trend keywords (4-8 short tokens for search/matching, space-separated)

Articles:
${articlesText}

Return JSON in this format:
{
  "articles": [
    {
      "id": "article-id-1",
      "categories": ["CRYPTO"],
      "tags": ["bitcoin", "regulation", "etf"],
      "sentiment": "BULLISH",
      "importance": "HIGH",
      "summary": "Bitcoin ETF approval drives institutional inflows.",
      "trendTopic": "Spot Bitcoin ETF Approval",
      "trendKeywords": ["bitcoin", "ETF", "spot", "flows", "institutional"]
    }
  ]
}`;

    try {
      const response = await this.callWithRetry(
        `batchCategorization-${batchIndex}`,
        'OpenRouter-batchCategorization',
        () => axiosInstance.post<OpenRouterChatResponse>(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.labelingModel,
            messages: [
              {
                role: 'system',
                content: 'You are an expert news categorizer for financial markets. Always respond with valid JSON only.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.1,
            max_tokens: 8000,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey || configManager.get().openrouter.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://perps-trader.ai',
              'X-Title': 'PerpsTrader News System',
            },
            timeout: this.timeout * 2,
          }
        )
      );

      if (!response) {
        logger.warn(`[OpenRouter] Categorization batch ${batchIndex}: API call failed/skipped`);
        return results;
      }

      // FIX: z-ai/glm-4.7-flash returns content in 'reasoning' field, not 'content'
      // Also handle cases where choices array is empty or undefined
      const choices = response.data?.choices;
      if (!choices || choices.length === 0) {
        logger.warn(`[OpenRouter] Categorization batch ${batchIndex}: No choices in response`);
        return results;
      }
      const msg = choices[0]?.message;
      let content = msg?.content || '';
      // Fallback to reasoning field for models that use it
      if (!content && msg?.reasoning) {
        content = msg.reasoning;
      }
      // Also check reasoning_details array
      if (!content && msg?.reasoning_details && Array.isArray(msg.reasoning_details)) {
        content = msg.reasoning_details
          .filter((d: any) => d.type === 'reasoning.text' && d.text)
          .map((d: any) => d.text)
          .join('\n');
      }

      // Extract the first balanced JSON object from the response.
      // Handles markdown code fences and models that append text after JSON.
      let jsonString: string | null = this.extractBalancedJson(content);
      if (jsonString) {
        try {
          const parsed = JSON.parse(jsonString);
          for (const article of parsed.articles || []) {
            const result: CategorizationResult = {
              categories: article.categories || [],
              tags: (article.tags || []).slice(0, 8),
              sentiment: article.sentiment || 'NEUTRAL',
              importance: article.importance || 'MEDIUM',
              summary: article.summary || '',
              trendTopic: article.trendTopic,
              trendKeywords: (article.trendKeywords || []).slice(0, 8),
            };

            results.set(article.id, result);

            // Cache the result
            const originalArticle = uncached.find(a => a.id === article.id);
            if (originalArticle) {
              const fingerprint = getTitleFingerprint(originalArticle.title);
              await redisCache.setCategorization(fingerprint, result);
            }
          }
        } catch (parseError) {
          logger.warn(`[OpenRouter] Categorization batch ${batchIndex} JSON parse failed: ${parseError}`);
          const rawSnippet = content.length > 500 ? content.substring(0, 500) + '...' : content;
          logger.debug(`[OpenRouter] Raw response snippet: ${rawSnippet}`);
        }
      } else {
        logger.warn(`[OpenRouter] Categorization batch ${batchIndex}: No JSON found in response. Length: ${content.length}`);
      }
    } catch (error) {
      logger.debug(`[OpenRouter] Categorization batch ${batchIndex} failed: ${this.safeErrorMessage(error)}`);
    }

    return results;
  }

  /**
   * Categorize a batch of news articles with PARALLEL batch processing and Redis cache
   * Handles multiple batches if more than 100 articles
   */
  async categorizeArticles(articles: Array<{
    id: string;
    title: string;
    content?: string;
    snippet?: string;
    source?: string;
  }>): Promise<Map<string, CategorizationResult>> {
    if (!this.canUseService()) {
      return new Map();
    }

    const batchSize = 50;
    const concurrency = Number.parseInt(process.env.OPENROUTER_CONCURRENCY || '2', 10);
    const allResults = new Map<string, CategorizationResult>();

    // Split into batches
    const batches: Array<Array<{ id: string; title: string; content?: string; snippet?: string; source?: string }>> = [];
    for (let i = 0; i < articles.length; i += batchSize) {
      batches.push(articles.slice(i, i + batchSize));
    }

    // Process batches with concurrency limit
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        concurrentBatches.map((batch, idx) => this.processCategorizationBatch(batch, i + idx + 1))
      );

      for (const batchResult of batchResults) {
        for (const [id, result] of batchResult) {
          allResults.set(id, result);
        }
      }

      const cacheRate = this.cacheHits / (this.cacheHits + this.cacheMisses) * 100;
      logger.info(`[OpenRouter] Completed ${Math.min(i + concurrency, batches.length)}/${batches.length} categorization batches, ${allResults.size} categorized (cache: ${cacheRate.toFixed(1)}%)`);
    }

    logger.info(`[OpenRouter] Total categorized: ${allResults.size} articles`);
    return allResults;
  }

  /**
   * Extract the first balanced JSON object from LLM response text.
   * Handles markdown code fences, trailing text, and nested structures.
   * Falls back to simple brace-counting repair if balanced extraction fails.
   */
  private extractBalancedJson(content: string): string | null {
    if (!content) return null;

    // Strip markdown code fences
    let clean = content
      .replace(/^```(?:json)?\s*\n?/gi, '')
      .replace(/\n?```\s*$/g, '')
      .trim();

    const startIdx = clean.indexOf('{');
    if (startIdx === -1) return null;

    // Find the end of the balanced JSON object using proper bracket counting
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;

    for (let i = startIdx; i < clean.length; i++) {
      const ch = clean[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx !== -1) {
      let candidate = clean.substring(startIdx, endIdx + 1);
      // Quick repair: remove trailing commas before } or ]
      candidate = candidate.replace(/,\s*([}\]])/g, '$1');
      return candidate;
    }

    // Fallback: if no balanced object found (truncated response),
    // use the original approach of counting and appending
    let candidate = clean.substring(startIdx);
    const openBraces = (candidate.match(/\{/g) || []).length;
    const closeBraces = (candidate.match(/\}/g) || []).length;
    const openBrackets = (candidate.match(/\[/g) || []).length;
    const closeBrackets = (candidate.match(/\]/g) || []).length;
    for (let i = 0; i < openBraces - closeBraces; i++) candidate += '}';
    for (let i = 0; i < openBrackets - closeBrackets; i++) candidate += ']';
    candidate = candidate.replace(/,\s*([}\]])/g, '$1');
    if (candidate.match(/"[^"]*$/)) candidate += '"';
    return candidate;
  }

  private validateSubEventType(value: string): string {
    const validTypes = [
      'seizure', 'approval', 'launch', 'hack', 'announcement', 'sanction',
      'regulation', 'earnings', 'price_surge', 'price_drop', 'breakout',
      'partnership', 'listing', 'delisting', 'merger', 'acquisition',
      'proposal', 'ruling', 'protest', 'conflict', 'other'
    ];
    return validTypes.includes(value) ? value : 'other';
  }

  private validateUrgency(value: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(value)) {
      return value as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    }
    return 'MEDIUM';
  }
}

const openrouterService = new OpenRouterService();
export default openrouterService;
