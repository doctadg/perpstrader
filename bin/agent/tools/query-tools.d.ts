import { DynamicTool } from '@langchain/core/tools';
import { ToolDefinition } from '../types';
declare const QUERY_TOOLS: Record<string, ToolDefinition>;
/**
 * Get all query tools as LangChain Tools
 */
export declare function getQueryTools(): DynamicTool[];
/**
 * Get a specific query tool
 */
export declare function getQueryTool(name: string): ToolDefinition | undefined;
/**
 * Get all query tool definitions
 */
export declare function getQueryToolDefinitions(): Record<string, ToolDefinition>;
export default QUERY_TOOLS;
//# sourceMappingURL=query-tools.d.ts.map