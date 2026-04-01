// Timing Engine
// Handles slot-based and time-based delays, jitter, and blockhash freshness

import { Timing, calculateTiming, isBlockhashStale } from '../../shared/types';
import logger from '../../shared/logger';

export interface SlotInfo {
  slot: number;
  timestamp: number;
  blockhash: string;
  blockhashSlot: number;
}

/**
 * Sleep for a given number of milliseconds, optionally with jitter
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay until a timing target relative to a base
 */
export function delayUntilTarget(
  timing: Timing,
  baseSlot: number,
  baseTime: number
): Promise<number> {
  const targetMs = calculateTiming(timing, baseSlot, baseTime);
  const now = Date.now();
  const delta = targetMs - now;

  if (delta <= 0) {
    logger.debug(`[Timing] Target already passed (delta=${delta}ms), executing immediately`);
    return Promise.resolve(0);
  }

  logger.info(`[Timing] Waiting ${delta}ms for timing target (mode=${timing.mode})`);
  return sleep(delta).then(() => delta);
}

/**
 * Check if a blockhash is still fresh enough to use
 */
export function isBlockhashFresh(
  blockhashSlot: number,
  currentSlot: number,
  staleThreshold: number = 120
): boolean {
  return !isBlockhashStale(blockhashSlot, currentSlot);
}

/**
 * Calculate staggered delays between wallet actions
 */
export function staggerDelay(minMs: number, maxMs: number): number {
  if (minMs >= maxMs) return minMs;
  return minMs + Math.random() * (maxMs - minMs);
}

/**
 * Execute a function with retries, respecting timing constraints
 */
export async function withTimingRetry<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        const jitter = Math.random() * delayMs;
        logger.warn(
          `[Timing] Attempt ${attempt + 1}/${retries + 1} failed, retrying in ${jitter.toFixed(0)}ms: ${lastError.message}`
        );
        await sleep(jitter);
      }
    }
  }

  throw lastError!;
}

/**
 * Slot tracker — polls the current slot from an RPC source
 */
export class SlotTracker {
  private currentSlot: number = 0;
  private lastUpdate: number = 0;
  private pollIntervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private getSlotFn: () => Promise<number>;

  constructor(getSlotFn: () => Promise<number>, pollIntervalMs: number = 400) {
    this.getSlotFn = getSlotFn;
    this.pollIntervalMs = pollIntervalMs;
  }

  async start(): Promise<void> {
    this.currentSlot = await this.getSlotFn();
    this.lastUpdate = Date.now();
    logger.info(`[SlotTracker] Started at slot ${this.currentSlot}`);

    this.timer = setInterval(async () => {
      try {
        this.currentSlot = await this.getSlotFn();
        this.lastUpdate = Date.now();
      } catch (error) {
        logger.warn(`[SlotTracker] Failed to poll slot: ${error}`);
      }
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  get slot(): number {
    return this.currentSlot;
  }

  get lastUpdatedAt(): number {
    return this.lastUpdate;
  }
}
