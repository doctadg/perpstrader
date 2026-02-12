// Resilient API Client - Circuit Breaker, Retry Logic, and Exponential Backoff
// Production-grade HTTP client for external API calls

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import logger from '../../shared/logger';

export interface ResilientClientConfig {
  name: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  retryableStatuses?: number[];
  rateLimitStatus?: number;
}

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class CircuitBreakerOpenError extends Error {
  constructor(service: string) {
    super(`Circuit breaker open for ${service}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class RateLimitError extends Error {
  public retryAfter: number;
  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter}ms`);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class ResilientApiClient {
  private client: AxiosInstance;
  private config: Required<ResilientClientConfig>;
  private circuit: CircuitState;
  private requestCount = 0;
  private errorCount = 0;
  private lastRequestTime = 0;
  private minRequestInterval = 100; // Minimum 100ms between requests

  constructor(config: ResilientClientConfig) {
    this.config = {
      name: config.name,
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3,
      baseDelayMs: config.baseDelayMs || 1000,
      maxDelayMs: config.maxDelayMs || 30000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerResetMs: config.circuitBreakerResetMs || 60000,
      retryableStatuses: config.retryableStatuses || [408, 429, 500, 502, 503, 504],
      rateLimitStatus: config.rateLimitStatus || 429,
    };

    this.circuit = {
      failures: 0,
      lastFailure: 0,
      state: 'CLOSED',
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `PerpsTrader/2.0 (${config.name})`,
      },
    });

    // Request interceptor for rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.enforceRateLimit();
      return config;
    });

    // Response interceptor for metrics
    this.client.interceptors.response.use(
      (response) => {
        this.onSuccess();
        return response;
      },
      (error) => {
        this.onError(error);
        return Promise.reject(error);
      }
    );
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await this.sleep(waitTime);
    }
    
    this.lastRequestTime = Date.now();
  }

  private onSuccess(): void {
    this.requestCount++;
    
    // Reset circuit breaker on success if in HALF_OPEN state
    if (this.circuit.state === 'HALF_OPEN') {
      this.circuit.state = 'CLOSED';
      this.circuit.failures = 0;
      logger.info(`[ResilientClient:${this.config.name}] Circuit breaker closed`);
    }
  }

  private onError(error: AxiosError): void {
    this.errorCount++;
    
    const status = error.response?.status;
    
    // Record failure for circuit breaker
    if (status && status >= 500) {
      this.recordFailure();
    }
  }

  private recordFailure(): void {
    this.circuit.failures++;
    this.circuit.lastFailure = Date.now();
    
    if (this.circuit.failures >= this.config.circuitBreakerThreshold) {
      this.circuit.state = 'OPEN';
      logger.error(`[ResilientClient:${this.config.name}] Circuit breaker opened after ${this.circuit.failures} failures`);
    }
  }

  private checkCircuitBreaker(): void {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.circuit.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.circuit.lastFailure;
      if (timeSinceLastFailure >= this.config.circuitBreakerResetMs) {
        this.circuit.state = 'HALF_OPEN';
        logger.info(`[ResilientClient:${this.config.name}] Circuit breaker half-open, testing...`);
      } else {
        throw new CircuitBreakerOpenError(this.config.name);
      }
    }
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
    const delay = Math.min(baseDelay + jitter, this.config.maxDelayMs);
    return delay;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRetryableError(error: AxiosError): boolean {
    if (!error.response) {
      // Network errors (timeout, DNS, etc.) are retryable
      return true;
    }
    
    const status = error.response.status;
    
    // Special handling for rate limits
    if (status === this.config.rateLimitStatus) {
      return true;
    }
    
    return this.config.retryableStatuses.includes(status);
  }

  private getRetryAfter(error: AxiosError): number {
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      // retry-after can be seconds or HTTP date
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }
    return this.config.baseDelayMs;
  }

  public async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.requestWithRetry<T>('GET', url, undefined, config);
  }

  public async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.requestWithRetry<T>('POST', url, data, config);
  }

  public async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.requestWithRetry<T>('PUT', url, data, config);
  }

  public async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.requestWithRetry<T>('DELETE', url, undefined, config);
  }

  private async requestWithRetry<T>(
    method: string,
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    this.checkCircuitBreaker();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.client.request<T>({
          method,
          url,
          data,
          ...config,
        });
        
        return response.data;
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;

        // Don't retry on the last attempt
        if (attempt === this.config.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (!this.isRetryableError(axiosError)) {
          throw error;
        }

        // Handle rate limiting specially
        if (axiosError.response?.status === this.config.rateLimitStatus) {
          const retryAfter = this.getRetryAfter(axiosError);
          logger.warn(`[ResilientClient:${this.config.name}] Rate limited, waiting ${retryAfter}ms`);
          await this.sleep(retryAfter);
          continue;
        }

        // Calculate backoff delay
        const delay = this.calculateBackoff(attempt);
        logger.warn(
          `[ResilientClient:${this.config.name}] Request failed (attempt ${attempt + 1}/${this.config.maxRetries + 1}), ` +
          `retrying in ${delay.toFixed(0)}ms: ${axiosError.message}`
        );
        
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    throw lastError || new Error(`Request failed after ${this.config.maxRetries + 1} attempts`);
  }

  public getHealth(): {
    healthy: boolean;
    circuitState: string;
    requestCount: number;
    errorCount: number;
    errorRate: number;
  } {
    const errorRate = this.requestCount > 0 ? this.errorCount / this.requestCount : 0;
    
    return {
      healthy: this.circuit.state === 'CLOSED' && errorRate < 0.1,
      circuitState: this.circuit.state,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate,
    };
  }

  public resetCircuit(): void {
    this.circuit.state = 'CLOSED';
    this.circuit.failures = 0;
    this.circuit.lastFailure = 0;
    logger.info(`[ResilientClient:${this.config.name}] Circuit breaker manually reset`);
  }
}

// Pre-configured clients for different services
export const polymarketGammaClient = new ResilientApiClient({
  name: 'polymarket-gamma',
  baseURL: process.env.POLYMARKET_API_BASE || 'https://gamma-api.polymarket.com',
  timeout: 30000,
  maxRetries: 3,
  baseDelayMs: 1000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
});

export const polymarketClobClient = new ResilientApiClient({
  name: 'polymarket-clob',
  baseURL: process.env.POLYMARKET_CLOB_BASE || 'https://clob.polymarket.com',
  timeout: 30000,
  maxRetries: 3,
  baseDelayMs: 1000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
});

export const priceHistoryClient = new ResilientApiClient({
  name: 'price-history',
  baseURL: 'https://clob.polymarket.com',
  timeout: 15000,
  maxRetries: 2,
  baseDelayMs: 500,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 30000,
});

export default ResilientApiClient;
