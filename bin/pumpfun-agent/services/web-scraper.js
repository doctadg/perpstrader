"use strict";
// Web Scraper Service for pump.fun Token Analysis
// Scrapes and analyzes project websites using MCP web reader
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * Web Scraper Service
 * Uses MCP web reader when available, falls back to HTTP scraping
 */
class WebScraperService {
    timeout;
    userAgent;
    constructor() {
        this.timeout = 20000; // 20 second timeout
        this.userAgent = 'Mozilla/5.0 (compatible; PerpsTrader-pumpfun-agent/1.0)';
    }
    /**
     * Scrape website and return content
     * Uses MCP web reader if available, otherwise falls back to HTTP
     */
    async scrapeWebsite(url) {
        try {
            // Normalize URL
            const normalizedUrl = this.normalizeUrl(url);
            logger_1.default.debug(`[WebScraper] Scraping: ${normalizedUrl}`);
            // Try HTTP fetch first (MCP web reader is not directly accessible in Node.js context)
            const response = await axios_1.default.get(normalizedUrl, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml',
                },
                maxRedirects: 5,
            });
            // Extract title
            let title = '';
            const titleMatch = response.data?.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) {
                title = titleMatch[1].trim();
            }
            // Extract text content (basic HTML stripping)
            const content = this.extractTextContent(response.data || '');
            return {
                content,
                title,
                success: true,
            };
        }
        catch (error) {
            logger_1.default.warn(`[WebScraper] Failed to scrape ${url}: ${error.message}`);
            return {
                content: '',
                title: '',
                success: false,
            };
        }
    }
    /**
     * Analyze website content for quality indicators
     */
    async analyzeWebsite(url, metadata) {
        logger_1.default.info(`[WebScraper] Analyzing website: ${url}`);
        const scrapeResult = await this.scrapeWebsite(url);
        if (!scrapeResult.success) {
            return {
                url,
                exists: false,
                hasContent: false,
                contentQuality: 0,
                hasWhitepaper: false,
                hasTeamInfo: false,
                hasRoadmap: false,
                hasTokenomics: false,
                sslValid: url.startsWith('https://'),
                glmAnalysis: 'Failed to scrape website',
            };
        }
        const content = scrapeResult.content.toLowerCase();
        // Check for content quality indicators
        const hasWhitepaper = this.checkForKeywords(content, [
            'whitepaper', 'white paper', 'litepaper', 'documentation', 'docs'
        ]);
        const hasTeamInfo = this.checkForKeywords(content, [
            'team', 'founder', 'ceo', 'developer', 'about us', 'our team'
        ]);
        const hasRoadmap = this.checkForKeywords(content, [
            'roadmap', 'timeline', 'milestone', 'phase', 'q1 2024', 'q2 2024'
        ]);
        const hasTokenomics = this.checkForKeywords(content, [
            'tokenomics', 'token distribution', 'supply', 'allocation', 'vesting'
        ]);
        // Calculate content quality score
        const contentQuality = this.calculateContentQuality(scrapeResult.content, {
            hasWhitepaper,
            hasTeamInfo,
            hasRoadmap,
            hasTokenomics,
        });
        return {
            url,
            exists: true,
            hasContent: scrapeResult.content.length > 200,
            contentQuality,
            hasWhitepaper,
            hasTeamInfo,
            hasRoadmap,
            hasTokenomics,
            sslValid: url.startsWith('https://'),
            glmAnalysis: '', // Will be filled by GLM analysis
        };
    }
    /**
     * Check if content contains any of the given keywords
     */
    checkForKeywords(content, keywords) {
        return keywords.some(keyword => content.includes(keyword));
    }
    /**
     * Calculate content quality score (0-1)
     */
    calculateContentQuality(content, indicators) {
        let score = 0;
        // Base score from content length
        const wordCount = content.split(/\s+/).length;
        if (wordCount > 500)
            score += 0.2;
        else if (wordCount > 200)
            score += 0.1;
        // Indicator scores
        if (indicators.hasWhitepaper)
            score += 0.25;
        if (indicators.hasTeamInfo)
            score += 0.2;
        if (indicators.hasRoadmap)
            score += 0.2;
        if (indicators.hasTokenomics)
            score += 0.15;
        return Math.min(1, score);
    }
    /**
     * Extract text content from HTML
     */
    extractTextContent(html) {
        // Remove script and style tags
        let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        // Remove HTML tags
        text = text.replace(/<[^>]+>/g, ' ');
        // Decode HTML entities
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;/g, "'");
        // Normalize whitespace
        text = text.replace(/\s+/g, ' ');
        text = text.trim();
        return text.substring(0, 10000); // Limit to 10k characters
    }
    /**
     * Normalize URL (add protocol if missing)
     */
    normalizeUrl(url) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return 'https://' + url;
        }
        return url;
    }
    /**
     * Check if URL is valid
     */
    isValidUrl(url) {
        try {
            new URL(this.normalizeUrl(url));
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Extract domain from URL
     */
    extractDomain(url) {
        try {
            const parsed = new URL(this.normalizeUrl(url));
            return parsed.hostname;
        }
        catch {
            return '';
        }
    }
    /**
     * Check for SSL certificate validity (basic check)
     */
    async checkSSL(url) {
        return url.startsWith('https://');
    }
    /**
     * Estimate website age using whois (simplified - just checks domain existence)
     */
    async estimateAge(url) {
        // In production, this would use a whois API
        // For now, return undefined
        return undefined;
    }
}
// Singleton instance
const webScraperService = new WebScraperService();
exports.default = webScraperService;
//# sourceMappingURL=web-scraper.js.map