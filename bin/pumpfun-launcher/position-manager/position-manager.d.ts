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
import { EventEmitter } from 'events';
import { Connection } from '@solana/web3.js';
import { Position, PositionConfig } from './types';
export declare const DEFAULT_CONFIG: Partial<PositionConfig>;
export declare class PositionManager extends EventEmitter {
    private connection;
    private config;
    private walletKeypairs;
    private positions;
    private tracker;
    private executor;
    private pollTimer;
    private running;
    private solPrice;
    constructor(connection: Connection, config: PositionConfig, walletKeypairs: Map<string, any>);
    /** Start monitoring positions */
    start(): Promise<void>;
    /** Stop monitoring */
    stop(): void;
    /** Add a new position to track */
    addPosition(position: Omit<Position, 'peakMcap' | 'exitStrategy' | 'priceHistory' | 'closing'>): void;
    /** Remove a position from tracking */
    removePosition(mint: string): void;
    /** Get all open positions */
    getPositions(): Position[];
    /** Get position count */
    get positionCount(): number;
    /** Handle real-time mcap update from WebSocket */
    private handleMcapUpdate;
    /** Check all positions (fallback poll) */
    private checkAllPositions;
    /** Check exit conditions for a single position */
    private checkPosition;
    /**
     * Check if price is climbing fast enough for momentum hold
     * Returns true if mcap has increased by momentumMultiplier in the last momentumWindowMs
     */
    private checkMomentum;
    /** Execute exit for a position */
    private executeExit;
    /** Fetch approximate SOL price from CoinGecko */
    private updateSolPrice;
}
export default PositionManager;
//# sourceMappingURL=position-manager.d.ts.map