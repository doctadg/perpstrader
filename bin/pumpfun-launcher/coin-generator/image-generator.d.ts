export interface ImageGenConfig {
    openaiApiKey?: string;
    dalleEnabled: boolean;
}
/**
 * Generate a programmatic meme-style token logo using sharp.
 * Creates a colorful circular token with gradient + symbol text.
 */
export declare function generateTokenImageProgrammatic(symbol: string, name: string): Promise<Buffer>;
/**
 * Generate token image via DALL-E API.
 */
export declare function generateTokenImageDalle(symbol: string, name: string, apiKey: string, baseUrl?: string): Promise<Buffer>;
export declare function generateTokenImage(symbol: string, name: string, config: ImageGenConfig): Promise<Buffer>;
//# sourceMappingURL=image-generator.d.ts.map