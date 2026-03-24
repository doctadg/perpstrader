// Live Training Data Capture Module
// Captures clean, training-ready data from trading cycles for ML training

import fs from 'fs';
import path from 'path';
import { AgentState } from '../langgraph/state';
import newsStore from './news-store';
import logger from '../shared/logger';

// ============================================================================
// Types
// ============================================================================

export type CycleClassification = 'trade_executed' | 'no_trade' | 'rejected_by_risk' | 'error';

export interface TrainingCaptureRecord {
  cycleId: string;
  timestamp: string;
  symbol: string;
  timeframe: string;
  classification: CycleClassification;
  regime: string | null;
  signal: {
    action: string;
    confidence: number;
    reason: string;
    strategyId: string;
  } | null;
  selectedStrategy: {
    name: string;
    type: string;
    confidence: number;
  } | null;
  riskAssessment: {
    approved: boolean;
    riskScore: number;
    leverage: number;
    warnings: string[];
  } | null;
  executionResult: {
    status: string;
    side: string;
    size: number;
    price: number;
    fee: number;
  } | null;
  indicators: {
    rsi: number | null;
    macd: {
      macd: number | null;
      signal: number | null;
      histogram: number | null;
    };
    bollinger: {
      upper: number | null;
      middle: number | null;
      lower: number | null;
    };
    atr: number | null;
  } | null;
  strategyIdeasCount: number;
  backtestResultsCount: number;
  similarPatternsCount: number;
  patternBias: string | null;
  patternAvgReturn: number;
  thoughts: string[];
  errors: string[];
  newsContext: Array<{
    title: string;
    source: string;
    sentiment: string;
    importance: string;
    publishedAt: string | null;
    url: string;
  }> | null;
  metadata: {
    captureVersion: number;
    source: string;
    cycleDurationMs: number;
  };
}

export interface CaptureStats {
  totalCaptures: number;
  todayCaptures: number;
  lastCaptureTime: string | null;
  files: string[];
}

// ============================================================================
// Configuration
// ============================================================================

const CAPTURE_VERSION = 1;
const SOURCE = 'perpstrader-live';
const CAPTURE_DIR = path.join(__dirname, '../../training-dataset/live-capture');
const DEDUP_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour dedup cache

// In-memory dedup cache (cycleId -> timestamp)
const dedupCache = new Map<string, number>();

// ============================================================================
// Classification Logic
// ============================================================================

function classifyCycle(state: AgentState): CycleClassification {
  // Error takes precedence
  if (state.errors.length > 0) {
    return 'error';
  }

  // Trade executed
  if (state.shouldExecute && state.executionResult !== null) {
    return 'trade_executed';
  }

  // Rejected by risk
  if (
    !state.shouldExecute &&
    state.signal !== null &&
    state.riskAssessment !== null &&
    !state.riskAssessment.approved
  ) {
    return 'rejected_by_risk';
  }

  // No trade (signal is null or HOLD)
  return 'no_trade';
}

// ============================================================================
// Indicator Extraction (last values from arrays)
// ============================================================================

function extractIndicators(state: AgentState): TrainingCaptureRecord['indicators'] {
  if (!state.indicators) return null;

  const { rsi, macd, bollinger, volatility } = state.indicators;

  // Get last values from arrays
  const lastRsi = rsi.length > 0 ? rsi[rsi.length - 1] : null;
  const lastMacd = macd.macd.length > 0 ? macd.macd[macd.macd.length - 1] : null;
  const lastMacdSignal = macd.signal.length > 0 ? macd.signal[macd.signal.length - 1] : null;
  const lastHistogram = macd.histogram.length > 0 ? macd.histogram[macd.histogram.length - 1] : null;
  const lastUpper = bollinger.upper.length > 0 ? bollinger.upper[bollinger.upper.length - 1] : null;
  const lastMiddle = bollinger.middle.length > 0 ? bollinger.middle[bollinger.middle.length - 1] : null;
  const lastLower = bollinger.lower.length > 0 ? bollinger.lower[bollinger.lower.length - 1] : null;
  const lastAtr = volatility.atr.length > 0 ? volatility.atr[volatility.atr.length - 1] : null;

  return {
    rsi: lastRsi,
    macd: {
      macd: lastMacd,
      signal: lastMacdSignal,
      histogram: lastHistogram,
    },
    bollinger: {
      upper: lastUpper,
      middle: lastMiddle,
      lower: lastLower,
    },
    atr: lastAtr,
  };
}

// ============================================================================
// News Context Extraction
// ============================================================================

async function extractNewsContext(state: AgentState): Promise<TrainingCaptureRecord['newsContext']> {
  // Only fetch news when a trade was executed
  if (!state.shouldExecute || state.executionResult === null) {
    return null;
  }

  try {
    // Try to search for symbol-related news
    const symbolQuery = state.symbol === 'BTC' ? 'bitcoin' : 
                        state.symbol === 'ETH' ? 'ethereum' : 
                        state.symbol;

    // Get recent news for the symbol
    const recentNews = await newsStore.searchNews(symbolQuery, 10);

    if (!recentNews || recentNews.length === 0) {
      // Fallback: get any recent crypto news
      const fallbackNews = await newsStore.getNewsByCategory('CRYPTO', 10);
      if (!fallbackNews || fallbackNews.length === 0) {
        return null;
      }

      return fallbackNews.slice(0, 5).map(item => ({
        title: item.title,
        source: item.source,
        sentiment: item.sentiment,
        importance: item.importance,
        publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
        url: item.url,
      }));
    }

    return recentNews.slice(0, 5).map(item => ({
      title: item.title,
      source: item.source,
      sentiment: item.sentiment,
      importance: item.importance,
      publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
      url: item.url,
    }));
  } catch (error) {
    logger.warn('[TrainingCapture] Failed to fetch news context:', error);
    return null;
  }
}

