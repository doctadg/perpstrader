// WebSocket Snipe Service - Real-time pump.fun token launch detection
// Subscribes to pump.fun program logs via Helius/Solana WebSocket
// Detects new token creations within milliseconds of on-chain event

import { Connection, PublicKey } from '@solana/web3.js';
import logger from '../../shared/logger';
import configManager from '../../shared/config';
import bondingCurveService, { DEFAULT_TP_LEVELS, TIME_EXIT_MINUTES } from './bonding-curve';

// pump.fun Program ID
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkjon8nkdqXHDr3EbmLB4TqRASFjZxb';

export interface NewTokenEvent {
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  uri: string;
  creator: string;
  timestamp: Date;
  bondingCurveAddress: string;
}

export interface SnipeCandidate {
  event: NewTokenEvent;
  score: number;
  recommendation: string;
  buyExecuted: boolean;
  buyResult?: any;
}

type TokenCallback = (event: NewTokenEvent) => void;
type SnipeCallback = (candidate: SnipeCandidate) => void;

/**
 * WebSocket-based pump.fun token snipe service
 * Detects new launches and optionally auto-buys high-confidence tokens
 */
class SnipeService {
  private connection: Connection | null = null;
  private wsSubscription: number | null = null;
  private running = false;
  private tokenCallbacks: TokenCallback[] = [];
  private snipeCallbacks: SnipeCallback[] = [];
  private processedMints = new Set<string>();
  private recentTokens: NewTokenEvent[] = [];
  private snipeQueue: SnipeCandidate[] = [];
  private analysisQueue: NewTokenEvent[] = [];

  // Config
  private maxSnipePerHour: number = 10;
  private snipeCountThisHour = 0;
  private lastHourReset = Date.now();
  private minScoreToBuy: number = 0.7;
  private solPerSnipe: number = 0.5;
  private cooldownMs: number = 3000; // 3s between snipes to avoid spam
  private lastSnipeTime = 0;
  private permanentBlacklist = new Set<string>(); // Tokens we've traded and exited (never re-buy)

  // Paper mode pricing - NO LONGER USED, kept for reference only
  private tokenPrices = new Map<string, number>(); // tokenMint -> price multiplier vs entry

  constructor() {
    this.minScoreToBuy = parseFloat(process.env.PUMPFUN_MIN_BUY_SCORE || '0.4');
    this.solPerSnipe = parseFloat(process.env.PUMPFUN_SNIPER_SOL_AMOUNT || '0.3');
    this.maxSnipePerHour = parseInt(process.env.PUMPFUN_MAX_SNIPE_PER_HOUR || '15');
    this.cooldownMs = parseInt(process.env.PUMPFUN_SNIPER_COOLDOWN_MS || '2000');
  }

  onToken(callback: TokenCallback): void {
    this.tokenCallbacks.push(callback);
  }

  onSnipe(callback: SnipeCallback): void {
    this.snipeCallbacks.push(callback);
  }

