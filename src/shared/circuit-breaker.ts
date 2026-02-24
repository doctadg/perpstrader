// Circuit Breaker System
// Implements circuit breakers and health checks for all trading components

import fs from 'fs';
import path from 'path';
import logger from '../shared/logger';
import executionEngine from '../execution-engine/execution-engine';
import riskManager from '../risk-manager/risk-manager';
import positionRecovery from '../execution-engine/position-recovery';
import configManager from './config';
import { Trade } from './types';
import safetyStore, { SafetyEventType } from '../data/safety-store';

interface CircuitBreakerState {
    name: string;
    isOpen: boolean;
    openAt: Date | null;
    lastError: Date | null;
    errorCount: number;
    successCount: number;
    threshold: number; // Errors before opening
    timeout: number; // ms to wait before attempting recovery
}

interface HealthCheckResult {
    component: string;
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
    message: string;
    timestamp: Date;
    metrics: Record<string, any>;
    responseTime: number;
}

type SafetyBreakerType = 'daily_loss' | 'consecutive_loss' | 'drawdown' | 'volatility' | 'frequency_limit';
type VolatilityMode = 'normal' | 'reduced' | 'stopped';

interface SafetyTradeInput {
    symbol: string;
    pnl: number;
    timestamp: Date | string | number;
    id?: string;
}

interface SafetyTradeOutcome {
    symbol: string;
    pnl: number;
    timestamp: string;
    outcome: 'WIN' | 'LOSS' | 'FLAT';
}

interface SafetyBreakerTriggerState {
    type: SafetyBreakerType;
    triggered: boolean;
    triggeredAt: string | null;
    expiresAt: string | null;
    triggerValue: number;
    threshold: number;
    reason: string | null;
    manualResetRequired: boolean;
}

interface SafetyConfig {
    dailyLossLimit: number;
    maxDrawdownPercent: number;
    consecutiveLossLimit: number;
    maxTradesPerDay: number;
    maxTradesPerSymbol: number;
    volatilityReduceThreshold: number;
    volatilityStopThreshold: number;
}

interface PersistedSafetyState {
    currentDate: string;
    dailyPnL: number;
    tradesToday: number;
    tradesPerSymbol: Record<string, number>;
    consecutiveLosses: number;
    tradeHistory: SafetyTradeOutcome[];
    peakAccountValue: number;
    currentAccountValue: number;
    currentDrawdownPercent: number;
    btcVolatility1h: number;
    positionSizeMultiplier: number;
    volatilityMode: VolatilityMode;
    tradingHalted: boolean;
    haltReason: string | null;
    breakers: Record<SafetyBreakerType, SafetyBreakerTriggerState>;
    processedTradeKeys: string[];
    lastUpdatedAt: string;
}

export interface SafetyStatus {
    tradingAllowed: boolean;
    tradingHalted: boolean;
    haltReason: string | null;
    blockedReasons: string[];
    dailyPnL: number;
    dailyLossLimit: number;
    consecutiveLosses: number;
    consecutiveLossLimit: number;
    drawdownPercent: number;
    maxDrawdownPercent: number;
    peakAccountValue: number;
    currentAccountValue: number;
    btcVolatility1h: number;
    volatilityMode: VolatilityMode;
    volatilityReduceThreshold: number;
    volatilityStopThreshold: number;
    positionSizeMultiplier: number;
    tradesToday: number;
    maxTradesPerDay: number;
    maxTradesPerSymbol: number;
    tradesPerSymbol: Record<string, number>;
    activeBreakers: SafetyBreakerType[];
    breakers: Record<SafetyBreakerType, SafetyBreakerTriggerState>;
    currentDate: string;
}

interface TriggerOptions {
    expiresAt?: Date | null;
    manualResetRequired?: boolean;
    haltTrading?: boolean;
    details?: Record<string, unknown>;
    forceLog?: boolean;
}

/**
 * Safety monitor for trading-specific circuit breakers and position sizing controls.
 */
export class SafetyMonitor {
    private readonly circuitBreakerSystem: CircuitBreakerSystem;
    private state: PersistedSafetyState;
    private config: SafetyConfig;
    private readonly statePath: string;
    private processedTradeKeys: Set<string> = new Set();

    private readonly ONE_HOUR_MS = 60 * 60 * 1000;
    private readonly ONE_DAY_MS = 24 * 60 * 60 * 1000;
    private readonly MAX_TRADE_HISTORY = 200;
    private readonly MAX_PROCESSED_KEYS = 500;

    constructor(circuitBreakerSystem: CircuitBreakerSystem) {
        this.circuitBreakerSystem = circuitBreakerSystem;
        this.config = this.loadSafetyConfig();
        this.statePath = process.env.SAFETY_STATE_PATH || './data/safety-state.json';
        this.state = this.createInitialState();
        this.loadPersistedState();
        this.syncThresholdsWithConfig();
        this.refreshState(new Date(), true);
        logger.info('[SafetyMonitor] Initialized');
    }

    /**
     * Record a completed trade and evaluate safety breakers.
     */
    recordTrade(trade: SafetyTradeInput): void {
        if (!trade.symbol) return;

        this.refreshConfig();

        const now = new Date();
        const tradeTime = this.parseDate(trade.timestamp);
        const symbol = trade.symbol.toUpperCase();
        const pnl = Number.isFinite(trade.pnl) ? trade.pnl : 0;
        const tradeKey = this.buildTradeKey(trade, symbol, tradeTime, pnl);

        this.refreshState(now, false);

        if (this.processedTradeKeys.has(tradeKey)) {
            return;
        }

        this.pushProcessedKey(tradeKey);

        const outcome: SafetyTradeOutcome = {
            symbol,
            pnl,
            timestamp: tradeTime.toISOString(),
            outcome: pnl < 0 ? 'LOSS' : pnl > 0 ? 'WIN' : 'FLAT',
        };
        this.state.tradeHistory.push(outcome);
        if (this.state.tradeHistory.length > this.MAX_TRADE_HISTORY) {
            this.state.tradeHistory = this.state.tradeHistory.slice(-this.MAX_TRADE_HISTORY);
        }

        // Daily limits are enforced on the current UTC trading day.
        if (this.getDateKey(tradeTime) !== this.state.currentDate) {
            this.persistState();
            return;
        }

        this.state.tradesToday += 1;
        this.state.tradesPerSymbol[symbol] = (this.state.tradesPerSymbol[symbol] || 0) + 1;
        this.state.dailyPnL += pnl;
        this.state.consecutiveLosses = pnl < 0 ? this.state.consecutiveLosses + 1 : 0;

        this.updateFrequencyBreaker(symbol, tradeTime, true);

        if (this.state.dailyPnL <= -this.config.dailyLossLimit) {
            this.triggerDailyLoss(tradeTime);
        }

        if (this.state.consecutiveLosses >= this.config.consecutiveLossLimit) {
            this.triggerConsecutiveLoss(tradeTime);
        }

        this.persistState();
    }

