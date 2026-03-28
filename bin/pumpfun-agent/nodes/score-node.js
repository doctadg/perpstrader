"use strict";
// Score Node - Multi-factor heuristic scorer
// Scores tokens using on-chain/social metadata without LLM dependency
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStep = exports.addThought = void 0;
exports.scoreNode = scoreNode;
const config_1 = __importDefault(require("../../shared/config"));
const logger_1 = __importDefault(require("../../shared/logger"));
const state_1 = require("../state");
const DEFAULT_WEIGHTS = {
    social: 0.32, // -0.03 — social still inflates dead-token scores (0.86 TIME_EXIT); push scores down to filter
    freshness: 0.18, // -0.02 — slight trim; freshness alone doesn't predict pumps
    websiteQuality: 0.05, // unchanged — weakest signal but nonzero for marginal filtering
    aiAnalysis: 0.30, // +0.05 — strongest differentiator: 0.70-0.74 bucket has 100% WR vs 89% at 0.65-0.69
    tokenQuality: 0.15, // unchanged — stable signal for false positive filtering
    redFlagPenalty: 0.12, // +0.02 — TIME_EXIT trades (even at score 0.86) show red flags being missed
};
const DEFAULT_MIN_SCORE = 0.35;
// ── Main Entry ─────────────────────────────────────────────────────────────
/**
 * Calculate final confidence scores for all analyzed tokens
 * using a multi-factor heuristic that works without LLM analysis.
 */
async function scoreNode(state) {
    if (state.analyzedTokens.length === 0) {
        logger_1.default.warn('[ScoreNode] No tokens to score');
        return {
            ...(0, state_1.addThought)(state, 'No tokens to score'),
            ...(0, state_1.updateStep)(state, 'NO_TOKENS'),
        };
    }
    logger_1.default.info(`[ScoreNode] Calculating scores for ${state.analyzedTokens.length} tokens`);
    const config = config_1.default.get();
    const minScoreThreshold = config.pumpfun?.minScoreThreshold ?? DEFAULT_MIN_SCORE;
    const weights = resolveWeights(config.pumpfun?.weights);
    const now = Date.now();
    const scoredTokens = state.analyzedTokens.map(token => {
        const factors = computeFactors(token, now);
        // Weighted sum
        let score = factors.social * weights.social +
            factors.freshness * weights.freshness +
            factors.websiteQuality * weights.websiteQuality +
            factors.aiAnalysis * weights.aiAnalysis +
            factors.tokenQuality * weights.tokenQuality;
        // Red flag penalty (deduction)
        score -= factors.redFlagPenalty * weights.redFlagPenalty;
        // Clamp to [0, 1]
        score = Math.min(1, Math.max(0, score));
        return {
            ...token,
            overallScore: score,
        };
    });
    // Sort descending by score
    scoredTokens.sort((a, b) => b.overallScore - a.overallScore);
    // Get high confidence tokens
    const highConfidenceTokens = scoredTokens.filter(t => t.overallScore >= minScoreThreshold);
    // Log top scores with factor breakdown for debugging
    const topN = scoredTokens.slice(0, 5);
    for (const t of topN) {
        const factors = computeFactors(t, now);
        logger_1.default.info(`[ScoreNode] ${t.token.symbol}: ${t.overallScore.toFixed(3)} | ` +
            `soc=${factors.social.toFixed(2)} frsh=${factors.freshness.toFixed(2)} ` +
            `web=${factors.websiteQuality.toFixed(2)} ai=${factors.aiAnalysis.toFixed(2)} ` +
            `tok=${factors.tokenQuality.toFixed(2)} red=${factors.redFlagPenalty} | ` +
            `rec=${t.recommendation}`);
    }
    logger_1.default.info(`[ScoreNode] Scored ${scoredTokens.length} tokens, ` +
        `${highConfidenceTokens.length} high confidence (>=${minScoreThreshold.toFixed(2)})`);
    return {
        ...(0, state_1.addThought)(state, `Scored ${scoredTokens.length} tokens, ${highConfidenceTokens.length} with >=${minScoreThreshold.toFixed(2)} confidence`),
        ...(0, state_1.updateStep)(state, 'SCORING_COMPLETE'),
        analyzedTokens: scoredTokens,
        highConfidenceTokens,
    };
}
function computeFactors(token, now) {
    return {
        social: computeSocialScore(token),
        freshness: computeFreshnessScore(token, now),
        websiteQuality: computeWebsiteQualityScore(token),
        aiAnalysis: computeAIAnalysisScore(token),
        tokenQuality: computeTokenQualityScore(token),
        redFlagPenalty: computeRedFlagPenalty(token),
    };
}
/**
 * Factor 1: Social Presence Score (0-1 scale, max raw 0.55)
 * Normalizes to 0-1 by dividing by max possible (0.55).
 * Relaxed: any single social link gives meaningful signal.
 */
