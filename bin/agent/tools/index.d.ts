import { DynamicTool } from '@langchain/core/tools';
import { ToolDefinition, RiskLevel } from '../types';
/**
 * Get all tools (query + control) as LangChain Tools
 */
export declare function getAllTools(): DynamicTool[];
/**
 * Get all tool definitions
 */
export declare function getAllToolDefinitions(): Record<string, ToolDefinition>;
/**
 * Get a specific tool definition by name
 */
export declare function getToolDefinition(name: string): ToolDefinition | undefined;
/**
 * Get tools by risk level
 */
export declare function getToolsByRiskLevel(maxRisk: RiskLevel): DynamicTool[];
/**
 * Get tool names by risk level
 */
export declare function getToolNamesByRiskLevel(maxRisk: RiskLevel): string[];
export { getQueryTools, getQueryToolDefinitions } from './query-tools';
export { getControlTools, getControlToolDefinitions } from './control-tools';
declare const _default: Record<string, ToolDefinition>;
export default _default;
//# sourceMappingURL=index.d.ts.map