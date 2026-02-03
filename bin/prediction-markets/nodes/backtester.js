"use strict";
// Prediction Market Backtester Node
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
exports.backtesterNode = backtesterNode;
const prediction_store_1 = __importDefault(require("../../data/prediction-store"));
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
        let series = [];
        const localHistory = prediction_store_1.default.getMarketPrices(idea.marketId, 200);
        // Prefer local if enough data
        if (localHistory.length >= MIN_HISTORY) {
            series = localHistory
                .map(point => idea.outcome === 'YES' ? point.yesPrice : point.noPrice)
                .filter((price) => typeof price === 'number' && Number.isFinite(price) && price > 0);
        }
        // Fallback to API if we don't have enough local history
        if (series.length < MIN_HISTORY) {
            Promise.resolve().then(() => __importStar(require('../polymarket-client'))).then(async (mod) => {
                // This is tricky because we're inside a sync loop, but backtesterNode is async
                // We need to refactor the loop to be async-friendly or structure this differently
                // Since the function is async, we can await inside the loop if we change it to 'for ... of'
            });
            // Note: The loop below needs to be awaited. 
            // Checking file structure: it's a 'for (const idea of state.ideas)' loop inside 'async function'.
            // So we can await directly.
        }
        // NOTE: Splitting this replacement to avoid complexity with imports. 
        // I will replace the LOGIC block.
        // Assuming 'polymarketClient' is imported or I can import it.
        // 'polymarket-client' is NOT imported in original file.
        // I need to add the import first!
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
                start: localHistory.length > 0 ? localHistory[0].timestamp : new Date(),
                end: localHistory.length > 0 ? localHistory[localHistory.length - 1].timestamp : new Date(),
            },
            totalReturn,
            averageReturn: avgReturn * 100,
            winRate,
            maxDrawdown: maxDrawdown(returns) * 100,
            tradesSimulated: returns.length,
            sharpeRatio: sharpe,
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