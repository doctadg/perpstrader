// Query Tools for Conversational Agent
// Read-only tools for querying system state and data

import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';
import logger from '../../shared/logger';
import traceStore from '../../data/trace-store';
import newsStore from '../../data/news-store';
import storyClusterStore from '../../data/story-cluster-store';
import glmService from '../../shared/glm-service';
import { ToolDefinition, RiskLevel, TraceAnalysis } from '../types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a LangChain Tool from a ToolDefinition
 */
function createTool(def: ToolDefinition): DynamicTool {
  return new DynamicTool({
    name: def.name,
    description: def.description,
    func: async (input: string) => {
      const params = typeof input === 'string' ? JSON.parse(input) : input;
      try {
        const result = await def.handler(params);
        return JSON.stringify({ success: true, data: result });
      } catch (error) {
        logger.error(`[QueryTool] ${def.name} error:`, error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    },
  });
}

// ============================================================================
// QUERY TOOL DEFINITIONS
// ============================================================================

/**
 * Get current portfolio state
 */
const getPortfolio: ToolDefinition = {
  name: 'get_portfolio',
  description: 'Get current portfolio state including total value, available balance, positions, and P&L',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async () => {
    const executionEngine = require('../../execution-engine/execution-engine').default;
    const portfolio = await executionEngine.getPortfolio();

    return {
      totalValue: portfolio.totalValue || 0,
      availableBalance: portfolio.availableBalance || 0,
      usedBalance: portfolio.usedBalance || 0,
      positions: portfolio.positions || [],
      unrealizedPnL: portfolio.unrealizedPnL || 0,
      realizedPnL: await executionEngine.getRealizedPnL().catch(() => 0),
      environment: executionEngine.getEnvironment ? executionEngine.getEnvironment() : 'LIVE',
    };
  },
};

/**
 * Get current open positions
 */
const getPositions: ToolDefinition = {
  name: 'get_positions',
  description: 'Get all current open positions with entry prices, mark prices, and unrealized P&L. Optional: filter by symbol.',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async ({ symbol }: { symbol?: string }) => {
    const executionEngine = require('../../execution-engine/execution-engine').default;
    const portfolio = await executionEngine.getPortfolio();
    let positions = portfolio.positions || [];

    if (symbol) {
      positions = positions.filter((p: any) => p.symbol === symbol.toUpperCase());
    }

    return {
      count: positions.length,
      positions: positions.map((p: any) => ({
        symbol: p.symbol,
        side: p.side,
        size: p.size,
        entryPrice: p.entryPrice,
        markPrice: p.markPrice,
        unrealizedPnL: p.unrealizedPnL,
        leverage: p.leverage,
        marginUsed: p.marginUsed,
      })),
    };
  },
};

/**
 * Get recent trades
 */
const getRecentTrades: ToolDefinition = {
  name: 'get_recent_trades',
  description: 'Get recent trade history. Specify limit (default: 50) to control number of trades returned.',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async ({ limit = 50 }: { limit?: number }) => {
    const executionEngine = require('../../execution-engine/execution-engine').default;
    const trades = await executionEngine.getRecentTrades().catch(() => []);

    return {
      total: trades.length,
      trades: trades.slice(0, limit).map((t: any) => ({
        id: t.id,
        symbol: t.symbol,
        side: t.side,
        size: t.size,
        price: t.price,
        fee: t.fee,
        pnl: t.pnl,
        timestamp: t.timestamp,
        type: t.type,
        status: t.status,
      })),
    };
  },
};

/**
 * Get specific trace by ID
 */
const getTrace: ToolDefinition = {
  name: 'get_trace',
  description: 'Get detailed trace data for a specific trading cycle by its ID. Returns full trace data including thoughts, errors, strategy selection, and execution results.',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async ({ traceId }: { traceId: string }) => {
    if (!traceId) {
      throw new Error('traceId is required');
    }

    traceStore.initialize();
    const trace = traceStore.getTraceById(traceId);

    if (!trace) {
      return { error: 'Trace not found', traceId };
    }

    try {
      const traceData = JSON.parse(trace.traceData);
      return {
        id: trace.id,
        createdAt: trace.createdAt,
        symbol: trace.symbol,
        timeframe: trace.timeframe,
        regime: trace.regime,
        success: trace.success === true,
        tradeExecuted: trace.tradeExecuted === true,
        analyzed: trace.analyzed === true,
        data: traceData,
      };
    } catch (e) {
      // If parse fails, return raw trace
      return trace;
    }
  },
};

/**
 * Get recent traces
 */
const getRecentTraces: ToolDefinition = {
  name: 'get_recent_traces',
  description: 'Get recent trading cycle traces. Specify limit (default: 20) and optional agentType filter.',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async ({ limit = 20, agentType }: { limit?: number; agentType?: string }) => {
    traceStore.initialize();
    const summaries = traceStore.getRecentTraceSummaries(limit, agentType);

    return summaries.map(s => ({
      id: s.id,
      startTime: s.startTime || s.createdAt,
      endTime: s.endTime,
      symbol: s.symbol,
      agentType: s.agentType,
      success: s.success,
      tradeExecuted: s.tradeExecuted,
      regime: s.regime,
      strategyCount: s.strategyCount,
      riskScore: s.riskScore,
    }));
  },
};

/**
 * Analyze a trace with AI-generated explanation
 */
const analyzeTrace: ToolDefinition = {
  name: 'analyze_trace',
  description: 'Perform AI analysis on a specific trace to understand what happened and why. Returns narrative explanation of market conditions, decision rationale, and insights.',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async ({ traceId }: { traceId: string }) => {
    if (!traceId) {
      throw new Error('traceId is required');
    }

    traceStore.initialize();
    const trace = traceStore.getTraceById(traceId);

    if (!trace) {
      return { error: 'Trace not found', traceId };
    }

    try {
      const traceData = JSON.parse(trace.traceData);

      // Check if GLM service is available
      if (!glmService.canUseService()) {
        return {
          traceId,
          symbol: trace.symbol,
          summary: `Trace ${traceId}: ${trace.symbol} ${trace.regime || 'UNKNOWN regime'}. ${trace.success ? 'Completed successfully' : 'Failed'}.`,
          analysis: 'LLM service not configured for detailed analysis.',
        };
      }

      // Generate AI analysis
      const analysis = await generateTraceAnalysis(traceData);

      return {
        traceId,
        symbol: trace.symbol,
        regime: trace.regime,
        success: trace.success === true,
        tradeExecuted: trace.tradeExecuted === true,
        ...analysis,
      };
    } catch (e) {
      logger.error(`[analyzeTrace] Error:`, e);
      return { error: 'Failed to analyze trace', traceId };
    }
  },
};

/**
 * Get system status
 */
const getSystemStatus: ToolDefinition = {
  name: 'get_system_status',
  description: 'Get overall system health and status including agent status, circuit breakers, message bus, and uptime.',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async () => {
    const circuitBreaker = require('../../shared/circuit-breaker').default;
    const executionEngine = require('../../execution-engine/execution-engine').default;

    const healthSummary = await circuitBreaker.getHealthSummary();

    return {
      agent: 'RUNNING',
      execution: executionEngine.getEnvironment ? executionEngine.getEnvironment() : 'LIVE',
      circuitBreakers: circuitBreaker.getAllBreakerStatuses(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      health: healthSummary,
    };
  },
};

/**
 * Get system configuration (sanitized - no secrets)
 */
const getConfig: ToolDefinition = {
  name: 'get_config',
  description: 'Get current system configuration. Only returns safe values (no API keys or secrets). Specify section (risk or trading) to filter.',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async ({ section }: { section?: string }) => {
    const configManager = require('../../shared/config').default;
    const fullConfig = configManager.get();

    if (section === 'risk') {
      return fullConfig.risk || {};
    }

    if (section === 'trading') {
      return fullConfig.trading || {};
    }

    // Return safe subset
    return {
      risk: fullConfig.risk || {},
      trading: fullConfig.trading || {},
    };
  },
};

/**
 * Get recent news
 */
const getNews: ToolDefinition = {
  name: 'get_news',
  description: 'Get recent news articles. Specify limit (default: 25) and optional category filter (CRYPTO, STOCKS, ECONOMICS, GEOPOLITICS, TECH, etc.)',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async ({ limit = 25, category }: { limit?: number; category?: string }) => {
    if (category) {
      return await newsStore.getNewsByCategory(category as any, limit);
    }
    return await newsStore.getRecentNews(limit);
  },
};

/**
 * Get hot/trending news clusters
 */
const getHotClusters: ToolDefinition = {
  name: 'get_hot_clusters',
  description: 'Get hot/trending news clusters grouped by topic. Specify limit (default: 25) and hours lookback (default: 24)',
  riskLevel: 'NONE',
  requiresConfirmation: false,
  handler: async ({ limit = 25, hours = 24 }: { limit?: number; hours?: number }) => {
    return await storyClusterStore.getHotClusters(limit, hours);
  },
};

// ============================================================================
// TRACE ANALYSIS HELPER
// ============================================================================

/**
 * Generate AI-powered trace analysis using GLM
 */
async function generateTraceAnalysis(traceData: any): Promise<Partial<TraceAnalysis>> {
  const prompt = `Analyze this trading cycle trace and provide a clear, human-readable explanation:

Symbol: ${traceData.symbol}
Timeframe: ${traceData.timeframe || '1h'}
Regime: ${traceData.regime || 'UNKNOWN'}
Success: ${traceData.success ? 'Yes' : 'No'}
Trade Executed: ${traceData.tradeExecuted ? 'Yes' : 'No'}

Thoughts: ${(traceData.thoughts || []).slice(-5).join('. ') || 'None'}
Errors: ${(traceData.errors || []).join('. ') || 'None'}

Selected Strategy: ${traceData.selectedStrategy?.name || 'None'}
Strategy Type: ${traceData.selectedStrategy?.type || 'None'}

Risk Assessment:
- Approved: ${traceData.riskAssessment?.approved ? 'Yes' : 'No'}
- Risk Score: ${traceData.riskAssessment?.riskScore || 'N/A'}
- Warnings: ${(traceData.riskAssessment?.warnings || []).join(', ') || 'None'}

Execution Result: ${traceData.executionResult ? JSON.stringify(traceData.executionResult) : 'None'}

Provide a concise analysis focusing on:
1. What the market conditions were
2. What strategy was considered and why
3. Why a trade was or wasn't executed
4. Any interesting insights from the cycle

Return your response as JSON with these fields:
{
  "summary": "2-3 sentence overview",
  "marketConditions": "description of market state",
  "decisionRationale": "why the decision was made",
  "outcome": "what happened",
  "insights": ["insight 1", "insight 2"]
}`;

  try {
    const response = await glmService.generateText(prompt);
    const jsonMatch = response.match(/\{[\s\S]*"summary"[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || '',
        marketConditions: parsed.marketConditions || '',
        decisionRationale: parsed.decisionRationale || '',
        outcome: parsed.outcome || '',
        insights: parsed.insights || [],
        timestamp: new Date(),
      };
    }

    // Fallback: return the raw response
    return {
      summary: response.substring(0, 500),
      marketConditions: 'See summary',
      decisionRationale: 'See summary',
      outcome: traceData.success ? 'Completed' : 'Failed',
      insights: [],
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error('[generateTraceAnalysis] Error:', error);
    return {
      summary: `Trace analysis for ${traceData.symbol}: ${traceData.success ? 'Success' : 'Failed'}`,
      marketConditions: traceData.regime || 'Unknown',
      decisionRationale: 'Analysis unavailable',
      outcome: traceData.executionResult?.status || 'No trade',
      insights: [],
      timestamp: new Date(),
    };
  }
}

// ============================================================================
// EXPORT ALL TOOLS
// ============================================================================

const QUERY_TOOLS: Record<string, ToolDefinition> = {
  get_portfolio: getPortfolio,
  get_positions: getPositions,
  get_recent_trades: getRecentTrades,
  get_trace: getTrace,
  get_recent_traces: getRecentTraces,
  analyze_trace: analyzeTrace,
  get_system_status: getSystemStatus,
  get_config: getConfig,
  get_news: getNews,
  get_hot_clusters: getHotClusters,
};

/**
 * Get all query tools as LangChain Tools
 */
export function getQueryTools(): DynamicTool[] {
  return Object.values(QUERY_TOOLS).map(createTool);
}

/**
 * Get a specific query tool
 */
export function getQueryTool(name: string): ToolDefinition | undefined {
  return QUERY_TOOLS[name];
}

/**
 * Get all query tool definitions
 */
export function getQueryToolDefinitions(): Record<string, ToolDefinition> {
  return { ...QUERY_TOOLS };
}

export default QUERY_TOOLS;
