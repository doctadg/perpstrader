import type { NewsCategory } from './types';
export type TrendDerivation = {
    topic: string;
    topicKey: string;
    keywords: string[];
};
export declare function deriveTrend(input: {
    title: string;
    category?: NewsCategory | string;
    tags?: string[];
}): TrendDerivation;
export declare function deriveTrendTopic(input: {
    title: string;
    category?: NewsCategory | string;
    tags?: string[];
}): {
    topic: string;
    keywords: string[];
};
//# sourceMappingURL=news-trend.d.ts.map