    /**
     * Update the latest account value and evaluate drawdown breaker.
     */
    updateAccountValue(value: number): void {
        if (!Number.isFinite(value) || value <= 0) return;

        this.refreshConfig();
        this.refreshState(new Date(), false);

        this.state.currentAccountValue = value;
        if (value > this.state.peakAccountValue) {
            this.state.peakAccountValue = value;
        }

        if (this.state.peakAccountValue > 0) {
            this.state.currentDrawdownPercent =
                ((this.state.peakAccountValue - value) / this.state.peakAccountValue) * 100;
        } else {
            this.state.currentDrawdownPercent = 0;
        }

        if (this.state.currentDrawdownPercent >= this.config.maxDrawdownPercent) {
            this.triggerDrawdown(new Date());
        }

        this.persistState();
    }

    /**
     * Update BTC 1h volatility for volatility breaker checks.
     */
    updateBTCVolatility(volatility1h: number): void {
        if (!Number.isFinite(volatility1h)) return;

        this.refreshConfig();
        this.refreshState(new Date(), false);

        const clampedVolatility = Math.max(0, volatility1h);
        const previousMode = this.state.volatilityMode;

        this.state.btcVolatility1h = clampedVolatility;

        let nextMode: VolatilityMode = 'normal';
        let multiplier = 1;

        if (clampedVolatility > this.config.volatilityStopThreshold) {
            nextMode = 'stopped';
            multiplier = 0;
        } else if (clampedVolatility > this.config.volatilityReduceThreshold) {
            nextMode = 'reduced';
            multiplier = 0.5;
        }

        this.state.volatilityMode = nextMode;
        this.state.positionSizeMultiplier = multiplier;

        if (nextMode === 'normal') {
            if (this.state.breakers.volatility.triggered) {
                this.resetBreakerState('volatility');
                logger.info('[SafetyMonitor] Volatility conditions normalized');
            }
        } else {
            const threshold =
                nextMode === 'stopped'
                    ? this.config.volatilityStopThreshold
                    : this.config.volatilityReduceThreshold;
            const reason =
                nextMode === 'stopped'
                    ? `BTC 1h volatility ${clampedVolatility.toFixed(2)}% exceeded ${threshold.toFixed(2)}% stop threshold`
                    : `BTC 1h volatility ${clampedVolatility.toFixed(2)}% exceeded ${threshold.toFixed(2)}% reduce threshold`;

            this.triggerBreaker(
                'volatility',
                'volatility',
                clampedVolatility,
                threshold,
                reason,
                {
                    details: {
                        mode: nextMode,
                        positionSizeMultiplier: multiplier,
                    },
                    forceLog: previousMode !== nextMode,
                }
            );

            if (previousMode !== nextMode) {
                logger.warn(`[SafetyMonitor] Volatility mode changed: ${previousMode} -> ${nextMode}`);
            }
        }

        this.persistState();
    }

    /**
     * Check if a symbol can open a new trade under current safety constraints.
     */
    canEnterNewTrade(symbol: string): boolean {
        this.refreshConfig();

        const now = new Date();
        const normalizedSymbol = symbol.toUpperCase();

        this.refreshState(now, false);
        const changed = this.updateFrequencyBreaker(normalizedSymbol, now, true);
        const reasons = this.getBlockingReasons(normalizedSymbol, now);

        if (changed) {
            this.persistState();
        }

        if (reasons.length > 0) {
            logger.debug(
                `[SafetyMonitor] Blocked trade entry for ${normalizedSymbol}: ${reasons.join('; ')}`
            );
            return false;
        }

        return true;
    }

    /**
     * Get position sizing multiplier [0, 1] based on current volatility regime.
     */
    getPositionSizeMultiplier(): number {
        this.refreshState(new Date(), false);
        return this.state.positionSizeMultiplier;
    }

    /**
     * Manually reset a safety circuit breaker with audit log.
     */
    resetCircuitBreaker(type: string, reason: string): boolean {
        this.refreshConfig();
        this.refreshState(new Date(), false);

        const normalized = type.trim().toLowerCase();
        if (!this.isSafetyBreakerType(normalized)) {
            return false;
        }

        const breaker = this.state.breakers[normalized];
        if (!breaker.triggered) {
            return true;
        }

        if (
            normalized === 'daily_loss' &&
            breaker.expiresAt &&
            Date.now() < new Date(breaker.expiresAt).getTime()
        ) {
            logger.warn('[SafetyMonitor] Daily loss breaker cannot be reset before 24h cooldown completes');
            return false;
        }

        const triggerValue = breaker.triggerValue;
        const threshold = breaker.threshold;
        const previousReason = breaker.reason;

        this.resetBreakerState(normalized);

        if (normalized === 'consecutive_loss') {
            this.state.consecutiveLosses = 0;
        }

        this.recomputeTradingHaltState();

        safetyStore.logEvent({
            eventType: this.mapSafetyBreakerToEventType(normalized),
            triggerValue,
            threshold,
            details: {
                action: 'manual_reset',
                reason,
                previousReason,
                resetAt: new Date().toISOString(),
            },
        });

        logger.info(`[SafetyMonitor] Manually reset breaker ${normalized}: ${reason}`);
        this.persistState();
        return true;
    }

    /**
     * Return a full safety status snapshot for health checks and APIs.
     */
    getSafetyStatus(): SafetyStatus {
        this.refreshConfig();
        const now = new Date();
        this.refreshState(now, false);

        const blockedReasons = this.getBlockingReasons('BTC', now);
        const activeBreakers = (Object.values(this.state.breakers) as SafetyBreakerTriggerState[])
            .filter((breaker) => breaker.triggered)
            .map((breaker) => breaker.type);

        return {
            tradingAllowed: blockedReasons.length === 0,
            tradingHalted: this.state.tradingHalted,
            haltReason: this.state.haltReason,
            blockedReasons,
            dailyPnL: this.state.dailyPnL,
            dailyLossLimit: this.config.dailyLossLimit,
            consecutiveLosses: this.state.consecutiveLosses,
            consecutiveLossLimit: this.config.consecutiveLossLimit,
            drawdownPercent: this.state.currentDrawdownPercent,
            maxDrawdownPercent: this.config.maxDrawdownPercent,
            peakAccountValue: this.state.peakAccountValue,
            currentAccountValue: this.state.currentAccountValue,
            btcVolatility1h: this.state.btcVolatility1h,
            volatilityMode: this.state.volatilityMode,
            volatilityReduceThreshold: this.config.volatilityReduceThreshold,
            volatilityStopThreshold: this.config.volatilityStopThreshold,
            positionSizeMultiplier: this.state.positionSizeMultiplier,
            tradesToday: this.state.tradesToday,
            maxTradesPerDay: this.config.maxTradesPerDay,
            maxTradesPerSymbol: this.config.maxTradesPerSymbol,
            tradesPerSymbol: { ...this.state.tradesPerSymbol },
            activeBreakers,
            breakers: this.cloneBreakers(),
            currentDate: this.state.currentDate,
        };
    }

