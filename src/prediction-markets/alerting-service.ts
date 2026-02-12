// Alerting Service for Prediction Markets
// Sends notifications via Telegram, Discord, or webhooks

import axios from 'axios';
import logger from '../../shared/logger';
import { PredictionTrade, PredictionPosition, PredictionPortfolio } from '../../shared/types';

interface AlertConfig {
  telegram?: {
    botToken: string;
    chatId: string;
  };
  discord?: {
    webhookUrl: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
}

interface AlertMessage {
  type: 'TRADE' | 'STOP_LOSS' | 'DAILY_PNL' | 'EMERGENCY_STOP' | 'ERROR' | 'INFO';
  title: string;
  message: string;
  data?: Record<string, any>;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

class AlertingService {
  private config: AlertConfig;
  private alertHistory: Array<{ timestamp: number; message: AlertMessage } > = [];
  private readonly MAX_HISTORY = 1000;
  private dailyReportScheduled = false;

  constructor() {
    this.config = this.loadConfig();
    this.scheduleDailyReport();
  }

  private loadConfig(): AlertConfig {
    return {
      telegram: process.env.PREDICTION_TELEGRAM_BOT_TOKEN && process.env.PREDICTION_TELEGRAM_CHAT_ID
        ? {
            botToken: process.env.PREDICTION_TELEGRAM_BOT_TOKEN,
            chatId: process.env.PREDICTION_TELEGRAM_CHAT_ID,
          }
        : undefined,
      discord: process.env.PREDICTION_DISCORD_WEBHOOK
        ? {
            webhookUrl: process.env.PREDICTION_DISCORD_WEBHOOK,
          }
        : undefined,
      webhook: process.env.PREDICTION_ALERT_WEBHOOK
        ? {
            url: process.env.PREDICTION_ALERT_WEBHOOK,
            headers: process.env.PREDICTION_ALERT_WEBHOOK_HEADERS
              ? JSON.parse(process.env.PREDICTION_ALERT_WEBHOOK_HEADERS)
              : undefined,
          }
        : undefined,
    };
  }

  private scheduleDailyReport(): void {
    if (this.dailyReportScheduled) return;
    
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.sendDailyPnLReport();
      this.dailyReportScheduled = false;
      this.scheduleDailyReport();
    }, msUntilMidnight);
    
    this.dailyReportScheduled = true;
  }

  // ========================================================================
  // ALERT METHODS
  // ========================================================================

  /**
   * Alert on trade execution
   */
  public async tradeExecuted(trade: PredictionTrade, portfolio: PredictionPortfolio): Promise<void> {
    const emoji = trade.side === 'BUY' ? '🟢' : '🔴';
    const pnlEmoji = (trade.pnl || 0) > 0 ? '📈' : (trade.pnl || 0) < 0 ? '📉' : '➖';
    
    const message: AlertMessage = {
      type: 'TRADE',
      title: `${emoji} Trade Executed: ${trade.marketTitle}`,
      message: `
**Side:** ${trade.side} ${trade.outcome}
**Shares:** ${trade.shares.toFixed(4)}
**Price:** $${trade.price.toFixed(4)}
**Size:** $${(trade.shares * trade.price).toFixed(2)}
**Fee:** $${trade.fee.toFixed(4)}
${trade.pnl !== undefined ? `**P&L:** ${pnlEmoji} $${trade.pnl.toFixed(2)}` : ''}
**Portfolio Value:** $${portfolio.totalValue.toFixed(2)}
**Available:** $${portfolio.availableBalance.toFixed(2)}
      `.trim(),
      data: { trade, portfolio },
      priority: trade.pnl && trade.pnl < -10 ? 'HIGH' : 'MEDIUM',
    };

    await this.sendAlert(message);
  }

  /**
   * Alert on stop loss trigger
   */
  public async stopLossTriggered(
    position: PredictionPosition,
    exitPrice: number,
    pnl: number
  ): Promise<void> {
    const message: AlertMessage = {
      type: 'STOP_LOSS',
      title: '🛑 Stop Loss Triggered',
      message: `
**Market:** ${position.marketTitle}
**Outcome:** ${position.outcome}
**Entry:** $${position.averagePrice.toFixed(4)}
**Exit:** $${exitPrice.toFixed(4)}
**Shares:** ${position.shares.toFixed(4)}
**P&L:** $${pnl.toFixed(2)}
      `.trim(),
      data: { position, exitPrice, pnl },
      priority: 'HIGH',
    };

    await this.sendAlert(message);
  }

