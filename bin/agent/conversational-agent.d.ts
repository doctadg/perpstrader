import { SystemContext, Intent, Platform, AgentResponse, SuggestedAction, SafetyCheck } from './types';
interface InternalState {
    conversationId: string;
    userId: string;
    platform: Platform;
    messages: any[];
    systemContext: SystemContext;
    intent: Intent;
    toolResults: Map<string, any>;
    safetyCheck: SafetyCheck;
    response: string;
    suggestedActions: SuggestedAction[];
}
declare class ConversationalAgent {
    private llm;
    private pendingConfirmations;
    private connected;
    constructor();
    /**
     * Initialize LLM (OpenRouter for chat agent)
     */
    private initializeLLM;
    /**
     * Call LLM via OpenRouter
     */
    private callLLM;
    /**
     * Call LLM for tool decision via OpenRouter
     */
    private callLLMForToolDecision;
    /**
     * Initialize the agent
     */
    initialize(): Promise<void>;
    /**
     * Process a user message (main entry point)
     */
    processMessage(input: {
        message: string;
        conversationId?: string;
        platform?: Platform;
    }): Promise<AgentResponse>;
    /**
     * Classify user intent
     */
    private classifyIntent;
    private matchesAny;
    /**
     * Gather system context
     */
    private gatherContext;
    /**
     * Execute tools based on message
     */
    private executeTools;
    /**
     * Generate response
     */
    private generateResponse;
    private buildContextString;
    private formatToolResults;
    private generateSuggestedActions;
    private generateFallbackResponse;
    private getSystemPrompt;
    /**
     * Handle user confirmation for a pending action
     */
    handleConfirmation(actionId: string, confirmed: boolean): Promise<any>;
    /**
     * Get conversation history
     */
    getConversationHistory(conversationId: string): Promise<any>;
    /**
     * Get all conversations
     */
    getAllConversations(): Promise<string[]>;
    /**
     * Clear a conversation
     */
    clearConversation(conversationId: string): Promise<boolean>;
    /**
     * Get memory stats
     */
    getStats(): Promise<any>;
    /**
     * Subscribe to system events for proactive updates
     */
    private subscribeToEvents;
    /**
     * Disconnect and cleanup
     */
    disconnect(): Promise<void>;
}
declare const conversationalAgent: ConversationalAgent;
export default conversationalAgent;
export { ConversationalAgent, InternalState, AgentResponse };
//# sourceMappingURL=conversational-agent.d.ts.map