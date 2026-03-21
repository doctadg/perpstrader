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
   * Generate embeddings for text using OpenRouter with Redis cache
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.canUseService()) {
      logger.debug('[OpenRouter] API key not configured for embeddings');
      return null;
    }

    // Check cache first
    const cached = await redisCache.getEmbedding(text);
    if (cached) {
      this.cacheHits++;
      logger.debug('[OpenRouter] Embedding cache hit');
      return cached;
    }
    this.cacheMisses++;

    try {
      const safeText = text.substring(0, 8000);

      const response = await this.callWithRetry(
        'generateEmbedding',
        'OpenRouter-embedding',
        () => axiosInstance.post<OpenRouterEmbeddingResponse>(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.embeddingModel,
            messages: [
              {
                role: 'user',
                content: `Generate an embedding vector for this text: ${safeText}`,
              },
            ],
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://perps-trader.ai',
              'X-Title': 'PerpsTrader News System',
            },
            timeout: this.timeout,
          }
        )
      );

      if (!response) return null;

      // Try to extract embedding from response
      const data = response.data;
      if (data?.data?.[0]?.embedding) {
        const embedding = data.data[0].embedding;
        // Cache the result
        await redisCache.setEmbedding(text, embedding);
        return embedding;
      }

      logger.warn('[OpenRouter] Unexpected embedding response format');
      return null;
    } catch (error: any) {
      logger.debug(`[OpenRouter] Embedding generation failed: ${this.safeErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Generate event label for a single news article with cache
   */
  async generateEventLabel(input: {
    title: string;
    content?: string;
    category?: string;
    tags?: string[];
  }): Promise<EventLabelResult | null> {
    if (!this.canUseService()) {
      return null;
    }

    const title = (input.title || '').trim();
    if (!title) return null;

    // Check cache by title fingerprint
    const fingerprint = getTitleFingerprint(title);
    const cached = await redisCache.getEventLabel(fingerprint);
    if (cached) {
      this.cacheHits++;
      logger.debug('[OpenRouter] Event label cache hit');
      return cached;
    }
    this.cacheMisses++;

    const prompt = `You are a financial news analyst for a crypto/perps trading dashboard.

Analyze this headline and extract specific event details.

HEADLINE: ${title}
CATEGORY: ${input.category || 'UNKNOWN'}
TAGS: ${(input.tags || []).slice(0, 5).join(', ') || 'none'}

CRITICAL RULES FOR topic GENERATION:
1. MUST be proper English with complete sentence structure
2. MUST start with a SPECIFIC ENTITY (company, person, country, token, protocol)
3. Followed by SPECIFIC ACTION (what happened) - use active verbs
4. Title Case format with proper spacing (NO underscores)
5. 3-8 words maximum - keep it concise
6. NO generic terms - be specific
7. Proper grammar: Subject + Verb + Object structure

ENTITY EXAMPLES:
- Companies: Tesla, Nvidia, Binance, Coinbase, MicroStrategy
- People: Jerome Powell, Elon Musk, Christine Lagarde
- Countries/Regions: United States, China, European Union, Iran
- Tokens: Bitcoin, Ethereum, Solana, Dogecoin
- Protocols: Uniswap, Aave, Compound, Arbitrum

ACTION VERBS (use these):
- Approves, Rejects, Launches, Hacks, Bans, Sues, Acquires
- Reports, Raises, Cuts, Files, Delists, Lists, Partners
- Mergers, Beats, Misses, Signs, Exits

Good topics (proper English structure):
✓ "Bitcoin Spot ETF Approval by SEC"
✓ "Federal Reserve Raises Interest Rates to 5.25%"
✓ "Binance Suffers $400M Security Breach"
✓ "Tesla Q4 Earnings Beat Expectations"
✓ "Iran Protests Against Government"
✓ "Ethereum Dencun Upgrade Goes Live"
✓ "Crystal Palace Signs Sidiki Cherif"

Bad topics (REJECT - poor grammar or unclear):
✗ "Price Action" (too generic)
✗ "Market Update" (not specific)
✗ "Latest News" (meaningless)
✗ "Crypto News" (too broad)
✗ "Joins sidiki cherif agrees crystal" (broken English)
✗ "Misses serie mourns rocco" (incomplete)
✗ "Politics Breaking Political Video" (wrong word order)
✗ "bitcoin_spot_etf" (underscores, not Title Case)

2. subEventType: specific action category
   Options: seizure|approval|launch|hack|announcement|sanction|regulation|
            earnings|price_surge|price_drop|breakout|partnership|listing|
            delisting|merger|acquisition|proposal|ruling|protest|conflict|other

3. trendDirection: is this bullish or bearish for markets?
   UP: price surges, approvals, launches, partnerships, listings, breakthroughs
   DOWN: hacks, sanctions, delistings, crashes, bans, conflicts
   NEUTRAL: announcements, general news, scheduled events

4. urgency: how time-sensitive is this?
   CRITICAL: breaking major developments, immediate market impact
   HIGH: significant news, scheduled events, data releases
   MEDIUM: analysis, secondary coverage
   LOW: retrospective, evergreen content

5. keywords: 4-7 specific entities and terms (space-separated, searchable)
   - Include the primary entity, specific event type, relevant names
   - Good: ["spot ETF", "Bitcoin", "SEC approval", "institutional"]
   - Bad: ["spot_etf", "btc", "sec"] (abbreviated, unclear)

Return JSON ONLY:
{
  "topic": "...",
  "subEventType": "...",
  "trendDirection": "UP|DOWN|NEUTRAL",
  "urgency": "CRITICAL|HIGH|MEDIUM|LOW",
  "keywords": ["...", "..."]
}`;

    try {
      const response = await this.callWithRetry(
        'generateEventLabel',
        'OpenRouter-eventLabel',
        () => axiosInstance.post<OpenRouterChatResponse>(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.labelingModel,
            messages: [
              {
                role: 'system',
                content: 'You are a precise financial news analyst. Always respond with valid JSON only.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.1,
            max_tokens: 500,
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://perps-trader.ai',
              'X-Title': 'PerpsTrader News System',
            },
            timeout: this.timeout,
          }
        )
      );

      if (!response) return null;

      const content = response.data.choices[0]?.message?.content || '';
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;

      // Attempt to repair common JSON issues before parsing
      let jsonString = match[0];

      // Repair truncated JSON by attempting to close brackets
      const openBraces = (jsonString.match(/\{/g) || []).length;
      const closeBraces = (jsonString.match(/\}/g) || []).length;
      const openBrackets = (jsonString.match(/\[/g) || []).length;
      const closeBrackets = (jsonString.match(/\]/g) || []).length;

      // Add missing closing braces and brackets
      for (let i = 0; i < openBraces - closeBraces; i++) {
        jsonString += '}';
      }
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        jsonString += ']';
      }

      // Remove trailing commas that would cause parse errors
      jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');

      // Fix incomplete strings at the end
      if (jsonString.match(/"[^"]*$/)) {
        jsonString += '"';
      }

      const parsed = JSON.parse(jsonString) as any;

      const topic = String(parsed.topic || '').trim();
      const subEventType = String(parsed.subEventType || 'other').toLowerCase();
      const trendDirection = parsed.trendDirection?.toUpperCase();
      const urgency = parsed.urgency?.toUpperCase();

      if (!topic || !['UP', 'DOWN', 'NEUTRAL'].includes(trendDirection || '')) {
        return null;
      }

      const result: EventLabelResult = {
        topic,
        subEventType: this.validateSubEventType(subEventType),
        trendDirection: trendDirection as 'UP' | 'DOWN' | 'NEUTRAL',
        urgency: this.validateUrgency(urgency),
        keywords: Array.isArray(parsed.keywords)
          ? parsed.keywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 7)
          : [],
      };

      // Cache the result
      await redisCache.setEventLabel(fingerprint, result);

      return result;
    } catch (error: any) {
      logger.debug(`[OpenRouter] Event label generation failed: ${this.safeErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Process a single batch for event labeling
   */
  private async processEventLabelBatch(
    batch: Array<{ id: string; title: string; category?: string; tags?: string[] }>,
    batchIndex: number
  ): Promise<Map<string, EventLabelResult>> {
    const results = new Map<string, EventLabelResult>();

    // Check cache for all items in batch first
    const uncached: typeof batch = [];
    for (const item of batch) {
      const fingerprint = getTitleFingerprint(item.title);
      const cached = await redisCache.getEventLabel(fingerprint);
      if (cached) {
        this.cacheHits++;
        results.set(item.id, cached);
      } else {
        this.cacheMisses++;
        uncached.push(item);
      }
    }

    if (uncached.length === 0) {
      logger.info(`[OpenRouter] Batch ${batchIndex}: All ${batch.length} items from cache`);
      return results;
    }

    logger.info(`[OpenRouter] Batch ${batchIndex}: Cache hit ${batch.length - uncached.length}/${batch.length}, LLM processing ${uncached.length}`);

    const articlesText = uncached
      .map((item, index) => {
        return `${index + 1}. ID: ${item.id}
   Title: ${item.title}
   Category: ${item.category || 'UNKNOWN'}
   Tags: ${(item.tags || []).slice(0, 5).join(', ') || 'none'}`;
      })
      .join('\n\n');

    const prompt = `You are a financial news analyst for a crypto/perps trading dashboard.

Analyze these headlines and extract event details.

${articlesText}

CRITICAL RULES FOR topic GENERATION:
1. MUST be proper English with complete sentence structure
2. MUST start with a SPECIFIC ENTITY (company, person, country, token, protocol)
3. Followed by SPECIFIC ACTION (what happened) - use active verbs
4. Title Case format with proper spacing (NO underscores)
5. 3-8 words maximum - keep it concise
6. NO generic terms - be specific
7. Proper grammar: Subject + Verb + Object structure

ENTITY EXAMPLES:
- Companies: Tesla, Nvidia, Binance, Coinbase, MicroStrategy
- People: Jerome Powell, Elon Musk, Christine Lagarde
- Countries/Regions: United States, China, European Union, Iran
- Tokens: Bitcoin, Ethereum, Solana, Dogecoin
- Protocols: Uniswap, Aave, Compound, Arbitrum

ACTION VERBS (use these):
- Approves, Rejects, Launches, Hacks, Bans, Sues, Acquires
- Reports, Raises, Cuts, Files, Delists, Lists, Partners
- Mergers, Beats, Misses, Signs, Exits

Good topics (proper English structure):
✓ "Bitcoin Spot ETF Approval by SEC"
✓ "Federal Reserve Raises Interest Rates"
✓ "Binance Security Breach"
✓ "Tesla Q4 Earnings Beat"
✓ "Iran Protests Against Government"
✓ "Ethereum Dencun Upgrade Launch"

Bad topics (REJECT - poor grammar or unclear):
✗ "Price Action" (too generic)
✗ "Market Update" (not specific)
✗ "Latest News" (meaningless)
✗ "Crypto News" (too broad)
✗ "Joins sidiki cherif agrees crystal" (broken English)
✗ "Misses serie mourns rocco" (incomplete)
✗ "Politics Breaking Political Video" (wrong word order)
✗ "bitcoin_spot_etf" (use spaces, not underscores)

For EACH article, provide:
1. topic: 3-8 words, SPECIFIC ENTITY + SPECIFIC ACTION, Title Case
2. subEventType: specific action category
3. trendDirection: UP (bullish) | DOWN (bearish) | NEUTRAL
4. urgency: CRITICAL | HIGH | MEDIUM | LOW
5. keywords: 4-7 specific entities and terms (space-separated, searchable)

Return JSON ONLY in this format:
{
  "labels": [
    {
      "id": "article-id-1",
      "topic": "...",
      "subEventType": "...",
      "trendDirection": "UP|DOWN|NEUTRAL",
      "urgency": "CRITICAL|HIGH|MEDIUM|LOW",
      "keywords": ["...", "..."]
    }
  ]
}`;

    try {
      const response = await this.callWithRetry(
        `batchEventLabel-${batchIndex}`,
        'OpenRouter-batchEventLabel',
        () => axiosInstance.post<OpenRouterChatResponse>(
          `${this.baseUrl}/chat/completions`,
          {
            model: this.labelingModel,
            messages: [
              {
                role: 'system',
                content: 'You are a precise financial news analyst. Always respond with valid JSON only.',
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
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://perps-trader.ai',
              'X-Title': 'PerpsTrader News System',
            },
            timeout: this.timeout * 2,
          }
        )
      );

      if (!response) {
        logger.warn(`[OpenRouter] Batch ${batchIndex}: API call failed/skipped`);
        return results;
      }

      const content = response.data.choices[0]?.message?.content || '';

      // Try multiple patterns to find the JSON
      let jsonMatch = content.match(/\{[\s\S]*"labels"[\s\S]*\}/);
      if (!jsonMatch) {
        jsonMatch = content.match(/\{[\s\S]*\}/);
      }

      if (jsonMatch) {
        try {
          // Attempt to repair common JSON issues before parsing
          let jsonString = jsonMatch[0];

          // Repair truncated JSON by attempting to close brackets
          const openBraces = (jsonString.match(/\{/g) || []).length;
          const closeBraces = (jsonString.match(/\}/g) || []).length;
          const openBrackets = (jsonString.match(/\[/g) || []).length;
          const closeBrackets = (jsonString.match(/\]/g) || []).length;

          // Add missing closing braces and brackets
          for (let i = 0; i < openBraces - closeBraces; i++) {
            jsonString += '}';
          }
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            jsonString += ']';
          }

          // Remove trailing commas that would cause parse errors
          jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');

          // Additional repair: fix incomplete strings at the end
          // If the JSON ends with an incomplete string, try to close it
          if (jsonString.match(/"[^"]*$/)) {
            jsonString += '"';
          }

          // Try parsing with repaired JSON
          const parsed = JSON.parse(jsonString);
          const labels = parsed.labels || parsed;
          const labelsArray = Array.isArray(labels) ? labels : [];

          for (const label of labelsArray) {
            if (label.id && label.topic && label.topic.length > 5) {
              const result: EventLabelResult = {
                topic: String(label.topic).trim(),
                subEventType: this.validateSubEventType(label.subEventType || 'other'),
                trendDirection: ['UP', 'DOWN', 'NEUTRAL'].includes(label.trendDirection)
                  ? label.trendDirection as 'UP' | 'DOWN' | 'NEUTRAL'
                  : 'NEUTRAL',
                urgency: this.validateUrgency(label.urgency),
                keywords: Array.isArray(label.keywords)
                  ? label.keywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 7)
                  : [],
              };

              results.set(label.id, result);

              // Cache each result
              const originalItem = uncached.find(u => u.id === label.id);
              if (originalItem) {
                const fingerprint = getTitleFingerprint(originalItem.title);
                await redisCache.setEventLabel(fingerprint, result);
              }
            }
          }
        } catch (parseError) {
          // Enhanced error logging with raw response snippet for debugging
          const rawSnippet = content.length > 500 ? content.substring(0, 500) + '...' : content;
          logger.warn(`[OpenRouter] Batch ${batchIndex} JSON parse failed: ${parseError}`);
          logger.debug(`[OpenRouter] Raw response snippet: ${rawSnippet}`);

          // Attempt emergency fallback: extract partial data using regex
          try {
            this.emergencyExtractLabels(content, uncached, results);
          } catch (fallbackError) {
            logger.debug(`[OpenRouter] Emergency extraction also failed: ${fallbackError}`);
          }
        }
      } else {
        logger.warn(`[OpenRouter] Batch ${batchIndex}: No JSON found in response. Length: ${content.length}, Preview: ${content.substring(0, 200)}...`);
      }
      logger.info(`[OpenRouter] Batch ${batchIndex}: ${results.size} labeled from ${batch.length} articles`);
    } catch (error: any) {
      logger.warn(`[OpenRouter] Batch ${batchIndex} failed: ${this.safeErrorMessage(error)}`);
    }

    return results;
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
    if (!this.canUseService() || inputs.length === 0) {
      return new Map();
    }

    const batchSize = 100;
    const concurrency = Number.parseInt(process.env.OPENROUTER_CONCURRENCY || '8', 10);
    const results = new Map<string, EventLabelResult>();

    // Split into batches
    const batches: Array<Array<{ id: string; title: string; category?: string; tags?: string[] }>> = [];
    for (let i = 0; i < inputs.length; i += batchSize) {
      batches.push(inputs.slice(i, i + batchSize));
    }

    // Process batches with concurrency limit
    for (let i = 0; i < batches.length; i += concurrency) {
      const concurrentBatches = batches.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        concurrentBatches.map((batch, idx) => this.processEventLabelBatch(batch, i + idx + 1))
      );

      for (const batchResult of batchResults) {
        for (const [id, label] of batchResult) {
          results.set(id, label);
        }
      }

      logger.info(`[OpenRouter] Completed ${Math.min(i + concurrency, batches.length)}/${batches.length} batches, ${results.size} labeled`);
    }

    return results;
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
              'Authorization': `Bearer ${this.apiKey}`,
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

      const content = response.data.choices[0]?.message?.content || '';
      let jsonMatch = content.match(/\{[\s\S]*"articles"[\s\S]*\}/);
      if (!jsonMatch) {
        jsonMatch = content.match(/\{[\s\S]*\}/);
      }

      if (jsonMatch) {
        try {
          let jsonString = jsonMatch[0];

          // Apply same JSON repair logic as event labels
          const openBraces = (jsonString.match(/\{/g) || []).length;
          const closeBraces = (jsonString.match(/\}/g) || []).length;
          const openBrackets = (jsonString.match(/\[/g) || []).length;
          const closeBrackets = (jsonString.match(/\]/g) || []).length;

          for (let i = 0; i < openBraces - closeBraces; i++) {
            jsonString += '}';
          }
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            jsonString += ']';
          }

          jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');

          if (jsonString.match(/"[^"]*$/)) {
            jsonString += '"';
          }

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

    const batchSize = 100;
    const concurrency = Number.parseInt(process.env.OPENROUTER_CONCURRENCY || '8', 10);
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

  /**
   * Emergency fallback: Extract labels from malformed JSON using regex patterns
   * Attempts to salvage partial data when JSON parsing completely fails
   */
  private emergencyExtractLabels(
    content: string,
    uncached: Array<{ id: string; title: string; category?: string; tags?: string[] }>,
    results: Map<string, EventLabelResult>
  ): void {
    logger.info('[OpenRouter] Attempting emergency label extraction from malformed response');

    // Pattern 1: Extract individual "id": "..." pairs with their following topic
    const idTopicPattern = /"id":\s*"([^"]+)"[\s\S]*?"topic":\s*"([^"]+)"/g;
    let match;
    let extracted = 0;

    while ((match = idTopicPattern.exec(content)) !== null && extracted < uncached.length) {
      const id = match[1];
      const topic = match[2];

      // Verify this ID is in our uncached list
      if (uncached.find(u => u.id === id) && topic.length > 5) {
        // Extract other fields if available
        const trendMatch = content.substring(match.index).match(/"trendDirection":\s*"(\w+)"/);
        const urgencyMatch = content.substring(match.index).match(/"urgency":\s*"(\w+)"/);
        const keywordsMatch = content.substring(match.index).match(/"keywords":\s*\[(.*?)\]/);

        const keywords = keywordsMatch
          ? keywordsMatch[1].split(',').map(k => k.trim().replace(/"/g, '')).filter(k => k.length > 0)
          : [];

        results.set(id, {
          topic,
          subEventType: 'other',
          trendDirection: (trendMatch && ['UP', 'DOWN', 'NEUTRAL'].includes(trendMatch[1]))
            ? trendMatch[1] as 'UP' | 'DOWN' | 'NEUTRAL'
            : 'NEUTRAL',
          urgency: (urgencyMatch && ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(urgencyMatch[1]))
            ? urgencyMatch[1] as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
            : 'MEDIUM',
          keywords: keywords.slice(0, 7),
        });
        extracted++;
      }
    }

    if (extracted > 0) {
      logger.info(`[OpenRouter] Emergency extraction salvaged ${extracted} labels`);
    }
  }
}

const openrouterService = new OpenRouterService();
export default openrouterService;
