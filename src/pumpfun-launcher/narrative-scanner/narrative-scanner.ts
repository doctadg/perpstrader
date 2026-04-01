/**
 * Narrative Scanner — aggregates Twitter, Reddit, News sources
 * Scores narratives by recency, virality, relevance to crypto/memecoins
 * Returns sorted ScoredNarrative[] for pump.fun launcher decisions
 */

import pino from 'pino';
import {
  type Narrative,
  type ScoredNarrative,
  type ScannerConfig,
  type SourceResult,
  type NarrativeSource,
  type SourceType,
  DEFAULT_CONFIG,
} from './types.js';
import { TwitterSource, type TwitterSourceConfig } from './sources/twitter.js';
import { RedditSource, type RedditSourceConfig } from './sources/reddit.js';
import { NewsSource, type NewsSourceConfig } from './sources/news.js';

const log = pino({ name: 'narrative-scanner' });

// ─── Crypto relevance keywords (weighted) ────────────────────────
const HIGH_RELEVANCE = new Set([
  'memecoin', 'pump.fun', 'pumpfun', 'solana', 'sol',
  'meme coin', 'memecoins', 'degen', 'degens', 'rug pull',
]);
const MED_RELEVANCE = new Set([
  'crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'altcoin',
  'token', 'dex', 'defi', 'airdrop', 'bull run', 'moon',
  'raydium', 'jupiter', 'orca', 'meteora',
]);

