import { EventEmitter } from 'events';
export declare enum Channel {
    CYCLE_START = "trading:cycle:start",
    CYCLE_COMPLETE = "trading:cycle:complete",
    CYCLE_ERROR = "trading:cycle:error",
    CYCLE_STEP = "trading:cycle:step",
    MARKET_DATA = "market:data",
    MARKET_SNAPSHOT = "market:snapshot",
    ORDER_BOOK_UPDATE = "market:orderbook",
    NEWS_SCRAPE_START = "news:scrape:start",
    NEWS_SCRAPE_COMPLETE = "news:scrape:complete",
    NEWS_CATEGORIZED = "news:categorized",
    NEWS_CLUSTERED = "news:clustered",
    NEWS_HOT_CLUSTERS = "news:hot",
    NEWS_ANOMALY = "news:anomaly",// Anomaly detected
    NEWS_PREDICTION = "news:prediction",// Heat prediction generated
    NEWS_CROSS_CATEGORY = "news:cross_category",// Cross-category link created
    ENTITY_TRENDING = "entity:trending",// Entity trending update
    USER_ENGAGEMENT = "user:engagement",// User engagement recorded
    QUALITY_METRIC = "quality:metric",// Clustering quality metric
    SIGNAL_GENERATED = "trading:signal",
    STRATEGY_SELECTED = "trading:strategy:selected",
    BACKTEST_COMPLETE = "trading:backtest:complete",
    EXECUTION_SUBMIT = "execution:submit",
    EXECUTION_FILLED = "execution:filled",
    EXECUTION_FAILED = "execution:failed",
    EXECUTION_CANCELLED = "execution:cancelled",
    POSITION_OPENED = "position:opened",
    POSITION_CLOSED = "position:closed",
    POSITION_UPDATED = "position:updated",
    RISK_LIMIT_BREACH = "risk:limit:breach",
    CIRCUIT_BREAKER_OPEN = "circuit:breaker:open",
    CIRCUIT_BREAKER_CLOSED = "circuit:breaker:closed",
    HEALTH_CHECK = "system:health",
    HEARTBEAT = "system:heartbeat",
    ERROR = "system:error",
    SAFEKEEPING_CYCLE_START = "safekeeping:cycle:start",
    SAFEKEEPING_CYCLE_COMPLETE = "safekeeping:cycle:complete",
    SAFEKEEPING_CYCLE_STOP = "safekeeping:cycle:stop",
    SAFEKEEPING_CYCLE_ERROR = "safekeeping:cycle:error",
    SAFEKEEPING_EXECUTION_SUBMIT = "safekeeping:execution:submit",
    SAFEKEEPING_EXECUTION_COMPLETE = "safekeeping:execution:complete",
    SAFEKEEPING_EXECUTION_FAILED = "safekeeping:execution:failed",
    SAFEKEEPING_POSITION_OPENED = "safekeeping:position:opened",
    SAFEKEEPING_POSITION_CLOSED = "safekeeping:position:closed",
    SAFEKEEPING_EMERGENCY_HALT = "safekeeping:emergency:halt",
    SAFEKEEPING_ANOMALY_DETECTED = "safekeeping:anomaly:detected"
}
export interface Message<T = any> {
    type: string;
    timestamp: Date;
    source: string;
    data: T;
    id?: string;
    correlationId?: string;
}
type SubscriptionCallback<T = any> = (message: Message<T>) => void | Promise<void>;
declare class MessageBus extends EventEmitter {
    private publisher;
    private subscriber;
    private subscriptions;
    isConnected: boolean;
    private reconnectTimer;
    private serviceId;
    private serviceName;
    private host;
    private port;
    private password?;
    private db;
    constructor();
    /**
     * Initialize Redis connections
     */
    connect(): Promise<void>;
    /**
     * Set up Redis event handlers
     */
    private setupEventHandlers;
    /**
     * Handle incoming message
     */
    private handleMessage;
    /**
     * Resubscribe to all channels after reconnection
     */
    private resubscribeAll;
    /**
     * Publish a message to a channel
     */
    publish<T>(channel: string | Channel, data: T, correlationId?: string): Promise<boolean>;
    /**
     * Subscribe to a channel
     */
    subscribe<T>(channel: string | Channel, callback: SubscriptionCallback<T>): Promise<void>;
    /**
     * Unsubscribe from a channel
     */
    unsubscribe(channel: string | Channel, callback?: SubscriptionCallback): Promise<void>;
    /**
     * Disconnect from Redis
     */
    disconnect(): Promise<void>;
    /**
     * Get connection status
     */
    getStatus(): {
        connected: boolean;
        host: string;
        port: number;
        subscriptions: number;
    };
    /**
     * Publish and wait for response (RPC pattern)
     */
    request<T, R = any>(channel: string | Channel, data: T, timeout?: number): Promise<R | null>;
}
export declare const messageBus: MessageBus;
export default messageBus;
//# sourceMappingURL=message-bus.d.ts.map