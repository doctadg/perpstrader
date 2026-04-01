/**
 * News RSS Narrative Source
 * Fetches articles from CoinDesk, CoinTelegraph, Decrypt RSS feeds
 */

import axios from 'axios';
import crypto from 'crypto';
import pino from 'pino';
import type { Narrative, NarrativeSource, SourceResult } from '../types.js';

const log = pino({ name: 'narrative-scanner:news' });

export interface NewsSourceConfig {
  rssUrls: string[];
}

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  creator?: string;
}

export class NewsSource implements NarrativeSource {
  readonly name = 'news' as const;
  private config: NewsSourceConfig;

  constructor(config: NewsSourceConfig) {
    this.config = config;
  }

  async fetch(): Promise<SourceResult> {
    const narratives: Narrative[] = [];
    const fetchedAt = new Date();

    for (const url of this.config.rssUrls) {
      try {
        const items = await this.fetchFeed(url);
        narratives.push(...items.map((item) => this.toNarrative(item)));
      } catch (err: any) {
        log.error({ err: err.message, url }, 'RSS feed fetch failed');
      }
    }

    log.info({ count: narratives.length }, 'News narratives fetched');
    return { source: 'news', narratives, fetchedAt };
  }

  private async fetchFeed(feedUrl: string): Promise<RssItem[]> {
    const resp = await axios.get(feedUrl, {
      headers: {
        'user-agent': 'PerpsTrader/1.0 (narrative-scanner)',
        accept: 'application/rss+xml, application/xml, text/xml',
      },
      timeout: 10_000,
      responseType: 'text',
    });

    return this.parseRssXml(resp.data);
  }

  /** Minimal RSS XML parser — no external dep needed */
  private parseRssXml(xml: string): RssItem[] {
    const items: RssItem[] = [];

    // Extract items via regex (handles both RSS 2.0 <item> and Atom <entry>)
    const itemRegex = /<item[\s>]|<entry[\s>]/gi;
    let match: RegExpExecArray | null;

    // Split into item blocks
    const blocks = xml.split(/<\/?(?:item|entry)[^>]*>/i).filter((_, i) => i % 2 === 1);

    for (const block of blocks) {
      const title = this.extractTag(block, 'title');
      const link = this.extractTag(block, 'link') || this.extractAttr(block, 'link', 'href');
      const description = this.extractTag(block, 'description')
        || this.extractTag(block, 'summary')
        || this.extractTag(block, 'content:encoded');
      const pubDate = this.extractTag(block, 'pubDate')
        || this.extractTag(block, 'published')
        || this.extractTag(block, 'updated');
      const creator = this.extractTag(block, 'dc:creator')
        || this.extractTag(block, 'author')
        || this.extractTag(block, 'name');

      if (title) {
        items.push({
          title: this.decodeEntities(title),
          link: this.decodeEntities(link),
          description: this.decodeEntities(description),
          pubDate,
          creator: creator || undefined,
        });
      }
    }

    return items;
  }

  private extractTag(xml: string, tag: string): string {
    const re = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const m = xml.match(re);
    return (m?.[1] || m?.[2] || '').trim();
  }

  private extractAttr(xml: string, tag: string, attr: string): string {
    const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i');
    return xml.match(re)?.[1] || '';
  }

  private decodeEntities(s: string): string {
    return s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'");
  }

  private toNarrative(item: RssItem): Narrative {
    const text = [item.title, item.description].filter(Boolean).join(' — ');
    const id = `news-${crypto.hash('sha256', item.link || text).slice(0, 12)}`;
    const keywords = this.extractKeywords(text);

    return {
      id,
      source: 'news',
      text,
      timestamp: item.pubDate ? new Date(item.pubDate) : new Date(),
      keywords,
      engagement: {
        likes: 0,
        shares: 0,
        comments: 0,
        views: 0,
      },
      author: item.creator,
      url: item.link,
    };
  }

  private extractKeywords(text: string): string[] {
    const cryptoTerms = new Set([
      'memecoin', 'meme coin', 'pump.fun', 'solana', 'sol', 'crypto',
      'bitcoin', 'btc', 'ethereum', 'eth', 'altcoin', 'token', 'dex',
      'defi', 'nft', 'airdrop', 'blockchain', 'web3', 'bull', 'bear',
    ]);
    const lower = text.toLowerCase();
    return [...cryptoTerms].filter((term) => lower.includes(term));
  }
}
