// Scrape Node - Scrape and analyze websites for tokens
// Uses web scraper to analyze website content quality

import logger from '../../shared/logger';
import { PumpFunAgentState, WebsiteAnalysis } from '../../shared/types';
import { addThought, updateStep } from '../state';

/**
 * Scrape websites for all queued tokens
 */
export async function scrapeNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  if (state.queuedTokens.length === 0) {
    logger.warn('[ScrapeNode] No tokens to scrape');
    return {
      ...addThought(state, 'No tokens to scrape'),
      ...updateStep(state, 'NO_TOKENS'),
    };
  }

  logger.info(`[ScrapeNode] Scraping websites for ${state.queuedTokens.length} tokens`);

  // Import web scraper service
  let webScraper: any;
  try {
    webScraper = (await import('../services/web-scraper')).default;
  } catch (error) {
    logger.error('[ScrapeNode] Failed to import web scraper service');
    return {
      ...addThought(state, 'Failed to import web scraper service'),
      ...updateStep(state, 'ERROR'),
    };
  }

  const websiteAnalyses = new Map<string, WebsiteAnalysis>();

  // Scrape websites with concurrency limit
  const concurrency = 3;
  for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
    const batch = state.queuedTokens.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (item: any) => {
        const token = item.token || item;
        const metadata = item.metadata || token;

        if (!metadata.website) {
          // No website to scrape
          websiteAnalyses.set(token.mintAddress, {
            url: '',
            exists: false,
            hasContent: false,
            contentQuality: 0,
            hasWhitepaper: false,
            hasTeamInfo: false,
            hasRoadmap: false,
            hasTokenomics: false,
            sslValid: false,
            glmAnalysis: 'No website provided',
          });
          return;
        }

        try {
          const analysis = await webScraper.analyzeWebsite(metadata.website, {
            name: metadata.name,
            symbol: metadata.symbol,
          });
          websiteAnalyses.set(token.mintAddress, analysis);
        } catch (error) {
          logger.debug(`[ScrapeNode] Failed to scrape ${metadata.website}: ${error}`);
          websiteAnalyses.set(token.mintAddress, {
            url: metadata.website,
            exists: false,
            hasContent: false,
            contentQuality: 0,
            hasWhitepaper: false,
            hasTeamInfo: false,
            hasRoadmap: false,
            hasTokenomics: false,
            sslValid: false,
            glmAnalysis: 'Scraping failed',
          });
        }
      })
    );
  }

  logger.info(`[ScrapeNode] Analyzed ${websiteAnalyses.size} websites`);

  return {
    ...addThought(state, `Analyzed ${websiteAnalyses.size} websites`),
    ...updateStep(state, 'WEBSITES_SCRAPED'),
    thoughts: [...state.thoughts, `Website analyses: ${websiteAnalyses.size} completed`],
  };
}

export { addThought, updateStep } from '../state';
