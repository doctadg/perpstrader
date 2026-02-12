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
const dashboard_server_1 = __importDefault(require("./dashboard/dashboard-server"));
const trace_analyzer_1 = require("./strategy-engine/trace-analyzer");
const circuit_breaker_1 = __importDefault(require("./shared/circuit-breaker"));
const position_recovery_1 = __importDefault(require("./execution-engine/position-recovery"));
const dynamic_symbols_1 = require("./shared/dynamic-symbols");
const node_cron_1 = __importDefault(require("node-cron"));
const logger_1 = __importDefault(require("./shared/logger"));
// Configuration
let SYMBOLS = ['BTC', 'ETH', 'SOL']; // Default, will be updated dynamically
const TIMEFRAME = '1m';
const CYCLE_INTERVAL_MS = 60 * 1000;
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
            position_recovery_1.default.startMonitoring(60000); // 60 second intervals
            logger_1.default.info('[Main] Position recovery monitoring started');
        }
        catch (error) {
            logger_1.default.warn('[Main] Position recovery monitoring failed to start:', error);
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
            const allSymbols = [...new Set([...topSymbols, ...extremeSymbols])];
            if (allSymbols.length > 0) {
                SYMBOLS = allSymbols;
                logger_1.default.info(`[Main] Loaded ${SYMBOLS.length} dynamic symbols: ${SYMBOLS.slice(0, 10).join(', ')}${SYMBOLS.length > 10 ? '...' : ''}`);
            }
            else {
                logger_1.default.warn('[Main] Failed to load dynamic symbols, using defaults');
            }
        }
        catch (error) {
            logger_1.default.error('[Main] Error loading dynamic symbols:', error);
            logger_1.default.warn('[Main] Using default symbols');
        }
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
            for (const symbol of SYMBOLS) {
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