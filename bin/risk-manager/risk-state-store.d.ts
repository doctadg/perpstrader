export declare const RISK_KEYS: {
    readonly dailyPnL: "daily_pnl";
    readonly consecutiveLosses: "consecutive_losses";
    readonly totalTrades: "total_trades";
    readonly maxDrawdown: "max_drawdown";
    readonly cooldownUntil: "cooldown_until";
    readonly emergencyStopActive: "emergency_stop_active";
    readonly emergencyStopReason: "emergency_stop_reason";
    readonly lastResetDate: "last_reset_date";
    readonly dailyLossAlert1Triggered: "daily_loss_alert_1_triggered";
    readonly dailyLossAlert2Triggered: "daily_loss_alert_2_triggered";
};
export declare function restoreState(): Record<string, any>;
/**
 * Get a persisted value by key.  Returns the parsed JSON value or the
 * raw string if JSON parsing fails.  Returns `undefined` if key not found.
 */
export declare function getState<T = any>(key: string): T | undefined;
/**
 * Set a persisted value.  Value is JSON-serialised before storage.
 * Writes to SQLite immediately (risk state changes are infrequent).
 */
export declare function setState(key: string, value: any): void;
/**
 * Get all persisted state as a plain object.
 */
export declare function getAll(): Record<string, any>;
/**
 * Reset daily counters.  Called at the start of each new trading day.
 */
export declare function resetDaily(): void;
/**
 * Remove a specific key from the store.
 */
export declare function removeState(key: string): void;
/**
 * Close the database connection. Call on graceful shutdown.
 */
export declare function close(): void;
//# sourceMappingURL=risk-state-store.d.ts.map