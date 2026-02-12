import { AxiosRequestConfig } from 'axios';
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
export declare class CircuitBreakerOpenError extends Error {
    constructor(service: string);
}
export declare class RateLimitError extends Error {
    retryAfter: number;
    constructor(retryAfter: number);
}
export declare class ResilientApiClient {
    private client;
    private config;
    private circuit;
    private requestCount;
    private errorCount;
    private lastRequestTime;
    private minRequestInterval;
    constructor(config: ResilientClientConfig);
    private enforceRateLimit;
    private onSuccess;
    private onError;
    private recordFailure;
    private checkCircuitBreaker;
    private calculateBackoff;
    private sleep;
    private isRetryableError;
    private getRetryAfter;
    get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
    post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
    put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
    delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
    private requestWithRetry;
    getHealth(): {
        healthy: boolean;
        circuitState: string;
        requestCount: number;
        errorCount: number;
        errorRate: number;
    };
    resetCircuit(): void;
}
export declare const polymarketGammaClient: ResilientApiClient;
export declare const polymarketClobClient: ResilientApiClient;
export declare const priceHistoryClient: ResilientApiClient;
export default ResilientApiClient;
//# sourceMappingURL=resilient-api-client.d.ts.map