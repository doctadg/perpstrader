/**
 * Twitter/X Narrative Source
 * Uses cookie-based auth (Bearer + ct0 + auth_token) with GraphQL endpoints
 * Mirrors the auth pattern from /home/d/ingest/src/connectors/social/twitter.ts
 */
import type { NarrativeSource, SourceResult } from '../types.js';
export interface TwitterSourceConfig {
    authToken: string;
    ct0: string;
    trackedAccounts: string[];
    searchKeywords: string[];
}
export declare class TwitterSource implements NarrativeSource {
    readonly name: "twitter";
    private client;
    private config;
    constructor(config: TwitterSourceConfig);
    fetch(): Promise<SourceResult>;
    private searchTweets;
    private fetchUserTweets;
    private resolveUserId;
    private extractTweets;
    private parseTweetEntry;
    private toNarrative;
}
//# sourceMappingURL=twitter.d.ts.map