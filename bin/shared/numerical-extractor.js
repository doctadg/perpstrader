"use strict";
// Numerical Entity Extractor
// Extracts prices, percentages, volumes, and other numerical values from text
// Returns structured data for title generation
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractNumericalEntities = extractNumericalEntities;
exports.getPrimaryPrice = getPrimaryPrice;
exports.getPrimaryPercentage = getPrimaryPercentage;
exports.getPrimaryVolume = getPrimaryVolume;
exports.getPrimaryAmount = getPrimaryAmount;
exports.formatPrice = formatPrice;
exports.formatPercentage = formatPercentage;
exports.formatLargeAmount = formatLargeAmount;
// ============================================================================
// PATTERNS FOR NUMERICAL ENTITY EXTRACTION
// ============================================================================
// Price patterns: $98,500, 98500 USD, €50.000, etc.
const PRICE_PATTERNS = [
    // $98,500 or $98,500.00
    {
        regex: /\$\s*([1-9]\d{0,2}(?:,\d{3})*(?:\.\d+)?|\d+\.\d{2})/gi,
        type: 'price',
        currency: 'USD',
    },
    // 98,500 USD or 98500 USD
    {
        regex: /([1-9]\d{0,2}(?:,\d{3})*(?:\.\d+)?)\s*(?:USD|dollars?|usd)/gi,
        type: 'price',
        currency: 'USD',
    },
    // €98,500 or 98,500 EUR
    {
        regex: /(?:€|EUR)\s*([1-9]\d{0,2}(?:,\d{3})*(?:\.\d+)?)/gi,
        type: 'price',
        currency: 'EUR',
    },
    {
        regex: /([1-9]\d{0,2}(?:,\d{3})*(?:\.\d+)?)\s*(?:EUR|euros?)/gi,
        type: 'price',
        currency: 'EUR',
    },
    // BTC prices: 0.5 BTC, 1.25 BTC
    {
        regex: /(\d+\.?\d*)\s*(?:BTC|bitcoin|bitcoins)/gi,
        type: 'price',
        currency: 'BTC',
    },
    // ETH prices: 5 ETH, 10.5 ETH
    {
        regex: /(\d+\.?\d*)\s*(?:ETH|ethereum)/gi,
        type: 'price',
        currency: 'ETH',
    },
];
// Percentage patterns: 8%, 8.5%, down 8%, up 12.3%
const PERCENTAGE_PATTERNS = [
    {
        regex: /(\d+\.?\d*)%/g,
        type: 'percentage',
    },
    {
        regex: /(?:up|down|rise|rose|fall|fell|drop|dropped|gain|gained|loss|lost|surge|plunge|increase|decrease|jump|climb|slide)s?\s+(?:by\s+)?(\d+\.?\d*)%/gi,
        type: 'percentage',
    },
];
// Volume patterns: $2.1B, $500M, 1.2B volume
const VOLUME_PATTERNS = [
    // $2.1B, $500M
    {
        regex: /\$\s*([\d.]+)\s*([BMK]|billion|million|thousand)/gi,
        type: 'volume',
    },
    // 2.1B volume, 500M trading volume
    {
        regex: /([\d.]+)\s*([BMK]|billion|million|thousand)\s*(?:volume|trading)/gi,
        type: 'volume',
    },
];
// Amount patterns (for hacks, thefts, etc.): $50M stolen, 1000 BTC drained
const AMOUNT_PATTERNS = [
    {
        regex: /\$\s*([\d.]+)\s*([BMK]|billion|million)/gi,
        type: 'amount',
    },
    {
        regex: /(\d+\.?\d*)\s*(?:BTC|ETH)\s*(?:stolen|drained|lost|hacked|exploited)/gi,
        type: 'amount',
    },
];
// Index patterns: S&P 500, Dow Jones, Nasdaq at specific levels
const INDEX_PATTERNS = [
    {
        regex: /(?:S&P\s*500|SPX)\s*(?:at\s*)?(\d{4,5})/gi,
        type: 'index',
    },
    {
        regex: /(?:Dow|Dow\s*Jones)\s*(?:at\s*)?(\d{4,5})/gi,
        type: 'index',
    },
    {
        regex: /(?:Nasdaq|NDX)\s*(?:at\s*)?(\d{4,5})/gi,
        type: 'index',
    },
];
// Rate patterns: interest rates, yields, etc.
const RATE_PATTERNS = [
    {
        regex: /(?:interest\s*rate|yield|rate)\s*(?:of\s*)?(\d+\.?\d*)%/gi,
        type: 'rate',
    },
    {
        regex: /(\d+\.?\d*)%\s*(?:interest\s*rate|yield)/gi,
        type: 'rate',
    },
];
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Parse a number string with optional thousand separators and decimals
 */
