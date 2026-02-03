// Conversation Memory Store
// Redis-backed conversation history for the conversational agent

import Redis from 'ioredis';
import logger from '../shared/logger';
import { ConversationEntry, ConversationMessage, Platform } from './types';
import redisCache from '../shared/redis-cache';

// ============================================================================
// CONFIGURATION
// ============================================================================

const KEY_PREFIX = 'agent:conversation:';
const DEFAULT_TTL = 604800; // 7 days in seconds
const MAX_HISTORY_SIZE = 50; // Maximum messages per conversation

// ============================================================================
// CONVERSATION MEMORY CLASS
// ============================================================================

class ConversationMemory {
  private redis: Redis | null = null;
  private connected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor() {
    // We'll use the shared redis connection, but can create our own if needed
  }

  /**
   * Initialize Redis connection
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Use the shared redis cache connection
      await redisCache.connect();
      this.connected = true;
      logger.info('[ConversationMemory] Connected to Redis');
    } catch (error) {
      logger.error('[ConversationMemory] Failed to connect:', error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Ensure we have a Redis client (get from cache or create new)
   */
  private getClient(): Redis {
    // For now, create a new connection if needed
    // In production, we could share the connection from redisCache
    if (!this.redis) {
      const redisHost = process.env.REDIS_HOST || '127.0.0.1';
      const redisPort = Number.parseInt(process.env.REDIS_PORT || '6380', 10);
      const redisPassword = process.env.REDIS_PASSWORD;
      const redisDb = Number.parseInt(process.env.REDIS_DB || '0', 10);

      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        db: redisDb,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      this.redis.on('error', (error) => {
        logger.error('[ConversationMemory] Redis error:', error);
      });

      this.redis.on('connect', () => {
        logger.debug('[ConversationMemory] Redis connected');
        this.connected = true;
      });

      this.redis.on('close', () => {
        this.connected = false;
      });
    }

    return this.redis;
  }

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<ConversationEntry | null> {
    try {
      const client = this.getClient();
      const key = `${KEY_PREFIX}${conversationId}`;
      const data = await client.get(key);

      if (data) {
        const entry = JSON.parse(data, (key, value) => {
          // Parse date strings back to Date objects
          if (key === 'createdAt' || key === 'lastAccessed' || key === 'timestamp') {
            return new Date(value);
          }
          return value;
        }) as ConversationEntry;

        // Update last accessed time
        await this.updateLastAccessed(conversationId);

        return entry;
      }

      return null;
    } catch (error) {
      logger.error(`[ConversationMemory] Get conversation error for ${conversationId}:`, error);
      return null;
    }
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    toolCalls?: any[],
    platform: Platform = 'dashboard'
  ): Promise<ConversationEntry> {
    try {
      const client = this.getClient();
      const entry = await this.getConversation(conversationId);

      const message: ConversationMessage = {
        role,
        content,
        timestamp: new Date(),
        toolCalls,
      };

      if (entry) {
        // Add to existing conversation
        entry.messages.push(message);

        // Prune if too large
        if (entry.messages.length > MAX_HISTORY_SIZE) {
          // Keep system messages and recent user/assistant messages
          const systemMessages = entry.messages.filter(m => m.role === 'system');
          const otherMessages = entry.messages.filter(m => m.role !== 'system');
          const toKeep = otherMessages.slice(-MAX_HISTORY_SIZE + systemMessages.length);
          entry.messages = [...systemMessages, ...toKeep];
        }

        entry.metadata.lastAccessed = new Date();
        entry.metadata.messageCount = entry.messages.length;

        await this.saveEntry(conversationId, entry);
        return entry;
      } else {
        // Create new conversation
        const newEntry: ConversationEntry = {
          conversationId,
          userId: 'default', // Single-user system
          platform,
          messages: [message],
          metadata: {
            createdAt: new Date(),
            lastAccessed: new Date(),
            messageCount: 1,
          },
        };

        await this.saveEntry(conversationId, newEntry);
        return newEntry;
      }
    } catch (error) {
      logger.error(`[ConversationMemory] Add message error for ${conversationId}:`, error);
      throw error;
    }
  }

  /**
   * Update only the last accessed time
   */
  private async updateLastAccessed(conversationId: string): Promise<void> {
    try {
      const client = this.getClient();
      const key = `${KEY_PREFIX}${conversationId}`;
      const ttl = await client.ttl(key);

      // Refresh TTL if key exists
      if (ttl > 0) {
        await client.expire(key, DEFAULT_TTL);
      }
    } catch (error) {
      logger.error('[ConversationMemory] Update last accessed error:', error);
    }
  }

