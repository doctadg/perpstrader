// News Agent Orchestrator
// Coordinates all nodes in the news pipeline with layered filtering
// Rebuilt for real-time quality control during scraping

import { NewsAgentState, createInitialNewsState, TRADING_CATEGORIES } from './state';
import {
  searchNode,
  scrapeNode,
  qualityFilterNode,
  categorizeNode,
  topicGenerationNode,
  redundancyFilterNode,
  storyClusterNode,
  storeNode,
  cleanupNode,
} from './nodes';
import { enhancedStoryClusterNode } from './enhanced-story-cluster-node';
import logger from '../shared/logger';
import circuitBreaker from '../shared/circuit-breaker';

export { NewsAgentState, createInitialNewsState, TRADING_CATEGORIES };

/**
 * News Orchestrator - LangGraph-based news processing pipeline
 * Implements layered filtering with fail-fast behavior
 */
export class NewsOrchestrator {
  private consecutiveErrors: number = 0;
  private maxConsecutiveErrors: number = 5;

  /**
   * Execute one full news cycle with enhanced error handling
   */
  async invoke(initialState: NewsAgentState): Promise<NewsAgentState> {
    // Check circuit breakers before starting
    const executionBreaker = circuitBreaker.getBreakerStatus('news-execution');
    if (executionBreaker?.isOpen) {
      logger.warn('[NewsOrchestrator] Execution circuit breaker is OPEN, skipping cycle');
      return {
        ...initialState,
        currentStep: 'SKIPPED_CIRCUIT_BREAKER',
        thoughts: [...initialState.thoughts, 'Cycle skipped: Execution circuit breaker is open'],
        errors: [...initialState.errors, 'Execution circuit breaker is open'],
      };
    }

    let state = { ...initialState };

    try {
      logger.info(`[NewsOrchestrator] Starting news cycle ${state.cycleId}`);
      logger.info(`[NewsOrchestrator] Processing categories: ${state.categories.join(', ')}`);

      // Step 1: Search for articles
      state = { ...state, ...await this.safeExecute('search', () => searchNode(state)) };
      state.stats.searched = state.searchResults.size > 0
        ? Array.from(state.searchResults.values()).reduce((sum, arr) => sum + arr.length, 0)
        : 0;

      if (state.stats.searched === 0) {
        logger.warn('[NewsOrchestrator] No articles found, ending cycle');
        return {
          ...state,
          currentStep: 'NO_ARTICLES_FOUND',
          thoughts: [...state.thoughts, 'No search results returned'],
        };
      }

      // Step 2: Scrape articles with inline filtering (language + quality)
      state = { ...state, ...await this.safeExecute('scrape', () => scrapeNode(state)) };
      state.stats.scraped = state.rawArticles.length;

      logger.info(`[NewsOrchestrator] Scraped ${state.stats.scraped} articles (raw)`);

      if (state.stats.scraped === 0) {
        logger.warn('[NewsOrchestrator] No articles passed scrape filter, ending cycle');
        return {
          ...state,
          currentStep: 'NO_ARTICLES_SCRAPED',
          thoughts: [...state.thoughts, 'All articles filtered during scraping'],
        };
      }

      // Step 3: Quality filter gate (LLM-based validation)
      state = { ...state, ...await this.safeExecute('quality-filter', () => qualityFilterNode(state)) };
      state.stats.filteredQuality = state.stats.scraped - state.filteredArticles.length;

      logger.info(`[NewsOrchestrator] Quality filter: ${state.filteredArticles.length}/${state.stats.scraped} passed`);

      if (state.filteredArticles.length === 0) {
        logger.warn('[NewsOrchestrator] No articles passed quality filter, ending cycle');
        return {
          ...state,
          currentStep: 'NO_ARTICLES_PASSED_QUALITY',
          thoughts: [...state.thoughts, 'All articles failed quality filter'],
        };
      }

      // Step 4: Categorize using gpt-oss-20b
      state = { ...state, ...await this.safeExecute('categorize', () => categorizeNode(state)) };
      state.stats.categorized = state.labeledArticles.length;

      logger.info(`[NewsOrchestrator] Categorized ${state.stats.categorized} articles`);

      if (state.stats.categorized === 0) {
        logger.warn('[NewsOrchestrator] No articles categorized, ending cycle');
        return {
          ...state,
          currentStep: 'NO_ARTICLES_CATEGORIZED',
          thoughts: [...state.thoughts, 'No articles were successfully categorized'],
        };
      }

      // Step 5: Topic generation with strict validation
      state = { ...state, ...await this.safeExecute('topic-generation', () => topicGenerationNode(state)) };
      state.stats.labeled = state.labeledArticles.length;

      logger.info(`[NewsOrchestrator] Topic generation: ${state.stats.labeled} articles labeled`);

      // Step 6: Redundancy filter (remove near-duplicates)
      state = { ...state, ...await this.safeExecute('redundancy-filter', () => redundancyFilterNode(state)) };
      state.stats.filteredRedundant = state.stats.categorized - state.labeledArticles.length;

      logger.info(`[NewsOrchestrator] Redundancy filter: ${state.stats.filteredRedundant} duplicates removed`);

      if (state.labeledArticles.length === 0) {
        logger.info('[NewsOrchestrator] No articles after redundancy filter, skipping storage');
        return {
          ...state,
          currentStep: 'NO_UNIQUE_ARTICLES',
          thoughts: [...state.thoughts, 'All articles were filtered as redundant'],
        };
      }

      // Step 7: Store articles in database
      state = { ...state, ...await this.safeExecute('store', () => storeNode(state), true) };

      // Step 8: Cluster related articles
      // Check if enhanced clustering is enabled
      const useEnhancedClustering =
        process.env.ENHANCED_CLUSTERING_ENABLED === 'true' ||
        process.env.USE_ENHANCED_CLUSTERING === 'true';

      if (useEnhancedClustering) {
        logger.info('[NewsOrchestrator] Using ENHANCED clustering mode');
        try {
          const enhancedResult = await enhancedStoryClusterNode(state);

          // Merge enhanced results into state
          state = {
            ...state,
            clusters: enhancedResult.clusters || [],
            anomalies: enhancedResult.anomalies || [],
            predictions: enhancedResult.predictions || [],
            trendingEntities: enhancedResult.trendingEntities || [],
          };

          // Update stats with enhanced clustering metrics
          if (enhancedResult.stats) {
            state.stats.clustered = (enhancedResult.clusters || []).length;

            // Log enhanced clustering stats
            logger.info(
              `[NewsOrchestrator] Enhanced clustering: ` +
              `${enhancedResult.stats.newClusters || 0} new, ` +
              `${enhancedResult.stats.existingClusters || 0} existing, ` +
              `${enhancedResult.stats.mergedClusters || 0} merged, ` +
              `${enhancedResult.stats.entitiesExtracted || 0} entities, ` +
              `${enhancedResult.stats.anomaliesDetected || 0} anomalies, ` +
              `${enhancedResult.stats.predictionsGenerated || 0} predictions`
            );
          }
        } catch (error) {
          logger.error('[NewsOrchestrator] Enhanced clustering failed, falling back to original:', error);
          // Graceful fallback to original clustering
          state = { ...state, ...await this.safeExecute('cluster-fallback', () => storyClusterNode(state)) };
          state.stats.clustered = state.clusters?.length || 0;
          logger.info(`[NewsOrchestrator] Fallback clustering: Created ${state.stats.clustered} clusters`);
        }
      } else {
        logger.info('[NewsOrchestrator] Using STANDARD clustering mode');
        state = { ...state, ...await this.safeExecute('cluster', () => storyClusterNode(state)) };
        state.stats.clustered = state.clusters?.length || 0;
        logger.info(`[NewsOrchestrator] Created ${state.stats.clustered} clusters`);
      }

      // Step 9: Cleanup and stats
      state = { ...state, ...await this.safeExecute('cleanup', () => cleanupNode(state)) };

      // Reset error counter on successful completion
      this.consecutiveErrors = 0;

      return state;

    } catch (error) {
      this.consecutiveErrors++;
      logger.error('[NewsOrchestrator] Cycle failed:', error);

      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if we need to open circuit breaker
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        circuitBreaker.openBreaker('news-execution');
        logger.error(`[NewsOrchestrator] Opened execution circuit breaker after ${this.consecutiveErrors} consecutive errors`);
      }

      return {
        ...state,
        errors: [...state.errors, `Orchestrator error: ${errorMsg}`],
        currentStep: 'ERROR',
        thoughts: [
          ...state.thoughts,
          `Cycle failed with error: ${errorMsg}`,
          `Consecutive errors: ${this.consecutiveErrors}/${this.maxConsecutiveErrors}`,
        ],
      };
    }
  }

  /**
   * Execute a node with circuit breaker protection and fallback handling
   */
  private async safeExecute<T>(
    nodeName: string,
    fn: () => Promise<T>,
    isCritical: boolean = false
  ): Promise<T> {
    const breakerName = isCritical ? 'news-execution' : nodeName;

    return circuitBreaker.execute(
      breakerName,
      fn,
      isCritical ? undefined : () => this.getFallbackResult(nodeName)
    );
  }

  /**
   * Get fallback result when a node fails
   */
  private async getFallbackResult(nodeName: string): Promise<any> {
    logger.warn(`[NewsOrchestrator] Using fallback for ${nodeName}`);

    switch (nodeName) {
      case 'search':
        return {
          currentStep: 'SEARCH_FALLBACK',
          searchResults: new Map(),
          thoughts: ['Search failed, returning empty results'],
        };

      case 'scrape':
        return {
          currentStep: 'SCRAPE_FALLBACK',
          rawArticles: [],
          thoughts: ['Scraping failed, no articles to process'],
        };

      case 'quality-filter':
        return {
          currentStep: 'QUALITY_FILTER_FALLBACK',
          filteredArticles: [],
          thoughts: ['Quality filter failed, no articles passed'],
        };

      case 'categorize':
        return {
          currentStep: 'CATEGORIZE_FALLBACK',
          labeledArticles: [],
          thoughts: ['Categorization failed, using fallback'],
        };

      case 'topic-generation':
        return {
          currentStep: 'TOPIC_GENERATION_FALLBACK',
          labeledArticles: [],
          thoughts: ['Topic generation failed, using existing labels'],
        };

      case 'redundancy-filter':
        return {
          currentStep: 'REDUNDANCY_FILTER_FALLBACK',
          thoughts: ['Redundancy filter failed, skipping duplicate removal'],
        };

      case 'cluster':
        return {
          currentStep: 'CLUSTER_FALLBACK',
          clusters: [],
          thoughts: ['Clustering failed, no clusters created'],
        };

      case 'cluster-fallback':
        return {
          currentStep: 'CLUSTER_FALLBACK_FAILED',
          clusters: [],
          thoughts: ['Both enhanced and fallback clustering failed'],
        };

      default:
        return {
          currentStep: `${nodeName.toUpperCase()}_FALLBACK`,
          thoughts: [`Node ${nodeName} failed, using fallback`],
        };
    }
  }

  /**
   * Reset error counters
   */
  resetErrorCounters(): void {
    this.consecutiveErrors = 0;
    circuitBreaker.resetBreaker('news-execution');
    logger.info('[NewsOrchestrator] Error counters reset');
  }

  /**
   * Get orchestrator health status
   */
  getHealthStatus(): {
    consecutiveErrors: number;
    maxConsecutiveErrors: number;
    executionBreakerOpen: boolean;
    status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  } {
    const executionBreaker = circuitBreaker.getBreakerStatus('news-execution');
    const executionBreakerOpen = executionBreaker?.isOpen || false;

    let status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    if (executionBreakerOpen || this.consecutiveErrors >= this.maxConsecutiveErrors) {
      status = 'CRITICAL';
    } else if (this.consecutiveErrors > 0) {
      status = 'DEGRADED';
    }

    return {
      consecutiveErrors: this.consecutiveErrors,
      maxConsecutiveErrors: this.maxConsecutiveErrors,
      executionBreakerOpen,
      status,
    };
  }
}

