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
    tsEvent: number; // Unix nanoseconds
    tsInit: number; // Unix nanoseconds
}

export interface Timer {
    name: string;
    intervalNs: number; // Nanoseconds
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
    initialTime?: number; // For simulation, start time in nanoseconds
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
export class RealtimeClock implements IClock {
    readonly mode = 'REALTIME' as const;
    private timers: Map<string, Timer> = new Map();
    private alerts: Map<string, TimeAlert> = new Map();
    private timerInterval: NodeJS.Timeout | null = null;

    constructor() {
        this.startTimerProcessor();
    }

    timestamp(): number {
        // Return nanoseconds
        return Date.now() * 1_000_000;
    }

    timestampMs(): number {
        return Date.now();
    }

    utcNow(): Date {
        return new Date();
    }

    setTimer(name: string, intervalMs: number, callback: (event: TimeEvent) => void): void {
        const intervalNs = intervalMs * 1_000_000;
        const timer: Timer = {
            name,
            intervalNs,
            nextTriggerNs: this.timestamp() + intervalNs,
            callback,
        };
        this.timers.set(name, timer);
    }

    setTimeAlert(name: string, alertTime: Date, callback: (event: TimeEvent) => void): void {
        const alert: TimeAlert = {
            name,
            triggerTimeNs: alertTime.getTime() * 1_000_000,
            callback,
        };
        this.alerts.set(name, alert);
    }

    cancelTimer(name: string): void {
        this.timers.delete(name);
        this.alerts.delete(name);
    }

    /**
     * Check and trigger timers/alerts
     */
    private processTimers(): void {
        const now = this.timestamp();

        // Check timers
        for (const [name, timer] of this.timers) {
            if (now >= timer.nextTriggerNs) {
                const event: TimeEvent = {
                    name: timer.name,
                    eventId: `${name}-${now}`,
                    tsEvent: timer.nextTriggerNs,
                    tsInit: now,
                };

                timer.callback(event);

                // Reschedule
                timer.nextTriggerNs = now + timer.intervalNs;
            }
        }

        // Check alerts
        for (const [name, alert] of this.alerts) {
            if (now >= alert.triggerTimeNs) {
                const event: TimeEvent = {
                    name: alert.name,
                    eventId: `${name}-${now}`,
                    tsEvent: alert.triggerTimeNs,
                    tsInit: now,
                };

                alert.callback(event);
                this.alerts.delete(name);
            }
        }
    }

    private startTimerProcessor(): void {
        this.timerInterval = setInterval(() => {
            this.processTimers();
        }, 100);
    }

    destroy(): void {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}

/**
 * Simulation/Test clock - manual time control for backtesting
 */
export class TestClock implements IClock {
    readonly mode = 'SIMULATION' as const;
    private currentTimeNs: number;
    private timers: Map<string, Timer> = new Map();
    private alerts: Map<string, TimeAlert> = new Map();
    private triggeredEvents: TimeEvent[] = [];

    constructor(initialTime?: number) {
        // Default to current time if not provided
        this.currentTimeNs = (initialTime ?? Date.now()) * 1_000_000;
    }

    timestamp(): number {
        return this.currentTimeNs;
    }

    timestampMs(): number {
        return this.currentTimeNs / 1_000_000;
    }

    utcNow(): Date {
        return new Date(this.currentTimeNs / 1_000_000);
    }

