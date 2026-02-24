export declare class SafetyMonitor {
    private dailyLoss;
    private dailyTrades;
    private consecutiveLosses;
    private lastReset;
    private peakBalance;
    private emergencyStop;
    private stopReason;
    private readonly MAX_DAILY_LOSS;
    private readonly MAX_DAILY_TRADES;
    private readonly MAX_CONSECUTIVE_LOSSES;
    private readonly MAX_DRAWDOWN_PCT;
    recordTrade(pnl: number, balance: number): void;
    private checkLimits;
    canTrade(): boolean;
    getStatus(): {
        dailyLoss: number;
        dailyTrades: number;
        consecutiveLosses: number;
        emergencyStop: boolean;
        stopReason: string;
    };
    reset(): void;
    private checkNewDay;
}
export declare const safetyMonitor: SafetyMonitor;
//# sourceMappingURL=safety-monitor.d.ts.map