import { WebsiteAnalysis } from '../../shared/types';
/**
 * Web Scraper Service
 * Uses MCP web reader when available, falls back to HTTP scraping
 */
declare class WebScraperService {
    private timeout;
    private userAgent;
    constructor();
    /**
     * Scrape website and return content
     * Uses MCP web reader if available, otherwise falls back to HTTP
     */
    scrapeWebsite(url: string): Promise<{
        content: string;
        title: string;
        success: boolean;
    }>;
    /**
     * Analyze website content for quality indicators
     */
    analyzeWebsite(url: string, metadata: {
        name: string;
        symbol: string;
    }): Promise<WebsiteAnalysis>;
    /**
     * Check if content contains any of the given keywords
     */
    private checkForKeywords;
    /**
     * Calculate content quality score (0-1)
     */
    private calculateContentQuality;
    /**
     * Extract text content from HTML
     */
    private extractTextContent;
    /**
     * Normalize URL (add protocol if missing)
     */
    private normalizeUrl;
    /**
     * Check if URL is valid
     */
    isValidUrl(url: string): boolean;
    /**
     * Extract domain from URL
     */
    extractDomain(url: string): string;
    /**
     * Check for SSL certificate validity (basic check)
     */
    checkSSL(url: string): Promise<boolean>;
    /**
     * Estimate website age using whois (simplified - just checks domain existence)
     */
    estimateAge(url: string): Promise<number | undefined>;
}
declare const webScraperService: WebScraperService;
export default webScraperService;
//# sourceMappingURL=web-scraper.d.ts.map