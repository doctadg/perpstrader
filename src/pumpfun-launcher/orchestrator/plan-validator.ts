// Plan Validator
// Pre-flight validation of Plans before execution

import { Plan, Step, PlanSchema } from '../../shared/types';
import logger from '../../shared/logger';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a plan for execution readiness
 */
export function validatePlan(plan: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Schema validation
  const parsed = PlanSchema.safeParse(plan);
  if (!parsed.success) {
    const schemaErrors = parsed.error.issues.map(
      iss => `${iss.path.join('.')}: ${iss.message}`
    );
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

  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
    warnings,
  };

  if (warnings.length > 0) {
    logger.warn(`[PlanValidator] Warnings for plan ${validPlan.runId}: ${warnings.join('; ')}`);
  }
  if (errors.length > 0) {
    logger.error(`[PlanValidator] Errors for plan ${validPlan.runId}: ${errors.join('; ')}`);
  }

  return result;
}

/**
 * Validate that steps are in a logical order
 * - create must come before buy/sell for the same token
 */
function validateStepOrder(plan: Plan, errors: string[], warnings: string[]): void {
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
function validateWalletRefs(plan: Plan, errors: string[], warnings: string[]): void {
  const referencedWallets = new Set<string>();
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
function validateTimingConsistency(plan: Plan, errors: string[], warnings: string[]): void {
  let lastTarget = -Infinity;

  for (const step of plan.steps) {
    const offset = step.at.mode === 'slot' ? step.at.slotOffset : step.at.ms;
    if (offset < lastTarget) {
      warnings.push(
        `Step "${step.name}" timing (${offset}) is before previous step (${lastTarget}) — may race`
      );
    }
    lastTarget = offset;
  }
}

/**
 * Validate route-specific compatibility
 */
function validateRouteCompatibility(plan: Plan, warnings: string[]): void {
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
    const hasJito = plan.steps.some(
      s => 'useJitoBundle' in s && (s as any).useJitoBundle
    );
    if (hasJito) {
      warnings.push('Plain route with Jito bundles — consider burst route instead');
    }
  }
}
