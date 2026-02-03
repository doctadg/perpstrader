"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class ConfigManager {
    config;
    configPath;
    constructor(configPath) {
        this.configPath = configPath || path_1.default.join(__dirname, '../../config/config.json');
        this.config = this.loadConfig();
    }
    loadConfig() {
        const defaultConfig = {
            app: {
                name: 'PerpsTrader AI',
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development',
                logLevel: process.env.LOG_LEVEL || 'info'
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
                apiKey: process.env.OPENROUTER_API_KEY || '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',
                baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
                labelingModel: process.env.OPENROUTER_LABELING_MODEL || 'openai/gpt-oss-20b',
                embeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b',
                timeout: parseInt(process.env.OPENROUTER_TIMEOUT || '30000')
            },
            database: {
                type: 'sqlite',
                connection: process.env.DATABASE_URL || path_1.default.join(__dirname, '../../data/trading.db')
            },
            risk: {
                maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.1'),
                maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '0.05'),
                maxLeverage: parseInt(process.env.MAX_LEVERAGE || '40'),
                emergencyStop: process.env.EMERGENCY_STOP === 'true'
            },
            trading: {
                symbols: (process.env.TRADING_SYMBOLS || 'BTC,ETH').split(','),
                timeframes: (process.env.TRADING_TIMEFRAMES || '1s,1m,5m,15m,1h').split(','),
                strategies: (process.env.TRADING_STRATEGIES || 'market_making,trend_following').split(',')
            },
            solana: {
                rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
                wsUrl: process.env.SOLANA_WS_URL,
                commitment: process.env.SOLANA_COMMITMENT || 'confirmed'
            },
            pumpfun: {
                subscribeDurationMs: parseInt(process.env.PUMPFUN_SUBSCRIBE_DURATION_MS || '30000'),
                minScoreThreshold: parseFloat(process.env.PUMPFUN_MIN_SCORE_THRESHOLD || '0.5'),
                cycleIntervalMs: parseInt(process.env.PUMPFUN_CYCLE_INTERVAL_MS || '60000'),
                weights: {
                    website: parseFloat(process.env.PUMPFUN_WEIGHT_WEBSITE || '0.25'),
                    social: parseFloat(process.env.PUMPFUN_WEIGHT_SOCIAL || '0.25'),
                    security: parseFloat(process.env.PUMPFUN_WEIGHT_SECURITY || '0.35'),
                    glm: parseFloat(process.env.PUMPFUN_WEIGHT_GLM || '0.15')
                }
            }
        };
        try {
            if (fs_1.default.existsSync(this.configPath)) {
                const configData = fs_1.default.readFileSync(this.configPath, 'utf8');
                const parsed = JSON.parse(configData);
                // Deep merge for hyperliquid to preserve privateKey from env if missing in config.json
                const mergedConfig = { ...defaultConfig, ...parsed };
                if (parsed.hyperliquid) {
                    mergedConfig.hyperliquid = { ...defaultConfig.hyperliquid, ...parsed.hyperliquid };
                }
                if (parsed.glm) {
                    mergedConfig.glm = { ...defaultConfig.glm, ...parsed.glm };
                    // Treat empty-string values in config.json as "unset" so env/defaults win.
                    if (!mergedConfig.glm.apiKey)
                        mergedConfig.glm.apiKey = defaultConfig.glm.apiKey;
                    if (!mergedConfig.glm.baseUrl)
                        mergedConfig.glm.baseUrl = defaultConfig.glm.baseUrl;
                    if (!mergedConfig.glm.model)
                        mergedConfig.glm.model = defaultConfig.glm.model;
                    if (!Number.isFinite(mergedConfig.glm.timeout))
                        mergedConfig.glm.timeout = defaultConfig.glm.timeout;
                }
                if (parsed.openrouter) {
                    mergedConfig.openrouter = { ...defaultConfig.openrouter, ...parsed.openrouter };
                    if (!mergedConfig.openrouter.apiKey)
                        mergedConfig.openrouter.apiKey = defaultConfig.openrouter.apiKey;
                    if (!mergedConfig.openrouter.baseUrl)
                        mergedConfig.openrouter.baseUrl = defaultConfig.openrouter.baseUrl;
                    if (!mergedConfig.openrouter.labelingModel)
                        mergedConfig.openrouter.labelingModel = defaultConfig.openrouter.labelingModel;
                    if (!mergedConfig.openrouter.embeddingModel)
                        mergedConfig.openrouter.embeddingModel = defaultConfig.openrouter.embeddingModel;
                    if (!Number.isFinite(mergedConfig.openrouter.timeout))
                        mergedConfig.openrouter.timeout = defaultConfig.openrouter.timeout;
                }
                if (parsed.searchApi) {
                    mergedConfig.searchApi = { ...defaultConfig.searchApi, ...parsed.searchApi };
                    if (!mergedConfig.searchApi.baseUrl)
                        mergedConfig.searchApi.baseUrl = defaultConfig.searchApi.baseUrl;
                    if (!Number.isFinite(mergedConfig.searchApi.timeout))
                        mergedConfig.searchApi.timeout = defaultConfig.searchApi.timeout;
                }
                if (parsed.solana) {
                    mergedConfig.solana = { ...defaultConfig.solana, ...parsed.solana };
                    if (!mergedConfig.solana.rpcUrl)
                        mergedConfig.solana.rpcUrl = defaultConfig.solana?.rpcUrl;
                    if (!mergedConfig.solana.wsUrl)
                        mergedConfig.solana.wsUrl = defaultConfig.solana?.wsUrl;
                    if (!mergedConfig.solana.commitment)
                        mergedConfig.solana.commitment = defaultConfig.solana?.commitment;
                }
                if (parsed.pumpfun) {
                    mergedConfig.pumpfun = { ...defaultConfig.pumpfun, ...parsed.pumpfun };
                    if (parsed.pumpfun.weights) {
                        mergedConfig.pumpfun.weights = { ...(defaultConfig.pumpfun?.weights || {}), ...parsed.pumpfun.weights };
                    }
                }
                return mergedConfig;
            }
        }
        catch (error) {
            console.warn('Could not load config file, using defaults');
        }
        return defaultConfig;
    }
    get() {
        return this.config;
    }
    getSection(section) {
        return this.config[section];
    }
    update(section, updates) {
        this.config[section] = { ...this.config[section], ...updates };
        this.saveConfig();
    }
    saveConfig() {
        try {
            const configDir = path_1.default.dirname(this.configPath);
            if (!fs_1.default.existsSync(configDir)) {
                fs_1.default.mkdirSync(configDir, { recursive: true });
            }
            fs_1.default.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        }
        catch (error) {
            console.error('Could not save config file:', error);
        }
    }
    isProduction() {
        return this.config.app.environment === 'production';
    }
    isDevelopment() {
        return this.config.app.environment === 'development';
    }
}
const configManager = new ConfigManager();
exports.default = configManager;
//# sourceMappingURL=config.js.map