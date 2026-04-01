/**
 * Reddit Narrative Source
 * Fetches hot posts from crypto subreddits via .json API (no auth required)
 */
import type { NarrativeSource, SourceResult } from '../types.js';
export interface RedditSourceConfig {
    subreddits: string[];
}
export declare class RedditSource implements NarrativeSource {
    readonly name: "reddit";
    private config;
    constructor(config: RedditSourceConfig);
    fetch(): Promise<SourceResult>;
    private fetchSubreddit;
    private toNarrative;
    private extractKeywords;
}
//# sourceMappingURL=reddit.d.ts.map