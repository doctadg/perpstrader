/**
 * AgentDEX Client - Solana Swap Execution
 * 
 * Provides Solana token swap capability for Vex Capital via AgentDEX API.
 * Use this when you want to:
 * - Convert prediction market profits to other tokens
 * - Execute directional trades based on prediction signals
 * - Rebalance portfolio across Solana tokens
 * 
 * API: https://agentdex.solana-clawd.dev (when deployed)
 * Repo: https://github.com/solana-clawd/agent-dex
 */

import { EventEmitter } from 'events';

// AgentDEX API configuration
const AGENTDEX_API_URL = process.env.AGENTDEX_API_URL || 'https://agentdex.solana-clawd.dev';
const AGENTDEX_API_KEY = process.env.AGENTDEX_API_KEY || '';

export interface AgentDEXConfig {
  apiUrl?: string;
  apiKey?: string;
  walletAddress?: string;
  slippageBps?: number; // Default slippage in basis points
}

export interface QuoteRequest {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}

export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  priceImpactPct: number;
  routePlan: RoutePlan[];
  otherAmountThreshold: string;
}

export interface RoutePlan {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface SwapRequest {
  quote: QuoteResponse;
  userPublicKey: string;
  dynamicSlippage?: boolean;
}

export interface SwapResponse {
  swapTransaction: string; // Base64 encoded transaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

export interface SwapResult {
  signature: string;
  inputAmount: string;
  outputAmount: string;
  priceImpactPct: number;
  fee: string;
  success: boolean;
  error?: string;
}

export interface PortfolioToken {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  decimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface Portfolio {
  wallet: string;
  tokens: PortfolioToken[];
  totalValueUsd: number;
  lastUpdated: string;
}

// Common Solana token mints
export const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
} as const;

export class AgentDEXClient extends EventEmitter {
  private apiUrl: string;
  private apiKey: string;
  private walletAddress: string;
  private defaultSlippageBps: number;

  constructor(config: AgentDEXConfig = {}) {
    super();
    this.apiUrl = config.apiUrl || AGENTDEX_API_URL;
    this.apiKey = config.apiKey || AGENTDEX_API_KEY;
    this.walletAddress = config.walletAddress || '';
    this.defaultSlippageBps = config.slippageBps || 50; // 0.5% default
  }

  /**
   * Get a swap quote
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const params = new URLSearchParams({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amount.toString(),
      slippageBps: (request.slippageBps || this.defaultSlippageBps).toString(),
    });

    const response = await fetch(`${this.apiUrl}/quote?${params}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AgentDEX quote failed: ${error}`);
    }

    const quote = await response.json();
    this.emit('quote', quote);
    return quote;
  }

  /**
   * Execute a swap
   */
  async swap(request: SwapRequest): Promise<SwapResult> {
    // Get the swap transaction
    const swapResponse = await fetch(`${this.apiUrl}/swap`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        quoteResponse: request.quote,
        userPublicKey: request.userPublicKey,
        dynamicSlippage: request.dynamicSlippage ?? true,
      }),
    });

    if (!swapResponse.ok) {
      const error = await swapResponse.text();
      return {
        signature: '',
        inputAmount: request.quote.inputAmount,
        outputAmount: '0',
        priceImpactPct: request.quote.priceImpactPct,
        fee: '0',
        success: false,
        error: `Swap failed: ${error}`,
      };
    }

    const swapData: SwapResponse = await swapResponse.json();
    
    // For unsigned-tx mode, return the transaction for external signing
    this.emit('swapTransaction', swapData);

    return {
      signature: 'pending-signature', // Caller handles signing
      inputAmount: request.quote.inputAmount,
      outputAmount: request.quote.outputAmount,
      priceImpactPct: request.quote.priceImpactPct,
      fee: '0',
      success: true,
    };
  }

  /**
   * Simple swap helper - quote and execute in one call
   */
  async simpleSwap(
    inputMint: string,
    outputMint: string,
    amount: number,
    userPublicKey: string
  ): Promise<SwapResult> {
    const quote = await this.getQuote({
      inputMint,
      outputMint,
      amount,
    });

    return this.swap({
      quote,
      userPublicKey,
    });
  }

  /**
   * Get portfolio for a wallet
   */
  async getPortfolio(wallet?: string): Promise<Portfolio> {
    const targetWallet = wallet || this.walletAddress;
    if (!targetWallet) {
      throw new Error('No wallet address provided');
    }

    const response = await fetch(`${this.apiUrl}/portfolio/${targetWallet}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Portfolio fetch failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Get current prices for tokens
   */
  async getPrices(mints: string[]): Promise<Record<string, number>> {
    const params = new URLSearchParams();
    mints.forEach(mint => params.append('ids', mint));

    const response = await fetch(`${this.apiUrl}/prices?${params}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Price fetch failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Convert prediction market signal to swap execution
   * 
   * This is the key integration point: when Vex Capital's prediction
   * agent identifies a high-confidence signal, execute the trade.
   */
  async executePredictionTrade(
    signal: {
      asset: string;
      direction: 'bullish' | 'bearish';
      confidence: number;
      amount: number;
    },
    userPublicKey: string
  ): Promise<SwapResult> {
    // Map prediction asset to Solana token
    const tokenMap: Record<string, string> = {
      'SOL': TOKENS.SOL,
      'ETH': TOKENS.SOL, // No ETH on Solana, use SOL as proxy
      'BTC': TOKENS.SOL, // No BTC on Solana, use SOL as proxy
      'BONK': TOKENS.BONK,
      'JUP': TOKENS.JUP,
    };

    const targetToken = tokenMap[signal.asset] || TOKENS.SOL;
    
    // Bullish = buy the asset (USDC -> asset)
    // Bearish = sell the asset (asset -> USDC)
    const inputMint = signal.direction === 'bullish' ? TOKENS.USDC : targetToken;
    const outputMint = signal.direction === 'bullish' ? targetToken : TOKENS.USDC;

    // Scale amount by confidence
    const scaledAmount = Math.floor(signal.amount * signal.confidence);

    this.emit('predictionTrade', {
      signal,
      inputMint,
      outputMint,
      scaledAmount,
    });

    return this.simpleSwap(inputMint, outputMint, scaledAmount, userPublicKey);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}

// Export singleton instance for easy use
export const agentDEX = new AgentDEXClient();

// Helper function for quick swaps
export async function quickSwap(
  from: keyof typeof TOKENS,
  to: keyof typeof TOKENS,
  amount: number,
  wallet: string
): Promise<SwapResult> {
  return agentDEX.simpleSwap(TOKENS[from], TOKENS[to], amount, wallet);
}
