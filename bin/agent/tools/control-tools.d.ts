import { DynamicTool } from '@langchain/core/tools';
import { ToolDefinition } from '../types';
declare const CONTROL_TOOLS: Record<string, ToolDefinition>;
/**
 * Get all control tools as LangChain Tools
 */
export declare function getControlTools(): DynamicTool[];
/**
 * Get a specific control tool
 */
export declare function getControlTool(name: string): ToolDefinition | undefined;
/**
 * Get all control tool definitions
 */
export declare function getControlToolDefinitions(): Record<string, ToolDefinition>;
export default CONTROL_TOOLS;
//# sourceMappingURL=control-tools.d.ts.map