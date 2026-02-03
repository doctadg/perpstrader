import { BaseMessage } from '@langchain/core/messages';
import { Position, Trade } from '../shared/types';
export type Intent = 'query' | 'analyze' | 'execute' | 'configure' | 'diagnose' | 'repair';
export type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Platform = 'dashboard' | 'telegram';
export interface ConversationalState {
    conversationId: string;
    userId: string;
    platform: Platform;
    messages: BaseMessage[];
    systemContext: SystemContext;
    intent: Intent;
    toolResults: Map<string, any>;
    safetyCheck: SafetyCheck;
    response: string;
    suggestedActions: SuggestedAction[];
}
export interface SystemContext {
    portfolio: PortfolioState | null;
    positions: Position[];
    recentTrades: Trade[];
    activeStrategies: ActiveStrategy[];
    riskMetrics: RiskMetrics | null;
    systemStatus: SystemStatusInternal;
    recentTraces: TraceSummary[];
    config: PartialConfig;
}
export interface PortfolioState {
    totalValue: number;
    availableBalance: number;
    usedBalance: number;
    positions: Position[];
    dailyPnL: number;
    unrealizedPnL: number;
    environment: 'testnet' | 'mainnet';
}
export interface ActiveStrategy {
    id: string;
    name: string;
    type: string;
    symbols: string[];
    isActive: boolean;
    performance: {
        totalTrades: number;
        winRate: number;
        totalPnL: number;
    };
}
export interface RiskMetrics {
    currentDrawdown: number;
    dailyLoss: number;
    dailyLossLimit: number;
    maxPositionSize: number;
    maxLeverage: number;
    emergencyStop: boolean;
}
export interface SystemStatusInternal {
    agent: string;
    execution: string;
    uptime: number;
    circuitBreakers: Record<string, {
        state: string;
        lastTripTime?: number;
    }>;
    messageBusConnected: boolean;
}
export interface TraceSummary {
    id: string;
    startTime: Date;
    endTime?: Date;
    symbol: string;
    success: boolean;
    tradeExecuted: boolean;
    regime?: string;
    strategyCount?: number;
    riskScore?: number;
}
export interface PartialConfig {
    risk?: {
        maxPositionSize: number;
        maxDailyLoss: number;
        maxLeverage: number;
        emergencyStop: boolean;
    };
    trading?: {
        symbols: string[];
        timeframes: string[];
        strategies: string[];
    };
}
export interface SafetyCheck {
    allowed: boolean;
    riskLevel: RiskLevel;
    requiresConfirmation: boolean;
    warnings?: string[];
}
export interface SuggestedAction {
    id: string;
    label: string;
    icon: string;
    action: string;
    params: Record<string, any>;
    riskLevel: RiskLevel;
}
export interface ToolDefinition {
    name: string;
    description: string;
    riskLevel: RiskLevel;
    requiresConfirmation: boolean;
    handler: (params: any) => Promise<any>;
}
export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    toolCalls?: ToolCall[];
}
export interface ToolCall {
    name: string;
    params: Record<string, any>;
    result?: any;
    success?: boolean;
    error?: string;
}
export interface ConversationEntry {
    conversationId: string;
    userId: string;
    platform: Platform;
    messages: ConversationMessage[];
    metadata: {
        createdAt: Date;
        lastAccessed: Date;
        messageCount: number;
    };
}
export interface TraceAnalysis {
    traceId: string;
    symbol: string;
    regime: string;
    summary: string;
    marketConditions: string;
    decisionRationale: string;
    outcome: string;
    insights: string[];
    timestamp: Date;
}
export interface AgentResponse {
    response: string;
    suggestedActions: SuggestedAction[];
    toolCalls?: ToolCall[];
    requiresConfirmation: boolean;
    confirmationData?: {
        actionId: string;
        message: string;
        details: Record<string, any>;
        riskLevel: RiskLevel;
    };
    conversationId: string;
}
export interface TelegramUser {
    id: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    languageCode?: string;
}
export interface TelegramChat {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    username?: string;
}
export interface TelegramMessage {
    messageId: number;
    from?: TelegramUser;
    chat: TelegramChat;
    date: number;
    text?: string;
    chatId?: number;
}
export interface TelegramCallbackQuery {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data: string;
    chatInstance?: string;
}
export interface TelegramInlineKeyboard {
    reply_markup: {
        inline_keyboard: Array<Array<{
            text: string;
            callback_data: string;
        }>>;
    };
}
export interface AgentAlert {
    type: 'critical' | 'warning' | 'info';
    title: string;
    message: string;
    actions?: SuggestedAction[];
    timestamp: Date;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=types.d.ts.map