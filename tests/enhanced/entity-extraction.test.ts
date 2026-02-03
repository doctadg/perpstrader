/**
 * Entity Extraction Unit Tests
 * Tests for ENHANCEMENT 5: Entity Extraction & Linking
 */

import EntityExtractor, { ExtractedEntity, EntityExtractionResult } from '../../src/news-agent/entity-extraction';

describe('EntityExtractor', () => {

    describe('extractEntities', () => {

        it('should extract PERSON entities correctly', () => {
            const title = 'Elon Musk announces new Tesla features';
            const content = 'Tim Cook and Sundar Pichai were also present.';

            const entities = EntityExtractor.extractEntities(title, content);

            const persons = entities.filter(e => e.type === 'PERSON');
            expect(persons.length).toBeGreaterThan(0);
            expect(persons.some(e => e.name === 'Elon Musk')).toBe(true);
            expect(persons.some(e => e.name === 'Tim Cook')).toBe(true);
            expect(persons.some(e => e.name === 'Sundar Pichai')).toBe(true);
        });

        it('should extract ORGANIZATION entities correctly', () => {
            const title = 'Binance and Coinbase announce partnership';
            const content = 'Goldman Sachs and JPMorgan are also interested.';

            const entities = EntityExtractor.extractEntities(title, content);

            const orgs = entities.filter(e => e.type === 'ORGANIZATION');
            expect(orgs.length).toBeGreaterThan(0);
            expect(orgs.some(e => e.name === 'Binance')).toBe(true);
            expect(orgs.some(e => e.name === 'Coinbase')).toBe(true);
            expect(orgs.some(e => e.name === 'Goldman Sachs')).toBe(true);
        });

        it('should extract TOKEN entities correctly', () => {
            const title = 'Bitcoin and Ethereum surge in value';
            const content = 'Solana and Cardano also showing gains.';

            const entities = EntityExtractor.extractEntities(title, content);

            const tokens = entities.filter(e => e.type === 'TOKEN');
            expect(tokens.length).toBeGreaterThan(0);
            expect(tokens.some(e => e.name === 'Bitcoin' || e.name === 'BTC')).toBe(true);
            expect(tokens.some(e => e.name === 'Ethereum' || e.name === 'ETH')).toBe(true);
            expect(tokens.some(e => e.name === 'Solana' || e.name === 'SOL')).toBe(true);
        });

        it('should extract PROTOCOL entities correctly', () => {
            const title = 'Uniswap and Aave introduce new features';
            const content = 'DeFi protocols continue to innovate.';

            const entities = EntityExtractor.extractEntities(title, content);

            const protocols = entities.filter(e => e.type === 'PROTOCOL');
            expect(protocols.length).toBeGreaterThan(0);
            expect(protocols.some(e => e.name === 'Uniswap')).toBe(true);
            expect(protocols.some(e => e.name === 'Aave')).toBe(true);
        });

        it('should extract LOCATION entities correctly', () => {
            const title = 'United States and China discuss trade';
            const content = 'Delegations from Tokyo and Berlin also attended.';

            const entities = EntityExtractor.extractEntities(title, content);

            const locations = entities.filter(e => e.type === 'LOCATION');
            expect(locations.length).toBeGreaterThan(0);
            expect(locations.some(e => e.name === 'United States' || e.name === 'USA')).toBe(true);
            expect(locations.some(e => e.name === 'China')).toBe(true);
            expect(locations.some(e => e.name === 'Tokyo')).toBe(true);
            expect(locations.some(e => e.name === 'Berlin')).toBe(true);
        });

        it('should extract GOVERNMENT_BODY entities correctly', () => {
            const title = 'SEC announces new cryptocurrency regulations';
            const content = 'The Federal Reserve also commented on the matter.';

            const entities = EntityExtractor.extractEntities(title, content);

            const govBodies = entities.filter(e => e.type === 'GOVERNMENT_BODY');
            expect(govBodies.length).toBeGreaterThan(0);
            expect(govBodies.some(e => e.name === 'SEC')).toBe(true);
        });

        it('should handle empty input gracefully', () => {
            const entities = EntityExtractor.extractEntities('', '');
            expect(entities).toEqual([]);
        });

        it('should deduplicate entities by normalized name', () => {
            const title = 'Bitcoin BTC continues to rise';
            const content = 'Bitcoin is leading the market';

            const entities = EntityExtractor.extractEntities(title, content);
            const bitcoinEntities = entities.filter(e => e.normalized === 'bitcoin');

            // Should only have one Bitcoin entity, not two
            expect(bitcoinEntities.length).toBe(1);
        });
    });

    describe('Confidence Scoring', () => {

        it('should assign higher confidence to multi-word entities', () => {
            const title = 'Elon Musk speaks about Tesla';
            const entities = EntityExtractor.extractEntities(title, '');

            const elonMusk = entities.find(e => e.name === 'Elon Musk');
            const tesla = entities.find(e => e.name === 'Tesla');

            expect(elonMusk).toBeDefined();
            expect(tesla).toBeDefined();
            if (elonMusk && tesla) {
                expect(elonMusk.confidence).toBeGreaterThan(tesla.confidence);
            }
        });

        it('should assign higher confidence to properly cased entities', () => {
            const title = 'Bitcoin and ethereum price update';
            const entities = EntityExtractor.extractEntities(title, '');

            const bitcoin = entities.find(e => e.name === 'Bitcoin');
            const ethereum = entities.find(e => e.name === 'ethereum');

            expect(bitcoin).toBeDefined();
            expect(ethereum).toBeDefined();
            if (bitcoin && ethereum) {
                expect(bitcoin.confidence).toBeGreaterThan(ethereum.confidence);
            }
        });

        it('should assign higher confidence to all-caps token symbols', () => {
            const title = 'BTC and ETH trading volume increases';
            const entities = EntityExtractor.extractEntities(title, '');

            const btc = entities.find(e => e.name === 'BTC' && e.type === 'TOKEN');
            const eth = entities.find(e => e.name === 'ETH' && e.type === 'TOKEN');

            expect(btc).toBeDefined();
            expect(eth).toBeDefined();
            if (btc && eth) {
                expect(btc.confidence).toBeGreaterThan(0.6);
                expect(eth.confidence).toBeGreaterThan(0.6);
            }
        });

        it('should assign higher confidence to entities with organizational suffixes', () => {
            const title = 'Goldman Sachs and Morgan Stanley report earnings';
            const entities = EntityExtractor.extractEntities(title, '');

            const goldman = entities.find(e => e.name === 'Goldman Sachs');
            const morgan = entities.find(e => e.name === 'Morgan Stanley');

            expect(goldman).toBeDefined();
            expect(morgan).toBeDefined();
            if (goldman && morgan) {
                expect(goldman.confidence).toBeGreaterThan(0.7);
                expect(morgan.confidence).toBeGreaterThan(0.7);
            }
        });

        it('should ensure confidence scores are between 0 and 1', () => {
            const title = 'Elon Musk at Goldman Sachs discusses Bitcoin with SEC';
            const entities = EntityExtractor.extractEntities(title, '');

            entities.forEach(entity => {
                expect(entity.confidence).toBeGreaterThanOrEqual(0);
                expect(entity.confidence).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('Deduplication', () => {

        it('should deduplicate entities keeping highest confidence', () => {
            const title = 'Bitcoin BTC continues to rise as Bitcoin leads';
            const entities = EntityExtractor.extractEntities(title, '');

            const bitcoinEntities = entities.filter(e => e.normalized === 'bitcoin');
            expect(bitcoinEntities.length).toBe(1);
        });

        it('should deduplicate case-insensitively', () => {
            const title = 'Bitcoin bitcoin BTC btc';
            const entities = EntityExtractor.extractEntities(title, '');

            const bitcoinEntities = entities.filter(e => e.normalized === 'bitcoin');
            expect(bitcoinEntities.length).toBe(1);
        });

        it('should keep highest confidence entity when duplicates found', () => {
            const title = 'Bitcoin continues to rise as BTC leads';
            const entities = EntityExtractor.extractEntities(title, '');

            const bitcoin = entities.find(e => e.normalized === 'bitcoin');
            expect(bitcoin).toBeDefined();
            if (bitcoin) {
                // Should prefer "BTC" (all caps token) over "Bitcoin"
                expect(bitcoin.confidence).toBeGreaterThan(0.6);
            }
        });
    });

    describe('classifyLocation', () => {

        it('should classify United States as COUNTRY', () => {
            const entity: ExtractedEntity = {
                name: 'United States',
                type: 'LOCATION',
                confidence: 0.8,
                normalized: 'united states'
            };

            const classification = EntityExtractor.classifyLocation(entity);
            expect(classification).toBe('COUNTRY');
        });

        it('should classify USA as COUNTRY', () => {
            const entity: ExtractedEntity = {
                name: 'USA',
                type: 'LOCATION',
                confidence: 0.9,
                normalized: 'usa'
            };

            const classification = EntityExtractor.classifyLocation(entity);
            expect(classification).toBe('COUNTRY');
        });

        it('should classify Tokyo as LOCATION (not country)', () => {
            const entity: ExtractedEntity = {
                name: 'Tokyo',
                type: 'LOCATION',
                confidence: 0.8,
                normalized: 'tokyo'
            };

            const classification = EntityExtractor.classifyLocation(entity);
            expect(classification).toBe('LOCATION');
        });

        it('should classify China as COUNTRY', () => {
            const entity: ExtractedEntity = {
                name: 'China',
                type: 'LOCATION',
                confidence: 0.8,
                normalized: 'china'
            };

            const classification = EntityExtractor.classifyLocation(entity);
            expect(classification).toBe('COUNTRY');
        });

        it('should classify European Union as COUNTRY', () => {
            const entity: ExtractedEntity = {
                name: 'European Union',
                type: 'LOCATION',
                confidence: 0.8,
                normalized: 'european union'
            };

            const classification = EntityExtractor.classifyLocation(entity);
            expect(classification).toBe('COUNTRY');
        });
    });

    describe('Mixed Entity Types', () => {

        it('should extract multiple entity types from mixed content', () => {
            const title = 'Elon Musk meets with SEC officials in Washington';
            const content = 'The discussion covered Bitcoin regulations for Tesla and Binance.';

            const entities = EntityExtractor.extractEntities(title, content);

            const persons = entities.filter(e => e.type === 'PERSON');
            const orgs = entities.filter(e => e.type === 'ORGANIZATION');
            const tokens = entities.filter(e => e.type === 'TOKEN');
            const locations = entities.filter(e => e.type === 'LOCATION');
            const govBodies = entities.filter(e => e.type === 'GOVERNMENT_BODY');

            expect(persons.length).toBeGreaterThan(0);
            expect(orgs.length).toBeGreaterThan(0);
            expect(tokens.length).toBeGreaterThan(0);
            expect(locations.length).toBeGreaterThan(0);
            expect(govBodies.length).toBeGreaterThan(0);
        });

        it('should extract crypto-related entities correctly', () => {
            const title = 'Bitcoin surges as BlackRock announces ETF';
            const content = 'Ethereum and Solana also rally on the news. Vitalik Buterin comments on the developments.';

            const entities = EntityExtractor.extractEntities(title, content);

            const tokens = entities.filter(e => e.type === 'TOKEN');
            const persons = entities.filter(e => e.type === 'PERSON');
            const orgs = entities.filter(e => e.type === 'ORGANIZATION');

            expect(tokens.length).toBeGreaterThan(0);
            expect(persons.length).toBeGreaterThan(0);
            expect(orgs.length).toBeGreaterThan(0);

            expect(tokens.some(e => e.name.includes('Bitcoin'))).toBe(true);
            expect(tokens.some(e => e.name.includes('Ethereum'))).toBe(true);
            expect(tokens.some(e => e.name.includes('Solana'))).toBe(true);
            expect(persons.some(e => e.name === 'Vitalik Buterin')).toBe(true);
            expect(orgs.some(e => e.name === 'BlackRock')).toBe(true);
        });
    });

    describe('Edge Cases', () => {

        it('should handle text with no entities', () => {
            const title = 'The weather is nice today';
            const content = 'People are enjoying the sunshine.';

            const entities = EntityExtractor.extractEntities(title, content);

            // May still find some generic entities, but should be minimal
            expect(entities.length).toBeLessThan(5);
        });

        it('should handle very long text', () => {
            const title = 'Major financial news';
            const content = 'Elon Musk '.repeat(100) + ' Bitcoin '.repeat(100);

            const entities = EntityExtractor.extractEntities(title, content);

            // Should deduplicate, not return 200+ entities
            expect(entities.length).toBeLessThan(10);
        });

        it('should handle special characters in text', () => {
            const title = 'Bitcoin (BTC) reaches $50,000! What\'s next?';
            const content = 'Analysts say "it\'s a milestone" for crypto.';

            const entities = EntityExtractor.extractEntities(title, content);

            expect(entities.some(e => e.name.includes('Bitcoin') || e.name.includes('BTC'))).toBe(true);
        });

        it('should normalize entity names correctly', () => {
            const title = 'ELON MUSK and bitcoin BTC';
            const entities = EntityExtractor.extractEntities(title, '');

            entities.forEach(entity => {
                expect(entity.normalized).toBe(entity.normalized.toLowerCase().trim());
                expect(entity.normalized).not.toMatch(/\s{2,}/); // No multiple spaces
            });
        });
    });
});
