// Tools Index - Exports all agent tools

import { DynamicTool } from '@langchain/core/tools';
import { ToolDefinition, RiskLevel } from '../types';
import { getQueryTools, getQueryToolDefinitions } from './query-tools';
import { getControlTools, getControlToolDefinitions } from './control-tools';

// ============================================================================
// EXPORT ALL TOOLS
// ============================================================================

/**
 * Get all tools (query + control) as LangChain Tools
 */
export function getAllTools(): DynamicTool[] {
  return [...getQueryTools(), ...getControlTools()];
}

/**
 * Get all tool definitions
 */
export function getAllToolDefinitions(): Record<string, ToolDefinition> {
  return {
    ...getQueryToolDefinitions(),
    ...getControlToolDefinitions(),
  };
}

/**
 * Get a specific tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return getAllToolDefinitions()[name];
}

/**
 * Get tools by risk level
 */
export function getToolsByRiskLevel(maxRisk: RiskLevel): DynamicTool[] {
  const riskOrder: Record<RiskLevel, number> = {
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
    .map(([name, def]) => new DynamicTool({
      name: def.name,
      description: def.description,
      func: async (input: string) => {
        const params = typeof input === 'string' ? JSON.parse(input) : input;
        try {
          const result = await def.handler(params);
          return JSON.stringify({ success: true, data: result });
        } catch (error) {
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
export function getToolNamesByRiskLevel(maxRisk: RiskLevel): string[] {
  const riskOrder: Record<RiskLevel, number> = {
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
export { getQueryTools, getQueryToolDefinitions } from './query-tools';
export { getControlTools, getControlToolDefinitions } from './control-tools';

// Default export - all tool definitions
export default getAllToolDefinitions();
