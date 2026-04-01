"use strict";
/**
 * Reddit Narrative Source
 * Fetches hot posts from crypto subreddits via .json API (no auth required)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedditSource = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const pino_1 = __importDefault(require("pino"));
const log = (0, pino_1.default)({ name: 'narrative-scanner:reddit' });
class RedditSource {
    name = 'reddit';
    config;
    constructor(config) {
        this.config = config;
    }
    async fetch() {
        const narratives = [];
        const fetchedAt = new Date();
        for (const subreddit of this.config.subreddits) {
            try {
                const posts = await this.fetchSubreddit(subreddit);
                narratives.push(...posts.map((p) => this.toNarrative(p)));
            }
            catch (err) {
                log.error({ err: err.message, subreddit }, 'Reddit fetch failed');
            }
        }
        log.info({ count: narratives.length }, 'Reddit narratives fetched');
        return { source: 'reddit', narratives, fetchedAt };
    }
    async fetchSubreddit(subreddit, limit = 25) {
        const resp = await axios_1.default.get(`https://www.reddit.com/r/${subreddit}/hot.json`, {
            params: { limit },
            headers: {
                'user-agent': 'PerpsTrader/1.0 (narrative-scanner)',
                accept: 'application/json',
            },
            timeout: 10_000,
        });
        const children = resp.data?.data?.children ?? [];
        return children.map((c) => c.data);
    }
    toNarrative(post) {
        const text = [post.title, post.selftext].filter(Boolean).join(' — ');
        const id = `reddit-${crypto_1.default.hash('sha256', post.id).slice(0, 12)}`;
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
    extractKeywords(text) {
        const cryptoTerms = new Set([
            'memecoin', 'meme coin', 'pump.fun', 'solana', 'sol', 'degens',
            'crypto', 'bitcoin', 'btc', 'ethereum', 'eth', 'altcoin', 'token',
            'airdrop', 'bull run', 'moon', 'rug', 'dex', 'defi', 'nft',
        ]);
        const lower = text.toLowerCase();
        return [...cryptoTerms].filter((term) => lower.includes(term));
    }
}
exports.RedditSource = RedditSource;
//# sourceMappingURL=reddit.js.map