  /**
   * Alert on emergency stop
   */
  public async emergencyStop(reason: string, portfolio: PredictionPortfolio): Promise<void> {
    const message: AlertMessage = {
      type: 'EMERGENCY_STOP',
      title: '🚨 EMERGENCY STOP TRIGGERED 🚨',
      message: `
**Reason:** ${reason}
**Portfolio Value:** $${portfolio.totalValue.toFixed(2)}
**Realized P&L:** $${portfolio.realizedPnL.toFixed(2)}
**Unrealized P&L:** $${portfolio.unrealizedPnL.toFixed(2)}
**Time:** ${new Date().toISOString()}

⚠️ All trading has been halted. Manual intervention required.
      `.trim(),
      data: { reason, portfolio },
      priority: 'CRITICAL',
    };

    await this.sendAlert(message);
  }

  /**
   * Alert on error
   */
  public async error(error: Error, context?: string): Promise<void> {
    const message: AlertMessage = {
      type: 'ERROR',
      title: '❌ System Error',
      message: `
**Context:** ${context || 'Unknown'}
**Error:** ${error.message}
**Stack:** ${error.stack?.substring(0, 500) || 'N/A'}
**Time:** ${new Date().toISOString()}
      `.trim(),
      data: { error: error.message, context },
      priority: 'HIGH',
    };

    await this.sendAlert(message);
  }

  /**
   * Daily P&L report
   */
  public async dailyPnLReport(
    dailyPnL: number,
    totalTrades: number,
    winRate: number,
    portfolio: PredictionPortfolio
  ): Promise<void> {
    const emoji = dailyPnL >= 0 ? '🟢' : '🔴';
    const message: AlertMessage = {
      type: 'DAILY_PNL',
      title: `${emoji} Daily P&L Report - ${new Date().toDateString()}`,
      message: `
**Daily P&L:** $${dailyPnL.toFixed(2)} ${dailyPnL >= 0 ? '📈' : '📉'}
**Total Trades:** ${totalTrades}
**Win Rate:** ${winRate.toFixed(1)}%
**Portfolio Value:** $${portfolio.totalValue.toFixed(2)}
**Realized P&L:** $${portfolio.realizedPnL.toFixed(2)}
**Unrealized P&L:** $${portfolio.unrealizedPnL.toFixed(2)}
**Open Positions:** ${portfolio.positions.length}
      `.trim(),
      data: { dailyPnL, totalTrades, winRate, portfolio },
      priority: 'MEDIUM',
    };

    await this.sendAlert(message);
  }

  /**
   * Generic info alert
   */
  public async info(title: string, message: string, data?: Record<string, any>): Promise<void> {
    const alert: AlertMessage = {
      type: 'INFO',
      title: `ℹ️ ${title}`,
      message,
      data,
      priority: 'LOW',
    };

    await this.sendAlert(alert);
  }

  // ========================================================================
  // CORE SENDING LOGIC
  // ========================================================================

  private async sendAlert(message: AlertMessage): Promise<void> {
    // Log to history
    this.alertHistory.push({ timestamp: Date.now(), message });
    if (this.alertHistory.length > this.MAX_HISTORY) {
      this.alertHistory.shift();
    }

    // Log to console
    logger.info(`[Alert] ${message.title}: ${message.message.substring(0, 100)}...`);

    // Send to configured channels
    const promises: Promise<void>[] = [];

    if (this.config.telegram) {
      promises.push(this.sendTelegram(message));
    }

    if (this.config.discord) {
      promises.push(this.sendDiscord(message));
    }

    if (this.config.webhook) {
      promises.push(this.sendWebhook(message));
    }

    // Don't let alert failures break trading
    try {
      await Promise.all(promises);
    } catch (error) {
      logger.error('[AlertingService] Failed to send alert:', error);
    }
  }

