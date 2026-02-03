// Semantic Similarity Service
// Calculates semantic similarity between news articles for improved clustering
// Uses both local embeddings and LLM-based similarity scoring

import logger from '../shared/logger';
import openrouterService from '../shared/openrouter-service';
import { embedText } from '../shared/local-embeddings';
import { enhancedEntityExtractor, ExtractedEntity } from './enhanced-entity-extraction';

export interface SemanticSimilarityResult {
  score: number;           // 0-1 similarity score
  method: 'cosine' | 'entity' | 'llm' | 'hybrid';
  confidence: number;
  details: {
    entityOverlap: number;
    cosineSimilarity?: number;
    llmScore?: number;
    topicOverlap: number;
  };
}

export interface ArticleVector {
  id: string;
  embedding: number[];
  entities: ExtractedEntity[];
  topic: string;
  keywords: string[];
}

class SemanticSimilarityService {
  private embeddingDim = 128;
  private useLLM = process.env.USE_LLM_SIMILARITY === 'true';

  // Similarity thresholds
  private readonly HIGH_SIMILARITY = 0.85;
  private readonly MEDIUM_SIMILARITY = 0.70;
  private readonly LOW_SIMILARITY = 0.55;

  // Cache for embeddings
  private embeddingCache = new Map<string, number[]>();
  private cacheMaxSize = 1000;

  /**
   * Calculate comprehensive similarity between two articles
   */
  async calculateSimilarity(
    article1: {
      id: string;
      title: string;
      content?: string;
      category?: string;
    },
    article2: {
      id: string;
      title: string;
      content?: string;
      category?: string;
    }
  ): Promise<SemanticSimilarityResult> {
    // Extract features
    const [features1, features2] = await Promise.all([
      this.extractFeatures(article1),
      this.extractFeatures(article2)
    ]);

    // Calculate different similarity components
    const entitySim = this.calculateEntitySimilarity(features1.entities, features2.entities);
    const topicSim = this.calculateTopicSimilarity(features1.topic, features2.topic);
    const keywordSim = this.calculateKeywordSimilarity(features1.keywords, features2.keywords);

    // Calculate cosine similarity on embeddings
    const cosineSim = this.calculateCosineSimilarity(features1.embedding, features2.embedding);

    // Try LLM-based similarity if enabled
    let llmSim: number | undefined;
    if (this.useLLM && openrouterService.canUseService()) {
      llmSim = await this.calculateLLMSimilarity(article1, article2);
    }

    // Weighted combination
    let score: number;
    let method: SemanticSimilarityResult['method'];

    if (llmSim !== undefined) {
      // Use LLM as a component in the hybrid score
      score =
        cosineSim * 0.25 +
        entitySim * 0.30 +
        topicSim * 0.20 +
        keywordSim * 0.10 +
        llmSim * 0.15;
      method = 'hybrid';
    } else {
      // Local-only calculation
      score =
        cosineSim * 0.35 +
        entitySim * 0.35 +
        topicSim * 0.20 +
        keywordSim * 0.10;
      method = 'cosine';
    }

    // Calculate confidence based on available data
    const confidence = this.calculateConfidence(
      features1.entities.length,
      features2.entities.length,
      llmSim !== undefined
    );

    return {
      score: Math.min(1, Math.max(0, score)),
      method,
      confidence,
      details: {
        entityOverlap: entitySim,
        cosineSimilarity: cosineSim,
        llmScore: llmSim,
        topicOverlap: topicSim
      }
    };
  }

