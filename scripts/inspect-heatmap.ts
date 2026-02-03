import 'dotenv/config';

import storyClusterStore from '../src/data/story-cluster-store';

function readNumberArg(name: string, fallback: number): number {
  const raw = process.argv.find(arg => arg.startsWith(`${name}=`))?.split('=')[1];
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readStringArg(name: string): string | undefined {
  const raw = process.argv.find(arg => arg.startsWith(`${name}=`))?.split('=')[1];
  const value = raw?.trim();
  return value ? value : undefined;
}

async function main(): Promise<void> {
  const hours = readNumberArg('--hours', 24);
  const limit = readNumberArg('--limit', 50);
  const samples = readNumberArg('--samples', 3);
  const category = readStringArg('--category');

  await storyClusterStore.initialize();

  const clusters = await storyClusterStore.getHotClusters(limit, hours, category as any);
  console.log(`[inspect-heatmap] Hot clusters: ${clusters.length} (hours=${hours}, limit=${limit}${category ? `, category=${category}` : ''})`);

  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    const titles = await storyClusterStore.getClusterSampleTitles(c.id, samples);

    console.log(
      `\n#${i + 1} heat=${c.heatScore.toFixed(1)} count=${c.articleCount} updated=${c.updatedAt.toISOString()}`
    );
    console.log(`key=${c.topicKey || ''}`);
    console.log(`topic=${c.topic}`);
    if (titles.length) {
      for (const t of titles) console.log(`- ${t}`);
    }
  }
}

main().catch(err => {
  console.error('[inspect-heatmap] Failed:', err);
  process.exitCode = 1;
});

