"use strict";
// Telegram Bot for Conversational Agent
// Remote communication with the trading system via Telegram
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const crypto_1 = require("crypto");
const logger_1 = __importDefault(require("../shared/logger"));
const conversational_agent_1 = __importDefault(require("./conversational-agent"));
// ============================================================================
// CONFIGURATION
// ============================================================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ? Number.parseInt(process.env.TELEGRAM_CHAT_ID) : null;
const TELEGRAM_LINK_SECRET = process.env.TELEGRAM_LINK_SECRET || (0, crypto_1.randomUUID)();
// ============================================================================
// TELEGRAM BOT CLASS
// ============================================================================
class TelegramBotService {
    bot = null;
    polling = false;
    authorizedChatId = null;
    pendingConfirmations = new Map();
    /**
     * Initialize the Telegram bot
     */
    async initialize() {
        if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'your_bot_token') {
            logger_1.default.info('[TelegramBot] No bot token configured, skipping Telegram integration');
            return;
        }
        try {
            // Create bot with polling (simpler than webhooks for single-user setup)
            this.bot = new node_telegram_bot_api_1.default(TELEGRAM_BOT_TOKEN, { polling: false });
            // Set up command handlers
            this.setupCommands();
            // Set up message handlers
            this.setupMessageHandlers();
            // Start polling
            await this.startPolling();
            logger_1.default.info('[TelegramBot] Initialized successfully');
            logger_1.default.info(`[TelegramBot] Link secret: ${TELEGRAM_LINK_SECRET}`);
        }
        catch (error) {
            logger_1.default.error('[TelegramBot] Initialization error:', error);
        }
    }
    /**
     * Set up bot commands
     */
    setupCommands() {
        if (!this.bot)
            return;
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
    setupMessageHandlers() {
        if (!this.bot)
            return;
        // General message handler
        this.bot.on('message', async (msg) => {
            // Skip commands (handled separately)
            if (msg.text?.startsWith('/'))
                return;
            // Check authorization
            if (!this.isAuthorized(msg.chat.id)) {
                await this.bot.sendMessage(msg.chat.id, '🔒 *Not Authorized*\n\n' +
                    'Please link your account using:\n' +
                    '`/link <secret>`\n\n' +
                    `Your secret: \`${TELEGRAM_LINK_SECRET}\``, { parse_mode: 'Markdown' });
                return;
            }
            // Process as conversational agent message
            await this.processMessage(msg);
        });
    }
    /**
     * Start polling
     */
    async startPolling() {
        if (!this.bot || this.polling)
            return;
        this.polling = true;
        await this.bot.startPolling();
    }
    /**
     * Stop polling
     */
    async stopPolling() {
        if (!this.bot || !this.polling)
            return;
        this.polling = false;
        await this.bot.stopPolling();
    }
    /**
     * Check if chat is authorized
     */
    isAuthorized(chatId) {
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
    async handleStart(msg) {
        const chatId = msg.chat.id;
        if (this.isAuthorized(chatId)) {
            await this.bot?.sendMessage(chatId, '✅ *Already Linked*\n\n' +
                'You can chat with me to:\n' +
                '• Query portfolio, positions, trades\n' +
                '• Analyze trading traces\n' +
                '• Execute trades (with confirmation)\n' +
                '• Update risk parameters\n' +
                '• Diagnose system issues\n\n' +
                'Use /help for available commands.', { parse_mode: 'Markdown' });
        }
        else {
            await this.bot?.sendMessage(chatId, '🔐 *Trading Bot - Not Linked*\n\n' +
                'To link your account, use:\n' +
                '`/link ' + TELEGRAM_LINK_SECRET + '`\n\n' +
                'Keep this secret safe!', { parse_mode: 'Markdown' });
        }
    }
    async handleLink(msg, secret) {
        const chatId = msg.chat.id;
        if (secret === TELEGRAM_LINK_SECRET) {
            this.authorizedChatId = chatId;
            await this.bot?.sendMessage(chatId, '✅ *Successfully Linked!*\n\n' +
                'You can now control the trading system.\n' +
                'Use /help to see available commands.', { parse_mode: 'Markdown' });
            logger_1.default.info(`[TelegramBot] Chat ${chatId} linked successfully`);
        }
        else {
            await this.bot?.sendMessage(chatId, '❌ *Invalid Secret*\n\n' +
                'The link secret you provided is incorrect.\n' +
                'Please check your environment configuration.', { parse_mode: 'Markdown' });
        }
    }
    async handleStatus(msg) {
        if (!this.isAuthorized(msg.chat.id))
            return;
        const response = await conversational_agent_1.default.processMessage({
            message: 'What is the system status?',
            platform: 'telegram',
        });
        await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
    }
    async handlePortfolio(msg) {
        if (!this.isAuthorized(msg.chat.id))
            return;
        const response = await conversational_agent_1.default.processMessage({
            message: 'Show me my portfolio',
            platform: 'telegram',
        });
        await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
    }
    async handlePositions(msg) {
        if (!this.isAuthorized(msg.chat.id))
            return;
        const response = await conversational_agent_1.default.processMessage({
            message: 'What are my open positions?',
            platform: 'telegram',
        });
        await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
    }
    async handleTrades(msg, limitStr) {
        if (!this.isAuthorized(msg.chat.id))
            return;
        const limit = limitStr ? parseInt(limitStr) : 10;
        const response = await conversational_agent_1.default.processMessage({
            message: `Show my last ${limit} trades`,
            platform: 'telegram',
        });
        await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
    }
    async handleAnalyze(msg, traceId) {
        if (!this.isAuthorized(msg.chat.id))
            return;
        const response = await conversational_agent_1.default.processMessage({
            message: `Analyze trace ${traceId}`,
            platform: 'telegram',
        });
        await this.bot?.sendMessage(msg.chat.id, response.response, { parse_mode: 'Markdown' });
    }
    async handleHelp(msg) {
        if (!this.isAuthorized(msg.chat.id))
            return;
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
    async handleEmergency(msg) {
        if (!this.isAuthorized(msg.chat.id))
            return;
        // Send confirmation keyboard
        const keyboard = {
            inline_keyboard: [[
                    { text: '⚠️ Confirm EMERGENCY STOP', callback_data: 'emergency_confirm' },
                    { text: 'Cancel', callback_data: 'emergency_cancel' },
                ]],
        };
        await this.bot?.sendMessage(msg.chat.id, '🚨 *EMERGENCY STOP CONFIRMATION*\n\n' +
            'This will:\n' +
            '• Close all positions\n' +
            '• Cancel all orders\n' +
            '• Stop all trading\n\n' +
            'Are you sure?', {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });
    }
    // ============================================================================
    // CALLBACK QUERY HANDLER
    // ============================================================================
    async handleCallbackQuery(query) {
        if (!this.bot || !query.data || !this.isAuthorized(query.message.chat.id))
            return;
        const [action, value] = query.data.split(':');
        if (action === 'emergency_confirm') {
            // Execute emergency stop
            const response = await conversational_agent_1.default.processMessage({
                message: 'Execute emergency stop',
                platform: 'telegram',
            });
            await this.bot?.answerCallbackQuery(query.id, { text: 'Emergency stop executed' });
            await this.bot?.sendMessage(query.message.chat.id, response.response, { parse_mode: 'Markdown' });
        }
        else if (action === 'emergency_cancel') {
            await this.bot?.answerCallbackQuery(query.id, { text: 'Cancelled' });
            await this.bot?.sendMessage(query.message.chat.id, '❌ Emergency stop cancelled');
        }
        else if (action === 'confirm_action') {
            // Handle action confirmation
            const confirmed = value === 'yes';
            const result = await conversational_agent_1.default.handleConfirmation(value, confirmed);
            await this.bot?.answerCallbackQuery(query.id, { text: result?.success ? 'Executed' : 'Cancelled' });
        }
        else {
            await this.bot?.answerCallbackQuery(query.id, { text: 'Unknown action' });
        }
    }
    // ============================================================================
    // MESSAGE PROCESSING
    // ============================================================================
    async processMessage(msg) {
        const chatId = msg.chat.id;
        const text = msg.text || '';
        if (!text)
            return;
        try {
            // Send typing indicator
            await this.bot?.sendChatAction(chatId, 'typing');
            // Process through conversational agent
            const response = await conversational_agent_1.default.processMessage({
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
        }
        catch (error) {
            logger_1.default.error('[TelegramBot] Message processing error:', error);
            await this.bot?.sendMessage(chatId, '❌ *Error processing your message*\n\n' +
                `Details: ${error instanceof Error ? error.message : String(error)}`, { parse_mode: 'Markdown' });
        }
    }
    // ============================================================================
    // KEYBOARDS
    // ============================================================================
    buildSuggestionsKeyboard(actions) {
        const buttons = actions.slice(0, 6).map(action => [{
                text: `${action.icon || '→'} ${action.label}`,
                callback_data: `suggested:${action.action}:${JSON.stringify(action.params)}`,
            }]);
        return { inline_keyboard: buttons };
    }
    async showConfirmationDialog(chatId, data) {
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
        await this.bot?.sendMessage(chatId, `⚠️ *Confirmation Required*\n\n` +
            `${data.message || 'Please confirm this action'}\n\n` +
            `Risk Level: ${data.riskLevel || 'UNKNOWN'}`, {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
        });
    }
    // ============================================================================
    // PROACTIVE ALERTS
    // ============================================================================
    /**
     * Send an alert to the authorized user
     */
    async sendAlert(alert) {
        const chatId = TELEGRAM_CHAT_ID || this.authorizedChatId;
        if (!this.bot || !chatId)
            return;
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
    buildAlertKeyboard(actions) {
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
    getStatus() {
        return {
            initialized: !!this.bot,
            polling: this.polling,
            authorized: !!this.authorizedChatId || !!TELEGRAM_CHAT_ID,
        };
    }
    /**
     * Stop the bot
     */
    async stop() {
        await this.stopPolling();
        logger_1.default.info('[TelegramBot] Stopped');
    }
}
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
const telegramBotService = new TelegramBotService();
exports.default = telegramBotService;
//# sourceMappingURL=telegram-bot.js.map