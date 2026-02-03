"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deriveTrend = deriveTrend;
exports.deriveTrendTopic = deriveTrendTopic;
function clampWords(text, minWords = 2, maxWords = 8) {
    const tokens = text
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
    const clamped = tokens.slice(0, maxWords).join(' ');
    if (clamped.split(' ').length >= minWords)
        return clamped;
    return tokens.slice(0, Math.min(tokens.length, maxWords)).join(' ');
}
function uniq(arr) {
    return Array.from(new Set(arr));
}
function normalizeKeyPart(input) {
    return (input || '')
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
}
const GENERIC_TAGS = new Set([
    'crypto', 'cryptocurrency', 'stocks', 'stock', 'market', 'markets', 'equity', 'equities', 'finance', 'economy',
    'news', 'update', 'analysis', 'breaking', 'today',
]);
const GENERIC_TAIL_WORDS = new Set([
    'developments', 'development', 'moves', 'move', 'update', 'updates', 'news', 'today', 'latest', 'prices', 'price',
    'markets', 'market', 'trading', 'report', 'reports', 'analysis',
]);
const COMMON_ACTIONS = [
    { re: /\b(approve|approved|approves|approving|approval|greenlight)\b/i, label: 'approvals' },
    { re: /\b(delay|delays|delayed|postpone|postpones)\b/i, label: 'delays' },
    { re: /\b(file|files|filed|filing|application)\b/i, label: 'filings' },
    { re: /\b(rumor|rumors|rumour|rumours)\b/i, label: 'rumors' },
    { re: /\b(sanction|sanctions)\b/i, label: 'sanctions' },
    { re: /\b(tension|tensions|conflict|clash)\b/i, label: 'tensions' },
    { re: /\b(earnings|results|guidance)\b/i, label: 'earnings' },
    { re: /\b(lawsuit|sues|sued)\b/i, label: 'lawsuit' },
    { re: /\b(hack|hacked|exploit|breach)\b/i, label: 'hack' },
    { re: /\b(liquidation|liquidations)\b/i, label: 'liquidations' },
    { re: /\b(inflow|inflows)\b/i, label: 'inflows' },
    { re: /\b(outflow|outflows)\b/i, label: 'outflows' },
];
const GEO_KEYWORDS = [
    { re: /\b(u\.?s\.?|united states|america)\b/i, label: 'US' },
    { re: /\bvenezuela\b/i, label: 'Venezuela' },
    { re: /\bchina\b/i, label: 'China' },
    { re: /\brussia\b/i, label: 'Russia' },
    { re: /\bukraine\b/i, label: 'Ukraine' },
    { re: /\biran\b/i, label: 'Iran' },
    { re: /\bisrael\b/i, label: 'Israel' },
    { re: /\beu\b|\beuropean union\b/i, label: 'EU' },
    { re: /\buk\b|\bunited kingdom\b/i, label: 'UK' },
];
const KNOWN_CRYPTO_TICKERS = [
    'BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'DOT', 'LINK', 'MATIC', 'POL',
    'ARB', 'OP', 'LTC', 'BCH', 'ETC', 'TRX', 'TON', 'ATOM', 'NEAR', 'APT', 'SUI', 'ICP', 'FIL',
    'INJ', 'RNDR', 'RUNE', 'UNI', 'AAVE', 'MKR', 'SNX', 'LDO', 'JUP', 'TIA', 'FTM', 'PEPE', 'SHIB',
    'USDT', 'USDC', 'DAI',
];
const ASSET_PATTERNS = [
    { kind: 'crypto', key: 'btc', label: 'BTC', re: [/\bbitcoin\b/i, /\bBTC\b/i] },
    { kind: 'crypto', key: 'eth', label: 'ETH', re: [/\bethereum\b/i, /\bETH\b/i] },
    { kind: 'crypto', key: 'sol', label: 'SOL', re: [/\bsolana\b/i, /\bSOL\b/i] },
    { kind: 'crypto', key: 'xrp', label: 'XRP', re: [/\bXRP\b/i, /\bripple\b/i] },
    { kind: 'crypto', key: 'bnb', label: 'BNB', re: [/\bBNB\b/i, /\bbinance coin\b/i] },
    { kind: 'crypto', key: 'doge', label: 'DOGE', re: [/\bdogecoin\b/i, /\bDOGE\b/i] },
    { kind: 'crypto', key: 'ada', label: 'ADA', re: [/\bcardano\b/i, /\bADA\b/i] },
    { kind: 'crypto', key: 'avax', label: 'AVAX', re: [/\bavalanche\b/i, /\bAVAX\b/i] },
    { kind: 'crypto', key: 'dot', label: 'DOT', re: [/\bpolkadot\b/i, /\bDOT\b/i] },
    { kind: 'crypto', key: 'link', label: 'LINK', re: [/\bchainlink\b/i, /\bLINK\b/i] },
    { kind: 'crypto', key: 'usdt', label: 'USDT', re: [/\btether\b/i, /\bUSDT\b/i] },
    { kind: 'crypto', key: 'usdc', label: 'USDC', re: [/\bUSDC\b/i, /\bcircle\b/i] },
    { kind: 'index', key: 'spx', label: 'S&P 500', re: [/\bS&P\s*500\b/i, /\bSPX\b/i, /\bsp500\b/i] },
    { kind: 'index', key: 'nasdaq', label: 'Nasdaq', re: [/\bNasdaq\b/i, /\bNDX\b/i] },
    { kind: 'index', key: 'dow', label: 'Dow', re: [/\bDow\b/i, /\bDow Jones\b/i] },
    { kind: 'index', key: 'nikkei', label: 'Nikkei', re: [/\bNikkei\b/i] },
    { kind: 'fx', key: 'dxy', label: 'DXY', re: [/\bDXY\b/i, /\bdollar index\b/i] },
    { kind: 'fx', key: 'eurusd', label: 'EURUSD', re: [/\bEUR\/USD\b/i, /\bEURUSD\b/i] },
    { kind: 'fx', key: 'usdjpy', label: 'USDJPY', re: [/\bUSD\/JPY\b/i, /\bUSDJPY\b/i] },
    { kind: 'rates', key: 'us10y', label: 'US 10Y', re: [/\b10-?year\b/i, /\b10y\b/i, /\btreasury yields?\b/i] },
    { kind: 'commodity', key: 'oil', label: 'Oil', re: [/\bcrude\b/i, /\boil\b/i, /\bbrent\b/i, /\bwti\b/i] },
    { kind: 'commodity', key: 'gold', label: 'Gold', re: [/\bgold\b/i] },
];
function headlineFocus(title) {
    const parts = title.split(/\s+(?:as|amid|while|after|before|following)\s+/i);
    const first = parts[0] || title;
    return first.split(/\s+[-–—]\s+/)[0] || first;
}
function detectAction(title) {
    for (const { re, label } of COMMON_ACTIONS) {
        if (re.test(title))
            return label;
    }
    return null;
}
function detectGeos(title) {
    const geos = [];
    for (const { re, label } of GEO_KEYWORDS) {
        if (re.test(title))
            geos.push(label);
    }
    return uniq(geos);
}
function pickNonGenericTag(tags) {
    for (const t of tags) {
        const cleaned = t.trim();
        if (!cleaned)
            continue;
        if (GENERIC_TAGS.has(cleaned.toLowerCase()))
            continue;
        return cleaned;
    }
    return null;
}
function sanitizeTags(title, tags) {
    const titleLc = (title || '').toLowerCase();
    const titleTokens = new Set(titleLc
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map(t => t.trim())
        .filter(Boolean));
    const cleaned = (tags || [])
        .map(t => t.trim())
        .filter(Boolean)
        .filter(t => !GENERIC_TAGS.has(t.toLowerCase()));
    const safe = [];
    for (const t of cleaned) {
        const tl = t.toLowerCase();
        // Only trust a tag if the title actually contains it (prevents page-template noise).
        if (tl.includes(' ')) {
            const normalizedTitle = titleLc.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
            const normalizedTag = tl.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (normalizedTag && normalizedTitle.includes(normalizedTag))
                safe.push(t);
        }
        else {
            if (titleTokens.has(tl))
                safe.push(t);
        }
    }
    // Keep a small number to avoid over-weighting tag noise.
    return safe.slice(0, 12);
}
function extractAssets(title, tags, category) {
    const text = `${title} ${(tags || []).join(' ')}`.trim();
    const assets = [];
    for (const p of ASSET_PATTERNS) {
        if (p.re.some(re => re.test(text)))
            assets.push({ kind: p.kind, key: p.key, label: p.label });
    }
    const equityCandidates = new Set();
    const dollarTickers = text.match(/\$[A-Z]{1,5}\b/g) || [];
    for (const d of dollarTickers)
        equityCandidates.add(d.slice(1));
    // Only extract parenthetical tickers if they're clearly stock tickers (with $ prefix or clear stock context)
    const parenTickers = text.match(/\(([A-Z]{1,5})\)/g) || [];
    for (const p of parenTickers) {
        const ticker = p.replace(/[()]/g, '');
        // Only accept if preceded by $ or followed by common stock keywords
        // Escape the parenthetical pattern for regex (both open and close parens need escaping)
        const escapedPattern = p.replace(/[()]/g, '\\$&');
        const beforeMatch = text.match(new RegExp(`${escapedPattern}.{0,30}\\b(stock|shares|equity|trading|price|nasdaq|dow|jones|s&p|500)\\b`, 'i'));
        const afterMatch = text.match(new RegExp(`\\b(stock|shares|equity|trading|price|nasdaq|dow|jones|s&p|500)\\b.{0,30}${escapedPattern}`, 'i'));
        if (beforeMatch || afterMatch || text.includes(`$${ticker}`)) {
            equityCandidates.add(ticker);
        }
    }
    for (const t of equityCandidates) {
        if (KNOWN_CRYPTO_TICKERS.includes(t))
            continue;
        // Filter out generic single-word tickers like "DOW" that often appear in non-stock contexts
        if (['DOW', 'NOW', 'FOX', 'CBS', 'ESPN', 'DIS'].includes(t))
            continue;
        assets.push({ kind: 'equity', key: normalizeKeyPart(t), label: t });
    }
    if ((category === 'CRYPTO' || /crypto/i.test(String(category || ''))) && assets.every(a => a.kind !== 'crypto')) {
        for (const t of KNOWN_CRYPTO_TICKERS) {
            const regex = new RegExp(`\\b${t}\\b`, 'i');
            if (regex.test(text)) {
                // Special case for NEAR: only match if near crypto-related context
                if (t === 'NEAR' || t === 'SOL' || t === 'FIL' || t === 'LINK' || t === 'OP' || t === 'ARB') {
                    const cryptoContextRegex = /\b(protocol|blockchain|crypto|coin|token|defi|staking|wallet|exchange|trading)\b/i;
                    if (!cryptoContextRegex.test(text)) {
                        continue; // Skip false positive (e.g., "near" in "CAD steadies near")
                    }
                }
                assets.push({ kind: 'crypto', key: normalizeKeyPart(t), label: t });
            }
            if (assets.length >= 2)
                break;
        }
    }
    return uniq(assets.map(a => `${a.kind}:${a.key}:${a.label}`)).map(s => {
        const [kind, key, ...labelParts] = s.split(':');
        return { kind: kind, key, label: labelParts.join(':') };
    });
}
function detectEvent(title, tags, category) {
    const text = `${title} ${(tags || []).join(' ')}`.trim();
    if (!text)
        return null;
    // Macro first (keep these stable so topics don't fragment)
    const titleLooksLikeParty = /\bCPI\s*\(/i.test(title); // e.g. CPI(M) political party
    if (!titleLooksLikeParty && (/\bCPI\b(?!\s*\()/i.test(text) || /\bconsumer price index\b/i.test(text))) {
        return { key: 'cpi', label: 'CPI' };
    }
    if (/\b(nonfarm|payrolls|jobs report|unemployment)\b/i.test(text))
        return { key: 'jobs', label: 'Jobs' };
    if (/\bGDP\b/i.test(text))
        return { key: 'gdp', label: 'GDP' };
    if (/\b(FOMC|Federal Reserve|Fed)\b/i.test(text))
        return { key: 'fed_rates', label: 'Fed rates' };
    if (/\bOPEC\b/i.test(text))
        return { key: 'opec', label: 'OPEC' };
    const hasETF = /\betf\b/i.test(text);
    const hasSpot = /\bspot\b/i.test(text);
    if (hasETF && hasSpot)
        return { key: 'spot_etf', label: 'Spot ETF' };
    if (hasETF)
        return { key: 'etf', label: 'ETF' };
    if (/\b(earnings|results|guidance)\b/i.test(text))
        return { key: 'earnings', label: 'earnings' };
    if (/\b(hack|hacked|exploit|breach)\b/i.test(text))
        return { key: 'hack', label: 'hack' };
    if (/\b(liquidation|liquidations)\b/i.test(text))
        return { key: 'liquidations', label: 'liquidations' };
    if (/\b(bankruptcy|chapter\\s+11|insolvency)\b/i.test(text))
        return { key: 'bankruptcy', label: 'bankruptcy' };
    if (/\b(acquire|acquires|acquisition|buyout|merge|merger)\b/i.test(text))
        return { key: 'mna', label: 'M&A' };
    if (/\b(listing|listed|lists|delisting|delist)\b/i.test(text))
        return { key: 'listing', label: 'listing' };
    if (/\b(token unlock|unlock(s)?)\b/i.test(text))
        return { key: 'unlock', label: 'unlock' };
    if (/\b(stablecoin|stablecoins|depeg|peg)\b/i.test(text))
        return { key: 'stablecoins', label: 'stablecoins' };
    if (/\b(defi|tvl|dex|amm)\b/i.test(text))
        return { key: 'defi', label: 'DeFi' };
    if (/\bairdrop\b/i.test(text))
        return { key: 'airdrop', label: 'airdrop' };
    if (/\bstaking\b/i.test(text))
        return { key: 'staking', label: 'staking' };
    if (/\bmemecoin(s)?\b/i.test(text))
        return { key: 'memecoins', label: 'memecoins' };
    if (/\bquantum\b/i.test(text))
        return { key: 'quantum', label: 'quantum' };
    if (category === 'GEOPOLITICS' && /\bsanction(s)?\b/i.test(text))
        return { key: 'sanctions', label: 'sanctions' };
    const action = detectAction(title);
    if (action && !['dip', 'rally'].includes(action))
        return { key: normalizeKeyPart(action), label: action };
    return null;
}
function detectMacroRegion(title) {
    const t = (title || '').toLowerCase();
    if (!t)
        return null;
    if (/\b(u\.?s\.?|united states|america)\b/i.test(title))
        return { key: 'us', label: 'US' };
    if (/\beuro area\b|\beurozone\b|\beur\b/i.test(title))
        return { key: 'euro', label: 'Eurozone' };
    if (/\bchina\b/i.test(title))
        return { key: 'cn', label: 'China' };
    if (/\bjapan\b|\bboj\b|\byen\b/i.test(title))
        return { key: 'jp', label: 'Japan' };
    if (/\buk\b|\bunited kingdom\b|\bbank of england\b|\bboe\b/i.test(title))
        return { key: 'uk', label: 'UK' };
    if (/\bindia\b|\brbi\b/i.test(title))
        return { key: 'in', label: 'India' };
    if (/\baustralia\b|\baussie\b|\brba\b/i.test(title))
        return { key: 'au', label: 'Australia' };
    return null;
}
function extractEntities(title) {
    const entities = [];
    for (const t of KNOWN_CRYPTO_TICKERS) {
        if (new RegExp(`\\b${t}\\b`, 'i').test(title))
            entities.push(t);
    }
    const acronyms = title.match(/\b[A-Z]{2,6}\b/g) || [];
    entities.push(...acronyms);
    const words = title.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
        const w = words[i].replace(/[^\w.-]/g, '');
        if (!w)
            continue;
        const isCapitalized = /^[A-Z][a-zA-Z0-9.-]+$/.test(w);
        if (!isCapitalized)
            continue;
        const phrase = [w];
        for (let j = i + 1; j < Math.min(i + 4, words.length); j++) {
            const wj = words[j].replace(/[^\w.-]/g, '');
            if (!wj)
                break;
            if (/^(of|and|the|vs|v|to|for|in|on)$/i.test(wj))
                continue;
            if (!/^[A-Z][a-zA-Z0-9.-]+$/.test(wj))
                break;
            phrase.push(wj);
        }
        if (phrase.length >= 2)
            entities.push(phrase.join(' '));
    }
    return uniq(entities
        .map(e => e.replace(/\.$/, '').trim())
        .filter(Boolean)
        .filter(e => e.length >= 2)
        .filter(e => !GENERIC_TAGS.has(e.toLowerCase()))
        .slice(0, 12));
}
function formatEntity(entity) {
    const cleaned = entity.trim();
    if (!cleaned)
        return cleaned;
    if (/^[A-Z0-9.$-]+$/.test(cleaned))
        return cleaned;
    if (/^[a-z]/.test(cleaned) && /^[a-z0-9\s.-]+$/.test(cleaned)) {
        return cleaned.replace(/^\w/, c => c.toUpperCase());
    }
    return cleaned;
}
function detectActionVerbs(text) {
    const actionPatterns = [
        [/\bstrikes?\b/i, 'strikes'],
        [/\bapproves?\b/i, 'approves'],
        [/\blaunches?\b/i, 'launches'],
        [/\bhack(?:ed|s|es)?\b/i, 'hack'],
        [/\bseiz(?:es|ed|ing)?\b/i, 'seizure'],
        [/\bannounces?\b/i, 'announces'],
        [/\bplunge[sd]?\b/i, 'plunge'],
        [/\bbreak[sz]\b/i, 'break'],
        [/\bra?ll(?:y|ies|ying)?\b/i, 'rally'],
        [/\bsurge[sd]?\b/i, 'surge'],
        [/\bpartners?\b/i, 'partners'],
        [/\bmerges?\b/i, 'merges'],
        [/\bdelist[sd]?\b/i, 'delists'],
        [/\blist[sd]?\b/i, 'lists'],
        [/\breport[sd]?\b/i, 'reports'],
        [/\bpredict[sd]?\b/i, 'predicts'],
    ];
    const found = [];
    for (const [pattern, verb] of actionPatterns) {
        if (pattern.test(text)) {
            found.push(verb);
        }
    }
    return found;
}
function deriveTrend(input) {
    const title = input.title || '';
    const tags = sanitizeTags(title, input.tags || []);
    const focus = headlineFocus(title);
    const geos = detectGeos(title);
    const assets = extractAssets(title, tags, input.category);
    const primaryAsset = assets[0] || null;
    const event = detectEvent(title, tags, input.category);
    const macroRegion = detectMacroRegion(title);
    const action = detectAction(focus) || detectAction(title);
    const hasETF = /\betf\b/i.test(title) || tags.some(t => t.toLowerCase() === 'etf');
    const hasSpot = /\bspot\b/i.test(title) || tags.some(t => t.toLowerCase() === 'spot');
    let topic = '';
    let topicKey = '';
    // Geo pair topics first (stable, high-signal)
    if (geos.length >= 2) {
        const pair = `${geos[0]}–${geos[1]}`;
        const suffix = event?.label || action || 'tensions';
        topic = `${pair} ${suffix}`.trim();
        topicKey = `geo:${normalizeKeyPart(geos[0])}_${normalizeKeyPart(geos[1])}:${normalizeKeyPart(event?.key || suffix)}`;
    }
    else if (event?.key === 'cpi') {
        topic = macroRegion ? `${macroRegion.label} CPI` : 'CPI';
        topicKey = macroRegion ? `macro:${macroRegion.key}_cpi` : 'macro:cpi';
    }
    else if (event?.key === 'jobs') {
        topic = macroRegion ? `${macroRegion.label} jobs report` : 'Jobs report';
        topicKey = macroRegion ? `macro:${macroRegion.key}_jobs` : 'macro:jobs';
    }
    else if (event?.key === 'gdp') {
        topic = macroRegion ? `${macroRegion.label} GDP` : 'GDP';
        topicKey = macroRegion ? `macro:${macroRegion.key}_gdp` : 'macro:gdp';
    }
    else if (event?.key === 'fed_rates') {
        topic = 'Fed rates';
        topicKey = 'macro:fed_rates';
    }
    else if (event?.key === 'opec') {
        topic = 'OPEC';
        topicKey = 'macro:opec';
    }
    else if (hasETF && !primaryAsset) {
        topic = 'ETF flows';
        topicKey = 'macro:etf';
    }
    else if (hasETF && primaryAsset?.kind === 'crypto') {
        topic = `${hasSpot ? 'Spot ' : ''}${primaryAsset.label} ETF`.replace(/\s+/g, ' ').trim();
        topicKey = `crypto:${primaryAsset.key}:${hasSpot ? 'spot_etf' : 'etf'}`;
    }
    else if (primaryAsset && event) {
        const label = primaryAsset.label;
        if (event.key === 'spot_etf')
            topic = `Spot ${label} ETF`;
        else if (event.key === 'etf')
            topic = `${label} ETF`;
        else if (event.key === 'earnings')
            topic = `${label} earnings`;
        else if (event.key === 'hack')
            topic = `${label} hack`;
        else if (event.key === 'mna')
            topic = `${label} M&A`;
        else if (event.key === 'bankruptcy')
            topic = `${label} bankruptcy`;
        else if (event.key === 'liquidations')
            topic = `${label} liquidations`;
        else
            topic = `${label} ${event.label}`;
        topicKey = `${primaryAsset.kind}:${primaryAsset.key}:${event.key}`;
    }
    else if (primaryAsset) {
        // For asset-based topics, use action + asset (not generic "update")
        const actionWord = action || 'update';
        // Check if action is meaningful (not rally/dip which are outcomes, not actions)
        const badActions = new Set(['rally', 'dip', 'surge', 'plunge', 'crash', 'jump', 'drop']);
        const cleanAction = badActions.has(action?.toLowerCase() || '') ? 'update' : (action || 'update');
        topic = `${primaryAsset.label} ${cleanAction}`.trim();
        topicKey = `${primaryAsset.kind}:${primaryAsset.key}:${cleanAction.replace(/\s+/g, '_')}`;
    }
    else {
        // For non-asset topics, use action + key topic words
        // Focus on: WHAT HAPPENED + KEY SUBJECT
        const actionVerbs = detectActionVerbs(focus);
        // Extract meaningful keywords from title (skip stopwords and generic terms)
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
            'by', 'from', 'is', 'are', 'was', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'must', 'this', 'that', 'these', 'those', 'it',
            'as', 'if', 'than', 'so', 'because', 'while', 'when', 'where', 'what', 'which', 'who', 'whom',
            'about', 'after', 'before', 'above', 'below', 'into', 'through', 'during', 'under', 'again',
            'further', 'then', 'once', 'here', 'there', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
            'other', 'some', 'such', 'no', 'not', 'only', 'same', 'just', 'news', 'today', 'latest', 'update',
            'report', 'reports', 'says', 'said', 'according', 'vs', 'versus', 'how', 'why', 'what', 'when', 'where']);
        const words = focus.split(/\s+/).map(w => w.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()).filter(w => w.length > 2);
        const keyWords = words.filter(w => !stopWords.has(w) && !/^\d+$/.test(w)).slice(0, 3);
        // Build topic: ACTION + KEYWORDS
        let action = actionVerbs.length > 0 ? actionVerbs[0] : (event?.label || 'update');
        // Clean up action verb
        action = action.replace(/s$/, ''); // Remove trailing 's' from verbs
        if (action === 'strikes')
            action = 'strike';
        if (keyWords.length > 0) {
            topic = `${action} ${keyWords.join(' ')}`.trim();
            topicKey = `topic:${normalizeKeyPart(action)}:${normalizeKeyPart(keyWords.join('_'))}`;
        }
        else {
            topic = action;
            topicKey = `topic:${normalizeKeyPart(action)}`;
        }
    }
    topic = clampWords(topic, 2, 8);
    const entities = extractEntities(title);
    const keywords = uniq([
        ...geos,
        ...assets.map(a => a.label).slice(0, 3),
        ...entities.flatMap(e => e.split(' ')).filter(w => w.length >= 2).slice(0, 6),
        ...tags.filter(t => !GENERIC_TAGS.has(t.toLowerCase())).slice(0, 6),
        event?.label || '',
        action || '',
    ].map(k => k.trim()).filter(Boolean)).slice(0, 8);
    return { topic, topicKey, keywords };
}
function deriveTrendTopic(input) {
    const trend = deriveTrend(input);
    return { topic: trend.topic, keywords: trend.keywords };
}
//# sourceMappingURL=news-trend.js.map