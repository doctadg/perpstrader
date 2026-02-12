"use strict";
// Resilient API Client - Circuit Breaker, Retry Logic, and Exponential Backoff
// Production-grade HTTP client for external API calls
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceHistoryClient = exports.polymarketClobClient = exports.polymarketGammaClient = exports.ResilientApiClient = exports.RateLimitError = exports.CircuitBreakerOpenError = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../../shared/logger"));
class CircuitBreakerOpenError extends Error {
    constructor(service) {
        super(`Circuit breaker open for ${service}`);
        this.name = 'CircuitBreakerOpenError';
    }
}
exports.CircuitBreakerOpenError = CircuitBreakerOpenError;
class RateLimitError extends Error {
    retryAfter;
    constructor(retryAfter) {
        super(`Rate limit exceeded. Retry after ${retryAfter}ms`);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}
exports.RateLimitError = RateLimitError;
class ResilientApiClient {
    client;
    config;
    circuit;
    requestCount = 0;
    errorCount = 0;
    lastRequestTime = 0;
    minRequestInterval = 100; // Minimum 100ms between requests
    constructor(config) {
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
        this.client = axios_1.default.create({
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
        this.client.interceptors.response.use((response) => {
            this.onSuccess();
            return response;
        }, (error) => {
            this.onError(error);
            return Promise.reject(error);
        });
    }
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            await this.sleep(waitTime);
        }
        this.lastRequestTime = Date.now();
    }
    onSuccess() {
        this.requestCount++;
        // Reset circuit breaker on success if in HALF_OPEN state
        if (this.circuit.state === 'HALF_OPEN') {
            this.circuit.state = 'CLOSED';
            this.circuit.failures = 0;
            logger_1.default.info(`[ResilientClient:${this.config.name}] Circuit breaker closed`);
        }
    }
    onError(error) {
        this.errorCount++;
        const status = error.response?.status;
        // Record failure for circuit breaker
        if (status && status >= 500) {
            this.recordFailure();
        }
    }
    recordFailure() {
        this.circuit.failures++;
        this.circuit.lastFailure = Date.now();
        if (this.circuit.failures >= this.config.circuitBreakerThreshold) {
            this.circuit.state = 'OPEN';
            logger_1.default.error(`[ResilientClient:${this.config.name}] Circuit breaker opened after ${this.circuit.failures} failures`);
        }
    }
    checkCircuitBreaker() {
        // Check if circuit should transition from OPEN to HALF_OPEN
        if (this.circuit.state === 'OPEN') {
            const timeSinceLastFailure = Date.now() - this.circuit.lastFailure;
            if (timeSinceLastFailure >= this.config.circuitBreakerResetMs) {
                this.circuit.state = 'HALF_OPEN';
                logger_1.default.info(`[ResilientClient:${this.config.name}] Circuit breaker half-open, testing...`);
            }
            else {
                throw new CircuitBreakerOpenError(this.config.name);
            }
        }
    }
    calculateBackoff(attempt) {
        // Exponential backoff with jitter
        const baseDelay = this.config.baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
        const delay = Math.min(baseDelay + jitter, this.config.maxDelayMs);
        return delay;
    }
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    isRetryableError(error) {
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
    getRetryAfter(error) {
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
    async get(url, config) {
        return this.requestWithRetry('GET', url, undefined, config);
    }
    async post(url, data, config) {
        return this.requestWithRetry('POST', url, data, config);
    }
    async put(url, data, config) {
        return this.requestWithRetry('PUT', url, data, config);
    }
    async delete(url, config) {
        return this.requestWithRetry('DELETE', url, undefined, config);
    }
    async requestWithRetry(method, url, data, config) {
        this.checkCircuitBreaker();
        let lastError = null;
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await this.client.request({
                    method,
                    url,
                    data,
                    ...config,
                });
                return response.data;
            }
            catch (error) {
                lastError = error;
                const axiosError = error;
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
                    logger_1.default.warn(`[ResilientClient:${this.config.name}] Rate limited, waiting ${retryAfter}ms`);
                    await this.sleep(retryAfter);
                    continue;
                }
                // Calculate backoff delay
                const delay = this.calculateBackoff(attempt);
                logger_1.default.warn(`[ResilientClient:${this.config.name}] Request failed (attempt ${attempt + 1}/${this.config.maxRetries + 1}), ` +
                    `retrying in ${delay.toFixed(0)}ms: ${axiosError.message}`);
                await this.sleep(delay);
            }
        }
        // All retries exhausted
        throw lastError || new Error(`Request failed after ${this.config.maxRetries + 1} attempts`);
    }
    getHealth() {
        const errorRate = this.requestCount > 0 ? this.errorCount / this.requestCount : 0;
        return {
            healthy: this.circuit.state === 'CLOSED' && errorRate < 0.1,
            circuitState: this.circuit.state,
            requestCount: this.requestCount,
            errorCount: this.errorCount,
            errorRate,
        };
    }
    resetCircuit() {
        this.circuit.state = 'CLOSED';
        this.circuit.failures = 0;
        this.circuit.lastFailure = 0;
        logger_1.default.info(`[ResilientClient:${this.config.name}] Circuit breaker manually reset`);
    }
}
exports.ResilientApiClient = ResilientApiClient;
// Pre-configured clients for different services
exports.polymarketGammaClient = new ResilientApiClient({
    name: 'polymarket-gamma',
    baseURL: process.env.POLYMARKET_API_BASE || 'https://gamma-api.polymarket.com',
    timeout: 30000,
    maxRetries: 3,
    baseDelayMs: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
});
exports.polymarketClobClient = new ResilientApiClient({
    name: 'polymarket-clob',
    baseURL: process.env.POLYMARKET_CLOB_BASE || 'https://clob.polymarket.com',
    timeout: 30000,
    maxRetries: 3,
    baseDelayMs: 1000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000,
});
exports.priceHistoryClient = new ResilientApiClient({
    name: 'price-history',
    baseURL: 'https://clob.polymarket.com',
    timeout: 15000,
    maxRetries: 2,
    baseDelayMs: 500,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 30000,
});
exports.default = ResilientApiClient;
//# sourceMappingURL=resilient-api-client.js.map