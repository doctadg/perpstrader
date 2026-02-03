"use strict";
// Tools Index - Exports all agent tools
Object.defineProperty(exports, "__esModule", { value: true });
exports.getControlToolDefinitions = exports.getControlTools = exports.getQueryToolDefinitions = exports.getQueryTools = void 0;
exports.getAllTools = getAllTools;
exports.getAllToolDefinitions = getAllToolDefinitions;
exports.getToolDefinition = getToolDefinition;
exports.getToolsByRiskLevel = getToolsByRiskLevel;
exports.getToolNamesByRiskLevel = getToolNamesByRiskLevel;
const tools_1 = require("@langchain/core/tools");
const query_tools_1 = require("./query-tools");
const control_tools_1 = require("./control-tools");
// ============================================================================
// EXPORT ALL TOOLS
// ============================================================================
/**
 * Get all tools (query + control) as LangChain Tools
 */
function getAllTools() {
    return [...(0, query_tools_1.getQueryTools)(), ...(0, control_tools_1.getControlTools)()];
}
/**
 * Get all tool definitions
 */
function getAllToolDefinitions() {
    return {
        ...(0, query_tools_1.getQueryToolDefinitions)(),
        ...(0, control_tools_1.getControlToolDefinitions)(),
    };
}
/**
 * Get a specific tool definition by name
 */
function getToolDefinition(name) {
    return getAllToolDefinitions()[name];
}
/**
 * Get tools by risk level
 */
function getToolsByRiskLevel(maxRisk) {
    const riskOrder = {
        NONE: 0,
        LOW: 1,
        MEDIUM: 2,
        HIGH: 3,
        CRITICAL: 4,
    };
    const allDefs = getAllToolDefinitions();
    const threshold = riskOrder[maxRisk];
    return Object.entries(allDefs)
        .filter(([, def]) => riskOrder[def.riskLevel] <= threshold)
        .map(([name, def]) => new tools_1.DynamicTool({
        name: def.name,
        description: def.description,
        func: async (input) => {
            const params = typeof input === 'string' ? JSON.parse(input) : input;
            try {
                const result = await def.handler(params);
                return JSON.stringify({ success: true, data: result });
            }
            catch (error) {
                return JSON.stringify({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        },
    }));
}
/**
 * Get tool names by risk level
 */
function getToolNamesByRiskLevel(maxRisk) {
    const riskOrder = {
        NONE: 0,
        LOW: 1,
        MEDIUM: 2,
        HIGH: 3,
        CRITICAL: 4,
    };
    const allDefs = getAllToolDefinitions();
    const threshold = riskOrder[maxRisk];
    return Object.entries(allDefs)
        .filter(([, def]) => riskOrder[def.riskLevel] <= threshold)
        .map(([name]) => name);
}
// Re-export individual tool sets
var query_tools_2 = require("./query-tools");
Object.defineProperty(exports, "getQueryTools", { enumerable: true, get: function () { return query_tools_2.getQueryTools; } });
Object.defineProperty(exports, "getQueryToolDefinitions", { enumerable: true, get: function () { return query_tools_2.getQueryToolDefinitions; } });
var control_tools_2 = require("./control-tools");
Object.defineProperty(exports, "getControlTools", { enumerable: true, get: function () { return control_tools_2.getControlTools; } });
Object.defineProperty(exports, "getControlToolDefinitions", { enumerable: true, get: function () { return control_tools_2.getControlToolDefinitions; } });
// Default export - all tool definitions
exports.default = getAllToolDefinitions();
//# sourceMappingURL=index.js.map