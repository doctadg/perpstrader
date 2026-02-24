"use strict";
// Market-Enriched Title Generator
// Main entry point for generating high-quality, market-aware titles
// Combines numerical extraction, templates, and market context
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEnhancedTitle = generateEnhancedTitle;
exports.quickGenerateTitle = quickGenerateTitle;
exports.generateTitleWithMarketContext = generateTitleWithMarketContext;
exports.scoreTitleQuality = scoreTitleQuality;
var numerical_extractor_1 = require("./numerical-extractor");
var title_templates_1 = require("./title-templates");
var title_formatter_1 = require("./title-formatter");
// ============================================================================
// ASSET DETECTION
// ============================================================================
var CRYPTO_ASSETS = [
    'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
    'MATIC', 'POL', 'ARB', 'OP', 'LTC', 'BCH', 'ETC', 'TRX', 'TON', 'ATOM',
    'NEAR', 'APT', 'SUI', 'ICP', 'FIL', 'INJ', 'RNDR', 'RUNE', 'UNI', 'AAVE',
    'MKR', 'SNX', 'LDO', 'JUP', 'TIA', 'FTM', 'PEPE', 'SHIB', 'USDT', 'USDC', 'DAI',
];
var CRYPTO_NAMES = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'solana': 'SOL',
    'ripple': 'XRP',
    'binance': 'BNB',
    'dogecoin': 'DOGE',
    'cardano': 'ADA',
    'avalanche': 'AVAX',
    'polkadot': 'DOT',
    'chainlink': 'LINK',
    'polygon': 'MATIC',
};
var STOCK_INDICES = [
    'S&P 500', 'SPX', 'Nasdaq', 'NDX', 'Dow Jones', 'DJI', 'Russell', 'VIX',
];
/**
 * Extract the primary asset from title and content
 */
function extractPrimaryAsset(title, content) {
    var text = "".concat(title, " ").concat(content || '').toLowerCase();
    // Check for crypto names
    for (var _i = 0, _a = Object.entries(CRYPTO_NAMES); _i < _a.length; _i++) {
        var _b = _a[_i], name_1 = _b[0], symbol = _b[1];
        if (text.includes(name_1)) {
            return { name: symbol, symbol: symbol };
        }
    }
    // Check for crypto tickers
    for (var _c = 0, CRYPTO_ASSETS_1 = CRYPTO_ASSETS; _c < CRYPTO_ASSETS_1.length; _c++) {
        var ticker = CRYPTO_ASSETS_1[_c];
        if (text.includes(ticker.toLowerCase())) {
            return { name: ticker, symbol: ticker };
        }
    }
    // Check for stock indices
    for (var _d = 0, STOCK_INDICES_1 = STOCK_INDICES; _d < STOCK_INDICES_1.length; _d++) {
        var index = STOCK_INDICES_1[_d];
        if (text.toLowerCase().includes(index.toLowerCase())) {
            return { name: index, symbol: index.replace(/\s+/g, '') };
        }
    }
    // Look for ticker patterns ($TICKER or (TICKER))
    var tickerMatch = text.match(/\$([A-Z]{2,5})\b/);
    if (tickerMatch) {
        return { name: tickerMatch[1], symbol: tickerMatch[1] };
    }
    return null;
}
/**
 * Extract the reason/context from a title
 * Looks for patterns like "on X", "after X", "due to X"
 */
function extractReason(title) {
    var _a;
    // Pattern: "on/news", "after X", "due to X", "following X"
    var patterns = [
        /(?:on|after|due to|following|amid)\s+([^,.]+?)(?:,|\.$|$)/i,
        /\bon\s+(?:news|reports|rumors|speculation)\b/i,
    ];
    for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
        var pattern = patterns_1[_i];
        var match = title.match(pattern);
        if (match) {
            return ((_a = match[1]) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        }
    }
    return null;
}
/**
 * Extract authority name (SEC, Fed, etc.)
 */
function extractAuthority(title, content) {
    var text = "".concat(title, " ").concat(content || '').toLowerCase();
    var authorities = [
        { name: 'SEC', patterns: [/sec/i, /securities/i] },
        { name: 'Fed', patterns: [/fed/i, /federal reserve/i] },
        { name: 'ECB', patterns: [/ecb/i, /european central bank/i] },
        { name: 'BOJ', patterns: [/boj/i, /bank of japan/i] },
        { name: 'CFTC', patterns: [/cftc/i] },
        { name: 'FDA', patterns: [/fda/i] },
        { name: 'FCA', patterns: [/fca/i] },
    ];
    for (var _i = 0, authorities_1 = authorities; _i < authorities_1.length; _i++) {
        var authority = authorities_1[_i];
        if (authority.patterns.some(function (p) { return p.test(text); })) {
            return authority.name;
        }
    }
    return null;
}
/**
 * Extract protocol/company name
 */
