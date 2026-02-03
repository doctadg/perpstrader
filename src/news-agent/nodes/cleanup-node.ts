// Cleanup Node
// Performs cleanup tasks and final statistics

import { NewsAgentState } from '../state';
import logger from '../../shared/logger';

export async function cleanupNode(state: NewsAgentState): Promise<Partial<NewsAgentState>> {
  logger.info('[CleanupNode] Performing cleanup and final statistics');

  const categories = state.categories.length > 0 ? state.categories : Object.keys(state.stats.byCategory);
  const categoryLines = categories
    .map((category) => {
      const count = state.stats.byCategory[category as keyof typeof state.stats.byCategory] || 0;
      return `║  ${category.toString().padEnd(12)} ${count.toString().padEnd(38)}║`;
    })
    .join('\n');

  const summary = `
╔══════════════════════════════════════════════════════════╗
║  NEWS AGENT CYCLE SUMMARY                                  ║
╠══════════════════════════════════════════════════════════╣
║  Cycle ID:       ${state.cycleId.padEnd(38)}║
║  Duration:       ${(Date.now() - state.cycleStartTime.getTime()).toString().padEnd(38)}ms║
╠══════════════════════════════════════════════════════════╣
║  Articles Found:    ${state.stats.totalFound.toString().padEnd(38)}║
║  Articles Scraped: ${state.stats.totalScraped.toString().padEnd(38)}║
║  Articles Categorized: ${state.stats.totalCategorized.toString().padEnd(33)}║
║  Articles Stored:   ${state.stats.totalStored.toString().padEnd(38)}║
║  Duplicates:       ${state.stats.totalDuplicates.toString().padEnd(38)}║
╠══════════════════════════════════════════════════════════╣
║  By Category:                                               ║
${categoryLines}
╠══════════════════════════════════════════════════════════╣
║  Errors:         ${state.errors.length.toString().padEnd(38)}║
╚══════════════════════════════════════════════════════════╝`;

  logger.info(summary);

  return {
    currentStep: 'CYCLE_COMPLETE',
    thoughts: [
      ...state.thoughts,
      `Cycle completed: Found ${state.stats.totalFound}, Scraped ${state.stats.totalScraped}, Stored ${state.stats.totalStored}`,
    ],
  };
}
