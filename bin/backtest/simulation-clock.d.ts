/**
 * Simulation Clock
 *
 * Inspired by Nautilus Trader's clock abstraction.
 * Provides time control for deterministic backtesting while maintaining
 * compatibility with live trading code.
 *
 * Features:
 * - Real-time clock for live trading
 * - Test clock with time control for backtesting
 * - Timer and alert management
 * - Consistent timestamping across all components
 */
export interface TimeEvent {
    name: string;
    eventId: string;
    tsEvent: number;
    tsInit: number;
}
export interface Timer {
    name: string;
    intervalNs: number;
    nextTriggerNs: number;
    callback: (event: TimeEvent) => void | Promise<void>;
}
export interface TimeAlert {
    name: string;
    triggerTimeNs: number;
    callback: (event: TimeEvent) => void | Promise<void>;
}
export type ClockMode = 'REALTIME' | 'SIMULATION';
export interface ClockConfig {
    mode: ClockMode;
    initialTime?: number;
}
/**
 * Base Clock interface
 */
export interface IClock {
    readonly mode: ClockMode;
    timestamp(): number;
    timestampMs(): number;
    utcNow(): Date;
    setTimer(name: string, intervalMs: number, callback: (event: TimeEvent) => void): void;
    setTimeAlert(name: string, alertTime: Date, callback: (event: TimeEvent) => void): void;
    cancelTimer(name: string): void;
}
/**
 * Real-time clock - uses system time
 */
export declare class RealtimeClock implements IClock {
    readonly mode: "REALTIME";
    private timers;
    private alerts;
    private timerInterval;
    constructor();
    timestamp(): number;
    timestampMs(): number;
    utcNow(): Date;
    setTimer(name: string, intervalMs: number, callback: (event: TimeEvent) => void): void;
    setTimeAlert(name: string, alertTime: Date, callback: (event: TimeEvent) => void): void;
    cancelTimer(name: string): void;
    /**
     * Check and trigger timers/alerts
     */
    private processTimers;
    private startTimerProcessor;
    destroy(): void;
}
/**
 * Simulation/Test clock - manual time control for backtesting
 */
export declare class TestClock implements IClock {
    readonly mode: "SIMULATION";
    private currentTimeNs;
    private timers;
    private alerts;
    private triggeredEvents;
    constructor(initialTime?: number);
    timestamp(): number;
    timestampMs(): number;
    utcNow(): Date;
    /**
     * Advance time to a specific point
     * Returns events triggered during the advance
     */
    advanceTime(toTimeNs: number): TimeEvent[];
    /**
     * Advance time by a duration
     */
    advanceBy(durationMs: number): TimeEvent[];
    /**
     * Set time to a specific point
     */
    setTime(timeNs: number): TimeEvent[];
    /**
     * Set time to a specific Date
     */
    setDate(date: Date): TimeEvent[];
    setTimer(name: string, intervalMs: number, callback: (event: TimeEvent) => void): void;
    setTimeAlert(name: string, alertTime: Date, callback: (event: TimeEvent) => void): void;
    cancelTimer(name: string): void;
    /**
     * Get triggered events since last check
     */
    getTriggeredEvents(): TimeEvent[];
    /**
     * Get all pending timers
     */
    getPendingTimers(): Timer[];
    /**
     * Get all pending alerts
     */
    getPendingAlerts(): TimeAlert[];
    /**
     * Reset clock to initial time
     */
    reset(): void;
}
/**
 * Clock factory
 */
export declare function createClock(config?: ClockConfig): IClock;
/**
 * Convert Date to Unix nanoseconds
 */
export declare function dateToNanos(date: Date): number;
/**
 * Convert Unix nanoseconds to Date
 */
export declare function nanosToDate(nanos: number): Date;
/**
 * Format nanoseconds as ISO string
 */
export declare function formatNanos(nanos: number): string;
declare const realtimeClock: RealtimeClock;
export declare function getRealtimeClock(): RealtimeClock;
export declare function getSimulationClock(initialTime?: number): TestClock;
export declare function resetSimulationClock(): void;
export default realtimeClock;
//# sourceMappingURL=simulation-clock.d.ts.map