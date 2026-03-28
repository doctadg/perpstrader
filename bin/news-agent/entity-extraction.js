"use strict";
// Entity Extraction Service
// Extracts and tracks named entities from news articles
// Supports ENHANCEMENT 5: Entity Extraction & Linking
Object.defineProperty(exports, "__esModule", { value: true });
// Known entity patterns for extraction
class EntityExtractor {
    // Crypto tokens and protocols (regex patterns)
    static TOKEN_PATTERNS = [
        // Major tokens (curated list — NO catch-all regex)
        /\b(Bitcoin|BTC|Ethereum|ETH|Solana|SOL|Cardano|ADA|Polkadot|DOT|Avalanche|AVAX|Dogecoin|DOGE|Shiba Inu|SHIB|Chainlink|LINK|Polygon|MATIC|Uniswap|UNI|Aave|AAVE|Curve|CRV|Maker|MKR|Compound|COMP|Synthetix|SNX|Yearn|YFI|Pepeto|Hyperliquid|HYPE|Sui|SUI|Sei|SEI|Aptos|APT|Arbitrum|ARB|Optimism|OP|Celestia|TIA|Injective|INJ|Osmosis|OSMO|Jupiter|JUP|Pepe|PEPE|Floki|FLOKI|Bonk|BONK|WIF|dogwifhat|Trump|MAGA|TRUMP|Melania|MELANIA|Fartcoin|FARTCOIN)\b/gi,
    ];
    static PROTOCOL_PATTERNS = [
        /\b(Uniswap|Aave|Compound|Curve|Maker|Synthetix|Yearn|Sushi|Pancake|Balancer|1inch|GMX|dYdX|Perpetual|Opyn|Hegic|Keeper|Lido|Rocket|Anchor|Terra|Luna|Osmosis|Jupiter|Orca|Raydium)\b/gi,
        /\b(DeFi|DEX|CEX|NFT|DAO|Web3|Layer 2|L2|Rollup|Bridge|Oracle|AMM)\b/gi,
    ];
    // Organizations
    static ORG_PATTERNS = [
        // Tech companies
        /\b(Apple|Microsoft|Google|Alphabet|Amazon|Meta|Facebook|Twitter|Tesla|Nvidia|Intel|AMD|Samsung|Sony)\b/gi,
        // Crypto companies
        /\b(Binance|Coinbase|Kraken|Gemini|FTX|Binance\.US|Bitfinex|OKX|KuCoin|Huobi|Bybit|Bitmex)\b/gi,
        /\b(BlackRock|Fidelity|Invesco|Ark Invest|Grayscale|VanEck|WisdomTree)\b/gi,
        /\b(MicroStrategy|Tesla|Block|Square|PayPal|Visa|Mastercard)\b/gi,
        // Financial institutions
        /\b(Goldman Sachs|JPMorgan|Morgan Stanley|Bank of America|Citi|Citigroup)\b/gi,
        // Governments and bodies
        /\b(SEC|CFTC|Federal Reserve|Fed|European Central Bank|ECB|Bank of England|BoE)\b/gi,
        /\b(US Treasury|Treasury Department|Congress|Senate|House of Representatives)\b/gi,
        /\b(European Commission|EU Commission|Parliament|Bundestag|Diet)\b/gi,
    ];
    // Countries and regions
    static LOCATION_PATTERNS = [
        /\b(United States|USA|US|America)\b/gi,
        /\b(United Kingdom|UK|Britain|England)\b/gi,
        /\b(European Union|EU|Eurozone)\b/gi,
        /\b(China|Chinese|Beijing|Shanghai)\b/gi,
        /\b(Japan|Japanese|Tokyo)\b/gi,
        /\b(South Korea|Seoul)\b/gi,
        /\b(Russia|Russian|Moscow)\b/gi,
        /\b(India|New Delhi)\b/gi,
        /\b(Brazil|Brazilian|São Paulo)\b/gi,
        /\b(Germany|German|Berlin)\b/gi,
        /\b(France|French|Paris)\b/gi,
        /\b(Italy|Italian|Rome)\b/gi,
        /\b(Spain|Spanish|Madrid)\b/gi,
        /\b(Canada|Canadian|Ottawa)\b/gi,
        /\b(Australia|Australian|Canberra|Sydney)\b/gi,
        /\b(Mexico|Mexican|Mexico City)\b/gi,
        /\b(Argentina|Buenos Aires)\b/gi,
        /\b(Saudi Arabia|Riyadh)\b/gi,
        /\b(United Arab Emirates|Dubai|Abu Dhabi)\b/gi,
        /\b(Iran|Tehran)\b/gi,
        /\b(Israel|Tel Aviv)\b/gi,
        /\b(Ukraine|Kyiv)\b/gi,
        /\b(Turkey|Ankara|Istanbul)\b/gi,
    ];
    // People (common political/business figures)
    static PERSON_PATTERNS = [
        // US officials
        /\b(Jerome Powell|Jay Powell)\b/gi,
        /\b(Janet Yellen)\b/gi,
        /\b(Gary Gensler)\b/gi,
        /\b(Joe Biden|President Biden)\b/gi,
        /\b(Donald Trump|President Trump)\b/gi,
        // Business leaders
        /\b(Elon Musk)\b/gi,
        /\b(Jeff Bezos)\b/gi,
        /\b(Mark Zuckerberg)\b/gi,
        /\b(Tim Cook)\b/gi,
        /\b(Sundar Pichai)\b/gi,
        /\b(Satya Nadella)\b/gi,
        /\b(Jensen Huang)\b/gi,
        /\b(Sam Altman)\b/gi,
        /\b(Vitalik Buterin)\b/gi,
        /\b(Satoshi Nakamoto)\b/gi,
        // Crypto leaders
        /\b(Changpeng Zhao|CZ)\b/gi,
        /\b(Brian Armstrong)\b/gi,
        /\b(Vladimir Tenev)\b/gi,
        /\b(SBF|Sam Bankman-Fried)\b/gi,
        // European officials
        /\b(Christine Lagarde)\b/gi,
        /\b(Ursula von der Leyen)\b/gi,
    ];
    // Government bodies
    static GOV_BODY_PATTERNS = [
        /\b(Securities and Exchange Commission|SEC)\b/gi,
        /\b(Commodity Futures Trading Commission|CFTC)\b/gi,
        /\b(Financial Conduct Authority|FCA)\b/gi,
        /\b(BaFin|Federal Financial Supervisory Authority)\b/gi,
        /\b(AMF|Autorité des Marchés Financiers)\b/gi,
        /\b(CONSEB|Comissão de Valores Mobiliários)\b/gi,
    ];
    /**
     * Extract entities from text
     */
    static extractEntities(title, content) {
        const entities = [];
        const text = `${title}. ${content}`;
        // Extract tokens
        const tokenEntities = this.extractWithPatterns(text, EntityExtractor.TOKEN_PATTERNS, 'TOKEN');
        entities.push(...tokenEntities);
        // Extract protocols
        const protocolEntities = this.extractWithPatterns(text, EntityExtractor.PROTOCOL_PATTERNS, 'PROTOCOL');
        entities.push(...protocolEntities);
        // Extract organizations
        const orgEntities = this.extractWithPatterns(text, EntityExtractor.ORG_PATTERNS, 'ORGANIZATION');
        entities.push(...orgEntities);
        // Extract locations
        const locationEntities = this.extractWithPatterns(text, EntityExtractor.LOCATION_PATTERNS, 'LOCATION');
        entities.push(...locationEntities);
        // Extract people
        const personEntities = this.extractWithPatterns(text, EntityExtractor.PERSON_PATTERNS, 'PERSON');
        entities.push(...personEntities);
        // Extract government bodies
        const govEntities = this.extractWithPatterns(text, EntityExtractor.GOV_BODY_PATTERNS, 'GOVERNMENT_BODY');
        entities.push(...govEntities);
        // Deduplicate and rank by confidence
        return EntityExtractor.deduplicateEntities(entities);
    }
    /**
     * Extract entities using regex patterns
     */
    static extractWithPatterns(text, patterns, type) {
        const entities = [];
        for (const pattern of patterns) {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                const name = match[0];
                const normalized = name.toLowerCase().trim();
                entities.push({
                    name,
                    type,
                    confidence: EntityExtractor.calculateConfidence(name, type),
                    normalized
                });
            }
        }
        return entities;
    }
    /**
     * Calculate confidence score for extracted entity
     */
    static calculateConfidence(name, type) {
        let confidence = 0.5; // Base confidence
        // Boost for multi-word names
        if (name.split(/\s+/).length > 1) {
            confidence += 0.2;
        }
        // Boost for proper case
        if (name === name.replace(/\b\w/g, c => c.toUpperCase())) {
            confidence += 0.1;
        }
        // Boost for certain entity types
        if (type === 'TOKEN' && /^[A-Z]{2,6}$/.test(name)) {
            confidence += 0.2; // All caps token symbols are reliable
        }
        if (type === 'ORGANIZATION' && /Inc|Corp|LLC|Ltd|Group|Bank/.test(name)) {
            confidence += 0.2; // Suffixes indicate organizations
        }
        return Math.min(1, confidence);
    }
    // Entities to exclude - too generic or garbage
    static ENTITY_BLACKLIST = new Set([
        // English words from uppercase headlines
        'the', 'and', 'for', 'with', 'from', 'this', 'that', 'not', 'you', 'all',
        'more', 'new', 'our', 'but', 'are', 'was', 'has', 'had', 'its', 'his',
        'her', 'she', 'they', 'them', 'who', 'how', 'why', 'can', 'out', 'now',
        'get', 'got', 'may', 'set', 'put', 'see', 'way', 'day', 'top', 'one',
        'two', 'per', 'via', 'due', 'yet', 'let', 'say', 'use', 'own', 'any',
        'back', 'well', 'only', 'just', 'over', 'into', 'also', 'than', 'then',
        'some', 'will', 'make', 'like', 'long', 'look', 'most', 'been', 'much',
        'many', 'even', 'still', 'each', 'every', 'after', 'before', 'should',
        'could', 'would', 'these', 'those', 'other', 'about', 'which', 'their',
        'what', 'when', 'where', 'here', 'there', 'very', 'too', 'same', 'under',
        // Verbs/adjectives/adverbs common in headlines
        'save', 'read', 'sign', 'live', 'free', 'next', 'run', 'fly', 'buy',
        'sell', 'hold', 'keep', 'move', 'grow', 'rise', 'fall', 'drop', 'jump',
        'push', 'pull', 'cut', 'hit', 'beat', 'miss', 'meet', 'lead', 'win',
        'lose', 'pay', 'add', 'end', 'big', 'key', 'hot', 'low', 'high',
        'old', 'far', 'near', 'off', 'up', 'down', 'plan', 'rule', 'law',
        'ban', 'tax', 'gap', 'risk', 'goal', 'force', 'power', 'market',
        'trade', 'price', 'rate', 'time', 'year', 'week', 'month', 'data',
        'report', 'news', 'update', 'alert', 'break', 'final', 'total',
        'global', 'world', 'national', 'local', 'public', 'private', 'federal',
        'central', 'major', 'latest', 'first', 'last', 'best', 'worst',
        // Generic abbreviations
        'us', 'pm', 'am', 'ai', 'tv', 'rss', 'api', 'ceo', 'cfo', 'cto', 'coo', 'hr', 'pr', 'qa',
        'faq', 'ii', 'iii', 'vip', 'gop', 'dem', 'rep', 'sen', 'gov',
        // Timezone/time expressions
        'utc', 'est', 'pst', 'gmt', 'et', 'pt', 'ct', 'mt', 'edt', 'cdt', 'mdt', 'pdt',
        // Generic business/legal terms
        'inc', 'llc', 'ltd', 'corp', 'co', 'plc',
        // Date patterns
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december',
        'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
        // Country/city codes
        'ny', 'la', 'dc', 'sf', 'uk', 'eu', 'cn', 'jp', 'kr', 'au', 'ca',
        'de', 'fr', 'it', 'es', 'nl', 'se', 'no', 'fi', 'dk', 'pl', 'br', 'mx', 'in', 'id', 'th', 'vn', 'ph',
        // Quarters
        'q1', 'q2', 'q3', 'q4',
        // Financial products
        'etf', 'ico', 'ido', 'ieo', 'ipo', 'spac',
        // Sports leagues
        'nfl', 'nba', 'mlb', 'nhl', 'mls', 'ncaa', 'fifa', 'ufc', 'wwe', 'nascar', 'pga', 'ufl', 'nwsl',
        // Fiat currencies
        'usd', 'eur', 'gbp', 'jpy', 'cad', 'aud', 'chf', 'cny', 'inr', 'krw', 'sgd', 'hkd', 'twd', 'thb', 'mxn',
        // Stock tickers (not crypto)
        'aapl', 'msft', 'amzn', 'goog', 'meta', 'tsla', 'nvda', 'intc', 'xom', 'jpm',
        'dis', 'nflx', 'adbe', 'crm', 'pypl', 'pltr', 'rivn', 'nke', 'gs', 'spy', 'vix', 'dji', 'qqq',
        // Media
        'cnn', 'bbc', 'nbc', 'cbs', 'abc', 'fox', 'cnbc', 'reuters', 'ap', 'afp', 'espn',
        // Financial metrics
        'gdp', 'cpi', 'ppi', 'pmi', 'eps', 'pce', 'ytd', 'gaap',
        // Tech terms
        'vpn', 'dns', 'ssl', 'app', 'saas', 'ram', 'cpu', 'gpu', 'oled', 'led', 'ar', 'vr', 'pc', 'cd',
        // Event terms
        'inflation', 'earnings', 'recession', 'summit', 'conference',
        // Word fragments
        'ing', 'ion', 'ter', 'tic', 'bitc', 'tco', 'itc', 'est', 'ati', 'lat', 'ear', 'mar', 'sto', 'ent', 'lin', 'nal', 'ment',
    ]);
    // Patterns for garbage entities (dollar amounts, timestamps, etc.)
    static GARBAGE_PATTERNS = [
        /^\$[\d,\.]+$/, // Dollar amounts like $0.0000001
        /^\d+$/, // Pure numbers
        /^\d{4}$/, // Years like 2024
        /^\d{1,2}:\d{2}/, // Time expressions
        /^https?:\/\//, // URLs
        /^[a-f0-9]{20,}$/i, // Hash strings
        /^\d+\s*(am|pm)$/i, // Time with am/pm
        /^March\s+\d+,?\s+\d{4}$/, // Full dates like "March 13, 2026"
    ];
    /**
     * Check if entity should be filtered out
     */
    static isGarbageEntity(name) {
        const normalized = name.toLowerCase().trim();
        // Check blacklist
        if (EntityExtractor.ENTITY_BLACKLIST.has(normalized)) {
            return true;
        }
        // Check garbage patterns
        for (const pattern of EntityExtractor.GARBAGE_PATTERNS) {
            if (pattern.test(name)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Deduplicate entities, keeping highest confidence
     */
    static deduplicateEntities(entities) {
        const entityMap = new Map();
        for (const entity of entities) {
            // Filter out garbage entities
            if (EntityExtractor.isGarbageEntity(entity.name)) {
                continue;
            }
            const existing = entityMap.get(entity.normalized);
            if (!existing || entity.confidence > existing.confidence) {
                entityMap.set(entity.normalized, entity);
            }
        }
        return Array.from(entityMap.values());
    }
    /**
     * Classify location as country or generic location
     */
    static classifyLocation(entity) {
        const countries = [
            'united states', 'usa', 'us', 'america',
            'united kingdom', 'uk', 'britain',
            'european union', 'eu', 'eurozone',
            'china', 'japan', 'south korea', 'russia',
            'india', 'brazil', 'germany', 'france', 'italy', 'spain',
            'canada', 'australia', 'mexico', 'argentina'
        ];
        if (countries.includes(entity.normalized)) {
            return 'COUNTRY';
        }
        return 'LOCATION';
    }
}
exports.default = EntityExtractor;
//# sourceMappingURL=entity-extraction.js.map