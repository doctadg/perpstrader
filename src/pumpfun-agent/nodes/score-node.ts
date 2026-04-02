// Score Node - Multi-factor heuristic scorer
// Scores tokens using on-chain/social metadata without LLM dependency

import configManager from '../../shared/config';
import logger from '../../shared/logger';
import { PumpFunAgentState, TokenAnalysis, TokenRecommendation } from '../../shared/types';
import { updateStats, addThought, updateStep } from '../state';
import { getFullReport as getRugCheckReport, rugCheckToScoreFactor, extractRugCheckRedFlags } from '../services/rugcheck-service';

// ── Scoring Factor Config ──────────────────────────────────────────────────
// Tuned for aggressiveness: social presence + token quality are the strongest
// signals for early pump.fun sniping. Freshness still matters but with a
// wider window. Website quality is a bonus but most .fun sites are garbage.

interface ScoringWeights {
  social: number;      // 0.30
  freshness: number;   // 0.20
  websiteQuality: number; // 0.10
  aiAnalysis: number;  // 0.15
  tokenQuality: number; // 0.15
  rugSafety: number;   // 0.20 — RugCheck safety score (holder conc, insider detection)
  redFlagPenalty: number; // -0.10 (deduction)
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  social: 0.20,          // reduced — social easily faked, RugCheck handles the real detection
  freshness: 0.10,       // reduced — freshness alone doesn't predict rugs
  websiteQuality: 0.05,  // unchanged — weakest signal
  aiAnalysis: 0.25,      // reduced slightly — RugCheck provides ground truth
  tokenQuality: 0.10,    // reduced — naming quality is weak signal
  rugSafety: 0.30,       // NEW — RugCheck score, highest weight, actual on-chain safety data
  redFlagPenalty: 0.15,  // increased — RugCheck risks + LLM red flags
};

const DEFAULT_MIN_SCORE = 0.35;

// ── Main Entry ─────────────────────────────────────────────────────────────

/**
 * Calculate final confidence scores for all analyzed tokens
 * using a multi-factor heuristic that works without LLM analysis.
 */
export async function scoreNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  if (state.analyzedTokens.length === 0) {
    logger.warn('[ScoreNode] No tokens to score');
    return {
      ...addThought(state, 'No tokens to score'),
      ...updateStep(state, 'NO_TOKENS'),
    };
  }

  logger.info(`[ScoreNode] Calculating scores for ${state.analyzedTokens.length} tokens`);

  const config = configManager.get();
  const minScoreThreshold = config.pumpfun?.minScoreThreshold ?? DEFAULT_MIN_SCORE;
  const weights = resolveWeights(config.pumpfun?.weights);

  const now = Date.now();

  const scoredTokens = await Promise.all(
    state.analyzedTokens.map(async (token) => {
      const factors = await computeFactors(token, now);

      // Weighted sum
      let score =
        factors.social * weights.social +
        factors.freshness * weights.freshness +
        factors.websiteQuality * weights.websiteQuality +
        factors.aiAnalysis * weights.aiAnalysis +
        factors.tokenQuality * weights.tokenQuality +
        factors.rugSafety * weights.rugSafety;

      // Red flag penalty (deduction)
      score -= factors.redFlagPenalty * weights.redFlagPenalty;

      // Clamp to [0, 1]
      score = Math.min(1, Math.max(0, score));

      // Populate rugcheckScore field on TokenAnalysis
      const rugcheckScore = factors.rugSafety;

      // Enrich token with RugCheck red flags for downstream AI analysis
      let enrichedRedFlags = [...(token.redFlags || [])];
      let enrichedGreenFlags = [...(token.greenFlags || [])];

      if (rugcheckScore > 0.8) {
        enrichedGreenFlags.push('RugCheck: strong safety profile');
      } else if (rugcheckScore < 0.4) {
        enrichedRedFlags.push('RugCheck: weak safety score');
      }

      return {
        ...token,
        overallScore: score,
        rugcheckScore,
        redFlags: enrichedRedFlags,
        greenFlags: enrichedGreenFlags,
      };
    })
  );

  // Sort descending by score
  scoredTokens.sort((a, b) => b.overallScore - a.overallScore);

  // Get high confidence tokens
  const highConfidenceTokens = scoredTokens.filter(t => t.overallScore >= minScoreThreshold);

  // Log top scores with factor breakdown for debugging
  const topN = scoredTokens.slice(0, 5);
  for (const t of topN) {
    const factors = await computeFactors(t, now);
    logger.info(
      `[ScoreNode] ${t.token.symbol}: ${t.overallScore.toFixed(3)} | ` +
      `soc=${factors.social.toFixed(2)} frsh=${factors.freshness.toFixed(2)} ` +
      `web=${factors.websiteQuality.toFixed(2)} ai=${factors.aiAnalysis.toFixed(2)} ` +
      `tok=${factors.tokenQuality.toFixed(2)} rug=${factors.rugSafety.toFixed(2)} ` +
      `red=${factors.redFlagPenalty} | rec=${t.recommendation}`
    );
  }

  logger.info(
    `[ScoreNode] Scored ${scoredTokens.length} tokens, ` +
    `${highConfidenceTokens.length} high confidence (>=${minScoreThreshold.toFixed(2)})`
  );

  return {
    ...addThought(state, `Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} with >=${minScoreThreshold.toFixed(2)} confidence`),
    ...updateStep(state, 'SCORING_COMPLETE'),
    analyzedTokens: scoredTokens,
    highConfidenceTokens,
  };
}

