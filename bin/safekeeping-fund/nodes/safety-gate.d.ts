import type { SafekeepingFundState } from '../state';
import type { SafetyCheckResult } from '../types';
/**
 * Safety Gate Node
 * Validates all safety conditions before allowing execution
 */
export declare function safetyGateNode(state: SafekeepingFundState): Promise<Partial<SafekeepingFundState>>;
/**
 * Manually trigger emergency halt
 */
export declare function triggerEmergencyHalt(reason: string): SafetyCheckResult;
/**
 * Clear emergency halt
 */
export declare function clearEmergencyHalt(): void;
//# sourceMappingURL=safety-gate.d.ts.map