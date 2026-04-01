"use strict";
/**
 * News RSS Narrative Source
 * Fetches articles from CoinDesk, CoinTelegraph, Decrypt RSS feeds
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsSource = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const pino_1 = __importDefault(require("pino"));
const log = (0, pino_1.default)({ name: 'narrative-scanner:news' });
class NewsSource {
    name = 'news';
    config;
    constructor(config) {
        this.config = config;
    }
    async fetch() {
        const narratives = [];
        const fetchedAt = new Date();
        for (const url of this.config.rssUrls) {
            try {
                const items = await this.fetchFeed(url);
                narratives.push(...items.map((item) => this.toNarrative(item)));
            }
            catch (err) {
                log.error({ err: err.message, url }, 'RSS feed fetch failed');
            }
        }
        log.info({ count: narratives.length }, 'News narratives fetched');
        return { source: 'news', narratives, fetchedAt };
    }
    async fetchFeed(feedUrl) {
        const resp = await axios_1.default.get(feedUrl, {
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
    parseRssXml(xml) {
        const items = [];
        // Extract items via regex (handles both RSS 2.0 <item> and Atom <entry>)
        const itemRegex = /<item[\s>]|<entry[\s>]/gi;
        let match;
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
    extractTag(xml, tag) {
        const re = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
        const m = xml.match(re);
        return (m?.[1] || m?.[2] || '').trim();
    }
    extractAttr(xml, tag, attr) {
        const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i');
        return xml.match(re)?.[1] || '';
    }
    decodeEntities(s) {
        return s
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&apos;/g, "'");
    }
    toNarrative(item) {
        const text = [item.title, item.description].filter(Boolean).join(' — ');
        const id = `news-${crypto_1.default.hash('sha256', item.link || text).slice(0, 12)}`;
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
    extractKeywords(text) {
        const cryptoTerms = new Set([
            'memecoin', 'meme coin', 'pump.fun', 'solana', 'sol', 'crypto',
            'bitcoin', 'btc', 'ethereum', 'eth', 'altcoin', 'token', 'dex',
            'defi', 'nft', 'airdrop', 'blockchain', 'web3', 'bull', 'bear',
        ]);
        const lower = text.toLowerCase();
        return [...cryptoTerms].filter((term) => lower.includes(term));
    }
}
exports.NewsSource = NewsSource;
//# sourceMappingURL=news.js.map