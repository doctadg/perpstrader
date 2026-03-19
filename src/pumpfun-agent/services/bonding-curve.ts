// Bonding Curve Service - pump.fun bonding curve buy/sell execution
// Supports both paper and live modes
// Uses Helius RPC for on-chain transactions

import { Connection, PublicKey, Transaction, VersionedTransaction, Keypair, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import logger from '../../shared/logger';
import configManager from '../../shared/config';

// pump.fun Program ID
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkjon8nkdqXHDr3EbmLB4TqRASFjZxb');

// pump.fun Global state (holds fee recipient)
const PUMPFUN_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');

// Associated token program
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// System program
const SYSTEM_PROGRAM_ID = SystemProgram.programId;

// Rent sysvar
const RENT_SYSVAR = new PublicKey('SysvarRent111111111111111111111111111111111');

// Event authority
const PUMPFUN_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

interface BondingCurveState {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
}

interface BuyQuote {
  solAmount: number;      // SOL to spend
  tokenAmount: number;    // tokens to receive
  pricePerToken: number;  // SOL per token
  marketCapSol: number;   // approximate market cap
  bondingCurveProgress: number; // 0-1 how close to DEX listing
}

interface SellQuote {
  tokenAmount: number;
  solAmount: number;
  pricePerToken: number;
}

export interface SnipeResult {
  success: boolean;
  tokenAddress: string;
  txSignature?: string;
  solSpent: number;
  tokensReceived: number;
  error?: string;
  paperMode: boolean;
  timestamp: Date;
}

export interface SellResult {
  success: boolean;
  tokenAddress: string;
  txSignature?: string;
  tokensSold: number;
  solReceived: number;
  error?: string;
  paperMode: boolean;
  timestamp: Date;
}

type PaperPosition = {
  tokenMint: string;
  tokenSymbol: string;
  tokensOwned: number;
  solSpent: number;
  entryPrice: number; // SOL per token at entry
  buyTimestamp: Date;
  tpLevels: TpLevel[];
  partialSells: { tokensSold: number; solReceived: number; tpLevel: string; timestamp: Date }[];
};

export interface TpLevel {
  name: string;
  multiplier: number; // e.g. 2x = 2.0
  pctToSell: number;  // e.g. 0.5 = 50% of remaining
  triggered: boolean;
}

/**
 * Bonding Curve execution service
 */
class BondingCurveService {
  private connection: Connection | null = null;
  private wallet: Keypair | null = null;
  private paperMode: boolean = true;
  private paperPositions: Map<string, PaperPosition> = new Map();
  private paperSolBalance: number = 10; // Start with 10 SOL in paper mode
  private initialized = false;

  constructor() {
    this.paperMode = process.env.PUMPFUN_PAPER_MODE !== 'false'; // default paper
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = configManager.get();
    const rpcUrl = process.env.HELIUS_RPC_URL || config.solana?.rpcUrl || 'https://api.mainnet-beta.solana.com';

    logger.info(`[BondingCurve] Initializing (mode: ${this.paperMode ? 'PAPER' : 'LIVE'})`);
    logger.info(`[BondingCurve] RPC: ${rpcUrl.replace(/\/\/[^:]+@/, '//***@')}`);

    if (!this.paperMode) {
      // Live mode: load wallet from private key
      const privateKey = process.env.SOLANA_PRIVATE_KEY;
      if (!privateKey) {
        logger.error('[BondingCurve] SOLANA_PRIVATE_KEY not set, falling back to paper mode');
        this.paperMode = true;
      } else {
        try {
          // Try bs58 encoded first
          if (privateKey.length < 100) {
            const keypairBytes = bs58.decode(privateKey);
            this.wallet = Keypair.fromSecretKey(keypairBytes);
          } else {
            // JSON array format
            const keypairBytes = new Uint8Array(JSON.parse(privateKey));
            this.wallet = Keypair.fromSecretKey(keypairBytes);
          }
          logger.info(`[BondingCurve] Wallet loaded: ${this.wallet.publicKey.toString()}`);
        } catch (err) {
          logger.error('[BondingCurve] Failed to load wallet:', err);
          this.paperMode = true;
        }
      }
    }

    // Connect to Solana
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: process.env.HELIUS_WS_URL || process.env.SOLANA_WS_URL,
    });

    try {
      const version = await this.connection.getVersion();
      logger.info(`[BondingCurve] Connected to Solana: ${version['solana-core']}`);
    } catch (err) {
      logger.warn(`[BondingCurve] RPC connection failed (paper mode still works): ${err}`);
    }

    this.initialized = true;
  }

  isPaperMode(): boolean {
    return this.paperMode;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Derive the bonding curve PDA for a token
   */
  private async getBondingCurvePDA(tokenMint: PublicKey): Promise<PublicKey> {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), tokenMint.toBuffer()],
      PUMPFUN_PROGRAM_ID
    );
    return pda;
  }

  /**
   * Derive the associated bonding curve token account
   */
  private async getAssociatedBondingCurve(tokenMint: PublicKey): Promise<PublicKey> {
    const bondingCurve = await this.getBondingCurvePDA(tokenMint);
    return getAssociatedTokenAddress(tokenMint, bondingCurve, true, TOKEN_PROGRAM_ID);
  }

  /**
   * Read bonding curve state from on-chain
   */
  async readBondingCurveState(tokenMint: string): Promise<BondingCurveState | null> {
    if (!this.connection) {
      logger.warn('[BondingCurve] No connection, cannot read bonding curve');
      return null;
    }

    try {
      const mint = new PublicKey(tokenMint);
      const bondingCurve = await this.getBondingCurvePDA(mint);
      const data = await this.connection.getAccountInfo(bondingCurve);

      if (!data || !data.data) {
        return null;
      }

      // Bonding curve account layout:
      // 0-8: discriminator (u64)
      // 8-16: virtualTokenReserves (u64)
      // 16-24: virtualSolReserves (u64)
      // 24-32: realTokenReserves (u64)
      // 32-40: realSolReserves (u64)
      // 40-48: tokenTotalSupply (u64)
      // 48-49: complete (bool)
      const buf = data.data;
      return {
        virtualTokenReserves: buf.readBigUInt64LE(8),
        virtualSolReserves: buf.readBigUInt64LE(16),
        realTokenReserves: buf.readBigUInt64LE(24),
        realSolReserves: buf.readBigUInt64LE(32),
        tokenTotalSupply: buf.readBigUInt64LE(40),
        complete: buf[48] === 1,
      };
    } catch (err) {
      logger.debug(`[BondingCurve] Failed to read bonding curve for ${tokenMint}: ${err}`);
      return null;
    }
  }

  /**
   * Calculate buy quote (constant product AMM)
   */
  getBuyQuote(state: BondingCurveState, solAmount: number): BuyQuote | null {
    const fee = solAmount * 0.01; // 1% fee
    const solForCurve = solAmount - fee;

    // Constant product: k = virtualTokenReserves * virtualSolReserves
    // newSolReserves = virtualSolReserves + solForCurve
    // newTokenReserves = k / newSolReserves
    // tokensOut = virtualTokenReserves - newTokenReserves
    const k = Number(state.virtualTokenReserves) * Number(state.virtualSolReserves);
    const newSolReserves = Number(state.virtualSolReserves) + solForCurve * LAMPORTS_PER_SOL;
    const newTokenReserves = k / newSolReserves;
    const tokensOut = (Number(state.virtualTokenReserves) - newTokenReserves) / 1e6; // pump.fun tokens are 6 decimals

    if (tokensOut <= 0) return null;

    // Market cap approximation (1B tokens = full supply)
    const totalTokens = Number(state.tokenTotalSupply) / 1e6;
    const pricePerToken = solForCurve / tokensOut;
    const marketCapSol = pricePerToken * totalTokens;

    // Bonding curve progress: how much SOL is in vs typical graduation (~85-120 SOL)
    const graduationTarget = 85 * LAMPORTS_PER_SOL; // approximate
    const progress = Math.min(1, Number(state.realSolReserves) / graduationTarget);

    return {
      solAmount,
      tokenAmount: tokensOut,
      pricePerToken,
      marketCapSol,
      bondingCurveProgress: progress,
    };
  }

  /**
   * Calculate sell quote
   */
  getSellQuote(state: BondingCurveState, tokenAmount: number): SellQuote | null {
    const tokenAmountLamports = tokenAmount * 1e6;

    const k = Number(state.virtualTokenReserves) * Number(state.virtualSolReserves);
    const newTokenReserves = Number(state.virtualTokenReserves) + tokenAmountLamports;
    const newSolReserves = k / newTokenReserves;
    const solOut = (Number(state.virtualSolReserves) - newSolReserves) / LAMPORTS_PER_SOL;

    if (solOut <= 0) return null;

    const fee = solOut * 0.01;
    return {
      tokenAmount,
      solAmount: solOut - fee,
      pricePerToken: solOut / tokenAmount,
    };
  }

  /**
   * Execute a buy on the bonding curve
   */
  async buy(
    tokenMint: string,
    tokenSymbol: string,
    solAmount: number,
    tpLevels: TpLevel[] = DEFAULT_TP_LEVELS,
  ): Promise<SnipeResult> {
    const timestamp = new Date();

    if (this.paperMode) {
      return this.paperBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp);
    }

    // Live buy not implemented yet (requires transaction building)
    // Will be added when going live
    logger.warn('[BondingCurve] Live buy not yet implemented, using paper fallback');
    return this.paperBuy(tokenMint, tokenSymbol, solAmount, tpLevels, timestamp);
  }

  /**
   * Paper mode buy
   */
  private paperBuy(
    tokenMint: string,
    tokenSymbol: string,
    solAmount: number,
    tpLevels: TpLevel[],
    timestamp: Date,
  ): SnipeResult {
    if (this.paperSolBalance < solAmount) {
      return {
        success: false,
        tokenAddress: tokenMint,
        solSpent: 0,
        tokensReceived: 0,
        error: `Insufficient paper SOL balance (${this.paperSolBalance.toFixed(2)} < ${solAmount.toFixed(2)})`,
        paperMode: true,
        timestamp,
      };
    }

    // Simulate bonding curve pricing: start with ~1B supply, 30 SOL virtual reserves
    const virtualTokenReserves = 1_000_000_000 * 1e6;
    const virtualSolReserves = 30 * LAMPORTS_PER_SOL;
    const mockState: BondingCurveState = {
      virtualTokenReserves: BigInt(virtualTokenReserves),
      virtualSolReserves: BigInt(virtualSolReserves),
      realTokenReserves: BigInt(0),
      realSolReserves: BigInt(0),
      tokenTotalSupply: BigInt(1_000_000_000_000_000), // 1B * 1e6
      complete: false,
    };

    const quote = this.getBuyQuote(mockState, solAmount);
    if (!quote) {
      return {
        success: false,
        tokenAddress: tokenMint,
        solSpent: 0,
        tokensReceived: 0,
        error: 'Quote returned zero tokens',
        paperMode: true,
        timestamp,
      };
    }

    this.paperSolBalance -= solAmount;

    this.paperPositions.set(tokenMint, {
      tokenMint,
      tokenSymbol,
      tokensOwned: quote.tokenAmount,
      solSpent: solAmount,
      entryPrice: quote.pricePerToken,
      buyTimestamp: timestamp,
      tpLevels: tpLevels.map(tp => ({ ...tp, triggered: false })),
      partialSells: [],
    });

    logger.info(
      `[PAPER BUY] ${tokenSymbol} | ${solAmount.toFixed(3)} SOL -> ${quote.tokenAmount.toFixed(0)} tokens @ ${quote.pricePerToken.toFixed(12)} SOL/token | MC: ${quote.marketCapSol.toFixed(2)} SOL`
    );

    return {
      success: true,
      tokenAddress: tokenMint,
      solSpent: solAmount,
      tokensReceived: quote.tokenAmount,
      paperMode: true,
      timestamp,
    };
  }

  /**
   * Sell tokens (or partial) from a position
   * Checks TP levels and sells the appropriate portion
   */
  async checkAndSell(tokenMint: string, currentPriceMultiplier: number): Promise<SellResult[]> {
    const position = this.paperPositions.get(tokenMint);
    if (!position) return [];

    const results: SellResult[] = [];

    for (const tp of position.tpLevels) {
      if (tp.triggered) continue;
      if (currentPriceMultiplier < tp.multiplier) continue;

      tp.triggered = true;
      const tokensToSell = position.tokensOwned * tp.pctToSell;
      const solToReceive = tokensToSell * currentPriceMultiplier * position.entryPrice;

      position.tokensOwned -= tokensToSell;
      position.partialSells.push({
        tokensSold: tokensToSell,
        solReceived: solToReceive,
        tpLevel: tp.name,
        timestamp: new Date(),
      });

      if (this.paperMode) {
        this.paperSolBalance += solToReceive;
      }

      logger.info(
        `[PAPER SELL] ${position.tokenSymbol} TP ${tp.name} | ${tokensToSell.toFixed(0)} tokens -> ${solToReceive.toFixed(4)} SOL (${(tp.multiplier * 100).toFixed(0)}x)`
      );

      results.push({
        success: true,
        tokenAddress: tokenMint,
        tokensSold: tokensToSell,
        solReceived: solToReceive,
        paperMode: true,
        timestamp: new Date(),
      });
    }

    // Clean up fully exited positions
    if (position.tokensOwned < 1) {
      this.paperPositions.delete(tokenMint);
      const totalPnl = position.partialSells.reduce((s, p) => s + p.solReceived, 0) - position.solSpent;
      logger.info(`[POSITION CLOSED] ${position.tokenSymbol} | PnL: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(4)} SOL | ${position.partialSells.length} partial sells`);
    }

    return results;
  }

  /**
   * Force sell entire position (emergency exit / stop loss)
   */
  async emergencySell(tokenMint: string, currentPriceMultiplier: number): Promise<SellResult | null> {
    const position = this.paperPositions.get(tokenMint);
    if (!position || position.tokensOwned < 1) return null;

    const solToReceive = position.tokensOwned * currentPriceMultiplier * position.entryPrice;

    this.paperPositions.delete(tokenMint);

    if (this.paperMode) {
      this.paperSolBalance += solToReceive;
    }

    logger.info(
      `[EMERGENCY SELL] ${position.tokenSymbol} | ${position.tokensOwned.toFixed(0)} tokens -> ${solToReceive.toFixed(4)} SOL`
    );

    return {
      success: true,
      tokenAddress: tokenMint,
      tokensSold: position.tokensOwned,
      solReceived: solToReceive,
      paperMode: true,
      timestamp: new Date(),
    };
  }

  /**
   * Get all open positions
   */
  getPositions(): PaperPosition[] {
    return Array.from(this.paperPositions.values());
  }

  /**
   * Get portfolio summary
   */
  getPortfolioSummary(): {
    mode: string;
    solBalance: number;
    openPositions: number;
    totalInvested: number;
    totalRealized: number;
    unrealizedPnl: number;
  } {
    const positions = this.getPositions();
    const totalInvested = positions.reduce((s, p) => s + p.solSpent, 0);
    const totalRealized = positions.reduce((s, p) => s + p.partialSells.reduce((ss, ps) => ss + ps.solReceived, 0), 0);

    return {
      mode: this.paperMode ? 'PAPER' : 'LIVE',
      solBalance: this.paperSolBalance,
      openPositions: positions.length,
      totalInvested,
      totalRealized,
      unrealizedPnl: 0, // Would need current prices to calculate
    };
  }
}

// Default TP levels: aggressive, get initial out ASAP
const DEFAULT_TP_LEVELS: TpLevel[] = [
  { name: 'INITIAL', multiplier: 1.5, pctToSell: 0.5, triggered: false },   // Sell 50% at 1.5x (get initial out)
  { name: 'SAFE', multiplier: 3.0, pctToSell: 0.5, triggered: false },     // Sell 50% remaining at 3x
  { name: 'MOON', multiplier: 10.0, pctToSell: 1.0, triggered: false },    // Sell all remaining at 10x
];

export { DEFAULT_TP_LEVELS };
export const bondingCurveService = new BondingCurveService();
export default bondingCurveService;
