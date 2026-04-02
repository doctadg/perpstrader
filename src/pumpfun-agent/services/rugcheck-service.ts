// RugCheck.xyz Service — On-chain rug detection API
// Free, no API key, 15 req/min rate limit
// Provides: rug status, risk score, top holders, insider networks, LP locks, transfer fees

import logger from '../../shared/logger';

const RUGCHECK_BASE = 'https://api.rugcheck.xyz/v1';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RugCheckRisk {
  name: string;
  value: string;
  description: string;
  score: number;
  level: 'danger' | 'warn' | 'info';
}

export interface RugCheckTopHolder {
  address: string;
  amount: number;
  decimals: number;
  pct: number;
  uiAmount: number;
  owner: string;
  insider: boolean;
}

export interface RugCheckReport {
  mint: string;
  tokenProgram: string;
  creator: string | null;
  creatorBalance: number;
  token: {
    mintAuthority: string | null;
    supply: number;
    decimals: number;
    isInitialized: boolean;
    freezeAuthority: string | null;
  };
  tokenMeta: {
    name: string;
    symbol: string;
    uri: string;
    mutable: boolean;
    updateAuthority: string;
  };
  topHolders: RugCheckTopHolder[];
  risks: RugCheckRisk[];
  score: number;          // 1 = safe, higher = worse
  score_normalised: number; // 1-100 (1=best)
  lpLockedPct: number | null;
  lockers: Record<string, any>;
  lockerScanStatus: string;
  markets: any[];
  totalMarketLiquidity: number;
  totalStableLiquidity: number;
  totalLPProviders: number;
  totalHolders: number;
  price: number;
  rugged: boolean;
  graphInsidersDetected: number;
  insiderNetworks: any[] | null;
  creatorTokens: any[] | null;
  launchpad: string | null;
  deployPlatform: string;
  verification: {
    mint: string;
    name: string;
    symbol: string;
    jup_verified: boolean;
    jup_strict: boolean;
    links: string[];
  };
  transferFee: {
    pct: number;
    maxAmount: number;
    authority: string;
  };
}

export interface RugCheckSummary {
  tokenProgram: string;
  tokenType: string;
  risks: RugCheckRisk[];
  score: number;
  score_normalised: number;
  lpLockedPct: number | null;
}

// ── Rug Verdict ──────────────────────────────────────────────────────────────

export type RugVerdict = 'SAFE' | 'RUGGED' | 'HIGH_RISK' | 'MEDIUM_RISK' | 'UNKNOWN';

export interface RugCheckResult {
  verdict: RugVerdict;
  report: RugCheckReport | null;
  summary: RugCheckSummary | null;
  rejectReasons: string[];
  scorePenalty: number; // 0-1, how much to penalize scoring
}

// ── Thresholds ───────────────────────────────────────────────────────────────

const THRESHOLDS = {
  // Auto-reject if score exceeds this (higher = more risky on RugCheck)
  maxScore: 500,
  // Auto-reject if top holder controls more than this %
  topHolderMaxPct: 30,
  // Auto-reject if LP locked less than this %
  minLpLockedPct: 50,
  // Honeypot detection: reject if transfer fee exceeds this %
  maxTransferFeePct: 5,
  // Number of insider networks that trigger HIGH_RISK
  insiderNetworkThreshold: 5,
  // Cache TTL in ms (30 seconds — rug status can change fast)
  cacheTtlMs: 30_000,
};

// ── Rate Limiter ─────────────────────────────────────────────────────────────
// RugCheck allows ~15 req/min. We pace at 1 every 4s to stay safe.

class RateLimiter {
  private lastCall = 0;
  private minIntervalMs: number;

  constructor(reqPerMin: number) {
    this.minIntervalMs = Math.ceil(60_000 / reqPerMin);
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    if (elapsed < this.minIntervalMs) {
      const delay = this.minIntervalMs - elapsed;
      await new Promise(r => setTimeout(r, delay));
    }
    this.lastCall = Date.now();
  }
}

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
    // Evict old entries if cache grows too large
    if (this.cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (now - v.timestamp > this.ttlMs) this.cache.delete(k);
      }
    }
  }
}

// ── Service ──────────────────────────────────────────────────────────────────

const rateLimiter = new RateLimiter(14); // 14/min to stay under 15
const reportCache = new SimpleCache<RugCheckReport>(THRESHOLDS.cacheTtlMs);
const summaryCache = new SimpleCache<RugCheckSummary>(THRESHOLDS.cacheTtlMs);

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'PerpsTrader/2.0',
      },
    });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get full RugCheck report for a token mint
 * Includes top holders, insider networks, risks, LP locks, transfer fees
 */
