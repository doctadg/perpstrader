import type { TradingMode, SubsystemId, TradingModeState, ModeChangeRecord, PendingConfirmation, ModeStatusResponse } from './types';
declare class TradingModeController {
    private static instance;
    private db;
    private state;
    private pendingConfirmation;
    private initialized;
    private constructor();
    static getInstance(dbPath?: string): TradingModeController;
    static resetInstance(): void;
    private initTables;
    private loadState;
    private persistState;
    private persistAudit;
    getEffectiveMode(subsystem: SubsystemId): TradingMode;
    /**
     * Set mode for a subsystem or all subsystems.
     * Returns the pending confirmation if switching to live, otherwise returns null.
     */
    setMode(subsystem: SubsystemId | 'all', mode: TradingMode, source?: 'cli' | 'dashboard' | 'api' | 'agent' | 'config', reason?: string): PendingConfirmation | null;
    /**
     * Confirm a pending live mode switch.
     */
    confirmModeChange(token: string): {
        success: boolean;
        state: TradingModeState;
        error?: string;
    };
    private markRecentAsConfirmed;
    private applyModeChange;
    private broadcastModeChange;
    getHistory(limit?: number): ModeChangeRecord[];
    getStatus(): ModeStatusResponse;
    /**
     * Returns the env var overrides each subsystem should use based on current mode.
     */
    exportEnvOverrides(): Record<string, string>;
    enableSubsystem(subsystem: SubsystemId): TradingModeState;
    disableSubsystem(subsystem: SubsystemId): TradingModeState;
    close(): void;
}
export { TradingModeController };
export default TradingModeController;
//# sourceMappingURL=controller.d.ts.map