"use strict";
// Main Entry Point - LangGraph Trading Agent
// Runs the autonomous trading system with enhanced resilience
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Polyfill must be imported before anything else
require("./polyfills");
require("dotenv/config");
const langgraph_1 = require("./langgraph");
const market_ingester_1 = __importDefault(require("./market-ingester/market-ingester"));
const trace_store_1 = __importDefault(require("./data/trace-store"));
const data_manager_1 = __importDefault(require("./data-manager/data-manager"));
const dashboard_server_1 = __importDefault(require("./dashboard/dashboard-server"));
const trace_analyzer_1 = require("./strategy-engine/trace-analyzer");
const circuit_breaker_1 = __importDefault(require("./shared/circuit-breaker"));
const position_recovery_1 = __importDefault(require("./execution-engine/position-recovery"));
const dynamic_symbols_1 = require("./shared/dynamic-symbols");
const research_engine_1 = __importDefault(require("./research-engine"));
const node_cron_1 = __importDefault(require("node-cron"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("./shared/logger"));
const child_process_1 = require("child_process");
// Configuration
let SYMBOLS = ['BTC', 'ETH', 'SOL']; // Default, will be updated dynamically
const TIMEFRAME = '1m';
const CYCLE_INTERVAL_MS = 60 * 1000;
const MIN_ANALYSIS_CANDLES = Math.max(1, Number.parseInt(process.env.TRADING_MIN_ANALYSIS_CANDLES || '50', 10) || 50);
const MARKET_DATA_MAX_AGE_MS = Math.max(parseTimeframeMs(TIMEFRAME) * 5, Number.parseInt(process.env.TRADING_MARKET_DATA_MAX_AGE_MS || '300000', 10) || 300000);
const MARKET_DATA_CHECK_TTL_MS = Math.max(CYCLE_INTERVAL_MS / 2, Number.parseInt(process.env.TRADING_MARKET_DATA_CHECK_TTL_MS || '120000', 10) || 120000);
const MAX_ACTIVE_SYMBOLS = Math.max(5, Number.parseInt(process.env.TRADING_MAX_ACTIVE_SYMBOLS || '30', 10) || 30);
const API_READINESS_CHECK_LIMIT = Math.max(0, Number.parseInt(process.env.TRADING_API_READINESS_CHECK_LIMIT || '25', 10) || 25);
const SYMBOL_DATA_FAILURES_BEFORE_COOLDOWN = Math.max(1, Number.parseInt(process.env.TRADING_SYMBOL_DATA_FAILURES_BEFORE_COOLDOWN || '3', 10) || 3);
const SYMBOL_DATA_COOLDOWN_MS = Math.max(CYCLE_INTERVAL_MS, Number.parseInt(process.env.TRADING_SYMBOL_DATA_COOLDOWN_MS || String(6 * 60 * 60 * 1000), 10) || (6 * 60 * 60 * 1000));
const ENABLE_STARTUP_SYMBOL_PRUNE = process.env.TRADING_STARTUP_SYMBOL_PRUNE !== 'false';
const CORE_FALLBACK_SYMBOLS = ['BTC', 'ETH', 'SOL'];
const HYPERLIQUID_INFO_URL = `${process.env.HYPERLIQUID_BASE_URL || 'https://api.hyperliquid.xyz'}/info`;
const EXCLUDED_SYMBOLS = new Set((process.env.TRADING_EXCLUDED_SYMBOLS || '')
    .split(',')
    .map(symbol => symbol.trim().toUpperCase())
    .filter(Boolean));
// Child process management for news-agent and prediction-agent
const CHILD_PROCESSES = new Map();
const CHILD_RESTART_DELAYS = new Map();
const MAX_RESTART_DELAY_MS = 60000; // Max 60 seconds between restarts
const INITIAL_RESTART_DELAY_MS = 5000; // Start with 5 seconds
const CHILD_PROCESS_CONFIGS = [
    {
        name: 'news-agent',
        scriptPath: '/home/d/PerpsTrader/bin/news-agent.js',
        restartDelayMs: INITIAL_RESTART_DELAY_MS,
    },
    {
        name: 'prediction-agent',
        scriptPath: '/home/d/PerpsTrader/bin/prediction-agent.js',
        restartDelayMs: INITIAL_RESTART_DELAY_MS,
    },
    {
        name: 'research-engine',
        scriptPath: '/home/d/PerpsTrader/bin/research-engine/entry.js',
        restartDelayMs: INITIAL_RESTART_DELAY_MS,
    },
];
function spawnChildProcess(config) {
    const { name, scriptPath } = config;
    logger_1.default.info(`[ChildProcess] Starting ${name} from ${scriptPath}...`);
    const child = (0, child_process_1.fork)(scriptPath, [], {
        silent: false,
        execArgv: [],
    });
    CHILD_PROCESSES.set(name, child);
    child.on('spawn', () => {
        logger_1.default.info(`[ChildProcess] ${name} started (PID: ${child.pid})`);
        // Reset restart delay on successful start
        CHILD_RESTART_DELAYS.set(name, INITIAL_RESTART_DELAY_MS);
    });
    child.on('error', (error) => {
        logger_1.default.error(`[ChildProcess] ${name} error:`, error);
    });
    child.on('exit', (code, signal) => {
        logger_1.default.warn(`[ChildProcess] ${name} exited with code ${code}, signal ${signal}`);
        CHILD_PROCESSES.delete(name);
        // Schedule restart with exponential backoff
        const currentDelay = CHILD_RESTART_DELAYS.get(name) || INITIAL_RESTART_DELAY_MS;
        logger_1.default.info(`[ChildProcess] Restarting ${name} in ${currentDelay}ms...`);
        setTimeout(() => {
            if (!CHILD_PROCESSES.has(name)) {
                spawnChildProcess(config);
            }
        }, currentDelay);
        // Increase delay for next time (exponential backoff, capped at MAX_RESTART_DELAY_MS)
        const nextDelay = Math.min(currentDelay * 2, MAX_RESTART_DELAY_MS);
        CHILD_RESTART_DELAYS.set(name, nextDelay);
    });
    child.on('message', (message) => {
        logger_1.default.info(`[ChildProcess] ${name} message:`, message);
    });
    return child;
}
function startChildProcesses() {
    logger_1.default.info('[ChildProcess] Starting child processes...');
    for (const config of CHILD_PROCESS_CONFIGS) {
        if (!CHILD_PROCESSES.has(config.name)) {
            spawnChildProcess(config);
        }
    }
}
function stopChildProcesses() {
    logger_1.default.info('[ChildProcess] Stopping all child processes...');
    for (const [name, child] of CHILD_PROCESSES.entries()) {
        logger_1.default.info(`[ChildProcess] Killing ${name} (PID: ${child.pid})...`);
        child.kill('SIGTERM');
        // Force kill after 5 seconds if still running
        setTimeout(() => {
            if (!child.killed) {
                logger_1.default.warn(`[ChildProcess] ${name} did not exit gracefully, forcing SIGKILL...`);
                child.kill('SIGKILL');
            }
        }, 5000);
    }
    CHILD_PROCESSES.clear();
}
const symbolDataReadinessCache = new Map();
const symbolDataFailureCounts = new Map();
const symbolDataCooldownUntil = new Map();
function parseTimeframeMs(timeframe) {
    const match = timeframe.trim().match(/^(\d+)([smhd])$/i);
    if (!match)
        return 60 * 1000;
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
    return 60 * 1000;
}
function toHyperliquidInterval(timeframe) {
    const match = timeframe.trim().match(/^(\d+)([smhd])$/i);
    if (!match)
        return '1m';
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's')
        return '1m';
    if (unit === 'm')
        return `${value}m`;
    if (unit === 'h')
        return `${value}h`;
    if (unit === 'd')
        return `${value}d`;
    return '1m';
}
async function fetchApiCandleReadiness(symbol, timeframe, minCandles) {
    const now = Date.now();
    const intervalMs = parseTimeframeMs(timeframe);
    const lookbackCandles = Math.max(minCandles * 3, 180);
    const startTime = now - (intervalMs * lookbackCandles);
    const interval = toHyperliquidInterval(timeframe);
    try {
        const response = await axios_1.default.post(HYPERLIQUID_INFO_URL, {
            type: 'candleSnapshot',
            req: {
                coin: symbol,
                interval,
                startTime,
                endTime: now,
            },
        }, { timeout: 10000 });
        if (!Array.isArray(response.data) || response.data.length === 0) {
            return { candles: 0, latestCandleTs: 0 };
        }
        const latest = response.data[response.data.length - 1];
        const rawTs = Number(latest?.t || 0);
        const latestCandleTs = Number.isFinite(rawTs) ? (rawTs < 1e12 ? rawTs * 1000 : rawTs) : 0;
        return {
            candles: response.data.length,
            latestCandleTs,
        };
    }
    catch {
        return { candles: 0, latestCandleTs: 0 };
    }
}
async function getSymbolDataReadiness(symbol, options) {
    const upper = symbol.toUpperCase();
    const now = Date.now();
    const cached = symbolDataReadinessCache.get(upper);
    if (cached && now - cached.checkedAt < MARKET_DATA_CHECK_TTL_MS) {
        return cached;
    }
    try {
        const candles = await data_manager_1.default.getMarketData(upper, undefined, undefined, MIN_ANALYSIS_CANDLES);
        const latestCandleTs = candles[0]?.timestamp?.getTime?.() || 0;
        const localReady = candles.length >= MIN_ANALYSIS_CANDLES
            && latestCandleTs > 0
            && now - latestCandleTs <= MARKET_DATA_MAX_AGE_MS;
        if (localReady) {
            const result = {
                ready: true,
                candles: candles.length,
                latestCandleTs,
                checkedAt: now,
                reason: 'ready',
            };
            symbolDataReadinessCache.set(upper, result);
            return result;
        }
        let apiCandles = 0;
        let apiLatestCandleTs = 0;
        if (options?.allowApiFallback !== false) {
            const apiReadiness = await fetchApiCandleReadiness(symbol, TIMEFRAME, MIN_ANALYSIS_CANDLES);
            apiCandles = apiReadiness.candles;
            apiLatestCandleTs = apiReadiness.latestCandleTs;
            const apiReady = apiCandles >= MIN_ANALYSIS_CANDLES
                && apiLatestCandleTs > 0
                && now - apiLatestCandleTs <= MARKET_DATA_MAX_AGE_MS;
            if (apiReady) {
                const result = {
                    ready: true,
                    candles: apiCandles,
                    latestCandleTs: apiLatestCandleTs,
                    checkedAt: now,
                    reason: 'ready_api',
                };
                symbolDataReadinessCache.set(upper, result);
                return result;
            }
        }
        const bestCandles = Math.max(candles.length, apiCandles);
        const bestLatestTs = Math.max(latestCandleTs, apiLatestCandleTs);
        if (bestCandles < MIN_ANALYSIS_CANDLES) {
            const result = {
                ready: false,
                candles: bestCandles,
                latestCandleTs: bestLatestTs,
                checkedAt: now,
                reason: 'insufficient_candles',
            };
            symbolDataReadinessCache.set(upper, result);
            return result;
        }
        if (!bestLatestTs || now - bestLatestTs > MARKET_DATA_MAX_AGE_MS) {
            const result = {
                ready: false,
                candles: bestCandles,
                latestCandleTs: bestLatestTs,
                checkedAt: now,
                reason: 'stale_data',
            };
            symbolDataReadinessCache.set(upper, result);
            return result;
        }
        const result = {
            ready: false,
            candles: bestCandles,
            latestCandleTs: bestLatestTs,
            checkedAt: now,
            reason: 'stale_data',
        };
        symbolDataReadinessCache.set(upper, result);
        return result;
    }
    catch (error) {
        logger_1.default.warn(`[Main] Data readiness check failed for ${upper}:`, error);
        const result = {
            ready: false,
            candles: 0,
            latestCandleTs: 0,
            checkedAt: now,
            reason: 'query_failed',
        };
        symbolDataReadinessCache.set(upper, result);
        return result;
    }
}
function ensureCoreFallbackSymbols() {
    const now = Date.now();
    const existingUpper = new Set(SYMBOLS.map(symbol => symbol.toUpperCase()));
    for (const coreSymbol of CORE_FALLBACK_SYMBOLS) {
        const upper = coreSymbol.toUpperCase();
        if (existingUpper.has(upper))
            continue;
        const cooldownUntil = symbolDataCooldownUntil.get(upper) || 0;
        if (cooldownUntil > now)
            continue;
        SYMBOLS.push(coreSymbol);
        existingUpper.add(upper);
        if (SYMBOLS.length >= MAX_ACTIVE_SYMBOLS) {
            break;
        }
    }
    if (SYMBOLS.length > MAX_ACTIVE_SYMBOLS) {
        SYMBOLS = SYMBOLS.slice(0, MAX_ACTIVE_SYMBOLS);
    }
}
function pruneSymbolsFromUniverse(symbolsToPrune, context) {
    if (symbolsToPrune.length === 0)
        return;
    const pruneSet = new Set(symbolsToPrune.map(symbol => symbol.toUpperCase()));
    const before = SYMBOLS.length;
    SYMBOLS = SYMBOLS.filter(symbol => !pruneSet.has(symbol.toUpperCase()));
    const removed = before - SYMBOLS.length;
    if (removed > 0) {
        const preview = symbolsToPrune.slice(0, 10).join(', ');
        logger_1.default.warn(`[Main] Pruned ${removed} symbols from active universe (${context}): ${preview}${symbolsToPrune.length > 10 ? ', ...' : ''}`);
    }
    ensureCoreFallbackSymbols();
}
async function filterSymbolsWithSufficientData(symbols, options) {
    if (symbols.length === 0) {
        return { readySymbols: [], cooledSymbols: [], skipped: [] };
    }
    const updateFailures = options?.updateFailures !== false;
    const context = options?.context || 'cycle';
    const originalByUpper = new Map();
    for (const symbol of symbols) {
        const upper = symbol.toUpperCase();
        if (!originalByUpper.has(upper)) {
            originalByUpper.set(upper, symbol);
        }
    }
    const now = Date.now();
    const uniqueSymbols = [...originalByUpper.keys()];
    const readinessEntries = await Promise.all(uniqueSymbols.map(async (upper, index) => {
        const symbol = originalByUpper.get(upper) || upper;
        const cooldownUntil = symbolDataCooldownUntil.get(upper) || 0;
        if (cooldownUntil > now) {
            return {
                upper,
                symbol,
                readiness: {
                    ready: false,
                    candles: 0,
                    latestCandleTs: 0,
                    checkedAt: now,
                    reason: 'cooldown',
                },
            };
        }
        return {
            upper,
            symbol,
            readiness: await getSymbolDataReadiness(symbol, {
                allowApiFallback: index < API_READINESS_CHECK_LIMIT,
            }),
        };
    }));
    const readySymbols = [];
    const cooledSymbols = [];
    const skipped = [];
    for (const entry of readinessEntries) {
        if (entry.readiness.ready) {
            readySymbols.push(entry.symbol);
            symbolDataFailureCounts.delete(entry.upper);
            continue;
        }
        skipped.push({
            symbol: entry.symbol,
            reason: entry.readiness.reason,
            candles: entry.readiness.candles,
        });
        if (!updateFailures || entry.readiness.reason === 'cooldown') {
            continue;
        }
        const failures = (symbolDataFailureCounts.get(entry.upper) || 0) + 1;
        if (failures >= SYMBOL_DATA_FAILURES_BEFORE_COOLDOWN) {
            symbolDataFailureCounts.delete(entry.upper);
            symbolDataCooldownUntil.set(entry.upper, Date.now() + SYMBOL_DATA_COOLDOWN_MS);
            cooledSymbols.push(entry.symbol);
            symbolDataReadinessCache.delete(entry.upper);
        }
        else {
            symbolDataFailureCounts.set(entry.upper, failures);
        }
    }
    if (skipped.length > 0) {
        const skippedPreview = skipped
            .slice(0, 8)
            .map(entry => `${entry.symbol}:${entry.reason}:${entry.candles}`)
            .join(', ');
        logger_1.default.info(`[Main] ${context} market-data gate skipped ${skipped.length} symbols (${skippedPreview}${skipped.length > 8 ? ', ...' : ''})`);
    }
    if (cooledSymbols.length > 0) {
        logger_1.default.warn(`[Main] ${context} market-data cooldown applied to ${cooledSymbols.length} symbols for ${Math.round(SYMBOL_DATA_COOLDOWN_MS / 60000)}m`);
    }
    return { readySymbols, cooledSymbols, skipped };
}
/**
 * Main autonomous trading loop with enhanced resilience
 */