  private async sendTelegram(message: AlertMessage): Promise<void> {
    if (!this.config.telegram) return;

    const color = message.priority === 'CRITICAL' ? '🔴' : 
                  message.priority === 'HIGH' ? '🟠' : 
                  message.priority === 'MEDIUM' ? '🟡' : '⚪';

    const text = `${color} *${message.title}*\n\n${message.message}`;

    try {
      await axios.post(
        `https://api.telegram.org/bot${this.config.telegram.botToken}/sendMessage`,
        {
          chat_id: this.config.telegram.chatId,
          text,
          parse_mode: 'Markdown',
          disable_notification: message.priority === 'LOW',
        },
        { timeout: 10000 }
      );
    } catch (error) {
      logger.error('[AlertingService] Telegram send failed:', error);
    }
  }

  private async sendDiscord(message: AlertMessage): Promise<void> {
    if (!this.config.discord) return;

    const color = message.priority === 'CRITICAL' ? 0xFF0000 :
                  message.priority === 'HIGH' ? 0xFFA500 :
                  message.priority === 'MEDIUM' ? 0xFFFF00 : 0x808080;

    try {
      await axios.post(
        this.config.discord.webhookUrl,
        {
          embeds: [{
            title: message.title,
            description: message.message,
            color,
            timestamp: new Date().toISOString(),
            footer: {
              text: `Priority: ${message.priority}`,
            },
          }],
        },
        { timeout: 10000 }
      );
    } catch (error) {
      logger.error('[AlertingService] Discord send failed:', error);
    }
  }

  private async sendWebhook(message: AlertMessage): Promise<void> {
    if (!this.config.webhook) return;

    try {
      await axios.post(
        this.config.webhook.url,
        {
          ...message,
          timestamp: new Date().toISOString(),
        },
        {
          headers: this.config.webhook.headers || { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );
    } catch (error) {
      logger.error('[AlertingService] Webhook send failed:', error);
    }
  }

  private async sendDailyPnLReport(): Promise<void> {
    // This would integrate with the risk manager or portfolio tracker
    // For now, just send a placeholder
    await this.info('Daily Report', 'Daily P&L report placeholder - integrate with risk manager');
  }

  // ========================================================================
  // EXPORT FUNCTIONS
  // ========================================================================

  /**
   * Export trade journal for tax reporting
   */
  public exportTradeJournal(trades: PredictionTrade[]): string {
    const headers = [
      'Date',
      'Market ID',
      'Market Title',
      'Outcome',
      'Side',
      'Shares',
      'Price',
      'Fee',
      'P&L',
      'Reason',
    ];

    const rows = trades.map(t => [
      t.timestamp.toISOString(),
      t.marketId,
      t.marketTitle,
      t.outcome,
      t.side,
      t.shares.toFixed(6),
      t.price.toFixed(6),
      t.fee.toFixed(6),
      (t.pnl || 0).toFixed(2),
      t.reason || '',
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * Get alert history
   */
  public getAlertHistory(
    type?: AlertMessage['type'],
    since?: number
  ): Array<{ timestamp: number; message: AlertMessage }> {
    return this.alertHistory.filter(a => {
      if (type && a.message.type !== type) return false;
      if (since && a.timestamp < since) return false;
      return true;
    });
  }

  /**
   * Test all alert channels
   */
  public async testAlerts(): Promise<{
    telegram: boolean;
    discord: boolean;
    webhook: boolean;
  }> {
    const results = {
      telegram: false,
      discord: false,
      webhook: false,
    };

    const testMessage: AlertMessage = {
      type: 'INFO',
      title: 'Test Alert',
      message: 'This is a test alert from the Prediction Markets system.',
      priority: 'LOW',
    };

    if (this.config.telegram) {
      try {
        await this.sendTelegram(testMessage);
        results.telegram = true;
      } catch {
        results.telegram = false;
      }
    }

    if (this.config.discord) {
      try {
        await this.sendDiscord(testMessage);
        results.discord = true;
      } catch {
        results.discord = false;
      }
    }

    if (this.config.webhook) {
      try {
        await this.sendWebhook(testMessage);
        results.webhook = true;
      } catch {
        results.webhook = false;
      }
    }

    return results;
  }
}

// Singleton instance
const alertingService = new AlertingService();
export default alertingService;
