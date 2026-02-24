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
var PRICE_PATTERNS = [
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
var PERCENTAGE_PATTERNS = [
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
var VOLUME_PATTERNS = [
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
var AMOUNT_PATTERNS = [
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
var INDEX_PATTERNS = [
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
var RATE_PATTERNS = [
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
    var cleaned = numStr.replace(/,/g, '');
    var parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}
/**
 * Convert multiplier suffix to numeric value
 */
function multiplyBySuffix(value, suffix) {
    var s = suffix.toUpperCase();
    if (s === 'B' || s === 'BILLION')
        return value * 1000000000;
    if (s === 'M' || s === 'MILLION')
        return value * 1000000;
    if (s === 'K' || s === 'THOUSAND')
        return value * 1000;
    return value;
}
/**
 * Get surrounding context for a match
 */
function getContext(text, match, window) {
    if (window === void 0) { window = 30; }
    var index = text.toLowerCase().indexOf(match.toLowerCase());
    if (index === -1)
        return '';
    var start = Math.max(0, index - window);
    var end = Math.min(text.length, index + match.length + window);
    return text.slice(start, end).trim();
}
// ============================================================================
// MAIN EXTRACTION FUNCTION
// ============================================================================
/**
 * Extract all numerical entities from text
 */
function extractNumericalEntities(text) {
    var entities = [];
    var seen = new Set();
    // Helper to add entity if not duplicate
    var addEntity = function (entity) {
        var key = "".concat(entity.type, "-").concat(entity.value, "-").concat(entity.originalString);
        if (!seen.has(key)) {
            seen.add(key);
            entities.push(entity);
        }
    };
    // Extract prices
    for (var _i = 0, PRICE_PATTERNS_1 = PRICE_PATTERNS; _i < PRICE_PATTERNS_1.length; _i++) {
        var pattern = PRICE_PATTERNS_1[_i];
        var matches = text.matchAll(pattern.regex);
        for (var _a = 0, matches_1 = matches; _a < matches_1.length; _a++) {
            var match = matches_1[_a];
            var numStr = match[1] || match[0];
            var value = parseNumberString(numStr);
            if (value > 0) {
                addEntity({
                    type: pattern.type,
                    value: value,
                    originalString: match[0],
                    currency: pattern.currency,
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract percentages
    for (var _b = 0, PERCENTAGE_PATTERNS_1 = PERCENTAGE_PATTERNS; _b < PERCENTAGE_PATTERNS_1.length; _b++) {
        var pattern = PERCENTAGE_PATTERNS_1[_b];
        var matches = text.matchAll(pattern.regex);
        for (var _c = 0, matches_2 = matches; _c < matches_2.length; _c++) {
            var match = matches_2[_c];
            // For percentage patterns with direction, the number might be in a different capture group
            var numStr = match[1] || match[2] || match[0].replace(/[^0-9.]/g, '');
            var value = parseNumberString(numStr);
            if (value > 0 && value <= 100) { // Percentages should be 0-100
                addEntity({
                    type: pattern.type,
                    value: value,
                    originalString: match[0],
                    unit: '%',
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract volumes
    for (var _d = 0, VOLUME_PATTERNS_1 = VOLUME_PATTERNS; _d < VOLUME_PATTERNS_1.length; _d++) {
        var pattern = VOLUME_PATTERNS_1[_d];
        var matches = text.matchAll(pattern.regex);
        for (var _e = 0, matches_3 = matches; _e < matches_3.length; _e++) {
            var match = matches_3[_e];
            var numStr = match[1] || match[0].replace(/[^0-9.]/g, '');
            var suffix = match[2] || '';
            var baseValue = parseNumberString(numStr);
            var value = multiplyBySuffix(baseValue, suffix);
            if (value > 0) {
                addEntity({
                    type: pattern.type,
                    value: value,
                    originalString: match[0],
                    unit: suffix.toUpperCase(),
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract amounts
    for (var _f = 0, AMOUNT_PATTERNS_1 = AMOUNT_PATTERNS; _f < AMOUNT_PATTERNS_1.length; _f++) {
        var pattern = AMOUNT_PATTERNS_1[_f];
        var matches = text.matchAll(pattern.regex);
        for (var _g = 0, matches_4 = matches; _g < matches_4.length; _g++) {
            var match = matches_4[_g];
            var numStr = match[1] || match[0].replace(/[^0-9.]/g, '');
            var suffix = match[2] || '';
            var baseValue = parseNumberString(numStr);
            var value = multiplyBySuffix(baseValue, suffix);
            if (value > 0) {
                addEntity({
                    type: pattern.type,
                    value: value,
                    originalString: match[0],
                    unit: suffix.toUpperCase(),
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract index values
    for (var _h = 0, INDEX_PATTERNS_1 = INDEX_PATTERNS; _h < INDEX_PATTERNS_1.length; _h++) {
        var pattern = INDEX_PATTERNS_1[_h];
        var matches = text.matchAll(pattern.regex);
        for (var _j = 0, matches_5 = matches; _j < matches_5.length; _j++) {
            var match = matches_5[_j];
            var numStr = match[1] || match[0].replace(/[^0-9]/g, '');
            var value = parseNumberString(numStr);
            if (value > 0) {
                addEntity({
                    type: pattern.type,
                    value: value,
                    originalString: match[0],
                    context: getContext(text, match[0]),
                });
            }
        }
    }
    // Extract rates
    for (var _k = 0, RATE_PATTERNS_1 = RATE_PATTERNS; _k < RATE_PATTERNS_1.length; _k++) {
        var pattern = RATE_PATTERNS_1[_k];
        var matches = text.matchAll(pattern.regex);
        for (var _l = 0, matches_6 = matches; _l < matches_6.length; _l++) {
            var match = matches_6[_l];
            var numStr = match[1] || match[0].replace(/[^0-9.]/g, '');
            var value = parseNumberString(numStr);
            if (value > 0 && value <= 20) { // Reasonable rate range
                addEntity({
                    type: pattern.type,
                    value: value,
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
    var prices = entities.filter(function (e) { return e.type === 'price'; });
    if (prices.length === 0)
        return null;
    // Prefer USD prices
    var usdPrice = prices.find(function (e) { return e.currency === 'USD'; });
    if (usdPrice)
        return usdPrice;
    // Then crypto prices
    var cryptoPrice = prices.find(function (e) { return e.currency === 'BTC' || e.currency === 'ETH'; });
    if (cryptoPrice)
        return cryptoPrice;
    return prices[0];
}
/**
 * Get the most relevant percentage entity
 * Prefers percentages that seem to be price changes
 */
function getPrimaryPercentage(entities) {
    var percs = entities.filter(function (e) { return e.type === 'percentage'; });
    if (percs.length === 0)
        return null;
    // Prefer percentages with movement context (surge, plunge, etc.)
    var movementPerc = percs.find(function (e) {
        return e.context && /(surge|plunge|jump|drop|rise|fall|gain|loss)/i.test(e.context);
    });
    if (movementPerc)
        return movementPerc;
    return percs[0];
}
/**
 * Get the most relevant volume entity
 */
function getPrimaryVolume(entities) {
    var volumes = entities.filter(function (e) { return e.type === 'volume'; });
    return volumes.length > 0 ? volumes[0] : null;
}
/**
 * Get the most relevant amount entity (for hacks, etc.)
 */
function getPrimaryAmount(entities) {
    var amounts = entities.filter(function (e) { return e.type === 'amount'; });
    return amounts.length > 0 ? amounts[0] : null;
}
/**
 * Format a price for display in titles
 */
function formatPrice(price) {
    var value = price.value, currency = price.currency;
    // Format based on magnitude
    if (currency === 'USD' || currency === 'EUR') {
        if (value >= 1000) {
            return "".concat(currency, " ").concat(value.toLocaleString('en-US', { maximumFractionDigits: 0 }));
        }
        else if (value >= 1) {
            return "".concat(currency, " ").concat(value.toFixed(2));
        }
        else {
            return "".concat(currency, " ").concat(value.toFixed(4));
        }
    }
    // Crypto prices
    if (currency === 'BTC' || currency === 'ETH') {
        return "".concat(value.toFixed(4), " ").concat(currency);
    }
    return "".concat(currency, " ").concat(value.toLocaleString());
}
/**
 * Format a percentage for display in titles
 */
function formatPercentage(percentage) {
    return "".concat(percentage.value, "%");
}
/**
 * Format a volume or amount for display in titles
 */
function formatLargeAmount(entity) {
    var value = entity.value, unit = entity.unit, currency = entity.currency;
    if (currency) {
        return "$".concat(formatMagnitude(value));
    }
    if (unit) {
        return "$".concat(entity.value).concat(unit);
    }
    return "$".concat(formatMagnitude(value));
}
/**
 * Format large numbers with magnitude suffix
 */
function formatMagnitude(value) {
    if (value >= 1000000000) {
        return "".concat((value / 1000000000).toFixed(1), "B");
    }
    else if (value >= 1000000) {
        return "".concat((value / 1000000).toFixed(1), "M");
    }
    else if (value >= 1000) {
        return "".concat((value / 1000).toFixed(1), "K");
    }
    return value.toString();
}
