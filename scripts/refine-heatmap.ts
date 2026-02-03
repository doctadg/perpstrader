import 'dotenv/config';

import storyClusterStore from '../src/data/story-cluster-store';

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
  const dryRun = hasFlag('--dry-run');

  await storyClusterStore.initialize();

  const clusters = await storyClusterStore.getHotClusters(limit, hours);
  const byKey = new Map<string, typeof clusters>();
  for (const c of clusters) {
    const key = c.topicKey?.trim();
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(c);
    byKey.set(key, list);
  }

  let mergeGroups = 0;
  let mergedClusters = 0;

  for (const [key, group] of byKey.entries()) {
    if (group.length <= 1) continue;
    mergeGroups += 1;

    group.sort((a, b) => (b.articleCount - a.articleCount) || (b.heatScore - a.heatScore));
    const target = group[0];
    const sources = group.slice(1);

    console.log(`\n[refine-heatmap] topicKey=${key}`);
    console.log(`[refine-heatmap] target=${target.id} topic="${target.topic}" count=${target.articleCount} heat=${target.heatScore.toFixed(1)}`);

    for (const src of sources) {
      console.log(`[refine-heatmap]   source=${src.id} topic="${src.topic}" count=${src.articleCount} heat=${src.heatScore.toFixed(1)}`);
      if (!dryRun) {
        const result = await storyClusterStore.mergeClusters(target.id, src.id);
        if (result.deleted) mergedClusters += 1;
      }
    }
  }

  console.log(`\n[refine-heatmap] Merge groups: ${mergeGroups}`);
  console.log(`[refine-heatmap] Clusters merged: ${mergedClusters}${dryRun ? ' (dry-run)' : ''}`);
}

main().catch(err => {
  console.error('[refine-heatmap] Failed:', err);
  process.exitCode = 1;
});

