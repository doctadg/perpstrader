"use strict";
// Message Bus Service - Redis Pub/Sub for PerpsTrader
// Provides real-time event communication between all services
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageBus = exports.Channel = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const events_1 = require("events");
const logger_1 = __importDefault(require("./logger"));
// Message Bus Channels
var Channel;
(function (Channel) {
    // Trading cycle events
    Channel["CYCLE_START"] = "trading:cycle:start";
    Channel["CYCLE_COMPLETE"] = "trading:cycle:complete";
    Channel["CYCLE_ERROR"] = "trading:cycle:error";
    Channel["CYCLE_STEP"] = "trading:cycle:step";
    // Market data
    Channel["MARKET_DATA"] = "market:data";
    Channel["MARKET_SNAPSHOT"] = "market:snapshot";
    Channel["ORDER_BOOK_UPDATE"] = "market:orderbook";
    // News events
    Channel["NEWS_SCRAPE_START"] = "news:scrape:start";
    Channel["NEWS_SCRAPE_COMPLETE"] = "news:scrape:complete";
    Channel["NEWS_CATEGORIZED"] = "news:categorized";
    Channel["NEWS_CLUSTERED"] = "news:clustered";
    Channel["NEWS_HOT_CLUSTERS"] = "news:hot";
    // NEW ENHANCEMENT CHANNELS:
    Channel["NEWS_ANOMALY"] = "news:anomaly";
    Channel["NEWS_PREDICTION"] = "news:prediction";
    Channel["NEWS_CROSS_CATEGORY"] = "news:cross_category";
    Channel["ENTITY_TRENDING"] = "entity:trending";
    Channel["USER_ENGAGEMENT"] = "user:engagement";
    Channel["QUALITY_METRIC"] = "quality:metric";
    // Trading events
    Channel["SIGNAL_GENERATED"] = "trading:signal";
    Channel["STRATEGY_SELECTED"] = "trading:strategy:selected";
    Channel["BACKTEST_COMPLETE"] = "trading:backtest:complete";
    // Execution events
    Channel["EXECUTION_SUBMIT"] = "execution:submit";
    Channel["EXECUTION_FILLED"] = "execution:filled";
    Channel["EXECUTION_FAILED"] = "execution:failed";
    Channel["EXECUTION_CANCELLED"] = "execution:cancelled";
    // Position events
    Channel["POSITION_OPENED"] = "position:opened";
    Channel["POSITION_CLOSED"] = "position:closed";
    Channel["POSITION_UPDATED"] = "position:updated";
    // Risk events
    Channel["RISK_LIMIT_BREACH"] = "risk:limit:breach";
    Channel["CIRCUIT_BREAKER_OPEN"] = "circuit:breaker:open";
    Channel["CIRCUIT_BREAKER_CLOSED"] = "circuit:breaker:closed";
    // System events
    Channel["HEALTH_CHECK"] = "system:health";
    Channel["HEARTBEAT"] = "system:heartbeat";
    Channel["ERROR"] = "system:error";
    // Safekeeping fund events
    Channel["SAFEKEEPING_CYCLE_START"] = "safekeeping:cycle:start";
    Channel["SAFEKEEPING_CYCLE_COMPLETE"] = "safekeeping:cycle:complete";
    Channel["SAFEKEEPING_CYCLE_STOP"] = "safekeeping:cycle:stop";
    Channel["SAFEKEEPING_CYCLE_ERROR"] = "safekeeping:cycle:error";
    Channel["SAFEKEEPING_EXECUTION_SUBMIT"] = "safekeeping:execution:submit";
    Channel["SAFEKEEPING_EXECUTION_COMPLETE"] = "safekeeping:execution:complete";
    Channel["SAFEKEEPING_EXECUTION_FAILED"] = "safekeeping:execution:failed";
    Channel["SAFEKEEPING_POSITION_OPENED"] = "safekeeping:position:opened";
    Channel["SAFEKEEPING_POSITION_CLOSED"] = "safekeeping:position:closed";
    Channel["SAFEKEEPING_EMERGENCY_HALT"] = "safekeeping:emergency:halt";
    Channel["SAFEKEEPING_ANOMALY_DETECTED"] = "safekeeping:anomaly:detected";
})(Channel || (exports.Channel = Channel = {}));
class MessageBus extends events_1.EventEmitter {
    publisher = null;
    subscriber = null;
    subscriptions = new Map();
    isConnected = false; // Made public for external access
    reconnectTimer = null;
    serviceId;
    serviceName;
    // Configuration
    host;
    port;
    password;
    db;
    constructor() {
        super();
        this.serviceId = `${process.env.SERVICE_NAME || 'unknown'}-${process.pid}`;
        this.serviceName = process.env.SERVICE_NAME || 'unknown';
        // Load config from environment with defaults
        this.host = process.env.REDIS_HOST || '127.0.0.1';
        this.port = Number.parseInt(process.env.REDIS_PORT || '6380', 10);
        this.password = process.env.REDIS_PASSWORD;
        this.db = Number.parseInt(process.env.REDIS_DB || '0', 10);
    }
    /**
     * Initialize Redis connections
     */
    async connect() {
        if (this.isConnected) {
            logger_1.default.warn('[MessageBus] Already connected');
            return;
        }
        try {
            // Publisher connection (optimised for sending)
            this.publisher = new ioredis_1.default({
                host: this.host,
                port: this.port,
                password: this.password,
                db: this.db,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    logger_1.default.warn(`[MessageBus] Publisher reconnect attempt ${times}, delay ${delay}ms`);
                    return delay;
                },
                maxRetriesPerRequest: 3,
                lazyConnect: true,
            });
            // Subscriber connection (optimised for receiving)
            this.subscriber = new ioredis_1.default({
                host: this.host,
                port: this.port,
                password: this.password,
                db: this.db,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    logger_1.default.warn(`[MessageBus] Subscriber reconnect attempt ${times}, delay ${delay}ms`);
                    return delay;
                },
                maxRetriesPerRequest: null, // Infinite retry for subscriber
                lazyConnect: true,
            });
            // Set up event handlers
            this.setupEventHandlers();
            // Connect
            await Promise.all([
                this.publisher.connect(),
                this.subscriber.connect(),
            ]);
            // Test connection
            await this.publisher.ping();
            await this.subscriber.ping();
            this.isConnected = true;
            logger_1.default.info(`[MessageBus] Connected to redis://${this.host}:${this.port}/${this.db}`);
            // Subscribe to all registered channels
            await this.resubscribeAll();
            // Emit connection event
            this.emit('connected');
        }
        catch (error) {
            logger_1.default.error('[MessageBus] Failed to connect:', error);
            throw error;
        }
    }
    /**
     * Set up Redis event handlers
     */
    setupEventHandlers() {
        if (!this.publisher || !this.subscriber)
            return;
        // Publisher events
        this.publisher.on('connect', () => {
            logger_1.default.debug('[MessageBus] Publisher connected');
        });
        this.publisher.on('error', (error) => {
            logger_1.default.error('[MessageBus] Publisher error:', error);
        });
        // Subscriber events
        this.subscriber.on('connect', () => {
            logger_1.default.debug('[MessageBus] Subscriber connected');
        });
        this.subscriber.on('error', (error) => {
            logger_1.default.error('[MessageBus] Subscriber error:', error);
        });
        // Message handler
        this.subscriber.on('message', (channel, data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(channel, message);
            }
            catch (error) {
                logger_1.default.error(`[MessageBus] Failed to parse message from ${channel}:`, error);
            }
        });
    }
    /**
     * Handle incoming message
     */
    handleMessage(channel, message) {
        // Ignore own messages (prevents loops)
        if (message.source === this.serviceId) {
            return;
        }
        // Emit to local subscribers
        const callbacks = this.subscriptions.get(channel);
        if (callbacks) {
            for (const callback of callbacks) {
                // Execute asynchronously, don't block
                const result = callback(message);
                if (result instanceof Promise) {
                    result.catch((error) => {
                        logger_1.default.error(`[MessageBus] Callback error for ${channel}:`, error);
                    });
                }
            }
        }
        // Also emit as event for legacy compatibility
        this.emit(channel, message);
    }
    /**
     * Resubscribe to all channels after reconnection
     */
    async resubscribeAll() {
        if (!this.subscriber || this.subscriptions.size === 0)
            return;
        const channels = Array.from(this.subscriptions.keys());
        if (channels.length > 0) {
            await this.subscriber.subscribe(...channels);
            logger_1.default.info(`[MessageBus] Resubscribed to ${channels.length} channels`);
        }
    }
    /**
     * Publish a message to a channel
     */
    async publish(channel, data, correlationId) {
        if (!this.publisher) {
            logger_1.default.warn('[MessageBus] Cannot publish: not connected');
            return false;
        }
        try {
            const message = {
                type: channel,
                timestamp: new Date(),
                source: this.serviceId,
                data,
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                correlationId,
            };
            await this.publisher.publish(channel, JSON.stringify(message));
            return true;
        }
        catch (error) {
            logger_1.default.error(`[MessageBus] Failed to publish to ${channel}:`, error);
            return false;
        }
    }
    /**
     * Subscribe to a channel
     */
    async subscribe(channel, callback) {
        const channelStr = channel;
        // Add to local subscriptions
        if (!this.subscriptions.has(channelStr)) {
            this.subscriptions.set(channelStr, new Set());
        }
        this.subscriptions.get(channelStr).add(callback);
        // Subscribe to Redis if connected
        if (this.subscriber && this.isConnected) {
            await this.subscriber.subscribe(channelStr);
            logger_1.default.debug(`[MessageBus] Subscribed to ${channelStr}`);
        }
    }
    /**
     * Unsubscribe from a channel
     */
    async unsubscribe(channel, callback) {
        const channelStr = channel;
        const callbacks = this.subscriptions.get(channelStr);
        if (!callbacks)
            return;
        if (callback) {
            callbacks.delete(callback);
        }
        else {
            callbacks.clear();
        }
        // Unsubscribe from Redis if no more callbacks
        if (callbacks.size === 0) {
            this.subscriptions.delete(channelStr);
            if (this.subscriber && this.isConnected) {
                await this.subscriber.unsubscribe(channelStr);
                logger_1.default.debug(`[MessageBus] Unsubscribed from ${channelStr}`);
            }
        }
    }
    /**
     * Disconnect from Redis
     */
    async disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        const disconnectPromises = [];
        if (this.publisher) {
            disconnectPromises.push(this.publisher.quit().catch(() => this.publisher.disconnect()).then(() => {
                this.publisher = null;
            }));
        }
        if (this.subscriber) {
            disconnectPromises.push(this.subscriber.quit().catch(() => this.subscriber.disconnect()).then(() => {
                this.subscriber = null;
            }));
        }
        await Promise.all(disconnectPromises);
        this.isConnected = false;
        logger_1.default.info('[MessageBus] Disconnected');
    }
    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            host: this.host,
            port: this.port,
            subscriptions: this.subscriptions.size,
        };
    }
    /**
     * Publish and wait for response (RPC pattern)
     */
    async request(channel, data, timeout = 5000) {
        const channelStr = channel;
        const correlationId = `${this.serviceId}-${Date.now()}`;
        const responseChannel = `${channelStr}:response`;
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                void this.unsubscribe(responseChannel, responseHandler);
                resolve(null);
            }, timeout);
            const responseHandler = (message) => {
                if (message.correlationId === correlationId) {
                    clearTimeout(timer);
                    void this.unsubscribe(responseChannel, responseHandler);
                    resolve(message.data);
                }
            };
            void this.subscribe(responseChannel, responseHandler);
            void this.publish(channel, data, correlationId);
        });
    }
}
// Singleton instance
exports.messageBus = new MessageBus();
// Auto-connect on import in production
if (process.env.NODE_ENV === 'production') {
    exports.messageBus.connect().catch((error) => {
        logger_1.default.error('[MessageBus] Auto-connect failed:', error);
    });
}
exports.default = exports.messageBus;
//# sourceMappingURL=message-bus.js.map