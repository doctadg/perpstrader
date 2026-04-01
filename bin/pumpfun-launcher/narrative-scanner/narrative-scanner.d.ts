/**
 * Narrative Scanner — aggregates Twitter, Reddit, News sources
 * Scores narratives by recency, virality, relevance to crypto/memecoins
 * Returns sorted ScoredNarrative[] for pump.fun launcher decisions
 */
import { type ScoredNarrative, type ScannerConfig } from './types.js';
export declare class NarrativeScanner {
    private config;
    private sources;
    private pollTimer;
    private lastResults;
    private running;
    constructor(config?: Partial<ScannerConfig>);
    /** Read env vars, override config values */
    private loadEnvOverrides;
    /** Instantiate enabled sources */
    private initSources;
    scan(): Promise<ScoredNarrative[]>;
    start(): void;
    stop(): void;
    getLastResults(): ScoredNarrative[];
    isRunning(): boolean;
    private groupNarratives;
    /** Simple text overlap + keyword similarity */
    private isSimilar;
    private scoreNarrative;
    /** Recency: 100 if < 5min, decays to 0 over maxAgeMs */
    private scoreRecency;
    /** Virality: based on engagement metrics, capped at 100 */
    private scoreVirality;
    /** Relevance: keyword match against crypto/memecoin terms */
    private scoreRelevance;
}
//# sourceMappingURL=narrative-scanner.d.ts.map