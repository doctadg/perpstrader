export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Validate a plan for execution readiness
 */
export declare function validatePlan(plan: unknown): ValidationResult;
//# sourceMappingURL=plan-validator.d.ts.map