function parseNumberString(numStr) {
    // Remove thousand separators (commas)
    const cleaned = numStr.replace(/,/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}
/**
 * Convert multiplier suffix to numeric value
 */
function multiplyBySuffix(value, suffix) {
    const s = suffix.toUpperCase();
    if (s === 'B' || s === 'BILLION')
        return value * 1_000_000_000;
    if (s === 'M' || s === 'MILLION')
        return value * 1_000_000;
    if (s === 'K' || s === 'THOUSAND')
        return value * 1_000;
    return value;
}
/**
 * Get surrounding context for a match
 */
function getContext(text, match, window = 30) {
    const index = text.toLowerCase().indexOf(match.toLowerCase());
    if (index === -1)
        return '';
    const start = Math.max(0, index - window);
    const end = Math.min(text.length, index + match.length + window);
    return text.slice(start, end).trim();
}
// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================
/**
 * Extract all numerical entities from text
 */
function extractNumericalEntities(text) {
    const entities = [];
    const seen = new Set();
    // Helper to add entity if not duplicate
    const addEntity = (entity) => {
        const key = `${entity.type}-${entity.value}-${entity.originalString}`;
        if (!seen.has(key)) {
            seen.add(key);
            entities.push(entity);
        }
    };
    // Extract prices
    for (const pattern of PRICE_PATTERNS) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
            const numStr = match[1] || match[0];
            const value = parseNumberString(numStr);
            if (value > 0) {
                addEntity({
                    type: pattern.type,
                    value,
                    originalString: match[0],
                    currency: pattern.currency,
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract percentages
    for (const pattern of PERCENTAGE_PATTERNS) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
            // For percentage patterns with direction, the number might be in a different capture group
            const numStr = match[1] || match[2] || match[0].replace(/[^0-9.]/g, '');
            const value = parseNumberString(numStr);
            if (value > 0 && value <= 100) { // Percentages should be 0-100
                addEntity({
                    type: pattern.type,
                    value,
                    originalString: match[0],
                    unit: '%',
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract volumes
    for (const pattern of VOLUME_PATTERNS) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
            const numStr = match[1] || match[0].replace(/[^0-9.]/g, '');
            const suffix = match[2] || '';
            const baseValue = parseNumberString(numStr);
            const value = multiplyBySuffix(baseValue, suffix);
            if (value > 0) {
                addEntity({
                    type: pattern.type,
                    value,
                    originalString: match[0],
                    unit: suffix.toUpperCase(),
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract amounts
    for (const pattern of AMOUNT_PATTERNS) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
            const numStr = match[1] || match[0].replace(/[^0-9.]/g, '');
            const suffix = match[2] || '';
            const baseValue = parseNumberString(numStr);
            const value = multiplyBySuffix(baseValue, suffix);
            if (value > 0) {
                addEntity({
                    type: pattern.type,
                    value,
                    originalString: match[0],
                    unit: suffix.toUpperCase(),
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract index values
    for (const pattern of INDEX_PATTERNS) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
            const numStr = match[1] || match[0].replace(/[^0-9]/g, '');
            const value = parseNumberString(numStr);
            if (value > 0) {
                addEntity({
                    type: pattern.type,
                    value,
                    originalString: match[0],
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract rates
    for (const pattern of RATE_PATTERNS) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
            const numStr = match[1] || match[0].replace(/[^0-9.]/g, '');
            const value = parseNumberString(numStr);
            if (value > 0 && value <= 20) { // Reasonable rate range
                addEntity({
                    type: pattern.type,
                    value,
                    originalString: match[0],
                    unit: '%',
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    return entities;
}
/**
 * Get the most relevant price entity from a list
 * Prefers USD prices, then crypto prices, then others
 */
function getPrimaryPrice(entities) {
    const prices = entities.filter(e => e.type === 'price');
    if (prices.length === 0)
        return null;
    // Prefer USD prices
    const usdPrice = prices.find(e => e.currency === 'USD');
    if (usdPrice)
        return usdPrice;
    // Then crypto prices
    const cryptoPrice = prices.find(e => e.currency === 'BTC' || e.currency === 'ETH');
    if (cryptoPrice)
        return cryptoPrice;
    return prices[0];
}
/**
 * Get the most relevant percentage entity
 * Prefers percentages that seem to be price changes
 */
function getPrimaryPercentage(entities) {
    const percs = entities.filter(e => e.type === 'percentage');
    if (percs.length === 0)
        return null;
    // Prefer percentages with movement context (surge, plunge, etc.)
    const movementPerc = percs.find(e => e.context && /(surge|plunge|jump|drop|rise|fall|gain|loss)/i.test(e.context));
    if (movementPerc)
        return movementPerc;
    return percs[0];
}
/**
 * Get the most relevant volume entity
 */
function getPrimaryVolume(entities) {
    const volumes = entities.filter(e => e.type === 'volume');
    return volumes.length > 0 ? volumes[0] : null;
}
/**
 * Get the most relevant amount entity (for hacks, etc.)
 */
function getPrimaryAmount(entities) {
    const amounts = entities.filter(e => e.type === 'amount');
    return amounts.length > 0 ? amounts[0] : null;
}
/**
 * Format a price for display in titles
 */
function formatPrice(price) {
    const { value, currency } = price;
    // Format based on magnitude
    if (currency === 'USD' || currency === 'EUR') {
        if (value >= 1000) {
            return `${currency} ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        }
        else if (value >= 1) {
            return `${currency} ${value.toFixed(2)}`;
        }
        else {
            return `${currency} ${value.toFixed(4)}`;
        }
    }
    // Crypto prices
    if (currency === 'BTC' || currency === 'ETH') {
        return `${value.toFixed(4)} ${currency}`;
    }
    return `${currency} ${value.toLocaleString()}`;
}
/**
 * Format a percentage for display in titles
 */
function formatPercentage(percentage) {
    return `${percentage.value}%`;
}
/**
 * Format a volume or amount for display in titles
 */
function formatLargeAmount(entity) {
    const { value, unit, currency } = entity;
    if (currency) {
        return `$${formatMagnitude(value)}`;
    }
    if (unit) {
        return `$${entity.value}${unit}`;
    }
    return `$${formatMagnitude(value)}`;
}
/**
 * Format large numbers with magnitude suffix
 */
function formatMagnitude(value) {
    if (value >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(1)}B`;
    }
    else if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
    }
    else if (value >= 1_000) {
        return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toString();
}
//# sourceMappingURL=numerical-extractor.js.map