export async function getFullReport(mintAddress: string): Promise<RugCheckReport | null> {
  const cached = reportCache.get(mintAddress);
  if (cached) return cached;

  await rateLimiter.wait();

  try {
    const resp = await fetchWithTimeout(`${RUGCHECK_BASE}/tokens/${mintAddress}/report`);

    if (resp.status === 404) {
      logger.debug(`[RugCheck] No report for ${mintAddress.slice(0, 8)} (404 — token too new?)`);
      return null;
    }

    if (!resp.ok) {
      logger.warn(`[RugCheck] HTTP ${resp.status} for ${mintAddress.slice(0, 8)}`);
      return null;
    }

    const report = await resp.json() as RugCheckReport;
    reportCache.set(mintAddress, report);
    return report;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn(`[RugCheck] Timeout for ${mintAddress.slice(0, 8)}`);
    } else {
      logger.debug(`[RugCheck] Error for ${mintAddress.slice(0, 8)}: ${err.message}`);
    }
    return null;
  }
}

/**
 * Get RugCheck summary (score + risks only, lighter weight)
 */
export async function getSummary(mintAddress: string): Promise<RugCheckSummary | null> {
  const cached = summaryCache.get(mintAddress);
  if (cached) return cached;

  await rateLimiter.wait();

  try {
    const resp = await fetchWithTimeout(`${RUGCHECK_BASE}/tokens/${mintAddress}/report/summary`);

    if (resp.status === 404) return null;
    if (!resp.ok) return null;

    const summary = await resp.json() as RugCheckSummary;
    summaryCache.set(mintAddress, summary);
    return summary;
  } catch (err: any) {
    logger.debug(`[RugCheck] Summary error for ${mintAddress.slice(0, 8)}: ${err.message}`);
    return null;
  }
}

/**
 * Evaluate a token against rug detection thresholds
 * Returns a verdict and list of reject reasons
 */
