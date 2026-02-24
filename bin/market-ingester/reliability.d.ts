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
export declare function buildTrackedSymbols(markets: SymbolMarketMeta[], minVolume24h?: number): string[];
export declare function rankSymbolsForStreaming(markets: SymbolMarketMeta[], maxSymbols: number, minVolume24h?: number): string[];
export declare function computeCoverageSnapshot(input: CoverageInput): CoverageSnapshot;
export declare function selectBackfillSymbols(input: BackfillSelectionInput): string[];
export declare function parseHyperliquidSnapshotCandle(raw: unknown): ParsedSnapshotCandle | null;
//# sourceMappingURL=reliability.d.ts.map