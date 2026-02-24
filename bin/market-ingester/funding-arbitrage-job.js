#!/usr/bin/env node
"use strict";
/**
 * Funding Rate Arbitrage Background Job
 *
 * Updates funding rates every 5 minutes and sends alerts for extreme funding events
 * Run with: node bin/funding-arbitrage-job.js
 * Cron: Every 5 minutes
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FundingArbitrageJob = void 0;
const funding_arbitrage_scanner_1 = __importDefault(require("./funding-arbitrage-scanner"));
const logger_1 = __importDefault(require("../shared/logger"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// Configuration
const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EXTREME_THRESHOLD_APR = 50; // 50% APR
const HIGH_URGENCY_THRESHOLD_APR = 100; // 100% APR
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
class FundingArbitrageJob {
    isRunning = false;
    updateTimer = null;
    cleanupTimer = null;
    async start() {
        if (this.isRunning) {
            logger_1.default.warn('[FundingJob] Job is already running');
            return;
        }
        logger_1.default.info('[FundingJob] Starting funding arbitrage background job...');
        logger_1.default.info(`[FundingJob] Update interval: ${UPDATE_INTERVAL_MS / 1000}s`);
        logger_1.default.info(`[FundingJob] Extreme threshold: ${EXTREME_THRESHOLD_APR}% APR`);
        try {
            // Initialize scanner
            await funding_arbitrage_scanner_1.default.initialize();
            this.isRunning = true;
            // Run immediately on start
            await this.runUpdate();
            // Schedule periodic updates
            this.updateTimer = setInterval(() => {
                this.runUpdate().catch(err => {
                    logger_1.default.error('[FundingJob] Scheduled update failed:', err);
                });
            }, UPDATE_INTERVAL_MS);
            // Schedule cleanup
            this.cleanupTimer = setInterval(() => {
                this.runCleanup().catch(err => {
                    logger_1.default.error('[FundingJob] Cleanup failed:', err);
                });
            }, CLEANUP_INTERVAL_MS);
            logger_1.default.info('[FundingJob] Background job started successfully');
        }
        catch (error) {
            logger_1.default.error('[FundingJob] Failed to start:', error);
            throw error;
        }
    }
    async stop() {
        logger_1.default.info('[FundingJob] Stopping background job...');
        this.isRunning = false;
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        logger_1.default.info('[FundingJob] Background job stopped');
    }
    async runUpdate() {
        const startTime = Date.now();
        logger_1.default.info('[FundingJob] Running funding rate update...');
        try {
            // Scan all funding rates (single exchange)
            const rates = await funding_arbitrage_scanner_1.default.scanAllFundingRates();
            logger_1.default.info(`[FundingJob] Scanned ${rates.length} markets`);
            // Identify opportunities (single exchange)
            const opportunities = await funding_arbitrage_scanner_1.default.identifyOpportunities(EXTREME_THRESHOLD_APR / 100);
            logger_1.default.info(`[FundingJob] Identified ${opportunities.length} single-exchange opportunities`);
            // Compare similar assets
            await funding_arbitrage_scanner_1.default.compareSimilarAssets();
            // Scan cross-exchange arbitrage opportunities
            logger_1.default.info('[FundingJob] Scanning cross-exchange arbitrage...');
            const crossExchangeOpps = await funding_arbitrage_scanner_1.default.scanCrossExchangeArbitrage();
            logger_1.default.info(`[FundingJob] Found ${crossExchangeOpps.length} cross-exchange opportunities`);
            // Log cross-exchange opportunities
            for (const opp of crossExchangeOpps) {
                const action = opp.longExchange && opp.shortExchange
                    ? `Long ${this.formatExchangeName(opp.longExchange)} / Short ${this.formatExchangeName(opp.shortExchange)}`
                    : 'Monitor';
                const emoji = opp.urgency === 'high' ? '🔥' : opp.urgency === 'medium' ? '⚡' : '💡';
                logger_1.default.info(`[FundingJob] ${emoji} CROSS-EXCHANGE ${opp.symbol} ${this.formatExchangeName(opp.exchangeA)}/${this.formatExchangeName(opp.exchangeB)}: ` +
                    `${opp.annualizedSpread.toFixed(2)}% spread - ${action} (${opp.confidence.toFixed(0)}% confidence)`);
            }
            // Check for extreme events and send alerts
            await this.checkAndAlert(opportunities);
            // Check for cross-exchange alerts
            await this.checkCrossExchangeAlerts(crossExchangeOpps);
            const duration = Date.now() - startTime;
            logger_1.default.info(`[FundingJob] Update completed in ${duration}ms`);
        }
        catch (error) {
            logger_1.default.error('[FundingJob] Update failed:', error);
        }
    }
    async checkAndAlert(opportunities) {
        // Filter for high urgency alerts
        const highUrgency = opportunities.filter(o => Math.abs(o.annualizedRate) >= HIGH_URGENCY_THRESHOLD_APR);
        if (highUrgency.length > 0) {
            logger_1.default.warn(`[FundingJob] ${highUrgency.length} HIGH URGENCY funding opportunities detected!`);
            for (const opp of highUrgency) {
                const direction = opp.type === 'long' ? '🟢 LONG' : '🔴 SHORT';
                const urgency = opp.urgency.toUpperCase();
                logger_1.default.warn(`[FundingJob] ALERT [${urgency}] ${direction} ${opp.symbol}: ${opp.annualizedRate.toFixed(2)}% APR`);
                logger_1.default.warn(`[FundingJob] Reason: ${opp.reason}`);
                // Here you could add:
                // - Telegram notifications
                // - Discord webhooks
                // - Email alerts
                // - In-app notifications
                await this.sendNotification(opp);
            }
        }
        // Log all opportunities at info level
        for (const opp of opportunities) {
            const emoji = opp.type === 'long' ? '🟢' : '🔴';
            logger_1.default.info(`[FundingJob] ${emoji} ${opp.type.toUpperCase()} ${opp.symbol}: ${opp.annualizedRate.toFixed(2)}% APR (Score: ${opp.opportunityScore.toFixed(1)})`);
        }
    }
    async checkCrossExchangeAlerts(opportunities) {
        // Filter for high urgency cross-exchange opportunities
        const highUrgency = opportunities.filter(o => o.urgency === 'high' && o.confidence >= 70);
        if (highUrgency.length > 0) {
            logger_1.default.warn(`[FundingJob] ${highUrgency.length} HIGH URGENCY cross-exchange opportunities detected!`);
            for (const opp of highUrgency) {
                const action = opp.longExchange && opp.shortExchange
                    ? `Long ${this.formatExchangeName(opp.longExchange)} / Short ${this.formatExchangeName(opp.shortExchange)}`
                    : opp.recommendedAction || 'Monitor';
                logger_1.default.warn(`[FundingJob] CROSS-EXCHANGE ALERT [${opp.urgency.toUpperCase()}] ` +
                    `${opp.symbol} ${this.formatExchangeName(opp.exchangeA)}/${this.formatExchangeName(opp.exchangeB)}: ` +
                    `${opp.annualizedSpread.toFixed(2)}% spread`);
                logger_1.default.warn(`[FundingJob] Action: ${action} (Confidence: ${opp.confidence.toFixed(0)}%)`);
                await this.sendCrossExchangeNotification(opp);
            }
        }
    }
    async sendCrossExchangeNotification(opportunity) {
        const notificationsEnabled = process.env.FUNDING_ALERTS_ENABLED === 'true';
        if (!notificationsEnabled)
            return;
        try {
            const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
            const telegramChatId = process.env.TELEGRAM_CHAT_ID;
            if (telegramToken && telegramChatId) {
                const { default: TelegramBot } = await Promise.resolve().then(() => __importStar(require('node-telegram-bot-api')));
                const bot = new TelegramBot(telegramToken, { polling: false });
                const action = opportunity.longExchange && opportunity.shortExchange
                    ? `🟢 Long ${this.formatExchangeName(opportunity.longExchange)} / 🔴 Short ${this.formatExchangeName(opportunity.shortExchange)}`
                    : (opportunity.recommendedAction || 'Monitor');
                const rateA = (opportunity.exchangeAFunding * 100).toFixed(4);
                const rateB = (opportunity.exchangeBFunding * 100).toFixed(4);
                const exchangeAName = this.formatExchangeName(opportunity.exchangeA);
                const exchangeBName = this.formatExchangeName(opportunity.exchangeB);
                const message = `
⚡ <b>CROSS-EXCHANGE ARBITRAGE ALERT</b> ⚡

<b>${opportunity.symbol}</b> Funding Rate Divergence

📊 ${exchangeAName}: <code>${rateA}%</code>
📊 ${exchangeBName}: <code>${rateB}%</code>
📈 Spread: <code>${opportunity.annualizedSpread.toFixed(2)}% APR</code>

🎯 <b>Action:</b> ${action}
🚨 Urgency: ${opportunity.urgency.toUpperCase()}
✅ Confidence: ${opportunity.confidence.toFixed(0)}%

💰 Est. Yearly Yield: ${opportunity.annualizedSpread.toFixed(2)}%

<a href="${process.env.DASHBOARD_URL || 'http://localhost:3001'}/funding-arbitrage.html">Execute in Dashboard →</a>
        `.trim();
                await bot.sendMessage(telegramChatId, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });
                logger_1.default.info(`[FundingJob] Cross-exchange Telegram notification sent for ${opportunity.symbol}`);
            }
        }
        catch (error) {
            logger_1.default.error('[FundingJob] Failed to send cross-exchange notification:', error);
        }
    }
    formatExchangeName(exchange) {
        switch (exchange) {
            case 'hyperliquid':
                return 'Hyperliquid';
            case 'asterdex':
                return 'Asterdex';
            case 'binance':
                return 'Binance';
            default:
                return exchange;
        }
    }
    async sendNotification(opportunity) {
        // Check if notifications are enabled
        const notificationsEnabled = process.env.FUNDING_ALERTS_ENABLED === 'true';
        if (!notificationsEnabled)
            return;
        try {
            // Telegram notification (if configured)
            const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
            const telegramChatId = process.env.TELEGRAM_CHAT_ID;
            if (telegramToken && telegramChatId) {
                const { default: TelegramBot } = await Promise.resolve().then(() => __importStar(require('node-telegram-bot-api')));
                const bot = new TelegramBot(telegramToken, { polling: false });
                const direction = opportunity.type === 'long' ? '🟢 LONG' : '🔴 SHORT';
                const message = `
⚠️ <b>EXTREME FUNDING ALERT</b> ⚠️

${direction} <b>${opportunity.symbol}</b>
📊 Annualized Rate: <code>${opportunity.annualizedRate.toFixed(2)}% APR</code>
🚨 Urgency: ${opportunity.urgency.toUpperCase()}

${opportunity.reason}

<a href="${process.env.DASHBOARD_URL || 'http://localhost:3001'}/funding-arbitrage.html">View in Dashboard →</a>
        `.trim();
                await bot.sendMessage(telegramChatId, message, {
                    parse_mode: 'HTML',
                    disable_web_page_preview: true
                });
                logger_1.default.info(`[FundingJob] Telegram notification sent for ${opportunity.symbol}`);
            }
            // Discord webhook (if configured)
            const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
            if (discordWebhook) {
                const color = opportunity.type === 'long' ? 0x00ff9d : 0xff3e3e;
                await fetch(discordWebhook, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        embeds: [{
                                title: `⚠️ Extreme Funding Alert: ${opportunity.symbol}`,
                                description: opportunity.reason,
                                color,
                                fields: [
                                    { name: 'Type', value: opportunity.type.toUpperCase(), inline: true },
                                    { name: 'APR', value: `${opportunity.annualizedRate.toFixed(2)}%`, inline: true },
                                    { name: 'Urgency', value: opportunity.urgency.toUpperCase(), inline: true },
                                ],
                                timestamp: new Date().toISOString(),
                            }]
                    })
                });
                logger_1.default.info(`[FundingJob] Discord notification sent for ${opportunity.symbol}`);
            }
        }
        catch (error) {
            logger_1.default.error('[FundingJob] Failed to send notification:', error);
        }
    }
    async runCleanup() {
        logger_1.default.info('[FundingJob] Running cleanup...');
        try {
            // Keep 7 days of history
            await funding_arbitrage_scanner_1.default.cleanupOldData(7);
            logger_1.default.info('[FundingJob] Cleanup completed');
        }
        catch (error) {
            logger_1.default.error('[FundingJob] Cleanup failed:', error);
        }
    }
}
exports.FundingArbitrageJob = FundingArbitrageJob;
// Create and start job
const job = new FundingArbitrageJob();
// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger_1.default.info('[FundingJob] SIGINT received, shutting down...');
    await job.stop();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    logger_1.default.info('[FundingJob] SIGTERM received, shutting down...');
    await job.stop();
    process.exit(0);
});
// Start the job
job.start().catch(err => {
    logger_1.default.error('[FundingJob] Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=funding-arbitrage-job.js.map