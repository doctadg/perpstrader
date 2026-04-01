/**
 * Reddit Narrative Source
 * Fetches hot posts from crypto subreddits via .json API (no auth required)
 */

import axios from 'axios';
import crypto from 'crypto';
import pino from 'pino';
import type { Narrative, NarrativeSource, SourceResult } from '../types.js';

const log = pino({ name: 'narrative-scanner:reddit' });

export interface RedditSourceConfig {
  subreddits: string[];
}

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  created_utc: number;
  score: number;
  num_comments: number;
  upvote_ratio: number;
  permalink: string;
  url: string;
  link_flair_text: string | null;
}

export class RedditSource implements NarrativeSource {
  readonly name = 'reddit' as const;
  private config: RedditSourceConfig;

  constructor(config: RedditSourceConfig) {
    this.config = config;
  }

  async fetch(): Promise<SourceResult> {
    const narratives: Narrative[] = [];
    const fetchedAt = new Date();

    for (const subreddit of this.config.subreddits) {
      try {
        const posts = await this.fetchSubreddit(subreddit);
        narratives.push(...posts.map((p) => this.toNarrative(p)));
      } catch (err: any) {
        log.error({ err: err.message, subreddit }, 'Reddit fetch failed');
      }
    }

    log.info({ count: narratives.length }, 'Reddit narratives fetched');
    return { source: 'reddit', narratives, fetchedAt };
  }

  private async fetchSubreddit(subreddit: string, limit = 25): Promise<RedditPost[]> {
    const resp = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json`, {
      params: { limit },
      headers: {
        'user-agent': 'PerpsTrader/1.0 (narrative-scanner)',
        accept: 'application/json',
      },
      timeout: 10_000,
    });

    const children = resp.data?.data?.children ?? [];
    return children.map((c: any) => c.data as RedditPost);
  }

  private toNarrative(post: RedditPost): Narrative {
    const text = [post.title, post.selftext].filter(Boolean).join(' — ');
    const id = `reddit-${crypto.hash('sha256', post.id).slice(0, 12)}`;
    const keywords = this.extractKeywords(text);

    return {
      id,
      source: 'reddit',
      text,
      timestamp: new Date(post.created_utc * 1000),
      keywords,
      engagement: {
        likes: post.score,
        shares: 0,
        comments: post.num_comments,
        views: Math.round(post.score / Math.max(post.upvote_ratio, 0.01)),
      },
      author: post.author,
      url: `https://reddit.com${post.permalink}`,
      metadata: {
        flair: post.link_flair_text,
        upvoteRatio: post.upvote_ratio,
      },
    };
  }

  private extractKeywords(text: string): string[] {
    const cryptoTerms = new Set([
      'memecoin', 'meme coin', 'pump.fun', 'solana', 'sol', 'degens',
      'crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'altcoin', 'token',
      'airdrop', 'bull run', 'moon', 'rug', 'dex', 'defi', 'nft',
    ]);
    const lower = text.toLowerCase();
    return [...cryptoTerms].filter((term) => lower.includes(term));
  }
}
