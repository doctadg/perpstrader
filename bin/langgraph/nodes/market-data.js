"use strict";
// Market Data Node
// Fetches latest candles and computes technical indicators
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketDataNode = marketDataNode;
const data_manager_1 = __importDefault(require("../../data-manager/data-manager"));
const ta_module_1 = __importDefault(require("../../ta-module/ta-module"));
const execution_engine_1 = __importDefault(require("../../execution-engine/execution-engine"));
const logger_1 = __importDefault(require("../../shared/logger"));
const analysis_worker_pool_1 = require("../../shared/analysis-worker-pool");
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../../shared/config"));
const lastProcessedSignature = new Map();
const MIN_CANDLES = 50;
const MIN_BACKTEST_CANDLES = 100;
const TARGET_CANDLES = 300;
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
function parseTimeframeMs(timeframe) {
    const match = timeframe.trim().match(/^(\d+)([smhd])$/i);
    if (!match)
        return 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's')
        return value * 1000;
    if (unit === 'm')
        return value * 60 * 1000;
    if (unit === 'h')
        return value * 60 * 60 * 1000;
    if (unit === 'd')
        return value * 24 * 60 * 60 * 1000;
    return 60 * 60 * 1000;
}
function toHyperliquidInterval(timeframe) {
    // Convert our timeframe format to Hyperliquid's expected format
    const match = timeframe.trim().match(/^(\d+)([smhd])$/i);
    if (!match)
        return '1h';
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's')
        return '1m'; // Hyperliquid doesn't support seconds, use 1m
    if (unit === 'm')
        return `${value}m`;
    if (unit === 'h')
        return `${value}h`;
    if (unit === 'd')
        return `${value}d`;
    return '1h';
}
/**
 * Fetch historical candles from Hyperliquid API
 */
async function fetchHyperliquidCandles(symbol, timeframe, count) {
    const hyperliquidConfig = config_1.default.getSection('hyperliquid');
    const baseUrl = hyperliquidConfig.baseUrl || 'https://api.hyperliquid.xyz';
    const interval = toHyperliquidInterval(timeframe);
    try {
        const endTime = Math.floor(Date.now() / 1000);
        const intervalMs = parseTimeframeMs(timeframe);
        const startTime = Math.floor((Date.now() - intervalMs * count) / 1000);
        const response = await axios_1.default.post(`${baseUrl}/info`, {
            type: 'candleSnapshot',
            req: {
                coin: symbol,
                interval: interval,
                startTime: startTime,
                endTime: endTime
            }
        }, { timeout: 10000 });
        if (response.data && Array.isArray(response.data)) {
            return response.data.map((candle) => ({
                symbol,
                timestamp: new Date(candle.t),
                open: parseFloat(candle.o),
                high: parseFloat(candle.h),
                low: parseFloat(candle.l),
                close: parseFloat(candle.c),
                volume: parseFloat(candle.v || candle.n || 0),
                vwap: (parseFloat(candle.h) + parseFloat(candle.l) + parseFloat(candle.c)) / 3
            }));
        }
        return [];
    }
    catch (error) {
        logger_1.default.warn(`[MarketDataNode] Failed to fetch candles from Hyperliquid API: ${error}`);
        return [];
    }
}
/**
 * Market Data Node
 * Fetches current market data and computes technical indicators
 */
