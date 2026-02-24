"use strict";
// Title Formatter
// Consistent formatting, capitalization, and normalization for titles
// Ensures all titles follow the same style guidelines
Object.defineProperty(exports, "__esModule", { value: true });
exports.toTitleCase = toTitleCase;
exports.capitalizeFirst = capitalizeFirst;
exports.toSentenceCase = toSentenceCase;
exports.normalizeTicker = normalizeTicker;
exports.normalizeAssetName = normalizeAssetName;
exports.getAssetTicker = getAssetTicker;
exports.normalizePunctuation = normalizePunctuation;
exports.removeTrailingAttribution = removeTrailingAttribution;
exports.formatTitle = formatTitle;
exports.calculateTitleMetrics = calculateTitleMetrics;
exports.getTitleQualityLabel = getTitleQualityLabel;
exports.detectActionWord = detectActionWord;
exports.detectTrendDirection = detectTrendDirection;
exports.detectEventType = detectEventType;
// ============================================================================
// COMMON WORDS THAT SHOULD BE LOWERCASE IN TITLE CASE
// ============================================================================
var TITLE_CASE_SMALL_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'so', 'yet',
    'at', 'by', 'in', 'of', 'on', 'to', 'up', 'from', 'with', 'as',
    'into', 'onto', 'upon', 'over', 'under', 'out', 'off', 'via',
]);
// Common acronyms that should always be uppercase
var COMMON_ACRONYMS = new Set([
    'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK',
    'MATIC', 'POL', 'ARB', 'OP', 'LTC', 'BCH', 'ETC', 'TRX', 'TON', 'ATOM',
    'NEAR', 'APT', 'SUI', 'ICP', 'FIL', 'INJ', 'RNDR', 'RUNE', 'UNI', 'AAVE',
    'MKR', 'SNX', 'LDO', 'JUP', 'TIA', 'FTM', 'PEPE', 'SHIB', 'USDT', 'USDC',
    'DAI', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'US', 'UK', 'EU', 'FDA', 'SEC',
    'ETF', 'IPO', 'CEO', 'CFO', 'CTO', 'COO', 'CPI', 'GDP', 'Fed', 'OPEC',
    'NFT', 'DAO', 'DeFi', 'TVL', 'APY', 'ATH', 'ATM', 'HODL', 'FOMO', 'FUD',
    'WSB', 'DXY', 'SPX', 'NDX', 'DJIA', 'VIX', 'ECB', 'BOJ', 'FOMC', 'BTFD',
    'KYC', 'AML', '2FA', 'MFA', 'API', 'SDK', 'UI', 'UX', 'AI', 'ML', 'NLP',
]);
// Asset names and their preferred ticker symbols
var ASSET_TICKERS = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'solana': 'SOL',
    'ripple': 'XRP',
    'cardano': 'ADA',
    'polkadot': 'DOT',
    'dogecoin': 'DOGE',
    'avalanche': 'AVAX',
    'chainlink': 'LINK',
    'polygon': 'MATIC',
    'bnb': 'BNB',
    'binance coin': 'BNB',
    'litecoin': 'LTC',
    'uniswap': 'UNI',
    'aave': 'AAVE',
    'maker': 'MKR',
    'synthetix': 'SNX',
    'arbitrum': 'ARB',
    'optimism': 'OP',
};
// ============================================================================
// CAPITALIZATION FUNCTIONS
// ============================================================================
/**
 * Convert a string to Title Case (smart capitalization)
 * - First word always capitalized
 * - Last word always capitalized
 * - Small words lowercase unless first/last
 * - Acronyms always uppercase
 * - Numbers preserved
 */
function toTitleCase(str) {
    if (!str)
        return '';
    var words = str.split(/\s+/);
    var result = [];
    for (var i = 0; i < words.length; i++) {
        var word = words[i];
        if (!word)
            continue;
        // Check if it's an acronym
        var upperWord = word.toUpperCase();
        if (COMMON_ACRONYMS.has(upperWord) || /^\d+%?$/.test(word)) {
            result.push(upperWord);
            continue;
        }
        // First and last words always capitalized
        if (i === 0 || i === words.length - 1) {
            result.push(capitalizeFirst(word));
            continue;
        }
        // Small words lowercase
        var lowerWord = word.toLowerCase();
        if (TITLE_CASE_SMALL_WORDS.has(lowerWord)) {
            result.push(lowerWord);
            continue;
        }
        // Everything else capitalized
        result.push(capitalizeFirst(word));
    }
    return result.join(' ');
}
/**
 * Capitalize only the first letter of a word
 */
