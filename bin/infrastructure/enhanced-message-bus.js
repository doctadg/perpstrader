"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedMessageBus = exports.MessageCircuitBreaker = exports.CircuitBreakerState = void 0;
const logger_1 = __importDefault(require("../shared/logger"));
const events_1 = require("events");
/**
 * Circuit Breaker States
 */
var CircuitBreakerState;
(function (CircuitBreakerState) {
    CircuitBreakerState["CLOSED"] = "CLOSED";
    CircuitBreakerState["OPEN"] = "OPEN";
    CircuitBreakerState["HALF_OPEN"] = "HALF_OPEN"; // Testing if recovered
})(CircuitBreakerState || (exports.CircuitBreakerState = CircuitBreakerState = {}));
/**
 * Circuit Breaker for message handlers
 */
class MessageCircuitBreaker {
    name;
    threshold;
    timeoutMs;
    halfOpenAttempts;
    state = CircuitBreakerState.CLOSED;
    failureCount = 0;
    lastFailureTime = 0;
    successCount = 0;
    constructor(name, threshold = 5, timeoutMs = 60000, halfOpenAttempts = 3) {
        this.name = name;
        this.threshold = threshold;
        this.timeoutMs = timeoutMs;
        this.halfOpenAttempts = halfOpenAttempts;
    }
    execute(fn) {
        if (this.state === CircuitBreakerState.OPEN) {
            if (Date.now() - this.lastFailureTime > this.timeoutMs) {
                this.state = CircuitBreakerState.HALF_OPEN;
                this.successCount = 0;
                logger_1.default.info(`[CircuitBreaker] ${this.name} entering HALF_OPEN state`);
            }
            else {
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
                    logger_1.default.info(`[CircuitBreaker] ${this.name} recovered, entering CLOSED state`);
                }
            }
            return result;
        }
        catch (error) {
            this.failureCount++;
            this.lastFailureTime = Date.now();
            if (this.failureCount >= this.threshold) {
                this.state = CircuitBreakerState.OPEN;
                logger_1.default.error(`[CircuitBreaker] ${this.name} tripped to OPEN state after ${this.failureCount} failures`);
            }
            throw error;
        }
    }
    getState() {
        return this.state;
    }
    getFailureCount() {
        return this.failureCount;
    }
    reset() {
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.lastFailureTime = 0;
        this.successCount = 0;
        logger_1.default.info(`[CircuitBreaker] ${this.name} reset`);
    }
}
exports.MessageCircuitBreaker = MessageCircuitBreaker;
/**
 * Enhanced Message Bus with circuit breakers, dead letter queue, and replay
 */
class EnhancedMessageBus extends events_1.EventEmitter {
    subscriptions = new Map();
    circuitBreakers = new Map();
    deadLetterQueue = [];
    messageHistory = [];
    serviceId;
    maxHistorySize = 10000;
    constructor() {
        super();
        this.serviceId = `service-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    /**
     * Publish a message to a channel
     */
    async publish(channel, data, options) {
        const message = {
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
    subscribe(channel, handler, options) {
        const subscription = {
            channel,
            handler: handler,
            filter: options?.filter,
            circuitBreaker: options?.circuitBreaker?.name,
        };
        // Create circuit breaker if specified
        if (options?.circuitBreaker) {
            if (!this.circuitBreakers.has(options.circuitBreaker.name)) {
                this.circuitBreakers.set(options.circuitBreaker.name, new MessageCircuitBreaker(options.circuitBreaker.name, options.circuitBreaker.threshold, options.circuitBreaker.timeoutMs));
            }
        }
        if (!this.subscriptions.has(channel)) {
            this.subscriptions.set(channel, new Set());
        }
        this.subscriptions.get(channel).add(subscription);
        // Return unsubscribe function
        return () => {
            this.unsubscribe(channel, subscription);
        };
    }
    /**
     * Unsubscribe from a channel
     */
    unsubscribe(channel, subscription) {
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
    async emitToSubscribers(channel, message) {
        const subs = this.subscriptions.get(channel);
        if (!subs)
            return;
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
                }
                else {
                    await Promise.resolve(sub.handler(message));
                }
            }
            catch (error) {
                logger_1.default.error(`[MessageBus] Handler error for ${channel}:`, error);
                this.addToDeadLetter(message, sub, String(error));
            }
        }
    }
    /**
     * Add message to dead letter queue
     */
    addToDeadLetter(message, subscription, error) {
        const existing = this.deadLetterQueue.find(d => d.originalMessage.id === message.id && d.retryCount < 3);
        if (existing) {
            existing.retryCount++;
        }
        else {
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
    getDeadLetterQueue() {
        return [...this.deadLetterQueue];
    }
    /**
     * Retry dead letter messages
     */
    async retryDeadLetters(limit = 10) {
        const toRetry = this.deadLetterQueue.splice(0, limit);
        for (const deadLetter of toRetry) {
            const channel = deadLetter.originalMessage.type;
            await this.emitToSubscribers(channel, deadLetter.originalMessage);
        }
    }
    /**
     * Add message to history
     */
    addToHistory(message) {
        this.messageHistory.push(message);
        if (this.messageHistory.length > this.maxHistorySize) {
            this.messageHistory.shift();
        }
    }
    /**
     * Get message history for a channel
     */
    getHistory(channel, limit = 100) {
        let history = this.messageHistory;
        if (channel) {
            history = history.filter(m => m.type === channel);
        }
        return history.slice(-limit);
    }
    /**
     * Replay messages from history
     */
    async replayHistory(channel, since) {
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
        logger_1.default.info(`[MessageBus] Replayed ${messages.length} messages`);
    }
    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus() {
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
    resetCircuitBreaker(name) {
        const breaker = this.circuitBreakers.get(name);
        if (breaker) {
            breaker.reset();
        }
    }
    /**
     * Generate unique message ID
     */
    generateMessageId() {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }
    /**
     * Clear all state
     */
    clear() {
        this.subscriptions.clear();
        this.deadLetterQueue = [];
        this.messageHistory = [];
        logger_1.default.info('[MessageBus] Cleared all state');
    }
    /**
     * Get bus statistics
     */
    getStatistics() {
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
exports.EnhancedMessageBus = EnhancedMessageBus;
// Singleton instance
const enhancedMessageBus = new EnhancedMessageBus();
exports.default = enhancedMessageBus;
//# sourceMappingURL=enhanced-message-bus.js.map