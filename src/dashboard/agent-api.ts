// =============================================================================
// Agent Control API — REST endpoints for external AI agents
// =============================================================================
//
// Mount on the dashboard server:
//   import agentApiRouter from './agent-api';
//   app.use('/api/agent', agentApiRouter);
//
// NOTE: When mounting, the base path is /api/agent, so all route definitions
//       below omit that prefix (e.g. router.get('/status') → GET /api/agent/status).
// =============================================================================

import { Router, Request, Response } from 'express';
import configManager from '../shared/config';
import logger from '../shared/logger';
import newsStore from '../data/news-store';
import predictionStore from '../data/prediction-store';
import traceStore from '../data/trace-store';
import pumpfunStore from '../data/pumpfun-store';
import newsHeatmapService from './news-heatmap-service';
import messageBus, { Channel } from '../shared/message-bus';
import redisCache from '../shared/redis-cache';
import {
  restoreAgents,
  ensureAgent,
  getAgent,
  getAllAgents,
  updateAgentStatus,
  setAgentRunning,
  setAgentStopped,
  setAgentError,
  forEachAgent,
  stopAllAgents,
  close as closeAgentRegistry,
} from './agent-registry';
import type {
  AgentName,
  AgentStatus,
  HealthLevel,
  TradeRequest,
  RiskLimitsRequest,
  SystemStatusResponse,
  AgentsResponse,
  StartStopAgentResponse,
  CycleTriggerRequest,
  CycleTriggerResponse,
  AgentNewsResponse,
  HeatmapResponse,
  SignalsResponse,
  PredictionsResponse,
  PositionsResponse,
  PortfolioResponse,
  TradeResponse,
  ClosePositionResponse,
  StrategiesResponse,
  StrategyActivateResponse,
  StrategyDeactivateResponse,
  StrategyCreateRequest,
  StrategyCreateResponse,
  EvolutionResponse,
  RiskResponse,
  RiskLimitsResponse,
  EmergencyStopResponse,
  AgentApiError,
  BacktestRunRequest,
  BacktestRunResponse,
  BacktestResultsResponse,
  BacktestHistoryResponse,
  CandlesResponse,
  TradesResponse,
  FundingRatesResponse,
  OrdersResponse,
  CancelOrderRequest,
  CancelOrderResponse,
  CancelAllOrdersResponse,
  AgentLogsResponse,
  WebhookEvent,
  WebhookConfig,
  WebhookRegisterRequest,
  WebhookRegisterResponse,
  WebhookDeleteResponse,
  WebhooksListResponse,
} from './agent-api-types';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: start the process clock (for uptime)
// ---------------------------------------------------------------------------
const PROCESS_START = Date.now();

// ---------------------------------------------------------------------------
// Persistent agent registry — restored from SQLite on startup
// ---------------------------------------------------------------------------
restoreAgents();

const VALID_AGENTS: AgentName[] = ['news', 'execution', 'prediction', 'pumpfun', 'safekeeping', 'research'];

const AGENT_DESCRIPTIONS: Record<AgentName, string> = {
  news: 'News ingestion, clustering, and sentiment analysis pipeline',
  execution: 'Trade execution engine for Hyperliquid perpetuals',
  prediction: 'Prediction market analysis and trading (Polymarket)',
  pumpfun: 'pump.fun token discovery and analysis agent',
  safekeeping: 'Automated yield farming and DeFi safekeeping fund',
  research: 'Strategy research, backtesting, and genetic evolution engine',
};

// Ensure every known agent has a row (creates defaults on first run)
for (const name of VALID_AGENTS) {
  ensureAgent(name);
}