    /**
     * Get safety status in the same shape used by system health checks.
     */
    getHealthCheckResult(): HealthCheckResult {
        const status = this.getSafetyStatus();

        let health: HealthCheckResult['status'] = 'HEALTHY';
        let message = 'Safety limits within normal range';

        if (status.activeBreakers.includes('daily_loss') || status.activeBreakers.includes('drawdown')) {
            health = 'CRITICAL';
            message = status.haltReason || 'Critical safety breaker active';
        } else if (status.blockedReasons.length > 0) {
            health = 'UNHEALTHY';
            message = status.blockedReasons[0];
        } else if (status.positionSizeMultiplier < 1) {
            health = 'DEGRADED';
            message = `Volatility control active (${status.volatilityMode})`;
        }

        return {
            component: 'safety-monitor',
            status: health,
            message,
            timestamp: new Date(),
            metrics: status,
            responseTime: 0,
        };
    }

    private loadSafetyConfig(): SafetyConfig {
        const configured = configManager.get().safety;

        return {
            dailyLossLimit: this.safeNumber(configured?.dailyLossLimit, 50),
            maxDrawdownPercent: this.safeNumber(configured?.maxDrawdownPercent, 15),
            consecutiveLossLimit: Math.max(1, Math.floor(this.safeNumber(configured?.consecutiveLossLimit, 5))),
            maxTradesPerDay: Math.max(1, Math.floor(this.safeNumber(configured?.maxTradesPerDay, 20))),
            maxTradesPerSymbol: Math.max(1, Math.floor(this.safeNumber(configured?.maxTradesPerSymbol, 5))),
            volatilityReduceThreshold: this.safeNumber(configured?.volatilityReduceThreshold, 5),
            volatilityStopThreshold: this.safeNumber(configured?.volatilityStopThreshold, 10),
        };
    }

    private refreshConfig(): void {
        const previous = this.config;
        const next = this.loadSafetyConfig();

        const changed =
            previous.dailyLossLimit !== next.dailyLossLimit ||
            previous.maxDrawdownPercent !== next.maxDrawdownPercent ||
            previous.consecutiveLossLimit !== next.consecutiveLossLimit ||
            previous.maxTradesPerDay !== next.maxTradesPerDay ||
            previous.maxTradesPerSymbol !== next.maxTradesPerSymbol ||
            previous.volatilityReduceThreshold !== next.volatilityReduceThreshold ||
            previous.volatilityStopThreshold !== next.volatilityStopThreshold;

        if (changed) {
            this.config = next;
            this.syncThresholdsWithConfig();

            // Allow config changes to serve as explicit operator overrides.
            if (
                this.state.breakers.daily_loss.triggered &&
                Math.abs(this.state.dailyPnL) < this.config.dailyLossLimit
            ) {
                this.resetBreakerState('daily_loss');
            }
            if (
                this.state.breakers.drawdown.triggered &&
                this.state.currentDrawdownPercent < this.config.maxDrawdownPercent
            ) {
                this.resetBreakerState('drawdown');
            }
            if (
                this.state.breakers.consecutive_loss.triggered &&
                this.state.consecutiveLosses < this.config.consecutiveLossLimit
            ) {
                this.resetBreakerState('consecutive_loss');
            }
            if (
                this.state.breakers.frequency_limit.triggered &&
                this.state.tradesToday < this.config.maxTradesPerDay &&
                !Object.values(this.state.tradesPerSymbol).some(
                    (tradeCount) => tradeCount >= this.config.maxTradesPerSymbol
                )
            ) {
                this.resetBreakerState('frequency_limit');
            }

            this.recomputeTradingHaltState();
            logger.info('[SafetyMonitor] Reloaded safety config thresholds');
            this.persistState();
        }
    }

    private safeNumber(value: unknown, fallback: number): number {
        return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    }

    private createInitialState(): PersistedSafetyState {
        const now = new Date();
        const dateKey = this.getDateKey(now);
        return {
            currentDate: dateKey,
            dailyPnL: 0,
            tradesToday: 0,
            tradesPerSymbol: {},
            consecutiveLosses: 0,
            tradeHistory: [],
            peakAccountValue: 0,
            currentAccountValue: 0,
            currentDrawdownPercent: 0,
            btcVolatility1h: 0,
            positionSizeMultiplier: 1,
            volatilityMode: 'normal',
            tradingHalted: false,
            haltReason: null,
            breakers: {
                daily_loss: this.createBreakerState('daily_loss', this.config.dailyLossLimit),
                consecutive_loss: this.createBreakerState('consecutive_loss', this.config.consecutiveLossLimit),
                drawdown: this.createBreakerState('drawdown', this.config.maxDrawdownPercent),
                volatility: this.createBreakerState('volatility', this.config.volatilityStopThreshold),
                frequency_limit: this.createBreakerState('frequency_limit', this.config.maxTradesPerDay),
            },
            processedTradeKeys: [],
            lastUpdatedAt: now.toISOString(),
        };
    }

    private createBreakerState(type: SafetyBreakerType, threshold: number): SafetyBreakerTriggerState {
        return {
            type,
            triggered: false,
            triggeredAt: null,
            expiresAt: null,
            triggerValue: 0,
            threshold,
            reason: null,
            manualResetRequired: false,
        };
    }

