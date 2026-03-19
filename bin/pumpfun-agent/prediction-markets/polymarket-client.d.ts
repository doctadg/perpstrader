import { PredictionMarket } from '../shared/types';
declare function fetchMarkets(limit?: number): Promise<PredictionMarket[]>;
declare function fetchCandles(tokenId: string): Promise<{
    timestamp: number;
    price: number;
}[]>;
declare const _default: {
    fetchMarkets: typeof fetchMarkets;
    fetchCandles: typeof fetchCandles;
};
export default _default;
//# sourceMappingURL=polymarket-client.d.ts.map