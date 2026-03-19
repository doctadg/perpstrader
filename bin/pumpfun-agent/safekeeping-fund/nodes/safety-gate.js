"use strict";
// Safekeeping Fund System - Safety Gate Node
// Performs comprehensive safety checks before executing rebalances
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safetyGateNode = safetyGateNode;
exports.triggerEmergencyHalt = triggerEmergencyHalt;
exports.clearEmergencyHalt = clearEmergencyHalt;
const logger_1 = __importDefault(require("../../shared/logger"));
const circuit_breaker_1 = __importDefault(require("../../shared/circuit-breaker"));
const constants_1 = require("../constants");
/**
 * Safety Gate Node
 * Validates all safety conditions before allowing execution
 */
async function safetyGateNode(state) {
    logger_1.default.info('[SafetyGate] Performing safety validation');
    const checks = [];
    try {
        // Check 1: Circuit Breaker Status
        checks.push(await checkCircuitBreaker(state));
        // Check 2: Emergency Pause Status
        checks.push(await checkEmergencyPause(state));
        // Check 3: Gas Price Limits
        checks.push(await checkGasLimits(state));
        // Check 4: Maximum Trade Size
        checks.push(checkMaxTradeSize(state));
        // Check 5: Minimum Pool Liquidity
        checks.push(await checkMinPoolLiquidity(state));
        // Check 6: Slippage Tolerance
        checks.push(await checkSlippageTolerance(state));
        // Check 7: AI Anomaly Detection
        checks.push(await checkAIAnomalies(state));
        // Check 8: Daily Rebalance Limits
        checks.push(await checkDailyRebalanceLimit(state));
        // Check 9: Balance Anomaly
        checks.push(await checkBalanceAnomaly(state));
        // Determine if all checks passed
        const allPassed = checks.every(c => c.passed);
        const failedChecks = checks.filter(c => !c.passed);
        if (allPassed) {
            logger_1.default.info('[SafetyGate] All safety checks passed');
        }
        else {
            logger_1.default.warn(`[SafetyGate] ${failedChecks.length} safety check(s) failed:`);
            for (const check of failedChecks) {
                logger_1.default.warn(`  - ${check.name}: ${check.reason || 'Failed'}`);
            }
        }
        return {
            currentStep: allPassed ? 'SAFETY_GATE_PASSED' : 'SAFETY_GATE_REJECTED',
            safetyChecks: checks,
            isPaused: !allPassed,
            pauseReason: allPassed ? undefined : failedChecks.map(c => c.name).join(', '),
            thoughts: [
                ...state.thoughts,
                allPassed
                    ? 'All safety checks passed - ready to execute'
                    : `Safety gate blocked: ${failedChecks.map(c => c.name).join(', ')}`,
            ],
        };
    }
    catch (error) {
        logger_1.default.error(`[SafetyGate] Error during validation: ${error}`);
        return {
            currentStep: 'SAFETY_GATE_ERROR',
            errors: [...state.errors, `Safety gate error: ${error}`],
            isPaused: true,
            pauseReason: 'Safety gate error',
            safetyChecks: checks,
        };
    }
}
/**
 * Check circuit breaker status
 */
async function checkCircuitBreaker(state) {
    const breakerNames = [
        'safekeeping-execution',
        'safekeeping-apr-fetch',
        'safekeeping-ethereum-rpc',
        'safekeeping-bsc-rpc',
        'safekeeping-solana-rpc',
    ];
    for (const name of breakerNames) {
        const breaker = circuit_breaker_1.default.getBreakerStatus(name);
        if (breaker?.isOpen) {
            return {
                name: 'circuit_breaker',
                passed: false,
                reason: `Circuit breaker '${name}' is open`,
                severity: 'ERROR',
                timestamp: new Date(),
            };
        }
    }
    return {
        name: 'circuit_breaker',
        passed: true,
        severity: 'INFO',
        timestamp: new Date(),
    };
}
/**
 * Check emergency pause status
 */