    private loadPersistedState(): void {
        if (!fs.existsSync(this.statePath)) {
            return;
        }

        try {
            const raw = fs.readFileSync(this.statePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<PersistedSafetyState>;

            this.state = {
                ...this.state,
                ...parsed,
                currentDate:
                    typeof parsed.currentDate === 'string' ? parsed.currentDate : this.state.currentDate,
                dailyPnL: this.safeNumber(parsed.dailyPnL, this.state.dailyPnL),
                tradesToday: Math.max(0, Math.floor(this.safeNumber(parsed.tradesToday, this.state.tradesToday))),
                consecutiveLosses: Math.max(
                    0,
                    Math.floor(this.safeNumber(parsed.consecutiveLosses, this.state.consecutiveLosses))
                ),
                peakAccountValue: this.safeNumber(parsed.peakAccountValue, this.state.peakAccountValue),
                currentAccountValue: this.safeNumber(parsed.currentAccountValue, this.state.currentAccountValue),
                currentDrawdownPercent: this.safeNumber(
                    parsed.currentDrawdownPercent,
                    this.state.currentDrawdownPercent
                ),
                btcVolatility1h: this.safeNumber(parsed.btcVolatility1h, this.state.btcVolatility1h),
                positionSizeMultiplier: this.safeNumber(
                    parsed.positionSizeMultiplier,
                    this.state.positionSizeMultiplier
                ),
                volatilityMode:
                    parsed.volatilityMode === 'normal' ||
                    parsed.volatilityMode === 'reduced' ||
                    parsed.volatilityMode === 'stopped'
                        ? parsed.volatilityMode
                        : this.state.volatilityMode,
                tradingHalted:
                    typeof parsed.tradingHalted === 'boolean'
                        ? parsed.tradingHalted
                        : this.state.tradingHalted,
                haltReason: parsed.haltReason ?? this.state.haltReason,
                tradesPerSymbol:
                    parsed.tradesPerSymbol && typeof parsed.tradesPerSymbol === 'object'
                        ? (parsed.tradesPerSymbol as Record<string, number>)
                        : this.state.tradesPerSymbol,
                tradeHistory: Array.isArray(parsed.tradeHistory)
                    ? parsed.tradeHistory
                          .filter((item): item is SafetyTradeOutcome => {
                              return (
                                  typeof item?.symbol === 'string' &&
                                  typeof item?.timestamp === 'string' &&
                                  typeof item?.outcome === 'string'
                              );
                          })
                          .slice(-this.MAX_TRADE_HISTORY)
                    : this.state.tradeHistory,
                breakers: this.mergeBreakerStates(parsed.breakers),
                processedTradeKeys: Array.isArray(parsed.processedTradeKeys)
                    ? parsed.processedTradeKeys
                          .filter((key): key is string => typeof key === 'string')
                          .slice(-this.MAX_PROCESSED_KEYS)
                    : [],
                lastUpdatedAt:
                    typeof parsed.lastUpdatedAt === 'string'
                        ? parsed.lastUpdatedAt
                        : this.state.lastUpdatedAt,
            };

            this.processedTradeKeys = new Set(this.state.processedTradeKeys);
            logger.info(`[SafetyMonitor] Loaded persisted state from ${this.statePath}`);
        } catch (error) {
            logger.error('[SafetyMonitor] Failed to load persisted state:', error);
        }
    }

    private mergeBreakerStates(
        breakers: Partial<Record<SafetyBreakerType, SafetyBreakerTriggerState>> | undefined
    ): Record<SafetyBreakerType, SafetyBreakerTriggerState> {
        const merged = { ...this.state.breakers };
        if (!breakers) return merged;

        for (const type of Object.keys(merged) as SafetyBreakerType[]) {
            const incoming = breakers[type];
            if (!incoming) continue;
            merged[type] = {
                ...merged[type],
                ...incoming,
                type,
                threshold: this.safeNumber(incoming.threshold, merged[type].threshold),
                triggerValue: this.safeNumber(incoming.triggerValue, merged[type].triggerValue),
                triggered: Boolean(incoming.triggered),
            };
        }

        return merged;
    }

    private syncThresholdsWithConfig(): void {
        this.state.breakers.daily_loss.threshold = this.config.dailyLossLimit;
        this.state.breakers.consecutive_loss.threshold = this.config.consecutiveLossLimit;
        this.state.breakers.drawdown.threshold = this.config.maxDrawdownPercent;
        this.state.breakers.volatility.threshold = this.config.volatilityStopThreshold;
        this.state.breakers.frequency_limit.threshold = this.config.maxTradesPerDay;
    }

    private refreshState(now: Date, persistIfChanged: boolean): void {
        let changed = false;

        const dateKey = this.getDateKey(now);
        if (dateKey !== this.state.currentDate) {
            this.state.currentDate = dateKey;
            this.state.dailyPnL = 0;
            this.state.tradesToday = 0;
            this.state.tradesPerSymbol = {};
            this.resetBreakerState('frequency_limit');
            changed = true;
        }

        changed = this.clearExpiredBreakers(now) || changed;
        this.recomputeTradingHaltState();

        if (changed && persistIfChanged) {
            this.persistState();
        }
    }

    private clearExpiredBreakers(now: Date): boolean {
        let changed = false;

        for (const type of ['consecutive_loss', 'frequency_limit'] as SafetyBreakerType[]) {
            const breaker = this.state.breakers[type];
            if (!breaker.triggered || !breaker.expiresAt) continue;

            const expiresAt = new Date(breaker.expiresAt).getTime();
            if (Number.isNaN(expiresAt)) continue;

            if (now.getTime() >= expiresAt && !breaker.manualResetRequired) {
                this.resetBreakerState(type);
                if (type === 'consecutive_loss') {
                    this.state.consecutiveLosses = 0;
                }
                changed = true;
            }
        }

        return changed;
    }

    private resetBreakerState(type: SafetyBreakerType): void {
        const breaker = this.state.breakers[type];
        breaker.triggered = false;
        breaker.triggeredAt = null;
        breaker.expiresAt = null;
        breaker.triggerValue = 0;
        breaker.reason = null;
        breaker.manualResetRequired = false;
    }

    private triggerDailyLoss(now: Date): void {
        if (this.state.breakers.daily_loss.triggered) {
            return;
        }

        const absDailyLoss = Math.abs(this.state.dailyPnL);
        const reason = `Daily loss ${absDailyLoss.toFixed(2)} exceeded limit ${this.config.dailyLossLimit.toFixed(2)}`;
        const expiresAt = new Date(now.getTime() + this.ONE_DAY_MS);

        this.triggerBreaker('daily_loss', 'daily_loss', absDailyLoss, this.config.dailyLossLimit, reason, {
            expiresAt,
            manualResetRequired: true,
            haltTrading: true,
            details: {
                dailyPnL: this.state.dailyPnL,
                expiresAt: expiresAt.toISOString(),
            },
        });

        logger.error(`[SafetyMonitor] Daily loss breaker triggered: ${reason}`);
        this.circuitBreakerSystem.openBreaker('execution');
    }

    private triggerConsecutiveLoss(now: Date): void {
        if (this.state.breakers.consecutive_loss.triggered) {
            return;
        }

        const reason =
            `Consecutive losses ${this.state.consecutiveLosses} reached limit ` +
            `${this.config.consecutiveLossLimit}`;
        const expiresAt = new Date(now.getTime() + this.ONE_HOUR_MS);

        this.triggerBreaker(
            'consecutive_loss',
            'consecutive_loss',
            this.state.consecutiveLosses,
            this.config.consecutiveLossLimit,
            reason,
            {
                expiresAt,
                details: {
                    pauseMinutes: 60,
                    expiresAt: expiresAt.toISOString(),
                },
            }
        );

        logger.warn('Strategy degradation detected');
        logger.warn(`[SafetyMonitor] Consecutive loss breaker triggered: ${reason}`);
    }

    private triggerDrawdown(now: Date): void {
        if (this.state.breakers.drawdown.triggered) {
            return;
        }

        const reason =
            `Drawdown ${this.state.currentDrawdownPercent.toFixed(2)}% exceeded limit ` +
            `${this.config.maxDrawdownPercent.toFixed(2)}%`;

        this.triggerBreaker('drawdown', 'drawdown', this.state.currentDrawdownPercent, this.config.maxDrawdownPercent, reason, {
            manualResetRequired: true,
            haltTrading: true,
            details: {
                peakAccountValue: this.state.peakAccountValue,
                currentAccountValue: this.state.currentAccountValue,
                drawdownPercent: this.state.currentDrawdownPercent,
            },
        });

        logger.error(`[SafetyMonitor] Drawdown breaker triggered: ${reason}`);
        this.circuitBreakerSystem.openBreaker('execution');
        void this.executeDrawdownEmergencyActions(now);
    }

    private async executeDrawdownEmergencyActions(_triggeredAt: Date): Promise<void> {
        try {
            await positionRecovery.emergencyCloseAll();
            logger.error('[SafetyMonitor] Closed all positions after drawdown breaker trigger');
        } catch (error) {
            logger.error('[SafetyMonitor] Failed closing positions on drawdown trigger:', error);
        }

        try {
            await executionEngine.emergencyStop();
            logger.error('[SafetyMonitor] Emergency stop executed after drawdown breaker trigger');
        } catch (error) {
            logger.error('[SafetyMonitor] Failed emergency stop on drawdown trigger:', error);
        }
    }

    private triggerBreaker(
        type: SafetyBreakerType,
        eventType: SafetyEventType,
        triggerValue: number,
        threshold: number,
        reason: string,
        options: TriggerOptions = {}
    ): void {
        const breaker = this.state.breakers[type];
        const alreadyTriggered = breaker.triggered;

        breaker.triggered = true;
        if (!alreadyTriggered) {
            breaker.triggeredAt = new Date().toISOString();
        }
        breaker.expiresAt = options.expiresAt ? options.expiresAt.toISOString() : null;
        breaker.triggerValue = triggerValue;
        breaker.threshold = threshold;
        breaker.reason = reason;
        breaker.manualResetRequired = Boolean(options.manualResetRequired);

        if (options.haltTrading) {
            this.state.tradingHalted = true;
            this.state.haltReason = reason;
        }

        if (!alreadyTriggered || options.forceLog) {
            safetyStore.logEvent({
                eventType,
                triggerValue,
                threshold,
                details: options.details,
            });
        }
    }

    private updateFrequencyBreaker(symbol: string, now: Date, shouldLog: boolean): boolean {
        const totalReached = this.state.tradesToday >= this.config.maxTradesPerDay;
        const symbolTrades = this.state.tradesPerSymbol[symbol] || 0;
        const symbolLimitEntry = Object.entries(this.state.tradesPerSymbol).find(
            ([, tradeCount]) => tradeCount >= this.config.maxTradesPerSymbol
        );
        const symbolReached = Boolean(symbolLimitEntry);
        const breaker = this.state.breakers.frequency_limit;

        if (!totalReached && !symbolReached) {
            if (breaker.triggered) {
                this.resetBreakerState('frequency_limit');
                return true;
            }
            return false;
        }

        const limitSymbol = symbolTrades >= this.config.maxTradesPerSymbol ? symbol : symbolLimitEntry?.[0];
        const limitSymbolTrades =
            symbolTrades >= this.config.maxTradesPerSymbol
                ? symbolTrades
                : (symbolLimitEntry?.[1] ?? 0);

        const reason = totalReached
            ? `Trade frequency limit reached: ${this.state.tradesToday}/${this.config.maxTradesPerDay} daily trades`
            : `Trade frequency limit reached for ${limitSymbol}: ${limitSymbolTrades}/${this.config.maxTradesPerSymbol}`;
        const triggerValue = totalReached ? this.state.tradesToday : limitSymbolTrades;
        const threshold = totalReached ? this.config.maxTradesPerDay : this.config.maxTradesPerSymbol;
        const details: Record<string, unknown> = {
            symbol: limitSymbol,
            tradesToday: this.state.tradesToday,
            symbolTrades: limitSymbolTrades,
            date: this.state.currentDate,
        };

        const changed = !breaker.triggered || breaker.reason !== reason;

        this.triggerBreaker('frequency_limit', 'frequency_limit', triggerValue, threshold, reason, {
            expiresAt: this.getEndOfDay(now),
            details,
            forceLog: shouldLog && changed,
        });

        if (changed) {
            logger.warn(`[SafetyMonitor] Frequency limiter triggered: ${reason}`);
        }

        return changed;
    }

    private recomputeTradingHaltState(): void {
        const drawdownActive = this.state.breakers.drawdown.triggered;
        const dailyLossActive = this.state.breakers.daily_loss.triggered;

        this.state.tradingHalted = drawdownActive || dailyLossActive;

        if (drawdownActive) {
            this.state.haltReason = this.state.breakers.drawdown.reason;
        } else if (dailyLossActive) {
            this.state.haltReason = this.state.breakers.daily_loss.reason;
        } else {
            this.state.haltReason = null;
        }
    }

    private getBlockingReasons(symbol: string, now: Date): string[] {
        const reasons: string[] = [];

        const dailyLoss = this.state.breakers.daily_loss;
        if (dailyLoss.triggered) {
            if (dailyLoss.expiresAt) {
                const resumeAt = new Date(dailyLoss.expiresAt).toISOString();
                reasons.push(`Daily loss breaker active (min pause until ${resumeAt}; manual reset required)`);
            } else {
                reasons.push('Daily loss breaker active (manual reset required)');
            }
        }

        const drawdown = this.state.breakers.drawdown;
        if (drawdown.triggered) {
            reasons.push('Drawdown breaker active (manual reset required)');
        }

        const consecutiveLoss = this.state.breakers.consecutive_loss;
        if (consecutiveLoss.triggered) {
            if (consecutiveLoss.expiresAt) {
                const remainingMs = new Date(consecutiveLoss.expiresAt).getTime() - now.getTime();
                const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
                reasons.push(`Consecutive loss pause active (${remainingMinutes}m remaining)`);
            } else {
                reasons.push('Consecutive loss pause active');
            }
        }

        if (this.state.volatilityMode === 'stopped') {
            reasons.push(
                `BTC volatility too high for new entries: ${this.state.btcVolatility1h.toFixed(2)}%`
            );
        }

        const symbolTrades = this.state.tradesPerSymbol[symbol] || 0;
        if (this.state.tradesToday >= this.config.maxTradesPerDay) {
            reasons.push(
                `Daily trade count limit reached (${this.state.tradesToday}/${this.config.maxTradesPerDay})`
            );
        }
        if (symbolTrades >= this.config.maxTradesPerSymbol) {
            reasons.push(
                `${symbol} trade count limit reached (${symbolTrades}/${this.config.maxTradesPerSymbol})`
            );
        }

        return reasons;
    }

    private parseDate(input: Date | string | number): Date {
        if (input instanceof Date && !Number.isNaN(input.getTime())) return input;
        const parsed = new Date(input);
        if (!Number.isNaN(parsed.getTime())) return parsed;
        return new Date();
    }

    private buildTradeKey(trade: SafetyTradeInput, symbol: string, tradeTime: Date, pnl: number): string {
        if (trade.id) {
            return `id:${trade.id}`;
        }
        return `${symbol}:${tradeTime.toISOString()}:${pnl.toFixed(8)}`;
    }

    private pushProcessedKey(key: string): void {
        this.processedTradeKeys.add(key);
        while (this.processedTradeKeys.size > this.MAX_PROCESSED_KEYS) {
            const oldest = this.processedTradeKeys.values().next().value as string | undefined;
            if (!oldest) break;
            this.processedTradeKeys.delete(oldest);
        }
    }

    private cloneBreakers(): Record<SafetyBreakerType, SafetyBreakerTriggerState> {
        return {
            daily_loss: { ...this.state.breakers.daily_loss },
            consecutive_loss: { ...this.state.breakers.consecutive_loss },
            drawdown: { ...this.state.breakers.drawdown },
            volatility: { ...this.state.breakers.volatility },
            frequency_limit: { ...this.state.breakers.frequency_limit },
        };
    }

    private isSafetyBreakerType(type: string): type is SafetyBreakerType {
        return (
            type === 'daily_loss' ||
            type === 'consecutive_loss' ||
            type === 'drawdown' ||
            type === 'volatility' ||
            type === 'frequency_limit'
        );
    }

    private mapSafetyBreakerToEventType(type: SafetyBreakerType): SafetyEventType {
        if (type === 'daily_loss') return 'daily_loss';
        if (type === 'consecutive_loss') return 'consecutive_loss';
        if (type === 'drawdown') return 'drawdown';
        if (type === 'volatility') return 'volatility';
        return 'frequency_limit';
    }

    private getDateKey(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    private getEndOfDay(date: Date): Date {
        const end = new Date(date);
        end.setUTCHours(23, 59, 59, 999);
        return end;
    }

    private persistState(): void {
        try {
            const output: PersistedSafetyState = {
                ...this.state,
                processedTradeKeys: Array.from(this.processedTradeKeys),
                lastUpdatedAt: new Date().toISOString(),
            };

            const directory = path.dirname(this.statePath);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }

            fs.writeFileSync(this.statePath, JSON.stringify(output, null, 2), 'utf8');
            this.state.lastUpdatedAt = output.lastUpdatedAt;
            this.state.processedTradeKeys = output.processedTradeKeys;
        } catch (error) {
            logger.error('[SafetyMonitor] Failed to persist state:', error);
        }
    }
}

/**
 * Circuit Breaker System
 * Protects the trading system from cascading failures
 */
export class CircuitBreakerSystem {
    private breakers: Map<string, CircuitBreakerState> = new Map();
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private healthHistory: HealthCheckResult[] = [];
    private alertCallbacks: Array<(result: HealthCheckResult) => void> = [];
    private readonly safetyMonitor: SafetyMonitor;