function capitalizeFirst(word) {
    if (!word)
        return '';
    if (word.length === 1)
        return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
/**
 * Convert to sentence case (only first word capitalized)
 */
function toSentenceCase(str) {
    if (!str)
        return '';
    var words = str.toLowerCase().split(/\s+/);
    if (words.length === 0)
        return '';
    // Capitalize first word
    words[0] = capitalizeFirst(words[0]);
    // Keep acronyms uppercase
    for (var i = 0; i < words.length; i++) {
        var upperWord = words[i].toUpperCase();
        if (COMMON_ACRONYMS.has(upperWord)) {
            words[i] = upperWord;
        }
    }
    return words.join(' ');
}
/**
 * Convert ticker symbols to uppercase consistently
 */
function normalizeTicker(ticker) {
    if (!ticker)
        return '';
    return ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
// ============================================================================
// ASSET NAME NORMALIZATION
// ============================================================================
/**
 * Normalize asset names to use preferred format
 * - Returns ticker symbol if known asset
 * - Otherwise returns title case name
 */
function normalizeAssetName(name) {
    if (!name)
        return '';
    var lowerName = name.toLowerCase().trim();
    // Check if it's already a ticker
    if (/^[A-Z]{2,6}$/.test(name)) {
        return name.toUpperCase();
    }
    // Check against known assets
    for (var _i = 0, _a = Object.entries(ASSET_TICKERS); _i < _a.length; _i++) {
        var _b = _a[_i], assetName = _b[0], ticker = _b[1];
        if (lowerName.includes(assetName) || assetName.includes(lowerName)) {
            return ticker;
        }
    }
    // Return title case
    return toTitleCase(name);
}
/**
 * Get the ticker symbol for an asset name
 */
function getAssetTicker(name) {
    if (!name)
        return '';
    var lowerName = name.toLowerCase().trim();
    // Direct lookup
    if (ASSET_TICKERS[lowerName]) {
        return ASSET_TICKERS[lowerName];
    }
    // Partial match
    for (var _i = 0, _a = Object.entries(ASSET_TICKERS); _i < _a.length; _i++) {
        var _b = _a[_i], assetName = _b[0], ticker = _b[1];
        if (lowerName.includes(assetName)) {
            return ticker;
        }
    }
    // If already in ticker format, return as-is
    if (/^[A-Z]{2,6}$/.test(name)) {
        return name.toUpperCase();
    }
    // Generate ticker from first letters of words (up to 4 chars)
    var words = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
    if (words.length >= 2) {
        return words.slice(0, 4).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    }
    return name.toUpperCase().slice(0, 6);
}
// ============================================================================
// TITLE CLEANING AND NORMALIZATION
// ============================================================================
/**
 * Remove excessive punctuation from title
 */
function normalizePunctuation(title) {
    return title
        .replace(/!{2,}/g, '!') // Multiple ! -> single !
        .replace(/\?{2,}/g, '?') // Multiple ? -> single ?
        .replace(/\.+/g, '.') // Multiple . -> single .
        .replace(/['"]{2,}/g, '"') // Multiple quotes -> single
        .replace(/\s+[,-:]\s+/g, ' ') // Remove separators with spaces
        .replace(/\s+[-–—]\s+/g, ' - ') // Normalize em/en dashes
        .trim();
}
/**
 * Remove trailing source names or attribution
 */
function removeTrailingAttribution(title) {
    return title
        .replace(/\s[-–—]\s*(Source|Author|Via|From).*$/i, '')
        .replace(/\s[-–—]\s*\w+$/g, '') // Remove trailing "- Word"
        .replace(/\s\|\s*\w+$/g, '') // Remove trailing "| Source"
        .trim();
}
/**
 * Standardize title formatting
 * - Consistent capitalization
 * - Normalized punctuation
 * - Cleaned attribution
 * - Tickers uppercase
 */
function formatTitle(title) {
    if (!title)
        return '';
    var formatted = title;
    // Remove trailing attribution
    formatted = removeTrailingAttribution(formatted);
    // Normalize punctuation
    formatted = normalizePunctuation(formatted);
    // Convert to title case
    formatted = toTitleCase(formatted);
    // Ensure tickers are uppercase
    formatted = formatted.replace(/\b(Btc|Eth|Sol|Xrp|Bnb|Doge|Ada|Avax|Dot|Link|Matic|Pol|Arb|Op)\b/g, function (match) { return match.toUpperCase(); });
    return formatted.trim();
}
// ============================================================================
// TITLE QUALITY METRICS
// ============================================================================
/**
 * Calculate quality metrics for a title
 */
function calculateTitleMetrics(title) {
    var lowerTitle = title.toLowerCase();
    var words = title.split(/\s+/).filter(function (w) { return w.length > 0; });
    // Check for asset/ticker presence
    var knownAssets = Object.keys(ASSET_TICKERS);
    var knownTickers = Object.values(ASSET_TICKERS);
    var hasAsset = knownAssets.some(function (a) { return lowerTitle.includes(a); }) ||
        knownTickers.some(function (t) { return title.includes(t); });
    // Check for action verbs
    var actionVerbs = [
        'surge', 'plunge', 'drop', 'rise', 'fall', 'jump', 'climb', 'slide',
        'hack', 'exploit', 'breach', 'steal', 'lose', 'gain', 'earn', 'beat',
        'approve', 'reject', 'ban', 'launch', 'release', 'announce', 'report',
        'merge', 'acquire', 'partner', 'list', 'delist', 'seize', 'sanction',
    ];
    var hasAction = actionVerbs.some(function (v) { return lowerTitle.includes(v); });
    // Check for numbers (prices, percentages)
    var hasNumber = /\d+/.test(title) && /[$%]/.test(title);
    // Check for reason/context (has prepositions like "on", "after", "due to")
    var hasReason = /\b(on|after|due to|following|amid|over|as|because)\b/i.test(title);
    // Calculate quality score (0-5)
    var score = 0;
    if (hasAsset)
        score += 1;
    if (hasAction)
        score += 1;
    if (hasNumber)
        score += 1;
    if (hasReason)
        score += 1;
    if (words.length >= 4 && words.length <= 12)
        score += 1;
    return {
        hasAsset: hasAsset,
        hasAction: hasAction,
        hasNumber: hasNumber,
        hasReason: hasReason,
        wordCount: words.length,
        qualityScore: score,
    };
}
/**
 * Get a quality label for a title
 */
function getTitleQualityLabel(metrics) {
    var score = metrics.qualityScore;
    if (score === 5)
        return 'Excellent';
    if (score === 4)
        return 'Good';
    if (score === 3)
        return 'Acceptable';
    if (score === 2)
        return 'Poor';
    return 'Bad';
}
// ============================================================================
// ACTION WORD DETECTION
// ============================================================================
/**
 * Detect the primary action word in a title
 */
function detectActionWord(title) {
    var lowerTitle = title.toLowerCase();
    var actions = [
        [/\bsurge[sd]?\b/i, 'surges'],
        [/\bplunge[sd]?\b/i, 'plunges'],
        [/\bjump[sd]?\b/i, 'jumps'],
        [/\bdrop[sd]?\b/i, 'drops'],
        [/\bclimb[sd]?\b/i, 'climbs'],
        [/\bslide[sd]?\b/i, 'slides'],
        [/\bfall[s]?\b/i, 'falls'],
        [/\brise[s]?\b/i, 'rises'],
        [/\bgain[sd]?\b/i, 'gains'],
        [/\blose[s|d]?\b/i, 'loses'],
        [/\bhack(?:ed|s)?\b/i, 'hacked'],
        [/\bexploit(?:ed|s)?\b/i, 'exploited'],
        [/\bapprov(?:e|es|ed|al)\b/i, 'approves'],
        [/\breject(?:ed|s)?\b/i, 'rejects'],
        [/\blaunch(?:es|ed)?\b/i, 'launches'],
        [/\bban(?:ned|s)?\b/i, 'bans'],
        [/\blist(?:ed|s)?\b/i, 'lists'],
        [/\bdelist(?:ed|s)?\b/i, 'delists'],
        [/\bseiz(?:e|es|ed|ing)\b/i, 'seizes'],
        [/\bsanction(?:ed|s)?\b/i, 'sanctions'],
    ];
    for (var _i = 0, actions_1 = actions; _i < actions_1.length; _i++) {
        var _a = actions_1[_i], pattern = _a[0], action = _a[1];
        if (pattern.test(title)) {
            return action;
        }
    }
    return null;
}
// ============================================================================
// TREND DIRECTION DETECTION
// ============================================================================
/**
 * Detect if a title suggests upward or downward movement
 */
function detectTrendDirection(title) {
    var lowerTitle = title.toLowerCase();
    var upWords = [
        'surge', 'rally', 'jump', 'gain', 'rise', 'climb', 'soar', 'surge',
        'breakout', 'approve', 'launch', 'list', 'partner', 'beat', 'win',
    ];
    var downWords = [
        'plunge', 'drop', 'fall', 'slide', 'decline', 'crash', 'collapse',
        'hack', 'exploit', 'reject', 'ban', 'delist', 'sanction', 'seize', 'lose',
    ];
    var upCount = upWords.filter(function (w) { return lowerTitle.includes(w); }).length;
    var downCount = downWords.filter(function (w) { return lowerTitle.includes(w); }).length;
    if (upCount > downCount)
        return 'UP';
    if (downCount > upCount)
        return 'DOWN';
    return 'NEUTRAL';
}
// ============================================================================
// EVENT TYPE DETECTION FROM TITLE
// ============================================================================
/**
 * Detect sub-event type from title text
 */
function detectEventType(title) {
    var lowerTitle = title.toLowerCase();
    var patterns = {
        seizure: [/seiz/i, /seiz/i, /raid/i, /captur/i, /takeover/i],
        approval: [/approv/i, /clearance/i, /authorization/i, /greenlight/i, /permit/i],
        launch: [/launch/i, /debut/i, /unveil/i, /rollout/i, /introduc/i, /start/i],
        hack: [/hack/i, /exploit/i, /breach/i, /vulnerabilit/i, /compromis/i, /drain/i],
        sanction: [/sanction/i, /embargo/i, /ban/i, /blacklist/i, /restrict/i],
        earnings: [/earnings/i, /results/i, /profit/i, /revenue/i, /guidance/i, /beat/i, /miss/i],
        price_surge: [/surge/i, /soar/i, /rally/i, /jumps/i, /breaks/i, /breakout/i, /rall/i, /gain/i],
        price_drop: [/plunge/i, /crash/i, /drop/i, /fall/i, /decline/i, /sink/i, /tumble/i, /slump/i, /lose/i],
        breakout: [/breakout/i, /breaks through/i],
        partnership: [/partnership/i, /partner/i, /collaboration/i, /alliance/i, /integrat/i, /teammate/i],
        listing: [/list/i, /listed/i, /listing/i, /exchange/i, /trading/i, /debut/i],
        delisting: [/delist/i, /delisting/i, /suspend/i, /suspended/i, /removed/i],
        merger: [/merger/i, /merge/i, /buyout/i],
        acquisition: [/acquire/i, /acquisition/i, /buys/i, /takeover/i],
        proposal: [/propos/i, /plan/i, /bill/i],
        ruling: [/ruling/i, /court/i, /judge/i, /decision/i, /verdict/i, /order/i],
        protest: [/protest/i, /demonstrat/i, /march/i],
        conflict: [/conflict/i, /war/i, /tension/i, /clash/i],
        governance: [/governanc/i, /dao/i, /vote/i, /proposal/i],
        stablecoin_peg: [/depeg/i, /peg/i, /stablecoin/i],
        liquidation_cascade: [/cascade/i, /liquidat/i, /wiped/i, /mass/i],
        oracle_exploit: [/oracle/i, /price feed/i, /manipulat/i],
        bridge_exploit: [/bridge/i, /cross.?chain/i, /wormhole/i],
        smart_contract: [/smart contract/i, /vulnerabilit/i, /bug/i, /code/i],
        whale_alert: [/whale/i, /large.*transfer/i, /moved/i],
        etf_flow: [/etf.*flow/i, /inflow/i, /outflow/i, /etf/i],
        regulation: [/regulation/i, /regulator/i, /sec/i, /cfi?c/i, /rule/i, /guideline/i],
        other: [],
    };
    for (var _i = 0, _a = Object.entries(patterns); _i < _a.length; _i++) {
        var _b = _a[_i], eventType = _b[0], regexes = _b[1];
        for (var _c = 0, regexes_1 = regexes; _c < regexes_1.length; _c++) {
            var regex = regexes_1[_c];
            if (regex.test(lowerTitle)) {
                return eventType;
            }
        }
    }
    return 'other';
}