function extractProtocol(title, content) {
    var text = "".concat(title, " ").concat(content || '');
    // Common DeFi protocols
    var protocols = [
        'Uniswap', 'Aave', 'Maker', 'Compound', 'Curve', 'SushiSwap',
        'PancakeSwap', 'Lido', 'Rocket Pool', 'Convex', 'Yearn',
    ];
    for (var _i = 0, protocols_1 = protocols; _i < protocols_1.length; _i++) {
        var protocol = protocols_1[_i];
        if (text.toLowerCase().includes(protocol.toLowerCase())) {
            return protocol;
        }
    }
    return null;
}
// ============================================================================
// TITLE GENERATION
// ============================================================================
/**
 * Generate enhanced title from article content
 */
function generateEnhancedTitle(article, marketContext, llmGeneratedTitle) {
    var title = article.title || '';
    var content = article.content || article.snippet || '';
    // Extract numerical entities
    var entities = (0, numerical_extractor_1.extractNumericalEntities)("".concat(title, " ").concat(content));
    // Extract asset info
    var assetInfo = extractPrimaryAsset(title, content) ||
        ((marketContext === null || marketContext === void 0 ? void 0 : marketContext.asset) ? { name: marketContext.asset, symbol: marketContext.assetSymbol || marketContext.asset } : null);
    // Detect event type
    var eventType = (0, title_formatter_1.detectEventType)(title);
    // Generate formats
    var formats = generateTitleFormats(title, content, assetInfo, entities, eventType, marketContext, llmGeneratedTitle);
    // Calculate metrics
    var metrics = (0, title_formatter_1.calculateTitleMetrics)(formats.full);
    // Extract entities (asset names, tickers, etc.)
    var extractedEntities = extractEntities(title, content, assetInfo);
    return {
        original: title,
        cleaned: (0, title_formatter_1.formatTitle)(title),
        enhanced: formats.full,
        formats: formats,
        metrics: metrics,
        extractedNumbers: entities,
        extractedEntities: extractedEntities,
        subEventType: eventType !== 'other' ? eventType : undefined,
        confidence: calculateConfidence(metrics, entities.length, assetInfo !== null),
    };
}
/**
 * Generate multiple title format variants
 */
function generateTitleFormats(title, content, assetInfo, entities, eventType, marketContext, llmGeneratedTitle) {
    var asset = (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.name) || 'Asset';
    var assetSymbol = (assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.symbol) || 'ASSET';
    // Get numerical values
    var price = (0, numerical_extractor_1.getPrimaryPrice)(entities);
    var percentage = (0, numerical_extractor_1.getPrimaryPercentage)(entities);
    var amount = (0, numerical_extractor_1.getPrimaryAmount)(entities);
    // Get context
    var reason = extractReason(title) || extractReason(content || '');
    var authority = extractAuthority(title, content);
    var protocol = extractProtocol(title, content);
    // Check trend direction
    var trend = (0, title_formatter_1.detectTrendDirection)(title);
    // Use template-based generation if we have good data
    if (assetInfo && (price || percentage || eventType !== 'other')) {
        var templateVars = (0, title_templates_1.extractTemplateVariables)(asset, assetSymbol, entities, reason || undefined, authority || undefined, protocol || undefined);
        var template = (0, title_templates_1.generateTitleFromTemplate)(eventType, templateVars);
        // Clean up the templates
        return {
            full: cleanGeneratedTitle(template.full, assetInfo),
            medium: cleanGeneratedTitle(template.medium, assetInfo),
            short: cleanGeneratedTitle(template.short, assetInfo),
            ticker: cleanGeneratedTitle(template.ticker, assetInfo),
        };
    }
    // Fallback: enhance original title
    var enhanced = enhanceOriginalTitle(title, assetInfo, percentage, price, amount, reason);
    return {
        full: enhanced,
        medium: generateMediumTitle(title, assetInfo),
        short: generateShortTitle(title, assetInfo, percentage),
        ticker: generateTickerTitle(assetInfo, percentage),
    };
}
/**
 * Clean up a generated title (remove double spaces, etc.)
 */
