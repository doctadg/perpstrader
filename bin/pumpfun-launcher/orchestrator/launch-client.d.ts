/**
 * HTTP client for printterminal's launcher API
 */
import type { Plan } from '../../../shared/launcher-plan-types';
export interface SpamLaunchResponse {
    runId: string;
    status: string;
    mode: string;
    launchIndex: number;
    mintPublicKey?: string;
    bondingCurvePublicKey?: string;
    message: string;
}
export interface WalletGroupResponse {
    id: string;
    wallets: Array<{
        id: string;
        publicKey: string;
    }>;
}
export interface UploadResponse {
    uri: string;
    metadataUri: string;
}
export declare class LaunchClient {
    private baseUrl;
    constructor(baseUrl?: string);
    /** Execute a spam launch */
    spamLaunch(plan: Plan, launchIndex?: number): Promise<SpamLaunchResponse>;
    /** Ensure wallet groups exist for buying */
    ensureWallets(groupName: string, count: number): Promise<WalletGroupResponse>;
    /** Upload metadata to IPFS */
    uploadMetadata(metadata: {
        name: string;
        symbol: string;
        description: string;
        imageBuffer: Buffer;
        filename: string;
    }): Promise<UploadResponse>;
}
//# sourceMappingURL=launch-client.d.ts.map