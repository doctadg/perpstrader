"use strict";
// Market-Enriched Title Generator
// Main entry point for generating high-quality, market-aware titles
// Combines numerical extraction, templates, and market context
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEnhancedTitle = generateEnhancedTitle;
exports.quickGenerateTitle = quickGenerateTitle;
exports.generateTitleWithMarketContext = generateTitleWithMarketContext;
exports.scoreTitleQuality = scoreTitleQuality;
const numerical_extractor_1 = require("./numerical-extractor");
const title_templates_1 = require("./title-templates");
const title_formatter_1 = require("./title-formatter");
// ============================================================================
// ASSET DETECTION
// ============================================================================
const CRYPTO_ASSETS = [
    'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
    'MATIC', 'POL', 'ARB', 'OP', 'LTC', 'BCH', 'ETC', 'TRX', 'TON', 'ATOM',
    'NEAR', 'APT', 'SUI', 'ICP', 'FIL', 'INJ', 'RNDR', 'RUNE', 'UNI', 'AAVE',
    'MKR', 'SNX', 'LDO', 'JUP', 'TIA', 'FTM', 'PEPE', 'SHIB', 'USDT', 'USDC', 'DAI',
];
const CRYPTO_NAMES = {
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
const STOCK_INDICES = [
    'S&P 500', 'SPX', 'Nasdaq', 'NDX', 'Dow Jones', 'DJI', 'Russell', 'VIX',
];
/**
 * Extract the primary asset from title and content
 */
function extractPrimaryAsset(title, content) {
    const text = `${title} ${content || ''}`.toLowerCase();
    // Check for crypto names
    for (const [name, symbol] of Object.entries(CRYPTO_NAMES)) {
        if (text.includes(name)) {
            return { name: symbol, symbol };
        }
    }
    // Check for crypto tickers
    for (const ticker of CRYPTO_ASSETS) {
        if (text.includes(ticker.toLowerCase())) {
            return { name: ticker, symbol: ticker };
        }
    }
    // Check for stock indices
    for (const index of STOCK_INDICES) {
        if (text.toLowerCase().includes(index.toLowerCase())) {
            return { name: index, symbol: index.replace(/\s+/g, '') };
        }
    }
    // Look for ticker patterns ($TICKER or (TICKER))
    const tickerMatch = text.match(/\$([A-Z]{2,5})\b/);
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
    // Pattern: "on/news", "after X", "due to X", "following X"
    const patterns = [
        /(?:on|after|due to|following|amid)\s+([^,.]+?)(?:,|\.$|$)/i,
        /\bon\s+(?:news|reports|rumors|speculation)\b/i,
    ];
    for (const pattern of patterns) {
        const match = title.match(pattern);
        if (match) {
            return match[1]?.trim() || null;
        }
    }
    return null;
}
/**
 * Extract authority name (SEC, Fed, etc.)
 */
function extractAuthority(title, content) {
    const text = `${title} ${content || ''}`.toLowerCase();
    const authorities = [
        { name: 'SEC', patterns: [/sec/i, /securities/i] },
        { name: 'Fed', patterns: [/fed/i, /federal reserve/i] },
        { name: 'ECB', patterns: [/ecb/i, /european central bank/i] },
        { name: 'BOJ', patterns: [/boj/i, /bank of japan/i] },
        { name: 'CFTC', patterns: [/cftc/i] },
        { name: 'FDA', patterns: [/fda/i] },
        { name: 'FCA', patterns: [/fca/i] },
    ];
    for (const authority of authorities) {
        if (authority.patterns.some(p => p.test(text))) {
            return authority.name;
        }
    }
    return null;
}
/**
 * Extract protocol/company name
 */
function extractProtocol(title, content) {
    const text = `${title} ${content || ''}`;
    // Common DeFi protocols
    const protocols = [
        'Uniswap', 'Aave', 'Maker', 'Compound', 'Curve', 'SushiSwap',
        'PancakeSwap', 'Lido', 'Rocket Pool', 'Convex', 'Yearn',
    ];
    for (const protocol of protocols) {
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
    const title = article.title || '';
    const content = article.content || article.snippet || '';
    // Extract numerical entities
    const entities = (0, numerical_extractor_1.extractNumericalEntities)(`${title} ${content}`);
    // Extract asset info
    const assetInfo = extractPrimaryAsset(title, content) ||
        (marketContext?.asset ? { name: marketContext.asset, symbol: marketContext.assetSymbol || marketContext.asset } : null);
    // Detect event type
    const eventType = (0, title_formatter_1.detectEventType)(title);
    // Generate formats
    const formats = generateTitleFormats(title, content, assetInfo, entities, eventType, marketContext, llmGeneratedTitle);
    // Calculate metrics
    const metrics = (0, title_formatter_1.calculateTitleMetrics)(formats.full);
    // Extract entities (asset names, tickers, etc.)
    const extractedEntities = extractEntities(title, content, assetInfo);
    return {
        original: title,
        cleaned: (0, title_formatter_1.formatTitle)(title),
        enhanced: formats.full,
        formats,
        metrics,
        extractedNumbers: entities,
        extractedEntities,
        subEventType: eventType !== 'other' ? eventType : undefined,
        confidence: calculateConfidence(metrics, entities.length, assetInfo !== null),
    };
}
/**
 * Generate multiple title format variants
 */
function generateTitleFormats(title, content, assetInfo, entities, eventType, marketContext, llmGeneratedTitle) {
    const asset = assetInfo?.name || 'Asset';
    const assetSymbol = assetInfo?.symbol || 'ASSET';
    // Get numerical values
    const price = (0, numerical_extractor_1.getPrimaryPrice)(entities);
    const percentage = (0, numerical_extractor_1.getPrimaryPercentage)(entities);
    const amount = (0, numerical_extractor_1.getPrimaryAmount)(entities);
    // Get context
    const reason = extractReason(title) || extractReason(content || '');
    const authority = extractAuthority(title, content);
    const protocol = extractProtocol(title, content);
    // Check trend direction
    const trend = (0, title_formatter_1.detectTrendDirection)(title);
    // Use template-based generation if we have good data
    if (assetInfo && (price || percentage || eventType !== 'other')) {
        const templateVars = (0, title_templates_1.extractTemplateVariables)(asset, assetSymbol, entities, reason || undefined, authority || undefined, protocol || undefined);
        const template = (0, title_templates_1.generateTitleFromTemplate)(eventType, templateVars);
        // Clean up the templates
        return {
            full: cleanGeneratedTitle(template.full, assetInfo),
            medium: cleanGeneratedTitle(template.medium, assetInfo),
            short: cleanGeneratedTitle(template.short, assetInfo),
            ticker: cleanGeneratedTitle(template.ticker, assetInfo),
        };
    }
    // Fallback: enhance original title
    const enhanced = enhanceOriginalTitle(title, assetInfo, percentage, price, amount, reason);
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
    let enhanced = (0, title_formatter_1.formatTitle)(title);
    // Add percentage if missing and present in entities
    if (percentage && !enhanced.includes('%')) {
        const direction = (0, title_formatter_1.detectTrendDirection)(title);
        const sign = direction === 'UP' ? '+' : '-';
        enhanced = `${enhanced} (${sign}${percentage.value}%)`;
    }
    // Add price if available and relevant
    if (price && assetInfo && !enhanced.includes('$')) {
        const trend = (0, title_formatter_1.detectTrendDirection)(title);
        const action = trend === 'UP' ? 'surges' : trend === 'DOWN' ? 'drops' : 'at';
        enhanced = `${assetInfo.symbol} ${action} to ${(0, numerical_extractor_1.formatPrice)(price)}`;
    }
    return enhanced;
}
/**
 * Generate a medium-length title
 */
function generateMediumTitle(title, assetInfo) {
    const action = (0, title_formatter_1.detectActionWord)(title);
    const cleaned = (0, title_formatter_1.formatTitle)(title);
    if (assetInfo && action) {
        return `${assetInfo.symbol} ${action}`;
    }
    if (assetInfo) {
        return `${assetInfo.symbol} update`;
    }
    // Truncate original if too long
    const words = cleaned.split(' ');
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
        const trend = (0, title_formatter_1.detectTrendDirection)(title);
        const sign = trend === 'UP' ? '+' : '-';
        return `${assetInfo.symbol} ${sign}${percentage.value}%`;
    }
    if (assetInfo) {
        return `${assetInfo.symbol} update`;
    }
    const words = (0, title_formatter_1.formatTitle)(title).split(' ');
    return words.slice(0, 4).join(' ');
}
/**
 * Generate a ticker-style title
 */
function generateTickerTitle(assetInfo, percentage) {
    if (!assetInfo)
        return 'NEWS';
    if (percentage) {
        const trend = (0, title_formatter_1.detectTrendDirection)(assetInfo.symbol + ' ' + percentage.value);
        const sign = trend === 'UP' ? '+' : '-';
        return `${assetInfo.symbol} ${sign}${percentage.value}%`;
    }
    return assetInfo.symbol;
}
/**
 * Extract entity names from text
 */
function extractEntities(title, content, assetInfo) {
    const entities = [];
    const text = `${title} ${content}`;
    // Add asset
    if (assetInfo) {
        entities.push(assetInfo.name);
        entities.push(assetInfo.symbol);
    }
    // Extract capitalized phrases (potential entities)
    const capitalizedPhrases = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) || [];
    for (const phrase of capitalizedPhrases) {
        const lower = phrase.toLowerCase();
        // Filter out common words
        if (![
            'the', 'and', 'for', 'with', 'from', 'that', 'this', 'update',
            'news', 'report', 'says', 'according', 'source', 'latest',
        ].includes(lower)) {
            entities.push(phrase);
        }
    }
    return [...new Set(entities)].slice(0, 10);
}
/**
 * Calculate confidence score for the generated title
 */
function calculateConfidence(metrics, entityCount, hasAsset) {
    let confidence = 0.5;
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
    return generateEnhancedTitle({ title });
}
/**
 * Generate title from market data context
 */
function generateTitleWithMarketContext(title, price, priceChange24h, assetSymbol) {
    const marketContext = {
        asset: assetSymbol,
        assetSymbol,
        currentPrice: price,
        priceChange24h,
    };
    return generateEnhancedTitle({ title }, marketContext);
}
/**
 * Score title quality (1-5)
 */
function scoreTitleQuality(title) {
    const metrics = (0, title_formatter_1.calculateTitleMetrics)(title);
    return metrics.qualityScore;
}
//# sourceMappingURL=market-title-generator.js.map