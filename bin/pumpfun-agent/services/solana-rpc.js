"use strict";
// Solana RPC Service for pump.fun Token Monitoring
// Handles Solana blockchain interactions for token discovery and security analysis
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../../shared/config"));
const logger_1 = __importDefault(require("../../shared/logger"));
// pump.fun Program ID
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkjon8nkdqXHDr3EbmLB4TqRASFjZxb';
// Metaplex Metadata Program ID
const METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
// Metadata account seed
const METADATA_SEED = 'metadata';
const PUMPFUN_FRONTEND_API_BASE = 'https://frontend-api-v3.pump.fun';
const PUMPFUN_FRONTEND_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
    'Accept': 'application/json',
    'Origin': 'https://pump.fun',
    'Referer': 'https://pump.fun/',
};
/**
 * Solana RPC Service for pump.fun token monitoring
 */
class SolanaRPCService {
    connection = null;
    subscriptionId = null;
    rpcUrl;
    wsUrl;
    commitment;
    constructor() {
        const config = config_1.default.get();
        this.rpcUrl = config.solana?.rpcUrl || 'https://api.mainnet-beta.solana.com';
        this.wsUrl = config.solana?.wsUrl || this.rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        this.commitment = config.solana?.commitment || 'confirmed';
    }
    /**
     * Connect to Solana RPC
     */
    async connect() {
        try {
            // Connection constructor requires HTTP URL; wsEndpoint is for WebSocket subscriptions
            this.connection = new web3_js_1.Connection(this.rpcUrl, {
                commitment: this.commitment,
                wsEndpoint: this.wsUrl,
            });
            // Test connection
            const version = await this.connection.getVersion();
            logger_1.default.info(`[SolanaRPC] Connected to Solana RPC: ${version['solana-core']}`);
        }
        catch (error) {
            logger_1.default.error(`[SolanaRPC] Failed to connect: ${error}`);
            throw error;
        }
    }
    /**
     * Subscribe to pump.fun token creation events
     */
    async subscribeToTokenLaunches(callback, durationMs = 30000) {
        if (!this.connection) {
            await this.connect();
        }
        const programId = new web3_js_1.PublicKey(PUMPFUN_PROGRAM_ID);
        const seenMints = new Set();
        logger_1.default.info(`[SolanaRPC] Subscribing to pump.fun program: ${PUMPFUN_PROGRAM_ID}`);
        this.subscriptionId = this.connection.onLogs(programId, (logs, context) => {
            try {
                // Parse logs for token creation events
                const token = this.parseTokenCreationEvent(logs, context);
                if (token && !seenMints.has(token.mintAddress)) {
                    seenMints.add(token.mintAddress);
                    logger_1.default.info(`[SolanaRPC] Discovered token: ${token.symbol} (${token.mintAddress})`);
                    callback(token);
                }
            }
            catch (error) {
                logger_1.default.warn(`[SolanaRPC] Failed to parse logs: ${error}`);
            }
        }, this.commitment);
        logger_1.default.info(`[SolanaRPC] Subscription active for ${durationMs}ms`);
        // Auto-unsubscribe after duration
        setTimeout(() => {
            this.unsubscribe();
            logger_1.default.info(`[SolanaRPC] Subscription ended. Discovered ${seenMints.size} tokens.`);
        }, durationMs);
    }
    /**
     * Parse pump.fun log data to extract token creation event
     */
    parseTokenCreationEvent(logs, context) {
        try {
            // Check if logs contain pump.fun specific patterns
            const logStrings = logs.logs || [];
            // pump.fun create events typically contain "Program log: Instruction: Create" or similar
            // The actual mint address can be found in the signature or parsed from log data
            // For now, extract from the signature (first account in the transaction is usually the mint)
            const signature = context.signature;
            if (!signature)
                return null;
            // Parse transaction to get actual token details
            // This is a simplified version - in production we'd fetch and parse the full transaction
            // For now, return a placeholder that will be filled in by fetchMetadata
            return {
                mintAddress: '', // Will be filled when fetching transaction details
                name: 'Unknown',
                symbol: 'UNKNOWN',
                metadataUri: '',
                createdAt: new Date(),
                txSignature: signature,
            };
        }
        catch (error) {
            logger_1.default.warn(`[SolanaRPC] Failed to parse token creation event: ${error}`);
            return null;
        }
    }
    /**
     * Get mint account information for security analysis
     */
    async getMintInfo(mintAddress) {
        if (!this.connection) {
            await this.connect();
        }
        try {
            const mintPubkey = new web3_js_1.PublicKey(mintAddress);
            const accountInfo = await this.connection.getAccountInfo(mintPubkey);
            if (!accountInfo || !accountInfo.data) {
                throw new Error(`No account info for mint: ${mintAddress}`);
            }
            // Parse mint data structure (82 bytes for Solana mint)
            const data = Buffer.from(accountInfo.data);
            // Mint layout:
            // 0-32: mint authority option (32 bytes, first is u32 flag)
            // 32-36: supply (u64)
            // 36-44: decimals (u8)
            // 44-45: is_initialized (u8)
            // 45-77: freeze authority option
            const mintAuthorityOption = data.readUInt32LE(0);
            const supply = data.readBigUInt64LE(36);
            const decimals = data.readUInt8(44);
            const freezeAuthorityOption = data.readUInt32LE(45);
            const isMintable = mintAuthorityOption === 1;
            const isFreezable = freezeAuthorityOption === 1;
            // Calculate risk level
            let riskLevel = 'LOW';
            if (isMintable && isFreezable) {
                riskLevel = 'HIGH';
            }
            else if (isMintable || isFreezable) {
                riskLevel = 'MEDIUM';
            }
            return {
                mintAuthority: isMintable ? 'SET' : null,
                freezeAuthority: isFreezable ? 'SET' : null,
                decimals,
                supply,
                isMintable,
                isFreezable,
                metadataHash: '', // Could be derived from on-chain data
                riskLevel,
            };
        }
        catch (error) {
            logger_1.default.error(`[SolanaRPC] Failed to get mint info: ${error}`);
            // Return safe defaults on error
            return {
                mintAuthority: null,
                freezeAuthority: null,
                decimals: 0,
                supply: 0n,
                isMintable: false,
                isFreezable: false,
                metadataHash: '',
                riskLevel: 'HIGH', // Assume high risk if we can't verify
            };
        }
    }
    /**
     * Get token metadata from Metaplex metadata account
     * Uses HTTP API for metadata fetching (more reliable than direct RPC for metadata)
     */
    async getTokenMetadata(mintAddress) {
        try {
            // Derive metadata PDA
            const mintPubkey = new web3_js_1.PublicKey(mintAddress);
            const metadataPDA = await this.getMetadataPDA(mintPubkey);
            // Try to get from RPC first
            let metadataUri = '';
            if (this.connection) {
                try {
                    const metadataAccount = await this.connection.getAccountInfo(metadataPDA);
                    if (metadataAccount && metadataAccount.data) {
                        // Parse metadata (simplified - Metaplex metadata is borsh serialized)
                        // For production, use @metaplex-foundation/js
                        metadataUri = this.extractMetadataUri(metadataAccount.data);
                    }
                }
                catch (error) {
                    logger_1.default.debug(`[SolanaRPC] Could not fetch metadata from RPC: ${error}`);
                }
            }
            // If we have a metadata URI, fetch the actual metadata
            if (metadataUri) {
                return await this.fetchMetadataFromUri(metadataUri);
            }
            // Fallback: try to get from pump.fun API
            return await this.fetchPumpFunMetadata(mintAddress);
        }
        catch (error) {
            logger_1.default.error(`[SolanaRPC] Failed to get token metadata: ${error}`);
            return null;
        }
    }
    /**
     * Derive Metaplex metadata PDA for a mint
     */
    async getMetadataPDA(mint) {
        const metadataProgramId = new web3_js_1.PublicKey(METADATA_PROGRAM_ID);
        const seeds = [
            Buffer.from(METADATA_SEED),
            metadataProgramId.toBuffer(),
            mint.toBuffer(),
        ];
        // Use PublicKey.findProgramAddressSync (available in @solana/web3.js >= 1.78)
        const [pda] = web3_js_1.PublicKey.findProgramAddressSync(seeds, metadataProgramId);
        return pda;
    }
    /**
     * Extract metadata URI from raw metadata account data
     * This is a simplified version - production should use proper borsh deserialization
     */
    extractMetadataUri(data) {
        try {
            // Skip metadata header (1 byte key + 32 bytes update authority + optional cretor)
            // The URI is usually after the name and symbol fields
            // This is a placeholder - proper implementation requires borsh parsing
            // For now, return empty and let the pump.fun API fallback handle it
            return '';
        }
        catch (error) {
            return '';
        }
    }
    /**
     * Fetch metadata from Arweave/IPFS URI
     */
    async fetchMetadataFromUri(uri) {
        try {
            const response = await axios_1.default.get(uri, { timeout: 10000 });
            const data = response.data;
            return {
                name: data.name || 'Unknown',
                symbol: data.symbol || 'UNKNOWN',
                description: data.description || '',
                image: data.image || '',
                website: data.extensions?.website,
                twitter: data.extensions?.twitter,
                telegram: data.extensions?.telegram,
                discord: data.extensions?.discord,
                extensions: data.extensions || {},
            };
        }
        catch (error) {
            logger_1.default.warn(`[SolanaRPC] Failed to fetch metadata from URI ${uri}: ${error}`);
            return null;
        }
    }
    /**
     * Fetch token metadata from pump.fun API (fallback)
     */
    async fetchPumpFunMetadata(mintAddress) {
        // Primary: current frontend API endpoint by mint.
        try {
            const response = await axios_1.default.get(`${PUMPFUN_FRONTEND_API_BASE}/coins/${mintAddress}`, {
                timeout: 10000,
                headers: PUMPFUN_FRONTEND_HEADERS,
            });
            const data = response.data || {};
            return {
                name: data.name || 'Unknown',
                symbol: data.symbol || 'UNKNOWN',
                description: data.description || '',
                image: data.image || data.image_uri || '',
                website: data.website || data.website_url || undefined,
                twitter: data.twitter,
                telegram: data.telegram,
                discord: data.discord,
                extensions: {
                    bondingCurveKey: data.bonding_curve_key || data.bonding_curve,
                },
            };
        }
        catch (error) {
            logger_1.default.debug(`[SolanaRPC] Frontend metadata lookup failed for ${mintAddress}: ${error}`);
        }
        // Fallback: legacy API (may return 404 for many tokens).
        try {
            const response = await axios_1.default.get(`https://api.pump.fun/coins/${mintAddress}`, { timeout: 10000 });
            const data = response.data || {};
            return {
                name: data.name || 'Unknown',
                symbol: data.symbol || 'UNKNOWN',
                description: data.description || '',
                image: data.image || data.image_uri || '',
                website: data.website || data.website_url || undefined,
                twitter: data.twitter,
                telegram: data.telegram,
                discord: data.discord,
                extensions: {
                    bondingCurveKey: data.bonding_curve_key || data.bonding_curve,
                },
            };
        }
        catch (error) {
            const status = error?.response?.status;
            if (status !== 404) {
                logger_1.default.warn(`[SolanaRPC] Legacy pump.fun metadata fetch failed: ${error}`);
            }
            return null;
        }
    }
    /**
     * Get detailed transaction information
     */
    async getTransaction(signature) {
        if (!this.connection) {
            await this.connect();
        }
        try {
            const tx = await this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
            return tx;
        }
        catch (error) {
            logger_1.default.error(`[SolanaRPC] Failed to get transaction: ${error}`);
            return null;
        }
    }
    /**
     * Unsubscribe from logs
     */
    unsubscribe() {
        if (this.subscriptionId !== null && this.connection) {
            try {
                // Try removeOnLogs first (older versions)
                if (typeof this.connection.removeOnLogs === 'function') {
                    this.connection.removeOnLogs(this.subscriptionId);
                }
            }
            catch (error) {
                // Ignore error, subscription will timeout naturally
                logger_1.default.debug('[SolanaRPC] removeOnLogs not available or failed:', error);
            }
            this.subscriptionId = null;
            logger_1.default.info('[SolanaRPC] Unsubscribed from pump.fun program');
        }
    }
    /**
     * Disconnect from Solana RPC
     */
    async disconnect() {
        this.unsubscribe();
        this.connection = null;
        logger_1.default.info('[SolanaRPC] Disconnected');
    }
    /**
     * Get connection status
     */
    isConnected() {
        return this.connection !== null;
    }
}
// Singleton instance
const solanaRPCService = new SolanaRPCService();
exports.default = solanaRPCService;
//# sourceMappingURL=solana-rpc.js.map