// ============================================================================
// Deduplication
// ============================================================================

function isDuplicate(cycleId: string): boolean {
  const now = Date.now();
  
  // Clean old entries from cache
  for (const [id, timestamp] of dedupCache.entries()) {
    if (now - timestamp > DEDUP_CACHE_TTL_MS) {
      dedupCache.delete(id);
    }
  }

  if (dedupCache.has(cycleId)) {
    return true;
  }

  dedupCache.set(cycleId, now);
  return false;
}

// ============================================================================
// File Path Management
// ============================================================================

function getCaptureFilePath(date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(CAPTURE_DIR, `capture-${dateStr}.jsonl`);
}

function ensureCaptureDir(): void {
  if (!fs.existsSync(CAPTURE_DIR)) {
    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
    logger.info(`[TrainingCapture] Created capture directory: ${CAPTURE_DIR}`);
  }
}

// ============================================================================
// Main Capture Function
// ============================================================================

export async function captureTrainingData(state: AgentState): Promise<void> {
  const cycleStartTime = Date.now();

  try {
    // Ensure directory exists
    ensureCaptureDir();

    // Deduplicate by cycleId
    if (isDuplicate(state.cycleId)) {
      logger.debug(`[TrainingCapture] Skipping duplicate cycle: ${state.cycleId}`);
      return;
    }

    // Calculate cycle duration
    const cycleDurationMs = state.cycleStartTime 
      ? Date.now() - new Date(state.cycleStartTime).getTime() 
      : 0;

    // Classify the cycle
    const classification = classifyCycle(state);

    // Extract indicators
    const indicators = extractIndicators(state);

    // Extract news context (only for trades)
    const newsContext = await extractNewsContext(state);

    // Build the capture record
    const record: TrainingCaptureRecord = {
      cycleId: state.cycleId,
      timestamp: new Date().toISOString(),
      symbol: state.symbol,
      timeframe: state.timeframe,
      classification,
      regime: state.regime || null,
      signal: state.signal
        ? {
            action: state.signal.action,
            confidence: state.signal.confidence,
            reason: state.signal.reason,
            strategyId: state.signal.strategyId,
          }
        : null,
      selectedStrategy: state.selectedStrategy
        ? {
            name: state.selectedStrategy.name,
            type: state.selectedStrategy.type,
            confidence: state.selectedStrategy.performance?.winRate || 0,
          }
        : null,
      riskAssessment: state.riskAssessment
        ? {
            approved: state.riskAssessment.approved,
            riskScore: state.riskAssessment.riskScore,
            leverage: state.riskAssessment.leverage,
            warnings: state.riskAssessment.warnings,
          }
        : null,
      executionResult: state.executionResult
        ? {
            status: state.executionResult.status,
            side: state.executionResult.side,
            size: state.executionResult.size,
            price: state.executionResult.price,
            fee: state.executionResult.fee,
          }
        : null,
      indicators,
      strategyIdeasCount: state.strategyIdeas.length,
      backtestResultsCount: state.backtestResults.length,
      similarPatternsCount: state.similarPatterns.length,
      patternBias: state.patternBias || null,
      patternAvgReturn: state.patternAvgReturn || 0,
      thoughts: state.thoughts,
      errors: state.errors,
      newsContext,
      metadata: {
        captureVersion: CAPTURE_VERSION,
        source: SOURCE,
        cycleDurationMs,
      },
    };

    // Write to JSONL file (atomic per line)
    const filePath = getCaptureFilePath();
    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(filePath, line, 'utf8');

    logger.info(
      `[TrainingCapture] Captured cycle ${state.cycleId.slice(0, 8)}... ` +
      `| ${classification} | ${state.symbol} | ${state.timeframe}`
    );
  } catch (error) {
    // Never throw - capture failures should not affect trading
    logger.error('[TrainingCapture] Failed to capture training data:', error);
  }
}

// ============================================================================
// Stats Function
// ============================================================================

export function getCaptureStats(): CaptureStats {
  try {
    ensureCaptureDir();

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayFile = path.join(CAPTURE_DIR, `capture-${todayStr}.jsonl`);

    let totalCaptures = 0;
    let todayCaptures = 0;
    let lastCaptureTime: string | null = null;
    const files: string[] = [];

    // List all capture files
    const entries = fs.readdirSync(CAPTURE_DIR);
    for (const entry of entries) {
      if (entry.startsWith('capture-') && entry.endsWith('.jsonl')) {
        files.push(entry);

        const filePath = path.join(CAPTURE_DIR, entry);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);

        totalCaptures += lines.length;

        // Get last line timestamp
        if (lines.length > 0) {
          try {
            const lastLine = JSON.parse(lines[lines.length - 1]);
            if (!lastCaptureTime || lastLine.timestamp > lastCaptureTime) {
              lastCaptureTime = lastLine.timestamp;
            }
          } catch {
            // Ignore parse errors
          }
        }

        // Count today's captures
        if (entry === `capture-${todayStr}.jsonl`) {
          todayCaptures = lines.length;
        }
      }
    }

    return {
      totalCaptures,
      todayCaptures,
      lastCaptureTime,
      files,
    };
  } catch (error) {
    logger.error('[TrainingCapture] Failed to get stats:', error);
    return {
      totalCaptures: 0,
      todayCaptures: 0,
      lastCaptureTime: null,
      files: [],
    };
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  captureTrainingData,
  getCaptureStats,
};