    constructor() {
        this.initializeDefaultBreakers();
        this.safetyMonitor = new SafetyMonitor(this);
    }

    /**
     * Initialize default circuit breakers
     */
    private initializeDefaultBreakers(): void {
        this.registerBreaker('execution', {
            threshold: 5, // Open after 5 errors
            timeout: 60000, // 1 minute recovery timeout
        });

        this.registerBreaker('risk-manager', {
            threshold: 3, // More sensitive for risk
            timeout: 30000, // 30 second recovery timeout
        });

        this.registerBreaker('api-hyperliquid', {
            threshold: 10, // More tolerant for API issues
            timeout: 120000, // 2 minute recovery timeout
        });

        this.registerBreaker('database', {
            threshold: 5,
            timeout: 30000,
        });

        this.registerBreaker('vector-store', {
            threshold: 5,
            timeout: 60000,
        });

        this.registerBreaker('glm-service', {
            threshold: 3,
            timeout: 120000,
        });

        // Trading pipeline nodes
        this.registerBreaker('market-data', { threshold: 5, timeout: 30000 });
        this.registerBreaker('pattern-recall', { threshold: 5, timeout: 60000 });
        this.registerBreaker('strategy-ideation', { threshold: 4, timeout: 60000 });
        this.registerBreaker('backtester', { threshold: 4, timeout: 45000 });
        this.registerBreaker('strategy-selector', { threshold: 4, timeout: 30000 });
        this.registerBreaker('risk-gate', { threshold: 3, timeout: 30000 });
        this.registerBreaker('executor', { threshold: 5, timeout: 60000 });
        this.registerBreaker('learner', { threshold: 4, timeout: 30000 });

        // News pipeline nodes
        this.registerBreaker('news-execution', { threshold: 5, timeout: 60000 });
        this.registerBreaker('search', { threshold: 5, timeout: 30000 });
        this.registerBreaker('scrape', { threshold: 5, timeout: 30000 });
        this.registerBreaker('quality-filter', { threshold: 4, timeout: 30000 });
        this.registerBreaker('categorize', { threshold: 4, timeout: 30000 });
        this.registerBreaker('topic-generation', { threshold: 4, timeout: 30000 });
        this.registerBreaker('redundancy-filter', { threshold: 4, timeout: 30000 });
        this.registerBreaker('cluster', { threshold: 4, timeout: 45000 });
        this.registerBreaker('cluster-fallback', { threshold: 4, timeout: 45000 });
    }