async function main() {
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    logger_1.default.info('  LangGraph Autonomous Trading Agent - Starting');
    logger_1.default.info('  Enhanced with Circuit Breakers & Position Recovery');
    logger_1.default.info('═══════════════════════════════════════════════════════════');
    try {
        // Initialize services
        logger_1.default.info('[Main] Initializing services...');
        // Start dashboard server
        try {
            await dashboard_server_1.default.start();
            logger_1.default.info('[Main] Dashboard server started');
        }
        catch (error) {
            logger_1.default.warn('[Main] Dashboard failed to start, continuing without:', error);
        }
        // Start market data ingestion
        try {
            await market_ingester_1.default.start();
            logger_1.default.info('[Main] Market ingester started');
        }
        catch (error) {
            logger_1.default.warn('[Main] Market ingester failed to start, continuing in offline mode:', error);
        }
        // Initialize trace store for LLM analysis
        try {
            trace_store_1.default.initialize();
            const traceStats = trace_store_1.default.getStats();
            logger_1.default.info(`[Main] Trace store initialized: ${traceStats.total} traces, ${traceStats.unanalyzed} pending analysis`);
        }
        catch (error) {
            logger_1.default.warn('[Main] Trace store initialization failed:', error);
        }
        // Start circuit breaker health checks
        try {
            circuit_breaker_1.default.startHealthChecks(30000); // 30 second intervals
            logger_1.default.info('[Main] Circuit breaker health checks started');
        }
        catch (error) {
            logger_1.default.warn('[Main] Circuit breaker health checks failed to start:', error);
        }
        // Start position recovery monitoring
        try {
            position_recovery_1.default.startMonitoring(15000); // 15 second intervals for faster stop/recovery exits
            logger_1.default.info('[Main] Position recovery monitoring started');
        }
        catch (error) {
            logger_1.default.warn('[Main] Position recovery monitoring failed to start:', error);
        }
        // Start child processes (news-agent and prediction-agent)
        try {
            startChildProcesses();
        }
        catch (error) {
            logger_1.default.warn('[Main] Failed to start child processes:', error);
        }
        // Start research engine for continuous strategy generation
        try {
            await research_engine_1.default.start();
            logger_1.default.info('[Main] Research engine started (generates strategies every 15 minutes)');
        }
        catch (error) {
            logger_1.default.warn('[Main] Research engine failed to start:', error);
        }
        // Schedule daily trace analysis at 2 AM
        node_cron_1.default.schedule('0 2 * * *', async () => {
            logger_1.default.info('[Main] Running scheduled daily trace analysis...');
            try {
                const insights = await (0, trace_analyzer_1.runDailyTraceAnalysis)();
                logger_1.default.info(`[Main] Trace analysis complete: ${insights.length} insights generated`);
            }
            catch (error) {
                logger_1.default.error('[Main] Daily trace analysis failed:', error);
            }
        });
        logger_1.default.info('[Main] Daily trace analysis scheduled for 2:00 AM');
        // Load dynamic trading symbols from Hyperliquid
        logger_1.default.info('[Main] Loading dynamic trading symbols from Hyperliquid...');
        try {
            // Get top 50 markets by volume for trading
            const topSymbols = await (0, dynamic_symbols_1.getTopVolumeSymbols)(50);
            // Also get symbols with extreme funding rates
            const { positive, negative } = await (0, dynamic_symbols_1.getExtremeFundingSymbols)(0.0001);
            const extremeSymbols = [...positive.slice(0, 10), ...negative.slice(0, 10)];
            // Combine and deduplicate
            const allSymbols = [...new Set([...topSymbols, ...extremeSymbols])]
                .filter(symbol => !EXCLUDED_SYMBOLS.has(symbol.toUpperCase()));
            if (allSymbols.length > 0) {
                SYMBOLS = allSymbols.slice(0, MAX_ACTIVE_SYMBOLS);
                logger_1.default.info(`[Main] Loaded ${SYMBOLS.length} dynamic symbols (${EXCLUDED_SYMBOLS.size} excluded): ${SYMBOLS.slice(0, 10).join(', ')}${SYMBOLS.length > 10 ? '...' : ''}`);
            }
            else {
                logger_1.default.warn('[Main] Failed to load dynamic symbols, using defaults');
            }
        }
        catch (error) {
            logger_1.default.error('[Main] Error loading dynamic symbols:', error);
            logger_1.default.warn('[Main] Using default symbols');
        }
        if (ENABLE_STARTUP_SYMBOL_PRUNE) {
            const beforePruneCount = SYMBOLS.length;
            const startupFilter = await filterSymbolsWithSufficientData(SYMBOLS, {
                updateFailures: false,
                context: 'startup',
            });
            if (startupFilter.readySymbols.length > 0) {
                SYMBOLS = startupFilter.readySymbols.slice(0, MAX_ACTIVE_SYMBOLS);
                logger_1.default.info(`[Main] Startup prune kept ${SYMBOLS.length}/${beforePruneCount} symbols with enough data`);
            }
            else {
                logger_1.default.warn('[Main] Startup prune found no symbols with sufficient data, keeping current list');
            }
        }
        ensureCoreFallbackSymbols();
        // Schedule hourly health check logging
        node_cron_1.default.schedule('0 * * * *', async () => {
            try {
                const healthSummary = await circuit_breaker_1.default.getHealthSummary();
                logger_1.default.info(`[Main] Health check: ${healthSummary.overall}`);
                for (const component of healthSummary.components) {
                    logger_1.default.info(`  - ${component.component}: ${component.status} (${component.responseTime}ms)`);
                }
                // Log open circuit breakers
                const openBreakers = healthSummary.breakers.filter(b => b.isOpen);
                if (openBreakers.length > 0) {
                    logger_1.default.warn(`[Main] Open circuit breakers: ${openBreakers.map(b => b.name).join(', ')}`);
                }
            }
            catch (error) {
                logger_1.default.error('[Main] Hourly health check failed:', error);
            }
        });
        logger_1.default.info(`[Main] Trading symbols: ${SYMBOLS.join(', ')}`);
        logger_1.default.info(`[Main] Timeframe: ${TIMEFRAME}`);
        logger_1.default.info(`[Main] Cycle interval: ${CYCLE_INTERVAL_MS / 1000}s`);
        logger_1.default.info(`[Main] Market data gate: minCandles=${MIN_ANALYSIS_CANDLES}, maxAgeMs=${MARKET_DATA_MAX_AGE_MS}`);
        logger_1.default.info(`[Main] Symbol controls: maxActive=${MAX_ACTIVE_SYMBOLS}, apiChecksPerCycle=${API_READINESS_CHECK_LIMIT}, cooldownFailures=${SYMBOL_DATA_FAILURES_BEFORE_COOLDOWN}`);
        logger_1.default.info('');
        // Wait for initial market data
        logger_1.default.info('[Main] Waiting for market data...');
        await sleep(10000);
        // Main trading loop with enhanced error handling
        let cycleCount = 0;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 5;
        while (true) {
            cycleCount++;
            logger_1.default.info(`\n╔══════════════════════════════════════════════════════════╗`);
            logger_1.default.info(`║  CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
            logger_1.default.info(`╚══════════════════════════════════════════════════════════╝`);
            // Check system health before trading
            const healthSummary = await circuit_breaker_1.default.getHealthSummary();
            if (healthSummary.overall === 'CRITICAL') {
                logger_1.default.error('[Main] System health is CRITICAL, skipping trading cycle');
                logger_1.default.error('[Main] Open circuit breakers:');
                for (const breaker of healthSummary.breakers.filter(b => b.isOpen)) {
                    logger_1.default.error(`  - ${breaker.name}: ${breaker.errorCount} errors`);
                }
                await sleep(CYCLE_INTERVAL_MS);
                continue;
            }
            const gateResult = await filterSymbolsWithSufficientData(SYMBOLS, {
                updateFailures: true,
                context: 'cycle',
            });
            if (gateResult.cooledSymbols.length > 0) {
                pruneSymbolsFromUniverse(gateResult.cooledSymbols, 'data cooldown');
            }
            const tradableSymbols = gateResult.readySymbols;
            if (tradableSymbols.length === 0) {
                logger_1.default.warn('[Main] No symbols passed market-data gate this cycle, skipping');
                await sleep(CYCLE_INTERVAL_MS);
                continue;
            }
            logger_1.default.info(`[Main] Market data gate passed ${tradableSymbols.length}/${SYMBOLS.length} symbols`);
            for (const symbol of tradableSymbols) {
                try {
                    logger_1.default.info(`\n[Main] Processing ${symbol} ${TIMEFRAME}...`);
                    const result = await (0, langgraph_1.runTradingCycle)(symbol, TIMEFRAME);
                    // Reset consecutive failures on success
                    if (result.errors.length === 0) {
                        consecutiveFailures = 0;
                    }
                    // Update dashboard with cycle result
                    const tradeExecuted = result.executionResult?.status === 'FILLED';
                    const isExit = result.executionResult?.entryExit === 'EXIT';
                    const tradePnL = result.executionResult?.pnl ?? 0;
                    const cycleSuccess = result.errors.length === 0 &&
                        (!tradeExecuted || !isExit || tradePnL > 0);
                    dashboard_server_1.default.completeCycle(result.cycleId, cycleSuccess, result);
                    // Log summary
                    logger_1.default.info(`[Main] ${symbol} cycle complete:`);
                    logger_1.default.info(`  - Step: ${result.currentStep}`);
                    logger_1.default.info(`  - Regime: ${result.regime || 'unknown'}`);
                    logger_1.default.info(`  - Strategies generated: ${result.strategyIdeas.length}`);
                    logger_1.default.info(`  - Backtests run: ${result.backtestResults.length}`);
                    logger_1.default.info(`  - Selected: ${result.selectedStrategy?.name || 'none'}`);
                    logger_1.default.info(`  - Signal: ${result.signal?.action || 'none'}`);
                    logger_1.default.info(`  - Executed: ${result.executionResult ? 'yes' : 'no'}`);
                    logger_1.default.info(`  - Similar patterns: ${result.similarPatterns?.length || 0}`);
                    logger_1.default.info(`  - Pattern bias: ${result.patternBias || 'none'}`);
                    if (result.errors.length > 0) {
                        consecutiveFailures++;
                        logger_1.default.warn(`  - Errors: ${result.errors.length}`);
                        for (const err of result.errors) {
                            logger_1.default.warn(`    → ${err}`);
                        }
                    }
                }
                catch (error) {
                    consecutiveFailures++;
                    logger_1.default.error(`[Main] ${symbol} cycle failed:`, error);
                    // Open circuit breaker if too many consecutive failures
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        logger_1.default.error(`[Main] Too many consecutive failures (${consecutiveFailures}), opening circuit breaker`);
                        circuit_breaker_1.default.openBreaker('execution');
                    }
                }
            }
            // Wait before next cycle
            logger_1.default.info(`\n[Main] Waiting ${CYCLE_INTERVAL_MS / 1000}s before next cycle...`);
            await sleep(CYCLE_INTERVAL_MS);
        }
    }
    catch (error) {
        logger_1.default.error('[Main] Fatal error:', error);
        process.exit(1);
    }
}
/**
 * Graceful shutdown handler with enhanced cleanup
 */
function setupShutdown() {
    const shutdown = async (signal) => {
        logger_1.default.info(`\n[Main] Received ${signal}, shutting down...`);
        try {
            // Stop position recovery monitoring
            try {
                position_recovery_1.default.stopMonitoring();
                logger_1.default.info('[Main] Position recovery monitoring stopped');
            }
            catch (error) {
                logger_1.default.error('[Main] Error stopping position recovery:', error);
            }
            // Stop circuit breaker health checks
            try {
                circuit_breaker_1.default.stopHealthChecks();
                logger_1.default.info('[Main] Circuit breaker health checks stopped');
            }
            catch (error) {
                logger_1.default.error('[Main] Error stopping circuit breaker:', error);
            }
            // Stop market ingester
            try {
                await market_ingester_1.default.stop();
                logger_1.default.info('[Main] Market ingester stopped');
            }
            catch (error) {
                logger_1.default.error('[Main] Error stopping market ingester:', error);
            }
            // Stop child processes
            try {
                stopChildProcesses();
            }
            catch (error) {
                logger_1.default.error('[Main] Error stopping child processes:', error);
            }
            // Stop research engine
            try {
                research_engine_1.default.stop();
                logger_1.default.info('[Main] Research engine stopped');
            }
            catch (error) {
                logger_1.default.error('[Main] Error stopping research engine:', error);
            }
            // Emergency close all positions if needed
            try {
                const healthSummary = await circuit_breaker_1.default.getHealthSummary();
                if (healthSummary.overall === 'CRITICAL') {
                    logger_1.default.warn('[Main] Critical state at shutdown, consider emergency position closure');
                }
            }
            catch (error) {
                logger_1.default.error('[Main] Error checking health at shutdown:', error);
            }
            logger_1.default.info('[Main] Shutdown complete');
            process.exit(0);
        }
        catch (error) {
            logger_1.default.error('[Main] Error during shutdown:', error);
            process.exit(1);
        }
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
        logger_1.default.error('[Main] Uncaught Exception:', error);
        // Attempt emergency closure on critical errors
        position_recovery_1.default.emergencyCloseAll().catch(e => logger_1.default.error('[Main] Emergency close failed:', e));
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger_1.default.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Start
setupShutdown();
main();
//# sourceMappingURL=main.js.map