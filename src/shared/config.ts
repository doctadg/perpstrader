import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Config } from './types';

class ConfigManager {
  private config: Config;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(__dirname, '../../config/config.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    const defaultConfig: Config = {
      app: {
        name: 'PerpsTrader AI',
        version: '1.0.0',
        environment: (process.env.NODE_ENV as 'development' | 'production') || 'development',
        logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info'
      },
      hyperliquid: {
        privateKey: process.env.HYPERLIQUID_PRIVATE_KEY || process.env.HYPERLIQUID_API_SECRET || '',
        testnet: process.env.HYPERLIQUID_TESTNET === 'true',
        baseUrl: process.env.HYPERLIQUID_BASE_URL || 'https://api.hyperliquid.xyz',
        mainAddress: process.env.HYPERLIQUID_MAIN_ADDRESS
      },
      searchApi: {
        baseUrl: process.env.SEARCH_API_URL || 'http://localhost:8000/api/v1',
        timeout: parseInt(process.env.SEARCH_API_TIMEOUT || '30000')
      },
      glm: {
        apiKey: process.env.ZAI_API_KEY || '',
        baseUrl: process.env.ZAI_API_URL || 'https://api.z.ai/api/paas/v4',
        model: process.env.ZAI_MODEL || 'glm-4.6',
        timeout: parseInt(process.env.ZAI_API_TIMEOUT || '30000')
      },
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY || '',
        baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        labelingModel: process.env.OPENROUTER_LABELING_MODEL || 'z-ai/glm-4.7-flash',
        embeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b',
        timeout: parseInt(process.env.OPENROUTER_TIMEOUT || '30000')
      },
      database: {
        type: 'sqlite',
        connection: process.env.DATABASE_URL || path.join(__dirname, '../../data/trading.db')
      },
      risk: {
        maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.1'),
        maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '0.05'),
        maxLeverage: parseInt(process.env.MAX_LEVERAGE || '40'),
        emergencyStop: process.env.EMERGENCY_STOP === 'true'
      },
      safety: {
        dailyLossLimit: parseFloat(process.env.SAFETY_DAILY_LOSS_LIMIT || '50'),
        maxDrawdownPercent: parseFloat(process.env.SAFETY_MAX_DRAWDOWN_PERCENT || '15'),
        consecutiveLossLimit: parseInt(process.env.SAFETY_CONSECUTIVE_LOSS_LIMIT || '5'),
        maxTradesPerDay: parseInt(process.env.SAFETY_MAX_TRADES_PER_DAY || '20'),
        maxTradesPerSymbol: parseInt(process.env.SAFETY_MAX_TRADES_PER_SYMBOL || '5'),
        volatilityReduceThreshold: parseFloat(process.env.SAFETY_VOLATILITY_REDUCE_THRESHOLD || '5'),
        volatilityStopThreshold: parseFloat(process.env.SAFETY_VOLATILITY_STOP_THRESHOLD || '10')
      },
      trading: {
        symbols: (process.env.TRADING_SYMBOLS || 'BTC,ETH,SOL,AVAX,ARB,OP,LINK,DOGE,PEPE,WIF,RENDER,TAO,SUI,SEI,INJ,BONK,AAVE,UNI,CRV,SNX,JUP,RAY,PENDLE,ZRO,BERA,HYPE,XRP,ZEC').split(','),
        timeframes: (process.env.TRADING_TIMEFRAMES || '1s,1m,5m,15m,1h').split(','),
        strategies: (process.env.TRADING_STRATEGIES || 'market_making,trend_following').split(',')
      },
      solana: {
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        wsUrl: process.env.SOLANA_WS_URL,
        commitment: (process.env.SOLANA_COMMITMENT as 'processed' | 'confirmed' | 'finalized') || 'confirmed'
      },
      pumpfun: {
        subscribeDurationMs: parseInt(process.env.PUMPFUN_SUBSCRIBE_DURATION_MS || '30000'),
        minScoreThreshold: parseFloat(process.env.PUMPFUN_MIN_SCORE_THRESHOLD || '0.7'),
        cycleIntervalMs: parseInt(process.env.PUMPFUN_CYCLE_INTERVAL_MS || '60000'),
        weights: {
          website: parseFloat(process.env.PUMPFUN_WEIGHT_WEBSITE || '0.7'),
          social: parseFloat(process.env.PUMPFUN_WEIGHT_SOCIAL || '0'),
          security: parseFloat(process.env.PUMPFUN_WEIGHT_SECURITY || '0'),
          glm: parseFloat(process.env.PUMPFUN_WEIGHT_GLM || '0.3')
        }
      }
    };

    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const parsed = JSON.parse(configData) as Partial<Config>;

        // Deep merge for hyperliquid to preserve privateKey from env if missing in config.json
        const mergedConfig = { ...defaultConfig, ...parsed };
        if (parsed.hyperliquid) {
          mergedConfig.hyperliquid = { ...defaultConfig.hyperliquid, ...parsed.hyperliquid };
        }
        if (parsed.glm) {
          mergedConfig.glm = { ...defaultConfig.glm, ...parsed.glm };
          // Treat empty-string values in config.json as "unset" so env/defaults win.
          if (!mergedConfig.glm.apiKey) mergedConfig.glm.apiKey = defaultConfig.glm.apiKey;
          if (!mergedConfig.glm.baseUrl) mergedConfig.glm.baseUrl = defaultConfig.glm.baseUrl;
          if (!mergedConfig.glm.model) mergedConfig.glm.model = defaultConfig.glm.model;
          if (!Number.isFinite(mergedConfig.glm.timeout)) mergedConfig.glm.timeout = defaultConfig.glm.timeout;
        }
        if (parsed.openrouter) {
          mergedConfig.openrouter = { ...defaultConfig.openrouter, ...parsed.openrouter };
          if (!mergedConfig.openrouter.apiKey) mergedConfig.openrouter.apiKey = defaultConfig.openrouter.apiKey;
          if (!mergedConfig.openrouter.baseUrl) mergedConfig.openrouter.baseUrl = defaultConfig.openrouter.baseUrl;
          if (!mergedConfig.openrouter.labelingModel) mergedConfig.openrouter.labelingModel = defaultConfig.openrouter.labelingModel;
          if (!mergedConfig.openrouter.embeddingModel) mergedConfig.openrouter.embeddingModel = defaultConfig.openrouter.embeddingModel;
          if (!Number.isFinite(mergedConfig.openrouter.timeout)) mergedConfig.openrouter.timeout = defaultConfig.openrouter.timeout;
        }
        if (parsed.searchApi) {
          mergedConfig.searchApi = { ...defaultConfig.searchApi, ...parsed.searchApi };
          if (!mergedConfig.searchApi.baseUrl) mergedConfig.searchApi.baseUrl = defaultConfig.searchApi.baseUrl;
          if (!Number.isFinite(mergedConfig.searchApi.timeout)) mergedConfig.searchApi.timeout = defaultConfig.searchApi.timeout;
        }
        if (parsed.solana) {
          mergedConfig.solana = { ...defaultConfig.solana, ...parsed.solana };
          if (!mergedConfig.solana.rpcUrl) mergedConfig.solana.rpcUrl = defaultConfig.solana?.rpcUrl;
          if (!mergedConfig.solana.wsUrl) mergedConfig.solana.wsUrl = defaultConfig.solana?.wsUrl;
          if (!mergedConfig.solana.commitment) mergedConfig.solana.commitment = defaultConfig.solana?.commitment;
        }
        if (parsed.pumpfun) {
          mergedConfig.pumpfun = { ...defaultConfig.pumpfun, ...parsed.pumpfun };
          if (parsed.pumpfun.weights) {
            mergedConfig.pumpfun.weights = { ...(defaultConfig.pumpfun?.weights || {}), ...parsed.pumpfun.weights };
          }
        }
        if (parsed.safety) {
          mergedConfig.safety = { ...defaultConfig.safety, ...parsed.safety };
        }

        return mergedConfig;
      }
    } catch (error) {
      console.warn('Could not load config file, using defaults');
    }

    return defaultConfig;
  }

  public get(): Config {
    return this.config;
  }

  public getSection<K extends keyof Config>(section: K): Config[K] {
    return this.config[section];
  }

  public update<K extends keyof Config>(section: K, updates: Partial<Config[K]>): void {
    this.config[section] = { ...this.config[section], ...updates };
    this.saveConfig();
  }

  private saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Could not save config file:', error);
    }
  }

  public isProduction(): boolean {
    return this.config.app.environment === 'production';
  }

  public isDevelopment(): boolean {
    return this.config.app.environment === 'development';
  }
}

const configManager = new ConfigManager();
export default configManager;
