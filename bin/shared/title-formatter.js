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
const TITLE_CASE_SMALL_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'so', 'yet',
    'at', 'by', 'in', 'of', 'on', 'to', 'up', 'from', 'with', 'as',
    'into', 'onto', 'upon', 'over', 'under', 'out', 'off', 'via',
]);
// Common acronyms that should always be uppercase
const COMMON_ACRONYMS = new Set([
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
const ASSET_TICKERS = {
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
    const words = str.split(/\s+/);
    const result = [];
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (!word)
            continue;
        // Check if it's an acronym
        const upperWord = word.toUpperCase();
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
        const lowerWord = word.toLowerCase();
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
    const words = str.toLowerCase().split(/\s+/);
    if (words.length === 0)
        return '';
    // Capitalize first word
    words[0] = capitalizeFirst(words[0]);
    // Keep acronyms uppercase
    for (let i = 0; i < words.length; i++) {
        const upperWord = words[i].toUpperCase();
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
    const lowerName = name.toLowerCase().trim();
    // Check if it's already a ticker
    if (/^[A-Z]{2,6}$/.test(name)) {
        return name.toUpperCase();
    }
    // Check against known assets
    for (const [assetName, ticker] of Object.entries(ASSET_TICKERS)) {
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
    const lowerName = name.toLowerCase().trim();
    // Direct lookup
    if (ASSET_TICKERS[lowerName]) {
        return ASSET_TICKERS[lowerName];
    }
    // Partial match
    for (const [assetName, ticker] of Object.entries(ASSET_TICKERS)) {
        if (lowerName.includes(assetName)) {
            return ticker;
        }
    }
    // If already in ticker format, return as-is
    if (/^[A-Z]{2,6}$/.test(name)) {
        return name.toUpperCase();
    }
    // Generate ticker from first letters of words (up to 4 chars)
    const words = name.replace(/[^a-zA-Z\s]/g, '').trim().split(/\s+/);
    if (words.length >= 2) {
        return words.slice(0, 4).map(w => w.charAt(0).toUpperCase()).join('');
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
    let formatted = title;
    // Remove trailing attribution
    formatted = removeTrailingAttribution(formatted);
    // Normalize punctuation
    formatted = normalizePunctuation(formatted);
    // Convert to title case
    formatted = toTitleCase(formatted);
    // Ensure tickers are uppercase
    formatted = formatted.replace(/\b(Btc|Eth|Sol|Xrp|Bnb|Doge|Ada|Avax|Dot|Link|Matic|Pol|Arb|Op)\b/g, (match) => match.toUpperCase());
    return formatted.trim();
}
// ============================================================================
// TITLE QUALITY METRICS
// ============================================================================
/**
 * Calculate quality metrics for a title
 */
function calculateTitleMetrics(title) {
    const lowerTitle = title.toLowerCase();
    const words = title.split(/\s+/).filter(w => w.length > 0);
    // Check for asset/ticker presence
    const knownAssets = Object.keys(ASSET_TICKERS);
    const knownTickers = Object.values(ASSET_TICKERS);
    const hasAsset = knownAssets.some(a => lowerTitle.includes(a)) ||
        knownTickers.some(t => title.includes(t));
    // Check for action verbs
    const actionVerbs = [
        'surge', 'plunge', 'drop', 'rise', 'fall', 'jump', 'climb', 'slide',
        'hack', 'exploit', 'breach', 'steal', 'lose', 'gain', 'earn', 'beat',
        'approve', 'reject', 'ban', 'launch', 'release', 'announce', 'report',
        'merge', 'acquire', 'partner', 'list', 'delist', 'seize', 'sanction',
    ];
    const hasAction = actionVerbs.some(v => lowerTitle.includes(v));
    // Check for numbers (prices, percentages)
    const hasNumber = /\d+/.test(title) && /[$%]/.test(title);
    // Check for reason/context (has prepositions like "on", "after", "due to")
    const hasReason = /\b(on|after|due to|following|amid|over|as|because)\b/i.test(title);
    // Calculate quality score (0-5)
    let score = 0;
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
        hasAsset,
        hasAction,
        hasNumber,
        hasReason,
        wordCount: words.length,
        qualityScore: score,
    };
}
/**
 * Get a quality label for a title
 */
function getTitleQualityLabel(metrics) {
    const score = metrics.qualityScore;
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
    const lowerTitle = title.toLowerCase();
    const actions = [
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
    for (const [pattern, action] of actions) {
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
    const lowerTitle = title.toLowerCase();
    const upWords = [
        'surge', 'rally', 'jump', 'gain', 'rise', 'climb', 'soar', 'surge',
        'breakout', 'approve', 'launch', 'list', 'partner', 'beat', 'win',
    ];
    const downWords = [
        'plunge', 'drop', 'fall', 'slide', 'decline', 'crash', 'collapse',
        'hack', 'exploit', 'reject', 'ban', 'delist', 'sanction', 'seize', 'lose',
    ];
    const upCount = upWords.filter(w => lowerTitle.includes(w)).length;
    const downCount = downWords.filter(w => lowerTitle.includes(w)).length;
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
    const lowerTitle = title.toLowerCase();
    const patterns = {
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
    for (const [eventType, regexes] of Object.entries(patterns)) {
        for (const regex of regexes) {
            if (regex.test(lowerTitle)) {
                return eventType;
            }
        }
    }
    return 'other';
}
//# sourceMappingURL=title-formatter.js.map