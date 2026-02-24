"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safetyMonitor = exports.SafetyMonitor = void 0;
const logger_1 = __importDefault(require("./logger"));
class SafetyMonitor {
    dailyLoss = 0;
    dailyTrades = 0;
    consecutiveLosses = 0;
    lastReset = Date.now();
    peakBalance = 0;
    emergencyStop = false;
    stopReason = '';
    // Limits
    MAX_DAILY_LOSS = 50; // $50
    MAX_DAILY_TRADES = 20;
    MAX_CONSECUTIVE_LOSSES = 5;
    MAX_DRAWDOWN_PCT = 0.15; // 15%
    recordTrade(pnl, balance) {
        this.checkNewDay();
        this.dailyTrades++;
        this.dailyLoss += pnl;
        if (pnl < 0)
            this.consecutiveLosses++;
        else
            this.consecutiveLosses = 0;
        if (balance > this.peakBalance)
            this.peakBalance = balance;
        this.checkLimits(balance);
    }
    checkLimits(balance) {
        // Daily loss
        if (this.dailyLoss < -this.MAX_DAILY_LOSS) {
            this.emergencyStop = true;
            this.stopReason = `Daily loss limit exceeded: $${this.dailyLoss.toFixed(2)}`;
            logger_1.default.error(`🛑 CIRCUIT BREAKER: ${this.stopReason}`);
        }
        // Trade limit
        if (this.dailyTrades > this.MAX_DAILY_TRADES) {
            this.emergencyStop = true;
            this.stopReason = `Daily trade limit exceeded: ${this.dailyTrades}`;
            logger_1.default.error(`🛑 CIRCUIT BREAKER: ${this.stopReason}`);
        }
        // Consecutive losses
        if (this.consecutiveLosses >= this.MAX_CONSECUTIVE_LOSSES) {
            this.emergencyStop = true;
            this.stopReason = `Consecutive loss limit: ${this.consecutiveLosses}`;
            logger_1.default.error(`🛑 CIRCUIT BREAKER: ${this.stopReason}`);
        }
        // Drawdown
        const drawdown = (this.peakBalance - balance) / this.peakBalance;
        if (drawdown > this.MAX_DRAWDOWN_PCT) {
            this.emergencyStop = true;
            this.stopReason = `Max drawdown exceeded: ${(drawdown * 100).toFixed(1)}%`;
            logger_1.default.error(`🛑 CIRCUIT BREAKER: ${this.stopReason}`);
        }
    }
    canTrade() {
        this.checkNewDay();
        return !this.emergencyStop;
    }
    getStatus() {
        return {
            dailyLoss: this.dailyLoss,
            dailyTrades: this.dailyTrades,
            consecutiveLosses: this.consecutiveLosses,
            emergencyStop: this.emergencyStop,
            stopReason: this.stopReason
        };
    }
    reset() {
        this.emergencyStop = false;
        this.stopReason = '';
        this.dailyLoss = 0;
        this.dailyTrades = 0;
        this.consecutiveLosses = 0;
        logger_1.default.info('Safety monitor reset');
    }
    checkNewDay() {
        const now = Date.now();
        if (now - this.lastReset > 24 * 60 * 60 * 1000) {
            this.dailyLoss = 0;
            this.dailyTrades = 0;
            this.lastReset = now;
            logger_1.default.info('Daily counters reset');
        }
    }
}
exports.SafetyMonitor = SafetyMonitor;
exports.safetyMonitor = new SafetyMonitor();
//# sourceMappingURL=safety-monitor.js.map