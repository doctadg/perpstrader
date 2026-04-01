import { Timing } from '../../shared/types';
export interface SlotInfo {
    slot: number;
    timestamp: number;
    blockhash: string;
    blockhashSlot: number;
}
/**
 * Calculate delay until a timing target relative to a base
 */
export declare function delayUntilTarget(timing: Timing, baseSlot: number, baseTime: number): Promise<number>;
/**
 * Check if a blockhash is still fresh enough to use
 */
export declare function isBlockhashFresh(blockhashSlot: number, currentSlot: number, staleThreshold?: number): boolean;
/**
 * Calculate staggered delays between wallet actions
 */
export declare function staggerDelay(minMs: number, maxMs: number): number;
/**
 * Execute a function with retries, respecting timing constraints
 */
export declare function withTimingRetry<T>(fn: () => Promise<T>, retries?: number, delayMs?: number): Promise<T>;
/**
 * Slot tracker — polls the current slot from an RPC source
 */
export declare class SlotTracker {
    private currentSlot;
    private lastUpdate;
    private pollIntervalMs;
    private timer?;
    private getSlotFn;
    constructor(getSlotFn: () => Promise<number>, pollIntervalMs?: number);
    start(): Promise<void>;
    stop(): void;
    get slot(): number;
    get lastUpdatedAt(): number;
}
//# sourceMappingURL=timing-engine.d.ts.map