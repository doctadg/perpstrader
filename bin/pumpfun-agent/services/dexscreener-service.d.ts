export interface DexPair {
    chainId: string;
    dexId: string;
    pairAddress: string;
    baseToken: {
        address: string;
        name: string;
        symbol: string;
    };
    quoteToken: {
        address: string;
        name: string;
        symbol: string;
    };
    priceNative: string;
    priceUsd: string;
    txns: {
        m5: {
            buys: number;
            sells: number;
        };
        h1: {
            buys: number;
            sells: number;
        };
        h6: {
            buys: number;
            sells: number;
        };
        h24: {
            buys: number;
            sells: number;
        };
    };
    volume: {
        m5: number;
        h1: number;
        h6: number;
        h24: number;
    };
    priceChange: {
        m5: number;
        h1: number;
        h6: number;
        h24: number;
    };
    liquidity: {
        usd: number;
        base: number;
        quote: number;
    };
    fdv: number;
    marketCap: number;
    pairCreatedAt: number;
    info?: {
        imageUrl?: string;
        websites?: {
            url: string;
            label: string;
        }[];
        socials?: {
            url: string;
            type: string;
        }[];
    };
}
export interface DexScreenerResult {
    sellPressureDetected: boolean;
    dumpDetected: boolean;
    lowLiquidity: boolean;
    socialLinks: {
        twitter?: string;
        telegram?: string;
        discord?: string;
        website?: string;
    };
    metrics: {
        buySellRatio1h: number;
        priceChange1h: number;
        volume1h: number;
        liquidityUsd: number;
        pairAgeMinutes: number;
    };
    rejectReasons: string[];
    scorePenalty: number;
}
/**
 * Get all trading pairs for a token across all DEXes
 */
export declare function getPairs(mintAddress: string): Promise<DexPair[]>;
/**
 * Get the primary Solana pair for a token (highest liquidity)
 */
export declare function getPrimaryPair(mintAddress: string): Promise<DexPair | null>;
/**
 * Evaluate token market data for sell pressure, dumps, low liquidity
 */
export declare function evaluateMarket(mintAddress: string): Promise<DexScreenerResult>;
/**
 * Check if a token has any DexScreener data at all
 * Returns true if the token has at least one trading pair
 */
export declare function hasPairData(mintAddress: string): Promise<boolean>;
export interface DexScreenerGateResult {
    pass: boolean;
    reason: string;
}
/**
 * DexScreener gate — quick pass/fail for security-node pipeline.
 * Checks for sell pressure, price dumps, and liquidity issues.
 */
export declare function dexScreenerGate(mintAddress: string, symbol?: string): Promise<DexScreenerGateResult>;
declare const _default: {
    getPairs: typeof getPairs;
    getPrimaryPair: typeof getPrimaryPair;
    evaluateMarket: typeof evaluateMarket;
    hasPairData: typeof hasPairData;
    dexScreenerGate: typeof dexScreenerGate;
};
export default _default;
//# sourceMappingURL=dexscreener-service.d.ts.map