    /**
     * Register a new circuit breaker
     */
    registerBreaker(name: string, config: { threshold: number; timeout: number }): void {
        this.breakers.set(name, {
            name,
            isOpen: false,
            openAt: null,
            lastError: null,
            errorCount: 0,
            successCount: 0,
            threshold: config.threshold,
            timeout: config.timeout,
        });

        logger.debug(
            `[CircuitBreaker] Registered breaker: ${name} (threshold: ${config.threshold}, timeout: ${config.timeout}ms)`
        );
    }

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(
        breakerName: string,
        fn: () => Promise<T>,
        fallback?: () => T | Promise<T>
    ): Promise<T> {
        const breaker = this.breakers.get(breakerName);

        if (!breaker) {
            logger.warn(`[CircuitBreaker] Unknown breaker: ${breakerName}, executing without protection`);
            return fn();
        }

        // Check if circuit is open
        if (breaker.isOpen) {
            const timeSinceOpen = breaker.openAt ? Date.now() - breaker.openAt.getTime() : 0;

            if (timeSinceOpen < breaker.timeout) {
                logger.warn(`[CircuitBreaker] ${breakerName} is OPEN, blocking execution`);

                if (fallback) {
                    return fallback();
                }

                throw new Error(`Circuit breaker ${breakerName} is OPEN`);
            }

            // Attempt to close the circuit (half-open state)
            logger.info(`[CircuitBreaker] ${breakerName} attempting recovery`);
        }

        try {
            const result = await fn();
            this.onSuccess(breakerName);
            return result;
        } catch (error) {
            this.onError(breakerName, error);

            if (fallback) {
                logger.warn(`[CircuitBreaker] ${breakerName} failed, using fallback`);
                return fallback();
            }

            throw error;
        }
    }

