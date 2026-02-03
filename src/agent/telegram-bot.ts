// Telegram Bot for Conversational Agent
// Remote communication with the trading system via Telegram

import TelegramBot from 'node-telegram-bot-api';
import { randomUUID } from 'crypto';
import logger from '../shared/logger';
import conversationalAgent from './conversational-agent';
import conversationMemory from './memory';
import { Platform, AgentAlert } from './types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ? Number.parseInt(process.env.TELEGRAM_CHAT_ID) : null;
const TELEGRAM_LINK_SECRET = process.env.TELEGRAM_LINK_SECRET || randomUUID();

// ============================================================================
// TELEGRAM BOT CLASS
// ============================================================================

class TelegramBotService {
  private bot: TelegramBot | null = null;
  private polling: boolean = false;
  private authorizedChatId: number | null = null;
  private pendingConfirmations: Map<string, any> = new Map();

  /**
   * Initialize the Telegram bot
   */
  async initialize(): Promise<void> {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'your_bot_token') {
      logger.info('[TelegramBot] No bot token configured, skipping Telegram integration');
      return;
    }

    try {
      // Create bot with polling (simpler than webhooks for single-user setup)
      this.bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

      // Set up command handlers
      this.setupCommands();

      // Set up message handlers
      this.setupMessageHandlers();

      // Start polling
      await this.startPolling();

      logger.info('[TelegramBot] Initialized successfully');
      logger.info(`[TelegramBot] Link secret: ${TELEGRAM_LINK_SECRET}`);

    } catch (error) {
      logger.error('[TelegramBot] Initialization error:', error);
    }
  }

  /**
   * Set up bot commands
   */
  private setupCommands(): void {
    if (!this.bot) return;

    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    this.bot.onText(/\/link (.+)/, (msg, match) => this.handleLink(msg, match[1]));
    this.bot.onText(/\/status/, (msg) => this.handleStatus(msg));
    this.bot.onText(/\/portfolio/, (msg) => this.handlePortfolio(msg));
    this.bot.onText(/\/positions/, (msg) => this.handlePositions(msg));
    this.bot.onText(/\/trades(?: (\d+))?/, (msg, match) => this.handleTrades(msg, match?.[1]));
    this.bot.onText(/\/analyze (.+)/, (msg, match) => this.handleAnalyze(msg, match[1]));
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
    this.bot.onText(/\/emergency/, (msg) => this.handleEmergency(msg));

    // Callback query handler (for inline keyboards)
    this.bot.on('callback_query', (query) => this.handleCallbackQuery(query));
  }

  /**
   * Set up message handlers
   */
  private setupMessageHandlers(): void {
    if (!this.bot) return;

    // General message handler
    this.bot.on('message', async (msg) => {
      // Skip commands (handled separately)
      if (msg.text?.startsWith('/')) return;

      // Check authorization
      if (!this.isAuthorized(msg.chat.id)) {
        await this.bot.sendMessage(msg.chat.id,
          '🔒 *Not Authorized*\n\n' +
          'Please link your account using:\n' +
          '`/link <secret>`\n\n' +
          `Your secret: \`${TELEGRAM_LINK_SECRET}\``,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Process as conversational agent message
      await this.processMessage(msg);
    });
  }

  /**
   * Start polling
   */
  private async startPolling(): Promise<void> {
    if (!this.bot || this.polling) return;

    this.polling = true;
    await this.bot.startPolling();
  }

  /**
   * Stop polling
   */
  async stopPolling(): Promise<void> {
    if (!this.bot || !this.polling) return;

    this.polling = false;
    await this.bot.stopPolling();
  }

  /**
   * Check if chat is authorized
   */
  private isAuthorized(chatId: number): boolean {
    // Explicitly set chat ID from env
    if (TELEGRAM_CHAT_ID && chatId === TELEGRAM_CHAT_ID) {
      return true;
    }

    // Runtime linked chat ID
    if (this.authorizedChatId && chatId === this.authorizedChatId) {
      return true;
    }

    return false;
  }

  // ============================================================================
  // COMMAND HANDLERS
  // ============================================================================

  private async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    if (this.isAuthorized(chatId)) {
      await this.bot?.sendMessage(chatId,
        '✅ *Already Linked*\n\n' +
        'You can chat with me to:\n' +
        '• Query portfolio, positions, trades\n' +
        '• Analyze trading traces\n' +
        '• Execute trades (with confirmation)\n' +
        '• Update risk parameters\n' +
        '• Diagnose system issues\n\n' +
        'Use /help for available commands.',
        { parse_mode: 'Markdown' }
      );
    } else {
      await this.bot?.sendMessage(chatId,
        '🔐 *Trading Bot - Not Linked*\n\n' +
        'To link your account, use:\n' +
        '`/link ' + TELEGRAM_LINK_SECRET + '`\n\n' +
        'Keep this secret safe!',
        { parse_mode: 'Markdown' }
      );
    }
  }

  private async handleLink(msg: TelegramBot.Message, secret: string): Promise<void> {
    const chatId = msg.chat.id;

    if (secret === TELEGRAM_LINK_SECRET) {
      this.authorizedChatId = chatId;
      await this.bot?.sendMessage(chatId,
        '✅ *Successfully Linked!*\n\n' +
        'You can now control the trading system.\n' +
        'Use /help to see available commands.',
        { parse_mode: 'Markdown' }
      );
      logger.info(`[TelegramBot] Chat ${chatId} linked successfully`);
    } else {
      await this.bot?.sendMessage(chatId,
        '❌ *Invalid Secret*\n\n' +
        'The link secret you provided is incorrect.\n' +
        'Please check your environment configuration.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  private async handleStatus(msg: TelegramBot.Message): Promise<void> {
    if (!this.isAuthorized(msg.chat.id)) return;

    const response = await conversationalAgent.processMessage({
      message: 'What is the system status?',
      platform: 'telegram',
    });

    await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
  }

  private async handlePortfolio(msg: TelegramBot.Message): Promise<void> {
    if (!this.isAuthorized(msg.chat.id)) return;

    const response = await conversationalAgent.processMessage({
      message: 'Show me my portfolio',
      platform: 'telegram',
    });

    await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
  }

  private async handlePositions(msg: TelegramBot.Message): Promise<void> {
    if (!this.isAuthorized(msg.chat.id)) return;

    const response = await conversationalAgent.processMessage({
      message: 'What are my open positions?',
      platform: 'telegram',
    });

    await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
  }

  private async handleTrades(msg: TelegramBot.Message, limitStr?: string): Promise<void> {
    if (!this.isAuthorized(msg.chat.id)) return;

    const limit = limitStr ? parseInt(limitStr) : 10;
    const response = await conversationalAgent.processMessage({
      message: `Show my last ${limit} trades`,
      platform: 'telegram',
    });

    await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
  }

  private async handleAnalyze(msg: TelegramBot.Message, traceId: string): Promise<void> {
    if (!this.isAuthorized(msg.chat.id)) return;

    const response = await conversationalAgent.processMessage({
      message: `Analyze trace ${traceId}`,
      platform: 'telegram',
    });

    await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
  }

  private async handleHelp(msg: TelegramBot.Message): Promise<void> {
    if (!this.isAuthorized(msg.chat.id)) return;

    const helpText = `
*🤖 AI Trading Assistant - Commands*

*Quick Info:*
/status - System status
/portfolio - Portfolio summary
/positions - Open positions
/trades \\[n\\] - Recent trades

*Analysis:*
/analyze <trace_id> - Analyze a trace

*Actions:*
/emergency - Emergency stop

*Chat:*
Just send a message! I can help you:
• Query the system
• Execute trades (with confirmation)
• Update risk parameters
• Diagnose issues
    `.trim();

    await this.bot?.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
  }

  private async handleEmergency(msg: TelegramBot.Message): Promise<void> {
    if (!this.isAuthorized(msg.chat.id)) return;

    // Send confirmation keyboard
    const keyboard = {
      inline_keyboard: [[
        { text: '⚠️ Confirm EMERGENCY STOP', callback_data: 'emergency_confirm' },
        { text: 'Cancel', callback_data: 'emergency_cancel' },
      ]],
    };

    await this.bot?.sendMessage(msg.chat.id,
      '🚨 *EMERGENCY STOP CONFIRMATION*\n\n' +
      'This will:\n' +
      '• Close all positions\n' +
      '• Cancel all orders\n' +
      '• Stop all trading\n\n' +
      'Are you sure?',
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  }

  // ============================================================================
  // CALLBACK QUERY HANDLER
  // ============================================================================

  private async handleCallbackQuery(query: TelegramBot.CallbackQuery): Promise<void> {
    if (!this.bot || !query.data || !this.isAuthorized(query.message.chat.id)) return;

    const [action, value] = query.data.split(':');

    if (action === 'emergency_confirm') {
      // Execute emergency stop
      const response = await conversationalAgent.processMessage({
        message: 'Execute emergency stop',
        platform: 'telegram',
      });

      await this.bot?.answerCallbackQuery(query.id, { text: 'Emergency stop executed' });
      await this.bot?.sendMessage(query.message.chat.id, response.response, { parse_mode: 'Markdown' });

    } else if (action === 'emergency_cancel') {
      await this.bot?.answerCallbackQuery(query.id, { text: 'Cancelled' });
      await this.bot?.sendMessage(query.message.chat.id, '❌ Emergency stop cancelled');

    } else if (action === 'confirm_action') {
      // Handle action confirmation
      const confirmed = value === 'yes';
      const result = await conversationalAgent.handleConfirmation(value, confirmed);

      await this.bot?.answerCallbackQuery(query.id, { text: result?.success ? 'Executed' : 'Cancelled' });

    } else {
      await this.bot?.answerCallbackQuery(query.id, { text: 'Unknown action' });
    }
  }

  // ============================================================================
  // MESSAGE PROCESSING
  // ============================================================================

  private async processMessage(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (!text) return;

    try {
      // Send typing indicator
      await this.bot?.sendChatAction(chatId, 'typing');

      // Process through conversational agent
      const response = await conversationalAgent.processMessage({
        message: text,
        platform: 'telegram',
      });

      // Send response
      await this.bot?.sendMessage(chatId, response.response, { parse_mode: 'Markdown' });

      // Handle suggested actions
      if (response.suggestedActions && response.suggestedActions.length > 0) {
        const keyboard = this.buildSuggestionsKeyboard(response.suggestedActions);
        await this.bot?.sendMessage(chatId, '📌 *Suggested Actions:*', {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
      }

      // Handle confirmation required
      if (response.requiresConfirmation && response.confirmationData) {
        await this.showConfirmationDialog(chatId, response.confirmationData);
      }

    } catch (error) {
      logger.error('[TelegramBot] Message processing error:', error);
      await this.bot?.sendMessage(chatId,
        '❌ *Error processing your message*\n\n' +
        `Details: ${error instanceof Error ? error.message : String(error)}`,
        { parse_mode: 'Markdown' }
      );
    }
  }

  // ============================================================================
  // KEYBOARDS
  // ============================================================================

  private buildSuggestionsKeyboard(actions: any[]): any {
    const buttons = actions.slice(0, 6).map(action => [{
      text: `${action.icon || '→'} ${action.label}`,
      callback_data: `suggested:${action.action}:${JSON.stringify(action.params)}`,
    }]);

    return { inline_keyboard: buttons };
  }

  private async showConfirmationDialog(chatId: number, data: any): Promise<void> {
    const keyboard = {
      inline_keyboard: [[
        {
          text: `✓ Confirm ${data.riskLevel || ''}`,
          callback_data: `confirm:${data.actionId}:yes`,
        },
        {
          text: '✗ Cancel',
          callback_data: `confirm:${data.actionId}:no`,
        },
      ]],
    };

    await this.bot?.sendMessage(chatId,
      `⚠️ *Confirmation Required*\n\n` +
      `${data.message || 'Please confirm this action'}\n\n` +
      `Risk Level: ${data.riskLevel || 'UNKNOWN'}`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  }

  // ============================================================================
  // PROACTIVE ALERTS
  // ============================================================================

  /**
   * Send an alert to the authorized user
   */
  async sendAlert(alert: AgentAlert): Promise<void> {
    const chatId = TELEGRAM_CHAT_ID || this.authorizedChatId;
    if (!this.bot || !chatId) return;

    const emoji = alert.type === 'critical' ? '🚨' : alert.type === 'warning' ? '⚠️' : 'ℹ️';
    const color = alert.type === 'critical' ? '🔴' : alert.type === 'warning' ? '🟡' : '🔵';

    let message = `${emoji} *${alert.title}*\n\n${alert.message}\n\n${color} <i>${new Date().toLocaleTimeString()}</i>`;

    const keyboard = alert.actions && alert.actions.length > 0
      ? this.buildAlertKeyboard(alert.actions)
      : undefined;

    await this.bot.sendMessage(chatId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }

  private buildAlertKeyboard(actions: any[]): any {
    const buttons = actions.slice(0, 3).map(action => [{
      text: `${action.icon || '→'} ${action.label}`,
      callback_data: `alert_action:${action.action}:${JSON.stringify(action.params)}`,
    }]);

    return { inline_keyboard: buttons };
  }

  // ============================================================================
  // STATUS
  // ============================================================================

  /**
   * Get bot status
   */
  getStatus(): { initialized: boolean; polling: boolean; authorized: boolean } {
    return {
      initialized: !!this.bot,
      polling: this.polling,
      authorized: !!this.authorizedChatId || !!TELEGRAM_CHAT_ID,
    };
  }

  /**
   * Stop the bot
   */
  async stop(): Promise<void> {
    await this.stopPolling();
    logger.info('[TelegramBot] Stopped');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

const telegramBotService = new TelegramBotService();

export default telegramBotService;
