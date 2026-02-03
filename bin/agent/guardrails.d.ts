import { RiskLevel, SafetyCheck } from './types';
interface GuardrailConfig {
    maxTradeSize: number;
    maxLeverage: number;
    maxDailyLossThreshold: number;
    emergencyStopCooldown: number;
    supportedSymbols: string[];
    autoExecuteThreshold: RiskLevel;
}
declare class SafetyGuardrails {
    private config;
    private lastEmergencyStop;
    private pendingConfirmations;
    constructor(config?: Partial<GuardrailConfig>);
    /**
     * Check if an action is safe to execute
     */
    checkAction(actionName: string, params: Record<string, any>, portfolioContext?: {
        totalValue?: number;
        availableBalance?: number;
    }): Promise<SafetyCheck>;
    /**
     * Get rule for an action
     */
    private getRule;
    /**
     * Check if action should auto-execute based on risk level
     */
    shouldAutoExecute(riskLevel: RiskLevel): boolean;
    /**
     * Store a pending confirmation
     */
    storeConfirmation(actionId: string, data: any): void;
    /**
     * Get and remove a pending confirmation
     */
    getConfirmation(actionId: string): any | null;
    /**
     * Update configuration
     */
    updateConfig(updates: Partial<GuardrailConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): GuardrailConfig;
    /**
     * Check emergency stop cooldown
     */
    canEmergencyStop(): {
        allowed: boolean;
        remainingSeconds?: number;
    };
    /**
     * Record an emergency stop
     */
    recordEmergencyStop(): void;
    /**
     * Get all available rules
     */
    getRules(): Map<string, SafetyRule>;
}
interface SafetyRule {
    name: string;
    description: string;
    check: (params: Record<string, any>, config: GuardrailConfig, portfolioContext?: {
        totalValue?: number;
        availableBalance?: number;
    }) => Promise<SafetyCheck> | SafetyCheck;
}
declare const RULES: Map<string, SafetyRule>;
declare const safetyGuardrails: SafetyGuardrails;
export default safetyGuardrails;
export { SafetyGuardrails, GuardrailConfig, SafetyRule, RULES };
//# sourceMappingURL=guardrails.d.ts.map