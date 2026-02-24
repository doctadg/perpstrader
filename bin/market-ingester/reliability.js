"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTrackedSymbols = buildTrackedSymbols;
exports.rankSymbolsForStreaming = rankSymbolsForStreaming;
exports.computeCoverageSnapshot = computeCoverageSnapshot;
exports.selectBackfillSymbols = selectBackfillSymbols;
exports.parseHyperliquidSnapshotCandle = parseHyperliquidSnapshotCandle;
function normalizeSymbol(symbol) {
    return symbol.trim().toUpperCase();
}
function toNumber(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'string')
        return Number.parseFloat(value);
    return Number.NaN;
}
function normalizeTimestamp(raw) {
    const ts = toNumber(raw);
    if (!Number.isFinite(ts) || ts <= 0)
        return 0;
    return ts < 1e12 ? Math.floor(ts * 1000) : Math.floor(ts);
}
function buildTrackedSymbols(markets, minVolume24h = 0) {
    const deduped = new Map();
    for (const market of markets) {
        const coin = normalizeSymbol(market.coin || '');
        if (!coin)
            continue;
        const volume = Number.isFinite(market.volume24h) ? Number(market.volume24h) : 0;
        if (volume < minVolume24h)
            continue;
        const existing = deduped.get(coin) ?? Number.NEGATIVE_INFINITY;
        if (volume > existing)
            deduped.set(coin, volume);
    }
    return [...deduped.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([symbol]) => symbol);
}
function rankSymbolsForStreaming(markets, maxSymbols, minVolume24h = 0) {
    if (maxSymbols <= 0)
        return [];
    return buildTrackedSymbols(markets, minVolume24h).slice(0, maxSymbols);
}
function computeCoverageSnapshot(input) {
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
    const stale = [];
    let fresh = 0;
    for (const symbol of uniqueSymbols) {
        const lastSeen = input.lastMarketDataAt.get(symbol) || 0;
        const ageMs = input.nowMs - lastSeen;
        if (lastSeen > 0 && ageMs <= input.freshnessMs) {
            fresh++;
        }
        else {
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
function selectBackfillSymbols(input) {
    if (input.maxSymbols <= 0)
        return [];
    const unique = [...new Set(input.staleSymbols.map(normalizeSymbol).filter(Boolean))];
    const eligible = unique.filter(symbol => {
        const lastAttempt = input.lastAttemptAt.get(symbol) || 0;
        return input.nowMs - lastAttempt >= input.cooldownMs;
    });
    eligible.sort((a, b) => {
        const volumeA = input.volumeBySymbol?.get(a) ?? 0;
        const volumeB = input.volumeBySymbol?.get(b) ?? 0;
        if (volumeA !== volumeB)
            return volumeB - volumeA;
        const lastAttemptA = input.lastAttemptAt.get(a) || 0;
        const lastAttemptB = input.lastAttemptAt.get(b) || 0;
        if (lastAttemptA !== lastAttemptB)
            return lastAttemptA - lastAttemptB;
        return a.localeCompare(b);
    });
    return eligible.slice(0, input.maxSymbols);
}
function parseHyperliquidSnapshotCandle(raw) {
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
    }
    else if (raw && typeof raw === 'object') {
        const obj = raw;
        timestampMs = normalizeTimestamp(obj.t ?? obj.time ?? obj.timestamp);
        open = toNumber(obj.o ?? obj.open);
        high = toNumber(obj.h ?? obj.high);
        low = toNumber(obj.l ?? obj.low);
        close = toNumber(obj.c ?? obj.close);
        volume = toNumber(obj.v ?? obj.n ?? obj.volume ?? 0);
    }
    else {
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
//# sourceMappingURL=reliability.js.map