// ── Factor Computation ─────────────────────────────────────────────────────

interface ScoreFactors {
  social: number;         // 0-1
  freshness: number;      // 0-1
  websiteQuality: number; // 0-1
  aiAnalysis: number;     // 0-1
  tokenQuality: number;   // 0-1
  rugSafety: number;      // 0-1 — RugCheck on-chain safety data
  redFlagPenalty: number; // 0-N (count of flags, weighted externally)
}

async function computeFactors(token: TokenAnalysis, now: number): Promise<ScoreFactors> {
  const mint = token.token?.mintAddress || '';
  return {
    social: computeSocialScore(token),
    freshness: computeFreshnessScore(token, now),
    websiteQuality: computeWebsiteQualityScore(token),
    aiAnalysis: computeAIAnalysisScore(token),
    tokenQuality: computeTokenQualityScore(token),
    rugSafety: await computeRugSafetyScore(mint, token),
    redFlagPenalty: computeRedFlagPenalty(token),
  };
}

/**
 * Factor 1: Social Presence Score (0-1 scale, max raw 0.55)
 * Normalizes to 0-1 by dividing by max possible (0.55).
 * Relaxed: any single social link gives meaningful signal.
 */
function computeSocialScore(token: TokenAnalysis): number {
  let raw = 0;

  // Has Twitter link in metadata (not necessarily verified account)
  if (token.metadata?.twitter) raw += 0.15;

  // Has Telegram link in metadata
  if (token.metadata?.telegram) raw += 0.15;

  // Has Discord link in metadata
  if (token.metadata?.discord) raw += 0.10;

  // Has a real website (exists, and not a social media URL masquerading as a website)
  if (token.metadata?.website && token.website?.exists) {
    const url = token.metadata.website.toLowerCase();
    const isSocialRedirect =
      url.includes('twitter.com') || url.includes('x.com') ||
      url.includes('t.me') || url.includes('telegram.org') ||
      url.includes('discord.gg') || url.includes('discord.com');
    if (!isSocialRedirect) {
      raw += 0.15;
    }
  }

  // Normalize: max raw is 0.55, but give floor of 0.2 for any social presence
  // This prevents tokens with just a telegram from getting ~0.36 on this factor
  const normalized = Math.min(1, raw / 0.55);
  return Math.max(normalized, raw > 0 ? 0.4 : 0.1);
}

/**
 * Factor 2: Freshness Score (0-1)
 * Prioritizes recently launched tokens for sniping.
 * Relaxed windows: most pump.fun tokens are viable within the first hour.
 */
