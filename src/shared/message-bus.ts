// Message Bus Service - Redis Pub/Sub for PerpsTrader
// Provides real-time event communication between all services

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import logger from './logger';

// Message Bus Channels
export enum Channel {
  // Trading cycle events
  CYCLE_START = 'trading:cycle:start',
  CYCLE_COMPLETE = 'trading:cycle:complete',
  CYCLE_ERROR = 'trading:cycle:error',
  CYCLE_STEP = 'trading:cycle:step',

  // Market data
  MARKET_DATA = 'market:data',
  MARKET_SNAPSHOT = 'market:snapshot',
  ORDER_BOOK_UPDATE = 'market:orderbook',

  // News events
  NEWS_SCRAPE_START = 'news:scrape:start',
  NEWS_SCRAPE_COMPLETE = 'news:scrape:complete',
  NEWS_CATEGORIZED = 'news:categorized',
  NEWS_CLUSTERED = 'news:clustered',
  NEWS_HOT_CLUSTERS = 'news:hot',

  // NEW ENHANCEMENT CHANNELS:
  NEWS_ANOMALY = 'news:anomaly',           // Anomaly detected
  NEWS_PREDICTION = 'news:prediction',       // Heat prediction generated
  NEWS_CROSS_CATEGORY = 'news:cross_category', // Cross-category link created
  ENTITY_TRENDING = 'entity:trending',       // Entity trending update
  USER_ENGAGEMENT = 'user:engagement',       // User engagement recorded
  QUALITY_METRIC = 'quality:metric',         // Clustering quality metric

  // Trading events
  SIGNAL_GENERATED = 'trading:signal',
  STRATEGY_SELECTED = 'trading:strategy:selected',
  BACKTEST_COMPLETE = 'trading:backtest:complete',

  // Execution events
  EXECUTION_SUBMIT = 'execution:submit',
  EXECUTION_FILLED = 'execution:filled',
  EXECUTION_FAILED = 'execution:failed',
  EXECUTION_CANCELLED = 'execution:cancelled',

  // Position events
  POSITION_OPENED = 'position:opened',
  POSITION_CLOSED = 'position:closed',
  POSITION_UPDATED = 'position:updated',

  // Risk events
  RISK_LIMIT_BREACH = 'risk:limit:breach',
  CIRCUIT_BREAKER_OPEN = 'circuit:breaker:open',
  CIRCUIT_BREAKER_CLOSED = 'circuit:breaker:closed',

  // System events
  HEALTH_CHECK = 'system:health',
  HEARTBEAT = 'system:heartbeat',
  ERROR = 'system:error',

  // Safekeeping fund events
  SAFEKEEPING_CYCLE_START = 'safekeeping:cycle:start',
  SAFEKEEPING_CYCLE_COMPLETE = 'safekeeping:cycle:complete',
  SAFEKEEPING_CYCLE_STOP = 'safekeeping:cycle:stop',
  SAFEKEEPING_CYCLE_ERROR = 'safekeeping:cycle:error',
  SAFEKEEPING_EXECUTION_SUBMIT = 'safekeeping:execution:submit',
  SAFEKEEPING_EXECUTION_COMPLETE = 'safekeeping:execution:complete',
  SAFEKEEPING_EXECUTION_FAILED = 'safekeeping:execution:failed',
  SAFEKEEPING_POSITION_OPENED = 'safekeeping:position:opened',
  SAFEKEEPING_POSITION_CLOSED = 'safekeeping:position:closed',
  SAFEKEEPING_EMERGENCY_HALT = 'safekeeping:emergency:halt',
  SAFEKEEPING_ANOMALY_DETECTED = 'safekeeping:anomaly:detected',
}

// Message types
export interface Message<T = any> {
  type: string;
  timestamp: Date;
  source: string; // Service name
  data: T;
  id?: string;
  correlationId?: string;
}

// Subscriber callback type
type SubscriptionCallback<T = any> = (message: Message<T>) => void | Promise<void>;

class MessageBus extends EventEmitter {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private subscriptions: Map<string, Set<SubscriptionCallback>> = new Map();
  public isConnected: boolean = false;  // Made public for external access
  private reconnectTimer: NodeJS.Timeout | null = null;
  private serviceId: string;
  private serviceName: string;

