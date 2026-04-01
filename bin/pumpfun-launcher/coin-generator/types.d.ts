export interface ScoredNarrative {
    title: string;
    description: string;
    hashtags: string[];
    source: string;
    score?: number;
}
export interface CoinConcept {
    name: string;
    symbol: string;
    description: string;
    imageBuffer: Buffer;
    tweet: string;
    metadata: GeneratedMetadata;
}
export interface GeneratedMetadata {
    name: string;
    symbol: string;
    description: string;
    image: string;
    show_name: boolean;
    created_on: string;
}
export interface GeneratorConfig {
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    dalleEnabled: boolean;
    pinataJwt: string;
    model?: string;
}
export interface LLMCoinResponse {
    name: string;
    symbol: string;
    description: string;
    tweet: string;
}
//# sourceMappingURL=types.d.ts.map