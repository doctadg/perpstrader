#!/usr/bin/env node
// Clustering Performance Benchmark
// Measures before/after performance of clustering improvements

import 'dotenv/config';
import titleSemanticClustering from '../src/shared/title-semantic-clustering';
import semanticSimilarityService from '../src/news-agent/semantic-similarity';
import enhancedEntityExtractor from '../src/news-agent/enhanced-entity-extraction';

interface BenchmarkResult {
  name: string;
  duration: number;
  score?: number;
  accuracy?: number;
  memoryUsage: number;
}

interface TestCase {
  title1: string;
  title2: string;
  expectedSimilar: boolean;
  category?: string;
}

// Test cases for title similarity
const titleSimilarityTests: TestCase[] = [
  // High similarity pairs
  {
    title1: "Bitcoin Surges Past $45,000 as ETF Inflows Continue",
    title2: "BTC Breaks $45K Barrier Amid Strong ETF Demand",
    expectedSimilar: true,
    category: "CRYPTO"
  },
  {
    title1: "Federal Reserve Holds Interest Rates Steady at 5.25-5.50%",
    title2: "Fed Maintains Rates at 5.25-5.50% in Latest Meeting",
    expectedSimilar: true,
    category: "ECONOMICS"
  },
  {
    title1: "SEC Approves Spot Bitcoin ETF Applications",
    title2: "Bitcoin Spot ETFs Get Green Light from SEC",
    expectedSimilar: true,
    category: "CRYPTO"
  },
  {
    title1: "Tesla Q4 Earnings Beat Analyst Expectations",
    title2: "Tesla Reports Strong Q4 Results, Exceeds Forecasts",
    expectedSimilar: true,
    category: "STOCKS"
  },
  {
    title1: "Ethereum Dencun Upgrade Goes Live on Mainnet",
    title2: "ETH Dencun Network Upgrade Successfully Deployed",
    expectedSimilar: true,
    category: "CRYPTO"
  },
  // Low similarity pairs
  {
    title1: "Bitcoin Surges Past $45,000 as ETF Inflows Continue",
    title2: "Apple Launches New iPhone with AI Features",
    expectedSimilar: false,
    category: "MIXED"
  },
  {
    title1: "Federal Reserve Holds Interest Rates Steady",
    title2: "Google Announces Cloud Computing Expansion",
    expectedSimilar: false,
    category: "MIXED"
  },
  {
    title1: "SEC Approves Bitcoin ETF",
    title2: "NBA Finals: Celtics Win Championship",
    expectedSimilar: false,
    category: "MIXED"
  },
  // Edge cases
  {
    title1: "Bitcoin Price Action: Technical Analysis",
    title2: "BTC Technical Analysis: Price Action",
    expectedSimilar: true,
    category: "CRYPTO"
  },
  {
    title1: "Breaking: Major Exchange Hack",
    title2: "Exchange Suffers Security Breach",
    expectedSimilar: true,
    category: "CRYPTO"
  }
];

// Test articles for clustering
const testArticles = [
  { id: "1", title: "Bitcoin Surges Past $45,000 as ETF Inflows Continue", category: "CRYPTO" },
  { id: "2", title: "BTC Breaks $45K Barrier Amid Strong ETF Demand", category: "CRYPTO" },
  { id: "3", title: "Bitcoin ETF Sees Record Trading Volume", category: "CRYPTO" },
  { id: "4", title: "Federal Reserve Holds Interest Rates Steady", category: "ECONOMICS" },
  { id: "5", title: "Fed Maintains Rates at Current Levels", category: "ECONOMICS" },
  { id: "6", title: "SEC Approves Spot Bitcoin ETF Applications", category: "CRYPTO" },
  { id: "7", title: "Bitcoin Spot ETFs Get Green Light from SEC", category: "CRYPTO" },
  { id: "8", title: "Tesla Q4 Earnings Beat Expectations", category: "STOCKS" },
  { id: "9", title: "Tesla Reports Strong Quarterly Results", category: "STOCKS" },
  { id: "10", title: "Apple Launches New Product Line", category: "TECH" },
];

class ClusteringBenchmark {
  private results: BenchmarkResult[] = [];

  async runAll(): Promise<void> {
    console.log('🚀 Starting Clustering Performance Benchmark\n');

    await this.benchmarkTitleSimilarity();
    await this.benchmarkSemanticSimilarity();
    await this.benchmarkEntityExtraction();
    await this.benchmarkTitleClustering();

    this.printResults();
  }

