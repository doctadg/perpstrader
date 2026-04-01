"use strict";
// Plan Validator
// Pre-flight validation of Plans before execution
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePlan = validatePlan;
const types_1 = require("../../shared/types");
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * Validate a plan for execution readiness
 */
function validatePlan(plan) {
    const errors = [];
    const warnings = [];
    // 1. Schema validation
    const parsed = types_1.PlanSchema.safeParse(plan);
    if (!parsed.success) {
        const schemaErrors = parsed.error.issues.map(iss => `${iss.path.join('.')}: ${iss.message}`);
        return { valid: false, errors: schemaErrors, warnings };
    }
    const validPlan = parsed.data;
    // 2. Structural checks
    validateStepOrder(validPlan, errors, warnings);
    validateWalletRefs(validPlan, errors, warnings);
    validateTimingConsistency(validPlan, errors, warnings);
    validateRouteCompatibility(validPlan, warnings);
    // 3. Business logic checks
    if (validPlan.steps.length > 20) {
        warnings.push(`Plan has ${validPlan.steps.length} steps — consider splitting for reliability`);
    }
    if (validPlan.route === 'burst' && validPlan.fees.jitoTipSol === undefined) {
        warnings.push('Burst route without Jito tip — block0 landing unlikely');
    }
    const result = {
        valid: errors.length === 0,
        errors,
        warnings,
    };
    if (warnings.length > 0) {
        logger_1.default.warn(`[PlanValidator] Warnings for plan ${validPlan.runId}: ${warnings.join('; ')}`);
    }
    if (errors.length > 0) {
        logger_1.default.error(`[PlanValidator] Errors for plan ${validPlan.runId}: ${errors.join('; ')}`);
    }
    return result;
}
/**
 * Validate that steps are in a logical order
 * - create must come before buy/sell for the same token
 */
function validateStepOrder(plan, errors, warnings) {
    let hasCreate = false;
    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        if (step.type === 'pumpfun.create') {
            if (hasCreate) {
                errors.push(`Step ${i} (${step.name}): duplicate create step`);
            }
            hasCreate = true;
        }
        if ((step.type === 'pumpfun.buy' || step.type === 'pumpfun.buy.staggered') && !hasCreate) {
            errors.push(`Step ${i} (${step.name}): buy before create — no mint address`);
        }
    }
}
/**
 * Validate wallet references exist in steps
 */
function validateWalletRefs(plan, errors, warnings) {
    const referencedWallets = new Set();
    referencedWallets.add(plan.creatorWalletId);
    for (const step of plan.steps) {
        if ('walletIds' in step && step.walletIds) {
            for (const wid of step.walletIds) {
                referencedWallets.add(wid);
            }
        }
        if ('walletGroupId' in step && step.walletGroupId) {
            // Group resolution happens at execution time, just note it
            warnings.push(`Step "${step.name}" uses walletGroupId "${step.walletGroupId}" — ensure group is registered`);
        }
    }
    if (referencedWallets.size === 1 && plan.steps.length > 1) {
        warnings.push('All steps use only the creator wallet — verify this is intentional');
    }
}
/**
 * Validate timing offsets are monotonically increasing
 */
function validateTimingConsistency(plan, errors, warnings) {
    let lastTarget = -Infinity;
    for (const step of plan.steps) {
        const offset = step.at.mode === 'slot' ? step.at.slotOffset : step.at.ms;
        if (offset < lastTarget) {
            warnings.push(`Step "${step.name}" timing (${offset}) is before previous step (${lastTarget}) — may race`);
        }
        lastTarget = offset;
    }
}
/**
 * Validate route-specific compatibility
 */
function validateRouteCompatibility(plan, warnings) {
    if (plan.route === 'burst') {
        const hasStaggered = plan.steps.some(s => s.type === 'pumpfun.buy.staggered');
        if (hasStaggered) {
            warnings.push('Burst route with staggered buys — delays may miss block0');
        }
        if (!plan.fees.burstBlock0) {
            warnings.push('Burst route without burstBlock0 — enable for competitive landing');
        }
    }
    if (plan.route === 'plain') {
        const hasJito = plan.steps.some(s => 'useJitoBundle' in s && s.useJitoBundle);
        if (hasJito) {
            warnings.push('Plain route with Jito bundles — consider burst route instead');
        }
    }
}
//# sourceMappingURL=plan-validator.js.map