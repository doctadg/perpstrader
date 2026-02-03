/**
 * Performance Benchmark Suite
 * Compares original vs optimized components
 */

import Database from 'better-sqlite3';
import { performance } from 'perf_hooks';

// Original imports
import traceStore from '../data/trace-store';

// Optimized imports  
import traceStoreOptimized from '../data/trace-store-optimized';
import { performanceMonitor } from '../shared/performance-monitor';
import logger from '../shared/logger';

interface BenchmarkResult {
    component: string;
    operation: string;
    originalTime: number;
    optimizedTime: number;
    improvement: string;
    speedup: number;
}

class PerformanceBenchmark {
    private results: BenchmarkResult[] = [];

    /**
     * Run all benchmarks
     */
    async runAll(): Promise<BenchmarkResult[]> {
        logger.info('═══════════════════════════════════════════════════════════');
        logger.info('  PERFORMANCE BENCHMARK - ORIGINAL VS OPTIMIZED');
        logger.info('═══════════════════════════════════════════════════════════');

        await this.benchmarkTraceStore();
        await this.benchmarkRiskCalculations();
        await this.benchmarkAPIBatching();
        await this.benchmarkPositionAnalysis();
        await this.benchmarkCircuitBreaker();

        this.printSummary();
        return this.results;
    }

    /**
     * Benchmark Trace Store operations
     */
    private async benchmarkTraceStore(): Promise<void> {
        logger.info('\n--- Trace Store Benchmark ---');

        // Generate test traces
        const testTraces = this.generateTestTraces(100);

        // Benchmark batch inserts
        const originalBatchTime = await this.measureAsync('Original Batch Insert', async () => {
            for (const trace of testTraces) {
                traceStore.storeTrace(trace as any);
            }
        });

        const optimizedBatchTime = await this.measureAsync('Optimized Batch Insert', async () => {
            for (const trace of testTraces) {
                traceStoreOptimized.storeTrace(trace as any);
            }
            traceStoreOptimized.shutdown(); // Force flush
        });

        this.addResult('TraceStore', 'Batch Insert (100 traces)', originalBatchTime, optimizedBatchTime);

        // Benchmark reads
        const originalReadTime = await this.measureAsync('Original Read', async () => {
            for (let i = 0; i < 100; i++) {
                traceStore.getRecentTraces(50);
            }
        });

        const optimizedReadTime = await this.measureAsync('Optimized Read', async () => {
            for (let i = 0; i < 100; i++) {
                traceStoreOptimized.getRecentTraces(50);
            }
        });

        this.addResult('TraceStore', 'Read (100 queries)', originalReadTime, optimizedReadTime);
    }

    /**
     * Benchmark Risk Calculations
     */
    private async benchmarkRiskCalculations(): Promise<void> {
        logger.info('\n--- Risk Calculation Benchmark ---');

        // Mock data
        const portfolio = {
            totalValue: 10000,
            availableBalance: 8000,
            positions: [
                { symbol: 'BTC', size: 0.1, entryPrice: 45000, markPrice: 46000, leverage: 40, unrealizedPnL: 100 },
                { symbol: 'ETH', size: 1, entryPrice: 3000, markPrice: 3100, leverage: 40, unrealizedPnL: 100 }
            ]
        };

        const signal = {
            symbol: 'SOL',
            action: 'BUY',
            price: 100,
            confidence: 0.75,
            size: 10
        };

        // Import risk managers
        const { default: riskManager } = await import('../risk-manager/risk-manager');
        const { default: riskManagerOptimized } = await import('../risk-manager/risk-manager-optimized');

        // Benchmark single evaluation
        const originalTime = await this.measureAsync('Original Risk Eval', async () => {
            for (let i = 0; i < 1000; i++) {
                await riskManager.evaluateSignal(signal as any, portfolio as any);
            }
        });

        const optimizedTime = await this.measureAsync('Optimized Risk Eval', async () => {
            for (let i = 0; i < 1000; i++) {
                await riskManagerOptimized.evaluateSignal(signal as any, portfolio as any);
            }
        });

        this.addResult('RiskManager', 'Signal Evaluation (1000x)', originalTime, optimizedTime);

        // Benchmark portfolio risk calculation
        const originalPortfolioTime = await this.measureAsync('Original Portfolio Risk', async () => {
            for (let i = 0; i < 1000; i++) {
                riskManager.calculatePortfolioRisk(portfolio as any);
            }
        });

        const optimizedPortfolioTime = await this.measureAsync('Optimized Portfolio Risk', async () => {
            for (let i = 0; i < 1000; i++) {
                riskManagerOptimized.calculatePortfolioRisk(portfolio as any);
            }
        });

        this.addResult('RiskManager', 'Portfolio Risk (1000x)', originalPortfolioTime, optimizedPortfolioTime);
    }

    /**
     * Benchmark API Batching
     */
    private async benchmarkAPIBatching(): Promise<void> {
        logger.info('\n--- API Batching Benchmark ---');

        // These benchmarks simulate API call patterns
        const originalTime = await this.measureAsync('Original Sequential', async () => {
            // Simulate 10 sequential API calls
            for (let i = 0; i < 10; i++) {
                await this.simulateAPICall(50);
            }
        });

        const optimizedTime = await this.measureAsync('Optimized Parallel', async () => {
            // Simulate 10 parallel API calls
            await Promise.all(Array(10).fill(null).map(() => this.simulateAPICall(50)));
        });

        this.addResult('API Client', '10 API Calls', originalTime, optimizedTime);
    }