// Singleton instance
const orchestrator = new NewsOrchestrator();

export function buildNewsGraph(): NewsOrchestrator {
  return orchestrator;
}

/**
 * Run a full news cycle across all trading categories
 */
export async function runNewsCycle(): Promise<NewsAgentState> {
  logger.info('[NewsOrchestrator] Starting news cycle for trading categories');

  const initialState = createInitialNewsState();
  const result = await orchestrator.invoke(initialState);

  const stats = result.stats;
  logger.info(
    `[NewsOrchestrator] Cycle completed. ` +
    `Searched: ${stats.searched}, ` +
    `Scraped: ${stats.scraped}, ` +
    `Filtered: ${stats.filteredQuality + stats.filteredLanguage + stats.filteredCategory}, ` +
    `Categorized: ${stats.categorized}, ` +
    `Labeled: ${stats.labeled}, ` +
    `Clusters: ${stats.clustered}`
  );

  return result;
}

/**
 * Run a single category news cycle
 */
export async function runSingleCategoryCycle(
  category: import('../shared/types').NewsCategory,
  queriesPerCategory: number = 3
): Promise<NewsAgentState> {
  logger.info(`[NewsOrchestrator] Starting single category cycle: ${category}`);

  // Validate category
  if (!TRADING_CATEGORIES.includes(category as any)) {
    logger.warn(`[NewsOrchestrator] Category ${category} is not in trading categories, adding anyway`);
  }

  // Create state with only the target category
  const initialState = createInitialNewsState();
  initialState.categories = [category];

  // Set environment for query count (used by news-search service)
  const originalQueryCount = process.env.NEWS_QUERIES_PER_CATEGORY;
  process.env.NEWS_QUERIES_PER_CATEGORY = String(queriesPerCategory);

  try {
    const result = await orchestrator.invoke(initialState);
    logger.info(`[NewsOrchestrator] ${category} cycle completed. Clusters: ${result.stats.clustered}`);
    return result;
  } finally {
    // Restore original value
    if (originalQueryCount !== undefined) {
      process.env.NEWS_QUERIES_PER_CATEGORY = originalQueryCount;
    } else {
      delete process.env.NEWS_QUERIES_PER_CATEGORY;
    }
  }
}

export default buildNewsGraph;