function computeFreshnessScore(token: TokenAnalysis, now: number): number {
  if (!token.token?.createdAt) return 0.5; // neutral if unknown (was 0.3)

  const created = new Date(token.token.createdAt).getTime();
  const ageMs = now - created;

  if (ageMs < 0) return 1.0; // clock skew, treat as brand new
  if (ageMs < 2 * 60 * 1000) return 1.0;       // < 2 min
  if (ageMs < 5 * 60 * 1000) return 0.9;       // < 5 min (was 0.8)
  if (ageMs < 15 * 60 * 1000) return 0.7;      // < 15 min (was 0.5)
  if (ageMs < 30 * 60 * 1000) return 0.5;      // < 30 min (was 0.3)
  if (ageMs < 60 * 60 * 1000) return 0.3;      // < 1 hour
  if (ageMs < 2 * 60 * 60 * 1000) return 0.15; // < 2 hours
  return 0.05;                                   // old
}

/**
 * Factor 3: Website Quality Score (0-1)
 * Pass-through of existing website content quality analysis.
 */
function computeWebsiteQualityScore(token: TokenAnalysis): number {
  if (!token.website?.exists) return 0;
  return token.website.contentQuality ?? 0;
}

/**
 * Factor 4: AI Analysis Score (0-1)
 * Uses recommendation mapping but with a smarter fallback:
 * If AI failed (returned STRONG_AVOID) and there's no website,
 * treat as neutral (0.4) instead of terrible.
 * For pump.fun sniping, we should be optimistic on missing data.
 */
function computeAIAnalysisScore(token: TokenAnalysis): number {
  const rec = token.recommendation;

  switch (rec) {
    case 'STRONG_BUY': return 0.95;
    case 'BUY':        return 0.85;
    case 'HOLD':       return 0.55;  // was 0.50 — slight upward bias
    case 'AVOID':      return 0.35;  // was 0.25 — don't over-penalize
    case 'STRONG_AVOID':
    default: {
      // If AI failed and there's no website/rationale, treat as neutral-optimistic
      const hasWebsite = token.website?.exists;
      const hasRationale = token.rationale && token.rationale.length > 20;
      if (!hasWebsite && !hasRationale) {
        return 0.4; // neutral-optimistic — don't penalize for LLM failures
      }
      // If there's actual analysis supporting the avoid, respect it somewhat
      return 0.25;
    }
  }
}

/**
 * Factor 5: Token Name/Symbol Quality (0-1)
 * Checks for reasonable naming patterns.
 */