    /**
     * Benchmark Position Analysis
     */
    private async benchmarkPositionAnalysis(): Promise<void> {
        logger.info('\n--- Position Analysis Benchmark ---');

        // Import services
        const { default: positionRecovery } = await import('../execution-engine/position-recovery');
        const { default: positionRecoveryOptimized } = await import('../execution-engine/position-recovery-optimized');

        const mockPortfolio = {
            totalValue: 10000,
            availableBalance: 8000,
            positions: Array(10).fill(null).map((_, i) => ({
                symbol: `ASSET${i}`,
                side: i % 2 === 0 ? 'LONG' : 'SHORT',
                size: 1 + i * 0.1,
                entryPrice: 100 + i * 10,
                markPrice: 105 + i * 10,
                leverage: 40,
                unrealizedPnL: (i % 3 === 0 ? -50 : 50)
            }))
        };

        const originalTime = await this.measureAsync('Original Position Analysis', async () => {
            for (let i = 0; i < 100; i++) {
                await positionRecovery.analyzePositions(mockPortfolio as any);
            }
        });

        const optimizedTime = await this.measureAsync('Optimized Position Analysis', async () => {
            for (let i = 0; i < 100; i++) {
                await positionRecoveryOptimized.analyzePositions(mockPortfolio as any);
            }
        });

        this.addResult('PositionRecovery', 'Analyze 10 Positions (100x)', originalTime, optimizedTime);
    }

    /**
     * Benchmark Circuit Breaker
     */
    private async benchmarkCircuitBreaker(): Promise<void> {
        logger.info('\n--- Circuit Breaker Benchmark ---');

        const { default: circuitBreaker } = await import('../shared/circuit-breaker');
        const { default: circuitBreakerOptimized } = await import('../shared/circuit-breaker-optimized');

        const originalTime = await this.measureAsync('Original Health Check', async () => {
            for (let i = 0; i < 50; i++) {
                await circuitBreaker.runAllHealthChecks();
            }
        });

        const optimizedTime = await this.measureAsync('Optimized Health Check', async () => {
            for (let i = 0; i < 50; i++) {
                await circuitBreakerOptimized.runAllHealthChecks();
            }
        });

        this.addResult('CircuitBreaker', 'Health Check (50x)', originalTime, optimizedTime);
    }

    /**
     * Generate test traces
     */
    private generateTestTraces(count: number): any[] {
        return Array(count).fill(null).map((_, i) => ({
            cycleId: `test-${i}`,
            startTime: new Date(),
            endTime: new Date(),
            symbol: ['BTC', 'ETH', 'SOL'][i % 3],
            timeframe: '1m',
            success: i % 2 === 0,
            tradeExecuted: i % 3 === 0,
            regime: 'LOW_VOLATILITY',
            indicators: { rsi: 50, ema: 100 },
            candles: [],
            similarPatternsCount: 5,
            strategyIdeas: [{ name: 'Test Strategy' }],
            backtestResults: [],
            selectedStrategy: { name: 'Selected' },
            signal: { direction: 'LONG', price: 100 },
            riskAssessment: { approved: true, riskScore: 0.3 },
            executionResult: null,
            thoughts: ['Test thought'],
            errors: []
        }));
    }

    /**
     * Simulate an API call
     */
    private simulateAPICall(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Measure async operation
     */
    private async measureAsync(name: string, fn: () => Promise<void>): Promise<number> {
        const start = performance.now();
        await fn();
        const duration = performance.now() - start;
        logger.info(`  ${name}: ${duration.toFixed(2)}ms`);
        return duration;
    }

    /**
     * Add benchmark result
     */
    private addResult(
        component: string,
        operation: string,
        originalTime: number,
        optimizedTime: number
    ): void {
        const improvement = originalTime - optimizedTime;
        const speedup = originalTime / optimizedTime;
        const improvementPct = ((improvement / originalTime) * 100).toFixed(1);

        this.results.push({
            component,
            operation,
            originalTime,
            optimizedTime,
            improvement: `${improvementPct}%`,
            speedup
        });
    }

    /**
     * Print summary
     */
    private printSummary(): void {
        logger.info('\n═══════════════════════════════════════════════════════════');
        logger.info('  BENCHMARK RESULTS SUMMARY');
        logger.info('═══════════════════════════════════════════════════════════');
        logger.info(`${'Component'.padEnd(20)} ${'Operation'.padEnd(30)} ${'Original'.padEnd(12)} ${'Optimized'.padEnd(12)} ${'Speedup'.padEnd(10)}`);
        logger.info('─'.repeat(100));

        let totalSpeedup = 0;

        for (const result of this.results) {
            logger.info(
                `${result.component.padEnd(20)} ` +
                `${result.operation.padEnd(30)} ` +
                `${result.originalTime.toFixed(2).padEnd(12)} ` +
                `${result.optimizedTime.toFixed(2).padEnd(12)} ` +
                `${result.speedup.toFixed(2)}x`
            );
            totalSpeedup += result.speedup;
        }

        const avgSpeedup = totalSpeedup / this.results.length;
        logger.info('─'.repeat(100));
        logger.info(`Average Speedup: ${avgSpeedup.toFixed(2)}x`);
        logger.info('═══════════════════════════════════════════════════════════');
    }
}

// Run benchmarks if called directly
if (require.main === module) {
    const benchmark = new PerformanceBenchmark();
    benchmark.runAll().then(results => {
        process.exit(0);
    }).catch(error => {
        logger.error('Benchmark failed:', error);
        process.exit(1);
    });
}

export default PerformanceBenchmark;
