/**
 * Narrative Scanner Types
 * Detects trending crypto narratives from social + news sources for pump.fun launcher
 */

/** Source type identifiers */
export type SourceType = 'twitter' | 'reddit' | 'news';

/** A raw narrative extracted from a single source */
export interface Narrative {
  /** Unique ID (source-prefix + content hash) */
  id: string;
  /** Source platform */
  source: SourceType;
  /** Narrative text / headline */
  text: string;
  /** When this item was posted */
  timestamp: Date;
  /** Keywords / hashtags extracted */
  keywords: string[];
  /** Engagement metrics from the source */
  engagement: {
    likes: number;
    shares: number;
    comments: number;
    views: number;
  };
  /** Original URL if available */
  url?: string;
  /** Author handle or name */
  author?: string;
  /** Raw source-specific metadata */
  metadata?: Record<string, unknown>;
}

/** A scored narrative ready for decision-making */
export interface ScoredNarrative extends Narrative {
  /** Overall score 0-100 combining recency, virality, relevance */
  score: number;
  /** Score breakdown */
  scoreBreakdown: {
    recency: number;      // 0-100: how recent (newer = higher)
    virality: number;     // 0-100: engagement relative to baseline
    relevance: number;    // 0-100: crypto/memecoin keyword match
  };
  /** How many distinct sources mentioned this narrative */
  sourceCount: number;
  /** Which sources contributed */
  sources: SourceType[];
}

/** Result from a single source fetch */
export interface SourceResult {
  source: SourceType;
  narratives: Narrative[];
  fetchedAt: Date;
  error?: string;
}

/** Scanner configuration via env vars */
export interface ScannerConfig {
  /** Twitter auth token (env: TWITTER_AUTH_TOKEN) */
  twitterAuthToken?: string;
  /** Twitter CSRF token (env: TWITTER_CT0) */
  twitterCt0?: string;
  /** Twitter accounts to track (env: TWITTER_TRACKED_ACCOUNTS, comma-separated) */
  twitterTrackedAccounts: string[];
  /** Search keywords for Twitter (env: TWITTER_SEARCH_KEYWORDS, comma-separated) */
  twitterSearchKeywords: string[];
  /** Reddit subreddits to scan (env: REDDIT_SUBREDDITS, comma-separated) */
  redditSubreddits: string[];
  /** News RSS feed URLs (env: NEWS_RSS_URLS, comma-separated) */
  newsRssUrls: string[];
  /** How often to poll sources in ms (env: SCANNER_POLL_INTERVAL_MS, default 60000) */
  pollIntervalMs: number;
  /** Max age of narratives in ms — older items are discarded (env: SCANNER_MAX_AGE_MS, default 3600000 = 1h) */
  maxAgeMs: number;
  /** Minimum score threshold to include (env: SCANNER_MIN_SCORE, default 30) */
  minScore: number;
}

/** Default configuration values */
export const DEFAULT_CONFIG: ScannerConfig = {
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

/** Source interface — each source implements this */
export interface NarrativeSource {
  readonly name: SourceType;
  fetch(): Promise<SourceResult>;
}