function computeTokenQualityScore(token: TokenAnalysis): number {
  let score = 0;
  const symbol = token.token?.symbol || '';
  const name = token.token?.name || '';
  const description = token.metadata?.description || '';

  // Symbol length (shorter = better, typical ticker)
  const symLen = symbol.length;
  if (symLen >= 2 && symLen <= 5) score += 0.5;
  else if (symLen >= 6 && symLen <= 10) score += 0.3;

  // Name is different from symbol (shows effort in naming)
  if (name && symbol && name.toLowerCase() !== symbol.toLowerCase()) {
    score += 0.3;
  }

  // Has a real description
  if (description.length > 20) {
    score += 0.2;
  }

  // Penalize spammy patterns
  const combined = (name + symbol).toUpperCase();
  const isSpammy =
    // ALL CAPS with numbers (e.g., "TOKEN2024XYZ")
    (/^[A-Z0-9]{8,}$/.test(combined)) ||
    // Repeated characters (e.g., "AAABBB")
    (/(.)\1{3,}/.test(combined)) ||
    // Excessive special characters
    (/[^A-Za-z0-9]/.test(symbol) && (symbol.match(/[^A-Za-z0-9]/g) || []).length > 2);

  if (isSpammy) {
    score *= 0.5; // halve the score for spammy tokens
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Factor 6: RugCheck Safety Score (0-1)
 * Fetches RugCheck report directly (uses in-memory cache in rugcheck-service).
 * Tokens that passed the hard gate still have varying safety levels.
 * Higher score = better holder distribution, no insider activity, LP locked.
 */
async function computeRugSafetyScore(mint: string, _token: TokenAnalysis): Promise<number> {
  try {
    const report = await getRugCheckReport(mint);

    if (!report) {
      // No RugCheck data (brand new, not indexed yet) — optimistic neutral
      return 0.5;
    }

    // Base score from inverted normalized score (1=best → 1.0, 100=worst → 0.0)
    let score = rugCheckToScoreFactor(report);

    // Bonus: LP locked > 70%
    if (report.lpLockedPct !== null && report.lpLockedPct !== undefined && report.lpLockedPct > 0.70) {
      score = Math.min(1, score + 0.1);
    }

    // Penalty: insiders detected (soft — hard gate already caught >50)
    if (report.graphInsidersDetected > 20) {
      score *= 0.8;
    } else if (report.graphInsidersDetected > 10) {
      score *= 0.9;
    }

    // Penalty: high top holder concentration (soft — hard gate caught >30%)
    if (report.topHolders && report.topHolders[0]?.pct > 20) {
      score *= 0.85;
    }

    // Penalty: creator still holds significant balance (potential dump)
    if (report.creatorBalance > 0) {
      score *= 0.95;
    }

    // Penalty: any danger-level risks
    const dangerCount = (report.risks || []).filter(r => r.level === 'danger').length;
    if (dangerCount === 1) score *= 0.8;
    if (dangerCount >= 2) score *= 0.5;

    return Math.min(1, Math.max(0, score));
  } catch {
    return 0.5; // neutral on errors
  }
}

/**
 * Factor 7: Red Flag Penalty (count of flags)
 * Each red flag from AI analysis contributes -1 to the raw penalty.
 * Capped at 3 (was 5) to avoid extreme penalties from verbose LLM output.
 * Most tokens get 1-2 red flags from the fallback ("No website", "No whitepaper")
 * so we need to limit the damage.
 */
function computeRedFlagPenalty(token: TokenAnalysis): number {
  if (!token.redFlags || token.redFlags.length === 0) return 0;
  // Filter out generic "no website" flags — most pump tokens don't have one
  const meaningfulFlags = token.redFlags.filter(f =>
    !f.toLowerCase().includes('no website') &&
    !f.toLowerCase().includes('no whitepaper') &&
    !f.toLowerCase().includes('no team')
  );
  // Cap at 3 flags
  return Math.min(meaningfulFlags.length, 3);
}

// ── Weight Resolution ──────────────────────────────────────────────────────

function resolveWeights(configured: Record<string, number> | undefined): ScoringWeights {
  if (!configured) return { ...DEFAULT_WEIGHTS };

  return {
    social:          Math.max(0, configured.social ?? DEFAULT_WEIGHTS.social),
    freshness:       Math.max(0, configured.freshness ?? DEFAULT_WEIGHTS.freshness),
    websiteQuality:  Math.max(0, configured.websiteQuality ?? DEFAULT_WEIGHTS.websiteQuality),
    aiAnalysis:      Math.max(0, configured.aiAnalysis ?? DEFAULT_WEIGHTS.aiAnalysis),
    tokenQuality:    Math.max(0, configured.tokenQuality ?? DEFAULT_WEIGHTS.tokenQuality),
    rugSafety:       Math.max(0, configured.rugSafety ?? DEFAULT_WEIGHTS.rugSafety),
    redFlagPenalty:  Math.max(0, configured.redFlagPenalty ?? DEFAULT_WEIGHTS.redFlagPenalty),
  };
}

// ── Recommendation Helper (kept for backward compat) ───────────────────────

function recommendationToScore(recommendation: TokenRecommendation): number {
  const scores: Record<TokenRecommendation, number> = {
    STRONG_BUY: 0.95,
    BUY: 0.75,
    HOLD: 0.50,
    AVOID: 0.25,
    STRONG_AVOID: 0.05,
  };
  return scores[recommendation] || 0.5;
}

export { addThought, updateStep } from '../state';
