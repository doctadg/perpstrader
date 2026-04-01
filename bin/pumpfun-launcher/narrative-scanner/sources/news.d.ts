/**
 * News RSS Narrative Source
 * Fetches articles from CoinDesk, CoinTelegraph, Decrypt RSS feeds
 */
import type { NarrativeSource, SourceResult } from '../types.js';
export interface NewsSourceConfig {
    rssUrls: string[];
}
export declare class NewsSource implements NarrativeSource {
    readonly name: "news";
    private config;
    constructor(config: NewsSourceConfig);
    fetch(): Promise<SourceResult>;
    private fetchFeed;
    /** Minimal RSS XML parser — no external dep needed */
    private parseRssXml;
    private extractTag;
    private extractAttr;
    private decodeEntities;
    private toNarrative;
    private extractKeywords;
}
//# sourceMappingURL=news.d.ts.map