  // Configuration
  private host: string;
  private port: number;
  private password?: string;
  private db: number;

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
  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.warn('[MessageBus] Already connected');
      return;
    }

    try {
      // Publisher connection (optimised for sending)
      this.publisher = new Redis({
        host: this.host,
        port: this.port,
        password: this.password,
        db: this.db,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.warn(`[MessageBus] Publisher reconnect attempt ${times}, delay ${delay}ms`);
          return delay;
        },
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      // Subscriber connection (optimised for receiving)
      this.subscriber = new Redis({
        host: this.host,
        port: this.port,
        password: this.password,
        db: this.db,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          logger.warn(`[MessageBus] Subscriber reconnect attempt ${times}, delay ${delay}ms`);
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
      logger.info(`[MessageBus] Connected to redis://${this.host}:${this.port}/${this.db}`);

      // Subscribe to all registered channels
      await this.resubscribeAll();

      // Emit connection event
      this.emit('connected');

    } catch (error) {
      logger.error('[MessageBus] Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Set up Redis event handlers
   */
  private setupEventHandlers(): void {
    if (!this.publisher || !this.subscriber) return;

    // Publisher events
    this.publisher.on('connect', () => {
      logger.debug('[MessageBus] Publisher connected');
    });

    this.publisher.on('error', (error) => {
      logger.error('[MessageBus] Publisher error:', error);
    });

    // Subscriber events
    this.subscriber.on('connect', () => {
      logger.debug('[MessageBus] Subscriber connected');
    });

    this.subscriber.on('error', (error) => {
      logger.error('[MessageBus] Subscriber error:', error);
    });

    // Message handler
    this.subscriber.on('message', (channel: string, data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as Message;
        this.handleMessage(channel, message);
      } catch (error) {
        logger.error(`[MessageBus] Failed to parse message from ${channel}:`, error);
      }
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(channel: string, message: Message): void {
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
            logger.error(`[MessageBus] Callback error for ${channel}:`, error);
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
  private async resubscribeAll(): Promise<void> {
    if (!this.subscriber || this.subscriptions.size === 0) return;

    const channels = Array.from(this.subscriptions.keys());
    if (channels.length > 0) {
      await this.subscriber.subscribe(...channels);
      logger.info(`[MessageBus] Resubscribed to ${channels.length} channels`);
    }
  }

  /**
   * Publish a message to a channel
   */
  async publish<T>(channel: string | Channel, data: T, correlationId?: string): Promise<boolean> {
    if (!this.publisher) {
      logger.warn('[MessageBus] Cannot publish: not connected');
      return false;
    }

    try {
      const message: Message<T> = {
        type: channel as string,
        timestamp: new Date(),
        source: this.serviceId,
        data,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        correlationId,
      };

      await this.publisher.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error(`[MessageBus] Failed to publish to ${channel}:`, error);
      return false;
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe<T>(channel: string | Channel, callback: SubscriptionCallback<T>): Promise<void> {
    const channelStr = channel as string;

    // Add to local subscriptions
    if (!this.subscriptions.has(channelStr)) {
      this.subscriptions.set(channelStr, new Set());
    }
    this.subscriptions.get(channelStr)!.add(callback);

    // Subscribe to Redis if connected
    if (this.subscriber && this.isConnected) {
      await this.subscriber.subscribe(channelStr);
      logger.debug(`[MessageBus] Subscribed to ${channelStr}`);
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string | Channel, callback?: SubscriptionCallback): Promise<void> {
    const channelStr = channel as string;
    const callbacks = this.subscriptions.get(channelStr);
    if (!callbacks) return;

    if (callback) {
      callbacks.delete(callback);
    } else {
      callbacks.clear();
    }

    // Unsubscribe from Redis if no more callbacks
    if (callbacks.size === 0) {
      this.subscriptions.delete(channelStr);
      if (this.subscriber && this.isConnected) {
        await this.subscriber.unsubscribe(channelStr);
        logger.debug(`[MessageBus] Unsubscribed from ${channelStr}`);
      }
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const disconnectPromises: Promise<void>[] = [];

    if (this.publisher) {
      disconnectPromises.push(this.publisher.quit().catch(() => this.publisher!.disconnect()).then(() => {
        this.publisher = null;
      }));
    }

    if (this.subscriber) {
      disconnectPromises.push(this.subscriber.quit().catch(() => this.subscriber!.disconnect()).then(() => {
        this.subscriber = null;
      }));
    }

    await Promise.all(disconnectPromises);
    this.isConnected = false;
    logger.info('[MessageBus] Disconnected');
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; host: string; port: number; subscriptions: number } {
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
  async request<T, R = any>(
    channel: string | Channel,
    data: T,
    timeout: number = 5000
  ): Promise<R | null> {
    const channelStr = channel as string;
    const correlationId = `${this.serviceId}-${Date.now()}`;
    const responseChannel = `${channelStr}:response`;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        void this.unsubscribe(responseChannel, responseHandler as any);
        resolve(null);
      }, timeout);

      const responseHandler = (message: Message<R>) => {
        if (message.correlationId === correlationId) {
          clearTimeout(timer);
          void this.unsubscribe(responseChannel, responseHandler as any);
          resolve(message.data);
        }
      };

      void this.subscribe<R>(responseChannel, responseHandler);
      void this.publish(channel, data, correlationId);
    });
  }
}

// Singleton instance
export const messageBus = new MessageBus();

// Auto-connect on import in production
if (process.env.NODE_ENV === 'production') {
  messageBus.connect().catch((error) => {
    logger.error('[MessageBus] Auto-connect failed:', error);
  });
}

export default messageBus;