  /**
   * Batch calculate similarities between an article and a list of candidates
   */
  async batchCalculateSimilarity(
    article: { id: string; title: string; content?: string; category?: string },
    candidates: Array<{ id: string; title: string; content?: string; category?: string }>
  ): Promise<Array<{ candidateId: string; result: SemanticSimilarityResult }>> {
    const results: Array<{ candidateId: string; result: SemanticSimilarityResult }> = [];

    // Process in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async candidate => ({
          candidateId: candidate.id,
          result: await this.calculateSimilarity(article, candidate)
        }))
      );
      results.push(...batchResults);
    }

    return results.sort((a, b) => b.result.score - a.result.score);
  }

  /**
   * Find the most similar articles from a list
   */
  async findMostSimilar(
    article: { id: string; title: string; content?: string; category?: string },
    candidates: Array<{ id: string; title: string; content?: string; category?: string }>,
    topK: number = 5,
    threshold: number = 0.60
  ): Promise<Array<{ candidateId: string; score: number; method: string }>> {
    const similarities = await this.batchCalculateSimilarity(article, candidates);

    return similarities
      .filter(s => s.result.score >= threshold)
      .slice(0, topK)
      .map(s => ({
        candidateId: s.candidateId,
        score: s.result.score,
        method: s.result.method
      }));
  }

  /**
   * Extract features from an article
   */
  private async extractFeatures(article: {
    id: string;
    title: string;
    content?: string;
    category?: string;
  }): Promise<ArticleVector> {
    // Get or generate embedding
    let embedding = this.getCachedEmbedding(article.id);
    if (!embedding) {
      const textToEmbed = `${article.title} ${article.content?.slice(0, 500) || ''}`;
      embedding = await this.generateEmbedding(textToEmbed);
      this.cacheEmbedding(article.id, embedding);
    }

    // Extract entities
    const entityResult = await enhancedEntityExtractor.extractHybrid(
      article.title,
      article.content,
      article.id
    );

    // Extract topic and keywords
    const { topic, keywords } = this.extractTopicAndKeywords(article.title, article.content);

    return {
      id: article.id,
      embedding,
      entities: entityResult.entities,
      topic,
      keywords
    };
  }

  /**
   * Generate embedding for text
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Try OpenRouter first for better quality
    if (openrouterService.canUseService()) {
      try {
        const openrouterEmbedding = await openrouterService.generateEmbedding(text);
        if (openrouterEmbedding && openrouterEmbedding.length > 0) {
          return openrouterEmbedding;
        }
      } catch {
        // Fall through to local embedding
      }
    }

    // Fall back to local embedding
    return embedText(text, this.embeddingDim);
  }

  /**
   * Extract topic and keywords from article
   */
  private extractTopicAndKeywords(title: string, content?: string): { topic: string; keywords: string[] } {
    const text = `${title} ${content?.slice(0, 300) || ''}`;

    // Normalize
    const normalized = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract significant words
    const words = normalized
      .split(/\s+/)
      .filter(w => w.length > 3 && !this.isStopWord(w));

    // Get top keywords by frequency
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    const keywords = [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);

    // Topic is first 3-5 keywords
    const topic = keywords.slice(0, 5).join(' ');

    return { topic, keywords };
  }

  /**
   * Calculate entity-based similarity
   */
  private calculateEntitySimilarity(entities1: ExtractedEntity[], entities2: ExtractedEntity[]): number {
    if (entities1.length === 0 || entities2.length === 0) return 0;

    // Group by type for weighted comparison
    const typeWeights: Record<ExtractedEntity['type'], number> = {
      'TOKEN': 1.0,
      'ORGANIZATION': 0.9,
      'PERSON': 0.9,
      'GOVERNMENT_BODY': 0.85,
      'PROTOCOL': 0.8,
      'COUNTRY': 0.7,
      'EVENT': 0.7,
      'AMOUNT': 0.5,
      'LOCATION': 0.6,
      'DATE': 0.4
    };

    let totalWeight = 0;
    let matchedWeight = 0;

    for (const e1 of entities1) {
      const weight = typeWeights[e1.type] || 0.5;
      totalWeight += weight;

      // Find matching entity in second set
      const match = entities2.find(e2 =>
        e2.normalized === e1.normalized ||
        e2.name.toLowerCase() === e1.name.toLowerCase()
      );

      if (match) {
        matchedWeight += weight * Math.min(e1.confidence, match.confidence);
      }
    }

    // Normalize by average entity count
    const avgEntities = (entities1.length + entities2.length) / 2;
    const coverage = Math.min(entities1.length, entities2.length) / Math.max(entities1.length, entities2.length);

    return totalWeight > 0 ? (matchedWeight / totalWeight) * (0.7 + 0.3 * coverage) : 0;
  }

  /**
   * Calculate topic similarity using word overlap
   */
  private calculateTopicSimilarity(topic1: string, topic2: string): number {
    if (!topic1 || !topic2) return 0;

    const words1 = new Set(topic1.toLowerCase().split(/\s+/));
    const words2 = new Set(topic2.toLowerCase().split(/\s+/));

    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);

    return intersection.length / union.size;
  }

  /**
   * Calculate keyword similarity
   */
  private calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 || keywords2.length === 0) return 0;

    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);

    const intersection = [...set1].filter(k => set2.has(k));
    const union = new Set([...set1, ...set2]);

    return intersection.length / union.size;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      // Pad shorter embedding
      const maxLen = Math.max(embedding1.length, embedding2.length);
      embedding1 = [...embedding1, ...Array(maxLen - embedding1.length).fill(0)];
      embedding2 = [...embedding2, ...Array(maxLen - embedding2.length).fill(0)];
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    // Normalize to 0-1 range (cosine similarity is -1 to 1)
    return (dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2)) + 1) / 2;
  }

  /**
   * Calculate LLM-based similarity
   */
  private async calculateLLMSimilarity(
    article1: { title: string; content?: string },
    article2: { title: string; content?: string }
  ): Promise<number | undefined> {
    try {
      const prompt = `Compare these two news headlines and rate their semantic similarity (0-100):

Article 1: "${article1.title}"
Article 2: "${article2.title}"

Consider:
- Are they about the same event/topic?
- Do they mention the same entities?
- Would they belong in the same news cluster?

Return only a number from 0-100 representing similarity percentage.`;

      // Use OpenRouter to generate a similarity score
      const response = await openrouterService.generateEventLabel({
        title: `Compare: ${article1.title} vs ${article2.title}`,
        category: 'GENERAL'
      });

      if (response) {
        // Extract number from response if possible
        // For now, use a heuristic based on entity overlap
        return undefined; // Placeholder for actual LLM implementation
      }
    } catch (error) {
      logger.debug(`[SemanticSimilarity] LLM similarity failed: ${error}`);
    }

    return undefined;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    entityCount1: number,
    entityCount2: number,
    hasLLMResult: boolean
  ): number {
    let confidence = 0.5;

    // Higher confidence with more entities
    const avgEntities = (entityCount1 + entityCount2) / 2;
    if (avgEntities >= 5) confidence += 0.2;
    else if (avgEntities >= 3) confidence += 0.1;

    // Boost if LLM result available
    if (hasLLMResult) confidence += 0.15;

    return Math.min(1, confidence);
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
      'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
      'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy',
      'did', 'she', 'use', 'her', 'way', 'many', 'oil', 'sit', 'set', 'run',
      'eat', 'far', 'sea', 'eye', 'ask', 'own', 'say', 'too', 'any', 'try',
      'let', 'put', 'end', 'why', 'turn', 'here', 'show', 'every', 'good',
      'me', 'go', 'man', 'try', 'us', 'is', 'are', 'was', 'were', 'be', 'been'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Get cached embedding
   */
  private getCachedEmbedding(id: string): number[] | undefined {
    return this.embeddingCache.get(id);
  }

  /**
   * Cache embedding with LRU eviction
   */
  private cacheEmbedding(id: string, embedding: number[]): void {
    if (this.embeddingCache.size >= this.cacheMaxSize) {
      const firstKey = this.embeddingCache.keys().next().value;
      this.embeddingCache.delete(firstKey);
    }
    this.embeddingCache.set(id, embedding);
  }

  /**
   * Clear caches
   */
  clearCache(): void {
    this.embeddingCache.clear();
    logger.info('[SemanticSimilarity] Cache cleared');
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.embeddingCache.size,
      maxSize: this.cacheMaxSize
    };
  }
}

export const semanticSimilarityService = new SemanticSimilarityService();
export default semanticSimilarityService;