function computeSocialScore(token) {
    let raw = 0;
    // Has Twitter link in metadata (not necessarily verified account)
    if (token.metadata?.twitter)
        raw += 0.15;
    // Has Telegram link in metadata
    if (token.metadata?.telegram)
        raw += 0.15;
    // Has Discord link in metadata
    if (token.metadata?.discord)
        raw += 0.10;
    // Has a real website (exists, and not a social media URL masquerading as a website)
    if (token.metadata?.website && token.website?.exists) {
        const url = token.metadata.website.toLowerCase();
        const isSocialRedirect = url.includes('twitter.com') || url.includes('x.com') ||
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
function computeFreshnessScore(token, now) {
    if (!token.token?.createdAt)
        return 0.5; // neutral if unknown (was 0.3)
    const created = new Date(token.token.createdAt).getTime();
    const ageMs = now - created;
    if (ageMs < 0)
        return 1.0; // clock skew, treat as brand new
    if (ageMs < 2 * 60 * 1000)
        return 1.0; // < 2 min
    if (ageMs < 5 * 60 * 1000)
        return 0.9; // < 5 min (was 0.8)
    if (ageMs < 15 * 60 * 1000)
        return 0.7; // < 15 min (was 0.5)
    if (ageMs < 30 * 60 * 1000)
        return 0.5; // < 30 min (was 0.3)
    if (ageMs < 60 * 60 * 1000)
        return 0.3; // < 1 hour
    if (ageMs < 2 * 60 * 60 * 1000)
        return 0.15; // < 2 hours
    return 0.05; // old
}
/**
 * Factor 3: Website Quality Score (0-1)
 * Pass-through of existing website content quality analysis.
 */
function computeWebsiteQualityScore(token) {
    if (!token.website?.exists)
        return 0;
    return token.website.contentQuality ?? 0;
}
/**
 * Factor 4: AI Analysis Score (0-1)
 * Uses recommendation mapping but with a smarter fallback:
 * If AI failed (returned STRONG_AVOID) and there's no website,
 * treat as neutral (0.4) instead of terrible.
 * For pump.fun sniping, we should be optimistic on missing data.
 */
function computeAIAnalysisScore(token) {
    const rec = token.recommendation;
    switch (rec) {
        case 'STRONG_BUY': return 0.95;
        case 'BUY': return 0.85;
        case 'HOLD': return 0.55; // was 0.50 — slight upward bias
        case 'AVOID': return 0.35; // was 0.25 — don't over-penalize
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
function computeTokenQualityScore(token) {
    let score = 0;
    const symbol = token.token?.symbol || '';
    const name = token.token?.name || '';
    const description = token.metadata?.description || '';
    // Symbol length (shorter = better, typical ticker)
    const symLen = symbol.length;
    if (symLen >= 2 && symLen <= 5)
        score += 0.5;
    else if (symLen >= 6 && symLen <= 10)
        score += 0.3;
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
 * Factor 6: Red Flag Penalty (count of flags)
 * Each red flag from AI analysis contributes -1 to the raw penalty.
 * Capped at 3 (was 5) to avoid extreme penalties from verbose LLM output.
 * Most tokens get 1-2 red flags from the fallback ("No website", "No whitepaper")
 * so we need to limit the damage.
 */
function computeRedFlagPenalty(token) {
    if (!token.redFlags || token.redFlags.length === 0)
        return 0;
    // Filter out generic "no website" flags — most pump tokens don't have one
    const meaningfulFlags = token.redFlags.filter(f => !f.toLowerCase().includes('no website') &&
        !f.toLowerCase().includes('no whitepaper') &&
        !f.toLowerCase().includes('no team'));
    // Cap at 3 flags
    return Math.min(meaningfulFlags.length, 3);
}
// ── Weight Resolution ──────────────────────────────────────────────────────
function resolveWeights(configured) {
    if (!configured)
        return { ...DEFAULT_WEIGHTS };
    return {
        social: Math.max(0, configured.social ?? DEFAULT_WEIGHTS.social),
        freshness: Math.max(0, configured.freshness ?? DEFAULT_WEIGHTS.freshness),
        websiteQuality: Math.max(0, configured.websiteQuality ?? DEFAULT_WEIGHTS.websiteQuality),
        aiAnalysis: Math.max(0, configured.aiAnalysis ?? DEFAULT_WEIGHTS.aiAnalysis),
        tokenQuality: Math.max(0, configured.tokenQuality ?? DEFAULT_WEIGHTS.tokenQuality),
        redFlagPenalty: Math.max(0, configured.redFlagPenalty ?? DEFAULT_WEIGHTS.redFlagPenalty),
    };
}
// ── Recommendation Helper (kept for backward compat) ───────────────────────
function recommendationToScore(recommendation) {
    const scores = {
        STRONG_BUY: 0.95,
        BUY: 0.75,
        HOLD: 0.50,
        AVOID: 0.25,
        STRONG_AVOID: 0.05,
    };
    return scores[recommendation] || 0.5;
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=score-node.js.map