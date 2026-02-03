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

import logger from '../shared/logger';
import { EventEmitter } from 'events';

export interface EnhancedMessage<T = any> {
    type: string;
    timestamp: number;
    source: string;
    data: T;
    id: string;
    correlationId?: string;
    causationId?: string; // Chain of message IDs
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
export enum CircuitBreakerState {
    CLOSED = 'CLOSED',     // Normal operation
    OPEN = 'OPEN',         // Failing, reject requests
    HALF_OPEN = 'HALF_OPEN' // Testing if recovered
}

/**
 * Circuit Breaker for message handlers
 */
export class MessageCircuitBreaker {
    private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
    private failureCount: number = 0;
    private lastFailureTime: number = 0;
    private successCount: number = 0;

    constructor(
        private name: string,
        private threshold: number = 5,
        private timeoutMs: number = 60000,
        private halfOpenAttempts: number = 3
    ) {}

    execute<T>(fn: () => T): T | null {
        if (this.state === CircuitBreakerState.OPEN) {
            if (Date.now() - this.lastFailureTime > this.timeoutMs) {
                this.state = CircuitBreakerState.HALF_OPEN;
                this.successCount = 0;
                logger.info(`[CircuitBreaker] ${this.name} entering HALF_OPEN state`);
            } else {
                return null; // Circuit is open, reject execution
            }
        }

        try {
            const result = fn();

            if (this.state === CircuitBreakerState.HALF_OPEN) {
                this.successCount++;
                if (this.successCount >= this.halfOpenAttempts) {
                    this.state = CircuitBreakerState.CLOSED;
                    this.failureCount = 0;
                    logger.info(`[CircuitBreaker] ${this.name} recovered, entering CLOSED state`);
                }
            }

            return result;
        } catch (error) {
            this.failureCount++;
            this.lastFailureTime = Date.now();

            if (this.failureCount >= this.threshold) {
                this.state = CircuitBreakerState.OPEN;
                logger.error(`[CircuitBreaker] ${this.name} tripped to OPEN state after ${this.failureCount} failures`);
            }

            throw error;
        }
    }

    getState(): CircuitBreakerState {
        return this.state;
    }

    getFailureCount(): number {
        return this.failureCount;
    }

    reset(): void {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = 0;
        this.successCount = 0;
        logger.info(`[CircuitBreaker] ${this.name} reset`);
    }
}

/**
 * Enhanced Message Bus with circuit breakers, dead letter queue, and replay
 */
export class EnhancedMessageBus extends EventEmitter {
    private subscriptions: Map<string, Set<Subscription>> = new Map();
    private circuitBreakers: Map<string, MessageCircuitBreaker> = new Map();
    private deadLetterQueue: DeadLetterMessage[] = [];
    private messageHistory: EnhancedMessage[] = [];
    private serviceId: string;
    private maxHistorySize: number = 10000;