// ---------------------------------------------------------------------------
// Helper: safe dynamic import with fallback
// ---------------------------------------------------------------------------
async function safeImport<T>(modulePath: string): Promise<T | null> {
  try {
    const mod = await import(modulePath);
    return (mod.default ?? mod) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: get circuit breaker status
// ---------------------------------------------------------------------------
async function getCircuitBreakers(): Promise<any[]> {
  try {
    const cb = await safeImport<any>('../shared/circuit-breaker');
    if (cb && typeof cb.getAllBreakerStatuses === 'function') {
      return cb.getAllBreakerStatuses();
    }
  } catch { /* ignore */ }
  return [];
}

// ---------------------------------------------------------------------------
// Helper: get execution engine
// ---------------------------------------------------------------------------
async function getExecutionEngine(): Promise<any> {
  return safeImport<any>('../execution-engine/execution-engine');
}

// ---------------------------------------------------------------------------
// Helper: get position recovery
// ---------------------------------------------------------------------------
async function getPositionRecovery(): Promise<any> {
  return safeImport<any>('../execution-engine/position-recovery');
}

// ===========================================================================
// TRADING FLOOR CONTROL
// ===========================================================================

// GET /status — System status overview
router.get('/status', async (_req: Request, res: Response) => {
  const cfg = configManager.get();
  const uptimeMs = Date.now() - PROCESS_START;

  try {
    const mbStatus = messageBus.getStatus();
    const cacheStatus = redisCache.getStatus();
    const breakers = await getCircuitBreakers();
    const predictionStatus = predictionStore.getAgentStatus?.() ?? {};

    // Determine overall health
    let health: HealthLevel = 'HEALTHY';
    const breakerTripped = breakers.some((b: any) => b.state === 'OPEN');
    if (breakerTripped) health = 'DEGRADED';
    if (!mbStatus.connected) health = 'DEGRADED';

    const agentSummaries: any[] = [];
    forEachAgent((state, name) => {
      agentSummaries.push({
        name,
        status: state.status,
        uptime: state.startedAt ? Date.now() - state.startedAt : 0,
        lastCycleTime: state.lastActivity ? new Date(state.lastActivity).toISOString() : null,
        cyclesCompleted: state.cyclesCompleted,
        error: state.lastError,
      });
    });

    const response: SystemStatusResponse = {
      timestamp: new Date().toISOString(),
      uptime: uptimeMs,
      health,
      environment: cfg.app.environment,
      version: cfg.app.version,
      agents: agentSummaries,
      messageBus: { connected: mbStatus.connected, subscriptions: mbStatus.subscriptions },
      cache: { connected: cacheStatus.connected },
      errors: [],
    };

    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /status error:', error);
    res.status(500).json({
      error: 'Failed to get system status',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// GET /agents — List all available agent modules and their status
router.get('/agents', (_req: Request, res: Response) => {
  try {
    const cfg = configManager.get();

    const agents: any[] = [];
    for (const name of VALID_AGENTS) {
      const state = getAgent(name)!;

      let agentConfig: Record<string, any> = {};
      try {
        switch (name) {
          case 'news':
            agentConfig = { pollingInterval: process.env.NEWS_DASHBOARD_POLL_MS || '10000' };
            break;
          case 'execution':
            agentConfig = { environment: cfg.hyperliquid.testnet ? 'TESTNET' : 'LIVE' };
            break;
          case 'prediction':
            agentConfig = { ...predictionStatus };
            break;
          case 'pumpfun':
            agentConfig = {
              cycleInterval: cfg.pumpfun?.cycleIntervalMs,
              minScore: cfg.pumpfun?.minScoreThreshold,
            };
            break;
          case 'safekeeping':
            agentConfig = {};
            break;
          case 'research':
            agentConfig = {};
            break;
        }
      } catch { /* config not available */ }

      agents.push({
        name,
        status: state.status,
        description: AGENT_DESCRIPTIONS[name],
        config: agentConfig,
        lastActivity: state.lastActivity ? new Date(state.lastActivity).toISOString() : null,
        cyclesCompleted: state.cyclesCompleted,
        errorCount: state.errorCount,
        enabled: state.status !== 'STOPPED',
      });
    }

    const response: AgentsResponse = { agents, timestamp: new Date().toISOString() };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /agents error:', error);
    res.status(500).json({
      error: 'Failed to list agents',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// Helper variable for the prediction status reference (used below)
const predictionStatus: any = {};

// POST /start/:agentName — Start a specific agent
router.post('/start/:agentName', async (req: Request, res: Response) => {
  const agentName = req.params.agentName as AgentName;

  if (!VALID_AGENTS.includes(agentName)) {
    return res.status(400).json({
      error: `Invalid agent: ${agentName}. Valid: ${VALID_AGENTS.join(', ')}`,
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  const state = getAgent(agentName)!;
  const previousStatus = state.status;

  if (state.status === 'RUNNING') {
    return res.status(409).json({
      error: `Agent ${agentName} is already running`,
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    // Publish start event to message bus
    await messageBus.publish(`agent:${agentName}:start`, {
      source: 'agent-api',
      timestamp: new Date(),
      reason: req.body?.reason || 'API request',
    });

    // Update registry (persists to SQLite)
    setAgentRunning(agentName);

    logger.info(`[AgentAPI] Agent ${agentName} started via API`);

    const response: StartStopAgentResponse = {
      success: true,
      agent: agentName,
      action: 'start',
      message: `Agent ${agentName} start signal sent`,
      previousStatus,
      newStatus: 'RUNNING',
    };
    res.json(response);
  } catch (error) {
    logger.error(`[AgentAPI] Failed to start agent ${agentName}:`, error);
    setAgentError(agentName, error instanceof Error ? error.message : String(error));

    res.status(500).json({
      error: `Failed to start agent ${agentName}`,
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// POST /stop/:agentName — Stop a specific agent
router.post('/stop/:agentName', async (req: Request, res: Response) => {
  const agentName = req.params.agentName as AgentName;

  if (!VALID_AGENTS.includes(agentName)) {
    return res.status(400).json({
      error: `Invalid agent: ${agentName}. Valid: ${VALID_AGENTS.join(', ')}`,
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  const state = getAgent(agentName)!;
  const previousStatus = state.status;

  if (state.status === 'STOPPED') {
    return res.status(409).json({
      error: `Agent ${agentName} is already stopped`,
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    await messageBus.publish(`agent:${agentName}:stop`, {
      source: 'agent-api',
      timestamp: new Date(),
      reason: req.body?.reason || 'API request',
    });

    // Update registry (persists to SQLite)
    setAgentStopped(agentName);

    logger.info(`[AgentAPI] Agent ${agentName} stopped via API`);

    const response: StartStopAgentResponse = {
      success: true,
      agent: agentName,
      action: 'stop',
      message: `Agent ${agentName} stop signal sent`,
      previousStatus,
      newStatus: 'STOPPED',
    };
    res.json(response);
  } catch (error) {
    logger.error(`[AgentAPI] Failed to stop agent ${agentName}:`, error);
    res.status(500).json({
      error: `Failed to stop agent ${agentName}`,
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// POST /cycle/trigger — Manually trigger a trading cycle
router.post('/cycle/trigger', async (req: Request, res: Response) => {
  const body = req.body as CycleTriggerRequest;

  try {
    const cycleId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    await messageBus.publish(Channel.CYCLE_START, {
      cycleId,
      symbol: body?.symbol || null,
      force: body?.force || false,
      source: 'agent-api',
      reason: body?.reason || 'Manual trigger via Agent API',
      timestamp: new Date(),
    });

    logger.info(`[AgentAPI] Trading cycle triggered: ${cycleId}`);

    const response: CycleTriggerResponse = {
      success: true,
      cycleId,
      message: body?.symbol
        ? `Trading cycle triggered for ${body.symbol}`
        : 'Trading cycle triggered',
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] Cycle trigger error:', error);
    res.status(500).json({
      error: 'Failed to trigger trading cycle',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// ===========================================================================
// DATA & INTELLIGENCE
// ===========================================================================

// GET /news — Latest news with sentiment (paginated, filterable by category)
router.get('/news', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const category = req.query.category as string;
    const sentiment = req.query.sentiment as string;

    let articles;
    if (category) {
      articles = await newsStore.getNewsByCategory(category as any, limit + offset);
    } else {
      articles = await newsStore.getRecentNews(limit + offset);
    }

    // Apply sentiment filter
    let filtered = articles;
    if (sentiment) {
      const upper = sentiment.toUpperCase();
      filtered = articles.filter(a => a.sentiment?.toUpperCase() === upper);
    }

    // Pagination
    const paginated = filtered.slice(offset, offset + limit);

    // Category breakdown
    const categories: Record<string, number> = {};
    for (const a of filtered) {
      for (const c of a.categories || []) {
        categories[c] = (categories[c] || 0) + 1;
      }
    }

    const response: AgentNewsResponse = {
      articles: paginated,
      total: filtered.length,
      limit,
      offset,
      categories,
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /news error:', error);
    res.json({ articles: [], total: 0, limit: 50, offset: 0, categories: {} } satisfies AgentNewsResponse);
  }
});

// GET /news/heatmap — Market heatmap data
router.get('/news/heatmap', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 80, 200);
    const hours = parseInt(req.query.hours as string) || 24;
    const category = req.query.category as string || 'ALL';
    const force = req.query.force === 'true';

    const heatmap = await newsHeatmapService.getHeatmap({ limit, hours, category, force });

    const response: HeatmapResponse = {
      generatedAt: heatmap.generatedAt,
      hours: heatmap.hours,
      category: heatmap.category,
      totalArticles: heatmap.totalArticles,
      totalClusters: heatmap.totalClusters,
      clusters: (heatmap.clusters || []).map((c: any) => ({
        id: c.id,
        title: c.title || c.topic || 'Unknown',
        category: c.category || 'UNKNOWN',
        heatScore: c.heatScore ?? c.score ?? 0,
        articleCount: c.articleCount ?? c.newsCount ?? 0,
        sentimentScore: c.sentimentScore ?? 0,
        trend: c.trend ?? 'NEUTRAL',
        topTags: c.topTags || c.tags || [],
        affectedAssets: c.affectedAssets || c.relatedAssets || [],
        marketLinks: c.marketLinks,
      })),
      byCategory: heatmap.byCategory || {},
      topMovers: [], // Filled from market data if available
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /news/heatmap error:', error);
    res.json({
      generatedAt: new Date().toISOString(),
      hours: 24,
      category: 'ALL',
      totalArticles: 0,
      totalClusters: 0,
      clusters: [],
      byCategory: {},
      topMovers: [],
    } satisfies HeatmapResponse);
  }
});

// GET /signals — Recent trading signals from strategy engine
router.get('/signals', async (_req: Request, res: Response) => {
  try {
    traceStore.initialize();
    const traces = traceStore.getRecentTraceSummaries(50);

    // Extract signals from recent traces
    const signals: any[] = [];
    for (const trace of traces as any[]) {
      if (trace.signal) {
        signals.push({
          ...trace.signal,
          cycleId: trace.id,
          symbol: trace.symbol,
          timestamp: trace.startTime || trace.endTime,
        });
      }
    }

    const response: SignalsResponse = {
      signals,
      total: signals.length,
      generatedAt: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /signals error:', error);
    res.json({ signals: [], total: 0, generatedAt: new Date().toISOString() } satisfies SignalsResponse);
  }
});

// GET /predictions — Current prediction market positions and signals
router.get('/predictions', (_req: Request, res: Response) => {
  try {
    const positions = predictionStore.getPositions() || [];
    const trades = predictionStore.getTrades(20) || [];

    // Build signal summaries from recent trades
    const signals = trades.slice(0, 10).map((t: any) => ({
      id: t.id || `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      marketId: t.marketId,
      marketTitle: t.marketTitle || 'Unknown',
      outcome: t.outcome,
      action: (t.side === 'BUY' ? 'BUY' : 'SELL') as 'BUY' | 'SELL',
      confidence: 0.5, // Default confidence when not available
      reason: t.reason || '',
      edge: 0,
      timestamp: t.timestamp instanceof Date ? t.timestamp.toISOString() : String(t.timestamp),
    }));

    const totalUnrealizedPnL = (positions as any[]).reduce((sum: number, p: any) => sum + (p.unrealizedPnL || 0), 0);

    const response: PredictionsResponse = {
      positions,
      signals,
      totalPositions: (positions as any[]).length,
      unrealizedPnL: totalUnrealizedPnL,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /predictions error:', error);
    res.json({
      positions: [],
      signals: [],
      totalPositions: 0,
      unrealizedPnL: 0,
      timestamp: new Date().toISOString(),
    } satisfies PredictionsResponse);
  }
});

// ===========================================================================
// PORTFOLIO MANAGEMENT
// ===========================================================================

// GET /positions — Current open positions
router.get('/positions', async (_req: Request, res: Response) => {
  try {
    const engine = await getExecutionEngine();
    if (!engine) {
      return res.json({
        positions: [],
        total: 0,
        totalUnrealizedPnL: 0,
        timestamp: new Date().toISOString(),
      } satisfies PositionsResponse);
    }

    const positions = await engine.getPositions().catch(() => []);
    const totalUnrealizedPnL = (positions as any[]).reduce(
      (sum: number, p: any) => sum + (p.unrealizedPnL || 0), 0,
    );

    const response: PositionsResponse = {
      positions: positions || [],
      total: (positions as any[])?.length || 0,
      totalUnrealizedPnL,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /positions error:', error);
    res.json({
      positions: [],
      total: 0,
      totalUnrealizedPnL: 0,
      timestamp: new Date().toISOString(),
    } satisfies PositionsResponse);
  }
});

// GET /portfolio — Portfolio summary (PnL, exposure, risk metrics)
router.get('/portfolio', async (_req: Request, res: Response) => {
  try {
    const engine = await getExecutionEngine();
    if (!engine) {
      return res.json({
        totalValue: 0,
        availableBalance: 0,
        usedBalance: 0,
        dailyPnL: 0,
        unrealizedPnL: 0,
        exposure: { gross: 0, net: 0, long: 0, short: 0 },
        risk: { currentDrawdown: 0, maxDrawdown: 0, riskScore: 0 },
        positionCount: 0,
        timestamp: new Date().toISOString(),
      } satisfies PortfolioResponse);
    }

    const [portfolio, positions, realizedPnL] = await Promise.all([
      engine.getPortfolio().catch(() => null),
      engine.getPositions().catch(() => []),
      engine.getRealizedPnL?.().catch(() => 0) ?? 0,
    ]);

    const posArray = (positions || []) as any[];
    const totalUnrealized = posArray.reduce((s: number, p: any) => s + (p.unrealizedPnL || 0), 0);
    const longExposure = posArray
      .filter((p: any) => p.side === 'LONG')
      .reduce((s: number, p: any) => s + (p.size * (p.markPrice || p.entryPrice || 0)), 0);
    const shortExposure = posArray
      .filter((p: any) => p.side === 'SHORT')
      .reduce((s: number, p: any) => s + (p.size * (p.markPrice || p.entryPrice || 0)), 0);

    const response: PortfolioResponse = {
      totalValue: (portfolio as any)?.totalValue || 0,
      availableBalance: (portfolio as any)?.availableBalance || 0,
      usedBalance: (portfolio as any)?.usedBalance || 0,
      dailyPnL: realizedPnL,
      unrealizedPnL: totalUnrealized,
      exposure: {
        gross: longExposure + shortExposure,
        net: longExposure - shortExposure,
        long: longExposure,
        short: shortExposure,
      },
      risk: {
        currentDrawdown: 0,
        maxDrawdown: 0,
        riskScore: 0,
      },
      positionCount: posArray.length,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /portfolio error:', error);
    res.json({
      totalValue: 0,
      availableBalance: 0,
      usedBalance: 0,
      dailyPnL: 0,
      unrealizedPnL: 0,
      exposure: { gross: 0, net: 0, long: 0, short: 0 },
      risk: { currentDrawdown: 0, maxDrawdown: 0, riskScore: 0 },
      positionCount: 0,
      timestamp: new Date().toISOString(),
    } satisfies PortfolioResponse);
  }
});

// POST /trade — Submit a trade with validation
router.post('/trade', async (req: Request, res: Response) => {
  const body = req.body as TradeRequest;

  // Validate required fields
  if (!body.symbol || !body.side || !body.size) {
    return res.status(400).json({
      error: 'Missing required fields: symbol, side, size',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  if (!['BUY', 'SELL'].includes(body.side)) {
    return res.status(400).json({
      error: 'side must be BUY or SELL',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  if (body.size <= 0) {
    return res.status(400).json({
      error: 'size must be positive',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  // Check risk limits
  const cfg = configManager.get();
  if (body.leverage && body.leverage > cfg.risk.maxLeverage) {
    return res.status(400).json({
      error: `Leverage ${body.leverage} exceeds maximum ${cfg.risk.maxLeverage}`,
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  if (cfg.risk.emergencyStop) {
    return res.status(403).json({
      error: 'Trading is halted — emergency stop is active',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    const engine = await getExecutionEngine();
    if (!engine) {
      return res.status(503).json({
        error: 'Execution engine not available',
        timestamp: new Date().toISOString(),
      } satisfies AgentApiError);
    }

    const result = await engine.executeTrade({
      symbol: body.symbol,
      side: body.side,
      size: body.size,
      type: body.type || 'MARKET',
      price: body.price,
      leverage: body.leverage,
      stopLoss: body.stopLoss,
      takeProfit: body.takeProfit,
    }).catch((err: any) => ({ error: err.message || String(err) }));

    if (result && (result as any).error) {
      return res.status(400).json({
        success: false,
        symbol: body.symbol,
        side: body.side,
        size: body.size,
        filledPrice: undefined,
        status: 'REJECTED',
        message: (result as any).error,
      } satisfies TradeResponse);
    }

    const response: TradeResponse = {
      success: true,
      orderId: (result as any)?.orderId,
      tradeId: (result as any)?.tradeId,
      symbol: body.symbol,
      side: body.side,
      size: body.size,
      filledPrice: (result as any)?.price,
      status: (result as any)?.status === 'FILLED' ? 'FILLED' : 'SUBMITTED',
      message: `Trade ${body.side} ${body.size} ${body.symbol} submitted`,
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /trade error:', error);
    res.status(500).json({
      error: 'Failed to submit trade',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// POST /close/:positionId — Close a specific position
router.post('/close/:positionId', async (req: Request, res: Response) => {
  const { positionId } = req.params;

  try {
    const engine = await getExecutionEngine();
    if (!engine) {
      return res.status(503).json({
        error: 'Execution engine not available',
        timestamp: new Date().toISOString(),
      } satisfies AgentApiError);
    }

    const result = await engine.closePosition(positionId).catch(
      (err: any) => ({ error: err.message || String(err) }),
    );

    if (result && (result as any).error) {
      return res.status(400).json({
        success: false,
        positionId,
        symbol: '',
        message: (result as any).error,
      } satisfies ClosePositionResponse);
    }

    logger.info(`[AgentAPI] Position ${positionId} closed via API`);

    const response: ClosePositionResponse = {
      success: true,
      positionId,
      symbol: (result as any)?.symbol || '',
      pnl: (result as any)?.pnl,
      message: `Position ${positionId} closed`,
    };
    res.json(response);
  } catch (error) {
    logger.error(`[AgentAPI] /close/${positionId} error:`, error);
    res.status(500).json({
      error: 'Failed to close position',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// ===========================================================================
// STRATEGY CONTROL
// ===========================================================================

// GET /strategies — List all strategies and their performance
router.get('/strategies', async (_req: Request, res: Response) => {
  try {
    const engine = await getExecutionEngine();

    let strategies: any[] = [];
    if (engine && typeof engine.getStrategies === 'function') {
      strategies = await engine.getStrategies().catch(() => []);
    }

    // Fallback: try loading from the research agent via traces
    if (strategies.length === 0) {
      try {
        traceStore.initialize();
        const traces = traceStore.getRecentTraceSummaries(100);
        const seen = new Set<string>();
        for (const trace of traces as any[]) {
          if (trace.selectedStrategy && !seen.has(trace.selectedStrategy.id || trace.selectedStrategy.name)) {
            seen.add(trace.selectedStrategy.id || trace.selectedStrategy.name);
            strategies.push({
              id: trace.selectedStrategy.id || `str_${Date.now()}`,
              name: trace.selectedStrategy.name,
              type: trace.selectedStrategy.type || 'AI_PREDICTION',
              isActive: true,
              symbols: trace.selectedStrategy.symbols || [trace.symbol].filter(Boolean),
              performance: {
                winRate: 0,
                sharpeRatio: 0,
                totalPnL: 0,
                totalTrades: 0,
                maxDrawdown: 0,
                profitFactor: 0,
              },
              createdAt: trace.startTime,
              updatedAt: trace.endTime,
            });
          }
        }
      } catch { /* no traces available */ }
    }

    const activeCount = strategies.filter((s: any) => s.isActive).length;

    const response: StrategiesResponse = {
      strategies,
      total: strategies.length,
      activeCount,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /strategies error:', error);
    res.json({
      strategies: [],
      total: 0,
      activeCount: 0,
      timestamp: new Date().toISOString(),
    } satisfies StrategiesResponse);
  }
});

// POST /strategies/activate — Activate a strategy
router.post('/strategies/activate', async (req: Request, res: Response) => {
  const { strategyId } = req.body;

  if (!strategyId) {
    return res.status(400).json({
      error: 'strategyId is required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    await messageBus.publish('strategy:activate', {
      strategyId,
      source: 'agent-api',
      timestamp: new Date(),
    });

    logger.info(`[AgentAPI] Strategy ${strategyId} activation requested`);

    const response: StrategyActivateResponse = {
      success: true,
      strategyId,
      active: true,
      message: `Strategy ${strategyId} activation signal sent`,
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /strategies/activate error:', error);
    res.status(500).json({
      error: 'Failed to activate strategy',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// POST /strategies/deactivate — Deactivate a strategy
router.post('/strategies/deactivate', async (req: Request, res: Response) => {
  const { strategyId } = req.body;

  if (!strategyId) {
    return res.status(400).json({
      error: 'strategyId is required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    await messageBus.publish('strategy:deactivate', {
      strategyId,
      source: 'agent-api',
      timestamp: new Date(),
    });

    logger.info(`[AgentAPI] Strategy ${strategyId} deactivation requested`);

    const response: StrategyActivateResponse = {
      success: true,
      strategyId,
      active: false,
      message: `Strategy ${strategyId} deactivation signal sent`,
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /strategies/deactivate error:', error);
    res.status(500).json({
      error: 'Failed to deactivate strategy',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// POST /strategies/create — Submit a new strategy
router.post('/strategies/create', async (req: Request, res: Response) => {
  const body = req.body as StrategyCreateRequest;

  if (!body.name || !body.symbols || !Array.isArray(body.symbols) || body.symbols.length === 0) {
    return res.status(400).json({
      error: 'name and symbols (non-empty array) are required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    const strategyId = `str_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    await messageBus.publish('strategy:create', {
      strategyId,
      name: body.name,
      description: body.description || '',
      type: body.type || 'AI_PREDICTION',
      symbols: body.symbols,
      timeframe: body.timeframe || '1h',
      parameters: body.parameters || {},
      entryConditions: body.entryConditions || [],
      exitConditions: body.exitConditions || [],
      riskParameters: body.riskParameters || {},
      source: 'agent-api',
      timestamp: new Date(),
    });

    logger.info(`[AgentAPI] New strategy "${body.name}" created: ${strategyId}`);

    const response: StrategyCreateResponse = {
      success: true,
      strategyId,
      message: `Strategy "${body.name}" creation signal sent`,
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /strategies/create error:', error);
    res.status(500).json({
      error: 'Failed to create strategy',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// GET /evolution — Evolution engine status
router.get('/evolution', async (_req: Request, res: Response) => {
  try {
    traceStore.initialize();
    const traces = traceStore.getRecentTraceSummaries(200);

    // Build evolution data from traces
    const generations = new Map<number, any[]>();

    for (const trace of traces as any[]) {
      const gen = trace.generation || 0;
      if (gen <= 0) continue;

      if (!generations.has(gen)) {
        generations.set(gen, []);
      }

      if (trace.backtestResults && Array.isArray(trace.backtestResults)) {
        for (const result of trace.backtestResults) {
          generations.get(gen)!.push(result);
        }
      }
    }

    const sortedGenerations = Array.from(generations.keys()).sort((a, b) => a - b);
    const currentGen = sortedGenerations.length > 0 ? sortedGenerations[sortedGenerations.length - 1] : 0;

    let bestFitness = 0;
    let avgFitness = 0;
    const topPerformers: any[] = [];

    if (generations.has(currentGen)) {
      const genResults = generations.get(currentGen)!;
      const fitnesses = genResults.map((r: any) => r.sharpe || 0);
      bestFitness = Math.max(...fitnesses, 0);
      avgFitness = genResults.length > 0
        ? fitnesses.reduce((a: number, b: number) => a + b, 0) / genResults.length
        : 0;

      const sorted = [...genResults].sort((a: any, b: any) => (b.sharpe || 0) - (a.sharpe || 0));
      for (const s of sorted.slice(0, 5)) {
        topPerformers.push({
          id: s.strategyId || `evo_${currentGen}`,
          name: s.strategyName || 'Unknown',
          generation: currentGen,
          fitness: s.sharpe || 0,
          sharpeRatio: s.sharpe || 0,
          winRate: s.winRate || 0,
          pnl: s.pnl || 0,
          mutations: s.mutations || [],
        });
      }
    }

    const fitnessHistory: any[] = sortedGenerations.map(gen => {
      const results = generations.get(gen) || [];
      const fitnesses = results.map((r: any) => r.sharpe || 0);
      return {
        generation: gen,
        bestFitness: Math.max(...fitnesses, 0),
        avgFitness: results.length > 0 ? fitnesses.reduce((a: number, b: number) => a + b, 0) / results.length : 0,
        populationSize: results.length,
        timestamp: results[0]?.timestamp || new Date().toISOString(),
      };
    });

    const response: EvolutionResponse = {
      currentGeneration: currentGen,
      totalGenerations: sortedGenerations.length,
      populationSize: generations.get(currentGen)?.length || 0,
      bestFitness,
      avgFitness,
      topPerformers,
      fitnessHistory,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /evolution error:', error);
    res.json({
      currentGeneration: 0,
      totalGenerations: 0,
      populationSize: 0,
      bestFitness: 0,
      avgFitness: 0,
      topPerformers: [],
      fitnessHistory: [],
      timestamp: new Date().toISOString(),
    } satisfies EvolutionResponse);
  }
});

// ===========================================================================
// RISK MANAGEMENT
// ===========================================================================

// GET /risk — Current risk metrics
router.get('/risk', async (_req: Request, res: Response) => {
  try {
    const cfg = configManager.get();
    const breakers = await getCircuitBreakers();
    const engine = await getExecutionEngine();

    let positions: any[] = [];
    let realizedPnL = 0;
    let recentTrades: any[] = [];

    if (engine) {
      [positions, realizedPnL, recentTrades] = await Promise.all([
        engine.getPositions().catch(() => []),
        engine.getRealizedPnL?.().catch(() => 0) ?? 0,
        engine.getRecentTrades?.().catch(() => []) ?? [],
      ]);
    }

    const longExposure = positions.filter((p: any) => p.side === 'LONG')
      .reduce((s: number, p: any) => s + (p.size * (p.markPrice || p.entryPrice || 0)), 0);
    const shortExposure = positions.filter((p: any) => p.side === 'SHORT')
      .reduce((s: number, p: any) => s + (p.size * (p.markPrice || p.entryPrice || 0)), 0);

    const totalExposure = longExposure + shortExposure;
    const portfolioValue = (positions as any[]).reduce(
      (s: number, p: any) => s + (p.marginUsed || 0), 0,
    );

    // Daily trade metrics
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTrades = recentTrades.filter((t: any) => {
      const ts = t.timestamp instanceof Date ? t.timestamp : new Date(t.timestamp);
      return ts >= todayStart;
    });
    const wins = todayTrades.filter((t: any) => (t.pnl || 0) > 0).length;
    const losses = todayTrades.filter((t: any) => (t.pnl || 0) <= 0).length;
    const todayPnl = todayTrades.reduce((s: number, t: any) => s + (t.pnl || 0), 0);

    // Consecutive losses
    let consecutiveLosses = 0;
    for (let i = recentTrades.length - 1; i >= 0; i--) {
      if ((recentTrades[i].pnl || 0) <= 0) {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    // Risk score (0-100, higher = more risky)
    let riskScore = 0;
    const warnings: string[] = [];

    if (consecutiveLosses >= cfg.safety.consecutiveLossLimit) {
      riskScore += 30;
      warnings.push(`Consecutive loss limit reached (${consecutiveLosses}/${cfg.safety.consecutiveLossLimit})`);
    }
    if (todayPnl < -cfg.safety.dailyLossLimit) {
      riskScore += 30;
      warnings.push(`Daily loss limit breached ($${todayPnl.toFixed(2)})`);
    }
    if (breakers.some((b: any) => b.state === 'OPEN')) {
      riskScore += 40;
      warnings.push('One or more circuit breakers are OPEN');
    }

    const riskLevel = riskScore >= 70 ? 'CRITICAL' : riskScore >= 40 ? 'HIGH' : riskScore >= 20 ? 'MEDIUM' : 'LOW';

    const response: RiskResponse = {
      timestamp: new Date().toISOString(),
      drawdown: {
        current: 0, // Would need historical PnL to compute
        max: cfg.safety.maxDrawdownPercent,
        daily: todayPnl,
      },
      exposure: {
        gross: totalExposure,
        net: longExposure - shortExposure,
        long: longExposure,
        short: shortExposure,
        utilization: portfolioValue > 0 ? totalExposure / portfolioValue : 0,
      },
      circuitBreakers: breakers.map((b: any) => ({
        name: b.name,
        state: b.state,
        lastTripTime: b.lastTripTime,
        tripCount: b.tripCount,
        resetTime: b.resetTime,
      })),
      dailyMetrics: {
        pnl: todayPnl,
        trades: todayTrades.length,
        wins,
        losses,
        consecutiveLosses,
      },
      riskScore,
      riskLevel,
      warnings,
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /risk error:', error);
    res.json({
      timestamp: new Date().toISOString(),
      drawdown: { current: 0, max: 0, daily: 0 },
      exposure: { gross: 0, net: 0, long: 0, short: 0, utilization: 0 },
      circuitBreakers: [],
      dailyMetrics: { pnl: 0, trades: 0, wins: 0, losses: 0, consecutiveLosses: 0 },
      riskScore: 0,
      riskLevel: 'LOW',
      warnings: [],
    } satisfies RiskResponse);
  }
});

// POST /risk/limits — Update risk limits
router.post('/risk/limits', (req: Request, res: Response) => {
  const body = req.body as RiskLimitsRequest;

  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
    return res.status(400).json({
      error: 'No risk limit fields provided to update',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    const cfg = configManager.get();
    const previousLimits: Record<string, number> = {
      maxPositionSize: cfg.risk.maxPositionSize,
      maxDailyLoss: cfg.risk.maxDailyLoss,
      maxLeverage: cfg.risk.maxLeverage,
      maxDrawdownPercent: cfg.safety.maxDrawdownPercent,
      dailyLossLimit: cfg.safety.dailyLossLimit,
      consecutiveLossLimit: cfg.safety.consecutiveLossLimit,
      maxTradesPerDay: cfg.safety.maxTradesPerDay,
    };

    // Update risk section
    const riskUpdates: Record<string, any> = {};
    if (body.maxPositionSize !== undefined) riskUpdates.maxPositionSize = body.maxPositionSize;
    if (body.maxDailyLoss !== undefined) riskUpdates.maxDailyLoss = body.maxDailyLoss;
    if (body.maxLeverage !== undefined) riskUpdates.maxLeverage = body.maxLeverage;
    if (Object.keys(riskUpdates).length > 0) {
      configManager.update('risk', riskUpdates);
    }

    // Update safety section
    const safetyUpdates: Record<string, any> = {};
    if (body.maxDrawdownPercent !== undefined) safetyUpdates.maxDrawdownPercent = body.maxDrawdownPercent;
    if (body.dailyLossLimit !== undefined) safetyUpdates.dailyLossLimit = body.dailyLossLimit;
    if (body.consecutiveLossLimit !== undefined) safetyUpdates.consecutiveLossLimit = body.consecutiveLossLimit;
    if (body.maxTradesPerDay !== undefined) safetyUpdates.maxTradesPerDay = body.maxTradesPerDay;
    if (Object.keys(safetyUpdates).length > 0) {
      configManager.update('safety', safetyUpdates);
    }

    const newCfg = configManager.get();
    const newLimits: Record<string, number> = {
      maxPositionSize: newCfg.risk.maxPositionSize,
      maxDailyLoss: newCfg.risk.maxDailyLoss,
      maxLeverage: newCfg.risk.maxLeverage,
      maxDrawdownPercent: newCfg.safety.maxDrawdownPercent,
      dailyLossLimit: newCfg.safety.dailyLossLimit,
      consecutiveLossLimit: newCfg.safety.consecutiveLossLimit,
      maxTradesPerDay: newCfg.safety.maxTradesPerDay,
    };

    logger.info('[AgentAPI] Risk limits updated:', { previous: previousLimits, new: newLimits });

    const response: RiskLimitsResponse = {
      success: true,
      previousLimits,
      newLimits,
      message: 'Risk limits updated successfully',
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /risk/limits error:', error);
    res.status(500).json({
      error: 'Failed to update risk limits',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// POST /emergency-stop — Emergency stop all trading
router.post('/emergency-stop', async (_req: Request, res: Response) => {
  try {
    let positionsClosed = 0;
    let ordersCancelled = 0;

    // Close all positions via position recovery
    const recovery = await getPositionRecovery();
    if (recovery && typeof recovery.emergencyCloseAll === 'function') {
      try {
        const result = await recovery.emergencyCloseAll();
        positionsClosed = result?.positionsClosed || 0;
      } catch (err) {
        logger.error('[AgentAPI] Emergency close failed:', err);
      }
    }

    // Stop execution engine
    const engine = await getExecutionEngine();
    if (engine && typeof engine.emergencyStop === 'function') {
      try {
        await engine.emergencyStop();
        ordersCancelled = 1;
      } catch (err) {
        logger.error('[AgentAPI] Execution engine emergency stop failed:', err);
      }
    }

    // Publish emergency stop event
    await messageBus.publish(Channel.ERROR, {
      type: 'EMERGENCY_STOP',
      message: 'Emergency stop executed via Agent API — all positions closed',
      timestamp: new Date(),
    }).catch(() => { /* best effort */ });

    // Update all agent statuses (persists to SQLite)
    stopAllAgents();

    logger.warn('[AgentAPI] EMERGENCY STOP executed via Agent API');

    const response: EmergencyStopResponse = {
      success: true,
      message: 'Emergency stop executed — all positions closed, orders cancelled',
      positionsClosed,
      ordersCancelled,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /emergency-stop error:', error);
    res.status(500).json({
      error: 'Emergency stop failed',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// ===========================================================================
// HELPERS — SQLite direct query for data endpoints
// ===========================================================================

async function getTradingDb(): Promise<any> {
  try {
    const BetterSqlite3 = await import('better-sqlite3').then(m => m.default);
    const cfg = configManager.get();
    const dbPath = cfg.database?.connection || './data/trading.db';
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    return db;
  } catch (error) {
    logger.error('[AgentAPI] Failed to open trading.db:', error);
    return null;
  }
}

// ===========================================================================
// HELPERS — In-memory webhook store + SQLite persistence
// ===========================================================================

interface InMemoryWebhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  active: boolean;
  createdAt: string;
  lastTriggered?: string;
  description?: string;
}

const webhookStore: Map<string, InMemoryWebhook> = new Map();

async function initWebhookTable(): Promise<void> {
  const db = await getTradingDb();
  if (!db) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_webhooks (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        events TEXT NOT NULL,
        secret TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        last_triggered TEXT,
        description TEXT
      )
    `);
    // Restore from DB into memory
    const rows = db.prepare('SELECT * FROM agent_webhooks WHERE active = 1').all();
    for (const row of rows as any[]) {
      webhookStore.set(row.id, {
        id: row.id,
        url: row.url,
        events: JSON.parse(row.events),
        secret: row.secret,
        active: true,
        createdAt: row.created_at,
        lastTriggered: row.last_triggered,
        description: row.description,
      });
    }
    logger.info(`[AgentAPI] Restored ${rows.length} webhooks from DB`);
  } catch (error) {
    logger.error('[AgentAPI] Failed to init webhook table:', error);
  } finally {
    db.close();
  }
}

// Initialize webhooks on load
initWebhookTable().catch(() => { /* best effort */ });

async function persistWebhook(webhook: InMemoryWebhook): Promise<void> {
  const db = await getTradingDb();
  if (!db) return;
  try {
    db.prepare(`
      INSERT OR REPLACE INTO agent_webhooks (id, url, events, secret, active, created_at, last_triggered, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      webhook.id,
      webhook.url,
      JSON.stringify(webhook.events),
      webhook.secret || null,
      webhook.active ? 1 : 0,
      webhook.createdAt,
      webhook.lastTriggered || null,
      webhook.description || null,
    );
  } catch (error) {
    logger.error('[AgentAPI] Failed to persist webhook:', error);
  } finally {
    db.close();
  }
}

async function removeWebhookFromDb(id: string): Promise<void> {
  const db = await getTradingDb();
  if (!db) return;
  try {
    db.prepare('UPDATE agent_webhooks SET active = 0 WHERE id = ?').run(id);
  } catch (error) {
    logger.error('[AgentAPI] Failed to remove webhook from DB:', error);
  } finally {
    db.close();
  }
}

// ===========================================================================
// BACKTEST MANAGEMENT
// ===========================================================================

// POST /backtest/run — Trigger a backtest with config
router.post('/backtest/run', async (req: Request, res: Response) => {
  const body = req.body as BacktestRunRequest;

  if (!body.strategyId || !body.instruments || !Array.isArray(body.instruments) || body.instruments.length === 0) {
    return res.status(400).json({
      error: 'strategyId and instruments (non-empty array) are required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  if (!body.dateRange || !body.dateRange.from || !body.dateRange.to) {
    return res.status(400).json({
      error: 'dateRange with from and to timestamps is required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    const backtestId = `bt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Store the job in SQLite backtest_jobs table
    const db = await getTradingDb();
    if (db) {
      try {
        db.prepare(`
          INSERT INTO backtest_jobs (id, strategy_id, status, started_at, created_at)
          VALUES (?, ?, 'PENDING', NULL, ?)
        `).run(backtestId, body.strategyId, new Date().toISOString());
      } catch (err) {
        logger.warn('[AgentAPI] Failed to insert backtest job:', err);
      } finally {
        db.close();
      }
    }

    // Publish backtest request to message bus
    await messageBus.publish('backtest:run', {
      backtestId,
      strategyId: body.strategyId,
      strategyName: body.strategyName || '',
      strategyType: body.strategyType || 'AI_PREDICTION',
      instruments: body.instruments,
      dateRange: body.dateRange,
      initialCapital: body.initialCapital || 10000,
      parameters: body.parameters || {},
      source: 'agent-api',
      timestamp: new Date(),
    }).catch(() => { /* best effort */ });

    logger.info(`[AgentAPI] Backtest triggered: ${backtestId} for strategy ${body.strategyId}`);

    const response: BacktestRunResponse = {
      success: true,
      backtestId,
      status: 'PENDING',
      message: `Backtest job ${backtestId} queued`,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /backtest/run error:', error);
    res.status(500).json({
      error: 'Failed to trigger backtest',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// GET /backtest/:id/results — Get backtest results by ID
router.get('/backtest/:id/results', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const db = await getTradingDb();
    if (!db) {
      return res.status(503).json({
        error: 'Database not available',
        timestamp: new Date().toISOString(),
      } satisfies AgentApiError);
    }

    try {
      // Try backtest_jobs table first
      const job = (db.prepare('SELECT * FROM backtest_jobs WHERE id = ?').get(id)) as any;

      if (!job) {
        return res.status(404).json({
          error: `Backtest ${id} not found`,
          timestamp: new Date().toISOString(),
        } satisfies AgentApiError);
      }

      // If results are stored as JSON
      let resultData: any = null;
      if (job.results) {
        try {
          resultData = JSON.parse(job.results);
        } catch { resultData = null; }
      }

      const trades: any[] = [];
      if (resultData && Array.isArray(resultData.trades)) {
        for (const t of resultData.trades) {
          trades.push({
            id: t.id || `t_${Math.random().toString(36).substring(2, 8)}`,
            symbol: t.symbol,
            side: t.side,
            size: t.size,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            pnl: t.pnl,
            timestamp: t.timestamp instanceof Date ? t.timestamp.toISOString() : String(t.timestamp),
            strategyId: job.strategy_id,
          });
        }
      }

      const response: BacktestResultsResponse = {
        backtestId: id,
        strategyId: job.strategy_id || '',
        strategyName: resultData?.strategyName || '',
        status: (job.status || 'PENDING').toUpperCase(),
        dateRange: {
          from: resultData?.periodStart || job.started_at || '',
          to: resultData?.periodEnd || job.completed_at || '',
        },
        instruments: resultData?.instruments || [],
        initialCapital: resultData?.initialCapital || 10000,
        finalCapital: resultData?.finalCapital || 0,
        totalReturn: resultData?.totalReturn || 0,
        annualizedReturn: resultData?.annualizedReturn || 0,
        sharpeRatio: resultData?.sharpeRatio || 0,
        maxDrawdown: resultData?.maxDrawdown || 0,
        winRate: resultData?.winRate || 0,
        totalTrades: resultData?.totalTrades || trades.length,
        profitFactor: resultData?.profitFactor || 0,
        trades,
        equityCurve: resultData?.equityCurve || [],
        error: job.error || undefined,
        createdAt: job.created_at,
        completedAt: job.completed_at || undefined,
      };
      res.json(response);
    } finally {
      db.close();
    }
  } catch (error) {
    logger.error(`[AgentAPI] /backtest/${id}/results error:`, error);
    res.status(500).json({
      error: 'Failed to get backtest results',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// GET /backtest/history — List past backtest runs
router.get('/backtest/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const db = await getTradingDb();
    if (!db) {
      return res.json({ runs: [], total: 0, timestamp: new Date().toISOString() } satisfies BacktestHistoryResponse);
    }

    try {
      const rows = (db.prepare(
        'SELECT * FROM backtest_jobs ORDER BY created_at DESC LIMIT ?',
      ).all(limit)) as any[];

      const runs = rows.map((row) => {
        let resultData: any = null;
        if (row.results) {
          try { resultData = JSON.parse(row.results); } catch { /* ignore */ }
        }

        // Try to get strategy name from strategies table
        let strategyName = '';
        if (row.strategy_id) {
          const strat = db.prepare('SELECT name FROM strategies WHERE id = ?').get(row.strategy_id) as any;
          strategyName = strat?.name || resultData?.strategyName || '';
        }

        return {
          id: row.id,
          strategyId: row.strategy_id || '',
          strategyName,
          status: (row.status || 'PENDING').toUpperCase(),
          instruments: resultData?.instruments || [],
          totalReturn: resultData?.totalReturn || 0,
          sharpeRatio: resultData?.sharpeRatio || 0,
          maxDrawdown: resultData?.maxDrawdown || 0,
          winRate: resultData?.winRate || 0,
          totalTrades: resultData?.totalTrades || 0,
          createdAt: row.created_at,
          completedAt: row.completed_at || undefined,
          error: row.error || undefined,
        };
      });

      const response: BacktestHistoryResponse = {
        runs,
        total: runs.length,
        timestamp: new Date().toISOString(),
      };
      res.json(response);
    } finally {
      db.close();
    }
  } catch (error) {
    logger.error('[AgentAPI] /backtest/history error:', error);
    res.json({ runs: [], total: 0, timestamp: new Date().toISOString() } satisfies BacktestHistoryResponse);
  }
});

// ===========================================================================
// HISTORICAL DATA QUERIES
// ===========================================================================

// GET /data/candles — Candle/OHLCV data
router.get('/data/candles', async (req: Request, res: Response) => {
  const instrument = (req.query.instrument as string || '').toUpperCase();
  const timeframe = req.query.timeframe as string || '1h';
  const fromParam = req.query.from as string;
  const toParam = req.query.to as string;

  if (!instrument) {
    return res.status(400).json({
      error: 'instrument query parameter is required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    const from = fromParam ? Math.floor(new Date(fromParam).getTime() / 1000) : 0;
    const to = toParam ? Math.floor(new Date(toParam).getTime() / 1000) : Math.floor(Date.now() / 1000);

    const db = await getTradingDb();
    if (!db) {
      return res.json({
        instrument,
        timeframe,
        from: fromParam || new Date(0).toISOString(),
        to: toParam || new Date().toISOString(),
        candles: [],
        count: 0,
      } satisfies CandlesResponse);
    }

    try {
      const candles = (db.prepare(`
        SELECT timestamp, open, high, low, close, volume
        FROM candles
        WHERE symbol = ? AND timeframe = ? AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp ASC
        LIMIT 5000
      `).all(instrument, timeframe, from, to)) as any[];

      const response: CandlesResponse = {
        instrument,
        timeframe,
        from: new Date(from * 1000).toISOString(),
        to: new Date(to * 1000).toISOString(),
        candles: candles.map(c => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        count: candles.length,
      };
      res.json(response);
    } finally {
      db.close();
    }
  } catch (error) {
    logger.error('[AgentAPI] /data/candles error:', error);
    res.json({
      instrument,
      timeframe,
      from: fromParam || new Date(0).toISOString(),
      to: toParam || new Date().toISOString(),
      candles: [],
      count: 0,
    } satisfies CandlesResponse);
  }
});

// GET /data/trades — Recent market trades
router.get('/data/trades', async (req: Request, res: Response) => {
  const instrument = (req.query.instrument as string || '').toUpperCase();
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);

  if (!instrument) {
    return res.status(400).json({
      error: 'instrument query parameter is required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    const db = await getTradingDb();
    if (!db) {
      return res.json({ instrument, trades: [], count: 0 } satisfies TradesResponse);
    }

    try {
      const trades = (db.prepare(`
        SELECT id, timestamp, price, size, side, symbol
        FROM market_trades
        WHERE symbol = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(instrument, limit)) as any[];

      const response: TradesResponse = {
        instrument,
        trades: trades.map(t => ({
          id: t.id,
          timestamp: t.timestamp,
          price: t.price,
          size: t.size,
          side: t.side,
          symbol: t.symbol,
        })),
        count: trades.length,
      };
      res.json(response);
    } finally {
      db.close();
    }
  } catch (error) {
    logger.error('[AgentAPI] /data/trades error:', error);
    res.json({ instrument, trades: [], count: 0 } satisfies TradesResponse);
  }
});

// GET /data/funding — Funding rate history
router.get('/data/funding', async (req: Request, res: Response) => {
  const instrument = (req.query.instrument as string || '').toUpperCase();
  const limit = Math.min(parseInt(req.query.limit as string) || 24, 500);

  if (!instrument) {
    return res.status(400).json({
      error: 'instrument query parameter is required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    const db = await getTradingDb();
    if (!db) {
      return res.json({ instrument, rates: [], count: 0 } satisfies FundingRatesResponse);
    }

    try {
      const rates = (db.prepare(`
        SELECT id, symbol, timestamp, fundingRate, nextFundingTime
        FROM funding_rates
        WHERE symbol = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(instrument, limit)) as any[];

      const currentRate = rates.length > 0 ? rates[0].fundingRate : undefined;
      const nextFundingTime = rates.length > 0 ? rates[0].nextFundingTime : undefined;

      const response: FundingRatesResponse = {
        instrument,
        rates: rates.map(r => ({
          id: r.id,
          symbol: r.symbol,
          timestamp: r.timestamp,
          fundingRate: r.fundingRate,
          nextFundingTime: r.nextFundingTime,
        })),
        count: rates.length,
        currentRate,
        nextFundingTime,
      };
      res.json(response);
    } finally {
      db.close();
    }
  } catch (error) {
    logger.error('[AgentAPI] /data/funding error:', error);
    res.json({ instrument, rates: [], count: 0 } satisfies FundingRatesResponse);
  }
});

// ===========================================================================
// ORDER MANAGEMENT
// ===========================================================================

// GET /orders — List open orders
router.get('/orders', async (_req: Request, res: Response) => {
  try {
    const engine = await getExecutionEngine();
    if (!engine || typeof engine.getOpenOrders !== 'function') {
      return res.json({
        orders: [],
        total: 0,
        timestamp: new Date().toISOString(),
      } satisfies OrdersResponse);
    }

    const orders = await engine.getOpenOrders().catch(() => []);

    const response: OrdersResponse = {
      orders: (orders as any[]).map((o: any) => ({
        id: o.id || o.orderId || '',
        symbol: o.symbol || '',
        side: o.side || 'BUY',
        type: o.type || 'LIMIT',
        size: o.size || o.quantity || 0,
        price: o.price,
        stopPrice: o.stopPrice,
        filledSize: o.filledSize || o.filledQuantity || 0,
        status: o.status || 'OPEN',
        createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt || ''),
        updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : String(o.updatedAt || ''),
      })),
      total: (orders as any[]).length,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /orders error:', error);
    res.json({
      orders: [],
      total: 0,
      timestamp: new Date().toISOString(),
    } satisfies OrdersResponse);
  }
});

// POST /orders/cancel — Cancel order by ID
router.post('/orders/cancel', async (req: Request, res: Response) => {
  const body = req.body as CancelOrderRequest;

  if (!body.orderId) {
    return res.status(400).json({
      error: 'orderId is required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    const engine = await getExecutionEngine();
    if (!engine || typeof engine.cancelOrder !== 'function') {
      return res.status(503).json({
        error: 'Execution engine not available',
        timestamp: new Date().toISOString(),
      } satisfies AgentApiError);
    }

    const result = await engine.cancelOrder(body.orderId).catch(
      (err: any) => ({ error: err.message || String(err) }),
    );

    if (result && (result as any).error) {
      return res.status(400).json({
        success: false,
        orderId: body.orderId,
        message: (result as any).error,
      } satisfies CancelOrderResponse);
    }

    logger.info(`[AgentAPI] Order ${body.orderId} cancelled via API`);

    const response: CancelOrderResponse = {
      success: true,
      orderId: body.orderId,
      message: `Order ${body.orderId} cancelled`,
      previousStatus: (result as any)?.previousStatus,
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /orders/cancel error:', error);
    res.status(500).json({
      error: 'Failed to cancel order',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// POST /orders/cancel-all — Cancel all open orders
router.post('/orders/cancel-all', async (req: Request, res: Response) => {
  try {
    const engine = await getExecutionEngine();
    if (!engine || typeof engine.cancelAllOrders !== 'function') {
      return res.status(503).json({
        error: 'Execution engine not available',
        timestamp: new Date().toISOString(),
      } satisfies AgentApiError);
    }

    // Get open orders first for the response
    const openOrders = await engine.getOpenOrders?.().catch(() => []) ?? [];
    const openOrderIds = (openOrders as any[]).map((o: any) => o.id || o.orderId).filter(Boolean);

    const result = await engine.cancelAllOrders().catch(
      (err: any) => ({ error: err.message || String(err) }),
    );

    if (result && (result as any).error) {
      return res.status(400).json({
        success: false,
        cancelledCount: 0,
        message: (result as any).error,
        cancelledOrders: [],
      } satisfies CancelAllOrdersResponse);
    }

    const cancelledCount = (result as any)?.cancelledCount ?? openOrderIds.length;

    logger.info(`[AgentAPI] All ${cancelledCount} open orders cancelled via API`);

    const response: CancelAllOrdersResponse = {
      success: true,
      cancelledCount,
      message: `${cancelledCount} open orders cancelled`,
      cancelledOrders: openOrderIds,
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] /orders/cancel-all error:', error);
    res.status(500).json({
      error: 'Failed to cancel all orders',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// ===========================================================================
// LOG STREAMING
// ===========================================================================

// GET /logs — Query agent logs
router.get('/logs', async (req: Request, res: Response) => {
  const agent = req.query.agent as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
  const level = req.query.level as string | undefined;

  try {
    const db = await getTradingDb();
    if (!db) {
      // Fallback: return from agent_traces in trace store
      return getLogsFromTraces(agent, limit, level, res);
    }

    try {
      // Query agent_traces for log-like entries, optionally filtered by agent type
      let rows: any[];
      if (agent) {
        rows = (db.prepare(`
          SELECT created_at, agent_type, trace_data, success
          FROM agent_traces
          WHERE agent_type = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(agent.toUpperCase(), limit)) as any[];
      } else {
        rows = (db.prepare(`
          SELECT created_at, agent_type, trace_data, success
          FROM agent_traces
          ORDER BY created_at DESC
          LIMIT ?
        `).all(limit)) as any[];
      }

      const logs: any[] = [];
      for (const row of rows) {
        let logLevel: string = 'info';
        let message = '';

        try {
          const traceData = JSON.parse(row.trace_data);
          message = traceData.thoughts?.[0] || traceData.errors?.[0] || `Trace ${row.created_at}`;
          if (!row.success) logLevel = 'error';
          if (traceData.errors?.length > 0) logLevel = 'error';
        } catch {
          message = `Agent trace at ${row.created_at}`;
        }

        // Filter by level if specified
        if (level && logLevel !== level.toLowerCase()) continue;

        logs.push({
          timestamp: row.created_at,
          level: logLevel,
          agent: row.agent_type?.toLowerCase(),
          message,
        });
      }

      const response: AgentLogsResponse = {
        logs,
        total: logs.length,
        limit,
        agent,
        level,
        timestamp: new Date().toISOString(),
      };
      res.json(response);
    } finally {
      db.close();
    }
  } catch (error) {
    logger.error('[AgentAPI] /logs error:', error);
    getLogsFromTraces(agent, limit, level, res);
  }
});

function getLogsFromTraces(
  agent: string | undefined,
  limit: number,
  level: string | undefined,
  res: Response,
): void {
  try {
    traceStore.initialize();
    const traces = traceStore.getRecentTraceSummaries(limit * 2);

    const logs: any[] = [];
    for (const trace of traces as any[]) {
      if (agent && trace.agentType?.toLowerCase() !== agent.toLowerCase()) continue;

      let logLevel = 'info';
      let message = `Cycle for ${trace.symbol || 'unknown'} — success: ${trace.success}`;

      if (!trace.success || trace.riskScore > 70) {
        logLevel = 'error';
        message = `Failed cycle for ${trace.symbol || 'unknown'} (risk: ${trace.riskScore})`;
      } else if (trace.riskScore > 40) {
        logLevel = 'warn';
        message = `High-risk cycle for ${trace.symbol || 'unknown'} (risk: ${trace.riskScore})`;
      }

      if (level && logLevel !== level.toLowerCase()) continue;

      logs.push({
        timestamp: trace.createdAt || trace.startTime,
        level: logLevel,
        agent: trace.agentType?.toLowerCase(),
        message,
        meta: { symbol: trace.symbol, riskScore: trace.riskScore },
      });
    }

    const response: AgentLogsResponse = {
      logs: logs.slice(0, limit),
      total: logs.length,
      limit,
      agent,
      level,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch {
    res.json({
      logs: [],
      total: 0,
      limit,
      agent,
      level,
      timestamp: new Date().toISOString(),
    } satisfies AgentLogsResponse);
  }
}

// ===========================================================================
// WEBHOOK MANAGEMENT
// ===========================================================================

// POST /webhooks — Register webhook URL for events
router.post('/webhooks', async (req: Request, res: Response) => {
  const body = req.body as WebhookRegisterRequest;

  if (!body.url || !body.events || !Array.isArray(body.events) || body.events.length === 0) {
    return res.status(400).json({
      error: 'url and events (non-empty array) are required',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  // Validate URL
  try {
    new URL(body.url);
  } catch {
    return res.status(400).json({
      error: 'Invalid URL format',
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  const validEvents = ['trade', 'signal', 'risk_alert', 'agent_status', 'backtest_complete', 'position_change'];
  const invalidEvents = body.events.filter(e => !validEvents.includes(e));
  if (invalidEvents.length > 0) {
    return res.status(400).json({
      error: `Invalid events: ${invalidEvents.join(', ')}. Valid: ${validEvents.join(', ')}`,
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const webhook: InMemoryWebhook = {
      id: webhookId,
      url: body.url,
      events: body.events,
      secret: body.secret,
      active: true,
      createdAt: new Date().toISOString(),
      description: body.description,
    };

    // Store in memory
    webhookStore.set(webhookId, webhook);

    // Persist to SQLite
    await persistWebhook(webhook);

    logger.info(`[AgentAPI] Webhook registered: ${webhookId} → ${body.url} [${body.events.join(', ')}]`);

    const response: WebhookRegisterResponse = {
      success: true,
      webhook: {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events as any,
        secret: webhook.secret,
        active: webhook.active,
        createdAt: webhook.createdAt,
        description: webhook.description,
      },
      message: `Webhook ${webhookId} registered`,
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] POST /webhooks error:', error);
    res.status(500).json({
      error: 'Failed to register webhook',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// DELETE /webhooks/:id — Remove webhook
router.delete('/webhooks/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const webhook = webhookStore.get(id);
  if (!webhook) {
    return res.status(404).json({
      error: `Webhook ${id} not found`,
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }

  try {
    // Remove from memory
    webhookStore.delete(id);

    // Mark as inactive in DB
    await removeWebhookFromDb(id);

    logger.info(`[AgentAPI] Webhook removed: ${id}`);

    const response: WebhookDeleteResponse = {
      success: true,
      webhookId: id,
      message: `Webhook ${id} removed`,
    };
    res.json(response);
  } catch (error) {
    logger.error(`[AgentAPI] DELETE /webhooks/${id} error:`, error);
    res.status(500).json({
      error: 'Failed to remove webhook',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    } satisfies AgentApiError);
  }
});

// GET /webhooks — List active webhooks
router.get('/webhooks', (_req: Request, res: Response) => {
  try {
    const webhooks: WebhookConfig[] = Array.from(webhookStore.values()).map(wh => ({
      id: wh.id,
      url: wh.url,
      events: wh.events as WebhookEvent[],
      active: wh.active,
      createdAt: wh.createdAt,
      ...(wh.secret && { secret: wh.secret }),
      ...(wh.lastTriggered && { lastTriggered: wh.lastTriggered }),
      ...(wh.description && { description: wh.description }),
    }));

    const response: WebhooksListResponse = {
      webhooks,
      total: webhooks.length,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  } catch (error) {
    logger.error('[AgentAPI] GET /webhooks error:', error);
    res.json({
      webhooks: [],
      total: 0,
      timestamp: new Date().toISOString(),
    } satisfies WebhooksListResponse);
  }
});

export default router;
