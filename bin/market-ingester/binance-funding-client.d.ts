/**
 * Binance Futures Funding Client
 * Public REST client used for cross-exchange funding arbitrage comparisons.
 */
interface BinanceFundingRate {
    symbol: string;
    fundingRate: number;
    annualizedRate: number;
    nextFundingTime: number;
    markPrice: number;
    indexPrice: number;
    volume24h: number;
    timestamp: number;
}
declare class BinanceFundingClient {
    private baseUrl;
    private cache;
    private lastCacheUpdate;
    private readonly cacheTtlMs;
    private readonly requestTimeoutMs;
    private readonly quoteSuffixes;
    constructor();
    getFundingRates(): Promise<BinanceFundingRate[]>;
    private calculateAnnualizedRate;
    private normalizeSymbol;
}
export declare const binanceFundingClient: BinanceFundingClient;
export default binanceFundingClient;
export type { BinanceFundingRate };
//# sourceMappingURL=binance-funding-client.d.ts.map