/**
 * Asterdex Client
 * WebSocket and REST API client for Asterdex perpetual exchange
 * Uses Binance-compatible Aster Futures endpoints.
 */

import WebSocket from 'ws';
import axios from 'axios';
import logger from '../shared/logger';
import config from '../shared/config';

// Asterdex Configuration (update these when API docs are available)
interface AsterdexConfig {
  wsEndpoint: string;
  restEndpoint: string;
  apiKey?: string;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
  requestTimeoutMs: number;
}

// Asterdex Market Data Structure
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

// Funding Rate Data
interface AsterdexFundingRate {
  symbol: string;
  fundingRate: number;
  annualizedRate: number;
  nextFundingTime: number;
  markPrice: number;
  indexPrice: number;
  volume24h?: number;
  predictedFundingRate?: number;
  timestamp: number;
}

// WebSocket Message Types
interface WSMessage {
  type: string;
  channel?: string;
  symbol?: string;
  data?: any;
  timestamp?: number;
}

// Connection State
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

class AsterdexClient {
  private config: AsterdexConfig;
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private fundingCache: Map<string, AsterdexFundingRate> = new Map();
  private marketsCache: AsterdexMarket[] = [];
  private lastMarketsUpdate: number = 0;
  private marketsCacheTtlMs: number = 60000; // 1 minute
  private readonly quoteSuffixes = ['USDT', 'USD', 'USDC', 'FDUSD', 'BUSD'];

  constructor() {
    // Load config from environment or use defaults
    const asterdexConfig = config.getSection('asterdex') || {};
    
    this.config = {
      wsEndpoint: process.env.ASTERDEX_WS_ENDPOINT || asterdexConfig.wsEndpoint || 'wss://fstream.asterdex.com/ws',
      restEndpoint: process.env.ASTERDEX_REST_ENDPOINT || asterdexConfig.restEndpoint || 'https://fapi.asterdex.com/fapi/v1',
      apiKey: process.env.ASTERDEX_API_KEY || asterdexConfig.apiKey,
      reconnectIntervalMs: 5000,
      heartbeatIntervalMs: 30000,
      requestTimeoutMs: 30000,
    };
  }

  /**
   * Initialize and connect WebSocket
   */
  async initialize(): Promise<void> {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      return;
    }

