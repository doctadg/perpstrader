import { PumpFunToken, TokenMetadata, ContractSecurity } from '../../shared/types';
/**
 * Solana RPC Service for pump.fun token monitoring
 */
declare class SolanaRPCService {
    private connection;
    private subscriptionId;
    private rpcUrl;
    private wsUrl;
    private commitment;
    constructor();
    /**
     * Connect to Solana RPC
     */
    connect(): Promise<void>;
    /**
     * Subscribe to pump.fun token creation events
     */
    subscribeToTokenLaunches(callback: (token: PumpFunToken) => void, durationMs?: number): Promise<void>;
    /**
     * Parse pump.fun log data to extract token creation event
     */
    private parseTokenCreationEvent;
    /**
     * Get mint account information for security analysis
     */
    getMintInfo(mintAddress: string): Promise<ContractSecurity>;
    /**
     * Get token metadata from Metaplex metadata account
     * Uses HTTP API for metadata fetching (more reliable than direct RPC for metadata)
     */
    getTokenMetadata(mintAddress: string): Promise<TokenMetadata | null>;
    /**
     * Derive Metaplex metadata PDA for a mint
     */
    private getMetadataPDA;
    /**
     * Extract metadata URI from raw metadata account data
     * This is a simplified version - production should use proper borsh deserialization
     */
    private extractMetadataUri;
    /**
     * Fetch metadata from Arweave/IPFS URI
     */
    private fetchMetadataFromUri;
    /**
     * Fetch token metadata from pump.fun API (fallback)
     */
    private fetchPumpFunMetadata;
    /**
     * Get detailed transaction information
     */
    getTransaction(signature: string): Promise<any>;
    /**
     * Unsubscribe from logs
     */
    unsubscribe(): void;
    /**
     * Disconnect from Solana RPC
     */
    disconnect(): Promise<void>;
    /**
     * Get connection status
     */
    isConnected(): boolean;
}
declare const solanaRPCService: SolanaRPCService;
export default solanaRPCService;
//# sourceMappingURL=solana-rpc.d.ts.map