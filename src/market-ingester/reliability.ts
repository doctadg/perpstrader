export interface SymbolMarketMeta {
  coin: string;
  volume24h?: number;
}

export interface CoverageSnapshot {
  totalSymbols: number;
  freshSymbols: number;
  staleSymbols: number;
  coverageRatio: number;
  staleSymbolsList: string[];
  oldestStaleAgeMs: number;
}

export interface CoverageInput {
  symbols: string[];
  lastMarketDataAt: Map<string, number>;
  nowMs: number;
  freshnessMs: number;
}

export interface BackfillSelectionInput {
  staleSymbols: string[];
  lastAttemptAt: Map<string, number>;
  nowMs: number;
  cooldownMs: number;
  maxSymbols: number;
  volumeBySymbol?: Map<string, number>;
}

export interface ParsedSnapshotCandle {
  timestampMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number.parseFloat(value);
  return Number.NaN;
}

function normalizeTimestamp(raw: unknown): number {
  const ts = toNumber(raw);
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  return ts < 1e12 ? Math.floor(ts * 1000) : Math.floor(ts);
}

export function buildTrackedSymbols(markets: SymbolMarketMeta[], minVolume24h: number = 0): string[] {
  const deduped = new Map<string, number>();

  for (const market of markets) {
    const coin = normalizeSymbol(market.coin || '');
    if (!coin) continue;
    const volume = Number.isFinite(market.volume24h) ? Number(market.volume24h) : 0;
    if (volume < minVolume24h) continue;
    const existing = deduped.get(coin) ?? Number.NEGATIVE_INFINITY;
    if (volume > existing) deduped.set(coin, volume);
  }

  return [...deduped.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([symbol]) => symbol);
}

export function rankSymbolsForStreaming(
  markets: SymbolMarketMeta[],
  maxSymbols: number,
  minVolume24h: number = 0
): string[] {
  if (maxSymbols <= 0) return [];
  return buildTrackedSymbols(markets, minVolume24h).slice(0, maxSymbols);
}

export function computeCoverageSnapshot(input: CoverageInput): CoverageSnapshot {
  const uniqueSymbols = [...new Set(input.symbols.map(normalizeSymbol).filter(Boolean))];

  if (uniqueSymbols.length === 0) {
    return {
      totalSymbols: 0,
      freshSymbols: 0,
      staleSymbols: 0,
      coverageRatio: 1,
      staleSymbolsList: [],
      oldestStaleAgeMs: 0,
    };
  }

  const stale: Array<{ symbol: string; ageMs: number }> = [];
  let fresh = 0;

  for (const symbol of uniqueSymbols) {
    const lastSeen = input.lastMarketDataAt.get(symbol) || 0;
    const ageMs = input.nowMs - lastSeen;
    if (lastSeen > 0 && ageMs <= input.freshnessMs) {
      fresh++;
    } else {
      stale.push({ symbol, ageMs: Math.max(ageMs, 0) });
    }
  }

  stale.sort((a, b) => b.ageMs - a.ageMs || a.symbol.localeCompare(b.symbol));

  const total = uniqueSymbols.length;
  return {
    totalSymbols: total,
    freshSymbols: fresh,
    staleSymbols: stale.length,
    coverageRatio: total === 0 ? 1 : fresh / total,
    staleSymbolsList: stale.map(s => s.symbol),
    oldestStaleAgeMs: stale[0]?.ageMs || 0,
  };
}

export function selectBackfillSymbols(input: BackfillSelectionInput): string[] {
  if (input.maxSymbols <= 0) return [];
  const unique = [...new Set(input.staleSymbols.map(normalizeSymbol).filter(Boolean))];

  const eligible = unique.filter(symbol => {
    const lastAttempt = input.lastAttemptAt.get(symbol) || 0;
    return input.nowMs - lastAttempt >= input.cooldownMs;
  });

  eligible.sort((a, b) => {
    const volumeA = input.volumeBySymbol?.get(a) ?? 0;
    const volumeB = input.volumeBySymbol?.get(b) ?? 0;
    if (volumeA !== volumeB) return volumeB - volumeA;
    const lastAttemptA = input.lastAttemptAt.get(a) || 0;
    const lastAttemptB = input.lastAttemptAt.get(b) || 0;
    if (lastAttemptA !== lastAttemptB) return lastAttemptA - lastAttemptB;
    return a.localeCompare(b);
  });

  return eligible.slice(0, input.maxSymbols);
}

export function parseHyperliquidSnapshotCandle(raw: unknown): ParsedSnapshotCandle | null {
  let timestampMs = 0;
  let open = Number.NaN;
  let high = Number.NaN;
  let low = Number.NaN;
  let close = Number.NaN;
  let volume = Number.NaN;

  if (Array.isArray(raw)) {
    timestampMs = normalizeTimestamp(raw[0]);
    open = toNumber(raw[1]);
    high = toNumber(raw[2]);
    low = toNumber(raw[3]);
    close = toNumber(raw[4]);
    volume = toNumber(raw[5] ?? 0);
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    timestampMs = normalizeTimestamp(obj.t ?? obj.time ?? obj.timestamp);
    open = toNumber(obj.o ?? obj.open);
    high = toNumber(obj.h ?? obj.high);
    low = toNumber(obj.l ?? obj.low);
    close = toNumber(obj.c ?? obj.close);
    volume = toNumber(obj.v ?? obj.n ?? obj.volume ?? 0);
  } else {
    return null;
  }

  if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return null;
  }
  if (!Number.isFinite(volume)) {
    volume = 0;
  }
  if (timestampMs <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0) {
    return null;
  }
  if (high < low || close < low || close > high) {
    return null;
  }

  return {
    timestampMs,
    open,
    high,
    low,
    close,
    volume: Math.max(volume, 0),
  };
}
