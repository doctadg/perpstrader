/**
 * Bonding Curve Tracker — PumpPortal WebSocket client
 * Subscribes to trades on tracked tokens and emits real-time mcap updates
 *
 * Reference: /home/d/ingest/src/connectors/dex/pumpfun.ts
 */
import { EventEmitter } from 'events';
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
export declare class BondingCurveTracker extends EventEmitter {
    private readonly logPrefix;
    private ws;
    private reconnectTimer;
    private subscribedMints;
    private running;
    private tradeCounts;
    private static readonly INITIAL_VIRTUAL_TOKEN_RESERVES;
    private static readonly TOTAL_SUPPLY;
    constructor(logPrefix?: string);
    start(): void;
    stop(): void;
    /** Subscribe to trades for a token mint */
    subscribe(mint: string): void;
    /** Unsubscribe from trades for a token mint */
    unsubscribe(mint: string): void;
    /** Get trade counts for a token */
    getTradeCounts(mint: string): {
        buys: number;
        sells: number;
    };
    private connect;
    private scheduleReconnect;
    private sendSubscribe;
    private resubscribeAll;
    private handleMessage;
    /**
     * Compute market cap in SOL from bonding curve state
     * Pump.fun: mcap ≈ (vSol / vTokens) * totalSupply
     */
    private computeMcapSol;
}
export default BondingCurveTracker;
//# sourceMappingURL=bonding-curve-tracker.d.ts.map