    /**
     * Record a successful execution
     */
    private onSuccess(breakerName: string): void {
        const breaker = this.breakers.get(breakerName);
        if (!breaker) return;

        breaker.successCount++;

        // If we were in half-open state and succeeded, close the circuit
        if (breaker.isOpen && breaker.successCount >= 3) {
            breaker.isOpen = false;
            breaker.openAt = null;
            breaker.errorCount = 0;
            breaker.successCount = 0;
            logger.info(`[CircuitBreaker] ${breakerName} circuit CLOSED after successful recovery`);
        }
    }

    /**
     * Record a failed execution
     */
    private onError(breakerName: string, error: unknown): void {
        const breaker = this.breakers.get(breakerName);
        if (!breaker) return;

        breaker.errorCount++;
        breaker.lastError = new Date();

        const errorMsg = error instanceof Error ? error.message : String(error);

        if (breaker.errorCount >= breaker.threshold && !breaker.isOpen) {
            breaker.isOpen = true;
            breaker.openAt = new Date();
            breaker.successCount = 0;

            logger.error(
                `[CircuitBreaker] ${breakerName} circuit OPENED after ${breaker.errorCount} errors: ${errorMsg}`
            );

            // Trigger alert
            this.triggerAlert({
                component: breakerName,
                status: 'CRITICAL',
                message: `Circuit breaker opened: ${errorMsg}`,
                timestamp: new Date(),
                metrics: { errorCount: breaker.errorCount, threshold: breaker.threshold },
                responseTime: 0,
            });

            // Initiate emergency actions based on breaker
            this.handleBreakerOpen(breakerName);
        }
    }

    /**
     * Handle circuit breaker opening
     */
    private handleBreakerOpen(breakerName: string): void {
        switch (breakerName) {
            case 'execution':
                logger.error('[CircuitBreaker] Execution breaker opened - stopping all trading');
                // Stop trading but keep monitoring
                break;

            case 'risk-manager':
                logger.error('[CircuitBreaker] Risk manager breaker opened - reducing position sizes');
                // Could reduce position sizes or use more conservative settings
                break;

            case 'database':
                logger.error('[CircuitBreaker] Database breaker opened - switching to memory mode');
                // Could switch to in-memory storage temporarily
                break;

            default:
                logger.warn(`[CircuitBreaker] ${breakerName} opened`);
        }
    }

    /**
     * Start periodic health checks
     */
    startHealthChecks(intervalMs: number = 30000): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        this.healthCheckInterval = setInterval(async () => {
            await this.runAllHealthChecks();
        }, intervalMs);

        logger.info(`[CircuitBreaker] Started health checks (interval: ${intervalMs}ms)`);
    }

