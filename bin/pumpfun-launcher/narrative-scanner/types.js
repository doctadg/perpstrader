"use strict";
/**
 * Narrative Scanner Types
 * Detects trending crypto narratives from social + news sources for pump.fun launcher
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
/** Default configuration values */
exports.DEFAULT_CONFIG = {
    twitterTrackedAccounts: [],
    twitterSearchKeywords: ['memecoin', 'pump.fun', 'solana', 'memecoin season', 'degen'],
    redditSubreddits: ['cryptocurrency', 'solana', 'memecoin'],
    newsRssUrls: [
        'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'https://cointelegraph.com/rss',
        'https://decrypt.co/feed',
    ],
    pollIntervalMs: 60_000,
    maxAgeMs: 3_600_000,
    minScore: 30,
};
//# sourceMappingURL=types.js.map