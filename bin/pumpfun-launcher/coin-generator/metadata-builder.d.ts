export interface PinataConfig {
    pinataJwt: string;
}
export interface UploadResult {
    imageUri: string;
    metadataUri: string;
}
/**
 * Build pump.fun metadata JSON.
 */
export declare function buildMetadata(name: string, symbol: string, description: string, imageUri: string): {
    name: string;
    symbol: string;
    description: string;
    image: string;
    show_name: boolean;
    created_on: string;
};
/**
 * Upload token image + metadata to IPFS via Pinata.
 * Returns both IPFS URIs.
 */
export declare function uploadToIPFS(imageBuffer: Buffer, name: string, symbol: string, description: string, config: PinataConfig): Promise<UploadResult>;
//# sourceMappingURL=metadata-builder.d.ts.map