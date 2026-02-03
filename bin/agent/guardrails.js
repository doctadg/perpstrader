"use strict";
// Safety Guardrails for Conversational Agent
// Validates system-modifying actions and enforces risk policies
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RULES = exports.SafetyGuardrails = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const DEFAULT_CONFIG = {
    maxTradeSize: 0.5, // 50% of portfolio
    maxLeverage: 50, // 50x max
    maxDailyLossThreshold: 0.5, // 50% max daily loss
    emergencyStopCooldown: 60, // 1 minute cooldown
    supportedSymbols: ['BTC', 'ETH', 'SOL', 'DOGE', 'PEPE', 'WIF', 'BONK', 'FARTCOIN'],
    autoExecuteThreshold: 'MEDIUM',
};
// ============================================================================
// GUARDRAIL CLASS
// ============================================================================
class SafetyGuardrails {
    config;
    lastEmergencyStop = 0;
    pendingConfirmations = new Map();
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Check if an action is safe to execute
     */
    async checkAction(actionName, params, portfolioContext) {
        const rule = this.getRule(actionName);
        if (!rule) {
            // Unknown action - medium risk, requires confirmation
            return {
                allowed: true,
                riskLevel: 'MEDIUM',
                requiresConfirmation: true,
                warnings: ['Unknown action - review before proceeding'],
            };
        }
        try {
            return await rule.check(params, this.config, portfolioContext);
        }
        catch (error) {
            logger_1.default.error(`[Guardrails] Error checking action ${actionName}:`, error);
            return {
                allowed: false,
                riskLevel: 'HIGH',
                requiresConfirmation: true,
                warnings: ['Failed to validate action'],
            };
        }
    }
    /**
     * Get rule for an action
     */
    getRule(actionName) {
        return RULES.get(actionName);
    }
    /**
     * Check if action should auto-execute based on risk level
     */
    shouldAutoExecute(riskLevel) {
        const levels = {
            NONE: 0,
            LOW: 1,
            MEDIUM: 2,
            HIGH: 3,
            CRITICAL: 4,
        };
        const threshold = levels[this.config.autoExecuteThreshold];
        return levels[riskLevel] <= threshold;
    }
    /**
     * Store a pending confirmation
     */
    storeConfirmation(actionId, data) {
        this.pendingConfirmations.set(actionId, {
            ...data,
            timestamp: Date.now(),
        });
        // Clean up old confirmations after 5 minutes
        setTimeout(() => {
            this.pendingConfirmations.delete(actionId);
        }, 5 * 60 * 1000);
    }
    /**
     * Get and remove a pending confirmation
     */
    getConfirmation(actionId) {
        const data = this.pendingConfirmations.get(actionId);
        if (data) {
            this.pendingConfirmations.delete(actionId);
            return data;
        }
        return null;
    }
    /**
     * Update configuration
     */
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        logger_1.default.info('[Guardrails] Configuration updated:', updates);
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Check emergency stop cooldown
     */
    canEmergencyStop() {
        const now = Date.now();
        const elapsed = (now - this.lastEmergencyStop) / 1000;
        if (elapsed < this.config.emergencyStopCooldown) {
            return {
                allowed: false,
                remainingSeconds: Math.ceil(this.config.emergencyStopCooldown - elapsed),
            };
        }
        return { allowed: true };
    }
    /**
     * Record an emergency stop
     */
    recordEmergencyStop() {
        this.lastEmergencyStop = Date.now();
    }
    /**
     * Get all available rules
     */
    getRules() {
        return new Map(RULES);
    }
}
exports.SafetyGuardrails = SafetyGuardrails;
// Trade execution rule
const executeTradeRule = {
    name: 'execute_trade',
    description: 'Execute a trade',
    check: (params, config, portfolio) => {
        const warnings = [];
        const { symbol, size, side } = params;
        // Check symbol support
        if (!config.supportedSymbols.includes(symbol?.toUpperCase())) {
            return {
                allowed: false,
                riskLevel: 'HIGH',
                requiresConfirmation: false,
                warnings: [`Symbol ${symbol} is not supported. Supported: ${config.supportedSymbols.join(', ')}`],
            };
        }
        // Check position size relative to portfolio
        if (portfolio?.totalValue && size > 0) {
            const sizeRatio = size / portfolio.totalValue;
            if (sizeRatio > config.maxTradeSize) {
                warnings.push(`Position size (${(sizeRatio * 100).toFixed(1)}% of portfolio) exceeds limit of ${(config.maxTradeSize * 100).toFixed(1)}%`);
            }
        }
        // Check for very large trades
        if (size > 10000) {
            warnings.push('Very large trade size - high risk');
        }
        // All trades are critical by default
        return {
            allowed: true,
            riskLevel: warnings.length > 0 ? 'CRITICAL' : 'HIGH',
            requiresConfirmation: true,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    },
};
// Risk parameter update rule
const updateRiskParamsRule = {
    name: 'update_risk_parameters',
    description: 'Update risk management parameters',
    check: (params) => {
        const warnings = [];
        const { maxPositionSize, maxDailyLoss, maxLeverage } = params;
        // Check leverage
        if (maxLeverage > 50) {
            return {
                allowed: false,
                riskLevel: 'CRITICAL',
                requiresConfirmation: false,
                warnings: ['Max leverage cannot exceed 50x'],
            };
        }
        if (maxLeverage > 20) {
            warnings.push('Very high leverage setting');
        }
        // Check position size
        if (maxPositionSize > 0.5) {
            warnings.push('Very large max position size');
        }
        // Check daily loss limit
        if (maxDailyLoss > 0.3) {
            warnings.push('High daily loss limit - could result in significant losses');
        }
        // Determine risk level based on magnitude of changes
        const riskLevel = warnings.length >= 2 ? 'HIGH' : 'MEDIUM';
        return {
            allowed: true,
            riskLevel,
            requiresConfirmation: true,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    },
};
// Emergency stop rule
const emergencyStopRule = {
    name: 'emergency_stop',
    description: 'Emergency stop - close all positions',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'CRITICAL',
            requiresConfirmation: true,
            warnings: ['This will close all positions and cancel all orders'],
        };
    },
};
// Circuit breaker reset rule
const resetCircuitBreakerRule = {
    name: 'reset_circuit_breaker',
    description: 'Reset a tripped circuit breaker',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'LOW',
            requiresConfirmation: false,
        };
    },
};
// Stop trading rule
const stopTradingRule = {
    name: 'stop_trading',
    description: 'Stop the autonomous trading agent',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'MEDIUM',
            requiresConfirmation: true,
            warnings: ['Autonomous trading will be paused'],
        };
    },
};
// Start trading rule
const startTradingRule = {
    name: 'start_trading',
    description: 'Start the autonomous trading agent',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'HIGH',
            requiresConfirmation: true,
            warnings: ['Autonomous trading will begin - ensure risk parameters are set correctly'],
        };
    },
};
// Toggle strategy rule
const toggleStrategyRule = {
    name: 'toggle_strategy',
    description: 'Enable or disable a trading strategy',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'MEDIUM',
            requiresConfirmation: true,
        };
    },
};
// Trace analysis rule (read-only, no risk)
const analyzeTraceRule = {
    name: 'analyze_trace',
    description: 'Analyze a trading trace',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'NONE',
            requiresConfirmation: false,
        };
    },
};
// Get portfolio rule (read-only)
const getPortfolioRule = {
    name: 'get_portfolio',
    description: 'Get current portfolio state',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'NONE',
            requiresConfirmation: false,
        };
    },
};
// Get positions rule (read-only)
const getPositionsRule = {
    name: 'get_positions',
    description: 'Get current open positions',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'NONE',
            requiresConfirmation: false,
        };
    },
};
// Get recent trades rule (read-only)
const getRecentTradesRule = {
    name: 'get_recent_trades',
    description: 'Get recent trade history',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'NONE',
            requiresConfirmation: false,
        };
    },
};
// Get trace rule (read-only)
const getTraceRule = {
    name: 'get_trace',
    description: 'Get detailed trace for a trading cycle',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'NONE',
            requiresConfirmation: false,
        };
    },
};
// Get system status rule (read-only)
const getSystemStatusRule = {
    name: 'get_system_status',
    description: 'Get overall system health and status',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'NONE',
            requiresConfirmation: false,
        };
    },
};
// Get config rule (read-only, sanitized)
const getConfigRule = {
    name: 'get_config',
    description: 'Get current system configuration',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'NONE',
            requiresConfirmation: false,
        };
    },
};
// Get news rule (read-only)
const getNewsRule = {
    name: 'get_news',
    description: 'Get recent news articles',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'NONE',
            requiresConfirmation: false,
        };
    },
};
// Get hot clusters rule (read-only)
const getHotClustersRule = {
    name: 'get_hot_clusters',
    description: 'Get trending news clusters',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'NONE',
            requiresConfirmation: false,
        };
    },
};
// Diagnose issue rule (read-only diagnostics)
const diagnoseIssueRule = {
    name: 'diagnose_issue',
    description: 'Run diagnostic on a system component',
    check: () => {
        return {
            allowed: true,
            riskLevel: 'LOW',
            requiresConfirmation: false,
        };
    },
};
// ============================================================================
// RULES REGISTRY
// ============================================================================
const RULES = new Map([
    // Control tools (system-modifying)
    ['execute_trade', executeTradeRule],
    ['update_risk_parameters', updateRiskParamsRule],
    ['emergency_stop', emergencyStopRule],
    ['reset_circuit_breaker', resetCircuitBreakerRule],
    ['start_trading', startTradingRule],
    ['stop_trading', stopTradingRule],
    ['toggle_strategy', toggleStrategyRule],
    // Query tools (read-only)
    ['analyze_trace', analyzeTraceRule],
    ['get_portfolio', getPortfolioRule],
    ['get_positions', getPositionsRule],
    ['get_recent_trades', getRecentTradesRule],
    ['get_trace', getTraceRule],
    ['get_system_status', getSystemStatusRule],
    ['get_config', getConfigRule],
    ['get_news', getNewsRule],
    ['get_hot_clusters', getHotClustersRule],
    ['diagnose_issue', diagnoseIssueRule],
]);
exports.RULES = RULES;
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
const safetyGuardrails = new SafetyGuardrails();
exports.default = safetyGuardrails;
//# sourceMappingURL=guardrails.js.map