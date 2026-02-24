"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var fs_1 = require("fs");
var path_1 = require("path");
var ConfigManager = /** @class */ (function () {
    function ConfigManager(configPath) {
        this.configPath = configPath || path_1.default.join(__dirname, '../../config/config.json');
        this.config = this.loadConfig();
    }
    ConfigManager.prototype.loadConfig = function () {
        var _a, _b, _c, _d;
        var defaultConfig = {
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
                apiKey: process.env.OPENROUTER_API_KEY || '',
                baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
                labelingModel: process.env.OPENROUTER_LABELING_MODEL || 'z-ai/glm-4.7-flash',
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
                symbols: (process.env.TRADING_SYMBOLS || 'BTC,ETH,SOL,AVAX,ARB,OP,LINK,DOGE,PEPE,WIF,RENDER,TAO,SUI,SEI,INJ,BONK,AAVE,UNI,CRV,SNX,JUP,RAY,PENDLE,ZRO,BERA,HYPE,XRP,ZEC').split(','),
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
            if (fs_1.default.existsSync(this.configPath)) {
                var configData = fs_1.default.readFileSync(this.configPath, 'utf8');
                var parsed = JSON.parse(configData);
                // Deep merge for hyperliquid to preserve privateKey from env if missing in config.json
                var mergedConfig = __assign(__assign({}, defaultConfig), parsed);
                if (parsed.hyperliquid) {
                    mergedConfig.hyperliquid = __assign(__assign({}, defaultConfig.hyperliquid), parsed.hyperliquid);
                }
                if (parsed.glm) {
                    mergedConfig.glm = __assign(__assign({}, defaultConfig.glm), parsed.glm);
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
                    mergedConfig.openrouter = __assign(__assign({}, defaultConfig.openrouter), parsed.openrouter);
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
                    mergedConfig.searchApi = __assign(__assign({}, defaultConfig.searchApi), parsed.searchApi);
                    if (!mergedConfig.searchApi.baseUrl)
                        mergedConfig.searchApi.baseUrl = defaultConfig.searchApi.baseUrl;
                    if (!Number.isFinite(mergedConfig.searchApi.timeout))
                        mergedConfig.searchApi.timeout = defaultConfig.searchApi.timeout;
                }
                if (parsed.solana) {
                    mergedConfig.solana = __assign(__assign({}, defaultConfig.solana), parsed.solana);
                    if (!mergedConfig.solana.rpcUrl)
                        mergedConfig.solana.rpcUrl = (_a = defaultConfig.solana) === null || _a === void 0 ? void 0 : _a.rpcUrl;
                    if (!mergedConfig.solana.wsUrl)
                        mergedConfig.solana.wsUrl = (_b = defaultConfig.solana) === null || _b === void 0 ? void 0 : _b.wsUrl;
                    if (!mergedConfig.solana.commitment)
                        mergedConfig.solana.commitment = (_c = defaultConfig.solana) === null || _c === void 0 ? void 0 : _c.commitment;
                }
                if (parsed.pumpfun) {
                    mergedConfig.pumpfun = __assign(__assign({}, defaultConfig.pumpfun), parsed.pumpfun);
                    if (parsed.pumpfun.weights) {
                        mergedConfig.pumpfun.weights = __assign(__assign({}, (((_d = defaultConfig.pumpfun) === null || _d === void 0 ? void 0 : _d.weights) || {})), parsed.pumpfun.weights);
                    }
                }
                return mergedConfig;
            }
        }
        catch (error) {
            console.warn('Could not load config file, using defaults');
        }
        return defaultConfig;
    };
    ConfigManager.prototype.get = function () {
        return this.config;
    };
    ConfigManager.prototype.getSection = function (section) {
        return this.config[section];
    };
    ConfigManager.prototype.update = function (section, updates) {
        this.config[section] = __assign(__assign({}, this.config[section]), updates);
        this.saveConfig();
    };
    ConfigManager.prototype.saveConfig = function () {
        try {
            var configDir = path_1.default.dirname(this.configPath);
            if (!fs_1.default.existsSync(configDir)) {
                fs_1.default.mkdirSync(configDir, { recursive: true });
            }
            fs_1.default.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        }
        catch (error) {
            console.error('Could not save config file:', error);
        }
    };
    ConfigManager.prototype.isProduction = function () {
        return this.config.app.environment === 'production';
    };
    ConfigManager.prototype.isDevelopment = function () {
        return this.config.app.environment === 'development';
    };
    return ConfigManager;
}());
var configManager = new ConfigManager();
exports.default = configManager;