async function marketDataNode(state) {
    logger_1.default.info(`[MarketDataNode] Fetching data for ${state.symbol} ${state.timeframe}`);
    try {
        // Fetch recent candles (last 7 days by default, scaled by timeframe)
        const endTime = new Date();
        const timeframeMs = parseTimeframeMs(state.timeframe);
        const lookbackMs = Math.max(DEFAULT_LOOKBACK_MS, timeframeMs * TARGET_CANDLES);
        const startTime = new Date(endTime.getTime() - lookbackMs);
        const limit = Math.max(1000, TARGET_CANDLES);
        let candles = await data_manager_1.default.getMarketData(state.symbol, startTime, endTime, limit);
        // If not enough data in local DB, try to get whatever is available
        if (candles.length < MIN_BACKTEST_CANDLES) {
            logger_1.default.warn(`[MarketDataNode] Only ${candles.length} candles in local DB, fetching all available`);
            candles = await data_manager_1.default.getMarketData(state.symbol, undefined, undefined, Math.max(limit, 2000));
        }
        // If still not enough data, fetch from Hyperliquid API directly
        if (candles.length < MIN_CANDLES) {
            logger_1.default.info(`[MarketDataNode] Fetching historical candles from Hyperliquid API for ${state.symbol}`);
            const apiCandles = await fetchHyperliquidCandles(state.symbol, state.timeframe, TARGET_CANDLES);
            if (apiCandles.length >= MIN_CANDLES) {
                logger_1.default.info(`[MarketDataNode] Fetched ${apiCandles.length} candles from Hyperliquid API`);
                candles = apiCandles;
            }
            else if (apiCandles.length > candles.length) {
                candles = apiCandles;
            }
        }
        if (candles.length < MIN_CANDLES) {
            return {
                currentStep: 'MARKET_DATA_INSUFFICIENT',
                candles: candles,
                indicators: null,
                thoughts: [...state.thoughts, `Insufficient market data: only ${candles.length} candles available`],
                errors: [...state.errors, 'Not enough market data for analysis'],
            };
        }
        // Ensure candles are oldest -> newest for indicators/regime detection
        candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const latestCandle = candles[candles.length - 1];
        const latestTimestamp = latestCandle?.timestamp?.getTime() || 0;
        const candleKey = `${state.symbol}:${state.timeframe}`;
        const signature = latestCandle
            ? `${latestTimestamp}:${latestCandle.open}:${latestCandle.high}:${latestCandle.low}:${latestCandle.close}:${latestCandle.volume}`
            : '';
        const lastSignature = lastProcessedSignature.get(candleKey);
        // Track staleness but DON'T skip - we still need to compute indicators
        // for strategy generation and to monitor any open positions
        const isStale = lastSignature && signature === lastSignature;
        if (isStale) {
            logger_1.default.info(`[MarketDataNode] Candle unchanged for ${state.symbol}, but continuing with indicator computation`);
        }
        // Compute technical indicators
        let indicators;
        const pool = (0, analysis_worker_pool_1.getAnalysisWorkerPool)();
        if (pool) {
            try {
                indicators = await pool.runTask('ta', {
                    symbol: state.symbol,
                    timeframe: state.timeframe,
                    candles,
                });
            }
            catch (error) {
                logger_1.default.warn('[MarketDataNode] Worker TA analysis failed, falling back to main thread:', error);
                indicators = await ta_module_1.default.analyzeMarket(state.symbol, state.timeframe, candles);
            }
        }
        else {
            indicators = await ta_module_1.default.analyzeMarket(state.symbol, state.timeframe, candles);
        }
        // Detect market regime
        const regime = detectMarketRegime(candles, indicators);
        // Get current portfolio state
        let portfolio = state.portfolio;
        try {
            portfolio = await execution_engine_1.default.getPortfolio();
        }
        catch (error) {
            logger_1.default.warn('[MarketDataNode] Failed to get portfolio, using default');
            portfolio = {
                totalValue: 10000,
                availableBalance: 10000,
                usedBalance: 0,
                positions: [],
                dailyPnL: 0,
                unrealizedPnL: 0,
            };
        }
        if (signature) {
            lastProcessedSignature.set(candleKey, signature);
        }
        logger_1.default.info(`[MarketDataNode] Loaded ${candles.length} candles, regime: ${regime}`);
        return {
            currentStep: 'MARKET_DATA_READY',
            candles,
            indicators,
            regime,
            portfolio,
            thoughts: [
                ...state.thoughts,
                `Loaded ${candles.length} candles for ${state.symbol}`,
                ...(candles.length < MIN_BACKTEST_CANDLES
                    ? [`Backtest window limited (${candles.length} candles); results may be noisy`]
                    : []),
                `Market regime detected: ${regime}`,
                `Latest price: ${candles[candles.length - 1]?.close.toFixed(2)}`,
            ],
        };
    }
    catch (error) {
        logger_1.default.error('[MarketDataNode] Failed to fetch market data:', error);
        return {
            currentStep: 'MARKET_DATA_ERROR',
            errors: [...state.errors, `Market data fetch failed: ${error}`],
        };
    }
}
/**
 * Detect the current market regime based on indicators
 */
function detectMarketRegime(candles, indicators) {
    const recentCandles = candles.slice(-20);
    const firstPrice = recentCandles[0]?.close || 0;
    const lastPrice = recentCandles[recentCandles.length - 1]?.close || 0;
    const priceChange = (lastPrice - firstPrice) / firstPrice;
    // Calculate volatility
    const returns = [];
    for (let i = 1; i < recentCandles.length; i++) {
        returns.push((recentCandles[i].close - recentCandles[i - 1].close) / recentCandles[i - 1].close);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized
    // Get recent RSI
    const recentRSI = indicators.rsi.slice(-5);
    const avgRSI = recentRSI.reduce((a, b) => a + b, 0) / recentRSI.length;
    // Determine regime
    // ULTRA-AGGRESSIVE: Lowered LOW_VOLATILITY threshold from 0.15 to 0.05 (5% annualized)
    // This reduces false low-volatility detections and allows more trades
    if (volatility > 0.5) {
        return 'HIGH_VOLATILITY';
    }
    else if (volatility < 0.05) { // Changed from 0.15 to 0.05
        return 'LOW_VOLATILITY';
    }
    else if (priceChange > 0.03 && avgRSI > 50) {
        return 'TRENDING_UP';
    }
    else if (priceChange < -0.03 && avgRSI < 50) {
        return 'TRENDING_DOWN';
    }
    else {
        return 'RANGING';
    }
}
exports.default = marketDataNode;
//# sourceMappingURL=market-data.js.map