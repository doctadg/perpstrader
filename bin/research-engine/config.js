"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.researchEngineConfig = void 0;
exports.loadResearchEngineConfig = loadResearchEngineConfig;
require("dotenv/config");
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MIN_SHARPE_RATIO = 1.5;
const DEFAULT_MIN_WIN_RATE = 55;
const DEFAULT_MAX_CONCURRENT_BACKTESTS = 5;
function parsePositiveInt(value, fallback) {
    if (!value)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function parsePositiveNumber(value, fallback) {
    if (!value)
        return fallback;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function parseWinRate(value, fallback) {
    if (!value)
        return fallback;
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed))
        return fallback;
    const percentage = parsed <= 1 ? parsed * 100 : parsed;
    return Math.max(0, Math.min(100, percentage));
}
function loadResearchEngineConfig(env = process.env) {
    const researchIntervalMs = parsePositiveInt(env.RESEARCH_INTERVAL_MS, parsePositiveInt(env.RESEARCH_INTERVAL_MINUTES, 15) * 60 * 1000);
    const evolutionIntervalMs = parsePositiveInt(env.EVOLUTION_INTERVAL_MS, parsePositiveInt(env.EVOLUTION_INTERVAL_HOURS, 6) * 60 * 60 * 1000);
    return {
        researchIntervalMs: Math.max(FIFTEEN_MINUTES_MS, researchIntervalMs),
        evolutionIntervalMs: Math.max(SIX_HOURS_MS, evolutionIntervalMs),
        performanceThresholds: {
            minSharpeRatio: parsePositiveNumber(env.RESEARCH_MIN_SHARPE_RATIO, DEFAULT_MIN_SHARPE_RATIO),
            minWinRate: parseWinRate(env.RESEARCH_MIN_WIN_RATE, DEFAULT_MIN_WIN_RATE),
        },
        maxConcurrentBacktests: parsePositiveInt(env.RESEARCH_MAX_CONCURRENT_BACKTESTS, DEFAULT_MAX_CONCURRENT_BACKTESTS),
    };
}
exports.researchEngineConfig = loadResearchEngineConfig();
exports.default = exports.researchEngineConfig;
//# sourceMappingURL=config.js.map