async function checkEmergencyPause(state) {
    if (state.emergencyHaltActive) {
        return {
            name: 'emergency_pause',
            passed: false,
            reason: 'Emergency halt is active',
            severity: 'CRITICAL',
            timestamp: new Date(),
        };
    }
    if (state.isPaused) {
        return {
            name: 'emergency_pause',
            passed: false,
            reason: state.pauseReason || 'System is paused',
            severity: 'ERROR',
            timestamp: new Date(),
        };
    }
    return {
        name: 'emergency_pause',
        passed: true,
        severity: 'INFO',
        timestamp: new Date(),
    };
}
/**
 * Check gas price limits
 */
async function checkGasLimits(state) {
    for (const [chain, status] of state.chainStatus) {
        if (!status.gasPrice)
            continue;
        const thresholds = constants_1.GAS_THRESHOLDS[chain];
        if (!thresholds)
            continue;
        if (status.gasPrice > thresholds.critical) {
            return {
                name: 'gas_limits',
                passed: false,
                reason: `Critical gas price on ${chain}: ${status.gasPrice}`,
                severity: 'CRITICAL',
                timestamp: new Date(),
            };
        }
        if (status.gasPrice > thresholds.high) {
            return {
                name: 'gas_limits',
                passed: false,
                reason: `High gas price on ${chain}: ${status.gasPrice}`,
                severity: 'WARNING',
                timestamp: new Date(),
            };
        }
    }
    // Check estimated gas cost for the rebalance
    if (state.selectedRebalance) {
        const maxGas = getMaxGasForChain(state.selectedRebalance.toPool?.chain || 'ethereum');
        if (state.selectedRebalance.estimatedGas > maxGas) {
            return {
                name: 'gas_limits',
                passed: false,
                reason: `Estimated gas $${state.selectedRebalance.estimatedGas.toFixed(2)} exceeds limit $${maxGas.toFixed(2)}`,
                severity: 'ERROR',
                timestamp: new Date(),
            };
        }
    }
    return {
        name: 'gas_limits',
        passed: true,
        severity: 'INFO',
        timestamp: new Date(),
    };
}
/**
 * Get max gas cost for a chain
 */
function getMaxGasForChain(chain) {
    switch (chain) {
        case 'ethereum':
            return constants_1.DEFAULT_SAFETY_LIMITS.maxGasEth * 3000; // ETH * price
        case 'bsc':
            return constants_1.DEFAULT_SAFETY_LIMITS.maxGasBsc * 600; // BNB * price
        case 'solana':
            return constants_1.DEFAULT_SAFETY_LIMITS.maxGasSol * 150; // SOL * price
        default:
            return 100;
    }
}
/**
 * Check maximum trade size
 */
function checkMaxTradeSize(state) {
    if (!state.selectedRebalance) {
        return {
            name: 'max_size',
            passed: true,
            severity: 'INFO',
            timestamp: new Date(),
        };
    }
    if (state.selectedRebalance.amount > constants_1.DEFAULT_SAFETY_LIMITS.maxTradeSize) {
        return {
            name: 'max_size',
            passed: false,
            reason: `Trade size $${state.selectedRebalance.amount.toFixed(2)} exceeds limit $${constants_1.DEFAULT_SAFETY_LIMITS.maxTradeSize}`,
            severity: 'ERROR',
            timestamp: new Date(),
        };
    }
    return {
        name: 'max_size',
        passed: true,
        severity: 'INFO',
        timestamp: new Date(),
    };
}
/**
 * Check minimum pool liquidity
 */
async function checkMinPoolLiquidity(state) {
    if (!state.selectedRebalance?.toPool) {
        return {
            name: 'min_liquidity',
            passed: true,
            severity: 'INFO',
            timestamp: new Date(),
        };
    }
    const pool = state.selectedRebalance.toPool;
    if (pool.liquidity < constants_1.DEFAULT_SAFETY_LIMITS.minPoolLiquidity) {
        return {
            name: 'min_liquidity',
            passed: false,
            reason: `Pool liquidity $${pool.liquidity.toFixed(2)} below minimum $${constants_1.DEFAULT_SAFETY_LIMITS.minPoolLiquidity}`,
            severity: 'ERROR',
            timestamp: new Date(),
        };
    }
    return {
        name: 'min_liquidity',
        passed: true,
        severity: 'INFO',
        timestamp: new Date(),
    };
}
/**
 * Check slippage tolerance
 */
