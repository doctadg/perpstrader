"use strict";
/**
 * Twitter/X Narrative Source
 * Uses cookie-based auth (Bearer + ct0 + auth_token) with GraphQL endpoints
 * Mirrors the auth pattern from /home/d/ingest/src/connectors/social/twitter.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterSource = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const pino_1 = __importDefault(require("pino"));
const log = (0, pino_1.default)({ name: 'narrative-scanner:twitter' });
// ─── Constants ───────────────────────────────────────────────────
// Public bearer token embedded in X's web client JS bundle
const WEB_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const GRAPHQL_IDS = {
    UserTweets: 'ix7iRrsAvfXyGUQ06Z7krA',
    SearchTimeline: 'UN1i3zUiCWa-6r-Uaho4fw',
};
const TWEET_FEATURES = {
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    articles_preview_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    creator_subscriptions_quote_tweet_preview_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    rweb_video_timestamps_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_enhance_cards_enabled: false,
};
// ─── Twitter Source ──────────────────────────────────────────────
class TwitterSource {
    name = 'twitter';
    client;
    config;
    constructor(config) {
        this.config = config;
        this.client = axios_1.default.create({
            baseURL: 'https://x.com',
            timeout: 15_000,
            headers: {
                authorization: `Bearer ${decodeURIComponent(WEB_BEARER)}`,
                'x-csrf-token': config.ct0,
                cookie: `auth_token=${config.authToken}; ct0=${config.ct0}`,
                'x-twitter-active-user': 'yes',
                'x-twitter-auth-type': 'OAuth2Session',
                'x-twitter-client-language': 'en',
                'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                referer: 'https://x.com/',
                origin: 'https://x.com',
            },
        });
    }
    async fetch() {
        const narratives = [];
        const fetchedAt = new Date();
        // 1) Search for keyword-based tweets
        for (const keyword of this.config.searchKeywords) {
            try {
                const tweets = await this.searchTweets(keyword, 20);
                narratives.push(...tweets.map((t) => this.toNarrative(t)));
            }
            catch (err) {
                log.error({ err: err.message, keyword }, 'Twitter search failed');
            }
        }
        // 2) Poll tracked accounts
        for (const handle of this.config.trackedAccounts) {
            try {
                const tweets = await this.fetchUserTweets(handle, 20);
                narratives.push(...tweets.map((t) => this.toNarrative(t)));
            }
            catch (err) {
                log.error({ err: err.message, handle }, 'Twitter user timeline failed');
            }
        }
        log.info({ count: narratives.length }, 'Twitter narratives fetched');
        return { source: 'twitter', narratives, fetchedAt };
    }
    // ─── SearchTimeline GraphQL ─────────────────────────────
    async searchTweets(query, count) {
        const params = new URLSearchParams({
            variables: JSON.stringify({
                rawQuery: query,
                count,
                querySource: 'typed_query',
                product: 'Top',
            }),
            features: JSON.stringify(TWEET_FEATURES),
        });
        const resp = await this.client.get(`/i/api/graphql/${GRAPHQL_IDS.SearchTimeline}/SearchTimeline?${params}`);
        const instructions = resp.data?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions ?? [];
        return this.extractTweets(instructions);
    }
    // ─── UserTweets GraphQL ─────────────────────────────────
    async fetchUserTweets(screenName, count) {
        // Resolve user ID first
        const userId = await this.resolveUserId(screenName);
        if (!userId) {
            log.warn({ screenName }, 'Could not resolve Twitter user ID');
            return [];
        }
        const params = new URLSearchParams({
            variables: JSON.stringify({
                userId,
                count,
                includePromotedContent: false,
                withQuickPromoteEligibilityTweetFields: false,
                withVoice: true,
                withV2Timeline: true,
            }),
            features: JSON.stringify(TWEET_FEATURES),
        });
        const resp = await this.client.get(`/i/api/graphql/${GRAPHQL_IDS.UserTweets}/UserTweets?${params}`);
        const timeline = resp.data?.data?.user?.result?.timeline_v2?.timeline ??
            resp.data?.data?.user?.result?.timeline?.timeline;
        const instructions = timeline?.instructions ?? [];
        return this.extractTweets(instructions);
    }
    // ─── Resolve screenName → rest_id ──────────────────────
    async resolveUserId(screenName) {
        try {
            const params = new URLSearchParams({
                variables: JSON.stringify({ screen_name: screenName, withSafetyModeUserFields: true }),
                features: JSON.stringify({
                    hidden_profile_subscriptions_enabled: true,
                    responsive_web_graphql_exclude_directive_enabled: true,
                    verified_phone_label_enabled: false,
                    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
                    responsive_web_graphql_timeline_navigation_enabled: true,
                }),
            });
            const resp = await this.client.get(`/i/api/graphql/sLVLhk0bGj3MVFEKTdax1w/UserByScreenName?${params}`);
            return resp.data?.data?.user?.result?.rest_id ?? null;
        }
        catch (err) {
            log.error({ err: err.message, screenName }, 'Failed to resolve user ID');
            return null;
        }
    }
    // ─── Extract tweets from GraphQL instructions ───────────
    extractTweets(instructions) {
        const tweets = [];
        for (const inst of instructions) {
            const entries = inst.entries ?? (inst.entry ? [inst.entry] : []);
            for (const entry of entries) {
                const parsed = this.parseTweetEntry(entry);
                if (parsed)
                    tweets.push(parsed);
            }
        }
        return tweets;
    }
    parseTweetEntry(entry) {
        let tweet = entry?.content?.itemContent?.tweet_results?.result;
        if (!tweet)
            return null;
        // Unwrap TweetWithVisibilityResults
        if (tweet.__typename === 'TweetWithVisibilityResults') {
            tweet = tweet.tweet;
        }
        if (!tweet?.legacy)
            return null;
        const legacy = tweet.legacy;
        const core = tweet.core?.user_results?.result?.legacy;
        return {
            id: legacy.id_str,
            text: legacy.full_text,
            author: core?.screen_name ?? '',
            likes: legacy.favorite_count ?? 0,
            retweets: legacy.retweet_count ?? 0,
            replies: legacy.reply_count ?? 0,
            views: tweet.views?.count ? parseInt(tweet.views.count, 10) : 0,
            createdAt: legacy.created_at,
            hashtags: (legacy.entities?.hashtags ?? []).map((h) => h.text.toLowerCase()),
        };
    }
    // ─── Convert to Narrative ───────────────────────────────
    toNarrative(tweet) {
        const id = `twitter-${crypto_1.default.hash('sha256', tweet.id).slice(0, 12)}`;
        return {
            id,
            source: 'twitter',
            text: tweet.text,
            timestamp: new Date(tweet.createdAt),
            keywords: tweet.hashtags,
            engagement: {
                likes: tweet.likes,
                shares: tweet.retweets,
                comments: tweet.replies,
                views: tweet.views,
            },
            author: tweet.author,
            url: `https://x.com/i/status/${tweet.id}`,
        };
    }
}
exports.TwitterSource = TwitterSource;
//# sourceMappingURL=twitter.js.map