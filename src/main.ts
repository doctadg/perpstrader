// Main Entry Point - LangGraph Trading Agent
// Runs the autonomous trading system with enhanced resilience

// Polyfill must be imported before anything else
import './polyfills';
import 'dotenv/config';

import { runTradingCycle } from './langgraph';
import marketIngester from './market-ingester/market-ingester';
import traceStore from './data/trace-store';
import dataManager from './data-manager/data-manager';
import dashboardServer from './dashboard/dashboard-server';
import { runDailyTraceAnalysis } from './strategy-engine/trace-analyzer';
import circuitBreaker from './shared/circuit-breaker';
import positionRecovery from './execution-engine/position-recovery';
import { getTopVolumeSymbols, getExtremeFundingSymbols } from './shared/dynamic-symbols';
import researchEngine from './research-engine';
import cron from 'node-cron';
import axios from 'axios';
import logger from './shared/logger';
import { fork, ChildProcess } from 'child_process';
import path from 'path';

// Configuration
let SYMBOLS: string[] = ['BTC', 'ETH', 'SOL']; // Default, will be updated dynamically
const TIMEFRAME = '1m';
const CYCLE_INTERVAL_MS = 60 * 1000;
const MIN_ANALYSIS_CANDLES = Math.max(1, Number.parseInt(process.env.TRADING_MIN_ANALYSIS_CANDLES || '50', 10) || 50);
const MARKET_DATA_MAX_AGE_MS = Math.max(
    parseTimeframeMs(TIMEFRAME) * 5,
    Number.parseInt(process.env.TRADING_MARKET_DATA_MAX_AGE_MS || '300000', 10) || 300000
);
const MARKET_DATA_CHECK_TTL_MS = Math.max(
    CYCLE_INTERVAL_MS / 2,
    Number.parseInt(process.env.TRADING_MARKET_DATA_CHECK_TTL_MS || '120000', 10) || 120000
);
const MAX_ACTIVE_SYMBOLS = Math.max(5, Number.parseInt(process.env.TRADING_MAX_ACTIVE_SYMBOLS || '30', 10) || 30);
const API_READINESS_CHECK_LIMIT = Math.max(0, Number.parseInt(process.env.TRADING_API_READINESS_CHECK_LIMIT || '25', 10) || 25);
const SYMBOL_DATA_FAILURES_BEFORE_COOLDOWN = Math.max(1, Number.parseInt(process.env.TRADING_SYMBOL_DATA_FAILURES_BEFORE_COOLDOWN || '3', 10) || 3);
const SYMBOL_DATA_COOLDOWN_MS = Math.max(
    CYCLE_INTERVAL_MS,
    Number.parseInt(process.env.TRADING_SYMBOL_DATA_COOLDOWN_MS || String(6 * 60 * 60 * 1000), 10) || (6 * 60 * 60 * 1000)
);
const ENABLE_STARTUP_SYMBOL_PRUNE = process.env.TRADING_STARTUP_SYMBOL_PRUNE !== 'false';
const CORE_FALLBACK_SYMBOLS = ['BTC', 'ETH', 'SOL'];
const HYPERLIQUID_INFO_URL = `${process.env.HYPERLIQUID_BASE_URL || 'https://api.hyperliquid.xyz'}/info`;
const EXCLUDED_SYMBOLS = new Set(
    (process.env.TRADING_EXCLUDED_SYMBOLS || '')
        .split(',')
        .map(symbol => symbol.trim().toUpperCase())
        .filter(Boolean)
);

// Child process management for news-agent and prediction-agent
const CHILD_PROCESSES: Map<string, ChildProcess> = new Map();
const CHILD_RESTART_DELAYS: Map<string, number> = new Map();
const MAX_RESTART_DELAY_MS = 60000; // Max 60 seconds between restarts
const INITIAL_RESTART_DELAY_MS = 5000; // Start with 5 seconds

interface ChildProcessConfig {
    name: string;
    scriptPath: string;
    restartDelayMs: number;
}

