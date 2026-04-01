"use strict";
/**
 * Position Manager — Main class for tracking and exiting pump.fun positions
 *
 * Monitors launched tokens via PumpPortal WebSocket, tracks market cap in real-time,
 * and executes sells when exit conditions are met:
 *   - Fast dump: sell at target mcap (~$5k default)
 *   - Momentum hold: extend target if price climbing fast
 *   - Time stop: force sell after 30 min
 *   - Stop loss: emergency sell if mcap drops 50% from peak
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PositionManager = exports.DEFAULT_CONFIG = void 0;
const events_1 = require("events");
const bonding_curve_tracker_1 = require("./bonding-curve-tracker");
const sell_executor_1 = require("./sell-executor");
const types_1 = require("./types");
// Default configuration
exports.DEFAULT_CONFIG = {
    targetMcapUsd: 5000,
    extendedTargetMcapUsd: 10000,
    maxHoldTimeMs: 30 * 60 * 1000, // 30 min
    stopLossPct: 0.5, // 50% drop from peak
    momentumMultiplier: 2.0, // 2x in momentumWindow
    momentumWindowMs: 5 * 60 * 1000, // 5 min
    sweepAfterSell: true,
    mainWalletAddress: '',
    sellSlippageBps: 1000, // 10%
    priorityFeeMicroLamports: 250_000,
    pollIntervalMs: 10_000, // 10s fallback poll
};
// SOL price approximation (updated periodically)
let cachedSolPrice = 150; // Default, updated via fetch
class PositionManager extends events_1.EventEmitter {
    connection;
    config;
    walletKeypairs;
    positions = new Map();
    tracker;
    executor;
    pollTimer = null;
    running = false;
    solPrice = cachedSolPrice;
    constructor(connection, config, walletKeypairs) {
        super();
        this.connection = connection;
        this.config = config;
        this.walletKeypairs = walletKeypairs;
        this.tracker = new bonding_curve_tracker_1.BondingCurveTracker('[PositionManager]');
        this.executor = new sell_executor_1.SellExecutor(connection, config);
        // Listen for mcap updates from WebSocket
        this.tracker.on('mcapUpdate', (update) => {
            this.handleMcapUpdate(update);
        });
    }
    /** Start monitoring positions */
    async start() {
        this.running = true;
        this.tracker.start();
        // Periodic fallback: check all positions against exit conditions
        this.pollTimer = setInterval(() => this.checkAllPositions(), this.config.pollIntervalMs);
        // Update SOL price periodically
        this.updateSolPrice();
        setInterval(() => this.updateSolPrice(), 60_000);
        console.log('[PositionManager] Started — monitoring positions via PumpPortal WS');
    }
    /** Stop monitoring */
    stop() {
        this.running = false;
        this.tracker.stop();
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        console.log('[PositionManager] Stopped');
    }
    /** Add a new position to track */
    addPosition(position) {
        const fullPosition = {
            ...position,
            peakMcap: position.currentMcap,
            exitStrategy: types_1.ExitStrategy.FAST_DUMP,
            priceHistory: [{ timestamp: Date.now(), mcap: position.currentMcap }],
            closing: false,
        };
        this.positions.set(position.mint, fullPosition);
        this.tracker.subscribe(position.mint);
        console.log(`[PositionManager] Tracking ${position.symbol} | mcap: $${position.currentMcap.toFixed(0)} | target: $${position.targetMcap}`);
        this.emit('positionAdded', fullPosition);
    }
    /** Remove a position from tracking */
    removePosition(mint) {
        this.positions.delete(mint);
        this.tracker.unsubscribe(mint);
    }
    /** Get all open positions */
    getPositions() {
        return [...this.positions.values()];
    }
    /** Get position count */
    get positionCount() {
        return this.positions.size;
    }
    /** Handle real-time mcap update from WebSocket */
    handleMcapUpdate(update) {
        const position = this.positions.get(update.mint);
        if (!position || position.closing)
            return;
        // Convert SOL mcap to USD
        const mcapUsd = update.marketCapSol * this.solPrice;
        // Update position
        position.currentMcap = mcapUsd;
        position.peakMcap = Math.max(position.peakMcap, mcapUsd);
        // Record price history (keep last 30 min)
        position.priceHistory.push({ timestamp: update.timestamp, mcap: mcapUsd });
        const cutoff = Date.now() - 30 * 60 * 1000;
        position.priceHistory = position.priceHistory.filter(p => p.timestamp > cutoff);
        this.emit('mcapUpdate', { mint: update.mint, mcapUsd, trades: update.tradeCount });
        // Check exit conditions on every update
        this.checkPosition(position);
    }
    /** Check all positions (fallback poll) */
    async checkAllPositions() {
        for (const position of this.positions.values()) {
            if (position.closing)
                continue;
            this.checkPosition(position);
        }
    }
    /** Check exit conditions for a single position */
    checkPosition(position) {
        const now = Date.now();
        const holdTime = now - position.buyTimestamp;
        const mcap = position.currentMcap;
        // ──── Stop Loss: 50% drop from peak ────
        if (position.peakMcap > 0 && mcap < position.peakMcap * (1 - this.config.stopLossPct)) {
            console.warn(`[PositionManager] STOP LOSS: ${position.symbol} mcap $${mcap.toFixed(0)} < ${((1 - this.config.stopLossPct) * 100).toFixed(0)}% of peak $${position.peakMcap.toFixed(0)}`);
            this.executeExit(position, types_1.ExitStrategy.STOP_LOSS);
            return;
        }
        // ──── Time Stop: force sell after max hold time ────
        if (holdTime > this.config.maxHoldTimeMs) {
            console.warn(`[PositionManager] TIME STOP: ${position.symbol} held ${Math.round(holdTime / 60000)} min > ${Math.round(this.config.maxHoldTimeMs / 60000)} min`);
            this.executeExit(position, types_1.ExitStrategy.TIME_STOP);
            return;
        }
        // ──── Momentum Hold: if price doubled in last 5 min, extend target ────
        const momentumCheck = this.checkMomentum(position);
        if (momentumCheck.hasMomentum && position.exitStrategy !== types_1.ExitStrategy.MOMENTUM_HOLD) {
            position.exitStrategy = types_1.ExitStrategy.MOMENTUM_HOLD;
            position.targetMcap = position.extendedTargetMcap;
            console.log(`[PositionManager] MOMENTUM HOLD: ${position.symbol} — extending target to $${position.targetMcap}`);
            this.emit('momentumDetected', position);
        }
        // ──── Fast Dump / Target Hit ────
        if (mcap >= position.targetMcap) {
            console.log(`[PositionManager] TARGET HIT: ${position.symbol} mcap $${mcap.toFixed(0)} >= target $${position.targetMcap} (${position.exitStrategy})`);
            this.executeExit(position, position.exitStrategy);
            return;
        }
    }
    /**
     * Check if price is climbing fast enough for momentum hold
     * Returns true if mcap has increased by momentumMultiplier in the last momentumWindowMs
     */
    checkMomentum(position) {
        const windowStart = Date.now() - this.config.momentumWindowMs;
        const historyInWindow = position.priceHistory.filter(p => p.timestamp >= windowStart);
        if (historyInWindow.length < 2)
            return { hasMomentum: false, multiplier: 1.0 };
        const oldestMcap = historyInWindow[0].mcap;
        const currentMcap = position.currentMcap;
        if (oldestMcap <= 0)
            return { hasMomentum: false, multiplier: 1.0 };
        const multiplier = currentMcap / oldestMcap;
        return {
            hasMomentum: multiplier >= this.config.momentumMultiplier,
            multiplier,
        };
    }
    /** Execute exit for a position */
    async executeExit(position, strategy) {
        if (position.closing)
            return;
        position.closing = true;
        position.exitStrategy = strategy;
        console.log(`[PositionManager] Executing ${strategy} for ${position.symbol}...`);
        this.emit('exiting', { mint: position.mint, symbol: position.symbol, strategy });
        // Gather keypairs for wallets holding tokens
        const keypairs = position.walletAddresses
            .map(addr => this.walletKeypairs.get(addr))
            .filter(Boolean);
        const result = await this.executor.executeSell(position.mint, position.symbol, keypairs, position.tokenAmounts, strategy);
        // Clean up
        this.removePosition(position.mint);
        console.log(`[PositionManager] ${strategy} complete: ${position.symbol} | success: ${result.success} | wallets: ${result.walletResults.length}`);
        this.emit('exitComplete', result);
    }
    /** Fetch approximate SOL price from CoinGecko */
    async updateSolPrice() {
        try {
            const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { signal: AbortSignal.timeout(5000) });
            const data = await resp.json();
            if (data?.solana?.usd) {
                this.solPrice = data.solana.usd;
                cachedSolPrice = this.solPrice;
            }
        }
        catch {
            // Keep cached price
        }
    }
}
exports.PositionManager = PositionManager;
exports.default = PositionManager;
//# sourceMappingURL=position-manager.js.map