// LLM Service Stub
// LLM Service — use your preferred LLM provider for embeddings and labeling.
// This module provides the same interface as before, delegating to the GLM config
// (apiKey, baseUrl, model) for all LLM calls.

import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import http from 'http';
import configManager from './config';
import logger from './logger';
import redisCache from './redis-cache';
import { acquireRateLimitSlot, reportRateLimitHit, reportSuccess } from './shared-rate-limiter';
import { getTitleFingerprint } from './title-cleaner';

const config = configManager.get();

const axiosInstance: AxiosInstance = axios.create({
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10, maxFreeSockets: 5 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10, maxFreeSockets: 5 }),
});

interface ChatResponse {
  choices: { message: { content: string } }[];
}

interface EmbeddingResponse {
  data: { embedding: number[] }[];
}

// Simple circuit breaker
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' = 'closed';

  constructor(private name: string, private opts: { failureThreshold?: number; resetTimeoutMs?: number } = {}) {}

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= (this.opts.failureThreshold || 5)) {
      this.state = 'open';
    }
  }

  isOpen(): boolean {
    if (this.state === 'closed') return false;
    const elapsed = Date.now() - this.lastFailureTime;
    if (elapsed > (this.opts.resetTimeoutMs || 60000)) {
      this.state = 'closed';
      this.failures = 0;
      return false;
    }
    return true;
  }

  getConsecutiveFailures(): number { return this.failures; }
}

class LLMService {
  private baseUrl: string;
  private apiKey: string;
  private labelingModel: string;
  private embeddingModel: string;
  private timeout: number;
  private circuitBreaker: CircuitBreaker;
  private cacheHits = 0;
  private cacheMisses = 0;

  static MAX_RETRIES = 3;
  static RETRY_BASE_DELAY_MS = 1000;
  static RETRY_MAX_DELAY_MS = 30000;

  constructor() {
    // Use GLM config section (the canonical LLM config)
    this.baseUrl = config.glm.baseUrl;
    this.apiKey = config.glm.apiKey;
    this.labelingModel = config.glm.model || 'z-ai/glm-4.7-flash';
    this.embeddingModel = process.env.LLM_EMBEDDING_MODEL || 'openai/text-embedding-3-small';
    this.timeout = config.glm.timeout;
    this.circuitBreaker = new CircuitBreaker('LLM', {
      failureThreshold: 5,
      resetTimeoutMs: 60000
    });
  }

  canUseService(): boolean {
    const key = this.apiKey || configManager.get().glm.apiKey;
    return !!key && key.length > 0 && key !== 'your-api-key-here';
  }

  private safeErrorMessage(error: any): string {
    const status = error?.response?.status;
    const apiMessage = error?.response?.data?.error?.message || error?.response?.data?.message;
    const code = error?.code;
    const message = error?.message;
    return [status ? `HTTP ${status}` : null, code ? `code=${code}` : null, apiMessage ? `api=${String(apiMessage)}` : null, message ? `msg=${String(message)}` : null].filter(Boolean).join(' ');
  }

