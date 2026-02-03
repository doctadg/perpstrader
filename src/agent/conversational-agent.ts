// Conversational Agent - Main orchestration
// Simplified agent for real-time interaction with the trading system

import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { randomUUID } from 'crypto';
import axios from 'axios';
import logger from '../shared/logger';
import glmService from '../shared/glm-service';
import messageBus, { Channel } from '../shared/message-bus';
import redisCache from '../shared/redis-cache';
import configManager from '../shared/config';
import conversationMemory from './memory';
import safetyGuardrails from './guardrails';
import { getAllTools, getAllToolDefinitions, getToolNamesByRiskLevel } from './tools';
import {
  SystemContext,
  Intent,
  Platform,
  AgentResponse,
  SuggestedAction,
  SafetyCheck,
  RiskLevel,
} from './types';

// ============================================================================
// CONFIGURATION
// ============================================================================

console.log('[ConversationalAgent] Module loading...');

const MAX_CONTEXT_MESSAGES = 10;
const TOOL_AUTO_EXECUTE_LIMIT = 'MEDIUM' as RiskLevel;

// ============================================================================
// INTERNAL STATE TYPE (simplified to avoid LangGraph typing issues)
// ============================================================================

interface InternalState {
  conversationId: string;
  userId: string;
  platform: Platform;
  messages: any[];
  systemContext: SystemContext;
  intent: Intent;
  toolResults: Map<string, any>;
  safetyCheck: SafetyCheck;
  response: string;
  suggestedActions: SuggestedAction[];
}

// ============================================================================
// CONVERSATIONAL AGENT CLASS
// ============================================================================

class ConversationalAgent {
  private llm: ChatOpenAI | null = null;
  private pendingConfirmations: Map<string, any> = new Map();
  private connected: boolean = false;

  constructor() {
    this.initializeLLM();
  }

  /**
   * Initialize LLM (OpenRouter for chat agent)
   */
  private initializeLLM(): void {
    const config = configManager.get();

    console.log('[ConversationalAgent] Initializing LLM...');
    console.log('[ConversationalAgent] OpenRouter API key exists:', !!config.openrouter.apiKey);
    console.log('[ConversationalAgent] OpenRouter API key length:', config.openrouter.apiKey?.length);

    // Chat agent always uses OpenRouter
    if (config.openrouter.apiKey && config.openrouter.apiKey !== 'your-api-key-here') {
      this.llm = new ChatOpenAI({
        apiKey: config.openrouter.apiKey,
        configuration: {
          baseURL: config.openrouter.baseUrl,
        },
        modelName: 'openai/gpt-oss-120b',
        temperature: 0.7,
        maxTokens: 2000,
      }) as any;
      console.log('[ConversationalAgent] Using OpenRouter (gpt-oss-120b) for conversational AI');
      logger.info('[ConversationalAgent] Using OpenRouter (gpt-oss-120b) for conversational AI');
    } else {
      console.log('[ConversationalAgent] ERROR: OpenRouter API key not configured');
      logger.error('[ConversationalAgent] OpenRouter API key not configured, chat will be limited');
      this.llm = null;
    }
  }

  /**
   * Call LLM via OpenRouter
   */
  private async callLLM(messages: any[]): Promise<string> {
    if (!this.llm) {
      throw new Error('OpenRouter LLM not configured');
    }

    const result = await this.llm.invoke(messages);
    return result.content as string;
  }

