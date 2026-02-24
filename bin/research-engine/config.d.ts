import 'dotenv/config';
export interface ResearchPerformanceThresholds {
    minSharpeRatio: number;
    minWinRate: number;
}
export interface ResearchEngineConfig {
    researchIntervalMs: number;
    evolutionIntervalMs: number;
    performanceThresholds: ResearchPerformanceThresholds;
    maxConcurrentBacktests: number;
}
export declare function loadResearchEngineConfig(env?: NodeJS.ProcessEnv): ResearchEngineConfig;
export declare const researchEngineConfig: ResearchEngineConfig;
export default researchEngineConfig;
//# sourceMappingURL=config.d.ts.map