const CHILD_PROCESS_CONFIGS: ChildProcessConfig[] = [
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

function spawnChildProcess(config: ChildProcessConfig): ChildProcess {
    const { name, scriptPath } = config;
    
    logger.info(`[ChildProcess] Starting ${name} from ${scriptPath}...`);
    
    const child = fork(scriptPath, [], {
        silent: false,
        execArgv: [],
    });
    
    CHILD_PROCESSES.set(name, child);
    
    child.on('spawn', () => {
        logger.info(`[ChildProcess] ${name} started (PID: ${child.pid})`);
        // Reset restart delay on successful start
        CHILD_RESTART_DELAYS.set(name, INITIAL_RESTART_DELAY_MS);
    });
    
    child.on('error', (error) => {
        logger.error(`[ChildProcess] ${name} error:`, error);
    });
    
    child.on('exit', (code, signal) => {
        logger.warn(`[ChildProcess] ${name} exited with code ${code}, signal ${signal}`);
        CHILD_PROCESSES.delete(name);
        
        // Schedule restart with exponential backoff
        const currentDelay = CHILD_RESTART_DELAYS.get(name) || INITIAL_RESTART_DELAY_MS;
        logger.info(`[ChildProcess] Restarting ${name} in ${currentDelay}ms...`);
        
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
        logger.info(`[ChildProcess] ${name} message:`, message);
    });
    
    return child;
}

function startChildProcesses(): void {
    logger.info('[ChildProcess] Starting child processes...');
    for (const config of CHILD_PROCESS_CONFIGS) {
        if (!CHILD_PROCESSES.has(config.name)) {
            spawnChildProcess(config);
        }
    }
}

function stopChildProcesses(): void {
    logger.info('[ChildProcess] Stopping all child processes...');
    for (const [name, child] of CHILD_PROCESSES.entries()) {
        logger.info(`[ChildProcess] Killing ${name} (PID: ${child.pid})...`);
        child.kill('SIGTERM');
        
        // Force kill after 5 seconds if still running
        setTimeout(() => {
            if (!child.killed) {
                logger.warn(`[ChildProcess] ${name} did not exit gracefully, forcing SIGKILL...`);
                child.kill('SIGKILL');
            }
        }, 5000);
    }
    CHILD_PROCESSES.clear();
}

type SymbolDataReadiness = {
    ready: boolean;
    candles: number;
    latestCandleTs: number;
    checkedAt: number;
    reason: 'ready' | 'ready_api' | 'insufficient_candles' | 'stale_data' | 'query_failed' | 'cooldown';
};

const symbolDataReadinessCache = new Map<string, SymbolDataReadiness>();
const symbolDataFailureCounts = new Map<string, number>();
const symbolDataCooldownUntil = new Map<string, number>();

type SymbolFilterResult = {
    readySymbols: string[];
    cooledSymbols: string[];
    skipped: Array<{
        symbol: string;
        reason: SymbolDataReadiness['reason'];
        candles: number;
    }>;
};

type SymbolFilterOptions = {
    updateFailures?: boolean;
    context?: string;
};

function parseTimeframeMs(timeframe: string): number {
    const match = timeframe.trim().match(/^(\d+)([smhd])$/i);
    if (!match) return 60 * 1000;

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (unit === 's') return value * 1000;
    if (unit === 'm') return value * 60 * 1000;
    if (unit === 'h') return value * 60 * 60 * 1000;
    if (unit === 'd') return value * 24 * 60 * 60 * 1000;
    return 60 * 1000;
}

function toHyperliquidInterval(timeframe: string): string {
    const match = timeframe.trim().match(/^(\d+)([smhd])$/i);
    if (!match) return '1m';

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (unit === 's') return '1m';
    if (unit === 'm') return `${value}m`;
    if (unit === 'h') return `${value}h`;
    if (unit === 'd') return `${value}d`;
    return '1m';
}

async function fetchApiCandleReadiness(symbol: string, timeframe: string, minCandles: number): Promise<{ candles: number; latestCandleTs: number }> {
    const now = Date.now();
    const intervalMs = parseTimeframeMs(timeframe);
    const lookbackCandles = Math.max(minCandles * 3, 180);
    const startTime = now - (intervalMs * lookbackCandles);
    const interval = toHyperliquidInterval(timeframe);

    try {
        const response = await axios.post(
            HYPERLIQUID_INFO_URL,
            {
                type: 'candleSnapshot',
                req: {
                    coin: symbol,
                    interval,
                    startTime,
                    endTime: now,
                },
            },
            { timeout: 10000 }
        );

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
    } catch {
        return { candles: 0, latestCandleTs: 0 };
    }
}

async function getSymbolDataReadiness(
    symbol: string,
    options?: { allowApiFallback?: boolean }
): Promise<SymbolDataReadiness> {
    const upper = symbol.toUpperCase();
    const now = Date.now();
    const cached = symbolDataReadinessCache.get(upper);
    if (cached && now - cached.checkedAt < MARKET_DATA_CHECK_TTL_MS) {
        return cached;
    }

    try {
        const candles = await dataManager.getMarketData(upper, undefined, undefined, MIN_ANALYSIS_CANDLES);
        const latestCandleTs = candles[0]?.timestamp?.getTime?.() || 0;
        const localReady = candles.length >= MIN_ANALYSIS_CANDLES
            && latestCandleTs > 0
            && now - latestCandleTs <= MARKET_DATA_MAX_AGE_MS;

        if (localReady) {
            const result: SymbolDataReadiness = {
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
                const result: SymbolDataReadiness = {
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
            const result: SymbolDataReadiness = {
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
            const result: SymbolDataReadiness = {
                ready: false,
                candles: bestCandles,
                latestCandleTs: bestLatestTs,
                checkedAt: now,
                reason: 'stale_data',
            };
            symbolDataReadinessCache.set(upper, result);
            return result;
        }

        const result: SymbolDataReadiness = {
            ready: false,
            candles: bestCandles,
            latestCandleTs: bestLatestTs,
            checkedAt: now,
            reason: 'stale_data',
        };
        symbolDataReadinessCache.set(upper, result);
        return result;
    } catch (error) {
        logger.warn(`[Main] Data readiness check failed for ${upper}:`, error);
        const result: SymbolDataReadiness = {
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

function ensureCoreFallbackSymbols(): void {
    const now = Date.now();
    const existingUpper = new Set(SYMBOLS.map(symbol => symbol.toUpperCase()));
    for (const coreSymbol of CORE_FALLBACK_SYMBOLS) {
        const upper = coreSymbol.toUpperCase();
        if (existingUpper.has(upper)) continue;

        const cooldownUntil = symbolDataCooldownUntil.get(upper) || 0;
        if (cooldownUntil > now) continue;

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

function pruneSymbolsFromUniverse(symbolsToPrune: string[], context: string): void {
    if (symbolsToPrune.length === 0) return;

    const pruneSet = new Set(symbolsToPrune.map(symbol => symbol.toUpperCase()));
    const before = SYMBOLS.length;
    SYMBOLS = SYMBOLS.filter(symbol => !pruneSet.has(symbol.toUpperCase()));
    const removed = before - SYMBOLS.length;

    if (removed > 0) {
        const preview = symbolsToPrune.slice(0, 10).join(', ');
        logger.warn(`[Main] Pruned ${removed} symbols from active universe (${context}): ${preview}${symbolsToPrune.length > 10 ? ', ...' : ''}`);
    }

    ensureCoreFallbackSymbols();
}

async function filterSymbolsWithSufficientData(
    symbols: string[],
    options?: SymbolFilterOptions
): Promise<SymbolFilterResult> {
    if (symbols.length === 0) {
        return { readySymbols: [], cooledSymbols: [], skipped: [] };
    }

    const updateFailures = options?.updateFailures !== false;
    const context = options?.context || 'cycle';

    const originalByUpper = new Map<string, string>();
    for (const symbol of symbols) {
        const upper = symbol.toUpperCase();
        if (!originalByUpper.has(upper)) {
            originalByUpper.set(upper, symbol);
        }
    }

    const now = Date.now();
    const uniqueSymbols = [...originalByUpper.keys()];
    const readinessEntries = await Promise.all(
        uniqueSymbols.map(async (upper, index) => {
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
                        reason: 'cooldown' as const,
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
        })
    );

    const readySymbols: string[] = [];
    const cooledSymbols: string[] = [];
    const skipped: SymbolFilterResult['skipped'] = [];

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
        } else {
            symbolDataFailureCounts.set(entry.upper, failures);
        }
    }

    if (skipped.length > 0) {
        const skippedPreview = skipped
            .slice(0, 8)
            .map(entry => `${entry.symbol}:${entry.reason}:${entry.candles}`)
            .join(', ');
        logger.info(`[Main] ${context} market-data gate skipped ${skipped.length} symbols (${skippedPreview}${skipped.length > 8 ? ', ...' : ''})`);
    }

    if (cooledSymbols.length > 0) {
        logger.warn(`[Main] ${context} market-data cooldown applied to ${cooledSymbols.length} symbols for ${Math.round(SYMBOL_DATA_COOLDOWN_MS / 60000)}m`);
    }

    return { readySymbols, cooledSymbols, skipped };
}

/**
 * Main autonomous trading loop with enhanced resilience
 */
async function main() {
    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('  LangGraph Autonomous Trading Agent - Starting');
    logger.info('  Enhanced with Circuit Breakers & Position Recovery');
    logger.info('═══════════════════════════════════════════════════════════');

    try {
        // Initialize services
        logger.info('[Main] Initializing services...');

        // Start dashboard server
        try {
            await dashboardServer.start();
            logger.info('[Main] Dashboard server started');
        } catch (error) {
            logger.warn('[Main] Dashboard failed to start, continuing without:', error);
        }

        // Start market data ingestion
        try {
            await marketIngester.start();
            logger.info('[Main] Market ingester started');
        } catch (error) {
            logger.warn('[Main] Market ingester failed to start, continuing in offline mode:', error);
        }

        // Initialize trace store for LLM analysis
        try {
            traceStore.initialize();
            const traceStats = traceStore.getStats();
            logger.info(`[Main] Trace store initialized: ${traceStats.total} traces, ${traceStats.unanalyzed} pending analysis`);
        } catch (error) {
            logger.warn('[Main] Trace store initialization failed:', error);
        }

        // Start circuit breaker health checks
        try {
            circuitBreaker.startHealthChecks(30000); // 30 second intervals
            logger.info('[Main] Circuit breaker health checks started');
        } catch (error) {
            logger.warn('[Main] Circuit breaker health checks failed to start:', error);
        }

        // Start position recovery monitoring
        try {
            positionRecovery.startMonitoring(15000); // 15 second intervals for faster stop/recovery exits
            logger.info('[Main] Position recovery monitoring started');
        } catch (error) {
            logger.warn('[Main] Position recovery monitoring failed to start:', error);
        }

        // Start child processes (news-agent and prediction-agent)
        try {
            startChildProcesses();
        } catch (error) {
            logger.warn('[Main] Failed to start child processes:', error);
        }

        // Start research engine for continuous strategy generation
        try {
            await researchEngine.start();
            logger.info('[Main] Research engine started (generates strategies every 15 minutes)');
        } catch (error) {
            logger.warn('[Main] Research engine failed to start:', error);
        }

        // Schedule daily trace analysis at 2 AM
        cron.schedule('0 2 * * *', async () => {
            logger.info('[Main] Running scheduled daily trace analysis...');
            try {
                const insights = await runDailyTraceAnalysis();
                logger.info(`[Main] Trace analysis complete: ${insights.length} insights generated`);
            } catch (error) {
                logger.error('[Main] Daily trace analysis failed:', error);
            }
        });
        logger.info('[Main] Daily trace analysis scheduled for 2:00 AM');

        // Load dynamic trading symbols from Hyperliquid
        logger.info('[Main] Loading dynamic trading symbols from Hyperliquid...');
        try {
            // Get top 50 markets by volume for trading
            const topSymbols = await getTopVolumeSymbols(50);
            // Also get symbols with extreme funding rates
            const { positive, negative } = await getExtremeFundingSymbols(0.0001);
            const extremeSymbols = [...positive.slice(0, 10), ...negative.slice(0, 10)];
            
            // Combine and deduplicate
            const allSymbols = [...new Set([...topSymbols, ...extremeSymbols])]
                .filter(symbol => !EXCLUDED_SYMBOLS.has(symbol.toUpperCase()));
            
            if (allSymbols.length > 0) {
                SYMBOLS = allSymbols.slice(0, MAX_ACTIVE_SYMBOLS);
                logger.info(`[Main] Loaded ${SYMBOLS.length} dynamic symbols (${EXCLUDED_SYMBOLS.size} excluded): ${SYMBOLS.slice(0, 10).join(', ')}${SYMBOLS.length > 10 ? '...' : ''}`);
            } else {
                logger.warn('[Main] Failed to load dynamic symbols, using defaults');
            }
        } catch (error) {
            logger.error('[Main] Error loading dynamic symbols:', error);
            logger.warn('[Main] Using default symbols');
        }

        if (ENABLE_STARTUP_SYMBOL_PRUNE) {
            const beforePruneCount = SYMBOLS.length;
            const startupFilter = await filterSymbolsWithSufficientData(SYMBOLS, {
                updateFailures: false,
                context: 'startup',
            });

            if (startupFilter.readySymbols.length > 0) {
                SYMBOLS = startupFilter.readySymbols.slice(0, MAX_ACTIVE_SYMBOLS);
                logger.info(`[Main] Startup prune kept ${SYMBOLS.length}/${beforePruneCount} symbols with enough data`);
            } else {
                logger.warn('[Main] Startup prune found no symbols with sufficient data, keeping current list');
            }
        }

        ensureCoreFallbackSymbols();

        // Schedule hourly health check logging
        cron.schedule('0 * * * *', async () => {
            try {
                const healthSummary = await circuitBreaker.getHealthSummary();
                logger.info(`[Main] Health check: ${healthSummary.overall}`);
                for (const component of healthSummary.components) {
                    logger.info(`  - ${component.component}: ${component.status} (${component.responseTime}ms)`);
                }

                // Log open circuit breakers
                const openBreakers = healthSummary.breakers.filter(b => b.isOpen);
                if (openBreakers.length > 0) {
                    logger.warn(`[Main] Open circuit breakers: ${openBreakers.map(b => b.name).join(', ')}`);
                }
            } catch (error) {
                logger.error('[Main] Hourly health check failed:', error);
            }
        });

        logger.info(`[Main] Trading symbols: ${SYMBOLS.join(', ')}`);
        logger.info(`[Main] Timeframe: ${TIMEFRAME}`);
        logger.info(`[Main] Cycle interval: ${CYCLE_INTERVAL_MS / 1000}s`);
        logger.info(`[Main] Market data gate: minCandles=${MIN_ANALYSIS_CANDLES}, maxAgeMs=${MARKET_DATA_MAX_AGE_MS}`);
        logger.info(`[Main] Symbol controls: maxActive=${MAX_ACTIVE_SYMBOLS}, apiChecksPerCycle=${API_READINESS_CHECK_LIMIT}, cooldownFailures=${SYMBOL_DATA_FAILURES_BEFORE_COOLDOWN}`);
        logger.info('');

        // Wait for initial market data
        logger.info('[Main] Waiting for market data...');
        await sleep(10000);

        // Main trading loop with enhanced error handling
        let cycleCount = 0;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 5;

        while (true) {
            cycleCount++;
            logger.info(`\n╔══════════════════════════════════════════════════════════╗`);
            logger.info(`║  CYCLE ${cycleCount} - ${new Date().toISOString()}  ║`);
            logger.info(`╚══════════════════════════════════════════════════════════╝`);

            // Check system health before trading
            const healthSummary = await circuitBreaker.getHealthSummary();
            if (healthSummary.overall === 'CRITICAL') {
                logger.error('[Main] System health is CRITICAL, skipping trading cycle');
                logger.error('[Main] Open circuit breakers:');
                for (const breaker of healthSummary.breakers.filter(b => b.isOpen)) {
                    logger.error(`  - ${breaker.name}: ${breaker.errorCount} errors`);
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
                logger.warn('[Main] No symbols passed market-data gate this cycle, skipping');
                await sleep(CYCLE_INTERVAL_MS);
                continue;
            }

            logger.info(`[Main] Market data gate passed ${tradableSymbols.length}/${SYMBOLS.length} symbols`);

            for (const symbol of tradableSymbols) {
                try {
                    logger.info(`\n[Main] Processing ${symbol} ${TIMEFRAME}...`);

                    const result = await runTradingCycle(symbol, TIMEFRAME);

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

                    dashboardServer.completeCycle(
                        result.cycleId,
                        cycleSuccess,
                        result
                    );

                    // Log summary
                    logger.info(`[Main] ${symbol} cycle complete:`);
                    logger.info(`  - Step: ${result.currentStep}`);
                    logger.info(`  - Regime: ${result.regime || 'unknown'}`);
                    logger.info(`  - Strategies generated: ${result.strategyIdeas.length}`);
                    logger.info(`  - Backtests run: ${result.backtestResults.length}`);
                    logger.info(`  - Selected: ${result.selectedStrategy?.name || 'none'}`);
                    logger.info(`  - Signal: ${result.signal?.action || 'none'}`);
                    logger.info(`  - Executed: ${result.executionResult ? 'yes' : 'no'}`);
                    logger.info(`  - Similar patterns: ${result.similarPatterns?.length || 0}`);
                    logger.info(`  - Pattern bias: ${result.patternBias || 'none'}`);

                    if (result.errors.length > 0) {
                        consecutiveFailures++;
                        logger.warn(`  - Errors: ${result.errors.length}`);
                        for (const err of result.errors) {
                            logger.warn(`    → ${err}`);
                        }
                    }

                } catch (error) {
                    consecutiveFailures++;
                    logger.error(`[Main] ${symbol} cycle failed:`, error);

                    // Open circuit breaker if too many consecutive failures
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        logger.error(`[Main] Too many consecutive failures (${consecutiveFailures}), opening circuit breaker`);
                        circuitBreaker.openBreaker('execution');
                    }
                }
            }

            // Wait before next cycle
            logger.info(`\n[Main] Waiting ${CYCLE_INTERVAL_MS / 1000}s before next cycle...`);
            await sleep(CYCLE_INTERVAL_MS);
        }

    } catch (error) {
        logger.error('[Main] Fatal error:', error);
        process.exit(1);
    }
}

/**
 * Graceful shutdown handler with enhanced cleanup
 */
function setupShutdown() {
    const shutdown = async (signal: string) => {
        logger.info(`\n[Main] Received ${signal}, shutting down...`);

        try {
            // Stop position recovery monitoring
            try {
                positionRecovery.stopMonitoring();
                logger.info('[Main] Position recovery monitoring stopped');
            } catch (error) {
                logger.error('[Main] Error stopping position recovery:', error);
            }

            // Stop circuit breaker health checks
            try {
                circuitBreaker.stopHealthChecks();
                logger.info('[Main] Circuit breaker health checks stopped');
            } catch (error) {
                logger.error('[Main] Error stopping circuit breaker:', error);
            }

            // Stop market ingester
            try {
                await marketIngester.stop();
                logger.info('[Main] Market ingester stopped');
            } catch (error) {
                logger.error('[Main] Error stopping market ingester:', error);
            }

            // Stop child processes
            try {
                stopChildProcesses();
            } catch (error) {
                logger.error('[Main] Error stopping child processes:', error);
            }

            // Stop research engine
            try {
                researchEngine.stop();
                logger.info('[Main] Research engine stopped');
            } catch (error) {
                logger.error('[Main] Error stopping research engine:', error);
            }

            // Emergency close all positions if needed
            try {
                const healthSummary = await circuitBreaker.getHealthSummary();
                if (healthSummary.overall === 'CRITICAL') {
                    logger.warn('[Main] Critical state at shutdown, consider emergency position closure');
                }
            } catch (error) {
                logger.error('[Main] Error checking health at shutdown:', error);
            }

            logger.info('[Main] Shutdown complete');
            process.exit(0);
        } catch (error) {
            logger.error('[Main] Error during shutdown:', error);
            process.exit(1);
        }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('uncaughtException', (error) => {
        logger.error('[Main] Uncaught Exception:', error);
        // Attempt emergency closure on critical errors
        positionRecovery.emergencyCloseAll().catch(e =>
            logger.error('[Main] Emergency close failed:', e)
        );
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('[Main] Unhandled Rejection at:', promise, 'reason:', reason);
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Start
setupShutdown();
main();
