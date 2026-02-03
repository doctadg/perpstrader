/**
 * Enhanced Message Bus
 *
 * Extends the existing message bus with Nautilus-inspired features:
 * - Event sourcing support
 * - Correlation tracking
 * - Dead letter queue
 * - Circuit breaker integration
 * - Message replay capability
 */
import { EventEmitter } from 'events';
export interface EnhancedMessage<T = any> {
    type: string;
    timestamp: number;
    source: string;
    data: T;
    id: string;
    correlationId?: string;
    causationId?: string;
    metadata?: Record<string, any>;
}
export interface MessageHandler<T = any> {
    (message: EnhancedMessage<T>): void | Promise<void>;
}
export interface Subscription {
    channel: string;
    handler: MessageHandler;
    filter?: (message: EnhancedMessage) => boolean;
    circuitBreaker?: string;
}
export interface DeadLetterMessage {
    originalMessage: EnhancedMessage;
    error: string;
    timestamp: number;
    retryCount: number;
}
/**
 * Circuit Breaker States
 */
export declare enum CircuitBreakerState {
    CLOSED = "CLOSED",// Normal operation
    OPEN = "OPEN",// Failing, reject requests
    HALF_OPEN = "HALF_OPEN"
}
/**
 * Circuit Breaker for message handlers
 */
export declare class MessageCircuitBreaker {
    private name;
    private threshold;
    private timeoutMs;
    private halfOpenAttempts;
    private state;
    private failureCount;
    private lastFailureTime;
    private successCount;
    constructor(name: string, threshold?: number, timeoutMs?: number, halfOpenAttempts?: number);
    execute<T>(fn: () => T): T | null;
    getState(): CircuitBreakerState;
    getFailureCount(): number;
    reset(): void;
}
/**
 * Enhanced Message Bus with circuit breakers, dead letter queue, and replay
 */
export declare class EnhancedMessageBus extends EventEmitter {
    private subscriptions;
    private circuitBreakers;
    private deadLetterQueue;
    private messageHistory;
    private serviceId;
    private maxHistorySize;
    constructor();
    /**
     * Publish a message to a channel
     */
    publish<T>(channel: string, data: T, options?: {
        correlationId?: string;
        causationId?: string;
        metadata?: Record<string, any>;
        store?: boolean;
    }): Promise<string>;
    /**
     * Subscribe to a channel with optional filter and circuit breaker
     */
    subscribe<T>(channel: string, handler: MessageHandler<T>, options?: {
        filter?: (message: EnhancedMessage<T>) => boolean;
        circuitBreaker?: {
            name: string;
            threshold?: number;
            timeoutMs?: number;
        };
    }): () => void;
    /**
     * Unsubscribe from a channel
     */
    private unsubscribe;
    /**
     * Emit message to all subscribers of a channel
     */
    private emitToSubscribers;
    /**
     * Add message to dead letter queue
     */
    private addToDeadLetter;
    /**
     * Get dead letter queue
     */
    getDeadLetterQueue(): DeadLetterMessage[];
    /**
     * Retry dead letter messages
     */
    retryDeadLetters(limit?: number): Promise<void>;
    /**
     * Add message to history
     */
    private addToHistory;
    /**
     * Get message history for a channel
     */
    getHistory(channel?: string, limit?: number): EnhancedMessage[];
    /**
     * Replay messages from history
     */
    replayHistory(channel?: string, since?: number): Promise<void>;
    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus(): Map<string, {
        state: CircuitBreakerState;
        failureCount: number;
    }>;
    /**
     * Reset a circuit breaker
     */
    resetCircuitBreaker(name: string): void;
    /**
     * Generate unique message ID
     */
    private generateMessageId;
    /**
     * Clear all state
     */
    clear(): void;
    /**
     * Get bus statistics
     */
    getStatistics(): {
        subscriptions: number;
        channels: number;
        deadLetters: number;
        historySize: number;
        circuitBreakers: number;
    };
}
declare const enhancedMessageBus: EnhancedMessageBus;
export default enhancedMessageBus;
//# sourceMappingURL=enhanced-message-bus.d.ts.map