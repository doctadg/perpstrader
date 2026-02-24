"use strict";
// News Search Service
// Integrates with search server API for news discovery
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../shared/config"));
const logger_1 = __importDefault(require("../shared/logger"));
const news_store_1 = __importDefault(require("../data/news-store"));
const title_cleaner_1 = require("../shared/title-cleaner");
const config = config_1.default.get();
const SEARCH_QUERIES = {
    CRYPTO: [
        'bitcoin news',
        'cryptocurrency today',
        'ethereum updates',
        'defi news',
        'crypto regulation',
        'altcoin news',
    ],
    STOCKS: [
        'stock market today',
        'S&P 500 news',
        'Nasdaq updates',
        'market analysis',
        'stock earnings',
        'wall street news',
    ],
    ECONOMICS: [
        'federal reserve news',
        'inflation data',
        'interest rates',
        'GDP economic data',
        'economic indicators',
        'central bank news',
    ],
    GEOPOLITICS: [
        'geopolitical news',
        'international relations',
        'trade war updates',
        'US China relations',
        'European Union news',
        'middle east news',
    ],
    TECH: [
        'technology news',
        'artificial intelligence',
        'tech startups',
        'big tech companies',
        'software trends',
        'tech innovation',
    ],
    COMMODITIES: [
        'gold price news',
        'oil market updates',
        'commodities market',
        'energy sector news',
        'agriculture commodities',
        'precious metals',
    ],
    SPORTS: [
        'sports news today',
        'latest sports headlines',
        'football updates',
        'basketball news',
        'tennis results',
        'MMA UFC updates',
        'golf news',
    ],
    FOOTBALL: [
        'football news today',
        'soccer transfers',
        'Premier League news',
        'La Liga updates',
        'Bundesliga news',
        'Serie A results',
        'Champions League',
        'World Cup football',
    ],
    BASKETBALL: [
        'NBA news today',
        'basketball scores',
        'NBA trades',
        'college basketball',
        'EuroLeague news',
        'FIBA updates',
    ],
    TENNIS: [
        'tennis news today',
        'ATP tour updates',
        'WTA tennis results',
        'Grand Slam tennis',
        'Wimbledon news',
        'US Open tennis',
    ],
    MMA: [
        'UFC news today',
        'MMA updates',
        'fighting sports news',
        'UFC fight results',
        'boxing news',
        'Bellator MMA',
    ],
    GOLF: [
        'PGA Tour news',
        'golf results today',
        'Masters golf',
        'US Open golf',
        'European Tour golf',
        'LIV Golf news',
    ],
};
const QUERY_MODIFIERS = [
    'today',
    'latest',
    'breaking',
    'update',
    'analysis',
    'this week',
    'market impact',
    'last 24 hours',
    'past 24 hours',
    'overnight',
];
const CATEGORY_HINTS = {
    CRYPTO: ['bitcoin', 'ethereum', 'altcoin', 'defi', 'stablecoin', 'exchange', 'ETF', 'layer 2'],
    STOCKS: ['earnings', 'S&P 500', 'Nasdaq', 'Dow', 'IPO', 'buyback', 'dividends', 'analyst upgrade'],
    ECONOMICS: ['CPI', 'inflation', 'jobs report', 'GDP', 'FOMC', 'interest rates', 'central bank'],
    GEOPOLITICS: ['sanctions', 'trade war', 'election', 'diplomacy', 'conflict', 'summit'],
    TECH: ['AI', 'semiconductors', 'cloud', 'cybersecurity', 'startup', 'big tech'],
    COMMODITIES: ['oil', 'gold', 'natural gas', 'copper', 'grain', 'OPEC'],
    SPORTS: ['sports', 'championship', 'season', 'injury', 'trade', 'playoffs'],
    FOOTBALL: ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Champions League', 'World Cup'],
    BASKETBALL: ['NBA', 'playoffs', 'draft', 'trade', 'EuroLeague', 'college basketball'],
    TENNIS: ['ATP', 'WTA', 'Grand Slam', 'Wimbledon', 'US Open', 'French Open'],
    MMA: ['UFC', 'fight night', 'title bout', 'Bellator', 'PFL', 'boxing'],
    GOLF: ['PGA', 'Masters', 'US Open', 'Ryder Cup', 'LIV Golf', 'European Tour'],
};
const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'into', 'over', 'after', 'before',
    'about', 'their', 'they', 'them', 'will', 'would', 'could', 'should', 'what', 'when', 'where',
    'which', 'while', 'were', 'been', 'than', 'then', 'also', 'just', 'more', 'less', 'very',
    'today', 'latest', 'breaking', 'update', 'analysis', 'news', 'report', 'reports', 'says', 'said',
    'up', 'down', 'new', 'top', 'how', 'why', 'amid', 'over', 'under', 'near',
]);
class NewsSearchService {
    baseUrl;
    timeout;
    seenUrls;
    seenTitles;
    queryHistory;
    queryCooldownMs;
    maxQueriesPerCategory;
    maxResultsPerQuery;
    queryConcurrency;
    dedupeTtlMs;
    researchEnabled;
    researchThreshold;
    researchPages;
    contextRefreshMs;
    contextLookback;
    lastContextRefresh;
    dynamicKeywordsByCategory;
    dynamicKeywordsGlobal;
    lastQueryPlan;
    constructor() {
        this.baseUrl = config.searchApi.baseUrl;
        this.timeout = config.searchApi.timeout;
        this.seenUrls = new Map();
        this.seenTitles = new Map();
        this.queryHistory = new Map();
        this.queryCooldownMs = Number.parseInt(process.env.NEWS_QUERY_COOLDOWN_MS || '300000', 10) || 300000;
        this.maxQueriesPerCategory = Number.parseInt(process.env.NEWS_QUERIES_PER_CATEGORY || '6', 10) || 6;
        this.maxResultsPerQuery = Number.parseInt(process.env.NEWS_RESULTS_PER_QUERY || '25', 10) || 25;
        this.queryConcurrency = Number.parseInt(process.env.NEWS_QUERY_CONCURRENCY || '4', 10) || 4;
        this.dedupeTtlMs = Number.parseInt(process.env.NEWS_DEDUPE_TTL_MS || '3600000', 10) || 3600000;
        this.researchEnabled = process.env.NEWS_RESEARCH_ENABLED !== 'false';
        this.researchThreshold = Number.parseInt(process.env.NEWS_RESEARCH_THRESHOLD || '8', 10) || 8;
        this.researchPages = Number.parseInt(process.env.NEWS_RESEARCH_PAGES || '3', 10) || 3;
        this.contextRefreshMs = Number.parseInt(process.env.NEWS_CONTEXT_REFRESH_MS || '600000', 10) || 600000;
        this.contextLookback = Number.parseInt(process.env.NEWS_CONTEXT_LOOKBACK || '200', 10) || 200;
        this.lastContextRefresh = 0;
        this.dynamicKeywordsByCategory = new Map();
        this.dynamicKeywordsGlobal = [];
        this.lastQueryPlan = new Map();
        this.loadCache();
        if (process.env.NEWS_CLEAR_CACHE_ON_START === 'true') {
            this.clearCache();
        }
    }
    loadCache() {
        try {
            const fs = require('fs');
            const path = require('path');
            const cachePath = path.join(__dirname, '../../data/news-cache.json');
            if (fs.existsSync(cachePath)) {
                const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                if (cache.urlEntries && cache.urlEntries.length > 0) {
                    for (const [url, lastSeen] of cache.urlEntries) {
                        this.seenUrls.set(url, Number.isFinite(lastSeen) ? lastSeen : 0);
                    }
                }
                else {
                    for (const url of cache.urls || []) {
                        this.seenUrls.set(url, 0);
                    }
                }
                if (cache.titleEntries && cache.titleEntries.length > 0) {
                    for (const [titleKey, lastSeen] of cache.titleEntries) {
                        this.seenTitles.set(titleKey, Number.isFinite(lastSeen) ? lastSeen : 0);
                    }
                }
                else {
                    for (const titleKey of cache.titleKeys || cache.titles || []) {
                        this.seenTitles.set(titleKey, 0);
                    }
                }
                if (cache.queries) {
                    for (const entry of cache.queries) {
                        this.queryHistory.set(this.normalizeQuery(entry.query), entry);
                    }
                }
                logger_1.default.debug(`Loaded ${this.seenUrls.size} cached URLs, ${this.seenTitles.size} title keys, ${this.queryHistory.size} query entries`);
            }
        }
        catch (error) {
            logger_1.default.warn('Failed to load news cache, starting fresh:', error);
        }
    }
    saveCache() {
        try {
            const fs = require('fs');
            const path = require('path');
            const cachePath = path.join(__dirname, '../../data');
            if (!fs.existsSync(cachePath)) {
                fs.mkdirSync(cachePath, { recursive: true });
            }
            const maxCacheSize = Number.parseInt(process.env.NEWS_CACHE_SIZE || '20000', 10) || 20000;
            const trimmedUrlEntries = Array.from(this.seenUrls.entries())
                .sort((a, b) => a[1] - b[1])
                .slice(-maxCacheSize);
            const trimmedTitleEntries = Array.from(this.seenTitles.entries())
                .sort((a, b) => a[1] - b[1])
                .slice(-maxCacheSize);
            const trimmedQueries = Array.from(this.queryHistory.values()).slice(-1000);
            this.seenUrls = new Map(trimmedUrlEntries);
            this.seenTitles = new Map(trimmedTitleEntries);
            const trimmedUrls = trimmedUrlEntries.map(([url]) => url);
            const trimmedTitles = trimmedTitleEntries.map(([titleKey]) => titleKey);
            const cache = {
                urls: trimmedUrls,
                titleKeys: trimmedTitles,
                urlEntries: trimmedUrlEntries,
                titleEntries: trimmedTitleEntries,
                queries: trimmedQueries,
            };
            fs.writeFileSync(path.join(cachePath, 'news-cache.json'), JSON.stringify(cache, null, 2));
        }
        catch (error) {
            logger_1.default.warn('Failed to save news cache:', error);
        }
    }
    extractTargetUrl(url) {
        const candidate = url.startsWith('//') ? `https:${url}` : url;
        try {
            const parsed = new URL(candidate);
            const host = parsed.hostname.replace(/^www\./, '');
            if (host.includes('duckduckgo.com') && parsed.pathname.startsWith('/l/')) {
                const uddg = parsed.searchParams.get('uddg');
                if (uddg)
                    return decodeURIComponent(uddg);
            }
            if (host.endsWith('news.google.com')) {
                const target = parsed.searchParams.get('url') || parsed.searchParams.get('u') || parsed.searchParams.get('q');
                if (target)
                    return decodeURIComponent(target);
            }
        }
        catch (error) {
            return url;
        }
        return url;
    }
    normalizeUrl(url) {
        const extracted = this.extractTargetUrl(url);
        const candidate = extracted.startsWith('//') ? `https:${extracted}` : extracted;
        try {
            const parsed = new URL(candidate);
            parsed.hash = '';
            const params = new URLSearchParams(parsed.search);
            for (const key of Array.from(params.keys())) {
                const lower = key.toLowerCase();
                if (lower.startsWith('utm_') || ['ref', 'ref_src', 'source', 'utm', 'utm-source', 'utm-medium'].includes(lower)) {
                    params.delete(key);
                }
            }
            const sorted = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
            parsed.search = sorted.length ? `?${new URLSearchParams(sorted).toString()}` : '';
            return parsed.toString();
        }
        catch (error) {
            return extracted.trim();
        }
    }
    normalizeTitle(title) {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    normalizeQuery(query) {
        return query.toLowerCase().replace(/\s+/g, ' ').trim();
    }
    buildTitleKey(title, url) {
        const host = (() => {
            try {
                return new URL(url).hostname.replace(/^www\./, '');
            }
            catch (error) {
                return 'unknown';
            }
        })();
        return `${this.normalizeTitle(title)}|${host}`;
    }
    isSeen(map, key, now) {
        const lastSeen = map.get(key);
        if (!lastSeen)
            return false;
        if (this.dedupeTtlMs <= 0)
            return false;
        return now - lastSeen < this.dedupeTtlMs;
    }
    markSeen(map, key, now) {
        map.set(key, now);
    }
    recordQuery(query, category, total, newlyDiscovered) {
        const key = this.normalizeQuery(query);
        const now = new Date().toISOString();
        const existing = this.queryHistory.get(key);
        const updated = {
            query,
            category,
            lastRun: now,
            lastTotal: total,
            lastNew: newlyDiscovered,
            runs: existing ? existing.runs + 1 : 1,
        };
        this.queryHistory.set(key, updated);
    }
    shouldUseQuery(query) {
        const entry = this.queryHistory.get(this.normalizeQuery(query));
        if (!entry)
            return true;
        const lastRun = new Date(entry.lastRun).getTime();
        if (!Number.isFinite(lastRun))
            return true;
        return Date.now() - lastRun > this.queryCooldownMs;
    }
    extractKeywords(text) {
        const cleaned = text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!cleaned)
            return [];
        const words = cleaned.split(' ').filter(word => word.length > 2 && !STOP_WORDS.has(word));
        const counts = new Map();
        for (const word of words) {
            counts.set(word, (counts.get(word) || 0) + 1);
        }
        return Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([word]) => word)
            .slice(0, 10);
    }
    async refreshContext() {
        if (Date.now() - this.lastContextRefresh < this.contextRefreshMs)
            return;
        this.lastContextRefresh = Date.now();
        try {
            const recent = await news_store_1.default.getRecentNews(this.contextLookback);
            this.updateDynamicKeywords(recent);
        }
        catch (error) {
            logger_1.default.debug('[NewsSearch] Failed to refresh context:', error);
        }
    }
    updateDynamicKeywords(recent) {
        const byCategory = new Map();
        const globalCounts = new Map();
        for (const item of recent) {
            const tags = item.tags || [];
            const headlineKeywords = this.extractKeywords(item.title || item.snippet || '');
            const allKeywords = [...tags, ...headlineKeywords];
            for (const keyword of allKeywords) {
                const normalized = keyword.toLowerCase();
                globalCounts.set(normalized, (globalCounts.get(normalized) || 0) + 1);
            }
            for (const category of item.categories || []) {
                if (!byCategory.has(category)) {
                    byCategory.set(category, new Map());
                }
                const categoryCounts = byCategory.get(category);
                for (const keyword of allKeywords) {
                    const normalized = keyword.toLowerCase();
                    categoryCounts.set(normalized, (categoryCounts.get(normalized) || 0) + 1);
                }
            }
        }
        this.dynamicKeywordsByCategory.clear();
        for (const [category, counts] of byCategory.entries()) {
            const top = Array.from(counts.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([keyword]) => keyword)
                .slice(0, 8);
            this.dynamicKeywordsByCategory.set(category, top);
        }
        this.dynamicKeywordsGlobal = Array.from(globalCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([keyword]) => keyword)
            .slice(0, 12);
    }
    getDynamicKeywords(category) {
        const categoryKeywords = this.dynamicKeywordsByCategory.get(category) || [];
        const merged = [...categoryKeywords, ...this.dynamicKeywordsGlobal];
        const unique = Array.from(new Set(merged));
        return unique.slice(0, 8);
    }
    buildQueryPool(category) {
        const pool = new Set();
        const baseQueries = SEARCH_QUERIES[category] || [];
        for (const query of baseQueries) {
            pool.add(query);
            for (const modifier of QUERY_MODIFIERS) {
                pool.add(`${query} ${modifier}`);
            }
        }
        const hints = CATEGORY_HINTS[category] || [];
        const dynamic = this.getDynamicKeywords(category);
        const keywordSeeds = [...new Set([...hints, ...dynamic])].slice(0, 12);
        for (const keyword of keywordSeeds) {
            pool.add(`${keyword} news`);
            for (const modifier of QUERY_MODIFIERS) {
                pool.add(`${keyword} ${modifier}`);
            }
            for (const hint of hints.slice(0, 4)) {
                pool.add(`${keyword} ${hint}`);
            }
        }
        const tradingSymbols = config.trading?.symbols || [];
        if (category === 'CRYPTO' && tradingSymbols.length > 0) {
            for (const symbol of tradingSymbols) {
                pool.add(`${symbol} crypto news`);
                pool.add(`${symbol} price update`);
            }
        }
        return Array.from(pool).map(query => query.trim()).filter(Boolean);
    }
    chooseQueries(category, maxQueries) {
        const desired = Math.max(1, maxQueries || this.maxQueriesPerCategory);
        const pool = this.buildQueryPool(category);
        const available = pool.filter(query => this.shouldUseQuery(query));
        const candidates = available.length >= desired ? available : pool;
        const shuffled = candidates.slice();
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, desired);
    }
    async mapWithConcurrency(items, limit, worker) {
        const results = [];
        let index = 0;
        const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
            while (index < items.length) {
                const current = items[index];
                index += 1;
                results.push(await worker(current));
            }
        });
        await Promise.all(runners);
        return results;
    }
    mergeResults(baseResults, research) {
        const map = new Map();
        const addResult = (result, content) => {
            const rawLink = result.link || '';
            if (!rawLink)
                return;
            const normalizedUrl = this.normalizeUrl(rawLink);
            const existing = map.get(normalizedUrl);
            const title = result.title || existing?.title || normalizedUrl;
            const snippet = result.snippet || existing?.snippet || (content ? content.slice(0, 200) : '');
            const position = Number.isFinite(result.position) ? result.position : (existing?.position || 0);
            const date = result.date || existing?.date;
            const mergedContent = existing?.content || content;
            map.set(normalizedUrl, {
                title,
                link: normalizedUrl,
                snippet,
                position,
                date,
                content: mergedContent,
            });
        };
        for (const result of baseResults) {
            addResult(result, result.content);
        }
        if (research) {
            for (const result of research.search_results || []) {
                addResult(result, result.content);
            }
            for (const scraped of research.scraped_content || []) {
                if (!scraped.url)
                    continue;
                addResult({
                    title: scraped.title || scraped.url,
                    link: scraped.url,
                    snippet: scraped.text ? scraped.text.slice(0, 200) : '',
                    position: 0,
                    date: undefined,
                    content: scraped.text,
                }, scraped.text);
            }
        }
        return Array.from(map.values());
    }
    async search(query, numResults = 25) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/search`, {
                query,
                num_results: numResults,
                search_type: 'news',
            }, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            // Fallback to SearXNG if search server returns no results
            if (!response.data.results || response.data.results.length === 0) {
                logger_1.default.debug(`[NewsSearch] Search server returned 0 results, trying SearXNG fallback...`);
                const searxngResults = await this.searchSearXNG(query, numResults);
                if (searxngResults.length > 0) {
                    logger_1.default.info(`[NewsSearch] SearXNG returned ${searxngResults.length} results for "${query}"`);
                }
                return searxngResults;
            }
            return response.data.results;
        }
        catch (error) {
            logger_1.default.error(`Search failed for query "${query}":`, error);
            // Fallback to SearXNG on error
            logger_1.default.debug(`[NewsSearch] Search server error, trying SearXNG fallback...`);
            return this.searchSearXNG(query, numResults);
        }
    }
    /**
     * Fallback search using SearXNG directly
     */
    async searchSearXNG(query, numResults = 25) {
        const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
        try {
            const params = new URLSearchParams({
                q: query,
                format: 'json',
                categories: 'news',
                language: 'en-US',
                safesearch: '0',
            });
            const response = await axios_1.default.get(`${searxngUrl}/search?${params.toString()}`, {
                timeout: 30000,
                headers: {
                    'Accept': 'application/json',
                },
            });
            const data = response.data;
            const results = (data.results || []).slice(0, numResults).map((r) => ({
                title: r.title || '',
                link: r.url || '',
                snippet: r.content || '',
                position: r.position || 0,
                date: r.publishedDate,
            }));
            return results;
        }
        catch (error) {
            logger_1.default.error(`[NewsSearch] SearXNG fallback failed for "${query}":`, error);
            return [];
        }
    }
    async research(query, maxPages = 5) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/research`, {
                query,
                max_pages: maxPages,
                extract_content: true,
            }, {
                timeout: this.timeout * 2,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            return response.data;
        }
        catch (error) {
            logger_1.default.error(`Research failed for query "${query}":`, error);
            return { search_results: [], scraped_content: [] };
        }
    }
    async searchCategory(category, numResultsPerQuery = this.maxResultsPerQuery, maxQueries = this.maxQueriesPerCategory) {
        const queries = this.chooseQueries(category, maxQueries);
        this.lastQueryPlan.set(category, queries);
        const newResults = [];
        const seenCategoryUrls = new Set();
        const now = Date.now();
        const queryResults = await this.mapWithConcurrency(queries, this.queryConcurrency, async (query) => {
            logger_1.default.info(`[NewsSearch] Searching ${category}: "${query}"`);
            const baseResults = await this.search(query, numResultsPerQuery);
            let researchResponse = null;
            let usedResearch = false;
            if (this.researchEnabled && baseResults.length < this.researchThreshold) {
                researchResponse = await this.research(query, this.researchPages);
                usedResearch = true;
            }
            const merged = this.mergeResults(baseResults, researchResponse);
            let newlyDiscovered = 0;
            const addedResults = [];
            for (const result of merged) {
                if (!result.link)
                    continue;
                const normalizedUrl = this.normalizeUrl(result.link);
                const originalTitle = result.title || '';
                // Clean and validate title quality
                const cleaned = (0, title_cleaner_1.cleanTitle)(originalTitle);
                const minQualityScore = Number.parseFloat(process.env.NEWS_MIN_TITLE_QUALITY || '0.3');
                // Filter out spam and very low quality titles
                if ((0, title_cleaner_1.isLikelySpam)(originalTitle) || cleaned.qualityScore < minQualityScore) {
                    logger_1.default.debug(`[NewsSearch] Filtering low-quality title: "${originalTitle}" (score: ${cleaned.qualityScore.toFixed(2)})`);
                    continue;
                }
                const titleKey = this.buildTitleKey(cleaned.title, normalizedUrl);
                if (seenCategoryUrls.has(normalizedUrl))
                    continue;
                seenCategoryUrls.add(normalizedUrl);
                const isNew = !this.isSeen(this.seenUrls, normalizedUrl, now) && !this.isSeen(this.seenTitles, titleKey, now);
                if (isNew) {
                    newlyDiscovered += 1;
                    this.markSeen(this.seenUrls, normalizedUrl, now);
                    this.markSeen(this.seenTitles, titleKey, now);
                    addedResults.push({
                        ...result,
                        title: cleaned.title,
                        link: normalizedUrl,
                    });
                }
            }
            this.recordQuery(query, category, merged.length, newlyDiscovered);
            logger_1.default.info(`[NewsSearch] ${category}: "${query}" -> ${merged.length} found, ${newlyDiscovered} new${usedResearch ? ' (research)' : ''}`);
            return {
                addedResults,
                totalFound: merged.length,
                newlyDiscovered,
            };
        });
        for (const result of queryResults) {
            newResults.push(...result.addedResults);
        }
        this.saveCache();
        logger_1.default.info(`[NewsSearch] ${category}: ${newResults.length} new across ${queries.length} queries`);
        return newResults;
    }
    async scrapeArticle(url) {
        try {
            const response = await axios_1.default.post(`${this.baseUrl}/scrape`, {
                url,
                extract: ['title', 'text'],
                timeout: 15000,
            }, {
                timeout: this.timeout,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            return response.data.text || null;
        }
        catch (error) {
            const status = error?.response?.status;
            const detail = error?.response?.data?.detail ||
                error?.message ||
                String(error);
            // Common upstream denials (403/paywall, 422 unsupported pages) are expected at internet scale.
            if (status && [401, 403, 404, 410, 422, 429].includes(status)) {
                logger_1.default.warn(`[NewsSearch] Skipping scrape for ${url} (${status}): ${detail}`);
            }
            else {
                logger_1.default.error(`[NewsSearch] Failed to scrape ${url}: ${detail}`);
            }
            return null;
        }
    }
    async searchAllCategories(categories = Object.keys(SEARCH_QUERIES), numResultsPerQuery = this.maxResultsPerQuery, maxQueries = this.maxQueriesPerCategory) {
        const results = new Map();
        await this.refreshContext();
        this.lastQueryPlan.clear();
        await Promise.all(categories.map(async (category) => {
            const categoryResults = await this.searchCategory(category, numResultsPerQuery, maxQueries);
            results.set(category, categoryResults);
        }));
        return results;
    }
    getRandomQuery(category) {
        const queries = SEARCH_QUERIES[category] || [];
        if (queries.length === 0)
            return `${category.toLowerCase()} news`;
        return queries[Math.floor(Math.random() * queries.length)];
    }
    getLastQueryPlan() {
        return new Map(this.lastQueryPlan);
    }
    getAvailableCategories() {
        return Object.keys(SEARCH_QUERIES);
    }
    clearCache() {
        this.seenUrls.clear();
        this.seenTitles.clear();
        this.queryHistory.clear();
        this.saveCache();
        logger_1.default.info('News search cache cleared');
    }
    getCacheSize() {
        return {
            urls: this.seenUrls.size,
            titles: this.seenTitles.size,
            queries: this.queryHistory.size,
        };
    }
}
const newsSearchService = new NewsSearchService();
exports.default = newsSearchService;
//# sourceMappingURL=news-search.js.map