    constructor() {
        super();
        this.serviceId = `service-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }

    /**
     * Publish a message to a channel
     */
    async publish<T>(
        channel: string,
        data: T,
        options?: {
            correlationId?: string;
            causationId?: string;
            metadata?: Record<string, any>;
            store?: boolean; // Whether to store in history
        }
    ): Promise<string> {
        const message: EnhancedMessage<T> = {
            type: channel,
            timestamp: Date.now(),
            source: this.serviceId,
            data,
            id: this.generateMessageId(),
            correlationId: options?.correlationId,
            causationId: options?.causationId,
            metadata: options?.metadata,
        };

        // Store in history if enabled
        if (options?.store !== false) {
            this.addToHistory(message);
        }

        // Emit to local subscribers
        await this.emitToSubscribers(channel, message);

        // Also emit as event for compatibility
        this.emit(channel, message);

        return message.id;
    }

    /**
     * Subscribe to a channel with optional filter and circuit breaker
     */
    subscribe<T>(
        channel: string,
        handler: MessageHandler<T>,
        options?: {
            filter?: (message: EnhancedMessage<T>) => boolean;
            circuitBreaker?: { name: string; threshold?: number; timeoutMs?: number };
        }
    ): () => void {
        const subscription: Subscription = {
            channel,
            handler: handler as MessageHandler,
            filter: options?.filter,
            circuitBreaker: options?.circuitBreaker?.name,
        };

        // Create circuit breaker if specified
        if (options?.circuitBreaker) {
            if (!this.circuitBreakers.has(options.circuitBreaker.name)) {
                this.circuitBreakers.set(
                    options.circuitBreaker.name,
                    new MessageCircuitBreaker(
                        options.circuitBreaker.name,
                        options.circuitBreaker.threshold,
                        options.circuitBreaker.timeoutMs
                    )
                );
            }
        }

        if (!this.subscriptions.has(channel)) {
            this.subscriptions.set(channel, new Set());
        }

        this.subscriptions.get(channel)!.add(subscription);

        // Return unsubscribe function
        return () => {
            this.unsubscribe(channel, subscription);
        };
    }

    /**
     * Unsubscribe from a channel
     */
    private unsubscribe(channel: string, subscription: Subscription): void {
        const subs = this.subscriptions.get(channel);
        if (subs) {
            subs.delete(subscription);
            if (subs.size === 0) {
                this.subscriptions.delete(channel);
            }
        }
    }

    /**
     * Emit message to all subscribers of a channel
     */
    private async emitToSubscribers(channel: string, message: EnhancedMessage): Promise<void> {
        const subs = this.subscriptions.get(channel);
        if (!subs) return;

        for (const sub of subs) {
            // Check filter
            if (sub.filter && !sub.filter(message)) {
                continue;
            }

            // Check circuit breaker
            if (sub.circuitBreaker) {
                const breaker = this.circuitBreakers.get(sub.circuitBreaker);
                if (breaker && breaker.getState() === CircuitBreakerState.OPEN) {
                    this.addToDeadLetter(message, sub, 'Circuit breaker open');
                    continue;
                }
            }

            try {
                // Execute handler with circuit breaker if configured
                if (sub.circuitBreaker) {
                    const breaker = this.circuitBreakers.get(sub.circuitBreaker);
                    breaker?.execute(() => sub.handler(message));
                } else {
                    await Promise.resolve(sub.handler(message));
                }
            } catch (error) {
                logger.error(`[MessageBus] Handler error for ${channel}:`, error);
                this.addToDeadLetter(message, sub, String(error));
            }
        }
    }

    /**
     * Add message to dead letter queue
     */
    private addToDeadLetter(message: EnhancedMessage, subscription: Subscription, error: string): void {
        const existing = this.deadLetterQueue.find(
            d => d.originalMessage.id === message.id && d.retryCount < 3
        );

        if (existing) {
            existing.retryCount++;
        } else {
            this.deadLetterQueue.push({
                originalMessage: message,
                error,
                timestamp: Date.now(),
                retryCount: 0,
            });
        }

        // Keep only last 1000 dead letters
        if (this.deadLetterQueue.length > 1000) {
            this.deadLetterQueue.shift();
        }
    }

    /**
     * Get dead letter queue
     */
    getDeadLetterQueue(): DeadLetterMessage[] {
        return [...this.deadLetterQueue];
    }

    /**
     * Retry dead letter messages
     */
    async retryDeadLetters(limit: number = 10): Promise<void> {
        const toRetry = this.deadLetterQueue.splice(0, limit);

        for (const deadLetter of toRetry) {
            const channel = deadLetter.originalMessage.type;
            await this.emitToSubscribers(channel, deadLetter.originalMessage);
        }
    }

    /**
     * Add message to history
     */
    private addToHistory(message: EnhancedMessage): void {
        this.messageHistory.push(message);

        if (this.messageHistory.length > this.maxHistorySize) {
            this.messageHistory.shift();
        }
    }

    /**
     * Get message history for a channel
     */
    getHistory(channel?: string, limit: number = 100): EnhancedMessage[] {
        let history = this.messageHistory;

        if (channel) {
            history = history.filter(m => m.type === channel);
        }

        return history.slice(-limit);
    }

    /**
     * Replay messages from history
     */
    async replayHistory(channel?: string, since?: number): Promise<void> {
        let messages = this.messageHistory;

        if (channel) {
            messages = messages.filter(m => m.type === channel);
        }

        if (since) {
            messages = messages.filter(m => m.timestamp >= since);
        }

        for (const message of messages) {
            await this.emitToSubscribers(message.type, message);
        }

        logger.info(`[MessageBus] Replayed ${messages.length} messages`);
    }

    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus(): Map<string, { state: CircuitBreakerState; failureCount: number }> {
        const status = new Map();

        for (const [name, breaker] of this.circuitBreakers) {
            status.set(name, {
                state: breaker.getState(),
                failureCount: breaker.getFailureCount(),
            });
        }

        return status;
    }

    /**
     * Reset a circuit breaker
     */
    resetCircuitBreaker(name: string): void {
        const breaker = this.circuitBreakers.get(name);
        if (breaker) {
            breaker.reset();
        }
    }

    /**
     * Generate unique message ID
     */
    private generateMessageId(): string {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }

    /**
     * Clear all state
     */
    clear(): void {
        this.subscriptions.clear();
        this.deadLetterQueue = [];
        this.messageHistory = [];
        logger.info('[MessageBus] Cleared all state');
    }

    /**
     * Get bus statistics
     */
    getStatistics(): {
        subscriptions: number;
        channels: number;
        deadLetters: number;
        historySize: number;
        circuitBreakers: number;
    } {
        return {
            subscriptions: Array.from(this.subscriptions.values())
                .reduce((sum, set) => sum + set.size, 0),
            channels: this.subscriptions.size,
            deadLetters: this.deadLetterQueue.length,
            historySize: this.messageHistory.length,
            circuitBreakers: this.circuitBreakers.size,
        };
    }
}

// Singleton instance
const enhancedMessageBus = new EnhancedMessageBus();

export default enhancedMessageBus;
