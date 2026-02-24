"use strict";
// Prediction Market Backtester Node
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backtesterNode = backtesterNode;
const prediction_store_1 = __importDefault(require("../../data/prediction-store"));
const polymarket_client_1 = __importDefault(require("../polymarket-client"));
const logger_1 = __importDefault(require("../../shared/logger"));
const MIN_HISTORY = Number.parseInt(process.env.PREDICTION_MIN_HISTORY || '20', 10) || 20;
const HORIZON = Number.parseInt(process.env.PREDICTION_BACKTEST_HORIZON || '5', 10) || 5;
function mean(values) {
    if (!values.length)
        return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}
function stdDev(values) {
    if (values.length < 2)
        return 0;
    const avg = mean(values);
    const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
}
function maxDrawdown(returns) {
    let peak = 0;
    let drawdown = 0;
    let cumulative = 0;
    for (const r of returns) {
        cumulative += r;
        peak = Math.max(peak, cumulative);
        drawdown = Math.min(drawdown, cumulative - peak);
    }
    return Math.abs(drawdown);
}
function normalizeSeries(points) {
    const byTimestamp = new Map();
    for (const point of points) {
        if (!Number.isFinite(point.timestamp))
            continue;
        if (!Number.isFinite(point.price) || point.price <= 0)
            continue;
        byTimestamp.set(point.timestamp, point.price);
    }
    return Array.from(byTimestamp.entries())
        .map(([timestamp, price]) => ({ timestamp, price }))
        .sort((a, b) => a.timestamp - b.timestamp);
}
function localSeriesFromSnapshots(idea, snapshots) {
    const points = [];
    for (const snapshot of snapshots) {
        const price = idea.outcome === 'YES' ? snapshot.yesPrice : snapshot.noPrice;
        if (!Number.isFinite(price) || price <= 0)
            continue;
        points.push({ timestamp: snapshot.timestamp.getTime(), price: price });
    }
    return normalizeSeries(points);
}
function resolveOutcomeTokenId(idea, market) {
    if (!market?.outcomes?.length)
        return null;
    const targetOutcome = market.outcomes.find(outcome => outcome.name.toUpperCase() === idea.outcome);
    if (targetOutcome?.id)
        return String(targetOutcome.id);
    if (idea.outcome === 'YES' && market.outcomes[0]?.id)
        return String(market.outcomes[0].id);
    if (idea.outcome === 'NO' && market.outcomes[1]?.id)
        return String(market.outcomes[1].id);
    return null;
}
async function backtesterNode(state) {
    logger_1.default.info(`[PredictionBacktester] Backtesting ${state.ideas.length} ideas`);
    if (!state.ideas.length) {
        return {
            currentStep: 'BACKTEST_SKIPPED',
            backtestResults: [],
            thoughts: [...state.thoughts, 'No prediction ideas to backtest'],
        };
    }
    const results = [];
    for (const idea of state.ideas) {
        const localHistory = prediction_store_1.default.getMarketPrices(idea.marketId, 300);
        const localSeries = localSeriesFromSnapshots(idea, localHistory);
        let seriesPoints = [...localSeries];
        if (seriesPoints.length < MIN_HISTORY) {
            const market = state.activeMarkets.find(m => m.id === idea.marketId)
                || state.marketUniverse.find(m => m.id === idea.marketId);
            const tokenId = resolveOutcomeTokenId(idea, market);
            if (tokenId) {
                const remoteCandles = await polymarket_client_1.default.fetchCandles(tokenId);
                const remoteSeries = normalizeSeries(remoteCandles.map(candle => ({
                    timestamp: candle.timestamp,
                    price: candle.price,
                })));
                seriesPoints = normalizeSeries([...localSeries, ...remoteSeries]);
            }
        }
        const series = seriesPoints.map(point => point.price);
        const returns = [];
        for (let i = 0; i + HORIZON < series.length; i++) {
            const entry = series[i];
            const exit = series[i + HORIZON];
            returns.push((exit - entry) / entry);
        }
        const avgReturn = mean(returns);
        const totalReturn = returns.reduce((sum, r) => sum + r, 0) * 100;
        const winRate = returns.length ? (returns.filter(r => r > 0).length / returns.length) * 100 : 0;
        const sharpe = stdDev(returns) ? (avgReturn / stdDev(returns)) * Math.sqrt(252) : 0;
        const result = {
            ideaId: idea.id,
            marketId: idea.marketId,
            period: {
                start: seriesPoints.length > 0 ? new Date(seriesPoints[0].timestamp) : new Date(),
                end: seriesPoints.length > 0 ? new Date(seriesPoints[seriesPoints.length - 1].timestamp) : new Date(),
            },
            totalReturn,
            averageReturn: avgReturn * 100,
            winRate,
            maxDrawdown: maxDrawdown(returns) * 100,
            tradesSimulated: returns.length,
            sharpeRatio: sharpe,
            strategyId: idea.strategyId || idea.id,
            strategyName: idea.name || `${idea.marketTitle} (${idea.outcome})`,
            totalTrades: returns.length,
        };
        prediction_store_1.default.storeBacktest(result);
        results.push(result);
    }
    return {
        currentStep: results.length ? 'BACKTEST_COMPLETE' : 'BACKTEST_EMPTY',
        backtestResults: results,
        thoughts: [
            ...state.thoughts,
            `Backtested ${results.length} prediction ideas`,
        ],
    };
}
exports.default = backtesterNode;
//# sourceMappingURL=backtester.js.map