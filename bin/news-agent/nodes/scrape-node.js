"use strict";
// Scrape Node with Inline Filtering
// Scrapes full content from news articles with real-time language/quality filtering
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeNode = scrapeNode;
const news_search_1 = __importDefault(require("../../news-ingester/news-search"));
const logger_1 = __importDefault(require("../../shared/logger"));
const filters_1 = require("../../shared/filters");
/**
 * Scrape Node with Inline Filtering
 * Applies first layer of filtering during scraping (language + quality)
 */
async function scrapeNode(state) {
    const startTime = Date.now();
    logger_1.default.info(`[ScrapeNode] Scraping content for ${state.rawNews.length} articles`);
    const rawArticles = [];
    const scrapedArticles = []; // For backward compatibility
    let totalScraped = 0;
    let filteredLanguage = 0;
    let filteredQuality = 0;
    const maxArticles = Number.parseInt(process.env.NEWS_SCRAPE_LIMIT || '120', 10) || 120;
    const concurrency = Number.parseInt(process.env.NEWS_SCRAPE_CONCURRENCY || '8', 10) || 8;
    const minContentLength = Number.parseInt(process.env.NEWS_MIN_CONTENT_CHARS || '150', 10) || 150;
    const minQualityScore = Number.parseFloat(process.env.NEWS_MIN_TITLE_QUALITY || '0.3') || 0.3;
    // Validate content quality (detect navigation/footer spam)
    function isValidContent(content) {
        // Check for excessive short lines (indicates navigation/footer)
        const lines = content.split('\n');
        const shortLines = lines.filter(l => l.trim().length > 0 && l.trim().length < 30);
        if (shortLines.length / lines.length > 0.7)
            return false;
        // Check for repetitive patterns
        const words = content.toLowerCase().split(/\s+/);
        const uniqueWords = new Set(words);
        if (words.length > 20 && uniqueWords.size / words.length < 0.3)
            return false;
        return true;
    }
    // Inline filter: Check language and quality immediately after scraping
    function applyInlineFilter(title, content, source) {
        // Language detection
        const language = (0, filters_1.detectLanguage)(title + ' ' + content.slice(0, 200));
        const passesLanguage = language === 'en';
        // Quality score
        const qualityScore = (0, filters_1.calculateQualityScore)(title, content);
        const passesQuality = qualityScore >= minQualityScore;
        return {
            passesLanguage,
            passesQuality,
            language,
            qualityScore,
        };
    }
    // Extract source from URL
    function extractSource(url) {
        try {
            const hostname = new URL(url).hostname.replace(/^www\./, '');
            return hostname;
        }
        catch {
            return 'unknown';
        }
    }
    // Items to scrape (sorted by recency)
    const itemsToScrape = state.rawNews
        .slice()
        .sort((a, b) => (b.publishedAt?.getTime() || b.createdAt.getTime()) - (a.publishedAt?.getTime() || a.createdAt.getTime()))
        .slice(0, maxArticles);
    async function mapWithConcurrency(items, limit, worker) {
        const results = [];
        let index = 0;
        const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
            while (index < items.length) {
                const current = items[index];
                index += 1;
                const result = await worker(current);
                if (result)
                    results.push(result);
            }
        });
        await Promise.all(runners);
        return results;
    }
    const results = await mapWithConcurrency(itemsToScrape, concurrency, async (newsItem) => {
        try {
            // Step 1: Pre-scraping quality check (title only)
            const titleQuality = (0, filters_1.calculateQualityScore)(newsItem.title);
            if (titleQuality < minQualityScore) {
                filteredQuality++;
                logger_1.default.debug(`[ScrapeNode] Filtered by title quality: "${newsItem.title}" (score: ${titleQuality.toFixed(2)})`);
                return null;
            }
            // Step 2: Scrape full content
            const content = await news_search_1.default.scrapeArticle(newsItem.url);
            let resolvedContent = content && content.trim().length >= minContentLength
                ? content.trim()
                : newsItem.content?.trim() || newsItem.snippet;
            if (!resolvedContent || resolvedContent.length < minContentLength) {
                logger_1.default.debug(`[ScrapeNode] Skipped (no content): ${newsItem.url}`);
                return null;
            }
            // Check content quality (filter out navigation/footer spam)
            if (!isValidContent(resolvedContent)) {
                logger_1.default.debug(`[ScrapeNode] Skipped (low quality content): ${newsItem.url}`);
                return null;
            }
            // Step 3: Inline filter (language + quality check on full content)
            const filter = applyInlineFilter(newsItem.title, resolvedContent, newsItem.source);
            if (!filter.passesLanguage) {
                filteredLanguage++;
                logger_1.default.debug(`[ScrapeNode] Filtered non-English: "${newsItem.title}" (lang: ${filter.language})`);
                return null;
            }
            if (!filter.passesQuality) {
                filteredQuality++;
                logger_1.default.debug(`[ScrapeNode] Filtered low quality: "${newsItem.title}" (score: ${filter.qualityScore.toFixed(2)})`);
                return null;
            }
            // Article passed all filters
            totalScraped += 1;
            logger_1.default.debug(`[ScrapeNode] Scraped: ${newsItem.title.substring(0, 50)}...`);
            const article = {
                id: newsItem.id,
                title: newsItem.title,
                content: resolvedContent,
                source: newsItem.source || extractSource(newsItem.url),
                url: newsItem.url,
                publishedAt: newsItem.publishedAt,
                categories: newsItem.categories,
                tags: newsItem.tags,
                sentiment: newsItem.sentiment,
                importance: newsItem.importance,
                snippet: newsItem.snippet,
                summary: '',
                scrapedAt: new Date(),
                createdAt: newsItem.createdAt,
            };
            const rawArticle = {
                id: newsItem.id,
                url: newsItem.url,
                title: newsItem.title,
                content: resolvedContent,
                snippet: newsItem.snippet || '',
                source: newsItem.source || extractSource(newsItem.url),
                publishedAt: newsItem.publishedAt || new Date(),
                language: filter.language,
            };
            // Return both for backward compatibility
            return { article, rawArticle };
        }
        catch (error) {
            logger_1.default.warn(`[ScrapeNode] Failed to scrape ${newsItem.url}: ${error}`);
            return null;
        }
    });
    // Separate results into the two formats
    for (const result of results) {
        if (result && 'article' in result) {
            scrapedArticles.push(result.article);
            rawArticles.push(result.rawArticle);
        }
    }
    const elapsed = Date.now() - startTime;
    logger_1.default.info(`[ScrapeNode] Completed in ${elapsed}ms. ` +
        `Scraped: ${totalScraped}, Filtered: ${filteredLanguage} language, ${filteredQuality} quality`);
    return {
        currentStep: 'SCRAPE_COMPLETE',
        scrapedArticles, // For backward compatibility
        rawArticles, // New format with filtering
        stats: {
            ...state.stats,
            scraped: totalScraped,
            totalScraped,
            filteredLanguage,
            filteredQuality,
        },
        thoughts: [
            ...state.thoughts,
            `Scraped ${totalScraped} articles, filtered ${filteredLanguage + filteredQuality} low-quality`,
        ],
    };
}
//# sourceMappingURL=scrape-node.js.map