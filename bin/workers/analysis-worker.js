"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const ta_module_1 = __importDefault(require("../ta-module/ta-module"));
const backtester_1 = require("../langgraph/nodes/backtester");
function buildCloseSeries(candles) {
    const closes = new Float64Array(candles.length);
    for (let i = 0; i < candles.length; i++) {
        closes[i] = candles[i].close;
    }
    return closes;
}
async function runBacktestBatch(payload) {
    const { ideas, candles } = payload;
    const closeSeries = buildCloseSeries(candles);
    const results = [];
    for (const idea of ideas) {
        const result = await (0, backtester_1.vectorizedBacktest)(idea, candles, closeSeries);
        results.push(result);
    }
    return results;
}
async function runTaAnalysis(payload) {
    const { symbol, timeframe, candles } = payload;
    return ta_module_1.default.analyzeMarket(symbol, timeframe, candles);
}
worker_threads_1.parentPort?.on('message', async (task) => {
    const { id, type, payload } = task || {};
    try {
        if (!id || !type) {
            throw new Error('Invalid task payload');
        }
        if (type === 'backtestBatch') {
            const result = await runBacktestBatch(payload);
            worker_threads_1.parentPort?.postMessage({ id, result });
            return;
        }
        if (type === 'ta') {
            const result = await runTaAnalysis(payload);
            worker_threads_1.parentPort?.postMessage({ id, result });
            return;
        }
        throw new Error(`Unsupported task type: ${type}`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        worker_threads_1.parentPort?.postMessage({ id, error: message });
    }
});
//# sourceMappingURL=analysis-worker.js.map