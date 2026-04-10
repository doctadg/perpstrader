import type { AgentName, AgentStatus } from './agent-api-types';
export interface AgentState {
    status: AgentStatus;
    startedAt: number | null;
    cyclesCompleted: number;
    errorCount: number;
    lastError: string | null;
    lastActivity: number | null;
}
export declare function restoreAgents(): void;
export declare function ensureAgent(name: AgentName): void;
export declare function getAgent(name: AgentName): AgentState | undefined;
export declare function getAllAgents(): Map<AgentName, AgentState>;
export declare function updateAgentStatus(name: AgentName, update: Partial<AgentState>): void;
export declare function setAgentRunning(name: AgentName): void;
export declare function setAgentStopped(name: AgentName): void;
export declare function setAgentError(name: AgentName, error: string): void;
export declare function forEachAgent(fn: (state: AgentState, name: AgentName) => void): void;
/**
 * Stop all agents (e.g. emergency stop). Persists all changes.
 */
export declare function stopAllAgents(): void;
/**
 * Close the database connection. Call on graceful shutdown.
 */
export declare function close(): void;
//# sourceMappingURL=agent-registry.d.ts.map