    await this.connectWebSocket();
  }

  /**
   * Connect to Asterdex WebSocket
   */
  async connectWebSocket(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      logger.info('[AsterdexClient] WebSocket already connected');
      return;
    }

    this.connectionState = 'connecting';
    logger.info(`[AsterdexClient] Connecting to WebSocket: ${this.config.wsEndpoint}`);

    try {
      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['X-API-Key'] = this.config.apiKey;
      }

      this.ws = new WebSocket(this.config.wsEndpoint, { headers });

      this.ws.on('open', () => {
        logger.info('[AsterdexClient] WebSocket connected');
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.subscribeToFundingRates();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        logger.warn(`[AsterdexClient] WebSocket closed: ${code} - ${reason.toString()}`);
        this.connectionState = 'disconnected';
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        logger.error('[AsterdexClient] WebSocket error:', error);
        this.connectionState = 'disconnected';
        this.scheduleReconnect();
      });
    } catch (error) {
      logger.error('[AsterdexClient] Failed to connect WebSocket:', error);
      this.connectionState = 'disconnected';
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as WSMessage;
      
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
          logger.error('[AsterdexClient] WebSocket error message:', message.data);
          break;
        default:
          // Handle other message types or log unknown
          logger.debug('[AsterdexClient] Unknown message type:', message.type);
      }

      // Notify registered handlers
      const handlers = this.messageHandlers.get(message.type) || [];
      handlers.forEach(handler => {
        try {
          handler(message.data);
        } catch (err) {
          logger.error('[AsterdexClient] Handler error:', err);
        }
      });
    } catch (error) {
      logger.error('[AsterdexClient] Failed to parse message:', error);
    }
  }

  /**
   * Handle single funding rate update
   */
  private handleFundingRateUpdate(data: any): void {
    if (!data || !data.symbol) return;

    const symbol = this.normalizeSymbol(data.symbol);
    if (!symbol) return;

    const fundingRate: AsterdexFundingRate = {
      symbol,
      fundingRate: parseFloat(data.fundingRate) || 0,
      annualizedRate: this.calculateAnnualizedRate(parseFloat(data.fundingRate) || 0),
      nextFundingTime: data.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
      markPrice: parseFloat(data.markPrice) || 0,
      indexPrice: parseFloat(data.indexPrice) || 0,
      predictedFundingRate: data.predictedFundingRate ? parseFloat(data.predictedFundingRate) : undefined,
      timestamp: data.timestamp || Date.now(),
    };

    this.fundingCache.set(fundingRate.symbol, fundingRate);
    logger.debug(`[AsterdexClient] Funding rate update: ${fundingRate.symbol} = ${fundingRate.fundingRate}`);
  }

  /**
   * Handle batch funding rates update
   */
  private handleFundingRatesBatch(data: any[]): void {
    if (!Array.isArray(data)) return;

    for (const item of data) {
      this.handleFundingRateUpdate(item);
    }
    
    logger.debug(`[AsterdexClient] Batch funding rates update: ${data.length} symbols`);
  }

  /**
   * Handle market data update
   */
  private handleMarketDataUpdate(data: any): void {
    if (!data) return;
    // Update markets cache if needed
    logger.debug('[AsterdexClient] Market data update received');
  }

  /**
   * Subscribe to funding rate updates
   */
  private subscribeToFundingRates(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const subscribeMsg = {
      type: 'subscribe',
      channel: 'funding_rates',
    };

    this.ws.send(JSON.stringify(subscribeMsg));
    logger.info('[AsterdexClient] Subscribed to funding rate updates');
  }

  /**
   * Subscribe to specific symbol
   */
  subscribeToSymbol(symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('[AsterdexClient] Cannot subscribe, WebSocket not connected');
      return;
    }

    const subscribeMsg = {
      type: 'subscribe',
      channel: 'ticker',
      symbol: this.toPerpSymbol(symbol),
    };

    this.ws.send(JSON.stringify(subscribeMsg));
    logger.info(`[AsterdexClient] Subscribed to ${symbol}`);
  }

  /**
   * Unsubscribe from specific symbol
   */
  unsubscribeFromSymbol(symbol: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const unsubscribeMsg = {
      type: 'unsubscribe',
      channel: 'ticker',
      symbol: this.toPerpSymbol(symbol),
    };

    this.ws.send(JSON.stringify(unsubscribeMsg));
  }

  /**
   * Register message handler
   */
  onMessage(type: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)!.push(handler);
  }

  /**
   * Remove message handler
   */
  offMessage(type: string, handler: (data: any) => void): void {
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
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1),
      60000 // Max 1 minute delay
    );

    logger.info(`[AsterdexClient] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
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
    logger.info('[AsterdexClient] Disconnected');
  }

  /**
   * Get connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * REST API: Get all funding rates
   */
  async getFundingRates(): Promise<AsterdexFundingRate[]> {
    try {
      // If we have fresh WebSocket data, use that
      if (this.fundingCache.size > 0 && this.isConnected()) {
        return Array.from(this.fundingCache.values());
      }

      // Aster Futures is Binance-compatible.
      // Pull premium index for funding + mark data and merge with 24h ticker for volume.
      const [premiumIndexResponse, tickerResponse] = await Promise.all([
        axios.get(
          `${this.config.restEndpoint}/premiumIndex`,
          {
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        ),
        axios.get(
          `${this.config.restEndpoint}/ticker/24hr`,
          {
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        ),
      ]);

      const rates = this.parseFundingRatesResponse(premiumIndexResponse.data, tickerResponse.data);
      
      // Update cache
      for (const rate of rates) {
        this.fundingCache.set(rate.symbol, rate);
      }

      return rates;
    } catch (error) {
      logger.error('[AsterdexClient] Failed to get funding rates:', error);
      try {
        // Fallback for legacy payload shape if the endpoint schema changes unexpectedly.
        const fallbackResponse = await axios.get(
          `${this.config.restEndpoint}/funding/rates`,
          {
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        );
        const fallbackRates = this.parseFundingRatesResponse(fallbackResponse.data);
        if (fallbackRates.length > 0) {
          return fallbackRates;
        }
      } catch (fallbackError) {
        logger.debug('[AsterdexClient] Legacy funding endpoint fallback failed:', fallbackError);
      }
      
      // Return cached data if available
      if (this.fundingCache.size > 0) {
        logger.warn('[AsterdexClient] Returning cached funding rates');
        return Array.from(this.fundingCache.values());
      }

      // Return mock data for development (remove in production)
      return this.getMockFundingRates();
    }
  }

  /**
   * REST API: Get funding rate for specific symbol
   */
  async getFundingRate(symbol: string): Promise<AsterdexFundingRate | null> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const exchangeSymbol = this.toPerpSymbol(symbol);
    
    // Check cache first
    const cached = this.fundingCache.get(normalizedSymbol);
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached;
    }

    try {
      const [premiumIndexResponse, tickerResponse] = await Promise.all([
        axios.get(
          `${this.config.restEndpoint}/premiumIndex`,
          {
            params: { symbol: exchangeSymbol },
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        ),
        axios.get(
          `${this.config.restEndpoint}/ticker/24hr`,
          {
            params: { symbol: exchangeSymbol },
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        ),
      ]);

      const rate = this.parseFundingRateResponse(premiumIndexResponse.data, tickerResponse.data);
      if (rate) {
        this.fundingCache.set(rate.symbol, rate);
      }
      return rate;
    } catch (error) {
      logger.error(`[AsterdexClient] Failed to get funding rate for ${symbol}:`, error);
      return cached || null;
    }
  }

  /**
   * REST API: Get all available markets
   */
  async getMarkets(): Promise<AsterdexMarket[]> {
    // Return cached if fresh
    if (this.marketsCache.length > 0 && Date.now() - this.lastMarketsUpdate < this.marketsCacheTtlMs) {
      return this.marketsCache;
    }

    try {
      const [exchangeInfoResponse, tickerResponse, premiumIndexResponse] = await Promise.all([
        axios.get(
          `${this.config.restEndpoint}/exchangeInfo`,
          {
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        ),
        axios.get(
          `${this.config.restEndpoint}/ticker/24hr`,
          {
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        ),
        axios.get(
          `${this.config.restEndpoint}/premiumIndex`,
          {
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        ),
      ]);

      const markets = this.parseMarketsResponse(
        exchangeInfoResponse.data,
        tickerResponse.data,
        premiumIndexResponse.data
      );
      this.marketsCache = markets;
      this.lastMarketsUpdate = Date.now();
      return markets;
    } catch (error) {
      logger.error('[AsterdexClient] Failed to get markets:', error);
      
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
  async getMarketInfo(symbol: string): Promise<AsterdexMarket | null> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const exchangeSymbol = this.toPerpSymbol(symbol);
    
    // Check cache first
    const cached = this.marketsCache.find(m => m.symbol === normalizedSymbol);
    if (cached && Date.now() - this.lastMarketsUpdate < this.marketsCacheTtlMs) {
      return cached;
    }

    try {
      const [tickerResponse, premiumIndexResponse] = await Promise.all([
        axios.get(
          `${this.config.restEndpoint}/ticker/24hr`,
          {
            params: { symbol: exchangeSymbol },
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        ),
        axios.get(
          `${this.config.restEndpoint}/premiumIndex`,
          {
            params: { symbol: exchangeSymbol },
            headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
            timeout: this.config.requestTimeoutMs,
          }
        ),
      ]);

      return this.parseMarketResponse(tickerResponse.data, premiumIndexResponse.data);
    } catch (error) {
      logger.error(`[AsterdexClient] Failed to get market info for ${symbol}:`, error);
      return cached || null;
    }
  }

  /**
   * Get funding rate history for a symbol
   */
  async getFundingHistory(symbol: string, limit: number = 100): Promise<AsterdexFundingRate[]> {
    try {
      const response = await axios.get(
        `${this.config.restEndpoint}/fundingRate`,
        {
          params: { symbol: this.toPerpSymbol(symbol), limit },
          headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
          timeout: this.config.requestTimeoutMs,
        }
      );

      return this.parseFundingHistoryResponse(response.data);
    } catch (error) {
      logger.error(`[AsterdexClient] Failed to get funding history for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Calculate annualized funding rate
   * Assumes funding paid every 8 hours (3x per day)
   */
  private calculateAnnualizedRate(fundingRate: number): number {
    return fundingRate * 3 * 365;
  }

  /**
   * Convert exchange symbol format (e.g. BTCUSDT) to internal base symbol (BTC)
   */
  private normalizeSymbol(symbol: string): string {
    const cleaned = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleaned) return '';

    for (const suffix of this.quoteSuffixes) {
      if (cleaned.endsWith(suffix) && cleaned.length > suffix.length) {
        return cleaned.slice(0, -suffix.length);
      }
    }

    return cleaned;
  }

  /**
   * Convert internal/base symbol (BTC) to exchange perp symbol (BTCUSDT)
   */
  private toPerpSymbol(symbol: string): string {
    const cleaned = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleaned) return '';

    for (const suffix of this.quoteSuffixes) {
      if (cleaned.endsWith(suffix)) {
        return cleaned;
      }
    }

    return `${cleaned}USDT`;
  }

  /**
   * Parse funding rates response
   */
  private parseFundingRatesResponse(data: any, ticker24hData?: any): AsterdexFundingRate[] {
    if (!data) return [];

    // Handle different response formats
    const rates = (Array.isArray(data) ? data : data.rates || data.data || []) as any[];
    const ticker24h = Array.isArray(ticker24hData)
      ? ticker24hData
      : Array.isArray(ticker24hData?.data)
      ? ticker24hData.data
      : [];
    const volumeBySymbol = new Map<string, number>();

    for (const ticker of ticker24h) {
      const normalizedSymbol = this.normalizeSymbol(String(ticker.symbol || ticker.coin || ticker.asset || ''));
      if (!normalizedSymbol) continue;
      const volume = parseFloat(ticker.quoteVolume || ticker.volume || ticker.vol24h || 0);
      if (Number.isFinite(volume) && volume > 0) {
        volumeBySymbol.set(normalizedSymbol, volume);
      }
    }

    const parsed: AsterdexFundingRate[] = [];

    for (const item of rates) {
      const symbol = this.normalizeSymbol(item.symbol || item.coin || item.asset || '');
      if (!symbol) continue;

      parsed.push({
        symbol,
        fundingRate: parseFloat(item.fundingRate || item.lastFundingRate || item.funding || item.rate || 0),
        annualizedRate: parseFloat(item.annualizedRate || item.apr || 0) || 
          this.calculateAnnualizedRate(parseFloat(item.fundingRate || item.lastFundingRate || item.funding || 0)),
        nextFundingTime: item.nextFundingTime || item.nextFunding || Date.now() + (8 * 60 * 60 * 1000),
        markPrice: parseFloat(item.markPrice || item.markPx || item.price || 0),
        indexPrice: parseFloat(item.indexPrice || item.indexPx || 0),
        predictedFundingRate: item.predictedFundingRate ? parseFloat(item.predictedFundingRate) : undefined,
        timestamp: item.timestamp || item.time || Date.now(),
        volume24h: volumeBySymbol.get(symbol) || 0,
      });
    }

    return parsed;
  }

  /**
   * Parse single funding rate response
   */
  private parseFundingRateResponse(data: any, ticker24hData?: any): AsterdexFundingRate | null {
    if (!data) return null;

    const item = data.data || data;
    const tickerItem = ticker24hData?.data || ticker24hData || {};
    const symbol = this.normalizeSymbol(item.symbol || item.coin || '');
    if (!symbol) return null;
    
    return {
      symbol,
      fundingRate: parseFloat(item.fundingRate || item.lastFundingRate || item.funding || 0),
      annualizedRate: parseFloat(item.annualizedRate || 0) || 
        this.calculateAnnualizedRate(parseFloat(item.fundingRate || item.lastFundingRate || 0)),
      nextFundingTime: item.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
      markPrice: parseFloat(item.markPrice || tickerItem.lastPrice || tickerItem.markPrice || 0),
      indexPrice: parseFloat(item.indexPrice || 0),
      volume24h: parseFloat(tickerItem.quoteVolume || tickerItem.volume || 0),
      predictedFundingRate: item.predictedFundingRate ? parseFloat(item.predictedFundingRate) : undefined,
      timestamp: item.timestamp || Date.now(),
    };
  }

  /**
   * Parse markets response
   */
  private parseMarketsResponse(exchangeInfoData: any, ticker24hData: any, premiumIndexData: any): AsterdexMarket[] {
    const symbols = Array.isArray(exchangeInfoData?.symbols) ? exchangeInfoData.symbols : [];
    const ticker24h = Array.isArray(ticker24hData) ? ticker24hData : [];
    const premiumIndex = Array.isArray(premiumIndexData) ? premiumIndexData : [];

    const tickerBySymbol = new Map<string, any>();
    for (const ticker of ticker24h) {
      tickerBySymbol.set(String(ticker.symbol || '').toUpperCase(), ticker);
    }

    const premiumBySymbol = new Map<string, any>();
    for (const premium of premiumIndex) {
      premiumBySymbol.set(String(premium.symbol || '').toUpperCase(), premium);
    }

    return symbols.map((item: any) => {
      const exchangeSymbol = String(item.symbol || '').toUpperCase();
      const ticker = tickerBySymbol.get(exchangeSymbol) || {};
      const premium = premiumBySymbol.get(exchangeSymbol) || {};

      return {
        symbol: this.normalizeSymbol(exchangeSymbol || item.coin || item.name || 'UNKNOWN'),
        baseAsset: item.baseAsset || item.base || this.normalizeSymbol(exchangeSymbol) || 'UNKNOWN',
        quoteAsset: item.quoteAsset || item.quote || 'USD',
        markPrice: parseFloat(premium.markPrice || ticker.lastPrice || 0),
        indexPrice: parseFloat(premium.indexPrice || 0),
        fundingRate: parseFloat(premium.lastFundingRate || item.fundingRate || 0),
        nextFundingTime: premium.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
        openInterest: parseFloat(item.openInterest || item.oi || 0),
        volume24h: parseFloat(ticker.quoteVolume || ticker.volume || 0),
        high24h: parseFloat(ticker.highPrice || item.high24h || item.high || 0),
        low24h: parseFloat(ticker.lowPrice || item.low24h || item.low || 0),
        priceChange24h: parseFloat(ticker.priceChange || item.priceChange24h || item.change24h || 0),
        priceChangePercent24h: parseFloat(ticker.priceChangePercent || item.priceChangePercent24h || item.changePercent24h || 0),
        maxLeverage: parseFloat(item.maxLeverage || item.maxLvg || 20),
        minOrderSize: parseFloat(item.minOrderSize || item.minSz || 0),
        tickSize: parseFloat(item.tickSize || 0.01),
        isActive: item.status === 'TRADING' || (item.isActive !== false && item.status !== 'inactive'),
      };
    });
  }

  /**
   * Parse single market response
   */
  private parseMarketResponse(ticker24hData: any, premiumIndexData: any): AsterdexMarket | null {
    if (!ticker24hData && !premiumIndexData) return null;

    const ticker = ticker24hData?.data || ticker24hData || {};
    const premium = premiumIndexData?.data || premiumIndexData || {};
    const exchangeSymbol = String(ticker.symbol || premium.symbol || '');
    const symbol = this.normalizeSymbol(exchangeSymbol || ticker.coin || premium.coin || 'UNKNOWN');

    return {
      symbol,
      baseAsset: symbol,
      quoteAsset: 'USD',
      markPrice: parseFloat(premium.markPrice || ticker.lastPrice || 0),
      indexPrice: parseFloat(premium.indexPrice || 0),
      fundingRate: parseFloat(premium.lastFundingRate || 0),
      nextFundingTime: premium.nextFundingTime || Date.now() + (8 * 60 * 60 * 1000),
      openInterest: parseFloat(ticker.openInterest || 0),
      volume24h: parseFloat(ticker.quoteVolume || ticker.volume || 0),
      high24h: parseFloat(ticker.highPrice || 0),
      low24h: parseFloat(ticker.lowPrice || 0),
      priceChange24h: parseFloat(ticker.priceChange || 0),
      priceChangePercent24h: parseFloat(ticker.priceChangePercent || 0),
      maxLeverage: 20,
      minOrderSize: 0,
      tickSize: 0.01,
      isActive: true,
    };
  }

  /**
   * Parse funding history response
   */
  private parseFundingHistoryResponse(data: any): AsterdexFundingRate[] {
    if (!data) return [];

    const history = Array.isArray(data) ? data : data.history || data.data || [];

    return history.map((item: any) => ({
      symbol: this.normalizeSymbol(item.symbol || 'UNKNOWN'),
      fundingRate: parseFloat(item.fundingRate || item.funding || 0),
      annualizedRate: parseFloat(item.annualizedRate || 0),
      nextFundingTime: item.nextFundingTime || item.fundingTime || 0,
      markPrice: parseFloat(item.markPrice || 0),
      indexPrice: parseFloat(item.indexPrice || 0),
      timestamp: item.timestamp || item.time || Date.now(),
    }));
  }

  /**
   * Get mock funding rates for development
   * Remove when API is available
   */
  private getMockFundingRates(): AsterdexFundingRate[] {
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
  private getMockMarkets(): AsterdexMarket[] {
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
  updateConfig(newConfig: Partial<AsterdexConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('[AsterdexClient] Configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): AsterdexConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const asterdexClient = new AsterdexClient();
export default asterdexClient;
export type { 
  AsterdexConfig, 
  AsterdexMarket, 
  AsterdexFundingRate, 
  ConnectionState 
};
