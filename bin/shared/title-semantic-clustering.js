"use strict";
// Title Semantic Similarity Service
// Provides advanced semantic clustering for news titles using LLM-based similarity
// Addresses "weak title clustering" issue in the original system
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.titleSemanticClustering = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const title_cleaner_1 = require("./title-cleaner");
class TitleSemanticClustering {
    // Configuration
    EXACT_MATCH_THRESHOLD = 0.95;
    SEMANTIC_MATCH_THRESHOLD = 0.80;
    ENTITY_MATCH_THRESHOLD = 0.70;
    TOPIC_MATCH_THRESHOLD = 0.60;
    MAX_BATCH_SIZE = 50;
    // Cache for title analyses
    analysisCache = new Map();
    cacheMaxSize = 1000;
    /**
     * Calculate similarity between two titles using multiple methods
     */
    async calculateSimilarity(title1, title2) {
        // Fast path: exact fingerprint match
        const fp1 = (0, title_cleaner_1.getTitleFingerprint)(title1);
        const fp2 = (0, title_cleaner_1.getTitleFingerprint)(title2);
        if (fp1 === fp2 && fp1.length > 10) {
            return {
                title1,
                title2,
                similarityScore: 1.0,
                similarityType: 'exact',
                sharedEntities: [],
                confidence: 1.0
            };
        }
        // Get or generate analyses
        const [analysis1, analysis2] = await Promise.all([
            this.getTitleAnalysis(title1),
            this.getTitleAnalysis(title2)
        ]);
        // Calculate entity overlap
        const sharedEntities = analysis1.entities.filter(e => analysis2.entities.some(e2 => e.toLowerCase() === e2.toLowerCase()));
        // Calculate entity-based similarity
        const entitySim = this.calculateEntitySimilarity(analysis1.entities, analysis2.entities);
        // Calculate topic similarity
        const topicSim = this.calculateTopicSimilarity(analysis1.topic, analysis2.topic);
        // Calculate phrase overlap
        const phraseSim = this.calculatePhraseOverlap(analysis1.keyPhrases, analysis2.keyPhrases);
        // Weighted combination
        const similarityScore = Math.min(1.0, entitySim * 0.4 + // 40% entity overlap
            topicSim * 0.35 + // 35% topic similarity
            phraseSim * 0.25 // 25% phrase overlap
        );
        // Determine similarity type
        let similarityType = 'none';
        if (similarityScore >= this.EXACT_MATCH_THRESHOLD)
            similarityType = 'exact';
        else if (similarityScore >= this.SEMANTIC_MATCH_THRESHOLD)
            similarityType = 'semantic';
        else if (similarityScore >= this.ENTITY_MATCH_THRESHOLD)
            similarityType = 'entity';
        else if (similarityScore >= this.TOPIC_MATCH_THRESHOLD)
            similarityType = 'topic';
        return {
            title1,
            title2,
            similarityScore,
            similarityType,
            sharedEntities,
            confidence: this.calculateConfidence(analysis1, analysis2, similarityScore)
        };
    }
    /**
     * Batch cluster titles using semantic similarity
     */
    async clusterTitles(articles, similarityThreshold = 0.75) {
        if (articles.length === 0)
            return [];
        logger_1.default.info(`[TitleClustering] Clustering ${articles.length} articles...`);
        const clusters = [];
        const processed = new Set();
        // Pre-analyze all titles
        const analyses = await this.batchAnalyzeTitles(articles.map(a => a.title));
        const analysisMap = new Map(articles.map((a, i) => [a.id, analyses[i]]));
        for (const article of articles) {
            if (processed.has(article.id))
                continue;
            const articleAnalysis = analysisMap.get(article.id);
            let bestCluster = null;
            let bestScore = 0;
            // Find best matching cluster
            for (const cluster of clusters) {
                const clusterAnalysis = await this.getTitleAnalysis(cluster.representativeTitle);
                const score = this.calculateClusterSimilarity(articleAnalysis, clusterAnalysis);
                if (score > bestScore && score >= similarityThreshold) {
                    bestScore = score;
                    bestCluster = cluster;
                }
            }
            if (bestCluster) {
                // Add to existing cluster
                bestCluster.titles.push(article.title);
                bestCluster.articleIds.push(article.id);
                processed.add(article.id);
                // Update entities
                articleAnalysis.entities.forEach(e => {
                    if (!bestCluster.entities.includes(e)) {
                        bestCluster.entities.push(e);
                    }
                });
            }
            else {
                // Create new cluster
                const newCluster = {
                    id: `cluster_${Date.now()}_${clusters.length}`,
                    representativeTitle: article.title,
                    titles: [article.title],
                    articleIds: [article.id],
                    entities: [...articleAnalysis.entities],
                    topicFingerprint: articleAnalysis.topic,
                    createdAt: new Date()
                };
                clusters.push(newCluster);
                processed.add(article.id);
            }
        }
        logger_1.default.info(`[TitleClustering] Created ${clusters.length} clusters from ${articles.length} articles`);
        return clusters;
    }
    /**
     * Get or generate title analysis with caching
     */
    async getTitleAnalysis(title) {
        const fingerprint = (0, title_cleaner_1.getTitleFingerprint)(title);
        // Check cache
        if (this.analysisCache.has(fingerprint)) {
            return this.analysisCache.get(fingerprint);
        }
        // Generate analysis
        const analysis = await this.analyzeTitle(title);
        // Cache with LRU eviction
        if (this.analysisCache.size >= this.cacheMaxSize) {
            const firstKey = this.analysisCache.keys().next().value;
            this.analysisCache.delete(firstKey);
        }
        this.analysisCache.set(fingerprint, analysis);
        return analysis;
    }
    /**
     * Analyze a title using OpenRouter for entities and topic
     */
    async analyzeTitle(title) {
        // For now, use local analysis as fallback
        // This can be enhanced with LLM-based NER in the future
        const normalized = title
            .replace(/^(breaking|urgent|update|just in):\s*/i, '')
            .replace(/\s+[-–—]\s*\w+\s*$/i, '')
            .trim();
        // Extract entities using regex patterns
        const entities = this.extractEntitiesLocal(title);
        // Extract topic (first 3-5 significant words)
        const words = normalized
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3 && !this.isStopWord(w))
            .slice(0, 5);
        const topic = words.join(' ');
        // Extract key phrases
        const keyPhrases = this.extractKeyPhrases(title);
        // Simple sentiment detection
        const sentiment = this.detectSentiment(title);
        return {
            normalized,
            entities,
            topic,
            keyPhrases,
            sentiment
        };
    }
    /**
     * Batch analyze titles efficiently
     */
    async batchAnalyzeTitles(titles) {
        // Process in parallel with concurrency limit
        const results = [];
        const concurrency = 10;
        for (let i = 0; i < titles.length; i += concurrency) {
            const batch = titles.slice(i, i + concurrency);
            const batchResults = await Promise.all(batch.map(t => this.getTitleAnalysis(t)));
            results.push(...batchResults);
        }
        return results;
    }
    /**
     * Local entity extraction (fallback when LLM unavailable)
     */
    extractEntitiesLocal(title) {
        const entities = [];
        // Crypto tokens
        const cryptoPattern = /\b(Bitcoin|BTC|Ethereum|ETH|Solana|SOL|Cardano|ADA|Polkadot|DOT|Avalanche|AVAX|Chainlink|LINK|Uniswap|UNI|Aave|AAVE)\b/gi;
        const cryptoMatches = title.matchAll(cryptoPattern);
        for (const match of cryptoMatches) {
            entities.push(match[0]);
        }
        // Organizations
        const orgPattern = /\b(Fed|SEC|Fidelity|BlackRock|Binance|Coinbase|Tesla|Nvidia|Apple|Microsoft|Google|Amazon|Meta|JPMorgan|Goldman)\b/gi;
        const orgMatches = title.matchAll(orgPattern);
        for (const match of orgMatches) {
            entities.push(match[0]);
        }
        // People
        const peoplePattern = /\b(Jerome Powell|Jay Powell|Janet Yellen|Gary Gensler|Joe Biden|Donald Trump|Elon Musk|Vitalik Buterin|CZ|Changpeng Zhao)\b/gi;
        const peopleMatches = title.matchAll(peoplePattern);
        for (const match of peopleMatches) {
            entities.push(match[0]);
        }
        // Countries/Regions
        const countryPattern = /\b(United States|USA|US|China|Japan|Germany|UK|Britain|European Union|EU|Russia|India)\b/gi;
        const countryMatches = title.matchAll(countryPattern);
        for (const match of countryMatches) {
            entities.push(match[0]);
        }
        // Numbers/Amounts (often significant in news)
        const amountPattern = /\$[\d,]+(?:\.\d+)?\s*(?:billion|million|B|M)?|\b[\d,]+(?:\.\d+)?\s*(?:billion|million|B|M)\b/gi;
        const amountMatches = title.matchAll(amountPattern);
        for (const match of amountMatches) {
            entities.push(match[0]);
        }
        return [...new Set(entities.map(e => e.toLowerCase()))];
    }
    /**
     * Extract key phrases from title
     */
    extractKeyPhrases(title) {
        const phrases = [];
        // Bigrams (word pairs)
        const words = title
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2 && !this.isStopWord(w));
        for (let i = 0; i < words.length - 1; i++) {
            phrases.push(`${words[i]} ${words[i + 1]}`);
        }
        // Trigrams
        for (let i = 0; i < words.length - 2; i++) {
            phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
        }
        return [...new Set(phrases)];
    }
    /**
     * Detect sentiment from keywords
     */
    detectSentiment(title) {
        const positive = /\b(surges|rallies|soars|jumps|gains|rises|beats|approves|launches|partnership|breakthrough)\b/gi;
        const negative = /\b(crashes|plunges|drops|falls|declines|misses|rejects|bans|hacks|fraud|scam)\b/gi;
        const posMatches = (title.match(positive) || []).length;
        const negMatches = (title.match(negative) || []).length;
        if (posMatches > negMatches)
            return 'positive';
        if (negMatches > posMatches)
            return 'negative';
        return 'neutral';
    }
    /**
     * Calculate similarity between two entity lists
     */
    calculateEntitySimilarity(entities1, entities2) {
        if (entities1.length === 0 || entities2.length === 0)
            return 0;
        const set1 = new Set(entities1.map(e => e.toLowerCase()));
        const set2 = new Set(entities2.map(e => e.toLowerCase()));
        const intersection = [...set1].filter(e => set2.has(e));
        const union = new Set([...set1, ...set2]);
        return intersection.length / union.size;
    }
    /**
     * Calculate topic similarity
     */
    calculateTopicSimilarity(topic1, topic2) {
        if (!topic1 || !topic2)
            return 0;
        const words1 = new Set(topic1.toLowerCase().split(/\s+/));
        const words2 = new Set(topic2.toLowerCase().split(/\s+/));
        const intersection = [...words1].filter(w => words2.has(w));
        const union = new Set([...words1, ...words2]);
        return intersection.length / union.size;
    }
    /**
     * Calculate phrase overlap
     */
    calculatePhraseOverlap(phrases1, phrases2) {
        if (phrases1.length === 0 || phrases2.length === 0)
            return 0;
        const set1 = new Set(phrases1);
        const set2 = new Set(phrases2);
        const intersection = [...set1].filter(p => set2.has(p));
        const union = new Set([...set1, ...set2]);
        return intersection.length / union.size;
    }
    /**
     * Calculate cluster similarity score
     */
    calculateClusterSimilarity(analysis1, analysis2) {
        const entitySim = this.calculateEntitySimilarity(analysis1.entities, analysis2.entities);
        const topicSim = this.calculateTopicSimilarity(analysis1.topic, analysis2.topic);
        const phraseSim = this.calculatePhraseOverlap(analysis1.keyPhrases, analysis2.keyPhrases);
        return entitySim * 0.4 + topicSim * 0.35 + phraseSim * 0.25;
    }
    /**
     * Calculate confidence score for similarity
     */
    calculateConfidence(analysis1, analysis2, similarityScore) {
        let confidence = 0.5;
        // Higher confidence if we have entities from both
        if (analysis1.entities.length > 0 && analysis2.entities.length > 0) {
            confidence += 0.2;
        }
        // Higher confidence for high similarity scores
        if (similarityScore > 0.9)
            confidence += 0.2;
        else if (similarityScore > 0.8)
            confidence += 0.1;
        // Lower confidence if titles are very short
        const avgLength = (analysis1.normalized.length + analysis2.normalized.length) / 2;
        if (avgLength < 30)
            confidence -= 0.1;
        return Math.min(1, Math.max(0, confidence));
    }
    /**
     * Check if word is a stop word
     */
    isStopWord(word) {
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'for', 'nor', 'so', 'yet',
            'at', 'by', 'in', 'of', 'on', 'to', 'up', 'from', 'with', 'as',
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
            'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'
        ]);
        return stopWords.has(word.toLowerCase());
    }
    /**
     * Clear the analysis cache
     */
    clearCache() {
        this.analysisCache.clear();
        logger_1.default.info('[TitleClustering] Analysis cache cleared');
    }
    /**
     * Get cache stats
     */
    getCacheStats() {
        return {
            size: this.analysisCache.size,
            maxSize: this.cacheMaxSize
        };
    }
}
exports.titleSemanticClustering = new TitleSemanticClustering();
exports.default = exports.titleSemanticClustering;
//# sourceMappingURL=title-semantic-clustering.js.map