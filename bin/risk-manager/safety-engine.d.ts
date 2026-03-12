declare class SafetyEngine {
    private circuitBreakers;
    private safetyRules;
    private isEnabled;
    private emergencyStopTriggered;
    private readonly DAILY_LOSS_ALERT_1_USD;
    private readonly DAILY_LOSS_ALERT_2_USD;
    private dailyLossAlert40Triggered;
    private dailyLossAlert45Triggered;
    private config;
    constructor();
    private initializeCircuitBreakers;
    private initializeSafetyRules;
    checkSafetyRules(): Promise<boolean>;
    checkCircuitBreakers(dailyPnL: number, maxDrawdown: number): Promise<boolean>;
    private logDailyLossApproachAlerts;
    private executeCircuitBreaker;
    resetCircuitBreaker(breakerId: string): Promise<void>;
    emergencyStop(): Promise<void>;
    resetEmergencyStop(): Promise<void>;
    validateOrder(symbol: string, side: 'BUY' | 'SELL', size: number, leverage: number): Promise<{
        approved: boolean;
        reason?: string;
    }>;
    getStatus(): {
        enabled: boolean;
        emergencyStop: boolean;
        activeCircuitBreakers: string[];
        activeSafetyRules: string[];
    };
    private getPositionCount;
    private getPositions;
    private getMaxPositionSize;
    private getMaxLeverage;
    private reduceAllPositions;
    private reduceLargestPosition;
    private reduceAllLeverage;
    private reduceExposure;
    private closeAllPositions;
    private setTradingHalted;
}
declare const _default: SafetyEngine;
export default _default;
//# sourceMappingURL=safety-engine.d.ts.map