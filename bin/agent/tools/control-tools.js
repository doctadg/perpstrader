"use strict";
// Control Tools for Conversational Agent
// System-modifying tools with safety checks
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getControlTools = getControlTools;
exports.getControlTool = getControlTool;
exports.getControlToolDefinitions = getControlToolDefinitions;
const tools_1 = require("@langchain/core/tools");
const logger_1 = __importDefault(require("../../shared/logger"));
const message_bus_1 = __importStar(require("../../shared/message-bus"));
const trace_store_1 = __importDefault(require("../../data/trace-store"));
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Create a LangChain Tool from a ToolDefinition
 */
function createTool(def) {
    return new tools_1.DynamicTool({
        name: def.name,
        description: def.description,
        func: async (input) => {
            const params = typeof input === 'string' ? JSON.parse(input) : input;
            try {
                const result = await def.handler(params);
                return JSON.stringify({ success: true, data: result });
            }
            catch (error) {
                logger_1.default.error(`[ControlTool] ${def.name} error:`, error);
                return JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        },
    });
}
// ============================================================================
// CONTROL TOOL DEFINITIONS
// ============================================================================
/**
 * Execute a trade
 */
const executeTrade = {
    name: 'execute_trade',
    description: 'Execute a trade on Hyperliquid. Parameters: symbol (e.g., BTC), side (BUY/SELL), size (in base units), type (MARKET/LIMIT, default MARKET), price (required for LIMIT orders). CRITICAL RISK - requires confirmation.',
    riskLevel: 'CRITICAL',
    requiresConfirmation: true,
    handler: async ({ symbol, side, size, type = 'MARKET', price }) => {
        const executionEngine = require('../../execution-engine/execution-engine').default;
        const riskManager = require('../../risk-manager/risk-manager').default;
        const configManager = require('../../shared/config').default;
        // Normalize inputs
        const normalizedSymbol = symbol.toUpperCase();
        const normalizedSide = side.toUpperCase();
        // Get current portfolio for risk check
        const portfolio = await executionEngine.getPortfolio();
        // Create signal
        const signal = {
            id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            symbol: normalizedSymbol,
            action: normalizedSide,
            size: Number(size),
            price: type === 'LIMIT' ? Number(price) : undefined,
            type: type,
            timestamp: new Date(),
            confidence: 0.7,
            strategyId: 'conversational-agent',
            reason: `Manual trade via conversational AI: ${normalizedSide} ${size} ${normalizedSymbol}`,
        };
        // Risk assessment
        const riskAssessment = await riskManager.evaluateSignal(signal, portfolio);
        if (!riskAssessment.approved) {
            throw new Error(`Risk check failed: ${riskAssessment.warnings.join(', ')}`);
        }
        // Execute trade
        const result = await executionEngine.executeSignal(signal, riskAssessment);
        // Publish event
        await message_bus_1.default.publish(message_bus_1.Channel.EXECUTION_SUBMIT, {
            tradeId: result.id,
            source: 'conversational-agent',
            timestamp: new Date(),
        });
        logger_1.default.info(`[ControlTool] Trade executed: ${normalizedSide} ${size} ${normalizedSymbol}`);
        return {
            tradeId: result.id,
            symbol: normalizedSymbol,
            side: normalizedSide,
            size: Number(size),
            price: result.price,
            status: result.status,
            riskAssessment: {
                approved: riskAssessment.approved,
                suggestedSize: riskAssessment.suggestedSize,
                riskScore: riskAssessment.riskScore,
            },
        };
    },
};
/**
 * Update risk management parameters
 */
const updateRiskParams = {
    name: 'update_risk_parameters',
    description: 'Update risk management parameters. Parameters: maxPositionSize (0-1, fraction of portfolio), maxDailyLoss (0-1, fraction), maxLeverage (1-50). HIGH RISK - requires confirmation.',
    riskLevel: 'HIGH',
    requiresConfirmation: true,
    handler: async ({ maxPositionSize, maxDailyLoss, maxLeverage }) => {
        const riskManager = require('../../risk-manager/risk-manager').default;
        const configManager = require('../../shared/config').default;
        const updates = {};
        if (typeof maxPositionSize === 'number') {
            if (maxPositionSize < 0 || maxPositionSize > 1) {
                throw new Error('maxPositionSize must be between 0 and 1');
            }
            updates.maxPositionSize = maxPositionSize;
        }
        if (typeof maxDailyLoss === 'number') {
            if (maxDailyLoss < 0 || maxDailyLoss > 1) {
                throw new Error('maxDailyLoss must be between 0 and 1');
            }
            updates.maxDailyLoss = maxDailyLoss;
        }
        if (typeof maxLeverage === 'number') {
            if (maxLeverage < 1 || maxLeverage > 50) {
                throw new Error('maxLeverage must be between 1 and 50');
            }
            updates.maxLeverage = maxLeverage;
        }
        if (Object.keys(updates).length === 0) {
            throw new Error('At least one parameter must be specified');
        }
        // Update risk manager
        riskManager.updateRiskParameters(updates);
        // Update config
        configManager.update('risk', updates);
        // Publish event
        await message_bus_1.default.publish(message_bus_1.Channel.RISK_LIMIT_BREACH, {
            type: 'RISK_PARAMS_UPDATED',
            updates,
            timestamp: new Date(),
        });
        logger_1.default.info('[ControlTool] Risk parameters updated:', updates);
        return {
            success: true,
            updated: updates,
        };
    },
};
/**
 * Emergency stop - close all positions
 */
const emergencyStop = {
    name: 'emergency_stop',
    description: 'EMERGENCY: Close all positions and cancel all orders immediately. This will stop all trading activity. CRITICAL RISK - requires confirmation.',
    riskLevel: 'CRITICAL',
    requiresConfirmation: true,
    handler: async () => {
        const positionRecovery = require('../../execution-engine/position-recovery').default;
        const executionEngine = require('../../execution-engine/execution-engine').default;
        logger_1.default.warn('[ControlTool] EMERGENCY STOP triggered via conversational agent');
        // Close all positions
        await positionRecovery.emergencyCloseAll();
        // Stop execution engine
        await executionEngine.emergencyStop();
        // Publish emergency stop event
        await message_bus_1.default.publish(message_bus_1.Channel.ERROR, {
            type: 'EMERGENCY_STOP',
            message: 'Emergency stop executed via conversational agent',
            timestamp: new Date(),
        });
        return {
            success: true,
            message: 'Emergency stop executed - all positions closed, orders cancelled',
            timestamp: new Date(),
        };
    },
};
/**
 * Reset a tripped circuit breaker
 */
const resetCircuitBreaker = {
    name: 'reset_circuit_breaker',
    description: 'Reset a tripped circuit breaker by name. This can help recover from temporary failures. LOW RISK - no confirmation required.',
    riskLevel: 'LOW',
    requiresConfirmation: false,
    handler: async ({ name }) => {
        if (!name) {
            throw new Error('Circuit breaker name is required');
        }
        const circuitBreaker = require('../../shared/circuit-breaker').default;
        const success = circuitBreaker.resetBreaker(name);
        if (success) {
            logger_1.default.info(`[ControlTool] Circuit breaker ${name} reset`);
            await message_bus_1.default.publish(message_bus_1.Channel.CIRCUIT_BREAKER_CLOSED, {
                name,
                timestamp: new Date(),
            });
        }
        return {
            success,
            message: success ? `Circuit breaker ${name} reset` : `Failed to reset ${name}`,
        };
    },
};
/**
 * Start the autonomous trading agent
 */
const startTrading = {
    name: 'start_trading',
    description: 'Start the autonomous trading agent. This will begin automated trading based on configured strategies. HIGH RISK - requires confirmation.',
    riskLevel: 'HIGH',
    requiresConfirmation: true,
    handler: async () => {
        logger_1.default.info('[ControlTool] Starting autonomous trading via conversational agent');
        await message_bus_1.default.publish(message_bus_1.Channel.CYCLE_START, {
            action: 'start',
            source: 'conversational-agent',
            timestamp: new Date(),
        });
        return {
            success: true,
            message: 'Trading start signal sent',
        };
    },
};
/**
 * Stop the autonomous trading agent
 */
const stopTrading = {
    name: 'stop_trading',
    description: 'Stop the autonomous trading agent. This will pause automated trading but keep positions open. MEDIUM RISK - requires confirmation.',
    riskLevel: 'MEDIUM',
    requiresConfirmation: true,
    handler: async () => {
        logger_1.default.info('[ControlTool] Stopping autonomous trading via conversational agent');
        await message_bus_1.default.publish(message_bus_1.Channel.CYCLE_START, {
            action: 'stop',
            source: 'conversational-agent',
            timestamp: new Date(),
        });
        return {
            success: true,
            message: 'Trading stop signal sent',
        };
    },
};
/**
 * Toggle a trading strategy on/off
 */
const toggleStrategy = {
    name: 'toggle_strategy',
    description: 'Enable or disable a trading strategy by ID. Parameters: strategyId (required), isActive (true to enable, false to disable). MEDIUM RISK - requires confirmation.',
    riskLevel: 'MEDIUM',
    requiresConfirmation: true,
    handler: async ({ strategyId, isActive }) => {
        if (!strategyId) {
            throw new Error('strategyId is required');
        }
        const dataManager = require('../../data-manager/data-manager').default;
        await dataManager.updateStrategy(strategyId, { isActive });
        logger_1.default.info(`[ControlTool] Strategy ${strategyId} ${isActive ? 'enabled' : 'disabled'}`);
        return {
            success: true,
            strategyId,
            isActive,
        };
    },
};
/**
 * Diagnose a system component
 */
const diagnoseIssue = {
    name: 'diagnose_issue',
    description: 'Run diagnostic on a system component. Parameters: component (execution, risk, data, agent, circuit_breakers). Returns health status and any issues found. LOW RISK - no confirmation required.',
    riskLevel: 'LOW',
    requiresConfirmation: false,
    handler: async ({ component }) => {
        const executionEngine = require('../../execution-engine/execution-engine').default;
        const riskManager = require('../../risk-manager/risk-manager').default;
        const circuitBreaker = require('../../shared/circuit-breaker').default;
        switch (component) {
            case 'execution': {
                const env = executionEngine.getEnvironment ? executionEngine.getEnvironment() : 'UNKNOWN';
                const portfolio = await executionEngine.getPortfolio().catch(() => null);
                return {
                    component: 'execution',
                    status: 'RUNNING',
                    environment: env,
                    portfolioConnected: !!portfolio,
                    portfolioValue: portfolio?.totalValue || 0,
                };
            }
            case 'risk': {
                const configManager = require('../../shared/config').default;
                const config = configManager.get();
                return {
                    component: 'risk',
                    status: 'RUNNING',
                    maxPositionSize: config.risk?.maxPositionSize,
                    maxDailyLoss: config.risk?.maxDailyLoss,
                    maxLeverage: config.risk?.maxLeverage,
                    emergencyStop: config.risk?.emergencyStop,
                };
            }
            case 'data': {
                trace_store_1.default.initialize();
                const recentTraces = trace_store_1.default.getRecentTraceSummaries(10);
                return {
                    component: 'data',
                    status: 'RUNNING',
                    traceCount: recentTraces.length,
                    recentSymbols: [...new Set(recentTraces.map(t => t.symbol))],
                };
            }
            case 'circuit_breakers': {
                const breakers = circuitBreaker.getAllBreakerStatuses();
                const tripped = Object.entries(breakers).filter(([, v]) => v.state === 'OPEN');
                return {
                    component: 'circuit_breakers',
                    status: tripped.length > 0 ? 'DEGRADED' : 'HEALTHY',
                    totalBreakers: Object.keys(breakers).length,
                    trippedCount: tripped.length,
                    trippedBreakers: tripped.map(([name]) => name),
                };
            }
            case 'agent': {
                return {
                    component: 'agent',
                    status: 'RUNNING',
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    nodeVersion: process.version,
                };
            }
            default:
                throw new Error(`Unknown component: ${component}. Valid options: execution, risk, data, agent, circuit_breakers`);
        }
    },
};
// ============================================================================
// EXPORT ALL TOOLS
// ============================================================================
const CONTROL_TOOLS = {
    execute_trade: executeTrade,
    update_risk_parameters: updateRiskParams,
    emergency_stop: emergencyStop,
    reset_circuit_breaker: resetCircuitBreaker,
    start_trading: startTrading,
    stop_trading: stopTrading,
    toggle_strategy: toggleStrategy,
    diagnose_issue: diagnoseIssue,
};
/**
 * Get all control tools as LangChain Tools
 */
function getControlTools() {
    return Object.values(CONTROL_TOOLS).map(createTool);
}
/**
 * Get a specific control tool
 */
function getControlTool(name) {
    return CONTROL_TOOLS[name];
}
/**
 * Get all control tool definitions
 */
function getControlToolDefinitions() {
    return { ...CONTROL_TOOLS };
}
exports.default = CONTROL_TOOLS;
//# sourceMappingURL=control-tools.js.map