async function checkSlippageTolerance(state) {
    const estimatedSlippage = 0.005; // 0.5% estimated (would calculate based on pool depth)
    if (estimatedSlippage > constants_1.DEFAULT_SAFETY_LIMITS.maxSlippage) {
        return {
            name: 'slippage_check',
            passed: false,
            reason: `Estimated slippage ${(estimatedSlippage * 100).toFixed(2)}% exceeds limit ${(constants_1.DEFAULT_SAFETY_LIMITS.maxSlippage * 100).toFixed(2)}%`,
            severity: 'ERROR',
            timestamp: new Date(),
        };
    }
    return {
        name: 'slippage_check',
        passed: true,
        severity: 'INFO',
        timestamp: new Date(),
    };
}
/**
 * Check AI-detected anomalies
 */
async function checkAIAnomalies(state) {
    const criticalAnomalies = state.detectedAnomalies.filter(a => a.severity === 'CRITICAL');
    if (criticalAnomalies.length > 0) {
        return {
            name: 'anomaly_detection',
            passed: false,
            reason: `${criticalAnomalies.length} critical anomaly(ies) detected`,
            severity: 'CRITICAL',
            timestamp: new Date(),
        };
    }
    const highAnomalies = state.detectedAnomalies.filter(a => a.severity === 'HIGH');
    if (highAnomalies.length > 0) {
        return {
            name: 'anomaly_detection',
            passed: false,
            reason: `${highAnomalies.length} high severity anomaly(ies) detected`,
            severity: 'WARNING',
            timestamp: new Date(),
        };
    }
    return {
        name: 'anomaly_detection',
        passed: true,
        severity: 'INFO',
        timestamp: new Date(),
    };
}
/**
 * Check daily rebalance limits
 */
async function checkDailyRebalanceLimit(state) {
    // This would check actual daily count from persistent storage
    // For now, use the in-memory counter
    const maxDaily = constants_1.DEFAULT_SAFETY_LIMITS.maxDailyRebalances;
    if (state.totalRebalances >= maxDaily) {
        return {
            name: 'daily_limit',
            passed: false,
            reason: `Daily rebalance limit reached (${state.totalRebalances}/${maxDaily})`,
            severity: 'ERROR',
            timestamp: new Date(),
        };
    }
    return {
        name: 'daily_limit',
        passed: true,
        severity: 'INFO',
        timestamp: new Date(),
    };
}
/**
 * Check for balance anomalies
 */
async function checkBalanceAnomaly(state) {
    // Check for sudden drops in portfolio value
    if (state.totalValue > 0) {
        const expectedValue = state.positions.reduce((sum, p) => sum + p.totalValue, 0);
        const discrepancy = Math.abs(state.totalValue - expectedValue) / state.totalValue;
        if (discrepancy > 0.1) {
            // 10% discrepancy
            return {
                name: 'balance_anomaly',
                passed: false,
                reason: `Balance discrepancy: ${(discrepancy * 100).toFixed(1)}%`,
                severity: 'WARNING',
                timestamp: new Date(),
            };
        }
    }
    return {
        name: 'balance_anomaly',
        passed: true,
        severity: 'INFO',
        timestamp: new Date(),
    };
}
/**
 * Manually trigger emergency halt
 */
function triggerEmergencyHalt(reason) {
    circuit_breaker_1.default.openBreaker('safekeeping-execution');
    return {
        name: 'manual_emergency_halt',
        passed: false,
        reason,
        severity: 'CRITICAL',
        timestamp: new Date(),
    };
}
/**
 * Clear emergency halt
 */
function clearEmergencyHalt() {
    circuit_breaker_1.default.resetBreaker('safekeeping-execution');
    logger_1.default.info('[SafetyGate] Emergency halt cleared');
}
//# sourceMappingURL=safety-gate.js.map