  /**
   * Save a conversation entry to Redis
   */
  private async saveEntry(conversationId: string, entry: ConversationEntry): Promise<void> {
    try {
      const client = this.getClient();
      const key = `${KEY_PREFIX}${conversationId}`;
      await client.set(key, JSON.stringify(entry), 'EX', DEFAULT_TTL);
    } catch (error) {
      logger.error('[ConversationMemory] Save entry error:', error);
      throw error;
    }
  }

  /**
   * Create or get a conversation for a platform
   */
  async getOrCreateConversation(platform: Platform, conversationId?: string): Promise<string> {
    if (conversationId) {
      const existing = await this.getConversation(conversationId);
      if (existing) {
        return conversationId;
      }
    }

    // Generate new conversation ID
    const newId = this.generateConversationId(platform);
    const entry: ConversationEntry = {
      conversationId: newId,
      userId: 'default',
      platform,
      messages: [{
        role: 'system',
        content: this.getSystemPrompt(),
        timestamp: new Date(),
      }],
      metadata: {
        createdAt: new Date(),
        lastAccessed: new Date(),
        messageCount: 1,
      },
    };

    await this.saveEntry(newId, entry);
    return newId;
  }

  /**
   * Get conversation history for display
   */
  async getHistory(conversationId: string, limit?: number): Promise<ConversationMessage[]> {
    try {
      const entry = await this.getConversation(conversationId);
      if (!entry) {
        return [];
      }

      const messages = entry.messages.filter(m => m.role !== 'system');
      return limit ? messages.slice(-limit) : messages;
    } catch (error) {
      logger.error('[ConversationMemory] Get history error:', error);
      return [];
    }
  }

  /**
   * Clear a conversation (remove all messages)
   */
  async clearConversation(conversationId: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const key = `${KEY_PREFIX}${conversationId}`;

      // Delete the conversation
      await client.del(key);

      // Recreate with just system prompt
      await this.getOrCreateConversation('dashboard', conversationId);

      return true;
    } catch (error) {
      logger.error('[ConversationMemory] Clear conversation error:', error);
      return false;
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      const client = this.getClient();
      const key = `${KEY_PREFIX}${conversationId}`;
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('[ConversationMemory] Delete conversation error:', error);
      return false;
    }
  }

  /**
   * Get all conversation IDs for a user
   */
  async getUserConversations(userId: string = 'default'): Promise<string[]> {
    try {
      const client = this.getClient();
      const pattern = `${KEY_PREFIX}*`;
      const keys = await client.keys(pattern);

      // For single-user system, return all keys
      return keys.map(key => key.replace(KEY_PREFIX, ''));
    } catch (error) {
      logger.error('[ConversationMemory] Get user conversations error:', error);
      return [];
    }
  }

  /**
   * Get statistics about stored conversations
   */
  async getStats(): Promise<{
    totalConversations: number;
    totalMessages: number;
    avgMessagesPerConversation: number;
  }> {
    try {
      const client = this.getClient();
      const pattern = `${KEY_PREFIX}*`;
      const keys = await client.keys(pattern);

      let totalMessages = 0;

      for (const key of keys) {
        const data = await client.get(key);
        if (data) {
          const entry = JSON.parse(data) as ConversationEntry;
          totalMessages += entry.metadata.messageCount || 0;
        }
      }

      return {
        totalConversations: keys.length,
        totalMessages,
        avgMessagesPerConversation: keys.length > 0 ? totalMessages / keys.length : 0,
      };
    } catch (error) {
      logger.error('[ConversationMemory] Get stats error:', error);
      return {
        totalConversations: 0,
        totalMessages: 0,
        avgMessagesPerConversation: 0,
      };
    }
  }

  /**
   * Generate a new conversation ID
   */
  private generateConversationId(platform: Platform): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 11);
    return `${platform}-${timestamp}-${random}`;
  }

  /**
   * Get the system prompt for the agent
   */
  private getSystemPrompt(): string {
    return `You are an AI trading assistant for the PerpsTrader autonomous trading system.

Your capabilities include:
- Querying portfolio state, positions, trades, and traces
- Analyzing trading cycles and explaining what happened
- Executing trades (with user confirmation for safety)
- Updating risk parameters (with confirmation)
- Diagnosing and fixing system issues

Key guidelines:
1. Always explain what you're doing before taking action
2. For dangerous actions (trades, parameter changes), clearly state the risks
3. Provide context and reasoning for your recommendations
4. Be concise but thorough
5. When analyzing traces, focus on the decision chain and outcomes

Current system context will be provided with each message.
Use the available tools to gather information and perform actions.`;
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.redis) {
      await this.redis.quit().catch(() => this.redis!.disconnect());
      this.redis = null;
    }

    this.connected = false;
    logger.info('[ConversationMemory] Disconnected from Redis');
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
const conversationMemory = new ConversationMemory();

export default conversationMemory;
