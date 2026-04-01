/**
 * Bonding Curve Tracker — PumpPortal WebSocket client
 * Subscribes to trades on tracked tokens and emits real-time mcap updates
 *
 * Reference: /home/d/ingest/src/connectors/dex/pumpfun.ts
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { TradeEvent } from './types';

const PUMPPORTAL_WS = 'wss://pumpportal.fun/api/data';
const RECONNECT_DELAY_MS = 5_000;
const MAX_SUBSCRIPTIONS = 50;

export interface McapUpdate {
  mint: string;
  marketCapSol: number;
  vTokens: number;
  vSol: number;
  timestamp: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
}

export class BondingCurveTracker extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscribedMints = new Set<string>();
  private running = false;
  private tradeCounts = new Map<string, { buys: number; sells: number; lastUpdate: number }>();

  // Bonding curve constants for mcap calculation
  private static readonly INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000;
  private static readonly TOTAL_SUPPLY = 1_000_000_000; // 1B tokens

  constructor(private readonly logPrefix = '[BondingTracker]') {
    super();
  }

  start(): void {
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.removeAllListeners();
  }

  /** Subscribe to trades for a token mint */
  subscribe(mint: string): void {
    this.subscribedMints.add(mint);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe([mint]);
    }
  }

  /** Unsubscribe from trades for a token mint */
  unsubscribe(mint: string): void {
    this.subscribedMints.delete(mint);
    this.tradeCounts.delete(mint);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 'unsubscribeTokenTrade',
        keys: [mint],
      }));
    }
  }

  /** Get trade counts for a token */
  getTradeCounts(mint: string): { buys: number; sells: number } {
    return this.tradeCounts.get(mint) || { buys: 0, sells: 0 };
  }

  private connect(): void {
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
    }

    console.log(`${this.logPrefix} Connecting to PumpPortal WS...`);
    this.ws = new WebSocket(PUMPPORTAL_WS);

    this.ws.on('open', () => {
      console.log(`${this.logPrefix} Connected`);
      this.resubscribeAll();
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const data = JSON.parse(raw.toString());
        this.handleMessage(data);
      } catch (err) {
        console.error(`${this.logPrefix} Message parse error:`, err);
      }
    });

    this.ws.on('error', (err) => {
      console.error(`${this.logPrefix} WS error:`, err.message);
    });

    this.ws.on('close', () => {
      console.log(`${this.logPrefix} WS closed, reconnecting in ${RECONNECT_DELAY_MS}ms...`);
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    this.reconnectTimer = setTimeout(() => {
      if (this.running) this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private sendSubscribe(mints: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      method: 'subscribeTokenTrade',
      keys: mints,
    }));
  }

  private resubscribeAll(): void {
    if (this.subscribedMints.size === 0) return;

    // Chunk into batches of MAX_SUBSCRIPTIONS
    const mints = [...this.subscribedMints];
    for (let i = 0; i < mints.length; i += MAX_SUBSCRIPTIONS) {
      const chunk = mints.slice(i, i + MAX_SUBSCRIPTIONS);
      this.sendSubscribe(chunk);
    }
    console.log(`${this.logPrefix} Re-subscribed to ${mints.length} tokens`);
  }

  private handleMessage(data: any): void {
    if (data.txType !== 'buy' && data.txType !== 'sell') return;

    const mint: string = data.mint;
    if (!this.subscribedMints.has(mint)) return;

    // Update trade counts
    const counts = this.tradeCounts.get(mint) || { buys: 0, sells: 0, lastUpdate: Date.now() };
    if (data.txType === 'buy') counts.buys++;
    else counts.sells++;
    counts.lastUpdate = Date.now();
    this.tradeCounts.set(mint, counts);

    // Emit trade event
    const trade: TradeEvent = {
      signature: data.signature,
      mint,
      traderPublicKey: data.traderPublicKey,
      txType: data.txType,
      tokenAmount: data.tokenAmount,
      solAmount: data.solAmount,
      bondingCurveKey: data.bondingCurveKey,
      vTokensInBondingCurve: data.vTokensInBondingCurve,
      vSolInBondingCurve: data.vSolInBondingCurve,
      marketCapSol: data.marketCapSol,
    };
    this.emit('trade', trade);

    // Emit mcap update with computed data
    const mcapSol = data.marketCapSol ?? this.computeMcapSol(data.vTokensInBondingCurve, data.vSolInBondingCurve);
    if (mcapSol > 0) {
      const update: McapUpdate = {
        mint,
        marketCapSol: mcapSol,
        vTokens: data.vTokensInBondingCurve ?? 0,
        vSol: data.vSolInBondingCurve ?? 0,
        timestamp: Date.now(),
        tradeCount: counts.buys + counts.sells,
        buyCount: counts.buys,
        sellCount: counts.sells,
      };
      this.emit('mcapUpdate', update);
    }
  }

  /**
   * Compute market cap in SOL from bonding curve state
   * Pump.fun: mcap ≈ (vSol / vTokens) * totalSupply
   */
  private computeMcapSol(vTokens?: number, vSol?: number): number {
    if (!vTokens || !vSol || vTokens === 0) return 0;
    const pricePerToken = vSol / vTokens; // SOL per token (PumpPortal units)
    return pricePerToken * BondingCurveTracker.TOTAL_SUPPLY;
  }
}

export default BondingCurveTracker;