// ─── Scanner ─────────────────────────────────────────────────────
export class NarrativeScanner {
  private config: ScannerConfig;
  private sources: NarrativeSource[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private lastResults: ScoredNarrative[] = [];
  private running = false;

  constructor(config?: Partial<ScannerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadEnvOverrides();
    this.initSources();
  }

  /** Read env vars, override config values */
  private loadEnvOverrides(): void {
    const env = process.env;
    if (env.TWITTER_AUTH_TOKEN) this.config.twitterAuthToken = env.TWITTER_AUTH_TOKEN;
    if (env.TWITTER_CT0) this.config.twitterCt0 = env.TWITTER_CT0;
    if (env.TWITTER_TRACKED_ACCOUNTS) {
      this.config.twitterTrackedAccounts = env.TWITTER_TRACKED_ACCOUNTS.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (env.TWITTER_SEARCH_KEYWORDS) {
      this.config.twitterSearchKeywords = env.TWITTER_SEARCH_KEYWORDS.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (env.REDDIT_SUBREDDITS) {
      this.config.redditSubreddits = env.REDDIT_SUBREDDITS.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (env.NEWS_RSS_URLS) {
      this.config.newsRssUrls = env.NEWS_RSS_URLS.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (env.SCANNER_POLL_INTERVAL_MS) {
      this.config.pollIntervalMs = parseInt(env.SCANNER_POLL_INTERVAL_MS, 10);
    }
    if (env.SCANNER_MAX_AGE_MS) {
      this.config.maxAgeMs = parseInt(env.SCANNER_MAX_AGE_MS, 10);
    }
    if (env.SCANNER_MIN_SCORE) {
      this.config.minScore = parseInt(env.SCANNER_MIN_SCORE, 10);
    }
  }

  /** Instantiate enabled sources */
  private initSources(): void {
    // Twitter — requires auth tokens
    if (this.config.twitterAuthToken && this.config.twitterCt0) {
      this.sources.push(
        new TwitterSource({
          authToken: this.config.twitterAuthToken,
          ct0: this.config.twitterCt0,
          trackedAccounts: this.config.twitterTrackedAccounts,
          searchKeywords: this.config.twitterSearchKeywords,
        }),
      );
      log.info('Twitter source enabled');
    } else {
      log.warn('Twitter source disabled — missing TWITTER_AUTH_TOKEN / TWITTER_CT0');
    }

    // Reddit — no auth needed
    if (this.config.redditSubreddits.length > 0) {
      this.sources.push(
        new RedditSource({ subreddits: this.config.redditSubreddits }),
      );
      log.info({ subreddits: this.config.redditSubreddits }, 'Reddit source enabled');
    }

    // News RSS — no auth needed
    if (this.config.newsRssUrls.length > 0) {
      this.sources.push(
        new NewsSource({ rssUrls: this.config.newsRssUrls }),
      );
      log.info({ feeds: this.config.newsRssUrls.length }, 'News RSS source enabled');
    }
  }

  // ─── One-shot scan ─────────────────────────────────────
  async scan(): Promise<ScoredNarrative[]> {
    log.info({ sources: this.sources.map((s) => s.name) }, 'Starting narrative scan');

    // Fetch all sources in parallel
    const results = await Promise.allSettled(
      this.sources.map((source) => source.fetch()),
    );

    const sourceResults: SourceResult[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        sourceResults.push(result.value);
      } else {
        log.error({ err: (result.reason as Error)?.message }, 'Source fetch rejected');
      }
    }

    // Collect all narratives
    const allNarratives = sourceResults.flatMap((r) => r.narratives);
    log.info({ total: allNarratives.length }, 'Raw narratives collected');

    // Filter by age
    const now = Date.now();
    const fresh = allNarratives.filter(
      (n) => now - n.timestamp.getTime() < this.config.maxAgeMs,
    );

    // Group by similarity (dedupe cross-source)
    const grouped = this.groupNarratives(fresh);

    // Score each group
    const scored = grouped
      .map((group) => this.scoreNarrative(group))
      .filter((n) => n.score >= this.config.minScore)
      .sort((a, b) => b.score - a.score);

    this.lastResults = scored;
    log.info({ scored: scored.length, topScore: scored[0]?.score ?? 0 }, 'Scan complete');
    return scored;
  }

  // ─── Continuous polling ────────────────────────────────
  start(): void {
    if (this.running) return;
    this.running = true;

    // Initial scan
    this.scan().catch((err) => log.error({ err }, 'Initial scan failed'));

    this.pollTimer = setInterval(() => {
      this.scan().catch((err) => log.error({ err }, 'Poll scan failed'));
    }, this.config.pollIntervalMs);

    log.info({ intervalMs: this.config.pollIntervalMs }, 'Narrative scanner started');
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.running = false;
    log.info('Narrative scanner stopped');
  }

  getLastResults(): ScoredNarrative[] {
    return this.lastResults;
  }

  isRunning(): boolean {
    return this.running;
  }

  // ─── Group similar narratives ──────────────────────────
  private groupNarratives(narratives: Narrative[]): Narrative[][] {
    const groups: Narrative[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < narratives.length; i++) {
      if (used.has(i)) continue;

      const group = [narratives[i]];
      used.add(i);

      for (let j = i + 1; j < narratives.length; j++) {
        if (used.has(j)) continue;
        if (this.isSimilar(narratives[i], narratives[j])) {
          group.push(narratives[j]);
          used.add(j);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /** Simple text overlap + keyword similarity */
  private isSimilar(a: Narrative, b: Narrative): boolean {
    // Same text hash
    if (a.text === b.text) return true;

    // Cross-source same topic — check keyword overlap
    if (a.source !== b.source) {
      const setA = new Set(a.keywords);
      const overlap = b.keywords.filter((k) => setA.has(k));
      if (overlap.length >= 3) return true;
    }

    return false;
  }

  // ─── Scoring ───────────────────────────────────────────
  private scoreNarrative(group: Narrative[]): ScoredNarrative {
    // Pick the narrative with highest engagement as the representative
    const best = group.reduce((max, n) =>
      n.engagement.likes + n.engagement.shares > max.engagement.likes + max.engagement.shares
        ? n
        : max,
    );

    const recency = this.scoreRecency(best.timestamp);
    const virality = this.scoreVirality(best);
    const relevance = this.scoreRelevance(best);

    // Weighted combination: relevance matters most for our use case
    const score = Math.round(
      relevance * 0.40 +
      virality * 0.35 +
      recency * 0.25,
    );

    const sources = [...new Set(group.map((n) => n.source))];

    return {
      ...best,
      score: Math.min(score, 100),
      scoreBreakdown: { recency, virality, relevance },
      sourceCount: sources.length,
      sources,
    };
  }

  /** Recency: 100 if < 5min, decays to 0 over maxAgeMs */
  private scoreRecency(timestamp: Date): number {
    const ageMs = Date.now() - timestamp.getTime();
    const ratio = 1 - Math.min(ageMs / this.config.maxAgeMs, 1);
    // Exponential decay — recent items get much higher scores
    return Math.round(Math.pow(ratio, 0.5) * 100);
  }

  /** Virality: based on engagement metrics, capped at 100 */
  private scoreVirality(narrative: Narrative): number {
    const { likes, shares, comments, views } = narrative.engagement;

    // Source-specific baselines
    let rawScore: number;
    switch (narrative.source) {
      case 'twitter':
        // Twitter: weighted engagement score
        rawScore = likes * 1 + shares * 3 + comments * 0.5 + (views / 1000) * 0.1;
        return Math.min(Math.round((rawScore / 5000) * 100), 100);
      case 'reddit':
        // Reddit: upvotes + comments weighted
        rawScore = likes * 1 + comments * 2;
        return Math.min(Math.round((rawScore / 2000) * 100), 100);
      case 'news':
        // News articles don't have engagement — base on recency + source authority
        return 40;
      default:
        return 20;
    }
  }

  /** Relevance: keyword match against crypto/memecoin terms */
  private scoreRelevance(narrative: Narrative): number {
    const text = (narrative.text + ' ' + narrative.keywords.join(' ')).toLowerCase();

    let score = 0;
    let matched = 0;

    for (const term of HIGH_RELEVANCE) {
      if (text.includes(term)) {
        score += 25;
        matched++;
      }
    }
    for (const term of MED_RELEVANCE) {
      if (text.includes(term)) {
        score += 10;
        matched++;
      }
    }

    // Bonus for multiple keyword matches
    if (matched >= 5) score += 15;
    else if (matched >= 3) score += 10;

    return Math.min(score, 100);
  }
}
