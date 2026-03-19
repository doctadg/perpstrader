"use strict";
// Main Entry Point - Prediction Markets Agent
// Runs the autonomous prediction trading system (paper trading)
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prediction_markets_1 = require("./prediction-markets");
const prediction_store_1 = __importDefault(require("./data/prediction-store"));
const trace_store_1 = __importDefault(require("./data/trace-store"));
const logger_1 = __importDefault(require("./shared/logger"));
const technicalIndicators = __importStar(require("technicalindicators"));
const CYCLE_INTERVAL_MS = Number.parseInt(process.env.PREDICTION_CYCLE_INTERVAL_MS || '90000', 10) || 90000;
const INDICATOR_LOOKBACK = Number.parseInt(process.env.PREDICTION_TRACE_INDICATOR_LOOKBACK || '240', 10) || 240;
function safeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}
function normalizeStrategyIdea(idea, intel) {
    const name = idea.name || `${idea.marketTitle} (${idea.outcome})`;
    const type = idea.type || 'PREDICTION_MARKET';
    const strategyId = idea.strategyId || idea.id;
    const linkedNewsCount = idea.linkedNewsCount ?? intel?.linkedNewsCount ?? 0;
    const linkedClusterCount = idea.linkedClusterCount ?? intel?.linkedClusterCount ?? 0;
    const heatScore = idea.heatScore ?? intel?.avgClusterHeat ?? 0;
    const sentimentScore = idea.sentimentScore ?? intel?.sentimentScore ?? 0;
    const summary = idea.summary
        || `${type} | Edge ${(safeNumber(idea.edge) * 100).toFixed(1)}% | Heat ${safeNumber(heatScore).toFixed(1)} | News ${linkedNewsCount}`;
    return {
        ...idea,
        name,
        type,
        strategyId,
        summary,
        linkedNewsCount,
        linkedClusterCount,
        heatScore: Number(safeNumber(heatScore).toFixed(2)),
        sentimentScore: Number(safeNumber(sentimentScore).toFixed(3)),
        description: idea.rationale,
    };
}
function normalizeBacktestResult(result, ideasById) {
    const idea = ideasById.get(result.ideaId);
    const strategyId = result.strategyId || idea?.strategyId || result.ideaId;
    const strategyName = result.strategyName || idea?.name || `${idea?.marketTitle || result.marketId} (${idea?.outcome || 'YES'})`;
    const totalTrades = Number.isFinite(result.totalTrades) ? Number(result.totalTrades) : result.tradesSimulated;
    return {
        ...result,
        strategyId,
        strategyName,
        totalTrades,
        tradesSimulated: totalTrades,
    };
}
function getPredictionPriceSeries(idea) {
    const history = prediction_store_1.default.getMarketPrices(idea.marketId, INDICATOR_LOOKBACK);
    return history
        .map(point => idea.outcome === 'YES' ? point.yesPrice : point.noPrice)
        .filter((value) => Number.isFinite(value) && value > 0)
        .slice(-INDICATOR_LOOKBACK);
}
function buildPredictionIndicators(selectedIdea, selectedIntel) {
    if (!selectedIdea)
        return null;
    const prices = getPredictionPriceSeries(selectedIdea);
    const edge = safeNumber(selectedIdea.edge);
    const sentiment = safeNumber(selectedIntel?.sentimentScore, safeNumber(selectedIdea.sentimentScore));
    const heat = safeNumber(selectedIntel?.avgClusterHeat, safeNumber(selectedIdea.heatScore));
    const indicators = {
        rsi: [],
        macd: {
            macd: [],
            signal: [],
            histogram: [],
        },
        bollinger: {
            upper: [],
            middle: [],
            lower: [],
        },
        volatility: {
            atr: [],
            standardDeviation: [],
        },
    };
    try {
        if (prices.length >= 15) {
            indicators.rsi = technicalIndicators.RSI.calculate({ values: prices, period: 14 });
        }
    }
    catch (error) {
        logger_1.default.debug('[PredictionMain] RSI calculation failed, using fallback');
    }
    try {
        if (prices.length >= 35) {
            const macdRaw = technicalIndicators.MACD.calculate({
                values: prices,
                fastPeriod: 12,
                slowPeriod: 26,
                signalPeriod: 9,
                SimpleMAOscillator: false,
                SimpleMASignal: false,
            });
            for (const point of macdRaw) {
                if (!Number.isFinite(point.MACD) || !Number.isFinite(point.signal) || !Number.isFinite(point.histogram))
                    continue;
                indicators.macd.macd.push(point.MACD);
                indicators.macd.signal.push(point.signal);
                indicators.macd.histogram.push(point.histogram);
            }
        }
    }
    catch (error) {
        logger_1.default.debug('[PredictionMain] MACD calculation failed, using fallback');
    }
    try {
        if (prices.length >= 20) {
            const bands = technicalIndicators.BollingerBands.calculate({
                values: prices,
                period: 20,
                stdDev: 2,
            });
            indicators.bollinger.upper = bands.map(band => band.upper);
            indicators.bollinger.middle = bands.map(band => band.middle);
            indicators.bollinger.lower = bands.map(band => band.lower);
        }
    }
    catch (error) {
        logger_1.default.debug('[PredictionMain] Bollinger calculation failed, using fallback');
    }
    try {
        if (prices.length >= 15) {
            const highs = prices.map((price, index) => {
                const previous = index > 0 ? prices[index - 1] : price;
                const range = Math.max(0.002, Math.abs(price - previous));
                return Math.min(0.999, price + range * 0.5);
            });
            const lows = prices.map((price, index) => {
                const previous = index > 0 ? prices[index - 1] : price;
                const range = Math.max(0.002, Math.abs(price - previous));
                return Math.max(0.001, price - range * 0.5);
            });
            indicators.volatility.atr = technicalIndicators.ATR.calculate({
                high: highs,
                low: lows,
                close: prices,
                period: 14,
            });
        }
    }
    catch (error) {
        logger_1.default.debug('[PredictionMain] ATR calculation failed, using fallback');
    }
    if (!indicators.rsi.length) {
        const fallbackRsi = 50 + (sentiment * 26) + (edge * 120);
        indicators.rsi = [Math.max(5, Math.min(95, fallbackRsi))];
    }
    if (!indicators.macd.macd.length) {
        const fallbackMacd = (edge * 2) + (sentiment * 0.4);
        indicators.macd.macd = [fallbackMacd];
        indicators.macd.signal = [fallbackMacd * 0.65];
        indicators.macd.histogram = [fallbackMacd * 0.35];
    }
    if (!indicators.bollinger.upper.length) {
        const base = safeNumber(selectedIdea.impliedProbability, 0.5);
        const spread = Math.max(0.03, Math.min(0.2, Math.abs(edge) * 1.2 + (heat / 100) * 0.04));
        indicators.bollinger.upper = [Math.min(0.999, base + spread)];
        indicators.bollinger.middle = [base];
        indicators.bollinger.lower = [Math.max(0.001, base - spread)];
    }
    if (!indicators.volatility.atr.length) {
        indicators.volatility.atr = [Math.max(0.005, Math.min(0.3, Math.abs(edge) * 0.8 + Math.abs(sentiment) * 0.05))];
    }
    return indicators;
}
function buildTraceMarketIntel(marketIntel, selectedMarketId) {
    if (!marketIntel)
        return null;
    const intelList = Object.values(marketIntel);
    const marketsWithNews = intelList.filter(intel => intel.linkedNewsCount > 0).length;
    const marketsWithHeat = intelList.filter(intel => intel.linkedClusterCount > 0).length;
    const avgHeat = marketsWithHeat > 0
        ? intelList.filter(intel => intel.linkedClusterCount > 0).reduce((sum, intel) => sum + intel.avgClusterHeat, 0) / marketsWithHeat
        : 0;
    return {
        selected: selectedMarketId ? (marketIntel[selectedMarketId] || null) : null,
        byMarket: marketIntel,
        summary: {
            marketsTracked: intelList.length,
            marketsWithNews,
            marketsWithHeat,
            avgHeat: Number(avgHeat.toFixed(2)),
        },
    };
}
async function main() {
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    logger_1.default.info('  Prediction Markets Agent - Starting');
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    prediction_store_1.default.initialize();
    trace_store_1.default.initialize();
    let cycleCount = 0;
    while (true) {
        cycleCount++;
        logger_1.default.info(`\n╔══════════════════════════════════════════════════════════╗`);
        logger_1.default.info(`║  PREDICTION CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
        logger_1.default.info(`╚══════════════════════════════════════════════════════════╝`);
        try {
            const result = await (0, prediction_markets_1.runPredictionCycle)();
            const intelByMarket = result.marketIntel || {};
            const normalizedIdeas = result.ideas.map(idea => normalizeStrategyIdea(idea, intelByMarket[idea.marketId]));
            const ideasById = new Map(normalizedIdeas.map(idea => [idea.id, idea]));
            const normalizedBacktests = result.backtestResults.map(backtest => normalizeBacktestResult(backtest, ideasById));
            const selectedIdea = result.selectedIdea ? normalizeStrategyIdea(result.selectedIdea, intelByMarket[result.selectedIdea.marketId]) : null;
            const selectedIntel = selectedIdea ? intelByMarket[selectedIdea.marketId] : undefined;
            const indicators = buildPredictionIndicators(selectedIdea, selectedIntel);
            const marketIntelPayload = buildTraceMarketIntel(intelByMarket, selectedIdea?.marketId);
            const signal = result.signal
                ? { ...result.signal, strategyId: selectedIdea?.strategyId || result.signal.id }
                : null;
            const tradeExecuted = !!result.executionResult;
            trace_store_1.default.storeTrace({
                cycleId: result.cycleId,
                startTime: result.cycleStartTime,
                endTime: new Date(),
                symbol: selectedIdea?.name || result.selectedIdea?.marketTitle || result.selectedIdea?.marketId || 'PREDICTION_MARKETS',
                timeframe: selectedIdea?.timeHorizon || result.selectedIdea?.timeHorizon || 'prediction',
                success: result.errors.length === 0,
                tradeExecuted,
                regime: selectedIntel ? `${selectedIntel.trendDirection}_${selectedIntel.urgency}` : null,
                indicators,
                marketIntel: marketIntelPayload,
                candles: [],
                similarPatternsCount: selectedIntel?.linkedClusterCount || 0,
                strategyIdeas: normalizedIdeas,
                backtestResults: normalizedBacktests,
                selectedStrategy: selectedIdea,
                signal,
                riskAssessment: result.riskAssessment,
                executionResult: result.executionResult,
                thoughts: result.thoughts,
                errors: result.errors,
                agentType: 'PREDICTION',
            });
            logger_1.default.info(`[PredictionMain] Cycle complete: Ideas ${result.ideas.length}, Executed ${tradeExecuted ? 'yes' : 'no'}`);
        }
        catch (error) {
            logger_1.default.error('[PredictionMain] Cycle failed:', error);
        }
        logger_1.default.info(`[PredictionMain] Waiting ${CYCLE_INTERVAL_MS / 1000}s before next cycle...`);
        await sleep(CYCLE_INTERVAL_MS);
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
main().catch((error) => {
    logger_1.default.error('[PredictionMain] Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=prediction-agent.js.map