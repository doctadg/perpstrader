import { AgentAlert } from './types';
declare class TelegramBotService {
    private bot;
    private polling;
    private authorizedChatId;
    private pendingConfirmations;
    /**
     * Initialize the Telegram bot
     */
    initialize(): Promise<void>;
    /**
     * Set up bot commands
     */
    private setupCommands;
    /**
     * Set up message handlers
     */
    private setupMessageHandlers;
    /**
     * Start polling
     */
    private startPolling;
    /**
     * Stop polling
     */
    stopPolling(): Promise<void>;
    /**
     * Check if chat is authorized
     */
    private isAuthorized;
    private handleStart;
    private handleLink;
    private handleStatus;
    private handlePortfolio;
    private handlePositions;
    private handleTrades;
    private handleAnalyze;
    private handleHelp;
    private handleEmergency;
    private handleCallbackQuery;
    private processMessage;
    private buildSuggestionsKeyboard;
    private showConfirmationDialog;
    /**
     * Send an alert to the authorized user
     */
    sendAlert(alert: AgentAlert): Promise<void>;
    private buildAlertKeyboard;
    /**
     * Get bot status
     */
    getStatus(): {
        initialized: boolean;
        polling: boolean;
        authorized: boolean;
    };
    /**
     * Stop the bot
     */
    stop(): Promise<void>;
}
declare const telegramBotService: TelegramBotService;
export default telegramBotService;
//# sourceMappingURL=telegram-bot.d.ts.map