  private async callWithRetry(
    caller: string,
    traceName: string,
    apiCall: () => Promise<any>
  ): Promise<any> {
    if (this.circuitBreaker.isOpen()) {
      logger.warn(`[LLM] ${caller}: circuit breaker OPEN — skipping call (failures: ${this.circuitBreaker.getConsecutiveFailures()})`);
      return null;
    }

    let lastError: any = null;
    for (let attempt = 1; attempt <= LLMService.MAX_RETRIES; attempt++) {
      try {
        await acquireRateLimitSlot(traceName);
        const result = await apiCall();
        reportSuccess();
        this.circuitBreaker.recordSuccess();
        return result;
      } catch (error: any) {
        reportRateLimitHit(traceName);
        lastError = error;
        const status = error?.response?.status;

        if (status === 429 || status === 503) {
          if (attempt < LLMService.MAX_RETRIES) {
            const backoff =
              status === 429
                ? Math.min(
                    LLMService.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500,
                    LLMService.RETRY_MAX_DELAY_MS
                  )
                : Math.min(
                    LLMService.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500,
                    LLMService.RETRY_MAX_DELAY_MS
                  );
            logger.warn(`[LLM] ${caller}: ${status} on attempt ${attempt}/${LLMService.MAX_RETRIES}, retrying in ${Math.round(backoff)}ms...`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
          logger.warn(`[LLM] ${caller}: ${status} exhausted all ${LLMService.MAX_RETRIES} retries`);
          break;
        }

        if (status === 401 || status === 403) {
          logger.warn(`[LLM] ${caller}: auth error ${status} — skipping retries`);
          break;
        }

        if (status >= 500) {
          if (attempt < LLMService.MAX_RETRIES) {
            const backoff = Math.min(LLMService.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500, LLMService.RETRY_MAX_DELAY_MS);
            logger.warn(`[LLM] ${caller}: ${status || error?.code} error on attempt ${attempt}/${LLMService.MAX_RETRIES}, retrying in ${Math.round(backoff)}ms...`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }
        }

        logger.debug(`[LLM] ${caller}: non-retryable error: ${this.safeErrorMessage(error)}`);
        break;
      }
    }

    this.circuitBreaker.recordFailure();
    logger.warn(`[LLM] ${caller}: all ${LLMService.MAX_RETRIES} retries exhausted: ${this.safeErrorMessage(lastError)}`);
    return null;
  }

  /**
   * Generate an embedding for text
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.canUseService()) return null;

    const cacheKey = `emb:${text.slice(0, 200)}`;
    // @ts-expect-error redisCache.get accepts optional namespace arg in some overloads
    const cached = await redisCache.get(cacheKey) as number[] | null;
    if (cached) {
      this.cacheHits++;
      return cached;
    }
    this.cacheMisses++;

    const result = await this.callWithRetry('generateEmbedding', 'LLM-embedding', () =>
      axiosInstance.post<EmbeddingResponse>(
        `${this.baseUrl}/embeddings`,
        {
          model: this.embeddingModel,
          input: text.slice(0, 8000),
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey || configManager.get().glm.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      )
    );

    if (result?.data?.data?.[0]?.embedding) {
      const embedding = result.data.data[0].embedding;
      await redisCache.set(cacheKey, embedding, 3600);
      return embedding;
    }

    return null;
  }

  /**
   * Categorize a batch of articles
   */
  async categorizeArticles(articles: { id: string; title: string; content?: string; snippet?: string; source?: string }[]): Promise<Map<string, any>> {
    if (!this.canUseService() || articles.length === 0) return new Map();

    const allResults = new Map<string, any>();
    const batchSize = 10;
    const concurrency = Number.parseInt(process.env.LLM_CONCURRENCY || '2', 10);

    for (let i = 0; i < articles.length; i += batchSize * concurrency) {
      const batches: typeof articles[] = [];
      for (let j = i; j < Math.min(i + batchSize * concurrency, articles.length); j += batchSize) {
        batches.push(articles.slice(j, j + batchSize));
      }

      const results = await Promise.all(
        batches.map(async (batch, batchIndex) => {
          const uncached: typeof batch = [];
          for (const article of batch) {
            const fingerprint = getTitleFingerprint(article.title);
            const cached = await redisCache.getCategorization(fingerprint);
            if (cached) {
              allResults.set(article.id, cached);
            } else {
              uncached.push(article);
            }
          }

          if (uncached.length === 0) return;

          const prompt = uncached.map(a => `Article ID: ${a.id}\nTitle: ${a.title}\nContent: ${(a.content || a.snippet || '').slice(0, 300)}`).join('\n---\n');

          const response = await this.callWithRetry(`categorize-batch-${batchIndex}`, 'LLM-categorize', () =>
            axiosInstance.post<ChatResponse>(
              `${this.baseUrl}/chat/completions`,
              {
                model: this.labelingModel,
                messages: [
                  { role: 'system', content: 'You are a news categorizer. For each article, return a JSON object with an "id" field matching the article ID and a "categories" array of relevant trading categories.' },
                  { role: 'user', content: prompt },
                ],
                temperature: 0.1,
                max_tokens: 2000,
              },
              {
                headers: {
                  'Authorization': `Bearer ${this.apiKey || configManager.get().glm.apiKey}`,
                  'Content-Type': 'application/json',
                },
                timeout: this.timeout,
              }
            )
          );

          if (!response?.data?.choices?.[0]?.message?.content) return;

          try {
            const content = response.data.choices[0].message.content;
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              for (const item of parsed) {
                if (item.id) {
                  allResults.set(item.id, item);
                  const fingerprint = getTitleFingerprint(uncached.find(a => a.id === item.id)?.title || '');
                  if (fingerprint) await redisCache.setCategorization(fingerprint, item);
                }
              }
            }
          } catch {
            logger.debug(`[LLM] categorize batch ${batchIndex} JSON parse failed`);
          }
        })
      );

      const cacheRate = allResults.size > 0 ? (allResults.size / articles.length) * 100 : 0;
      logger.info(`[LLM] Completed ${Math.min(i + batchSize * concurrency, articles.length)}/${articles.length} categorize batches (cache: ${cacheRate.toFixed(1)}%)`);
    }

    logger.info(`[LLM] Total categorized: ${allResults.size} articles`);
    return allResults;
  }

  /**
   * Batch generate event labels
   */
  async batchEventLabels(articles: { id: string; title: string; category?: string; tags?: string[] }[]): Promise<Map<string, any>> {
    if (!this.canUseService() || articles.length === 0) return new Map();

    const allResults = new Map<string, any>();
    const batchSize = 8;
    const concurrency = Number.parseInt(process.env.LLM_CONCURRENCY || '2', 10);

    for (let i = 0; i < articles.length; i += batchSize * concurrency) {
      const batches: typeof articles[] = [];
      for (let j = i; j < Math.min(i + batchSize * concurrency, articles.length); j += batchSize) {
        batches.push(articles.slice(j, j + batchSize));
      }

      const results = await Promise.all(
        batches.map(async (batch, batchIndex) => {
          const uncached: typeof batch = [];
          for (const article of batch) {
            const fingerprint = getTitleFingerprint(article.title);
            const cached = await redisCache.getEventLabel(fingerprint);
            if (cached) {
              allResults.set(article.id, cached);
            } else {
              uncached.push(article);
            }
          }

          if (uncached.length === 0) return;

          const prompt = `Analyze these news articles and return a JSON array of labels.
For each article provide: "id", "topic" (brief topic), "subEventType" (approval|hack|launch|partnership|earnings|regulation|other), "trendDirection" (UP|DOWN|NEUTRAL), "urgency" (CRITICAL|HIGH|MEDIUM|LOW), "keywords" (array of 3-5 keywords).

Articles:
${uncached.map(a => `ID: ${a.id}\nTitle: ${a.title}\nCategory: ${a.category || 'unknown'}`).join('\n---\n')}`;

          const response = await this.callWithRetry(`label-batch-${batchIndex}`, 'LLM-label', () =>
            axiosInstance.post<ChatResponse>(
              `${this.baseUrl}/chat/completions`,
              {
                model: this.labelingModel,
                messages: [
                  { role: 'system', content: 'You are a financial news analyst. Return ONLY a JSON array.' },
                  { role: 'user', content: prompt },
                ],
                temperature: 0.1,
                max_tokens: 3000,
              },
              {
                headers: {
                  'Authorization': `Bearer ${this.apiKey || configManager.get().glm.apiKey}`,
                  'Content-Type': 'application/json',
                },
                timeout: this.timeout,
              }
            )
          );

          if (!response?.data?.choices?.[0]?.message?.content) return;

          try {
            const content = response.data.choices[0].message.content;
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              for (const item of parsed) {
                if (item.id) {
                  allResults.set(item.id, item);
                  const fingerprint = getTitleFingerprint(uncached.find(a => a.id === item.id)?.title || '');
                  if (fingerprint) await redisCache.setEventLabel(fingerprint, item);
                }
              }
            }
          } catch {
            logger.debug(`[LLM] label batch ${batchIndex} JSON parse failed`);
          }
        })
      );

      const processed = Math.min(i + batchSize * concurrency, articles.length);
      logger.info(`[LLM] Completed ${processed}/${articles.length} label batches, ${allResults.size} labeled`);
    }

    logger.info(`[LLM] Total labeled: ${allResults.size} articles`);
    return allResults;
  }

  /**
   * Generate a single event label
   */
  async generateEventLabel(input: { title: string; content?: string; category?: string }): Promise<any> {
    if (!this.canUseService()) return null;

    const prompt = `Analyze this news article:
Title: ${input.title}
${input.content ? `Content: ${input.content.slice(0, 500)}` : ''}
Category: ${input.category || 'unknown'}

Return JSON: {"topic": "...", "subEventType": "...", "trendDirection": "UP|DOWN|NEUTRAL", "urgency": "CRITICAL|HIGH|MEDIUM|LOW", "keywords": ["..."]}`;

    const response = await this.callWithRetry('generateEventLabel', 'LLM-single-label', () =>
      axiosInstance.post<ChatResponse>(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.labelingModel,
          messages: [
            { role: 'system', content: 'You are a financial news analyst. Return ONLY a JSON object.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 500,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey || configManager.get().glm.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      )
    );

    if (!response?.data?.choices?.[0]?.message?.content) return null;

    try {
      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {
      logger.debug('[LLM] generateEventLabel JSON parse failed');
    }

    return null;
  }

  getCacheStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? this.cacheHits / total : 0,
    };
  }
}

const llmService = new LLMService();
export default llmService;
