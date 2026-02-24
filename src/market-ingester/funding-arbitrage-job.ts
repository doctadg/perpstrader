#!/usr/bin/env node
/**
 * Funding Rate Arbitrage Background Job
 * 
 * Updates funding rates every 5 minutes and sends alerts for extreme funding events
 * Run with: node bin/funding-arbitrage-job.js
 * Cron: Every 5 minutes
 */

import fundingArbitrageScanner from './funding-arbitrage-scanner';
import logger from '../shared/logger';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const EXTREME_THRESHOLD_APR = 50; // 50% APR
const HIGH_URGENCY_THRESHOLD_APR = 100; // 100% APR
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

class FundingArbitrageJob {
  private isRunning: boolean = false;
  private updateTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[FundingJob] Job is already running');
      return;
    }

    logger.info('[FundingJob] Starting funding arbitrage background job...');
    logger.info(`[FundingJob] Update interval: ${UPDATE_INTERVAL_MS / 1000}s`);
    logger.info(`[FundingJob] Extreme threshold: ${EXTREME_THRESHOLD_APR}% APR`);

    try {
      // Initialize scanner
      await fundingArbitrageScanner.initialize();
      
      this.isRunning = true;

      // Run immediately on start
      await this.runUpdate();

      // Schedule periodic updates
      this.updateTimer = setInterval(() => {
        this.runUpdate().catch(err => {
          logger.error('[FundingJob] Scheduled update failed:', err);
        });
      }, UPDATE_INTERVAL_MS);

      // Schedule cleanup
      this.cleanupTimer = setInterval(() => {
        this.runCleanup().catch(err => {
          logger.error('[FundingJob] Cleanup failed:', err);
        });
      }, CLEANUP_INTERVAL_MS);

      logger.info('[FundingJob] Background job started successfully');
    } catch (error) {
      logger.error('[FundingJob] Failed to start:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('[FundingJob] Stopping background job...');
    
    this.isRunning = false;
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    logger.info('[FundingJob] Background job stopped');
  }

  private async runUpdate(): Promise<void> {
    const startTime = Date.now();
    logger.info('[FundingJob] Running funding rate update...');

    try {
      // Scan all funding rates (single exchange)
      const rates = await fundingArbitrageScanner.scanAllFundingRates();
      logger.info(`[FundingJob] Scanned ${rates.length} markets`);

      // Identify opportunities (single exchange)
      const opportunities = await fundingArbitrageScanner.identifyOpportunities(
        EXTREME_THRESHOLD_APR / 100
      );
      logger.info(`[FundingJob] Identified ${opportunities.length} single-exchange opportunities`);

      // Compare similar assets
      await fundingArbitrageScanner.compareSimilarAssets();

      // Scan cross-exchange arbitrage opportunities
      logger.info('[FundingJob] Scanning cross-exchange arbitrage...');
      const crossExchangeOpps = await fundingArbitrageScanner.scanCrossExchangeArbitrage();
      logger.info(`[FundingJob] Found ${crossExchangeOpps.length} cross-exchange opportunities`);

      // Log cross-exchange opportunities
      for (const opp of crossExchangeOpps) {
        const action = opp.longExchange && opp.shortExchange
          ? `Long ${this.formatExchangeName(opp.longExchange)} / Short ${this.formatExchangeName(opp.shortExchange)}`
          : 'Monitor';
        const emoji = opp.urgency === 'high' ? '🔥' : opp.urgency === 'medium' ? '⚡' : '💡';
        logger.info(
          `[FundingJob] ${emoji} CROSS-EXCHANGE ${opp.symbol} ${this.formatExchangeName(opp.exchangeA)}/${this.formatExchangeName(opp.exchangeB)}: ` +
          `${opp.annualizedSpread.toFixed(2)}% spread - ${action} (${opp.confidence.toFixed(0)}% confidence)`
        );
      }

      // Check for extreme events and send alerts
      await this.checkAndAlert(opportunities);

      // Check for cross-exchange alerts
      await this.checkCrossExchangeAlerts(crossExchangeOpps);

      const duration = Date.now() - startTime;
      logger.info(`[FundingJob] Update completed in ${duration}ms`);
    } catch (error) {
      logger.error('[FundingJob] Update failed:', error);
    }
  }

  private async checkAndAlert(opportunities: Array<{
    symbol: string;
    type: string;
    currentFunding: number;
    annualizedRate: number;
    opportunityScore: number;
    urgency: string;
    reason: string;
  }>): Promise<void> {
    // Filter for high urgency alerts
    const highUrgency = opportunities.filter(o => 
      Math.abs(o.annualizedRate) >= HIGH_URGENCY_THRESHOLD_APR
    );

    if (highUrgency.length > 0) {
      logger.warn(`[FundingJob] ${highUrgency.length} HIGH URGENCY funding opportunities detected!`);

      for (const opp of highUrgency) {
        const direction = opp.type === 'long' ? '🟢 LONG' : '🔴 SHORT';
        const urgency = opp.urgency.toUpperCase();
        
        logger.warn(`[FundingJob] ALERT [${urgency}] ${direction} ${opp.symbol}: ${opp.annualizedRate.toFixed(2)}% APR`);
        logger.warn(`[FundingJob] Reason: ${opp.reason}`);

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
      logger.info(`[FundingJob] ${emoji} ${opp.type.toUpperCase()} ${opp.symbol}: ${opp.annualizedRate.toFixed(2)}% APR (Score: ${opp.opportunityScore.toFixed(1)})`);
    }
  }

  private async checkCrossExchangeAlerts(opportunities: Array<{
    symbol: string;
    exchangeA: string;
    exchangeB: string;
    exchangeAFunding: number;
    exchangeBFunding: number;
    spread: number;
    annualizedSpread: number;
    recommendedAction: string | null;
    longExchange: string | null;
    shortExchange: string | null;
    urgency: string;
    confidence: number;
  }>): Promise<void> {
    // Filter for high urgency cross-exchange opportunities
    const highUrgency = opportunities.filter(o => 
      o.urgency === 'high' && o.confidence >= 70
    );

    if (highUrgency.length > 0) {
      logger.warn(`[FundingJob] ${highUrgency.length} HIGH URGENCY cross-exchange opportunities detected!`);

      for (const opp of highUrgency) {
        const action = opp.longExchange && opp.shortExchange
          ? `Long ${this.formatExchangeName(opp.longExchange)} / Short ${this.formatExchangeName(opp.shortExchange)}`
          : opp.recommendedAction || 'Monitor';
        
        logger.warn(
          `[FundingJob] CROSS-EXCHANGE ALERT [${opp.urgency.toUpperCase()}] ` +
          `${opp.symbol} ${this.formatExchangeName(opp.exchangeA)}/${this.formatExchangeName(opp.exchangeB)}: ` +
          `${opp.annualizedSpread.toFixed(2)}% spread`
        );
        logger.warn(`[FundingJob] Action: ${action} (Confidence: ${opp.confidence.toFixed(0)}%)`);

        await this.sendCrossExchangeNotification(opp);
      }
    }
  }

  private async sendCrossExchangeNotification(opportunity: {
    symbol: string;
    exchangeA: string;
    exchangeB: string;
    exchangeAFunding: number;
    exchangeBFunding: number;
    spread: number;
    annualizedSpread: number;
    recommendedAction: string | null;
    longExchange: string | null;
    shortExchange: string | null;
    urgency: string;
    confidence: number;
  }): Promise<void> {
    const notificationsEnabled = process.env.FUNDING_ALERTS_ENABLED === 'true';
    if (!notificationsEnabled) return;

    try {
      const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
      const telegramChatId = process.env.TELEGRAM_CHAT_ID;
      
      if (telegramToken && telegramChatId) {
        const { default: TelegramBot } = await import('node-telegram-bot-api');
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

        logger.info(`[FundingJob] Cross-exchange Telegram notification sent for ${opportunity.symbol}`);
      }
    } catch (error) {
      logger.error('[FundingJob] Failed to send cross-exchange notification:', error);
    }
  }

  private formatExchangeName(exchange: string): string {
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

  private async sendNotification(opportunity: {
    symbol: string;
    type: string;
    annualizedRate: number;
    urgency: string;
    reason: string;
  }): Promise<void> {
    // Check if notifications are enabled
    const notificationsEnabled = process.env.FUNDING_ALERTS_ENABLED === 'true';
    if (!notificationsEnabled) return;

    try {
      // Telegram notification (if configured)
      const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
      const telegramChatId = process.env.TELEGRAM_CHAT_ID;
      
      if (telegramToken && telegramChatId) {
        const { default: TelegramBot } = await import('node-telegram-bot-api');
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

        logger.info(`[FundingJob] Telegram notification sent for ${opportunity.symbol}`);
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

        logger.info(`[FundingJob] Discord notification sent for ${opportunity.symbol}`);
      }
    } catch (error) {
      logger.error('[FundingJob] Failed to send notification:', error);
    }
  }

  private async runCleanup(): Promise<void> {
    logger.info('[FundingJob] Running cleanup...');
    
    try {
      // Keep 7 days of history
      await fundingArbitrageScanner.cleanupOldData(7);
      logger.info('[FundingJob] Cleanup completed');
    } catch (error) {
      logger.error('[FundingJob] Cleanup failed:', error);
    }
  }
}

// Create and start job
const job = new FundingArbitrageJob();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('[FundingJob] SIGINT received, shutting down...');
  await job.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('[FundingJob] SIGTERM received, shutting down...');
  await job.stop();
  process.exit(0);
});

// Start the job
job.start().catch(err => {
  logger.error('[FundingJob] Fatal error:', err);
  process.exit(1);
});

export { FundingArbitrageJob };
