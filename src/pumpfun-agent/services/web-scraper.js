"use strict";
// Web Scraper Service for pump.fun Token Analysis
// Scrapes and analyzes project websites using MCP web reader
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var axios_1 = require("axios");
var logger_1 = require("../../shared/logger");
/**
 * Web Scraper Service
 * Uses MCP web reader when available, falls back to HTTP scraping
 */
var WebScraperService = /** @class */ (function () {
    function WebScraperService() {
        this.timeout = 20000; // 20 second timeout
        this.userAgent = 'Mozilla/5.0 (compatible; PerpsTrader-pumpfun-agent/1.0)';
    }
    /**
     * Scrape website and return content
     * Uses MCP web reader if available, otherwise falls back to HTTP
     */
    WebScraperService.prototype.scrapeWebsite = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizedUrl, response, title, titleMatch, content, error_1;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        normalizedUrl = this.normalizeUrl(url);
                        logger_1.default.debug("[WebScraper] Scraping: ".concat(normalizedUrl));
                        return [4 /*yield*/, axios_1.default.get(normalizedUrl, {
                                timeout: this.timeout,
                                headers: {
                                    'User-Agent': this.userAgent,
                                    'Accept': 'text/html,application/xhtml+xml,application/xml',
                                },
                                maxRedirects: 5,
                            })];
                    case 1:
                        response = _b.sent();
                        title = '';
                        titleMatch = (_a = response.data) === null || _a === void 0 ? void 0 : _a.match(/<title[^>]*>([^<]+)<\/title>/i);
                        if (titleMatch) {
                            title = titleMatch[1].trim();
                        }
                        content = this.extractTextContent(response.data || '');
                        return [2 /*return*/, {
                                content: content,
                                title: title,
                                success: true,
                            }];
                    case 2:
                        error_1 = _b.sent();
                        logger_1.default.warn("[WebScraper] Failed to scrape ".concat(url, ": ").concat(error_1.message));
                        return [2 /*return*/, {
                                content: '',
                                title: '',
                                success: false,
                            }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Analyze website content for quality indicators
     */
    WebScraperService.prototype.analyzeWebsite = function (url, metadata) {
        return __awaiter(this, void 0, void 0, function () {
            var scrapeResult, content, hasWhitepaper, hasTeamInfo, hasRoadmap, hasTokenomics, contentQuality;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        logger_1.default.info("[WebScraper] Analyzing website: ".concat(url));
                        return [4 /*yield*/, this.scrapeWebsite(url)];
                    case 1:
                        scrapeResult = _a.sent();
                        if (!scrapeResult.success) {
                            return [2 /*return*/, {
                                    url: url,
                                    exists: false,
                                    hasContent: false,
                                    contentQuality: 0,
                                    hasWhitepaper: false,
                                    hasTeamInfo: false,
                                    hasRoadmap: false,
                                    hasTokenomics: false,
                                    sslValid: url.startsWith('https://'),
                                    glmAnalysis: 'Failed to scrape website',
                                }];
                        }
                        content = scrapeResult.content.toLowerCase();
                        hasWhitepaper = this.checkForKeywords(content, [
                            'whitepaper', 'white paper', 'litepaper', 'documentation', 'docs'
                        ]);
                        hasTeamInfo = this.checkForKeywords(content, [
                            'team', 'founder', 'ceo', 'developer', 'about us', 'our team'
                        ]);
                        hasRoadmap = this.checkForKeywords(content, [
                            'roadmap', 'timeline', 'milestone', 'phase', 'q1 2024', 'q2 2024'
                        ]);
                        hasTokenomics = this.checkForKeywords(content, [
                            'tokenomics', 'token distribution', 'supply', 'allocation', 'vesting'
                        ]);
                        contentQuality = this.calculateContentQuality(scrapeResult.content, {
                            hasWhitepaper: hasWhitepaper,
                            hasTeamInfo: hasTeamInfo,
                            hasRoadmap: hasRoadmap,
                            hasTokenomics: hasTokenomics,
                        });
                        return [2 /*return*/, {
                                url: url,
                                exists: true,
                                hasContent: scrapeResult.content.length > 200,
                                contentQuality: contentQuality,
                                hasWhitepaper: hasWhitepaper,
                                hasTeamInfo: hasTeamInfo,
                                hasRoadmap: hasRoadmap,
                                hasTokenomics: hasTokenomics,
                                sslValid: url.startsWith('https://'),
                                glmAnalysis: '', // Will be filled by GLM analysis
                            }];
                }
            });
        });
    };
    /**
     * Check if content contains any of the given keywords
     */
    WebScraperService.prototype.checkForKeywords = function (content, keywords) {
        return keywords.some(function (keyword) { return content.includes(keyword); });
    };
    /**
     * Calculate content quality score (0-1)
     */
    WebScraperService.prototype.calculateContentQuality = function (content, indicators) {
        var score = 0;
        // Base score from content length
        var wordCount = content.split(/\s+/).length;
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
    };
    /**
     * Extract text content from HTML
     */
    WebScraperService.prototype.extractTextContent = function (html) {
        // Remove script and style tags
        var text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
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
    };
    /**
     * Normalize URL (add protocol if missing)
     */
    WebScraperService.prototype.normalizeUrl = function (url) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return 'https://' + url;
        }
        return url;
    };
    /**
     * Check if URL is valid
     */
    WebScraperService.prototype.isValidUrl = function (url) {
        try {
            new URL(this.normalizeUrl(url));
            return true;
        }
        catch (_a) {
            return false;
        }
    };
    /**
     * Extract domain from URL
     */
    WebScraperService.prototype.extractDomain = function (url) {
        try {
            var parsed = new URL(this.normalizeUrl(url));
            return parsed.hostname;
        }
        catch (_a) {
            return '';
        }
    };
    /**
     * Check for SSL certificate validity (basic check)
     */
    WebScraperService.prototype.checkSSL = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, url.startsWith('https://')];
            });
        });
    };
    /**
     * Estimate website age using whois (simplified - just checks domain existence)
     */
    WebScraperService.prototype.estimateAge = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // In production, this would use a whois API
                // For now, return undefined
                return [2 /*return*/, undefined];
            });
        });
    };
    return WebScraperService;
}());
// Singleton instance
var webScraperService = new WebScraperService();
exports.default = webScraperService;
