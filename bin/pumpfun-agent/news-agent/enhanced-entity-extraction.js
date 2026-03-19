"use strict";
// Enhanced Entity Extraction Service
// Uses LLM-based NER for improved accuracy in entity recognition
// Supports the semantic clustering system
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedEntityExtractor = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const openrouter_service_1 = __importDefault(require("../shared/openrouter-service"));
class EnhancedEntityExtractor {
    // Confidence thresholds
    HIGH_CONFIDENCE = 0.85;
    MEDIUM_CONFIDENCE = 0.60;
    LOW_CONFIDENCE = 0.40;
    // Cache for LLM responses
    llmCache = new Map();
    cacheMaxSize = 500;
    // Entity patterns (enhanced from original)
    PATTERNS = {
        // Cryptocurrencies and tokens
        TOKEN: [
            /\b(Bitcoin|BTC|Ethereum|ETH|Solana|SOL|Cardano|ADA|Polkadot|DOT|Avalanche|AVAX|Dogecoin|DOGE|Shiba Inu|SHIB|Chainlink|LINK|Polygon|MATIC|Uniswap|UNI|Aave|AAVE|Curve|CRV|Maker|MKR|Compound|COMP|Synthetix|SNX|Yearn|YFI|Sushi|Pancake|Balancer|1inch|GMX|dYdX|Perpetual|Lido|Rocket Pool|LDO|RPL|Toncoin|TON|Ripple|XRP|Stellar|XLM|Litecoin|LTC|Bitcoin Cash|BCH)\b/gi,
            /\b[A-Z]{2,6}(?:\s*(?:Token|Coin))?\b/g, // Generic token symbols
        ],
        // DeFi protocols and platforms
        PROTOCOL: [
            /\b(Uniswap|Aave|Compound|Curve|MakerDAO|Synthetix|Yearn|YFI|SushiSwap|PancakeSwap|Balancer|1inch|GMX|dYdX|Perpetual Protocol|Opyn|Hegic|KeeperDAO|Lido|Rocket Pool|Anchor|Terra|Luna|Osmosis|Jupiter|Orca|Raydium|Serum|Meteora)\b/gi,
            /\b(DeFi|DEX|CEX|NFT|DAO|Web3|Layer 2|L2|Rollup|Bridge|Oracle|AMM|Yield Farming|Liquidity Mining)\b/gi,
        ],
        // Technology companies
        ORGANIZATION: [
            // Tech giants
            /\b(Apple|Microsoft|Google|Alphabet|Amazon|Meta|Facebook|Instagram|WhatsApp|Twitter|X\.com|Tesla|Nvidia|Intel|AMD|Samsung|Sony|Oracle|IBM|Salesforce|Adobe|Netflix|Uber|Lyft|Airbnb|Zoom|Slack|Discord)\b/gi,
            // Crypto companies
            /\b(Binance|Coinbase|Kraken|Gemini|FTX|Binance\.US|Bitfinex|OKX|KuCoin|Huobi|Bybit|Bitmex|Bitstamp|Crypto\.com|BlockFi|Celsius|Nexo|Ledger|Trezor|MetaMask)\b/gi,
            // Financial institutions
            /\b(BlackRock|Fidelity|Invesco|Ark Invest|Grayscale|VanEck|WisdomTree|Vanguard|Charles Schwab|Morgan Stanley|Goldman Sachs|JPMorgan Chase|Bank of America|Citi|Citigroup|Wells Fargo|HSBC|Deutsche Bank|UBS|Credit Suisse)\b/gi,
            // Crypto companies
            /\b(MicroStrategy|Strategy|Tesla|Block|Square|PayPal|Visa|Mastercard|Stripe|Plaid|Robinhood|eToro|SoFi)\b/gi,
        ],
        // Government and regulatory bodies
        GOVERNMENT_BODY: [
            /\b(SEC|CFTC|FINRA|FDIC|Federal Reserve|Fed|Treasury Department|IRS|FBI|CIA|NSA|EPA|FDA|FTC)\b/gi,
            /\b(European Central Bank|ECB|Bank of England|BoE|Bank of Japan|BoJ|People's Bank of China|PBOC|Bank of Canada|Reserve Bank of Australia|RBA|Reserve Bank of India|RBI)\b/gi,
            /\b(European Commission|EU Commission|European Parliament|Bundestag|Diet|Parliament|Congress|Senate|House of Representatives|White House)\b/gi,
            /\b(Financial Conduct Authority|FCA|BaFin|AMF|CONSOB|ASIC|MAS|HKMA|SFC)\b/gi,
        ],
        // Countries and major regions
        COUNTRY: [
            /\b(United States|USA|US|America|United Kingdom|UK|Britain|England|Scotland|Wales|Northern Ireland|European Union|EU|Eurozone|Europe|China|Chinese|Japan|Japanese|South Korea|Seoul|Russia|Russian|India|Indian|Brazil|Brazilian|Germany|German|France|French|Italy|Italian|Spain|Spanish|Canada|Canadian|Australia|Australian|Mexico|Mexican|Argentina|Argentinian|Saudi Arabia|UAE|United Arab Emirates|Dubai|Abu Dhabi|Iran|Israel|Ukraine|Turkey|Singapore|Hong Kong|Switzerland|Sweden|Norway|Netherlands|Belgium|Austria|Poland)\b/gi,
        ],
        // Major cities and financial centers
        LOCATION: [
            /\b(New York|NYC|London|Tokyo|Shanghai|Beijing|Hong Kong|Singapore|Dubai|Zurich|Geneva|Frankfurt|Paris|Berlin|Milan|Madrid|Amsterdam|Toronto|Vancouver|Sydney|Melbourne|Mumbai|Delhi|Bangalore|São Paulo|Rio de Janeiro|Buenos Aires|Mexico City|Cape Town|Johannesburg|Moscow|Seoul|Taipei)\b/gi,
        ],
        // Key people in business and politics
        PERSON: [
            // US officials
            /\b(Jerome Powell|Jay Powell|Janet Yellen|Gary Gensler|Joe Biden|Kamala Harris|Donald Trump|Mike Johnson|Hakeem Jeffries|Chuck Schumer|Mitch McConnell)\b/gi,
            // Business leaders
            /\b(Elon Musk|Jeff Bezos|Mark Zuckerberg|Tim Cook|Sundar Pichai|Satya Nadella|Jensen Huang|Lisa Su|Andy Jassy|Larry Ellison|Marc Benioff|Bill Gates|Warren Buffett|Jamie Dimon)\b/gi,
            // Crypto leaders
            /\b(Sam Altman|Vitalik Buterin|CZ|Changpeng Zhao|Brian Armstrong|Vladimir Tenev|Sam Bankman-Fried|SBF|Michael Saylor|Cathie Wood|Charles Hoskinson|Anatoly Yakovenko)\b/gi,
            // European officials
            /\b(Christine Lagarde|Ursula von der Leyen|Olaf Scholz|Emmanuel Macron|Rishi Sunak|Keir Starmer)\b/gi,
        ],
        // Financial amounts
        AMOUNT: [
            /\$[\d,]+(?:\.\d+)?\s*(?:billion|million|trillion|B|M|T|bn|mn)?\b/gi,
            /\b[\d,]+(?:\.\d+)?\s*(?:billion|million|trillion|B|M|T|bn|mn)\s*(?:dollars|USD|EUR|GBP|BTC|ETH)?\b/gi,
            /\b[\d,]+(?:\.\d+)?%\b/g, // Percentages
        ],
        // Dates and time references
        DATE: [
            /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s+\d{4})?\b/gi,
            /\b\d{1,2}\/(?:\d{1,2}|\d{4})\/(?:\d{4}|\d{2})\b/g,
            /\b(?:Q[1-4]|Q[1-4]\s+\d{4})\b/gi,
            /\b(?:first|second|third|fourth)\s+quarter\b/gi,
        ],
        // Event types
        EVENT: [
            /\b(earnings|merger|acquisition|IPO|SPAC|delisting|halving|fork|airdrop|staking|yield|governance vote|proposal|regulation|sanction|tariff|trade war|recession|inflation|deflation|interest rate|fed decision)\b/gi,
        ],
    };
    /**
     * Extract entities from text using regex patterns
     */
    extractWithRegex(title, content) {
        const text = `${title} ${content || ''}`;
        const entities = [];
        const seen = new Set();
        for (const [type, patterns] of Object.entries(this.PATTERNS)) {
            for (const pattern of patterns) {
                const matches = text.matchAll(pattern);
                for (const match of matches) {
                    const name = match[0].trim();
                    const normalized = name.toLowerCase();
                    // Skip duplicates
                    if (seen.has(`${type}:${normalized}`))
                        continue;
                    seen.add(`${type}:${normalized}`);
                    // Calculate confidence based on pattern type and match quality
                    const confidence = this.calculateRegexConfidence(name, type);
                    entities.push({
                        name,
                        type: type,
                        confidence,
                        normalized,
                        source: 'regex'
                    });
                }
            }
        }
        return entities.sort((a, b) => b.confidence - a.confidence);
    }
    /**
     * Extract entities using LLM for higher accuracy
     */
    async extractWithLLM(title, content) {
        if (!openrouter_service_1.default.canUseService()) {
            return [];
        }
        const cacheKey = `${title.slice(0, 100)}:${content?.slice(0, 200) || ''}`;
        // Check cache
        if (this.llmCache.has(cacheKey)) {
            return this.convertLLMResponse(this.llmCache.get(cacheKey));
        }
        try {
            const prompt = `Extract named entities from this news article.

Title: ${title}
${content ? `Content: ${content.slice(0, 500)}` : ''}

Extract entities with their types:
- PERSON: Individual people
- ORGANIZATION: Companies, institutions, platforms
- LOCATION: Cities, regions, specific places (not countries)
- COUNTRY: Nations, sovereign states
- TOKEN: Cryptocurrencies, digital tokens
- PROTOCOL: DeFi protocols, blockchain platforms
- GOVERNMENT_BODY: Regulatory agencies, central banks, government departments
- EVENT: Specific events, decisions, announcements
- AMOUNT: Financial figures, percentages
- DATE: Specific dates, quarters

Return JSON only:
{
  "entities": [
    {"name": "Bitcoin", "type": "TOKEN", "confidence": 0.95},
    {"name": "SEC", "type": "GOVERNMENT_BODY", "confidence": 0.98}
  ],
  "eventType": "approval|hack|launch|partnership|earnings|regulation|other",
  "primaryEntity": "The main entity this article is about"
}`;
            const response = await openrouter_service_1.default.generateEventLabel({
                title,
                content: content?.slice(0, 500),
                category: 'GENERAL'
            });
            // Parse the response or use fallback
            let llmResponse;
            if (response) {
                // Try to extract entities from the response
                const keywords = response.keywords || [];
                const topic = response.topic || '';
                llmResponse = {
                    entities: keywords.map(k => ({
                        name: k,
                        type: this.inferEntityType(k),
                        confidence: 0.7
                    })),
                    eventType: response.subEventType,
                    primaryEntity: topic.split(' ')[0]
                };
            }
            else {
                llmResponse = { entities: [] };
            }
            // Cache the response
            this.cacheResponse(cacheKey, llmResponse);
            return this.convertLLMResponse(llmResponse);
        }
        catch (error) {
            logger_1.default.debug(`[EntityExtraction] LLM extraction failed: ${error}`);
            return [];
        }
    }
    /**
     * Hybrid extraction combining regex and LLM
     */
    async extractHybrid(title, content, articleId) {
        // Always do regex extraction first (fast)
        const regexEntities = this.extractWithRegex(title, content);
        // Try LLM extraction if available
        let llmEntities = [];
        if (openrouter_service_1.default.canUseService()) {
            llmEntities = await this.extractWithLLM(title, content);
        }
        // Merge and deduplicate
        const merged = this.mergeEntities(regexEntities, llmEntities);
        // Find primary entity
        const primaryEntity = merged.find(e => ['TOKEN', 'ORGANIZATION', 'GOVERNMENT_BODY'].includes(e.type) &&
            e.confidence > this.MEDIUM_CONFIDENCE);
        return {
            articleId: articleId || '',
            entities: merged,
            primaryEntity,
            timestamp: new Date()
        };
    }
    /**
     * Batch extract entities for multiple articles
     */
    async batchExtract(articles) {
        const results = new Map();
        // Process regex extractions first (parallel)
        for (const article of articles) {
            const result = await this.extractHybrid(article.title, article.content, article.id);
            results.set(article.id, result);
        }
        return results;
    }
    /**
     * Merge regex and LLM entities, keeping highest confidence
     */
    mergeEntities(regexEntities, llmEntities) {
        const entityMap = new Map();
        // Add regex entities
        for (const entity of regexEntities) {
            const key = `${entity.type}:${entity.normalized}`;
            entityMap.set(key, entity);
        }
        // Merge LLM entities
        for (const entity of llmEntities) {
            const key = `${entity.type}:${entity.normalized}`;
            const existing = entityMap.get(key);
            if (existing) {
                // Boost confidence if both sources agree
                entityMap.set(key, {
                    ...existing,
                    confidence: Math.min(1, existing.confidence + 0.15),
                    source: 'hybrid'
                });
            }
            else {
                entityMap.set(key, { ...entity, source: 'llm' });
            }
        }
        return Array.from(entityMap.values())
            .sort((a, b) => b.confidence - a.confidence);
    }
    /**
     * Calculate confidence for regex matches
     */
    calculateRegexConfidence(name, type) {
        let confidence = 0.7; // Base confidence
        // Boost for well-known entities
        const wellKnownPatterns = {
            TOKEN: [/\b(BTC|ETH|SOL|ADA|DOT|AVAX|LINK|UNI)\b/],
            ORGANIZATION: [/\b(Fed|SEC|Fidelity|BlackRock|Binance|Coinbase|Fed)\b/i],
            PERSON: [/\b(Powell|Gensler|Musk|Buterin|Zuckerberg|Cook)\b/i],
        };
        const patterns = wellKnownPatterns[type];
        if (patterns) {
            for (const pattern of patterns) {
                if (pattern.test(name)) {
                    confidence = 0.9;
                    break;
                }
            }
        }
        // Boost for multi-word names
        if (name.split(/\s+/).length > 1) {
            confidence += 0.05;
        }
        // Boost for proper case
        if (/^[A-Z][a-z]+/.test(name)) {
            confidence += 0.05;
        }
        return Math.min(1, confidence);
    }
    /**
     * Infer entity type from keyword
     */
    inferEntityType(keyword) {
        const upper = keyword.toUpperCase();
        // Check for tokens
        if (/^(BTC|ETH|SOL|ADA|DOT|AVAX|LINK|UNI|AAVE|CRV|MKR|COMP|SNX|YFI|DOGE|SHIB|XRP|LTC|BCH|XLM)$/.test(upper)) {
            return 'TOKEN';
        }
        // Check for government bodies
        if (/^(SEC|CFTC|FED|ECB|BOE|FCA|BaFin|FBI|CIA|IRS|FDA|FTC)$/.test(upper)) {
            return 'GOVERNMENT_BODY';
        }
        // Check for countries
        if (/\b(US|USA|UK|EU|China|Japan|Germany|France|India|Brazil|Russia|Canada|Australia)\b/i.test(keyword)) {
            return 'COUNTRY';
        }
        // Check for protocols
        if (/\b(uniswap|aave|compound|curve|maker|synthetix|defi|dex|nft|dao)\b/i.test(keyword)) {
            return 'PROTOCOL';
        }
        // Default to organization
        return 'ORGANIZATION';
    }
    /**
     * Convert LLM response to entity array
     */
    convertLLMResponse(response) {
        return response.entities.map(e => ({
            name: e.name,
            type: this.normalizeEntityType(e.type),
            confidence: e.confidence || 0.7,
            normalized: e.name.toLowerCase(),
            source: 'llm'
        }));
    }
    /**
     * Normalize entity type from LLM response
     */
    normalizeEntityType(type) {
        const typeMap = {
            'PERSON': 'PERSON',
            'ORGANIZATION': 'ORGANIZATION',
            'COMPANY': 'ORGANIZATION',
            'LOCATION': 'LOCATION',
            'CITY': 'LOCATION',
            'COUNTRY': 'COUNTRY',
            'TOKEN': 'TOKEN',
            'CRYPTOCURRENCY': 'TOKEN',
            'PROTOCOL': 'PROTOCOL',
            'PLATFORM': 'PROTOCOL',
            'GOVERNMENT_BODY': 'GOVERNMENT_BODY',
            'REGULATOR': 'GOVERNMENT_BODY',
            'EVENT': 'EVENT',
            'AMOUNT': 'AMOUNT',
            'DATE': 'DATE'
        };
        return typeMap[type?.toUpperCase()] || 'ORGANIZATION';
    }
    /**
     * Cache LLM response with LRU eviction
     */
    cacheResponse(key, response) {
        if (this.llmCache.size >= this.cacheMaxSize) {
            const firstKey = this.llmCache.keys().next().value;
            this.llmCache.delete(firstKey);
        }
        this.llmCache.set(key, response);
    }
    /**
     * Clear all caches
     */
    clearCache() {
        this.llmCache.clear();
        logger_1.default.info('[EntityExtraction] Cache cleared');
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.llmCache.size,
            maxSize: this.cacheMaxSize
        };
    }
}
exports.enhancedEntityExtractor = new EnhancedEntityExtractor();
exports.default = exports.enhancedEntityExtractor;
//# sourceMappingURL=enhanced-entity-extraction.js.map