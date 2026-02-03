/**
 * Performance Benchmark Suite
 * Compares original vs optimized components
 */
interface BenchmarkResult {
    component: string;
    operation: string;
    originalTime: number;
    optimizedTime: number;
    improvement: string;
    speedup: number;
}
declare class PerformanceBenchmark {
    private results;
    /**
     * Run all benchmarks
     */
    runAll(): Promise<BenchmarkResult[]>;
    /**
     * Benchmark Trace Store operations
     */
    private benchmarkTraceStore;
    /**
     * Benchmark Risk Calculations
     */
    private benchmarkRiskCalculations;
    /**
     * Benchmark API Batching
     */
    private benchmarkAPIBatching;
    /**
     * Benchmark Position Analysis
     */
    private benchmarkPositionAnalysis;
    /**
     * Benchmark Circuit Breaker
     */
    private benchmarkCircuitBreaker;
    /**
     * Generate test traces
     */
    private generateTestTraces;
    /**
     * Simulate an API call
     */
    private simulateAPICall;
    /**
     * Measure async operation
     */
    private measureAsync;
    /**
     * Add benchmark result
     */
    private addResult;
    /**
     * Print summary
     */
    private printSummary;
}
export default PerformanceBenchmark;
//# sourceMappingURL=performance-benchmark.d.ts.map