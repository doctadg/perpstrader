/**
 * Asterdex Client
 * WebSocket and REST API client for Asterdex perpetual exchange
 * Configurable endpoints for easy updates when API docs are available
 */
interface AsterdexConfig {
    wsEndpoint: string;
    restEndpoint: string;
    apiKey?: string;
    reconnectIntervalMs: number;
    heartbeatIntervalMs: number;
    requestTimeoutMs: number;
}
interface AsterdexMarket {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    markPrice: number;
    indexPrice: number;
    fundingRate: number;
    nextFundingTime: number;
    openInterest: number;
    volume24h: number;
    high24h: number;
    low24h: number;
    priceChange24h: number;
    priceChangePercent24h: number;
    maxLeverage: number;
    minOrderSize: number;
    tickSize: number;
    isActive: boolean;
}
interface AsterdexFundingRate {
    symbol: string;
    fundingRate: number;
    annualizedRate: number;
    nextFundingTime: number;
    markPrice: number;
    indexPrice: number;
    predictedFundingRate?: number;
    timestamp: number;
}
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
declare class AsterdexClient {
    private config;
    private ws;
    private connectionState;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectTimer;
    private heartbeatTimer;
    private messageHandlers;
    private fundingCache;
    private marketsCache;
    private lastMarketsUpdate;
    private marketsCacheTtlMs;
    constructor();
    /**
     * Initialize and connect WebSocket
     */
    initialize(): Promise<void>;
    /**
     * Connect to Asterdex WebSocket
     */
    connectWebSocket(): Promise<void>;
    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage;
    /**
     * Handle single funding rate update
     */
    private handleFundingRateUpdate;
    /**
     * Handle batch funding rates update
     */
    private handleFundingRatesBatch;
    /**
     * Handle market data update
     */
    private handleMarketDataUpdate;
    /**
     * Subscribe to funding rate updates
     */
    private subscribeToFundingRates;
    /**
     * Subscribe to specific symbol
     */
    subscribeToSymbol(symbol: string): void;
    /**
     * Unsubscribe from specific symbol
     */
    unsubscribeFromSymbol(symbol: string): void;
    /**
     * Register message handler
     */
    onMessage(type: string, handler: (data: any) => void): void;
    /**
     * Remove message handler
     */
    offMessage(type: string, handler: (data: any) => void): void;
    /**
     * Start heartbeat to keep connection alive
     */
    private startHeartbeat;
    /**
     * Stop heartbeat
     */
    private stopHeartbeat;
    /**
     * Schedule reconnection attempt
     */
    private scheduleReconnect;
    /**
     * Disconnect WebSocket
     */
    disconnect(): void;
    /**
     * Get connection state
     */
    getConnectionState(): ConnectionState;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * REST API: Get all funding rates
     */
    getFundingRates(): Promise<AsterdexFundingRate[]>;
    /**
     * REST API: Get funding rate for specific symbol
     */
    getFundingRate(symbol: string): Promise<AsterdexFundingRate | null>;
    /**
     * REST API: Get all available markets
     */
    getMarkets(): Promise<AsterdexMarket[]>;
    /**
     * REST API: Get specific market info
     */
    getMarketInfo(symbol: string): Promise<AsterdexMarket | null>;
    /**
     * Get funding rate history for a symbol
     */
    getFundingHistory(symbol: string, limit?: number): Promise<AsterdexFundingRate[]>;
    /**
     * Calculate annualized funding rate
     * Assumes funding paid every 8 hours (3x per day)
     */
    private calculateAnnualizedRate;
    /**
     * Parse funding rates response
     */
    private parseFundingRatesResponse;
    /**
     * Parse single funding rate response
     */
    private parseFundingRateResponse;
    /**
     * Parse markets response
     */
    private parseMarketsResponse;
    /**
     * Parse single market response
     */
    private parseMarketResponse;
    /**
     * Parse funding history response
     */
    private parseFundingHistoryResponse;
    /**
     * Get mock funding rates for development
     * Remove when API is available
     */
    private getMockFundingRates;
    /**
     * Get mock markets for development
     * Remove when API is available
     */
    private getMockMarkets;
    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<AsterdexConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): AsterdexConfig;
}
export declare const asterdexClient: AsterdexClient;
export default asterdexClient;
export type { AsterdexConfig, AsterdexMarket, AsterdexFundingRate, ConnectionState };
//# sourceMappingURL=asterdex-client.d.ts.map