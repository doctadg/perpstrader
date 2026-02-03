// Entity Extraction Service
// Extracts and tracks named entities from news articles
// Supports ENHANCEMENT 5: Entity Extraction & Linking

import logger from '../shared/logger';

export interface ExtractedEntity {
    name: string;
    type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'TOKEN' | 'PROTOCOL' | 'COUNTRY' | 'GOVERNMENT_BODY';
    confidence: number;
    normalized: string;
}

export interface EntityExtractionResult {
    articleId: string;
    entities: ExtractedEntity[];
    timestamp: Date;
}

// Known entity patterns for extraction
class EntityExtractor {
    // Crypto tokens and protocols (regex patterns)
    private static readonly TOKEN_PATTERNS = [
        // Major tokens
        /\b(Bitcoin|BTC|Ethereum|ETH|Solana|SOL|Cardano|ADA|Polkadot|DOT|Avalanche|AVAX|Dogecoin|DOGE|Shiba Inu|SHIB|Chainlink|LINK|Polygon|MATIC|Uniswap|UNI|Aave|AAVE|Curve|CRV|Maker|MKR|Compound|COMP|Synthetix|SNX|Yearn|YFI)\b/gi,
        // Common token symbols
        /\b[A-Z]{2,6}(?=\s|$|,|\.)/g, // All caps 2-6 chars (likely token symbols)
    ];

    private static readonly PROTOCOL_PATTERNS = [
        /\b(Uniswap|Aave|Compound|Curve|Maker|Synthetix|Yearn|Sushi|Pancake|Balancer|1inch|GMX|dYdX|Perpetual|Opyn|Hegic|Keeper|Lido|Rocket|Anchor|Terra|Luna|Osmosis|Jupiter|Orca|Raydium)\b/gi,
        /\b(DeFi|DEX|CEX|NFT|DAO|Web3|Layer 2|L2|Rollup|Bridge|Oracle|AMM)\b/gi,
    ];

    // Organizations
    private static readonly ORG_PATTERNS = [
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
    private static readonly LOCATION_PATTERNS = [
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
    private static readonly PERSON_PATTERNS = [
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
    private static readonly GOV_BODY_PATTERNS = [
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
    static extractEntities(title: string, content: string): ExtractedEntity[] {
        const entities: ExtractedEntity[] = [];
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
    private static extractWithPatterns(
        text: string,
        patterns: RegExp[],
        type: 'PERSON' | 'ORGANIZATION' | 'LOCATION' | 'TOKEN' | 'PROTOCOL' | 'COUNTRY' | 'GOVERNMENT_BODY'
    ): ExtractedEntity[] {
        const entities: ExtractedEntity[] = [];

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
    private static calculateConfidence(name: string, type: string): number {
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

    /**
     * Deduplicate entities, keeping highest confidence
     */
    private static deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
        const entityMap = new Map<string, ExtractedEntity>();

        for (const entity of entities) {
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
    static classifyLocation(entity: ExtractedEntity): 'COUNTRY' | 'LOCATION' {
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

export default EntityExtractor;
