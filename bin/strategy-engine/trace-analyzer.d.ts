/**
 * Analysis insight from LLM
 */
interface AnalysisInsight {
    id: string;
    type: 'TRACE_ANALYSIS';
    title: string;
    description: string;
    confidence: number;
    actionable: boolean;
    timestamp: string;
    data: {
        batchId: string;
        tracesAnalyzed: number;
        recommendations: string[];
        parameters: Record<string, any>;
        patterns: string[];
        summary?: Record<string, any>;
    };
}
/**
 * Run daily trace analysis
 */
export declare function runDailyTraceAnalysis(): Promise<AnalysisInsight[]>;
declare const _default: {
    runDailyTraceAnalysis: typeof runDailyTraceAnalysis;
};
export default _default;
//# sourceMappingURL=trace-analyzer.d.ts.map