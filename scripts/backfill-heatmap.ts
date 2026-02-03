import 'dotenv/config';

import newsStore from '../src/data/news-store';
import storyClusterStore from '../src/data/story-cluster-store';
import { createInitialNewsState } from '../src/news-agent/state';
import { storyClusterNode } from '../src/news-agent/nodes/story-cluster-node';
import type { NewsArticle } from '../src/shared/types';

function readNumberArg(name: string, fallback: number): number {
  const raw = process.argv.find(arg => arg.startsWith(`${name}=`))?.split('=')[1];
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const hours = readNumberArg('--hours', 24);
  const limit = readNumberArg('--limit', 5000);
  const reset = hasFlag('--reset');
  const dryRun = hasFlag('--dry-run');

  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  await newsStore.initialize();
  await storyClusterStore.initialize();

  if (reset) {
    if (dryRun) {
      console.log('[backfill-heatmap] DRY RUN: would clear existing heatmap clusters');
    } else {
      await storyClusterStore.clearAllClusters();
      console.log('[backfill-heatmap] Cleared existing heatmap clusters');
    }
  }

  const items = await newsStore.getNewsSince(cutoff, limit);
  const articles: NewsArticle[] = items.map(item => ({
    id: item.id,
    title: item.title,
    content: item.content || item.summary || item.snippet || item.title,
    source: item.source,
    url: item.url,
    publishedAt: item.publishedAt,
    categories: item.categories,
    tags: item.tags,
    sentiment: item.sentiment,
    importance: item.importance,
    snippet: item.snippet,
    summary: item.summary || '',
    scrapedAt: item.scrapedAt,
    createdAt: item.createdAt,
    marketLinks: item.marketLinks,
    metadata: item.metadata,
  }));

  console.log(
    `[backfill-heatmap] Found ${articles.length} articles since ${cutoff.toISOString()} (hours=${hours})`
  );

  if (articles.length === 0) return;
  if (dryRun) {
    console.log('[backfill-heatmap] DRY RUN: skipping clustering/ingestion');
    return;
  }

  const state = createInitialNewsState();
  state.categorizedNews = articles;
  state.currentStep = 'BACKFILL_HEATMAP';

  const result = await storyClusterNode(state);
  const thoughts = result.thoughts || [];
  if (thoughts.length > 0) {
    console.log(`[backfill-heatmap] ${thoughts[thoughts.length - 1]}`);
  }

  const clusters = await storyClusterStore.getHotClusters(200, hours);
  console.log(`[backfill-heatmap] Heatmap clusters in window: ${clusters.length}`);
}

main().catch(err => {
  console.error('[backfill-heatmap] Failed:', err);
  process.exitCode = 1;
});

