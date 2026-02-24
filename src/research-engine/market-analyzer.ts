// Market Analyzer - Analyzes current market regime, volatility, and trends

import axios from 'axios';
import logger from '../shared/logger';
import config from '../shared/config';

export interface MarketRegime {
  regime: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'UNKNOWN';
  volatility: number; // 0-1 scale
  trendStrength: number; // -1 to 1 scale
  volumeProfile: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  topMovers: Array<{
    symbol: string;
    change24h: number;
    volume24h: number;
  }>;
  timestamp: Date;
}

interface CandleData {
  t: number; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
}

interface HyperliquidMeta {
  universe: Array<{
    name: string;
    szDecimals: number;
  }>;
}

export class MarketAnalyzer {
  private baseUrl: string;
  private symbols: string[];
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  constructor() {
    const hlConfig = config.getSection('hyperliquid');
    this.baseUrl = hlConfig.baseUrl || 'https://api.hyperliquid.xyz';
    this.symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'LINK', 'DOGE', 'ADA', 'AVAX', 'LTC', 'DOT'];
  }

  /**
   * Analyze current market conditions and return regime classification
   */
  async analyze(): Promise<MarketRegime> {
    logger.info('[MarketAnalyzer] Analyzing market conditions...');

    try {
      // Fetch data for all major symbols
      const symbolData = await this.fetchSymbolData();
      
      // Calculate volatility across market
      const volatility = this.calculateMarketVolatility(symbolData);
      
      // Calculate trend strength
      const trendStrength = this.calculateTrendStrength(symbolData);
      
      // Classify regime
      const regime = this.classifyRegime(volatility, trendStrength);
      
      // Get volume profile
      const volumeProfile = this.classifyVolumeProfile(symbolData);
      
      // Get top movers
      const topMovers = this.getTopMovers(symbolData, 5);

      const result: MarketRegime = {
        regime,
        volatility,
        trendStrength,
        volumeProfile,
        topMovers,
        timestamp: new Date(),
      };

      logger.info(`[MarketAnalyzer] Regime: ${regime}, Volatility: ${volatility.toFixed(2)}, Trend: ${trendStrength.toFixed(2)}`);
      return result;

    } catch (error) {
      logger.error('[MarketAnalyzer] Analysis failed:', error);
      return this.getDefaultRegime();
    }
  }

  /**
   * Fetch candle and market data for symbols
   */
  private async fetchSymbolData(): Promise<Map<string, { candles: CandleData[]; meta: any }>> {
    const data = new Map<string, { candles: CandleData[]; meta: any }>();
    const now = Date.now();

    for (const symbol of this.symbols) {
      try {
        // Check cache first
        const cached = this.cache.get(symbol);
        if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
          data.set(symbol, cached.data);
          continue;
        }

        // Fetch candles for 24h
        const endTime = now;
        const startTime = now - (24 * 60 * 60 * 1000); // 24 hours ago

        const response = await axios.post(
          `${this.baseUrl}/info`,
          {
            type: 'candleSnapshot',
            req: {
              coin: symbol,
              interval: '1h',
              startTime,
              endTime,
            },
          },
          { timeout: 10000 }
        );

        const candles: CandleData[] = Array.isArray(response.data) ? response.data : [];
        
        // Calculate 24h change
        const change24h = candles.length >= 2
          ? ((candles[candles.length - 1].c - candles[0].o) / candles[0].o) * 100
          : 0;
        
        // Calculate volume
        const volume24h = candles.reduce((sum, c) => sum + (c.v || 0), 0);

        const symbolInfo = {
          candles,
          meta: {
            change24h,
            volume24h,
          },
        };

        // Cache the data
        this.cache.set(symbol, { data: symbolInfo, timestamp: now });
        data.set(symbol, symbolInfo);

      } catch (error) {
        logger.warn(`[MarketAnalyzer] Failed to fetch data for ${symbol}:`, error);
      }
    }

    return data;
  }

  /**
   * Calculate overall market volatility (0-1 scale)
   */
  private calculateMarketVolatility(symbolData: Map<string, { candles: CandleData[]; meta: any }>): number {
    const volatilities: number[] = [];

    for (const [symbol, data] of symbolData) {
      if (data.candles.length < 2) continue;

      // Calculate returns
      const returns: number[] = [];
      for (let i = 1; i < data.candles.length; i++) {
        const prev = data.candles[i - 1].c;
        const curr = data.candles[i].c;
        returns.push((curr - prev) / prev);
      }

      // Calculate standard deviation of returns (volatility)
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      // Normalize to 0-1 scale (assuming max daily vol ~10%)
      volatilities.push(Math.min(stdDev * Math.sqrt(24) * 100, 1));
    }

    if (volatilities.length === 0) return 0.5;

    // Return average volatility
    const avgVol = volatilities.reduce((a, b) => a + b, 0) / volatilities.length;
    return Math.min(avgVol, 1);
  }

  /**
   * Calculate trend strength (-1 to 1 scale)
   */
  private calculateTrendStrength(symbolData: Map<string, { candles: CandleData[]; meta: any }>): number {
    let totalStrength = 0;
    let count = 0;

    for (const [symbol, data] of symbolData) {
      if (data.candles.length < 10) continue;

      // Simple trend strength using linear regression slope
      const n = Math.min(data.candles.length, 24);
      const prices = data.candles.slice(-n).map(c => c.c);
      
      // Calculate EMA trend
      const ema12 = this.calculateEMA(prices, 12);
      const ema26 = this.calculateEMA(prices, 26);
      
      if (ema12.length > 0 && ema26.length > 0) {
        const trend = (ema12[ema12.length - 1] - ema26[ema26.length - 1]) / ema26[ema26.length - 1];
        // Normalize to -1 to 1
        const normalizedTrend = Math.max(-1, Math.min(1, trend * 10));
        totalStrength += normalizedTrend;
        count++;
      }
    }

    if (count === 0) return 0;
    return totalStrength / count;
  }

  /**
   * Classify market regime based on volatility and trend
   */
  private classifyRegime(volatility: number, trendStrength: number): MarketRegime['regime'] {
    // High volatility regime
    if (volatility > 0.7) {
      return 'VOLATILE';
    }

    // Trending regimes (moderate/low volatility with strong trend)
    if (Math.abs(trendStrength) > 0.3) {
      return trendStrength > 0 ? 'TRENDING_UP' : 'TRENDING_DOWN';
    }

    // Ranging regime (low volatility, weak trend)
    if (volatility < 0.4 && Math.abs(trendStrength) < 0.2) {
      return 'RANGING';
    }

    return 'UNKNOWN';
  }

  /**
   * Classify volume profile
   */
  private classifyVolumeProfile(symbolData: Map<string, { candles: CandleData[]; meta: any }>): MarketRegime['volumeProfile'] {
    let totalVolume = 0;
    let count = 0;

    for (const [symbol, data] of symbolData) {
      if (data.meta.volume24h > 0) {
        totalVolume += data.meta.volume24h;
        count++;
      }
    }

    if (count === 0) return 'NORMAL';

    const avgVolume = totalVolume / count;
    
    // Very rough classification - would need historical baselines for accuracy
    if (avgVolume > 1e9) return 'EXTREME';
    if (avgVolume > 5e8) return 'HIGH';
    if (avgVolume < 1e8) return 'LOW';
    return 'NORMAL';
  }

  /**
   * Get top movers by 24h change
   */
  private getTopMovers(
    symbolData: Map<string, { candles: CandleData[]; meta: any }>,
    limit: number
  ): MarketRegime['topMovers'] {
    const movers = Array.from(symbolData.entries())
      .filter(([_, data]) => data.meta.change24h !== undefined)
      .map(([symbol, data]) => ({
        symbol,
        change24h: data.meta.change24h,
        volume24h: data.meta.volume24h,
      }))
      .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
      .slice(0, limit);

    return movers;
  }

  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) return [];
    
    const multiplier = 2 / (period + 1);
    const ema: number[] = [];
    
    // Start with SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    ema.push(sum / period);
    
    // Calculate EMA for rest
    for (let i = period; i < prices.length; i++) {
      const newEma = (prices[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1];
      ema.push(newEma);
    }
    
    return ema;
  }

  /**
   * Get default regime when analysis fails
   */
  private getDefaultRegime(): MarketRegime {
    return {
      regime: 'UNKNOWN',
      volatility: 0.5,
      trendStrength: 0,
      volumeProfile: 'NORMAL',
      topMovers: [],
      timestamp: new Date(),
    };
  }

  /**
   * Get quick market snapshot for external use
   */
  async getMarketSnapshot(): Promise<{
    btcPrice: number;
    ethPrice: number;
    marketCap: number;
    fearGreed: number;
  }> {
    try {
      // Try to get BTC and ETH prices
      const btcData = this.cache.get('BTC');
      const ethData = this.cache.get('ETH');

      const btcPrice = btcData?.data.candles[btcData.data.candles.length - 1]?.c || 0;
      const ethPrice = ethData?.data.candles[ethData.data.candles.length - 1]?.c || 0;

      return {
        btcPrice,
        ethPrice,
        marketCap: 0, // Would need external API
        fearGreed: 50, // Would need external API
      };
    } catch (error) {
      logger.error('[MarketAnalyzer] Failed to get market snapshot:', error);
      return {
        btcPrice: 0,
        ethPrice: 0,
        marketCap: 0,
        fearGreed: 50,
      };
    }
  }
}

export default MarketAnalyzer;