  private async benchmarkTitleSimilarity(): Promise<void> {
    console.log('📊 Benchmarking Title Similarity...');

    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    let correct = 0;
    let totalScore = 0;

    for (const test of titleSimilarityTests) {
      const result = await titleSemanticClustering.calculateSimilarity(
        test.title1,
        test.title2
      );

      const predictedSimilar = result.similarityScore >= 0.7;
      if (predictedSimilar === test.expectedSimilar) {
        correct++;
      }
      totalScore += result.similarityScore;
    }

    const duration = Date.now() - startTime;
    const memoryUsage = (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024;

    this.results.push({
      name: 'Title Similarity',
      duration,
      score: totalScore / titleSimilarityTests.length,
      accuracy: correct / titleSimilarityTests.length,
      memoryUsage
    });

    console.log(`  ✓ Accuracy: ${(correct / titleSimilarityTests.length * 100).toFixed(1)}%`);
    console.log(`  ✓ Avg Score: ${(totalScore / titleSimilarityTests.length).toFixed(3)}`);
    console.log(`  ✓ Duration: ${duration}ms`);
    console.log(`  ✓ Memory: ${memoryUsage.toFixed(2)}MB\n`);
  }

  private async benchmarkSemanticSimilarity(): Promise<void> {
    console.log('📊 Benchmarking Semantic Similarity...');

    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    let totalScore = 0;
    const comparisons = 10;

    for (let i = 0; i < comparisons; i++) {
      const article1 = testArticles[i % testArticles.length];
      const article2 = testArticles[(i + 1) % testArticles.length];

      const result = await semanticSimilarityService.calculateSimilarity(
        article1,
        article2
      );

      totalScore += result.score;
    }

    const duration = Date.now() - startTime;
    const memoryUsage = (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024;

    this.results.push({
      name: 'Semantic Similarity',
      duration,
      score: totalScore / comparisons,
      memoryUsage
    });

    console.log(`  ✓ Avg Score: ${(totalScore / comparisons).toFixed(3)}`);
    console.log(`  ✓ Duration: ${duration}ms (${(duration / comparisons).toFixed(1)}ms per comparison)`);
    console.log(`  ✓ Memory: ${memoryUsage.toFixed(2)}MB\n`);
  }

  private async benchmarkEntityExtraction(): Promise<void> {
    console.log('📊 Benchmarking Entity Extraction...');

    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    let totalEntities = 0;

    for (const article of testArticles) {
      const result = await enhancedEntityExtractor.extractHybrid(
        article.title,
        undefined,
        article.id
      );
      totalEntities += result.entities.length;
    }

    const duration = Date.now() - startTime;
    const memoryUsage = (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024;

    this.results.push({
      name: 'Entity Extraction',
      duration,
      score: totalEntities / testArticles.length,
      memoryUsage
    });

    console.log(`  ✓ Avg Entities: ${(totalEntities / testArticles.length).toFixed(1)} per article`);
    console.log(`  ✓ Duration: ${duration}ms (${(duration / testArticles.length).toFixed(1)}ms per article)`);
    console.log(`  ✓ Memory: ${memoryUsage.toFixed(2)}MB\n`);
  }

  private async benchmarkTitleClustering(): Promise<void> {
    console.log('📊 Benchmarking Title Clustering...');

    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    const clusters = await titleSemanticClustering.clusterTitles(
      testArticles.map(a => ({ id: a.id, title: a.title, category: a.category })),
      0.75
    );

    const duration = Date.now() - startTime;
    const memoryUsage = (process.memoryUsage().heapUsed - startMemory) / 1024 / 1024;

    this.results.push({
      name: 'Title Clustering',
      duration,
      score: clusters.length,
      memoryUsage
    });

    console.log(`  ✓ Clusters Created: ${clusters.length}`);
    console.log(`  ✓ Avg Articles per Cluster: ${(testArticles.length / clusters.length).toFixed(1)}`);
    console.log(`  ✓ Duration: ${duration}ms`);
    console.log(`  ✓ Memory: ${memoryUsage.toFixed(2)}MB\n`);
  }

  private printResults(): void {
    console.log('\n📈 BENCHMARK SUMMARY\n');
    console.log('=' .repeat(70));
    console.log(`${'Component'.padEnd(25)} ${'Duration'.padEnd(12)} ${'Score'.padEnd(12)} ${'Accuracy'.padEnd(12)} ${'Memory'.padEnd(10)}`);
    console.log('=' .repeat(70));

    for (const result of this.results) {
      const score = result.score !== undefined ? result.score.toFixed(3) : 'N/A';
      const accuracy = result.accuracy !== undefined ? `${(result.accuracy * 100).toFixed(1)}%` : 'N/A';
      console.log(
        `${result.name.padEnd(25)} ` +
        `${result.duration.toString().padEnd(12)} ` +
        `${score.padEnd(12)} ` +
        `${accuracy.padEnd(12)} ` +
        `${result.memoryUsage.toFixed(2)}MB`
      );
    }

    console.log('=' .repeat(70));

    // Performance metrics
    console.log('\n🔍 KEY METRICS:');
    const titleSim = this.results.find(r => r.name === 'Title Similarity');
    const semanticSim = this.results.find(r => r.name === 'Semantic Similarity');
    const entityExt = this.results.find(r => r.name === 'Entity Extraction');
    const titleCluster = this.results.find(r => r.name === 'Title Clustering');

    if (titleSim) {
      console.log(`  • Title Similarity Accuracy: ${(titleSim.accuracy! * 100).toFixed(1)}%`);
      console.log(`  • Title Similarity Speed: ${(titleSim.duration / titleSimilarityTests.length).toFixed(1)}ms per comparison`);
    }

    if (semanticSim) {
      console.log(`  • Semantic Similarity Speed: ${(semanticSim.duration / 10).toFixed(1)}ms per comparison`);
    }

    if (entityExt) {
      console.log(`  • Entity Extraction Speed: ${(entityExt.duration / testArticles.length).toFixed(1)}ms per article`);
      console.log(`  • Avg Entities per Article: ${entityExt.score?.toFixed(1)}`);
    }

    if (titleCluster) {
      console.log(`  • Clustering Efficiency: ${titleCluster.score} clusters from ${testArticles.length} articles`);
      console.log(`  • Reduction Ratio: ${(testArticles.length / titleCluster.score!).toFixed(1)}:1`);
    }

    console.log('\n✅ Benchmark Complete!\n');
  }
}

// Run benchmark
const benchmark = new ClusteringBenchmark();
benchmark.runAll().catch(console.error);