    /**
     * Stop health checks
     */
    stopHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.info('[CircuitBreaker] Stopped health checks');
        }
    }

    /**
     * Run health check for all components
     */
    async runAllHealthChecks(): Promise<HealthCheckResult[]> {
        const results = await Promise.allSettled([
            this.checkExecutionEngine(),
            this.checkRiskManager(),
            this.checkAPIConnectivity(),
            this.checkDatabase(),
            this.checkVectorStore(),
            this.checkGLMService(),
            this.checkSafetyMonitor(),
        ]);

        const healthResults = results
            .filter((r): r is { status: 'fulfilled'; value: HealthCheckResult } => r.status === 'fulfilled')
            .map((r) => r.value);

        // Store in history
        this.healthHistory.push(...healthResults);

        // Keep only last 1000 results
        if (this.healthHistory.length > 1000) {
            this.healthHistory = this.healthHistory.slice(-1000);
        }

        // Check for critical issues
        const criticalResults = healthResults.filter((r) => r.status === 'CRITICAL');
        if (criticalResults.length > 0) {
            for (const result of criticalResults) {
                this.triggerAlert(result);
            }
        }

        return healthResults;
    }

    /**
     * Check execution engine health
     */
    private async checkExecutionEngine(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const isConfigured = executionEngine.isConfigured();
            const portfolio = await executionEngine.getPortfolio();

            if (portfolio.totalValue > 0) {
                this.safetyMonitor.updateAccountValue(portfolio.totalValue);
            }

            const responseTime = Date.now() - startTime;

            let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' = 'HEALTHY';
            let message = 'Execution engine operational';

            if (!isConfigured) {
                status = 'DEGRADED';
                message = 'Execution engine not configured';
            }

            if (portfolio.totalValue === 0) {
                status = 'DEGRADED';
                message = 'Portfolio has zero value';
            }

            return {
                component: 'execution-engine',
                status,
                message,
                timestamp: new Date(),
                metrics: {
                    isConfigured,
                    portfolioValue: portfolio.totalValue,
                    availableBalance: portfolio.availableBalance,
                    positionsCount: portfolio.positions.length,
                },
                responseTime,
            };
        } catch (error) {
            return {
                component: 'execution-engine',
                status: 'UNHEALTHY',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check risk manager health
     */
    private async checkRiskManager(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const riskMetrics = riskManager.getRiskMetrics();

            const responseTime = Date.now() - startTime;

            let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' = 'HEALTHY';
            let message = 'Risk manager operational';

            if (riskMetrics.emergencyStop) {
                status = 'CRITICAL';
                message = 'Emergency stop is active';
            }

            if (riskMetrics.riskUtilization > 0.9) {
                status = 'DEGRADED';
                message = `Risk utilization at ${(riskMetrics.riskUtilization * 100).toFixed(0)}%`;
            }

            if (Math.abs(riskMetrics.dailyPnL) > riskMetrics.maxDailyLoss * 0.8) {
                status = 'DEGRADED';
                message = `Approaching daily loss limit: ${riskMetrics.dailyPnL.toFixed(2)}`;
            }

            return {
                component: 'risk-manager',
                status,
                message,
                timestamp: new Date(),
                metrics: riskMetrics,
                responseTime,
            };
        } catch (error) {
            return {
                component: 'risk-manager',
                status: 'UNHEALTHY',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check API connectivity
     */
    private async checkAPIConnectivity(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            // Try to validate credentials
            const isValid = await executionEngine.validateCredentials();

            const responseTime = Date.now() - startTime;

            return {
                component: 'api-hyperliquid',
                status: isValid ? 'HEALTHY' : 'UNHEALTHY',
                message: isValid ? 'API connectivity OK' : 'API validation failed',
                timestamp: new Date(),
                metrics: { isValid, responseTime },
                responseTime,
            };
        } catch (error) {
            return {
                component: 'api-hyperliquid',
                status: 'UNHEALTHY',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check database health
     */
    private async checkDatabase(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            // Simple health check - pull recent trades and feed safety monitor
            const trades = await executionEngine.getRecentTrades(25);
            this.recordRecentTradesForSafety(trades);

            const responseTime = Date.now() - startTime;

            return {
                component: 'database',
                status: 'HEALTHY',
                message: 'Database operational',
                timestamp: new Date(),
                metrics: { recentTradesCount: trades.length },
                responseTime,
            };
        } catch (error) {
            return {
                component: 'database',
                status: 'UNHEALTHY',
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    private recordRecentTradesForSafety(trades: Trade[]): void {
        for (const trade of trades) {
            this.safetyMonitor.recordTrade({
                id: trade.id,
                symbol: trade.symbol,
                pnl: trade.pnl ?? 0,
                timestamp: trade.timestamp,
            });
        }
    }

    /**
     * Check vector store health
     */
    private async checkVectorStore(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const vectorStore = await import('../data/vector-store');
            const stats = await vectorStore.default.getStats();

            const responseTime = Date.now() - startTime;

            return {
                component: 'vector-store',
                status: 'HEALTHY',
                message: 'Vector store operational',
                timestamp: new Date(),
                metrics: stats,
                responseTime,
            };
        } catch (error) {
            return {
                component: 'vector-store',
                status: 'DEGRADED', // Non-critical
                message: `Vector store unavailable: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check GLM service health
     */
    private async checkGLMService(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const glmService = await import('../shared/glm-service');
            const canUse = glmService.default.canUseService();

            const responseTime = Date.now() - startTime;

            return {
                component: 'glm-service',
                status: canUse ? 'HEALTHY' : 'DEGRADED',
                message: canUse ? 'GLM service available' : 'GLM service not configured',
                timestamp: new Date(),
                metrics: { canUse },
                responseTime,
            };
        } catch (error) {
            return {
                component: 'glm-service',
                status: 'DEGRADED', // Non-critical
                message: `Error: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date(),
                metrics: {},
                responseTime: Date.now() - startTime,
            };
        }
    }

    /**
     * Check safety monitor health.
     */
    private async checkSafetyMonitor(): Promise<HealthCheckResult> {
        const startTime = Date.now();
        const result = this.safetyMonitor.getHealthCheckResult();
        return {
            ...result,
            responseTime: Date.now() - startTime,
        };
    }

    /**
     * Get health check history
     */
    getHealthHistory(component?: string, limit: number = 100): HealthCheckResult[] {
        let history = this.healthHistory;

        if (component) {
            history = history.filter((h) => h.component === component);
        }

        return history.slice(-limit);
    }

    /**
     * Get circuit breaker status
     */
    getBreakerStatus(name: string): CircuitBreakerState | undefined {
        return this.breakers.get(name);
    }

    /**
     * Get all circuit breaker statuses
     */
    getAllBreakerStatuses(): CircuitBreakerState[] {
        return Array.from(this.breakers.values());
    }

    /**
     * Get the safety monitor singleton bound to this circuit breaker system.
     */
    getSafetyMonitor(): SafetyMonitor {
        return this.safetyMonitor;
    }

    /**
     * Record a completed trade into safety monitoring.
     */
    recordTrade(trade: SafetyTradeInput): void {
        this.safetyMonitor.recordTrade(trade);
    }

    /**
     * Update account value in safety monitoring.
     */
    updateAccountValue(value: number): void {
        this.safetyMonitor.updateAccountValue(value);
    }

    /**
     * Update BTC 1h volatility in safety monitoring.
     */
    updateBTCVolatility(volatility1h: number): void {
        this.safetyMonitor.updateBTCVolatility(volatility1h);
    }

    /**
     * Check whether a symbol can open a new trade under safety constraints.
     */
    canEnterNewTrade(symbol: string): boolean {
        return this.safetyMonitor.canEnterNewTrade(symbol);
    }

    /**
     * Get the current volatility-based position size multiplier.
     */
    getPositionSizeMultiplier(): number {
        return this.safetyMonitor.getPositionSizeMultiplier();
    }

    /**
     * Reset a safety breaker manually with reason.
     */
    resetSafetyCircuitBreaker(type: string, reason: string): boolean {
        return this.safetyMonitor.resetCircuitBreaker(type, reason);
    }

    /**
     * Get safety subsystem status.
     */
    getSafetyStatus(): SafetyStatus {
        return this.safetyMonitor.getSafetyStatus();
    }

    /**
     * Reset a circuit breaker
     */
    resetBreaker(name: string): boolean {
        const breaker = this.breakers.get(name);
        if (!breaker) {
            return this.safetyMonitor.resetCircuitBreaker(name, 'Reset via circuit breaker API');
        }

        breaker.isOpen = false;
        breaker.openAt = null;
        breaker.errorCount = 0;
        breaker.successCount = 0;

        logger.info(`[CircuitBreaker] Reset breaker: ${name}`);
        return true;
    }

    /**
     * Manually open a circuit breaker (for emergency)
     */
    openBreaker(name: string): boolean {
        const breaker = this.breakers.get(name);
        if (!breaker) return false;

        breaker.isOpen = true;
        breaker.openAt = new Date();

        logger.warn(`[CircuitBreaker] Manually opened breaker: ${name}`);
        this.handleBreakerOpen(name);

        return true;
    }

    /**
     * Register alert callback
     */
    onAlert(callback: (result: HealthCheckResult) => void): void {
        this.alertCallbacks.push(callback);
    }

    /**
     * Trigger alert to all callbacks
     */
    private triggerAlert(result: HealthCheckResult): void {
        for (const callback of this.alertCallbacks) {
            try {
                callback(result);
            } catch (error) {
                logger.error('[CircuitBreaker] Alert callback failed:', error);
            }
        }
    }

    /**
     * Get system health summary
     */
    async getHealthSummary(): Promise<{
        overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL';
        components: HealthCheckResult[];
        breakers: CircuitBreakerState[];
        safety: SafetyStatus;
        timestamp: Date;
    }> {
        const components = await this.runAllHealthChecks();
        const breakers = this.getAllBreakerStatuses();
        const safety = this.getSafetyStatus();

        let overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'CRITICAL' = 'HEALTHY';

        // Check for critical issues
        if (components.some((c) => c.status === 'CRITICAL') || breakers.some((b) => b.isOpen)) {
            overall = 'CRITICAL';
        }
        // Check for unhealthy components
        else if (components.some((c) => c.status === 'UNHEALTHY')) {
            overall = 'UNHEALTHY';
        }
        // Check for degraded components
        else if (components.some((c) => c.status === 'DEGRADED')) {
            overall = 'DEGRADED';
        }

        return {
            overall,
            components,
            breakers,
            safety,
            timestamp: new Date(),
        };
    }
}

// Singleton instance
const circuitBreaker = new CircuitBreakerSystem();
export const safetyMonitor = circuitBreaker.getSafetyMonitor();

export default circuitBreaker;
