// Main Entry Point - LangGraph Trading Agent
// Runs the autonomous trading system with enhanced resilience

// Polyfill must be imported before anything else
import './polyfills';
import 'dotenv/config';

import { runTradingCycle } from './langgraph';
import marketIngester from './market-ingester/market-ingester';
import traceStore from './data/trace-store';
import dashboardServer from './dashboard/dashboard-server';
import { runDailyTraceAnalysis } from './strategy-engine/trace-analyzer';
import circuitBreaker from './shared/circuit-breaker';
import positionRecovery from './execution-engine/position-recovery';
import { getTopVolumeSymbols, getExtremeFundingSymbols } from './shared/dynamic-symbols';
import cron from 'node-cron';
import logger from './shared/logger';

// Configuration
let SYMBOLS: string[] = ['BTC', 'ETH', 'SOL']; // Default, will be updated dynamically
const TIMEFRAME = '1m';
const CYCLE_INTERVAL_MS = 60 * 1000;

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
            positionRecovery.startMonitoring(60000); // 60 second intervals
            logger.info('[Main] Position recovery monitoring started');
        } catch (error) {
            logger.warn('[Main] Position recovery monitoring failed to start:', error);
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
            const allSymbols = [...new Set([...topSymbols, ...extremeSymbols])];
            
            if (allSymbols.length > 0) {
                SYMBOLS = allSymbols;
                logger.info(`[Main] Loaded ${SYMBOLS.length} dynamic symbols: ${SYMBOLS.slice(0, 10).join(', ')}${SYMBOLS.length > 10 ? '...' : ''}`);
            } else {
                logger.warn('[Main] Failed to load dynamic symbols, using defaults');
            }
        } catch (error) {
            logger.error('[Main] Error loading dynamic symbols:', error);
            logger.warn('[Main] Using default symbols');
        }

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

            for (const symbol of SYMBOLS) {
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
