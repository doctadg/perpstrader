"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestClock = exports.RealtimeClock = void 0;
exports.createClock = createClock;
exports.dateToNanos = dateToNanos;
exports.nanosToDate = nanosToDate;
exports.formatNanos = formatNanos;
exports.getRealtimeClock = getRealtimeClock;
exports.getSimulationClock = getSimulationClock;
exports.resetSimulationClock = resetSimulationClock;
/**
 * Real-time clock - uses system time
 */
class RealtimeClock {
    mode = 'REALTIME';
    timers = new Map();
    alerts = new Map();
    timerInterval = null;
    constructor() {
        this.startTimerProcessor();
    }
    timestamp() {
        // Return nanoseconds
        return Date.now() * 1_000_000;
    }
    timestampMs() {
        return Date.now();
    }
    utcNow() {
        return new Date();
    }
    setTimer(name, intervalMs, callback) {
        const intervalNs = intervalMs * 1_000_000;
        const timer = {
            name,
            intervalNs,
            nextTriggerNs: this.timestamp() + intervalNs,
            callback,
        };
        this.timers.set(name, timer);
    }
    setTimeAlert(name, alertTime, callback) {
        const alert = {
            name,
            triggerTimeNs: alertTime.getTime() * 1_000_000,
            callback,
        };
        this.alerts.set(name, alert);
    }
    cancelTimer(name) {
        this.timers.delete(name);
        this.alerts.delete(name);
    }
    /**
     * Check and trigger timers/alerts
     */
    processTimers() {
        const now = this.timestamp();
        // Check timers
        for (const [name, timer] of this.timers) {
            if (now >= timer.nextTriggerNs) {
                const event = {
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
                const event = {
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
    startTimerProcessor() {
        this.timerInterval = setInterval(() => {
            this.processTimers();
        }, 100);
    }
    destroy() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}
exports.RealtimeClock = RealtimeClock;
/**
 * Simulation/Test clock - manual time control for backtesting
 */
class TestClock {
    mode = 'SIMULATION';
    currentTimeNs;
    timers = new Map();
    alerts = new Map();
    triggeredEvents = [];
    constructor(initialTime) {
        // Default to current time if not provided
        this.currentTimeNs = (initialTime ?? Date.now()) * 1_000_000;
    }
    timestamp() {
        return this.currentTimeNs;
    }
    timestampMs() {
        return this.currentTimeNs / 1_000_000;
    }
    utcNow() {
        return new Date(this.currentTimeNs / 1_000_000);
    }
    /**
     * Advance time to a specific point
     * Returns events triggered during the advance
     */
    advanceTime(toTimeNs) {
        const events = [];
        const startNs = this.currentTimeNs;
        if (toTimeNs <= startNs) {
            return events;
        }
        this.currentTimeNs = toTimeNs;
        // Check timers that should have triggered
        for (const [name, timer] of this.timers) {
            while (timer.nextTriggerNs <= this.currentTimeNs) {
                const event = {
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
                const event = {
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
    advanceBy(durationMs) {
        const targetNs = this.currentTimeNs + (durationMs * 1_000_000);
        return this.advanceTime(targetNs);
    }
    /**
     * Set time to a specific point
     */
    setTime(timeNs) {
        return this.advanceTime(timeNs);
    }
    /**
     * Set time to a specific Date
     */
    setDate(date) {
        return this.setTime(date.getTime() * 1_000_000);
    }
    setTimer(name, intervalMs, callback) {
        const intervalNs = intervalMs * 1_000_000;
        const timer = {
            name,
            intervalNs,
            nextTriggerNs: this.currentTimeNs + intervalNs,
            callback,
        };
        this.timers.set(name, timer);
    }
    setTimeAlert(name, alertTime, callback) {
        const alert = {
            name,
            triggerTimeNs: alertTime.getTime() * 1_000_000,
            callback,
        };
        this.alerts.set(name, alert);
    }
    cancelTimer(name) {
        this.timers.delete(name);
        this.alerts.delete(name);
    }
    /**
     * Get triggered events since last check
     */
    getTriggeredEvents() {
        const events = [...this.triggeredEvents];
        this.triggeredEvents = [];
        return events;
    }
    /**
     * Get all pending timers
     */
    getPendingTimers() {
        return Array.from(this.timers.values()).filter(t => t.nextTriggerNs > this.currentTimeNs);
    }
    /**
     * Get all pending alerts
     */
    getPendingAlerts() {
        return Array.from(this.alerts.values()).filter(a => a.triggerTimeNs > this.currentTimeNs);
    }
    /**
     * Reset clock to initial time
     */
    reset() {
        this.currentTimeNs = Date.now() * 1_000_000;
        this.timers.clear();
        this.alerts.clear();
        this.triggeredEvents = [];
    }
}
exports.TestClock = TestClock;
/**
 * Clock factory
 */
function createClock(config = { mode: 'REALTIME' }) {
    if (config.mode === 'SIMULATION') {
        return new TestClock(config.initialTime);
    }
    return new RealtimeClock();
}
/**
 * Convert Date to Unix nanoseconds
 */
function dateToNanos(date) {
    return date.getTime() * 1_000_000;
}
/**
 * Convert Unix nanoseconds to Date
 */
function nanosToDate(nanos) {
    return new Date(nanos / 1_000_000);
}
/**
 * Format nanoseconds as ISO string
 */
function formatNanos(nanos) {
    return nanosToDate(nanos).toISOString();
}
// Singleton clocks
const realtimeClock = new RealtimeClock();
let simulationClock = null;
function getRealtimeClock() {
    return realtimeClock;
}
function getSimulationClock(initialTime) {
    if (!simulationClock) {
        simulationClock = new TestClock(initialTime);
    }
    return simulationClock;
}
function resetSimulationClock() {
    simulationClock = null;
}
exports.default = realtimeClock;
//# sourceMappingURL=simulation-clock.js.map