  /**
   * Call LLM for tool decision via OpenRouter
   */
  private async callLLMForToolDecision(prompt: string): Promise<any> {
    if (!this.llm) {
      return { tools: [], needsConfirmation: false, reasoning: 'LLM unavailable' };
    }

    const decision = await this.llm.invoke([new HumanMessage(prompt)]);
    const decisionText = decision.content as string;
    const jsonMatch = decisionText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return { tools: [], needsConfirmation: false, reasoning: 'Could not parse LLM response' };
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Connect to Redis and message bus
      await Promise.all([
        conversationMemory.connect(),
        messageBus.connect(),
        redisCache.connect(),
      ]);

      this.connected = true;
      logger.info('[ConversationalAgent] Initialized and connected');

      // Subscribe to system events for proactive updates
      this.subscribeToEvents();
    } catch (error) {
      logger.error('[ConversationalAgent] Initialization error:', error);
      this.connected = false;
    }
  }

  /**
   * Process a user message (main entry point)
   */
  async processMessage(input: {
    message: string;
    conversationId?: string;
    platform?: Platform;
  }): Promise<AgentResponse> {
    await this.initialize();

    const platform = input.platform || 'dashboard';

    // Get or create conversation
    const conversationId = input.conversationId ||
      await conversationMemory.getOrCreateConversation(platform);

    // Add user message to memory
    await conversationMemory.addMessage(
      conversationId,
      'user',
      input.message,
      undefined,
      platform
    );

    // Load conversation history
    const entry = await conversationMemory.getConversation(conversationId);

    // Classify intent
    const intent = this.classifyIntent(input.message);

    // Gather context
    const systemContext = await this.gatherContext();

    // Execute tools if needed
    const { toolResults, safetyCheck } = await this.executeTools(input.message, intent, systemContext);

    // Check if confirmation is required
    if (safetyCheck.requiresConfirmation) {
      const confirmData = toolResults.get('_confirmation');
      if (confirmData) {
        return {
          response: `Action "${confirmData.toolName}" requires confirmation.`,
          suggestedActions: [],
          requiresConfirmation: true,
          confirmationData: {
            actionId: confirmData.actionId,
            message: `Confirm action: ${confirmData.toolName}`,
            details: confirmData.params,
            riskLevel: confirmData.riskLevel,
          },
          conversationId,
        };
      }
    }

    // Generate response
    const response = await this.generateResponse(input.message, intent, systemContext, toolResults, entry?.messages || []);

    // Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(intent, systemContext, toolResults);

    // Publish event to message bus
    await messageBus.publish('agent:message', {
      conversationId,
      message: input.message,
      response,
      platform,
      timestamp: new Date(),
    });

    return {
      response,
      suggestedActions,
      requiresConfirmation: false,
      conversationId,
    };
  }

  /**
   * Classify user intent
   */
  private classifyIntent(message: string): Intent {
    const lower = message.toLowerCase();

    if (this.matchesAny(lower, ['buy', 'sell', 'trade', 'open position', 'close position', 'long', 'short'])) {
      return 'execute';
    }
    if (this.matchesAny(lower, ['update', 'change', 'set', 'adjust', 'increase', 'decrease', 'modify'])) {
      return 'configure';
    }
    if (this.matchesAny(lower, ['analyze', 'explain', 'why', 'how', 'what happened', 'diagnose'])) {
      return 'analyze';
    }
    if (this.matchesAny(lower, ['status', 'health', 'check', 'running'])) {
      return 'diagnose';
    }
    if (this.matchesAny(lower, ['fix', 'repair', 'reset', 'recover'])) {
      return 'repair';
    }

    return 'query';
  }

  private matchesAny(content: string, keywords: string[]): boolean {
    return keywords.some(keyword => content.includes(keyword));
  }

  /**
   * Gather system context
   */
  private async gatherContext(): Promise<SystemContext> {
    const context: SystemContext = {
      portfolio: null,
      positions: [],
      recentTrades: [],
      activeStrategies: [],
      riskMetrics: null,
      systemStatus: {} as any,
      recentTraces: [],
      config: {} as any,
    };

    try {
      const executionEngine = require('../execution-engine/execution-engine').default;
      const portfolio = await executionEngine.getPortfolio().catch(() => null);

      if (portfolio) {
        context.portfolio = {
          totalValue: portfolio.totalValue || 0,
          availableBalance: portfolio.availableBalance || 0,
          usedBalance: portfolio.usedBalance || 0,
          positions: portfolio.positions || [],
          dailyPnL: portfolio.dailyPnL || 0,
          unrealizedPnL: portfolio.unrealizedPnL || 0,
          environment: executionEngine.getEnvironment ? executionEngine.getEnvironment() : 'LIVE',
        };
        context.positions = portfolio.positions || [];
      }

      context.recentTrades = await executionEngine.getRecentTrades().catch(() => []);

      const traceStore = require('../data/trace-store').default;
      traceStore.initialize();
      context.recentTraces = traceStore.getRecentTraceSummaries(10);

      const circuitBreaker = require('../shared/circuit-breaker').default;
      context.systemStatus = {
        agent: 'RUNNING',
        execution: context.portfolio?.environment || 'LIVE',
        uptime: process.uptime(),
        circuitBreakers: circuitBreaker.getAllBreakerStatuses(),
        messageBusConnected: messageBus.getStatus().connected,
      };

      const config = configManager.get();
      context.config = {
        risk: config.risk,
        trading: config.trading,
      };
    } catch (error) {
      logger.error('[ConversationalAgent] Context gathering error:', error);
    }

    return context;
  }

  /**
   * Execute tools based on message
   */
  private async executeTools(
    message: string,
    intent: Intent,
    systemContext: SystemContext
  ): Promise<{ toolResults: Map<string, any>; safetyCheck: SafetyCheck }> {
    const toolResults = new Map<string, any>();
    const safetyCheck: SafetyCheck = {
      allowed: true,
      riskLevel: 'NONE' as RiskLevel,
      requiresConfirmation: false,
    };

    // For now, use a simpler approach - only call tools when explicitly needed
    // The LLM will tell us which tools to use
    if (this.llm) {
      try {
        const allToolDefs = getAllToolDefinitions();
        const toolDescriptions = Object.values(allToolDefs)
          .map(t => `- ${t.name}: ${t.description}`)
          .join('\n');

        const decisionPrompt = `Given this user message, decide which tools to use (if any).

Available tools:
${toolDescriptions}

User message: "${message}"

Return JSON only:
{
  "tools": [{"name": "tool_name", "params": {...}}],
  "needsConfirmation": true/false,
  "reasoning": "brief explanation"
}

If no tools are needed, return {"tools": [], "needsConfirmation": false, "reasoning": "..."}`;

        const parsed = await this.callLLMForToolDecision(decisionPrompt);

        if (parsed.tools && parsed.tools.length > 0) {
          // Execute each tool
          for (const toolCall of parsed.tools) {
            const toolDef = allToolDefs[toolCall.name];
            if (toolDef) {
              const portfolioContext = {
                totalValue: systemContext.portfolio?.totalValue,
                availableBalance: systemContext.portfolio?.availableBalance,
              };

              const safety = await safetyGuardrails.checkAction(
                toolCall.name,
                toolCall.params || {},
                portfolioContext
              );

              if (!safety.allowed) {
                toolResults.set(toolCall.name, { error: safety.warnings?.join(', ') || 'Not allowed' });
                continue;
              }

              // Check if confirmation needed
              if (safety.requiresConfirmation && !safetyGuardrails.shouldAutoExecute(safety.riskLevel)) {
                safetyCheck.requiresConfirmation = true;
                safetyCheck.riskLevel = safety.riskLevel;
                safetyCheck.warnings = safety.warnings;

                const actionId = randomUUID();
                safetyGuardrails.storeConfirmation(actionId, {
                  toolName: toolCall.name,
                  params: toolCall.params,
                });

                toolResults.set('_confirmation', {
                  actionId,
                  toolName: toolCall.name,
                  params: toolCall.params,
                  riskLevel: safety.riskLevel,
                  warnings: safety.warnings,
                });
                continue;
              }

              // Execute tool
              try {
                const result = await toolDef.handler(toolCall.params || {});
                toolResults.set(toolCall.name, { success: true, data: result });
              } catch (error) {
                toolResults.set(toolCall.name, {
                  success: false,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          }
        }
      } catch (error) {
        logger.error('[ConversationalAgent] Tool decision error:', error);
      }
    }

    return { toolResults, safetyCheck };
  }

  /**
   * Generate response
   */
  private async generateResponse(
    userMessage: string,
    intent: Intent,
    systemContext: SystemContext,
    toolResults: Map<string, any>,
    historyMessages: any[]
  ): Promise<string> {
    // Check if we have LLM available
    if (!this.llm) {
      return this.generateFallbackResponse(intent, systemContext);
    }

    const contextStr = this.buildContextString(systemContext);
    const toolsStr = this.formatToolResults(toolResults);

    const prompt = `${this.getSystemPrompt()}

Current System Context:
${contextStr}

Tool Results:
${toolsStr}

User Message: ${userMessage}

Provide a helpful, concise response. Focus on what the user asked for. Use formatting (bullet points, bold) for readability.`;

    try {
      const history = historyMessages
        .filter(m => m.role !== 'system')
        .slice(-MAX_CONTEXT_MESSAGES)
        .map(m => m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content));

      // Use callLLM which has automatic fallback
      return await this.callLLM([
        new SystemMessage(this.getSystemPrompt()),
        ...history,
        new HumanMessage(prompt),
      ]);
    } catch (error) {
      logger.error('[ConversationalAgent] LLM error:', error);
      return this.generateFallbackResponse(intent, systemContext);
    }
  }

  private buildContextString(systemContext: SystemContext): string {
    const ctx = systemContext;
    const parts: string[] = [];

    if (ctx.portfolio) {
      parts.push(`Portfolio Value: $${ctx.portfolio.totalValue?.toFixed(2) || '0.00'}`);
      parts.push(`Available Balance: $${ctx.portfolio.availableBalance?.toFixed(2) || '0.00'}`);
      parts.push(`Unrealized P&L: $${ctx.portfolio.unrealizedPnL?.toFixed(2) || '0.00'}`);
    }

    parts.push(`Open Positions: ${ctx.positions?.length || 0}`);

    if (ctx.recentTrades && ctx.recentTrades.length > 0) {
      parts.push(`Recent Trades: ${ctx.recentTrades.length}`);
    }

    if (ctx.recentTraces && ctx.recentTraces.length > 0) {
      const lastTrace = ctx.recentTraces[0];
      parts.push(`Last Cycle: ${lastTrace.symbol} ${lastTrace.success ? '✓' : '✗'}`);
    }

    parts.push(`System Uptime: ${Math.floor((ctx.systemStatus?.uptime || 0) / 60)} minutes`);

    return parts.join('\n');
  }

  private formatToolResults(results: Map<string, any>): string {
    if (results.size === 0) {
      return 'No tools executed.';
    }

    const lines: string[] = [];
    for (const [name, result] of results.entries()) {
      if (name === '_confirmation') {
        lines.push(`⚠️ Action requires confirmation: ${result.toolName}`);
        if (result.warnings) {
          lines.push(`   Warnings: ${result.warnings.join(', ')}`);
        }
      } else if (result.success) {
        lines.push(`✓ ${name}: ${JSON.stringify(result.data).substring(0, 100)}`);
      } else {
        lines.push(`✗ ${name}: ${result.error}`);
      }
    }
    return lines.join('\n');
  }

  private generateSuggestedActions(
    intent: Intent,
    systemContext: SystemContext,
    toolResults: Map<string, any>
  ): SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    if (intent === 'query' && !toolResults.has('get_portfolio')) {
      actions.push({
        id: randomUUID(),
        label: 'View Portfolio',
        icon: '💼',
        action: 'get_portfolio',
        params: {},
        riskLevel: 'NONE',
      });
    }

    if (systemContext.positions?.length > 0 && !toolResults.has('get_positions')) {
      actions.push({
        id: randomUUID(),
        label: `View ${systemContext.positions.length} Position(s)`,
        icon: '📊',
        action: 'get_positions',
        params: {},
        riskLevel: 'NONE',
      });
    }

    if (systemContext.recentTraces?.length > 0 && !toolResults.has('analyze_trace')) {
      const lastTrace = systemContext.recentTraces[0];
      actions.push({
        id: randomUUID(),
        label: 'Analyze Last Trade',
        icon: '🔍',
        action: 'analyze_trace',
        params: { traceId: lastTrace.id },
        riskLevel: 'NONE',
      });
    }

    if (intent === 'diagnose' && !toolResults.has('get_system_status')) {
      actions.push({
        id: randomUUID(),
        label: 'Check System Status',
        icon: '🏥',
        action: 'get_system_status',
        params: {},
        riskLevel: 'NONE',
      });
    }

    return actions.slice(0, 4);
  }

  private generateFallbackResponse(intent: Intent, systemContext: SystemContext): string {
    const ctx = systemContext;

    switch (intent) {
      case 'execute':
        return `I can help you execute trades. Please specify the symbol, side (buy/sell), and size. Current portfolio value: $${ctx.portfolio?.totalValue?.toFixed(2) || '0.00'}`;

      case 'configure':
        return 'I can help you adjust risk parameters and trading settings. What would you like to change?';

      case 'analyze':
        if (ctx.recentTraces?.length > 0) {
          return `I can analyze recent trades. You have ${ctx.recentTraces.length} recent trading cycles. Provide a trace ID or ask about recent activity.`;
        }
        return 'I can analyze trades and system behavior. What would you like me to analyze?';

      case 'diagnose':
        return `System Status:\n- Agent: RUNNING\n- Uptime: ${Math.floor((ctx.systemStatus?.uptime || 0) / 60)} minutes\n- Open Positions: ${ctx.positions?.length || 0}\n- Portfolio Value: $${ctx.portfolio?.totalValue?.toFixed(2) || '0.00'}`;

      case 'repair':
        return 'I can help reset circuit breakers and fix common issues. What would you like me to repair?';

      default:
        return `I'm here to help with your trading system. Current portfolio: $${ctx.portfolio?.totalValue?.toFixed(2) || '0.00'}, ${ctx.positions?.length || 0} open positions. You can ask about your portfolio, positions, recent trades, or request actions.`;
    }
  }

  private getSystemPrompt(): string {
    return `You are an AI trading assistant for the PerpsTrader autonomous trading system.

Your capabilities include:
- Querying portfolio state, positions, trades, and traces
- Analyzing trading cycles and explaining what happened
- Executing trades (with user confirmation for safety)
- Updating risk parameters (with confirmation)
- Diagnosing and fixing system issues

Key guidelines:
1. Always explain what you're doing before taking action
2. For dangerous actions (trades, parameter changes), clearly state the risks
3. Provide context and reasoning for your recommendations
4. Be concise but thorough
5. When analyzing traces, focus on the decision chain and outcomes
6. Use formatting (bullet points, bold text) to make responses readable

Current system context will be provided with each message.
Use the available tools to gather information and perform actions.`;
  }

  /**
   * Handle user confirmation for a pending action
   */
  async handleConfirmation(actionId: string, confirmed: boolean): Promise<any> {
    const pending = safetyGuardrails.getConfirmation(actionId);

    if (!pending) {
      return { success: false, error: 'Action not found or expired' };
    }

    if (!confirmed) {
      return { success: false, message: 'Action cancelled by user' };
    }

    // Execute the pending action
    const allToolDefs = getAllToolDefinitions();
    const toolDef = allToolDefs[pending.toolName];
    if (toolDef) {
      try {
        const result = await toolDef.handler(pending.params);
        return { success: true, result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    return { success: false, error: 'Tool not found' };
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(conversationId: string): Promise<any> {
    return await conversationMemory.getHistory(conversationId);
  }

  /**
   * Get all conversations
   */
  async getAllConversations(): Promise<string[]> {
    return await conversationMemory.getUserConversations();
  }

  /**
   * Clear a conversation
   */
  async clearConversation(conversationId: string): Promise<boolean> {
    return await conversationMemory.clearConversation(conversationId);
  }

  /**
   * Get memory stats
   */
  async getStats(): Promise<any> {
    return await conversationMemory.getStats();
  }

  /**
   * Subscribe to system events for proactive updates
   */
  private subscribeToEvents(): void {
    messageBus.subscribe(Channel.CYCLE_COMPLETE, async (msg) => {
      logger.debug('[ConversationalAgent] Cycle complete:', msg.data);
    });

    messageBus.subscribe(Channel.POSITION_OPENED, async (msg) => {
      logger.debug('[ConversationalAgent] Position opened:', msg.data);
    });

    messageBus.subscribe(Channel.POSITION_CLOSED, async (msg) => {
      logger.debug('[ConversationalAgent] Position closed:', msg.data);
    });

    messageBus.subscribe(Channel.CIRCUIT_BREAKER_OPEN, async (msg) => {
      logger.warn('[ConversationalAgent] Circuit breaker opened:', msg.data);
    });
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    await conversationMemory.disconnect();
    await messageBus.disconnect();
    await redisCache.disconnect();
    this.connected = false;
    logger.info('[ConversationalAgent] Disconnected');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

const conversationalAgent = new ConversationalAgent();

export default conversationalAgent;
export { ConversationalAgent, InternalState, AgentResponse };
