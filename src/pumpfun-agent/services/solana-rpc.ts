// Solana RPC Service for pump.fun Token Monitoring
// Handles Solana blockchain interactions for token discovery and security analysis

import { Connection, PublicKey, ParsedAccountData } from '@solana/web3.js';
import axios from 'axios';
import configManager from '../../shared/config';
import logger from '../../shared/logger';
import { PumpFunToken, TokenMetadata, ContractSecurity } from '../../shared/types';

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
  private connection: Connection | null = null;
  private subscriptionId: number | null = null;
  private rpcUrl: string;
  private wsUrl: string;
  private commitment: 'processed' | 'confirmed' | 'finalized';

  constructor() {
    const config = configManager.get();
    this.rpcUrl = config.solana?.rpcUrl || 'https://api.mainnet-beta.solana.com';
    this.wsUrl = config.solana?.wsUrl || this.rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    this.commitment = config.solana?.commitment || 'confirmed';
  }

  /**
   * Connect to Solana RPC
   */
  async connect(): Promise<void> {
    try {
      // Connection constructor requires HTTP URL; wsEndpoint is for WebSocket subscriptions
      this.connection = new Connection(
        this.rpcUrl,
        {
          commitment: this.commitment,
          wsEndpoint: this.wsUrl,
        }
      );

      // Test connection
      const version = await this.connection.getVersion();
      logger.info(`[SolanaRPC] Connected to Solana RPC: ${version['solana-core']}`);

    } catch (error) {
      logger.error(`[SolanaRPC] Failed to connect: ${error}`);
      throw error;
    }
  }

  /**
   * Subscribe to pump.fun token creation events
   */
  async subscribeToTokenLaunches(
    callback: (token: PumpFunToken) => void,
    durationMs: number = 30000
  ): Promise<void> {
    if (!this.connection) {
      await this.connect();
    }

    const programId = new PublicKey(PUMPFUN_PROGRAM_ID);
    const seenMints = new Set<string>();

    logger.info(`[SolanaRPC] Subscribing to pump.fun program: ${PUMPFUN_PROGRAM_ID}`);

    this.subscriptionId = this.connection!.onLogs(
      programId,
      (logs, context) => {
        try {
          // Parse logs for token creation events
          const token = this.parseTokenCreationEvent(logs, context);

          if (token && !seenMints.has(token.mintAddress)) {
            seenMints.add(token.mintAddress);
            logger.info(`[SolanaRPC] Discovered token: ${token.symbol} (${token.mintAddress})`);
            callback(token);
          }
        } catch (error) {
          logger.warn(`[SolanaRPC] Failed to parse logs: ${error}`);
        }
      },
      this.commitment
    );

    logger.info(`[SolanaRPC] Subscription active for ${durationMs}ms`);

    // Auto-unsubscribe after duration
    setTimeout(() => {
      this.unsubscribe();
      logger.info(`[SolanaRPC] Subscription ended. Discovered ${seenMints.size} tokens.`);
    }, durationMs);
  }

  /**
   * Parse pump.fun log data to extract token creation event
   */
  private parseTokenCreationEvent(
    logs: any,
    context: any
  ): PumpFunToken | null {
    try {
      // Check if logs contain pump.fun specific patterns
      const logStrings = logs.logs || [];

      // pump.fun create events typically contain "Program log: Instruction: Create" or similar
      // The actual mint address can be found in the signature or parsed from log data

      // For now, extract from the signature (first account in the transaction is usually the mint)
      const signature = context.signature;
      if (!signature) return null;

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
    } catch (error) {
      logger.warn(`[SolanaRPC] Failed to parse token creation event: ${error}`);
      return null;
    }
  }

  /**
   * Get mint account information for security analysis
   */
  async getMintInfo(mintAddress: string): Promise<ContractSecurity> {
    if (!this.connection) {
      await this.connect();
    }

    try {
      const mintPubkey = new PublicKey(mintAddress);
      const accountInfo = await this.connection!.getAccountInfo(mintPubkey);

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
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (isMintable && isFreezable) {
        riskLevel = 'HIGH';
      } else if (isMintable || isFreezable) {
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
    } catch (error) {
      logger.error(`[SolanaRPC] Failed to get mint info: ${error}`);
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
  async getTokenMetadata(mintAddress: string): Promise<TokenMetadata | null> {
    try {
      // Derive metadata PDA
      const mintPubkey = new PublicKey(mintAddress);
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
        } catch (error) {
          logger.debug(`[SolanaRPC] Could not fetch metadata from RPC: ${error}`);
        }
      }

      // If we have a metadata URI, fetch the actual metadata
      if (metadataUri) {
        return await this.fetchMetadataFromUri(metadataUri);
      }

      // Fallback: try to get from pump.fun API
      return await this.fetchPumpFunMetadata(mintAddress);
    } catch (error) {
      logger.error(`[SolanaRPC] Failed to get token metadata: ${error}`);
      return null;
    }
  }

  /**
   * Derive Metaplex metadata PDA for a mint
   */
  private async getMetadataPDA(mint: PublicKey): Promise<PublicKey> {
    const metadataProgramId = new PublicKey(METADATA_PROGRAM_ID);
    const seeds = [
      Buffer.from(METADATA_SEED),
      metadataProgramId.toBuffer(),
      mint.toBuffer(),
    ];

    // Use PublicKey.findProgramAddressSync (available in @solana/web3.js >= 1.78)
    const [pda] = PublicKey.findProgramAddressSync(seeds, metadataProgramId);
    return pda;
  }

  /**
   * Extract metadata URI from raw metadata account data
   * This is a simplified version - production should use proper borsh deserialization
   */
  private extractMetadataUri(data: Buffer): string {
    try {
      // Skip metadata header (1 byte key + 32 bytes update authority + optional cretor)
      // The URI is usually after the name and symbol fields
      // This is a placeholder - proper implementation requires borsh parsing

      // For now, return empty and let the pump.fun API fallback handle it
      return '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Fetch metadata from Arweave/IPFS URI
   */
  private async fetchMetadataFromUri(uri: string): Promise<TokenMetadata | null> {
    try {
      const response = await axios.get(uri, { timeout: 10000 });
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
    } catch (error) {
      logger.warn(`[SolanaRPC] Failed to fetch metadata from URI ${uri}: ${error}`);
      return null;
    }
  }

  /**
   * Fetch token metadata from pump.fun API (fallback)
   */
  private async fetchPumpFunMetadata(mintAddress: string): Promise<TokenMetadata | null> {
    // Primary: current frontend API endpoint by mint.
    try {
      const response = await axios.get(`${PUMPFUN_FRONTEND_API_BASE}/coins/${mintAddress}`, {
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
    } catch (error) {
      logger.debug(`[SolanaRPC] Frontend metadata lookup failed for ${mintAddress}: ${error}`);
    }

    // Fallback: legacy API (may return 404 for many tokens).
    try {
      const response = await axios.get(`https://api.pump.fun/coins/${mintAddress}`, { timeout: 10000 });
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
    } catch (error) {
      const status = (error as any)?.response?.status;
      if (status !== 404) {
        logger.warn(`[SolanaRPC] Legacy pump.fun metadata fetch failed: ${error}`);
      }
      return null;
    }
  }

  /**
   * Get detailed transaction information
   */
  async getTransaction(signature: string): Promise<any> {
    if (!this.connection) {
      await this.connect();
    }

    try {
      const tx = await this.connection!.getParsedTransaction(
        signature,
        { maxSupportedTransactionVersion: 0 }
      );
      return tx;
    } catch (error) {
      logger.error(`[SolanaRPC] Failed to get transaction: ${error}`);
      return null;
    }
  }

  /**
   * Unsubscribe from logs
   */
  unsubscribe(): void {
    if (this.subscriptionId !== null && this.connection) {
      try {
        // Try removeOnLogs first (older versions)
        if (typeof (this.connection as any).removeOnLogs === 'function') {
          (this.connection as any).removeOnLogs(this.subscriptionId);
        }
      } catch (error) {
        // Ignore error, subscription will timeout naturally
        logger.debug('[SolanaRPC] removeOnLogs not available or failed:', error);
      }
      this.subscriptionId = null;
      logger.info('[SolanaRPC] Unsubscribed from pump.fun program');
    }
  }

  /**
   * Disconnect from Solana RPC
   */
  async disconnect(): Promise<void> {
    this.unsubscribe();
    this.connection = null;
    logger.info('[SolanaRPC] Disconnected');
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.connection !== null;
  }
}

// Singleton instance
const solanaRPCService = new SolanaRPCService();
export default solanaRPCService;
