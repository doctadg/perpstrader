"use strict";
/**
 * Asterdex Client
 * WebSocket and REST API client for Asterdex perpetual exchange
 * Configurable endpoints for easy updates when API docs are available
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asterdexClient = void 0;
const ws_1 = __importDefault(require("ws"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../shared/logger"));
const config_1 = __importDefault(require("../shared/config"));
class AsterdexClient {
    config;
    ws = null;
    connectionState = 'disconnected';
    reconnectAttempts = 0;
    maxReconnectAttempts = 10;
    reconnectTimer = null;
    heartbeatTimer = null;
    messageHandlers = new Map();
    fundingCache = new Map();
    marketsCache = [];
    lastMarketsUpdate = 0;
    marketsCacheTtlMs = 60000; // 1 minute
    constructor() {
        // Load config from environment or use defaults
        const asterdexConfig = config_1.default.getSection('asterdex') || {};
        this.config = {
            wsEndpoint: process.env.ASTERDEX_WS_ENDPOINT || asterdexConfig.wsEndpoint || 'wss://api.asterdex.io/ws/v1',
            restEndpoint: process.env.ASTERDEX_REST_ENDPOINT || asterdexConfig.restEndpoint || 'https://api.asterdex.io/v1',
            apiKey: process.env.ASTERDEX_API_KEY || asterdexConfig.apiKey,
            reconnectIntervalMs: 5000,
            heartbeatIntervalMs: 30000,
            requestTimeoutMs: 30000,
        };
    }
    /**
     * Initialize and connect WebSocket
     */
    async initialize() {
        if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
            return;
        }
        await this.connectWebSocket();
    }
    /**
     * Connect to Asterdex WebSocket
     */
    async connectWebSocket() {
        if (this.ws?.readyState === ws_1.default.OPEN) {
            logger_1.default.info('[AsterdexClient] WebSocket already connected');
            return;
        }
        this.connectionState = 'connecting';
        logger_1.default.info(`[AsterdexClient] Connecting to WebSocket: ${this.config.wsEndpoint}`);
        try {
            const headers = {};
            if (this.config.apiKey) {
                headers['X-API-Key'] = this.config.apiKey;
            }
            this.ws = new ws_1.default(this.config.wsEndpoint, { headers });
            this.ws.on('open', () => {
                logger_1.default.info('[AsterdexClient] WebSocket connected');
                this.connectionState = 'connected';
                this.reconnectAttempts = 0;
                this.startHeartbeat();
                this.subscribeToFundingRates();
            });
            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });
            this.ws.on('close', (code, reason) => {
                logger_1.default.warn(`[AsterdexClient] WebSocket closed: ${code} - ${reason.toString()}`);
                this.connectionState = 'disconnected';
                this.stopHeartbeat();
                this.scheduleReconnect();
            });
            this.ws.on('error', (error) => {
                logger_1.default.error('[AsterdexClient] WebSocket error:', error);
                this.connectionState = 'disconnected';
                this.scheduleReconnect();
            });
        }
        catch (error) {
            logger_1.default.error('[AsterdexClient] Failed to connect WebSocket:', error);
            this.connectionState = 'disconnected';
            this.scheduleReconnect();
        }
    }
    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            // Handle different message types
            switch (message.type) {
                case 'funding_rate':
                    this.handleFundingRateUpdate(message.data);
                    break;
                case 'funding_rates':
                    this.handleFundingRatesBatch(message.data);
                    break;
                case 'market_data':
                    this.handleMarketDataUpdate(message.data);
                    break;
                case 'heartbeat':
                    // Heartbeat received, connection is alive
                    break;
                case 'error':
                    logger_1.default.error('[AsterdexClient] WebSocket error message:', message.data);
                    break;
                default:
                    // Handle other message types or log unknown
                    logger_1.default.debug('[AsterdexClient] Unknown message type:', message.type);
            }
            // Notify registered handlers
            const handlers = this.messageHandlers.get(message.type) || [];
            handlers.forEach(handler => {
                try {
                    handler(message.data);
                }
                catch (err) {
                    logger_1.default.error('[AsterdexClient] Handler error:', err);
                }
            });
        }
        catch (error) {
            logger_1.default.error('[AsterdexClient] Failed to parse message:', error);
        }
    }
    /**
     * Handle single funding rate update
     */
    handleFundingRateUpdate(data) {
        if (!data || !data.symbol)
            return;
        const fundingRate = {
            symbol: data.symbol.toUpperCase(),
            fundingRate: parseFloat(data.fundingRate) || 0,
            annualizedRate: this.calculateAnnualizedRate(parseFloat(data.fundingRate) || 0),
            nextFundingTime: data.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
            markPrice: parseFloat(data.markPrice) || 0,
            indexPrice: parseFloat(data.indexPrice) || 0,
            predictedFundingRate: data.predictedFundingRate ? parseFloat(data.predictedFundingRate) : undefined,
            timestamp: data.timestamp || Date.now(),
        };
        this.fundingCache.set(fundingRate.symbol, fundingRate);
        logger_1.default.debug(`[AsterdexClient] Funding rate update: ${fundingRate.symbol} = ${fundingRate.fundingRate}`);
    }
    /**
     * Handle batch funding rates update
     */
    handleFundingRatesBatch(data) {
        if (!Array.isArray(data))
            return;
        for (const item of data) {
            this.handleFundingRateUpdate(item);
        }
        logger_1.default.debug(`[AsterdexClient] Batch funding rates update: ${data.length} symbols`);
    }
    /**
     * Handle market data update
     */
    handleMarketDataUpdate(data) {
        if (!data)
            return;
        // Update markets cache if needed
        logger_1.default.debug('[AsterdexClient] Market data update received');
    }
    /**
     * Subscribe to funding rate updates
     */
    subscribeToFundingRates() {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN)
            return;
        const subscribeMsg = {
            type: 'subscribe',
            channel: 'funding_rates',
        };
        this.ws.send(JSON.stringify(subscribeMsg));
        logger_1.default.info('[AsterdexClient] Subscribed to funding rate updates');
    }
    /**
     * Subscribe to specific symbol
     */
    subscribeToSymbol(symbol) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            logger_1.default.warn('[AsterdexClient] Cannot subscribe, WebSocket not connected');
            return;
        }
        const subscribeMsg = {
            type: 'subscribe',
            channel: 'ticker',
            symbol: symbol.toUpperCase(),
        };
        this.ws.send(JSON.stringify(subscribeMsg));
        logger_1.default.info(`[AsterdexClient] Subscribed to ${symbol}`);
    }
    /**
     * Unsubscribe from specific symbol
     */
    unsubscribeFromSymbol(symbol) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN)
            return;
        const unsubscribeMsg = {
            type: 'unsubscribe',
            channel: 'ticker',
            symbol: symbol.toUpperCase(),
        };
        this.ws.send(JSON.stringify(unsubscribeMsg));
    }
    /**
     * Register message handler
     */
    onMessage(type, handler) {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, []);
        }
        this.messageHandlers.get(type).push(handler);
    }
    /**
     * Remove message handler
     */
    offMessage(type, handler) {
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }
    /**
     * Start heartbeat to keep connection alive
     */
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.ws?.readyState === ws_1.default.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, this.config.heartbeatIntervalMs);
    }
    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
            return;
        }
        this.reconnectAttempts++;
        const delay = Math.min(this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1), 60000 // Max 1 minute delay
        );
        logger_1.default.info(`[AsterdexClient] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWebSocket();
        }, delay);
    }
    /**
     * Disconnect WebSocket
     */
    disconnect() {
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectionState = 'disconnected';
        logger_1.default.info('[AsterdexClient] Disconnected');
    }
    /**
     * Get connection state
     */
    getConnectionState() {
        return this.connectionState;
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.connectionState === 'connected' && this.ws?.readyState === ws_1.default.OPEN;
    }
    /**
     * REST API: Get all funding rates
     */
    async getFundingRates() {
        try {
            // If we have fresh WebSocket data, use that
            if (this.fundingCache.size > 0 && this.isConnected()) {
                return Array.from(this.fundingCache.values());
            }
            // Otherwise, fetch via REST API
            const response = await axios_1.default.get(`${this.config.restEndpoint}/funding/rates`, {
                headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                timeout: this.config.requestTimeoutMs,
            });
            const rates = this.parseFundingRatesResponse(response.data);
            // Update cache
            for (const rate of rates) {
                this.fundingCache.set(rate.symbol, rate);
            }
            return rates;
        }
        catch (error) {
            logger_1.default.error('[AsterdexClient] Failed to get funding rates:', error);
            // Return cached data if available
            if (this.fundingCache.size > 0) {
                logger_1.default.warn('[AsterdexClient] Returning cached funding rates');
                return Array.from(this.fundingCache.values());
            }
            // Return mock data for development (remove in production)
            return this.getMockFundingRates();
        }
    }
    /**
     * REST API: Get funding rate for specific symbol
     */
    async getFundingRate(symbol) {
        const upperSymbol = symbol.toUpperCase();
        // Check cache first
        const cached = this.fundingCache.get(upperSymbol);
        if (cached && Date.now() - cached.timestamp < 60000) {
            return cached;
        }
        try {
            const response = await axios_1.default.get(`${this.config.restEndpoint}/funding/rates/${upperSymbol}`, {
                headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                timeout: this.config.requestTimeoutMs,
            });
            const rate = this.parseFundingRateResponse(response.data);
            if (rate) {
                this.fundingCache.set(rate.symbol, rate);
            }
            return rate;
        }
        catch (error) {
            logger_1.default.error(`[AsterdexClient] Failed to get funding rate for ${symbol}:`, error);
            return cached || null;
        }
    }
    /**
     * REST API: Get all available markets
     */
    async getMarkets() {
        // Return cached if fresh
        if (this.marketsCache.length > 0 && Date.now() - this.lastMarketsUpdate < this.marketsCacheTtlMs) {
            return this.marketsCache;
        }
        try {
            const response = await axios_1.default.get(`${this.config.restEndpoint}/markets`, {
                headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                timeout: this.config.requestTimeoutMs,
            });
            const markets = this.parseMarketsResponse(response.data);
            this.marketsCache = markets;
            this.lastMarketsUpdate = Date.now();
            return markets;
        }
        catch (error) {
            logger_1.default.error('[AsterdexClient] Failed to get markets:', error);
            if (this.marketsCache.length > 0) {
                return this.marketsCache;
            }
            // Return mock markets for development
            return this.getMockMarkets();
        }
    }
    /**
     * REST API: Get specific market info
     */
    async getMarketInfo(symbol) {
        const upperSymbol = symbol.toUpperCase();
        // Check cache first
        const cached = this.marketsCache.find(m => m.symbol === upperSymbol);
        if (cached && Date.now() - this.lastMarketsUpdate < this.marketsCacheTtlMs) {
            return cached;
        }
        try {
            const response = await axios_1.default.get(`${this.config.restEndpoint}/markets/${upperSymbol}`, {
                headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                timeout: this.config.requestTimeoutMs,
            });
            return this.parseMarketResponse(response.data);
        }
        catch (error) {
            logger_1.default.error(`[AsterdexClient] Failed to get market info for ${symbol}:`, error);
            return cached || null;
        }
    }
    /**
     * Get funding rate history for a symbol
     */
    async getFundingHistory(symbol, limit = 100) {
        try {
            const response = await axios_1.default.get(`${this.config.restEndpoint}/funding/history/${symbol.toUpperCase()}`, {
                params: { limit },
                headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
                timeout: this.config.requestTimeoutMs,
            });
            return this.parseFundingHistoryResponse(response.data);
        }
        catch (error) {
            logger_1.default.error(`[AsterdexClient] Failed to get funding history for ${symbol}:`, error);
            return [];
        }
    }
    /**
     * Calculate annualized funding rate
     * Assumes funding paid every 8 hours (3x per day)
     */
    calculateAnnualizedRate(fundingRate) {
        return fundingRate * 3 * 365;
    }
    /**
     * Parse funding rates response
     */
    parseFundingRatesResponse(data) {
        if (!data)
            return [];
        // Handle different response formats
        const rates = Array.isArray(data) ? data : data.rates || data.data || [];
        return rates.map((item) => ({
            symbol: (item.symbol || item.coin || item.asset || 'UNKNOWN').toUpperCase(),
            fundingRate: parseFloat(item.fundingRate || item.funding || item.rate || 0),
            annualizedRate: parseFloat(item.annualizedRate || item.apr || 0) ||
                this.calculateAnnualizedRate(parseFloat(item.fundingRate || item.funding || 0)),
            nextFundingTime: item.nextFundingTime || item.nextFunding || Date.now() + (8 * 60 * 60 * 1000),
            markPrice: parseFloat(item.markPrice || item.markPx || 0),
            indexPrice: parseFloat(item.indexPrice || item.indexPx || 0),
            predictedFundingRate: item.predictedFundingRate ? parseFloat(item.predictedFundingRate) : undefined,
            timestamp: item.timestamp || Date.now(),
        }));
    }
    /**
     * Parse single funding rate response
     */
    parseFundingRateResponse(data) {
        if (!data)
            return null;
        const item = data.data || data;
        return {
            symbol: (item.symbol || item.coin || 'UNKNOWN').toUpperCase(),
            fundingRate: parseFloat(item.fundingRate || item.funding || 0),
            annualizedRate: parseFloat(item.annualizedRate || 0) ||
                this.calculateAnnualizedRate(parseFloat(item.fundingRate || 0)),
            nextFundingTime: item.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
            markPrice: parseFloat(item.markPrice || 0),
            indexPrice: parseFloat(item.indexPrice || 0),
            predictedFundingRate: item.predictedFundingRate ? parseFloat(item.predictedFundingRate) : undefined,
            timestamp: item.timestamp || Date.now(),
        };
    }
    /**
     * Parse markets response
     */
    parseMarketsResponse(data) {
        if (!data)
            return [];
        const markets = Array.isArray(data) ? data : data.markets || data.data || [];
        return markets.map((item) => ({
            symbol: (item.symbol || item.coin || item.name || 'UNKNOWN').toUpperCase(),
            baseAsset: item.baseAsset || item.base || item.symbol?.split('-')[0] || 'UNKNOWN',
            quoteAsset: item.quoteAsset || item.quote || 'USD',
            markPrice: parseFloat(item.markPrice || item.markPx || 0),
            indexPrice: parseFloat(item.indexPrice || item.indexPx || 0),
            fundingRate: parseFloat(item.fundingRate || item.funding || 0),
            nextFundingTime: item.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
            openInterest: parseFloat(item.openInterest || item.oi || 0),
            volume24h: parseFloat(item.volume24h || item.vol24h || item.dayNtlVlm || 0),
            high24h: parseFloat(item.high24h || item.high || 0),
            low24h: parseFloat(item.low24h || item.low || 0),
            priceChange24h: parseFloat(item.priceChange24h || item.change24h || 0),
            priceChangePercent24h: parseFloat(item.priceChangePercent24h || item.changePercent24h || 0),
            maxLeverage: parseFloat(item.maxLeverage || item.maxLvg || 20),
            minOrderSize: parseFloat(item.minOrderSize || item.minSz || 0),
            tickSize: parseFloat(item.tickSize || 0.01),
            isActive: item.isActive !== false && item.status !== 'inactive',
        }));
    }
    /**
     * Parse single market response
     */
    parseMarketResponse(data) {
        if (!data)
            return null;
        const item = data.data || data;
        return {
            symbol: (item.symbol || item.coin || 'UNKNOWN').toUpperCase(),
            baseAsset: item.baseAsset || item.base || 'UNKNOWN',
            quoteAsset: item.quoteAsset || item.quote || 'USD',
            markPrice: parseFloat(item.markPrice || 0),
            indexPrice: parseFloat(item.indexPrice || 0),
            fundingRate: parseFloat(item.fundingRate || 0),
            nextFundingTime: item.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
            openInterest: parseFloat(item.openInterest || 0),
            volume24h: parseFloat(item.volume24h || 0),
            high24h: parseFloat(item.high24h || 0),
            low24h: parseFloat(item.low24h || 0),
            priceChange24h: parseFloat(item.priceChange24h || 0),
            priceChangePercent24h: parseFloat(item.priceChangePercent24h || 0),
            maxLeverage: parseFloat(item.maxLeverage || 20),
            minOrderSize: parseFloat(item.minOrderSize || 0),
            tickSize: parseFloat(item.tickSize || 0.01),
            isActive: item.isActive !== false,
        };
    }
    /**
     * Parse funding history response
     */
    parseFundingHistoryResponse(data) {
        if (!data)
            return [];
        const history = Array.isArray(data) ? data : data.history || data.data || [];
        return history.map((item) => ({
            symbol: (item.symbol || 'UNKNOWN').toUpperCase(),
            fundingRate: parseFloat(item.fundingRate || item.funding || 0),
            annualizedRate: parseFloat(item.annualizedRate || 0),
            nextFundingTime: item.nextFundingTime || 0,
            markPrice: parseFloat(item.markPrice || 0),
            indexPrice: parseFloat(item.indexPrice || 0),
            timestamp: item.timestamp || item.time || Date.now(),
        }));
    }
    /**
     * Get mock funding rates for development
     * Remove when API is available
     */
    getMockFundingRates() {
        const symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE', 'PEPE', 'WIF'];
        const now = Date.now();
        return symbols.map(symbol => {
            // Generate realistic funding rates (-0.01% to +0.01%)
            const fundingRate = (Math.random() - 0.5) * 0.0002;
            return {
                symbol,
                fundingRate,
                annualizedRate: this.calculateAnnualizedRate(fundingRate),
                nextFundingTime: now + (8 * 60 * 60 * 1000),
                markPrice: 10000 + Math.random() * 90000,
                indexPrice: 10000 + Math.random() * 90000,
                timestamp: now,
            };
        });
    }
    /**
     * Get mock markets for development
     * Remove when API is available
     */
    getMockMarkets() {
        const symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'OP', 'LINK', 'DOGE', 'PEPE', 'WIF'];
        return symbols.map(symbol => ({
            symbol,
            baseAsset: symbol,
            quoteAsset: 'USD',
            markPrice: 10000 + Math.random() * 90000,
            indexPrice: 10000 + Math.random() * 90000,
            fundingRate: (Math.random() - 0.5) * 0.0002,
            nextFundingTime: Date.now() + (8 * 60 * 60 * 1000),
            openInterest: 1000000 + Math.random() * 10000000,
            volume24h: 10000000 + Math.random() * 100000000,
            high24h: 50000 + Math.random() * 50000,
            low24h: 40000 + Math.random() * 40000,
            priceChange24h: (Math.random() - 0.5) * 1000,
            priceChangePercent24h: (Math.random() - 0.5) * 10,
            maxLeverage: 20,
            minOrderSize: 0.001,
            tickSize: 0.01,
            isActive: true,
        }));
    }
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger_1.default.info('[AsterdexClient] Configuration updated');
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
// Export singleton instance
exports.asterdexClient = new AsterdexClient();
exports.default = exports.asterdexClient;
//# sourceMappingURL=asterdex-client.js.map