    /**
     * Advance time to a specific point
     * Returns events triggered during the advance
     */
    advanceTime(toTimeNs: number): TimeEvent[] {
        const events: TimeEvent[] = [];
        const startNs = this.currentTimeNs;

        if (toTimeNs <= startNs) {
            return events;
        }

        this.currentTimeNs = toTimeNs;

        // Check timers that should have triggered
        for (const [name, timer] of this.timers) {
            while (timer.nextTriggerNs <= this.currentTimeNs) {
                const event: TimeEvent = {
                    name: timer.name,
                    eventId: `${name}-${timer.nextTriggerNs}`,
                    tsEvent: timer.nextTriggerNs,
                    tsInit: this.currentTimeNs,
                };
                events.push(event);
                this.triggeredEvents.push(event);

                // Reschedule
                timer.nextTriggerNs += timer.intervalNs;
            }
        }

        // Check alerts that should have triggered
        for (const [name, alert] of this.alerts) {
            if (alert.triggerTimeNs <= this.currentTimeNs) {
                const event: TimeEvent = {
                    name: alert.name,
                    eventId: `${name}-${alert.triggerTimeNs}`,
                    tsEvent: alert.triggerTimeNs,
                    tsInit: this.currentTimeNs,
                };
                events.push(event);
                this.triggeredEvents.push(event);
                this.alerts.delete(name);
            }
        }

        return events;
    }

    /**
     * Advance time by a duration
     */
    advanceBy(durationMs: number): TimeEvent[] {
        const targetNs = this.currentTimeNs + (durationMs * 1_000_000);
        return this.advanceTime(targetNs);
    }

    /**
     * Set time to a specific point
     */
    setTime(timeNs: number): TimeEvent[] {
        return this.advanceTime(timeNs);
    }

    /**
     * Set time to a specific Date
     */
    setDate(date: Date): TimeEvent[] {
        return this.setTime(date.getTime() * 1_000_000);
    }

    setTimer(name: string, intervalMs: number, callback: (event: TimeEvent) => void): void {
        const intervalNs = intervalMs * 1_000_000;
        const timer: Timer = {
            name,
            intervalNs,
            nextTriggerNs: this.currentTimeNs + intervalNs,
            callback,
        };
        this.timers.set(name, timer);
    }

    setTimeAlert(name: string, alertTime: Date, callback: (event: TimeEvent) => void): void {
        const alert: TimeAlert = {
            name,
            triggerTimeNs: alertTime.getTime() * 1_000_000,
            callback,
        };
        this.alerts.set(name, alert);
    }

    cancelTimer(name: string): void {
        this.timers.delete(name);
        this.alerts.delete(name);
    }

    /**
     * Get triggered events since last check
     */
    getTriggeredEvents(): TimeEvent[] {
        const events = [...this.triggeredEvents];
        this.triggeredEvents = [];
        return events;
    }

    /**
     * Get all pending timers
     */
    getPendingTimers(): Timer[] {
        return Array.from(this.timers.values()).filter(
            t => t.nextTriggerNs > this.currentTimeNs
        );
    }

    /**
     * Get all pending alerts
     */
    getPendingAlerts(): TimeAlert[] {
        return Array.from(this.alerts.values()).filter(
            a => a.triggerTimeNs > this.currentTimeNs
        );
    }

    /**
     * Reset clock to initial time
     */
    reset(): void {
        this.currentTimeNs = Date.now() * 1_000_000;
        this.timers.clear();
        this.alerts.clear();
        this.triggeredEvents = [];
    }
}

/**
 * Clock factory
 */
export function createClock(config: ClockConfig = { mode: 'REALTIME' }): IClock {
    if (config.mode === 'SIMULATION') {
        return new TestClock(config.initialTime);
    }
    return new RealtimeClock();
}

/**
 * Convert Date to Unix nanoseconds
 */
export function dateToNanos(date: Date): number {
    return date.getTime() * 1_000_000;
}

/**
 * Convert Unix nanoseconds to Date
 */
export function nanosToDate(nanos: number): Date {
    return new Date(nanos / 1_000_000);
}

/**
 * Format nanoseconds as ISO string
 */
export function formatNanos(nanos: number): string {
    return nanosToDate(nanos).toISOString();
}

// Singleton clocks
const realtimeClock = new RealtimeClock();
let simulationClock: TestClock | null = null;

export function getRealtimeClock(): RealtimeClock {
    return realtimeClock;
}

export function getSimulationClock(initialTime?: number): TestClock {
    if (!simulationClock) {
        simulationClock = new TestClock(initialTime);
    }
    return simulationClock;
}

export function resetSimulationClock(): void {
    simulationClock = null;
}

export default realtimeClock;
