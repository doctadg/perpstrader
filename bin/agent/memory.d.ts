import { ConversationEntry, ConversationMessage, Platform } from './types';
declare class ConversationMemory {
    private redis;
    private connected;
    private reconnectTimer;
    constructor();
    /**
     * Initialize Redis connection
     */
    connect(): Promise<void>;
    /**
     * Ensure we have a Redis client (get from cache or create new)
     */
    private getClient;
    /**
     * Get conversation by ID
     */
    getConversation(conversationId: string): Promise<ConversationEntry | null>;
    /**
     * Add a message to a conversation
     */
    addMessage(conversationId: string, role: 'user' | 'assistant' | 'system', content: string, toolCalls?: any[], platform?: Platform): Promise<ConversationEntry>;
    /**
     * Update only the last accessed time
     */
    private updateLastAccessed;
    /**
     * Save a conversation entry to Redis
     */
    private saveEntry;
    /**
     * Create or get a conversation for a platform
     */
    getOrCreateConversation(platform: Platform, conversationId?: string): Promise<string>;
    /**
     * Get conversation history for display
     */
    getHistory(conversationId: string, limit?: number): Promise<ConversationMessage[]>;
    /**
     * Clear a conversation (remove all messages)
     */
    clearConversation(conversationId: string): Promise<boolean>;
    /**
     * Delete a conversation
     */
    deleteConversation(conversationId: string): Promise<boolean>;
    /**
     * Get all conversation IDs for a user
     */
    getUserConversations(userId?: string): Promise<string[]>;
    /**
     * Get statistics about stored conversations
     */
    getStats(): Promise<{
        totalConversations: number;
        totalMessages: number;
        avgMessagesPerConversation: number;
    }>;
    /**
     * Generate a new conversation ID
     */
    private generateConversationId;
    /**
     * Get the system prompt for the agent
     */
    private getSystemPrompt;
    /**
     * Disconnect from Redis
     */
    disconnect(): Promise<void>;
    /**
     * Check connection status
     */
    isConnected(): boolean;
}
declare const conversationMemory: ConversationMemory;
export default conversationMemory;
//# sourceMappingURL=memory.d.ts.map