function cleanGeneratedTitle(title, assetInfo) {
    return title
        .replace(/\s+/g, ' ')
        .replace(/\s*[-–—]\s*/g, ' - ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
/**
 * Enhance the original title with extracted context
 */
function enhanceOriginalTitle(title, assetInfo, percentage, price, amount, reason) {
    var enhanced = (0, title_formatter_1.formatTitle)(title);
    // Add percentage if missing and present in entities
    if (percentage && !enhanced.includes('%')) {
        var direction = (0, title_formatter_1.detectTrendDirection)(title);
        var sign = direction === 'UP' ? '+' : '-';
        enhanced = "".concat(enhanced, " (").concat(sign).concat(percentage.value, "%)");
    }
    // Add price if available and relevant
    if (price && assetInfo && !enhanced.includes('$')) {
        var trend = (0, title_formatter_1.detectTrendDirection)(title);
        var action = trend === 'UP' ? 'surges' : trend === 'DOWN' ? 'drops' : 'at';
        enhanced = "".concat(assetInfo.symbol, " ").concat(action, " to ").concat((0, numerical_extractor_1.formatPrice)(price));
    }
    return enhanced;
}
/**
 * Generate a medium-length title
 */
function generateMediumTitle(title, assetInfo) {
    var action = (0, title_formatter_1.detectActionWord)(title);
    var cleaned = (0, title_formatter_1.formatTitle)(title);
    if (assetInfo && action) {
        return "".concat(assetInfo.symbol, " ").concat(action);
    }
    if (assetInfo) {
        return "".concat(assetInfo.symbol, " update");
    }
    // Truncate original if too long
    var words = cleaned.split(' ');
    if (words.length > 8) {
        return words.slice(0, 8).join(' ') + '...';
    }
    return cleaned;
}
/**
 * Generate a short title
 */
function generateShortTitle(title, assetInfo, percentage) {
    if (assetInfo && percentage) {
        var trend = (0, title_formatter_1.detectTrendDirection)(title);
        var sign = trend === 'UP' ? '+' : '-';
        return "".concat(assetInfo.symbol, " ").concat(sign).concat(percentage.value, "%");
    }
    if (assetInfo) {
        return "".concat(assetInfo.symbol, " update");
    }
    var words = (0, title_formatter_1.formatTitle)(title).split(' ');
    return words.slice(0, 4).join(' ');
}
/**
 * Generate a ticker-style title
 */
function generateTickerTitle(assetInfo, percentage) {
    if (!assetInfo)
        return 'NEWS';
    if (percentage) {
        var trend = (0, title_formatter_1.detectTrendDirection)(assetInfo.symbol + ' ' + percentage.value);
        var sign = trend === 'UP' ? '+' : '-';
        return "".concat(assetInfo.symbol, " ").concat(sign).concat(percentage.value, "%");
    }
    return assetInfo.symbol;
}
/**
 * Extract entity names from text
 */
function extractEntities(title, content, assetInfo) {
    var entities = [];
    var text = "".concat(title, " ").concat(content);
    // Add asset
    if (assetInfo) {
        entities.push(assetInfo.name);
        entities.push(assetInfo.symbol);
    }
    // Extract capitalized phrases (potential entities)
    var capitalizedPhrases = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) || [];
    for (var _i = 0, capitalizedPhrases_1 = capitalizedPhrases; _i < capitalizedPhrases_1.length; _i++) {
        var phrase = capitalizedPhrases_1[_i];
        var lower = phrase.toLowerCase();
        // Filter out common words
        if (![
            'the', 'and', 'for', 'with', 'from', 'that', 'this', 'update',
            'news', 'report', 'says', 'according', 'source', 'latest',
        ].includes(lower)) {
            entities.push(phrase);
        }
    }
    return __spreadArray([], new Set(entities), true).slice(0, 10);
}
/**
 * Calculate confidence score for the generated title
 */
function calculateConfidence(metrics, entityCount, hasAsset) {
    var confidence = 0.5;
    // Higher confidence with asset detection
    if (hasAsset)
        confidence += 0.15;
    // Higher confidence with numerical entities
    if (entityCount > 0)
        confidence += 0.1;
    // Quality score contribution
    confidence += (metrics.qualityScore / 5) * 0.15;
    // Action detection
    if (metrics.hasAction)
        confidence += 0.1;
    return Math.min(0.95, Math.max(0.3, confidence));
}
/**
 * Quick title generation with minimal processing
 */
function quickGenerateTitle(title) {
    return generateEnhancedTitle({ title: title });
}
/**
 * Generate title from market data context
 */
function generateTitleWithMarketContext(title, price, priceChange24h, assetSymbol) {
    var marketContext = {
        asset: assetSymbol,
        assetSymbol: assetSymbol,
        currentPrice: price,
        priceChange24h: priceChange24h,
    };
    return generateEnhancedTitle({ title: title }, marketContext);
}
/**
 * Score title quality (1-5)
 */
function scoreTitleQuality(title) {
    var metrics = (0, title_formatter_1.calculateTitleMetrics)(title);
    return metrics.qualityScore;
}
