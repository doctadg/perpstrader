"use strict";
/**
 * Performance Benchmark Suite
 * Compares original vs optimized components
 */
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
const perf_hooks_1 = require("perf_hooks");
// Original imports
const trace_store_1 = __importDefault(require("../data/trace-store"));
// Optimized imports  
const trace_store_optimized_1 = __importDefault(require("../data/trace-store-optimized"));
const logger_1 = __importDefault(require("../shared/logger"));
class PerformanceBenchmark {
    results = [];
    /**
     * Run all benchmarks
     */
    async runAll() {
        logger_1.default.info('═══════════════════════════════════════════════════════════');
        logger_1.default.info('  PERFORMANCE BENCHMARK - ORIGINAL VS OPTIMIZED');
        logger_1.default.info('═══════════════════════════════════════════════════════════');
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
    async benchmarkTraceStore() {
        logger_1.default.info('\n--- Trace Store Benchmark ---');
        // Generate test traces
        const testTraces = this.generateTestTraces(100);
        // Benchmark batch inserts
        const originalBatchTime = await this.measureAsync('Original Batch Insert', async () => {
            for (const trace of testTraces) {
                trace_store_1.default.storeTrace(trace);
            }
        });
        const optimizedBatchTime = await this.measureAsync('Optimized Batch Insert', async () => {
            for (const trace of testTraces) {
                trace_store_optimized_1.default.storeTrace(trace);
            }
            trace_store_optimized_1.default.shutdown(); // Force flush
        });
        this.addResult('TraceStore', 'Batch Insert (100 traces)', originalBatchTime, optimizedBatchTime);
        // Benchmark reads
        const originalReadTime = await this.measureAsync('Original Read', async () => {
            for (let i = 0; i < 100; i++) {
                trace_store_1.default.getRecentTraces(50);
            }
        });
        const optimizedReadTime = await this.measureAsync('Optimized Read', async () => {
            for (let i = 0; i < 100; i++) {
                trace_store_optimized_1.default.getRecentTraces(50);
            }
        });
        this.addResult('TraceStore', 'Read (100 queries)', originalReadTime, optimizedReadTime);
    }
    /**
     * Benchmark Risk Calculations
     */
    async benchmarkRiskCalculations() {
        logger_1.default.info('\n--- Risk Calculation Benchmark ---');
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
        const { default: riskManager } = await Promise.resolve().then(() => __importStar(require('../risk-manager/risk-manager')));
        const { default: riskManagerOptimized } = await Promise.resolve().then(() => __importStar(require('../risk-manager/risk-manager-optimized')));
        // Benchmark single evaluation
        const originalTime = await this.measureAsync('Original Risk Eval', async () => {
            for (let i = 0; i < 1000; i++) {
                await riskManager.evaluateSignal(signal, portfolio);
            }
        });
        const optimizedTime = await this.measureAsync('Optimized Risk Eval', async () => {
            for (let i = 0; i < 1000; i++) {
                await riskManagerOptimized.evaluateSignal(signal, portfolio);
            }
        });
        this.addResult('RiskManager', 'Signal Evaluation (1000x)', originalTime, optimizedTime);
        // Benchmark portfolio risk calculation
        const originalPortfolioTime = await this.measureAsync('Original Portfolio Risk', async () => {
            for (let i = 0; i < 1000; i++) {
                riskManager.calculatePortfolioRisk(portfolio);
            }
        });
        const optimizedPortfolioTime = await this.measureAsync('Optimized Portfolio Risk', async () => {
            for (let i = 0; i < 1000; i++) {
                riskManagerOptimized.calculatePortfolioRisk(portfolio);
            }
        });
        this.addResult('RiskManager', 'Portfolio Risk (1000x)', originalPortfolioTime, optimizedPortfolioTime);
    }
    /**
     * Benchmark API Batching
     */
    async benchmarkAPIBatching() {
        logger_1.default.info('\n--- API Batching Benchmark ---');
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
    async benchmarkPositionAnalysis() {
        logger_1.default.info('\n--- Position Analysis Benchmark ---');
        // Import services
        const { default: positionRecovery } = await Promise.resolve().then(() => __importStar(require('../execution-engine/position-recovery')));
        const { default: positionRecoveryOptimized } = await Promise.resolve().then(() => __importStar(require('../execution-engine/position-recovery-optimized')));
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
                await positionRecovery.analyzePositions(mockPortfolio);
            }
        });
        const optimizedTime = await this.measureAsync('Optimized Position Analysis', async () => {
            for (let i = 0; i < 100; i++) {
                await positionRecoveryOptimized.analyzePositions(mockPortfolio);
            }
        });
        this.addResult('PositionRecovery', 'Analyze 10 Positions (100x)', originalTime, optimizedTime);
    }
    /**
     * Benchmark Circuit Breaker
     */
    async benchmarkCircuitBreaker() {
        logger_1.default.info('\n--- Circuit Breaker Benchmark ---');
        const { default: circuitBreaker } = await Promise.resolve().then(() => __importStar(require('../shared/circuit-breaker')));
        const { default: circuitBreakerOptimized } = await Promise.resolve().then(() => __importStar(require('../shared/circuit-breaker-optimized')));
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
    generateTestTraces(count) {
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
    simulateAPICall(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Measure async operation
     */
    async measureAsync(name, fn) {
        const start = perf_hooks_1.performance.now();
        await fn();
        const duration = perf_hooks_1.performance.now() - start;
        logger_1.default.info(`  ${name}: ${duration.toFixed(2)}ms`);
        return duration;
    }
    /**
     * Add benchmark result
     */
    addResult(component, operation, originalTime, optimizedTime) {
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
    printSummary() {
        logger_1.default.info('\n═══════════════════════════════════════════════════════════');
        logger_1.default.info('  BENCHMARK RESULTS SUMMARY');
        logger_1.default.info('═══════════════════════════════════════════════════════════');
        logger_1.default.info(`${'Component'.padEnd(20)} ${'Operation'.padEnd(30)} ${'Original'.padEnd(12)} ${'Optimized'.padEnd(12)} ${'Speedup'.padEnd(10)}`);
        logger_1.default.info('─'.repeat(100));
        let totalSpeedup = 0;
        for (const result of this.results) {
            logger_1.default.info(`${result.component.padEnd(20)} ` +
                `${result.operation.padEnd(30)} ` +
                `${result.originalTime.toFixed(2).padEnd(12)} ` +
                `${result.optimizedTime.toFixed(2).padEnd(12)} ` +
                `${result.speedup.toFixed(2)}x`);
            totalSpeedup += result.speedup;
        }
        const avgSpeedup = totalSpeedup / this.results.length;
        logger_1.default.info('─'.repeat(100));
        logger_1.default.info(`Average Speedup: ${avgSpeedup.toFixed(2)}x`);
        logger_1.default.info('═══════════════════════════════════════════════════════════');
    }
}
// Run benchmarks if called directly
if (require.main === module) {
    const benchmark = new PerformanceBenchmark();
    benchmark.runAll().then(results => {
        process.exit(0);
    }).catch(error => {
        logger_1.default.error('Benchmark failed:', error);
        process.exit(1);
    });
}
exports.default = PerformanceBenchmark;
//# sourceMappingURL=performance-benchmark.js.map