import BetterSqlite3 from 'better-sqlite3';
import configManager from '../shared/config';
import logger from '../shared/logger';

export type SafetyEventType =
  | 'daily_loss'
  | 'consecutive_loss'
  | 'drawdown'
  | 'volatility'
  | 'frequency_limit';

export interface SafetyEventPayload {
  eventType: SafetyEventType;
  triggerValue: number;
  threshold: number;
  timestamp?: Date;
  details?: Record<string, unknown>;
}

class SafetyStore {
  private db: BetterSqlite3.Database | null = null;
  private initialized = false;
  private readonly dbPath: string;

  constructor() {
    const config = configManager.get();
    this.dbPath = process.env.SAFETY_DB_PATH || config.database?.connection || './data/trading.db';
  }

  initialize(): void {
    if (this.initialized) return;

    try {
      this.db = new BetterSqlite3(this.dbPath);
      this.db.pragma('journal_mode = WAL');

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS safety_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL,
          trigger_value REAL NOT NULL,
          threshold REAL NOT NULL,
          timestamp TEXT NOT NULL,
          details TEXT
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_safety_events_type_timestamp
        ON safety_events(event_type, timestamp)
      `);

      this.initialized = true;
      logger.info('[SafetyStore] Initialized safety events store');
    } catch (error) {
      logger.error('[SafetyStore] Failed to initialize:', error);
      throw error;
    }
  }

  logEvent(payload: SafetyEventPayload): void {
    if (!this.db) {
      this.initialize();
    }

    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO safety_events (
          event_type, trigger_value, threshold, timestamp, details
        ) VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run(
        payload.eventType,
        payload.triggerValue,
        payload.threshold,
        (payload.timestamp ?? new Date()).toISOString(),
        payload.details ? JSON.stringify(payload.details) : null
      );
    } catch (error) {
      logger.error('[SafetyStore] Failed to log safety event:', error);
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

const safetyStore = new SafetyStore();
export default safetyStore;