export async function evaluateToken(mintAddress: string): Promise<RugCheckResult> {
  const emptyResult: RugCheckResult = {
    verdict: 'UNKNOWN',
    report: null,
    summary: null,
    rejectReasons: [],
    scorePenalty: 0,
  };

  // Try full report first (has all data), fall back to summary
  let report = await getFullReport(mintAddress);
  let summary: RugCheckSummary | null = null;

  if (!report) {
    summary = await getSummary(mintAddress);
    if (!summary) {
      // Token too new or API error — don't auto-reject, just mark unknown
      return emptyResult;
    }
  }

  const rejectReasons: string[] = [];
  let scorePenalty = 0;
  let verdict: RugVerdict = 'SAFE';

  // ── FULL REPORT ANALYSIS ─────────────────────────────────────────────────

  if (report) {
    // 1. CONFIRMED RUG
    if (report.rugged) {
      rejectReasons.push(`RUGGED: confirmed rug pull`);
      return {
        verdict: 'RUGGED',
        report,
        summary,
        rejectReasons,
        scorePenalty: 1.0,
      };
    }

    // 2. RISK SCORE
    if (report.score > THRESHOLDS.maxScore) {
      rejectReasons.push(`RISK_SCORE: ${report.score} (>${THRESHOLDS.maxScore})`);
      scorePenalty += 0.5;
      verdict = 'HIGH_RISK';
    } else if (report.score > 100) {
      scorePenalty += 0.2;
      if (verdict === 'SAFE') verdict = 'MEDIUM_RISK';
    }

    // 3. TOP HOLDER CONCENTRATION
    const topHolder = report.topHolders?.[0];
    if (topHolder && topHolder.pct > THRESHOLDS.topHolderMaxPct) {
      rejectReasons.push(`TOP_HOLDER: ${topHolder.pct.toFixed(1)}% (>${THRESHOLDS.topHolderMaxPct}%) insider=${topHolder.insider}`);
      scorePenalty += 0.4;
      verdict = 'HIGH_RISK';
    }

    // 4. INSIDER NETWORKS
    if (report.graphInsidersDetected > THRESHOLDS.insiderNetworkThreshold) {
      rejectReasons.push(`INSIDERS: ${report.graphInsidersDetected} detected (>${THRESHOLDS.insiderNetworkThreshold})`);
      scorePenalty += 0.3;
      if (verdict === 'SAFE') verdict = 'MEDIUM_RISK';
    }

    // 5. TOP HOLDERS WITH INSIDER FLAG
    const insiderHolders = report.topHolders?.filter(h => h.insider) || [];
    if (insiderHolders.length > 2) {
      rejectReasons.push(`INSIDER_HOLDERS: ${insiderHolders.length} flagged insiders in top holders`);
      scorePenalty += 0.3;
      if (verdict === 'SAFE') verdict = 'MEDIUM_RISK';
    }

    // 6. LP LOCK
    if (report.lpLockedPct !== null && report.lpLockedPct !== undefined) {
      if (report.lpLockedPct < THRESHOLDS.minLpLockedPct) {
        rejectReasons.push(`LP_LOCKED: ${report.lpLockedPct.toFixed(1)}% (<${THRESHOLDS.minLpLockedPct}%)`);
        scorePenalty += 0.3;
        if (verdict === 'SAFE') verdict = 'MEDIUM_RISK';
      }
    }

    // 7. TRANSFER FEE (HONEYPOT DETECTION)
    if (report.transferFee?.pct > THRESHOLDS.maxTransferFeePct) {
      rejectReasons.push(`HONEYPOT: transfer fee ${report.transferFee.pct}% (>${THRESHOLDS.maxTransferFeePct}%)`);
      scorePenalty += 0.6;
      verdict = 'HIGH_RISK';
    }

    // 8. CREATOR STILL HOLDING (could dump)
    if (report.creatorBalance > 0 && report.creator) {
      rejectReasons.push(`CREATOR_ACTIVE: creator still holds tokens`);
      scorePenalty += 0.1;
    }

    // 9. VERY FEW HOLDERS (suspiciously low distribution)
    if (report.totalHolders > 0 && report.totalHolders < 20) {
      rejectReasons.push(`LOW_HOLDERS: only ${report.totalHolders} total`);
      scorePenalty += 0.15;
    }

    // 10. VERY FEW LP PROVIDERS
    if (report.totalLPProviders > 0 && report.totalLPProviders < 3) {
      rejectReasons.push(`LOW_LP_PROVIDERS: only ${report.totalLPProviders}`);
      scorePenalty += 0.1;
    }

    // 11. RISK FLAGS FROM RUGCHECK
    for (const risk of report.risks || []) {
      if (risk.level === 'danger') {
        rejectReasons.push(`RC_RISK: ${risk.name} (${risk.value})`);
        scorePenalty += 0.15;
        if (verdict === 'SAFE') verdict = 'MEDIUM_RISK';
      }
    }

    // 12. MINT/FREEZE AUTHORITY (should be revoked for pump.fun graduated tokens)
    if (report.token?.mintAuthority) {
      rejectReasons.push('MINT_AUTHORITY: still set — can print more tokens');
      scorePenalty += 0.3;
      verdict = 'HIGH_RISK';
    }
    if (report.token?.freezeAuthority) {
      rejectReasons.push('FREEZE_AUTHORITY: still set — can freeze your tokens');
      scorePenalty += 0.3;
      verdict = 'HIGH_RISK';
    }

    // Cap penalty
    scorePenalty = Math.min(1.0, scorePenalty);

  } else if (summary) {
    // ── SUMMARY-ONLY ANALYSIS ───────────────────────────────────────────────
    if (summary.score > THRESHOLDS.maxScore) {
      rejectReasons.push(`RISK_SCORE: ${summary.score} (>${THRESHOLDS.maxScore})`);
      scorePenalty += 0.5;
      verdict = 'HIGH_RISK';
    }

    for (const risk of summary.risks || []) {
      if (risk.level === 'danger') {
        rejectReasons.push(`RC_RISK: ${risk.name}`);
        scorePenalty += 0.2;
        if (verdict === 'SAFE') verdict = 'MEDIUM_RISK';
      }
    }
  }

  // Auto-reject threshold: if penalty > 0.5 or verdict is HIGH_RISK/RUGGED
  if (verdict === 'HIGH_RISK' || scorePenalty > 0.5) {
    // Already handled above for RUGGED
  }

  return {
    verdict,
    report,
    summary,
    rejectReasons,
    scorePenalty: Math.min(1.0, scorePenalty),
  };
}

/**
 * Quick check: is this token already confirmed as rugged?
 * Uses summary endpoint (lighter) for speed.
 */
export async function isRugged(mintAddress: string): Promise<boolean> {
  const summary = await getSummary(mintAddress);
  if (!summary) return false;

  // RugCheck score_normalised of 100 means worst possible
  // But the `rugged` field is only in the full report
  // For summary, use a proxy: score > 5000 is almost certainly rugged
  if (summary.score > 5000) return true;

  // Check risks for "rugged" pattern
  for (const risk of summary.risks || []) {
    if (risk.name.toLowerCase().includes('rugged') || risk.name.toLowerCase().includes('abandoned')) {
      return true;
    }
  }

  return false;
}

