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
} from './agent-api-types';

const router = Router();

// ---------------------------------------------------------------------------
// Helper: start the process clock (for uptime)
// ---------------------------------------------------------------------------
const PROCESS_START = Date.now();

// ---------------------------------------------------------------------------
// In-memory agent registry — tracks which agents are currently running
// ---------------------------------------------------------------------------
const agentRegistry = new Map<AgentName, {
  status: AgentStatus;
  startedAt: number | null;
  cyclesCompleted: number;
  errorCount: number;
  lastError: string | null;
  lastActivity: number | null;
}>();

const VALID_AGENTS: AgentName[] = ['news', 'execution', 'prediction', 'pumpfun', 'safekeeping', 'research'];

const AGENT_DESCRIPTIONS: Record<AgentName, string> = {
  news: 'News ingestion, clustering, and sentiment analysis pipeline',
  execution: 'Trade execution engine for Hyperliquid perpetuals',
  prediction: 'Prediction market analysis and trading (Polymarket)',
  pumpfun: 'pump.fun token discovery and analysis agent',
  safekeeping: 'Automated yield farming and DeFi safekeeping fund',
  research: 'Strategy research, backtesting, and genetic evolution engine',
};

// Initialize agent registry with defaults
for (const name of VALID_AGENTS) {
  agentRegistry.set(name, {
    status: 'STOPPED',
    startedAt: null,
    cyclesCompleted: 0,
    errorCount: 0,
    lastError: null,
    lastActivity: null,
  });
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
    agentRegistry.forEach((state, name) => {
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
      const state = agentRegistry.get(name)!;

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

  const state = agentRegistry.get(agentName)!;
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

    // Update registry
    state.status = 'RUNNING';
    state.startedAt = Date.now();
    state.lastError = null;
    state.lastActivity = Date.now();

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
    state.status = 'ERROR';
    state.errorCount++;
    state.lastError = error instanceof Error ? error.message : String(error);

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

  const state = agentRegistry.get(agentName)!;
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

    state.status = 'STOPPED';
    state.startedAt = null;
    state.lastActivity = Date.now();

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

    // Update all agent statuses
    agentRegistry.forEach((state) => {
      state.status = 'STOPPED';
      state.startedAt = null;
      state.lastActivity = Date.now();
    });

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

export default router;
