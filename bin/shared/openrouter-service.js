"use strict";
// OpenRouter Service
// Provides embeddings and labeling for news/heatmap system via OpenRouter API
// Primary for news components, with GLM as fallback for trading components
// Enhanced with Redis caching for ultra-fast responses
// Enhanced with circuit breaker + retry with backoff to prevent 429 storms
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const config_1 = __importDefault(require("./config"));
const logger_1 = __importDefault(require("./logger"));
const redis_cache_1 = __importDefault(require("./redis-cache"));
const shared_rate_limiter_1 = require("./shared-rate-limiter");
const title_cleaner_1 = require("./title-cleaner");
const config = config_1.default.get();
// Create shared axios instance with connection pooling for better performance
const axiosInstance = axios_1.default.create({
    httpAgent: new http_1.default.Agent({ keepAlive: true, maxSockets: 10, maxFreeSockets: 5 }),
    httpsAgent: new https_1.default.Agent({ keepAlive: true, maxSockets: 10, maxFreeSockets: 5 }),
});
class CircuitBreaker {
    state = 'CLOSED';
    consecutiveFailures = 0;
    failureThreshold;
    resetTimeoutMs;
    backoffMultiplier;
    maxResetTimeoutMs;
    nextAttemptTime = 0;
    name;
    constructor(name, opts) {
        this.name = name;
        this.failureThreshold = opts?.failureThreshold ?? 5;
        this.resetTimeoutMs = opts?.resetTimeoutMs ?? 30_000;
        this.backoffMultiplier = opts?.backoffMultiplier ?? 2;
        this.maxResetTimeoutMs = opts?.maxResetTimeoutMs ?? 120_000;
    }
    canExecute() {
        if (this.state === 'CLOSED')
            return true;
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttemptTime)
                return false;
            this.state = 'HALF_OPEN';
            logger_1.default.info(`[CircuitBreaker:${this.name}] Entering HALF_OPEN — allowing one probe call`);
            return true;
        }
        // HALF_OPEN: allow one call
        return true;
    }
    recordSuccess() {
        if (this.state !== 'CLOSED') {
            logger_1.default.info(`[CircuitBreaker:${this.name}] Closing — probe succeeded`);
        }
        this.state = 'CLOSED';
        this.consecutiveFailures = 0;
    }
    recordFailure() {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.failureThreshold) {
            const timeout = Math.min(this.resetTimeoutMs * Math.pow(this.backoffMultiplier, Math.floor(this.consecutiveFailures / this.failureThreshold) - 1), this.maxResetTimeoutMs);
            this.nextAttemptTime = Date.now() + timeout;
            if (this.state !== 'OPEN') {
                logger_1.default.warn(`[CircuitBreaker:${this.name}] OPENING after ${this.consecutiveFailures} consecutive failures — cooldown ${Math.round(timeout / 1000)}s`);
            }
            this.state = 'OPEN';
        }
    }
    getState() { return this.state; }
    getConsecutiveFailures() { return this.consecutiveFailures; }
}
class OpenRouterService {
    baseUrl;
    apiKey;
    labelingModel;
    embeddingModel;
    timeout;
    // Cache metrics
    cacheHits = 0;
    cacheMisses = 0;
    // Circuit breaker: shared across all API calls in this service
    circuitBreaker;
    // Retry config
    static MAX_RETRIES = 5;
    static RETRY_BASE_DELAY_MS = 1000;
    static RETRY_MAX_DELAY_MS = 30_000;
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
    canUseService() {
        // Check live config as fallback — constructor-captured apiKey can be empty
        // if configManager loaded before dotenv populated process.env
        const key = this.apiKey || config_1.default.get().openrouter.apiKey;
        return !!key && key.length > 0 && key !== 'your-api-key-here';
    }
    /**
     * Get circuit breaker state for observability
     */
    getCircuitBreakerState() {
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
    async callWithRetry(caller, rateLimitKey, apiCall) {
        // Circuit breaker check
        if (!this.circuitBreaker.canExecute()) {
            logger_1.default.warn(`[OpenRouter] ${caller}: circuit breaker OPEN — skipping call (failures: ${this.circuitBreaker.getConsecutiveFailures()})`);
            return null;
        }
        let lastError;
        for (let attempt = 1; attempt <= OpenRouterService.MAX_RETRIES; attempt++) {
            try {
                // Rate limit slot
                await (0, shared_rate_limiter_1.acquireRateLimitSlot)(rateLimitKey);
                const result = await apiCall();
                // Success — reset circuit breaker and rate limiter
                this.circuitBreaker.recordSuccess();
                (0, shared_rate_limiter_1.reportSuccess)();
                return result;
            }
            catch (error) {
                lastError = error;
                const status = error?.response?.status;
                // Report 429 to shared rate limiter for adaptive backoff
                if (status === 429) {
                    const retryAfter = error?.response?.headers?.['retry-after'];
                    let retryAfterMs;
                    if (retryAfter) {
                        const parsed = parseInt(retryAfter, 10);
                        if (!isNaN(parsed))
                            retryAfterMs = parsed < 100 ? parsed * 1000 : parsed;
                    }
                    (0, shared_rate_limiter_1.reportRateLimitHit)(rateLimitKey, retryAfterMs);
                    this.circuitBreaker.recordFailure();
                    if (attempt < OpenRouterService.MAX_RETRIES) {
                        const backoff = retryAfterMs
                            || Math.min(OpenRouterService.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500, OpenRouterService.RETRY_MAX_DELAY_MS);
                        logger_1.default.warn(`[OpenRouter] ${caller}: 429 on attempt ${attempt}/${OpenRouterService.MAX_RETRIES}, retrying in ${Math.round(backoff)}ms...`);
                        await new Promise(r => setTimeout(r, backoff));
                        continue;
                    }
                    logger_1.default.warn(`[OpenRouter] ${caller}: 429 exhausted all ${OpenRouterService.MAX_RETRIES} retries`);
                    return null;
                }
                // Non-429 error: retry with exponential backoff for transient errors
                if (status >= 500 || error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ECONNREFUSED') {
                    this.circuitBreaker.recordFailure();
                    if (attempt < OpenRouterService.MAX_RETRIES) {
                        const backoff = Math.min(OpenRouterService.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500, OpenRouterService.RETRY_MAX_DELAY_MS);
                        logger_1.default.warn(`[OpenRouter] ${caller}: ${status || error?.code} error on attempt ${attempt}/${OpenRouterService.MAX_RETRIES}, retrying in ${Math.round(backoff)}ms...`);
                        await new Promise(r => setTimeout(r, backoff));
                        continue;
                    }
                }
                // Non-retryable error (4xx except 429, or unknown)
                logger_1.default.debug(`[OpenRouter] ${caller}: non-retryable error: ${this.safeErrorMessage(error)}`);
                return null;
            }
        }
        logger_1.default.warn(`[OpenRouter] ${caller}: all ${OpenRouterService.MAX_RETRIES} retries exhausted: ${this.safeErrorMessage(lastError)}`);
        return null;
    }
    safeErrorMessage(error) {
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
    getCacheStats() {
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
    async generateEmbedding(text) {
        // z.ai has no embedding endpoint — skip the API call entirely.
        // Callers (news-vector-store, semantic-similarity) already fall back to embedText().
        return null;
    }
    /**
     * Generate event label for a single news article with cache
     * DISABLED: OpenRouter API key is dead (401 User not found).
     * Returns null immediately to avoid retry storms.
     */
    async generateEventLabel(input) {
        // OpenRouter key dead - skip to avoid 401 retry storm
        return null;
    }
    /**
     * Generate event labels for multiple articles with PARALLEL batch processing and Redis cache
     */
    async batchEventLabels(inputs) {
        // OpenRouter key dead - skip to avoid 401 retry storm
        return new Map();
    }
    /**
     * Process a single batch for categorization with cache
     */
    async processCategorizationBatch(batch, batchIndex) {
        const results = new Map();
        // Check cache for all items first
        const uncached = [];
        for (const article of batch) {
            const fingerprint = (0, title_cleaner_1.getTitleFingerprint)(article.title);
            const cached = await redis_cache_1.default.getCategorization(fingerprint);
            if (cached) {
                this.cacheHits++;
                results.set(article.id, cached);
            }
            else {
                this.cacheMisses++;
                uncached.push(article);
            }
        }
        if (uncached.length === 0) {
            logger_1.default.debug(`[OpenRouter] Categorization batch ${batchIndex}: All ${batch.length} from cache`);
            return results;
        }
        logger_1.default.debug(`[OpenRouter] Categorization batch ${batchIndex}: Cache hit ${batch.length - uncached.length}/${batch.length}, LLM processing ${uncached.length}`);
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
            const response = await this.callWithRetry(`batchCategorization-${batchIndex}`, 'OpenRouter-batchCategorization', () => axiosInstance.post(`${this.baseUrl}/chat/completions`, {
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
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey || config_1.default.get().openrouter.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://perps-trader.ai',
                    'X-Title': 'PerpsTrader News System',
                },
                timeout: this.timeout * 2,
            }));
            if (!response) {
                logger_1.default.warn(`[OpenRouter] Categorization batch ${batchIndex}: API call failed/skipped`);
                return results;
            }
            // FIX: z-ai/glm-4.7-flash returns content in 'reasoning' field, not 'content'
            // Also handle cases where choices array is empty or undefined
            const choices = response.data?.choices;
            if (!choices || choices.length === 0) {
                logger_1.default.warn(`[OpenRouter] Categorization batch ${batchIndex}: No choices in response`);
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
                    .filter((d) => d.type === 'reasoning.text' && d.text)
                    .map((d) => d.text)
                    .join('\n');
            }
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
                        const result = {
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
                            const fingerprint = (0, title_cleaner_1.getTitleFingerprint)(originalArticle.title);
                            await redis_cache_1.default.setCategorization(fingerprint, result);
                        }
                    }
                }
                catch (parseError) {
                    logger_1.default.warn(`[OpenRouter] Categorization batch ${batchIndex} JSON parse failed: ${parseError}`);
                    const rawSnippet = content.length > 500 ? content.substring(0, 500) + '...' : content;
                    logger_1.default.debug(`[OpenRouter] Raw response snippet: ${rawSnippet}`);
                }
            }
            else {
                logger_1.default.warn(`[OpenRouter] Categorization batch ${batchIndex}: No JSON found in response. Length: ${content.length}`);
            }
        }
        catch (error) {
            logger_1.default.debug(`[OpenRouter] Categorization batch ${batchIndex} failed: ${this.safeErrorMessage(error)}`);
        }
        return results;
    }
    /**
     * Categorize a batch of news articles with PARALLEL batch processing and Redis cache
     * Handles multiple batches if more than 100 articles
     */
    async categorizeArticles(articles) {
        if (!this.canUseService()) {
            return new Map();
        }
        const batchSize = 50;
        const concurrency = Number.parseInt(process.env.OPENROUTER_CONCURRENCY || '2', 10);
        const allResults = new Map();
        // Split into batches
        const batches = [];
        for (let i = 0; i < articles.length; i += batchSize) {
            batches.push(articles.slice(i, i + batchSize));
        }
        // Process batches with concurrency limit
        for (let i = 0; i < batches.length; i += concurrency) {
            const concurrentBatches = batches.slice(i, i + concurrency);
            const batchResults = await Promise.all(concurrentBatches.map((batch, idx) => this.processCategorizationBatch(batch, i + idx + 1)));
            for (const batchResult of batchResults) {
                for (const [id, result] of batchResult) {
                    allResults.set(id, result);
                }
            }
            const cacheRate = this.cacheHits / (this.cacheHits + this.cacheMisses) * 100;
            logger_1.default.info(`[OpenRouter] Completed ${Math.min(i + concurrency, batches.length)}/${batches.length} categorization batches, ${allResults.size} categorized (cache: ${cacheRate.toFixed(1)}%)`);
        }
        logger_1.default.info(`[OpenRouter] Total categorized: ${allResults.size} articles`);
        return allResults;
    }
    validateSubEventType(value) {
        const validTypes = [
            'seizure', 'approval', 'launch', 'hack', 'announcement', 'sanction',
            'regulation', 'earnings', 'price_surge', 'price_drop', 'breakout',
            'partnership', 'listing', 'delisting', 'merger', 'acquisition',
            'proposal', 'ruling', 'protest', 'conflict', 'other'
        ];
        return validTypes.includes(value) ? value : 'other';
    }
    validateUrgency(value) {
        if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(value)) {
            return value;
        }
        return 'MEDIUM';
    }
}
const openrouterService = new OpenRouterService();
exports.default = openrouterService;
//# sourceMappingURL=openrouter-service.js.map