import assert from 'assert';
import {
  buildTrackedSymbols,
  computeCoverageSnapshot,
  parseHyperliquidSnapshotCandle,
  rankSymbolsForStreaming,
  selectBackfillSymbols,
  type SymbolMarketMeta,
} from '../src/market-ingester/reliability';

function testSymbolRanking(): void {
  const markets: SymbolMarketMeta[] = [
    { coin: 'btc', volume24h: 500_000_000 },
    { coin: 'eth', volume24h: 400_000_000 },
    { coin: 'sol', volume24h: 300_000_000 },
    { coin: 'sol', volume24h: 350_000_000 }, // duplicate with higher volume
    { coin: 'illiquid', volume24h: 500 },
  ];

  const tracked = buildTrackedSymbols(markets, 1000);
  assert.deepStrictEqual(tracked, ['BTC', 'ETH', 'SOL']);

  const stream = rankSymbolsForStreaming(markets, 2, 1000);
  assert.deepStrictEqual(stream, ['BTC', 'ETH']);
}

function testCoverage(): void {
  const now = Date.now();
  const last = new Map<string, number>([
    ['BTC', now - 20_000],
    ['ETH', now - 50_000],
    ['SOL', now - 200_000],
    ['ARB', 0],
  ]);

  const snapshot = computeCoverageSnapshot({
    symbols: ['BTC', 'ETH', 'SOL', 'ARB'],
    lastMarketDataAt: last,
    nowMs: now,
    freshnessMs: 120_000,
  });

  assert.strictEqual(snapshot.totalSymbols, 4);
  assert.strictEqual(snapshot.freshSymbols, 2);
  assert.strictEqual(snapshot.staleSymbols, 2);
  assert(snapshot.coverageRatio > 0.49 && snapshot.coverageRatio < 0.51);
  assert.deepStrictEqual(snapshot.staleSymbolsList, ['ARB', 'SOL']);
}

function testBackfillSelection(): void {
  const now = Date.now();
  const lastAttemptAt = new Map<string, number>([
    ['BTC', now - 10_000], // should be skipped by cooldown
    ['ETH', now - 500_000],
    ['SOL', now - 600_000],
    ['ARB', now - 700_000],
  ]);

  const volumeBySymbol = new Map<string, number>([
    ['ETH', 300_000_000],
    ['SOL', 200_000_000],
    ['ARB', 150_000_000],
    ['BTC', 500_000_000],
  ]);

  const selected = selectBackfillSymbols({
    staleSymbols: ['BTC', 'ETH', 'SOL', 'ARB'],
    lastAttemptAt,
    nowMs: now,
    cooldownMs: 120_000,
    maxSymbols: 2,
    volumeBySymbol,
  });

  assert.deepStrictEqual(selected, ['ETH', 'SOL']);
}

function testCandleParsing(): void {
  const arrayCandle = parseHyperliquidSnapshotCandle([1700000000, '100', '110', '95', '105', '42']);
  assert(arrayCandle);
  assert.strictEqual(arrayCandle!.timestampMs, 1700000000 * 1000);
  assert.strictEqual(arrayCandle!.open, 100);
  assert.strictEqual(arrayCandle!.close, 105);

  const objectCandle = parseHyperliquidSnapshotCandle({
    t: 1700000100000,
    o: '10',
    h: '12',
    l: '9',
    c: '11',
    v: '5',
  });
  assert(objectCandle);
  assert.strictEqual(objectCandle!.timestampMs, 1700000100000);

  const invalid = parseHyperliquidSnapshotCandle({
    t: 1700000100000,
    o: '10',
    h: '8', // invalid high<low
    l: '9',
    c: '11',
    v: '5',
  });
  assert.strictEqual(invalid, null);
}

function fuzzCoverageAndBackfill(): void {
  for (let i = 0; i < 400; i++) {
    const now = Date.now();
    const symbolCount = 10 + Math.floor(Math.random() * 60);
    const symbols: string[] = [];
    const last = new Map<string, number>();
    const attempts = new Map<string, number>();
    const volumes = new Map<string, number>();

    for (let n = 0; n < symbolCount; n++) {
      const symbol = `SYM${n}`;
      symbols.push(symbol);
      const age = Math.floor(Math.random() * 500_000);
      const lastSeen = Math.random() < 0.1 ? 0 : now - age;
      last.set(symbol, lastSeen);
      attempts.set(symbol, now - Math.floor(Math.random() * 500_000));
      volumes.set(symbol, Math.floor(Math.random() * 10_000_000));
    }

    const snapshot = computeCoverageSnapshot({
      symbols,
      lastMarketDataAt: last,
      nowMs: now,
      freshnessMs: 120_000,
    });

    assert(snapshot.totalSymbols === symbolCount);
    assert(snapshot.freshSymbols + snapshot.staleSymbols === symbolCount);
    assert(snapshot.coverageRatio >= 0 && snapshot.coverageRatio <= 1);
    assert(snapshot.staleSymbolsList.length === snapshot.staleSymbols);

    const selected = selectBackfillSymbols({
      staleSymbols: snapshot.staleSymbolsList,
      lastAttemptAt: attempts,
      nowMs: now,
      cooldownMs: 120_000,
      maxSymbols: 20,
      volumeBySymbol: volumes,
    });

    assert(selected.length <= 20);
    for (const symbol of selected) {
      const lastAttempt = attempts.get(symbol) || 0;
      assert(now - lastAttempt >= 120_000);
    }
  }
}

function run(): void {
  testSymbolRanking();
  testCoverage();
  testBackfillSelection();
  testCandleParsing();
  fuzzCoverageAndBackfill();
  // eslint-disable-next-line no-console
  console.log('Ingestion reliability tests passed.');
}

run();