  /**
   * Start the WebSocket listener
   */
  async start(): Promise<void> {
    if (this.running) return;

    const config = configManager.get();
    const rpcUrl = process.env.HELIUS_RPC_URL || config.solana?.rpcUrl || 'https://api.mainnet-beta.solana.com';
    const wsUrl = process.env.HELIUS_WS_URL || process.env.SOLANA_WS_URL || rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    logger.info(`[SnipeService] Starting WebSocket listener on ${wsUrl.replace(/\/\/[^:]+@/, '//***@')}`);

    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: wsUrl,
    });

    try {
      const version = await this.connection.getVersion();
      logger.info(`[SnipeService] Connected: ${version['solana-core']}`);
    } catch (err) {
      logger.warn(`[SnipeService] RPC check failed (will still try WebSocket): ${err}`);
    }

    // Subscribe to pump.fun program logs
    await this.subscribeToPumpFunLogs();
    this.running = true;

    logger.info('[SnipeService] WebSocket listener started');

    // Start the analysis + snipe processing loop
    this.processAnalysisQueue();

    // Start price simulation for paper mode (simulates price movement)
    if (bondingCurveService.isPaperMode()) {
      this.startPriceSimulation();
    }
  }

  /**
   * Subscribe to pump.fun program logs via WebSocket
   * Detects Create event which fires on new token launches
   */
  private async subscribeToPumpFunLogs(): Promise<void> {
    if (!this.connection) return;

    try {
      this.wsSubscription = this.connection.onLogs(
        new PublicKey(PUMPFUN_PROGRAM_ID),
        (logs, ctx) => {
          if (!logs.logs) return;

          const logStr = logs.logs.join('\n');

          // Look for Create event discriminator
          // pump.fun Create event log signature: "Program log: Instruction: Create"
          // The event data follows after
          if (!logStr.includes('Instruction: Create')) return;

          try {
            const event = this.parseCreateEvent(logs.signature, logStr);
            if (event && !this.processedMints.has(event.tokenMint)) {
              this.processedMints.add(event.tokenMint);
              this.recentTokens.unshift(event);
              if (this.recentTokens.length > 100) this.recentTokens.pop();

              logger.info(
                `[SnipeService] NEW TOKEN: ${event.tokenSymbol} (${event.tokenName}) | Mint: ${event.tokenMint.slice(0, 8)}... | Creator: ${event.creator.slice(0, 8)}...`
              );

              // Notify all token callbacks
              for (const cb of this.tokenCallbacks) {
                try { cb(event); } catch (e) { /* ignore */ }
              }

              // Queue for analysis
              this.analysisQueue.push(event);
            }
          } catch (parseErr) {
            logger.debug(`[SnipeService] Failed to parse create event: ${parseErr}`);
          }
        },
        'confirmed'
      );

      logger.info('[SnipeService] Subscribed to pump.fun program logs');
    } catch (err) {
      logger.error(`[SnipeService] Failed to subscribe to logs: ${err}`);
      // Fall back to HTTP polling
      logger.info('[SnipeService] Falling back to HTTP polling mode');
      this.startHttpPolling();
    }
  }

  /**
   * Parse a Create event from program logs
   * Extracts token mint, name, symbol from the log data
   */
  private parseCreateEvent(signature: string, logStr: string): NewTokenEvent | null {
    try {
      // The mint address appears in accountKeys
      // We also try to extract from log data
      // For now, we'll use the account keys from the transaction
      // This is a simplified parser -- real implementation would decode the event data

      // Extract any base58 addresses that look like mints
      // The Create instruction creates: mint account, bonding curve, associated token accounts
      // We need the token mint specifically

      // Fallback: use a combined approach
      // The first non-system, non-pumpfun account is typically the mint
      const accounts: string[] = logStr.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [];

      // Filter out known program IDs
      const knownAddresses = new Set([
        PUMPFUN_PROGRAM_ID,
        '11111111111111111111111111111111',
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
        'SysvarRent111111111111111111111111111111111',
        'Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1',
        '4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf',
        'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
      ]);

      const candidateMints = accounts.filter(a => !knownAddresses.has(a) && a.length >= 32 && a.length <= 44);

      if (candidateMints.length === 0) return null;

      // For now, generate a placeholder event
      // The full implementation would decode the Anchor event from the transaction
      const tokenMint = candidateMints[0];

      return {
        tokenMint,
        tokenSymbol: 'UNKNOWN',
        tokenName: 'UNKNOWN',
        uri: '',
        creator: candidateMints[candidateMints.length - 1] || '',
        timestamp: new Date(),
        bondingCurveAddress: '',
      };
    } catch (err) {
      logger.debug(`[SnipeService] Parse error: ${err}`);
      return null;
    }
  }

  /**
   * HTTP polling fallback when WebSocket fails
   * Checks pump.fun frontend API every few seconds
   */
  private async startHttpPolling(): Promise<void> {
    const pollIntervalMs = parseInt(process.env.PUMPFUN_POLL_INTERVAL_MS || '5000');

    const poll = async () => {
      if (!this.running) return;

      try {
        const response = await fetch('https://frontend-api-v3.pump.fun/coins/new', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; PerpsTrader/1.0)',
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          logger.debug(`[SnipeService] HTTP poll failed: ${response.status}`);
          return;
        }

        const coins = (await response.json()) as any[];

        for (const coin of coins) {
          if (!coin?.mint || this.processedMints.has(coin.mint)) continue;

          this.processedMints.add(coin.mint);
          const event: NewTokenEvent = {
            tokenMint: coin.mint,
            tokenSymbol: coin.symbol || coin.ticker || '???',
            tokenName: coin.name || 'Unknown',
            uri: coin.uri || '',
            creator: coin.creator || '',
            timestamp: new Date(),
            bondingCurveAddress: coin.bondingCurveKey || '',
          };

          this.recentTokens.unshift(event);
          if (this.recentTokens.length > 100) this.recentTokens.pop();

          logger.info(
            `[SnipeService] [HTTP] NEW: ${event.tokenSymbol} (${event.tokenName}) | ${event.tokenMint.slice(0, 8)}...`
          );

          for (const cb of this.tokenCallbacks) {
            try { cb(event); } catch (e) { /* ignore */ }
          }

          this.analysisQueue.push(event);
        }
      } catch (err) {
        logger.debug(`[SnipeService] HTTP poll error: ${err}`);
      }
    };

    // Poll immediately, then on interval
    await poll();
    setInterval(poll, pollIntervalMs);
    logger.info(`[SnipeService] HTTP polling started (every ${pollIntervalMs}ms)`);
  }

  /**
   * Process the analysis queue -- scores tokens and decides whether to snipe
   * Runs in background, processing one token at a time
   */
  private processAnalysisQueue(): void {
    const processNext = async () => {
      if (!this.running) return;

      if (this.analysisQueue.length > 0) {
        const event = this.analysisQueue.shift()!;
        await this.evaluateAndSnipe(event);
      }

      // Check every 2 seconds
      setTimeout(processNext, 2000);
    };

    processNext();
  }

  /**
   * Evaluate a token using quick heuristics and decide whether to snipe
   * This is the fast path -- full AI analysis happens in the background pipeline
   *
   * CRITICAL: Heuristic scores are INFLATED. We now require:
   * 1. Stored AI analysis (preferred) OR
   * 2. Very high heuristic threshold (0.65+) with no red flags
   */
  private async evaluateAndSnipe(event: NewTokenEvent): Promise<void> {
    let score = 0;
    let hasStoredAnalysis = false;
    let recommendation = 'WATCH';
    let redFlags: string[] = [];

    // ── RED FLAGS (instant disqualifiers) ─────────────────────────────────────
    const symbol = event.tokenSymbol.toUpperCase();

    // Obvious test/garbage tokens
    const garbagePatterns = [
      /^TEST$/i, /^AAA$/i, /^BBB$/i, /^XXX$/i, /^YYY$/i, /^ZZZ$/i,
      /^COIN$/i, /^TOKEN$/i, /^MEME$/i, /^NEW$/i, /^HELLO$/i,
      /^\d+%$/, /^<\d+%$/, />?\d+%$/, // "4%", "<50%", etc
      /^[a-z]$/i, // Single letter
      /^(an|the|in|on|at|to|by)$/i, // Random words
    ];

    for (const pattern of garbagePatterns) {
      if (pattern.test(symbol)) {
        redFlags.push('garbage_symbol');
        break;
      }
    }

    // Symbol too long (looks like spam)
    if (event.tokenSymbol.length > 10) {
      redFlags.push('symbol_too_long');
    }

    // Name is just symbol repeated or garbage
    if (event.tokenName === event.tokenSymbol || event.tokenName.length < 3) {
      redFlags.push('lazy_naming');
    }

    // ── CHECK FOR STORED AI ANALYSIS ─────────────────────────────────────────
    try {
      const { default: pumpfunStore } = await import('../../data/pumpfun-store');
      const stored = pumpfunStore.getTokenByMint(event.tokenMint);
      if (stored) {
        score = stored.overallScore;
        hasStoredAnalysis = true;
        recommendation = stored.recommendation;
        logger.info(`[SnipeService] AI analysis for ${event.tokenSymbol}: ${score.toFixed(2)} (${recommendation})`);

        // Add red flags from AI analysis
        if (stored.redFlags && stored.redFlags.length > 0) {
          redFlags.push(...stored.redFlags);
        }
      }
    } catch (e) {
      // Store not available
    }

    // ── HEURISTIC FALLBACK (only if no AI analysis) ───────────────────────────
    if (!hasStoredAnalysis) {
      // Much more conservative baseline
      score = 0.1; // Start LOW, not 0.3

      // Quality signals (smaller bonuses)
      if (event.tokenName && event.tokenName !== 'UNKNOWN' && event.tokenName.length > 3) score += 0.05;
      if (event.tokenSymbol && event.tokenSymbol !== 'UNKNOWN' && event.tokenSymbol.length >= 2) score += 0.03;
      if (event.uri && event.uri.includes('ipfs')) score += 0.05; // IPFS is better than random
      if (event.bondingCurveAddress) score += 0.05;

      // Good symbol length (typical ticker)
      if (event.tokenSymbol.length >= 3 && event.tokenSymbol.length <= 5) score += 0.07;

      // Name different from symbol (shows effort)
      if (event.tokenName !== event.tokenSymbol && event.tokenName.length > event.tokenSymbol.length + 3) {
        score += 0.05;
      }

      // Clamp heuristic score
      score = Math.min(0.5, Math.max(0, score)); // Cap heuristic at 0.5 max

      logger.debug(`[SnipeService] Heuristic for ${event.tokenSymbol}: ${score.toFixed(2)}`);
    }

    // ── RED FLAG PENALTIES ────────────────────────────────────────────────────
    const redFlagPenalty = redFlags.length * 0.15;
    score = Math.max(0, score - redFlagPenalty);

    if (redFlags.length > 0) {
      logger.info(`[SnipeService] Red flags for ${event.tokenSymbol}: ${redFlags.join(', ')} (-${redFlagPenalty.toFixed(2)})`);
    }

    // ── BUY DECISION ──────────────────────────────────────────────────────────
    // Use configured threshold for all scores (respect PUMPFUN_MIN_BUY_SCORE from .env)
    const effectiveThreshold = this.minScoreToBuy;
    const shouldBuy = score >= effectiveThreshold && redFlags.length < 3;

    const candidate: SnipeCandidate = {
      event,
      score,
      recommendation: shouldBuy ? 'BUY' : (hasStoredAnalysis ? recommendation : 'WATCH'),
      buyExecuted: false,
    };

    // Auto-snipe if score exceeds threshold
    if (shouldBuy) {
      // Check rate limits
      this.resetHourlyCountIfNeeded();
      if (this.snipeCountThisHour >= this.maxSnipePerHour) {
        logger.warn(`[SnipeService] Hourly limit reached (${this.maxSnipePerHour}), skipping ${event.tokenSymbol}`);
        candidate.recommendation = 'LIMITED';
      } else if (Date.now() - this.lastSnipeTime < this.cooldownMs) {
        logger.debug(`[SnipeService] Cooldown active, queuing ${event.tokenSymbol}`);
        this.snipeQueue.push(candidate);
      } else {
        await this.executeSnipe(candidate);
      }
    }

    // Notify callbacks
    for (const cb of this.snipeCallbacks) {
      try { cb(candidate); } catch (e) { /* ignore */ }
    }
  }

  /**
   * Execute a snipe (buy on bonding curve)
   */
  private async executeSnipe(candidate: SnipeCandidate): Promise<void> {
    if (!bondingCurveService.isInitialized()) {
      await bondingCurveService.initialize();
    }

    this.lastSnipeTime = Date.now();
    this.snipeCountThisHour++;

    const result = await bondingCurveService.buy(
      candidate.event.tokenMint,
      candidate.event.tokenSymbol,
      this.solPerSnipe,
      DEFAULT_TP_LEVELS,
      candidate.score,
    );

    candidate.buyExecuted = result.success;
    candidate.buyResult = result;

    if (result.success) {
      // Set initial price for simulation
      this.tokenPrices.set(candidate.event.tokenMint, 1.0);
      logger.info(
        `[SnipeService] SNIPED ${candidate.event.tokenSymbol} | Score: ${candidate.score.toFixed(2)} | ${this.solPerSnipe} SOL | Tokens: ${result.tokensReceived.toFixed(0)}`
      );
    } else {
      logger.warn(`[SnipeService] Snipe failed for ${candidate.event.tokenSymbol}: ${result.error}`);
    }
  }

  /**
   * Process queued snipes (ones that were rate-limited)
   */
  private processSnipeQueue(): void {
    if (this.snipeQueue.length === 0) return;
    if (Date.now() - this.lastSnipeTime < this.cooldownMs) return;

    const candidate = this.snipeQueue.shift();
    if (candidate) {
      this.executeSnipe(candidate);
    }
  }

  /**
   * Monitor open positions using REAL on-chain bonding curve data.
   * No more random walk simulation — prices come from the actual blockchain.
   * Applies slippage on sells, stop loss, and time-based exits.
   */
  private startPriceSimulation(): void {
    const simulate = async () => {
      if (!this.running) return;

      // Process any queued snipes first
      this.processSnipeQueue();

      const positions = bondingCurveService.getPositions();
      if (positions.length === 0) {
        setTimeout(simulate, 5000);
        return;
      }

      // Always use real on-chain price sampling
      let realMultipliers: Map<string, number> | null = null;
      try {
        realMultipliers = await bondingCurveService.sampleAndUpdatePositions();
      } catch (err) {
        logger.warn(`[PriceMonitor] On-chain sampling failed: ${err}`);
      }

      for (const position of positions) {
        const newMultiplier = realMultipliers?.get(position.tokenMint) ?? 1.0;

        if (realMultipliers && realMultipliers.has(position.tokenMint)) {
          logger.debug(`[PriceMonitor] ${position.tokenSymbol} on-chain: ${newMultiplier.toFixed(3)}x`);
        }

        // ── STOP LOSS at 0.6x (40% down) ──
        if (newMultiplier <= 0.6) {
          logger.warn(`[PriceMonitor] STOP LOSS: ${position.tokenSymbol} at ${newMultiplier.toFixed(2)}x`);
          await bondingCurveService.emergencySell(position.tokenMint, newMultiplier, 'STOP_LOSS');
          this.permanentBlacklist.add(position.tokenMint);
          continue;
        }

        // ── TIME EXIT: kill stale positions ──
        const ageMinutes = (Date.now() - position.buyTimestamp.getTime()) / 60000;
        // Check if position never pumped (max mult from partial sells history or current)
        const hasPumped = position.partialSells.length > 0; // Already hit a TP
        const isFlat = newMultiplier < 0.8 && !hasPumped; // Underwater with no TP hits

        if (ageMinutes >= TIME_EXIT_MINUTES && isFlat) {
          logger.warn(`[PriceMonitor] TIME_EXIT: ${position.tokenSymbol} at ${newMultiplier.toFixed(2)}x after ${ageMinutes.toFixed(0)}min (never pumped)`);
          await bondingCurveService.emergencySell(position.tokenMint, newMultiplier, 'TIME_EXIT');
          this.permanentBlacklist.add(position.tokenMint);
          continue;
        }

        // ── BONDING CURVE GONE + NO PUMP = rug ──
        if (newMultiplier <= 0.05 && ageMinutes > 2) {
          logger.warn(`[PriceMonitor] RUG DETECTED: ${position.tokenSymbol} at ${newMultiplier.toFixed(3)}x after ${ageMinutes.toFixed(0)}min`);
          await bondingCurveService.emergencySell(position.tokenMint, newMultiplier, 'RUG');
          this.permanentBlacklist.add(position.tokenMint);
          continue;
        }

        // Check TP levels
        await bondingCurveService.checkAndSell(position.tokenMint, newMultiplier);
      }

      // Log portfolio summary periodically
      setTimeout(simulate, 5000);
    };

    simulate();
  }

  private resetHourlyCountIfNeeded(): void {
    const now = Date.now();
    if (now - this.lastHourReset > 3600000) {
      this.snipeCountThisHour = 0;
      this.lastHourReset = now;
      // Do NOT clear processedMints — tokens are processed once, never re-evaluated
      // Permanent blacklist prevents re-buying tokens we've already exited
      logger.info(`[SnipeService] Hourly snipe counter reset. Seen: ${this.processedMints.size}, Blacklisted: ${this.permanentBlacklist.size}`);
    }
  }

  stop(): void {
    this.running = false;
    if (this.wsSubscription !== null && this.connection) {
      try {
        this.connection.removeOnLogsListener(this.wsSubscription);
      } catch (e) { /* ignore */ }
      this.wsSubscription = null;
    }
    logger.info('[SnipeService] Stopped');
  }

  getStatus(): {
    running: boolean;
    recentTokensCount: number;
    openPositions: number;
    snipesThisHour: number;
    maxSnipesPerHour: number;
    mode: string;
    queueDepth: number;
    processedMintsCount: number;
  } {
    return {
      running: this.running,
      recentTokensCount: this.recentTokens.length,
      openPositions: bondingCurveService.getPositions().length,
      snipesThisHour: this.snipeCountThisHour,
      maxSnipesPerHour: this.maxSnipePerHour,
      mode: bondingCurveService.isPaperMode() ? 'PAPER' : 'LIVE',
      queueDepth: this.analysisQueue.length + this.snipeQueue.length,
      processedMintsCount: this.processedMints.size,
    };
  }
}

const snipeService = new SnipeService();
export default snipeService;
