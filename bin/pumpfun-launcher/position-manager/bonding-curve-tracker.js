"use strict";
/**
 * Bonding Curve Tracker — PumpPortal WebSocket client
 * Subscribes to trades on tracked tokens and emits real-time mcap updates
 *
 * Reference: /home/d/ingest/src/connectors/dex/pumpfun.ts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BondingCurveTracker = void 0;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const PUMPPORTAL_WS = 'wss://pumpportal.fun/api/data';
const RECONNECT_DELAY_MS = 5_000;
const MAX_SUBSCRIPTIONS = 50;
class BondingCurveTracker extends events_1.EventEmitter {
    logPrefix;
    ws = null;
    reconnectTimer = null;
    subscribedMints = new Set();
    running = false;
    tradeCounts = new Map();
    // Bonding curve constants for mcap calculation
    static INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000;
    static TOTAL_SUPPLY = 1_000_000_000; // 1B tokens
    constructor(logPrefix = '[BondingTracker]') {
        super();
        this.logPrefix = logPrefix;
    }
    start() {
        this.running = true;
        this.connect();
    }
    stop() {
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
    subscribe(mint) {
        this.subscribedMints.add(mint);
        if (this.ws?.readyState === ws_1.default.OPEN) {
            this.sendSubscribe([mint]);
        }
    }
    /** Unsubscribe from trades for a token mint */
    unsubscribe(mint) {
        this.subscribedMints.delete(mint);
        this.tradeCounts.delete(mint);
        if (this.ws?.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify({
                method: 'unsubscribeTokenTrade',
                keys: [mint],
            }));
        }
    }
    /** Get trade counts for a token */
    getTradeCounts(mint) {
        return this.tradeCounts.get(mint) || { buys: 0, sells: 0 };
    }
    connect() {
        if (this.ws) {
            try {
                this.ws.close();
            }
            catch { /* ignore */ }
        }
        console.log(`${this.logPrefix} Connecting to PumpPortal WS...`);
        this.ws = new ws_1.default(PUMPPORTAL_WS);
        this.ws.on('open', () => {
            console.log(`${this.logPrefix} Connected`);
            this.resubscribeAll();
        });
        this.ws.on('message', (raw) => {
            try {
                const data = JSON.parse(raw.toString());
                this.handleMessage(data);
            }
            catch (err) {
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
    scheduleReconnect() {
        if (!this.running)
            return;
        this.reconnectTimer = setTimeout(() => {
            if (this.running)
                this.connect();
        }, RECONNECT_DELAY_MS);
    }
    sendSubscribe(mints) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN)
            return;
        this.ws.send(JSON.stringify({
            method: 'subscribeTokenTrade',
            keys: mints,
        }));
    }
    resubscribeAll() {
        if (this.subscribedMints.size === 0)
            return;
        // Chunk into batches of MAX_SUBSCRIPTIONS
        const mints = [...this.subscribedMints];
        for (let i = 0; i < mints.length; i += MAX_SUBSCRIPTIONS) {
            const chunk = mints.slice(i, i + MAX_SUBSCRIPTIONS);
            this.sendSubscribe(chunk);
        }
        console.log(`${this.logPrefix} Re-subscribed to ${mints.length} tokens`);
    }
    handleMessage(data) {
        if (data.txType !== 'buy' && data.txType !== 'sell')
            return;
        const mint = data.mint;
        if (!this.subscribedMints.has(mint))
            return;
        // Update trade counts
        const counts = this.tradeCounts.get(mint) || { buys: 0, sells: 0, lastUpdate: Date.now() };
        if (data.txType === 'buy')
            counts.buys++;
        else
            counts.sells++;
        counts.lastUpdate = Date.now();
        this.tradeCounts.set(mint, counts);
        // Emit trade event
        const trade = {
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
            const update = {
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
    computeMcapSol(vTokens, vSol) {
        if (!vTokens || !vSol || vTokens === 0)
            return 0;
        const pricePerToken = vSol / vTokens; // SOL per token (PumpPortal units)
        return pricePerToken * BondingCurveTracker.TOTAL_SUPPLY;
    }
}
exports.BondingCurveTracker = BondingCurveTracker;
exports.default = BondingCurveTracker;
//# sourceMappingURL=bonding-curve-tracker.js.map