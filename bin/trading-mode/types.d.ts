export type TradingMode = 'paper' | 'testnet' | 'live';
export type SubsystemId = 'perps' | 'predictions' | 'pumpfun';
export interface SubsystemMode {
    subsystem: SubsystemId;
    mode: TradingMode;
    enabled: boolean;
    envVar: string;
    envValue: string;
    description: string;
}
export interface TradingModeState {
    global: TradingMode;
    perps: TradingMode;
    predictions: TradingMode;
    pumpfun: TradingMode;
    perpsEnabled: boolean;
    predictionsEnabled: boolean;
    pumpfunEnabled: boolean;
    updatedAt: string;
    updatedBy: string;
    source: 'cli' | 'dashboard' | 'api' | 'agent' | 'config';
}
export interface ModeChangeRecord {
    id: string;
    timestamp: string;
    subsystem: SubsystemId | 'global';
    fromMode: TradingMode;
    toMode: TradingMode;
    source: string;
    confirmed: boolean;
    confirmedBy?: string;
    reason?: string;
}
export interface PendingConfirmation {
    token: string;
    subsystem: SubsystemId | 'global';
    targetMode: TradingMode;
    currentMode: TradingMode;
    createdAt: string;
    expiresAt: string;
    source: string;
}
export interface SetModeRequest {
    subsystem?: SubsystemId | 'all';
    mode: TradingMode;
    confirmationToken?: string;
    reason?: string;
    source?: string;
}
export interface ModeStatusResponse {
    state: TradingModeState;
    audit: ModeChangeRecord[];
    pendingConfirmation: PendingConfirmation | null;
    subsystems: {
        perps: {
            mode: TradingMode;
            enabled: boolean;
            description: string;
            envVar: string;
        };
        predictions: {
            mode: TradingMode;
            enabled: boolean;
            description: string;
            envVar: string;
        };
        pumpfun: {
            mode: TradingMode;
            enabled: boolean;
            description: string;
            envVar: string;
        };
    };
}
//# sourceMappingURL=types.d.ts.map