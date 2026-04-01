"use strict";
// Timing Engine
// Handles slot-based and time-based delays, jitter, and blockhash freshness
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlotTracker = void 0;
exports.delayUntilTarget = delayUntilTarget;
exports.isBlockhashFresh = isBlockhashFresh;
exports.staggerDelay = staggerDelay;
exports.withTimingRetry = withTimingRetry;
const types_1 = require("../../shared/types");
const logger_1 = __importDefault(require("../../shared/logger"));
/**
 * Sleep for a given number of milliseconds, optionally with jitter
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Calculate delay until a timing target relative to a base
 */
function delayUntilTarget(timing, baseSlot, baseTime) {
    const targetMs = (0, types_1.calculateTiming)(timing, baseSlot, baseTime);
    const now = Date.now();
    const delta = targetMs - now;
    if (delta <= 0) {
        logger_1.default.debug(`[Timing] Target already passed (delta=${delta}ms), executing immediately`);
        return Promise.resolve(0);
    }
    logger_1.default.info(`[Timing] Waiting ${delta}ms for timing target (mode=${timing.mode})`);
    return sleep(delta).then(() => delta);
}
/**
 * Check if a blockhash is still fresh enough to use
 */
function isBlockhashFresh(blockhashSlot, currentSlot, staleThreshold = 120) {
    return !(0, types_1.isBlockhashStale)(blockhashSlot, currentSlot);
}
/**
 * Calculate staggered delays between wallet actions
 */
function staggerDelay(minMs, maxMs) {
    if (minMs >= maxMs)
        return minMs;
    return minMs + Math.random() * (maxMs - minMs);
}
/**
 * Execute a function with retries, respecting timing constraints
 */
async function withTimingRetry(fn, retries = 3, delayMs = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < retries) {
                const jitter = Math.random() * delayMs;
                logger_1.default.warn(`[Timing] Attempt ${attempt + 1}/${retries + 1} failed, retrying in ${jitter.toFixed(0)}ms: ${lastError.message}`);
                await sleep(jitter);
            }
        }
    }
    throw lastError;
}
/**
 * Slot tracker — polls the current slot from an RPC source
 */
class SlotTracker {
    currentSlot = 0;
    lastUpdate = 0;
    pollIntervalMs;
    timer;
    getSlotFn;
    constructor(getSlotFn, pollIntervalMs = 400) {
        this.getSlotFn = getSlotFn;
        this.pollIntervalMs = pollIntervalMs;
    }
    async start() {
        this.currentSlot = await this.getSlotFn();
        this.lastUpdate = Date.now();
        logger_1.default.info(`[SlotTracker] Started at slot ${this.currentSlot}`);
        this.timer = setInterval(async () => {
            try {
                this.currentSlot = await this.getSlotFn();
                this.lastUpdate = Date.now();
            }
            catch (error) {
                logger_1.default.warn(`[SlotTracker] Failed to poll slot: ${error}`);
            }
        }, this.pollIntervalMs);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
    get slot() {
        return this.currentSlot;
    }
    get lastUpdatedAt() {
        return this.lastUpdate;
    }
}
exports.SlotTracker = SlotTracker;
//# sourceMappingURL=timing-engine.js.map