// ── Gate function for security-node integration ──────────────────────────────

export interface RugCheckGateResult {
  pass: boolean;
  reason: string;
  report: RugCheckReport | null;
}

/**
 * RugCheck gate — quick pass/fail for security-node pipeline.
 * Uses evaluateToken internally, returns gate-compatible result.
 */
export async function rugCheckGate(
  mintAddress: string,
  symbol: string = 'UNKNOWN'
): Promise<RugCheckGateResult> {
  const result = await evaluateToken(mintAddress);

  if (result.verdict === 'RUGGED') {
    return { pass: false, reason: 'RUGGED: confirmed rug pull', report: result.report };
  }

  if (result.verdict === 'HIGH_RISK') {
    return {
      pass: false,
      reason: `HIGH_RISK: ${result.rejectReasons.slice(0, 3).join('; ')}`,
      report: result.report,
    };
  }

  if (result.scorePenalty > 0.5) {
    return {
      pass: false,
      reason: `SCORE_PENALTY: ${result.scorePenalty.toFixed(2)} — ${result.rejectReasons.slice(0, 2).join('; ')}`,
      report: result.report,
    };
  }

  return { pass: true, reason: '', report: result.report };
}

/**
 * Extract red flags from a RugCheck report for AI analysis context.
 */
export function extractRugCheckRedFlags(report: RugCheckReport): string[] {
  const flags: string[] = [];

  if (report.rugged) flags.push('Confirmed rug pull');
  if (report.risks?.length > 0) {
    for (const risk of report.risks) {
      if (risk.level === 'danger') {
        flags.push(`Risk: ${risk.name} (${risk.value})`);
      }
    }
  }

  const topHolder = report.topHolders?.[0];
  if (topHolder && topHolder.pct > 15) {
    flags.push(`Top holder ${topHolder.pct.toFixed(1)}%${topHolder.insider ? ' (INSIDER)' : ''}`);
  }

  if (report.graphInsidersDetected > 0) {
    flags.push(`${report.graphInsidersDetected} insider networks`);
  }

  if (report.lpLockedPct !== null && report.lpLockedPct < 70) {
    flags.push(`LP only ${report.lpLockedPct?.toFixed(0)}% locked`);
  }

  if (report.transferFee?.pct > 0) {
    flags.push(`Transfer fee ${report.transferFee.pct}%`);
  }

  if (report.totalHolders > 0 && report.totalHolders < 30) {
    flags.push(`Only ${report.totalHolders} holders`);
  }

  if (report.creatorBalance > 0) {
    flags.push('Creator still holds tokens');
  }

  return flags;
}

/**
 * Convert RugCheck report to a 0-1 score factor for TokenAnalysis.
 * 1 = perfectly safe, 0 = extremely risky.
 */
export function rugCheckToScoreFactor(report: RugCheckReport): number {
  let score = 1.0;

  // Penalize based on RugCheck score (higher = worse)
  // Normalized score: 1=best, 100=worst in score_normalised
  const ns = report.score_normalised || 1;
  score -= (ns / 100) * 0.3;  // Max -0.3 from score

  // Top holder concentration
  const topHolder = report.topHolders?.[0];
  if (topHolder) {
    if (topHolder.pct > 30) score -= 0.3;
    else if (topHolder.pct > 20) score -= 0.2;
    else if (topHolder.pct > 10) score -= 0.1;
  }

  // Insider networks
  if (report.graphInsidersDetected > 5) score -= 0.2;
  else if (report.graphInsidersDetected > 0) score -= 0.1;

  // LP lock
  if (report.lpLockedPct !== null && report.lpLockedPct < 50) score -= 0.2;
  else if (report.lpLockedPct !== null && report.lpLockedPct < 70) score -= 0.1;

  // Transfer fee
  if (report.transferFee?.pct > 3) score -= 0.2;

  // Risk flags
  const dangerRisks = (report.risks || []).filter(r => r.level === 'danger').length;
  score -= dangerRisks * 0.1;

  // Holder count
  if (report.totalHolders > 0 && report.totalHolders < 20) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

export default {
  getFullReport,
  getSummary,
  evaluateToken,
  isRugged,
  rugCheckGate,
  extractRugCheckRedFlags,
  rugCheckToScoreFactor,
};
