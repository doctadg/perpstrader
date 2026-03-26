"use strict";
// Analyze Node - Optional AI analysis + mandatory on-chain data collection
// AI analysis is rate-limited and only runs for tokens passing a pre-filter
// On-chain bonding curve data is collected for ALL tokens
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStep = exports.addThought = void 0;
exports.analyzeNode = analyzeNode;
const logger_1 = __importDefault(require("../../shared/logger"));
const config_1 = __importDefault(require("../../shared/config"));
const state_1 = require("../state");
const bonding_curve_1 = require("../services/bonding-curve");
const uuid_1 = require("uuid");
const axios_1 = __importDefault(require("axios"));
const NON_WEBSITE_HOSTS = new Set([
    'x.com',
    'www.x.com',
    'twitter.com',
    'www.twitter.com',
    't.co',
    't.me',
    'telegram.me',
    'discord.gg',
    'discord.com',
    'www.discord.com',
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'instagram.com',
    'www.instagram.com',
    'facebook.com',
    'www.facebook.com',
    'reddit.com',
    'www.reddit.com',
]);
// Rate limiter: max AI calls per cycle
const MAX_AI_CALLS_PER_CYCLE = 10; // was 5
let aiCallCount = 0;
// Inter-call delay to prevent GLM rate limiting (serialized calls)
const AI_INTER_CALL_DELAY_MS = 500;
/**
 * Check if a token passes the pre-filter for AI analysis.
 * Relaxed: any single social link OR a website qualifies.
 */
function passesAIPrefilter(metadata, websiteUrl) {
    let socialCount = 0;
    if (metadata.twitter)
        socialCount++;
    if (metadata.telegram)
        socialCount++;
    if (metadata.discord)
        socialCount++;
    if (socialCount >= 1)
        return true; // was >= 2
    if (websiteUrl)
        return true;
    return false;
}
/**
 * Collect on-chain bonding curve data for a token.
 */
async function collectOnChainData(mintAddress) {
    try {
        const curveState = await bonding_curve_1.bondingCurveService.readBondingCurveState(mintAddress);
        if (!curveState)
            return null;
        const quote = bonding_curve_1.bondingCurveService.getBuyQuote(curveState, 0.01);
        const solInCurve = Number(curveState.realSolReserves) / 1e9;
        return {
            marketCapSol: quote?.marketCapSol ?? 0,
            bondingCurveProgress: quote?.bondingCurveProgress ?? 0,
            solInCurve,
            complete: curveState.complete,
        };
    }
    catch (err) {
        logger_1.default.debug(`[AnalyzeNode] On-chain data collection failed for ${mintAddress}: ${err}`);
        return null;
    }
}
/**
 * Run analysis on all tokens: on-chain data for ALL, AI only for pre-filtered tokens.
 */
async function analyzeNode(state) {
    if (state.queuedTokens.length === 0) {
        logger_1.default.warn('[AnalyzeNode] No tokens to analyze');
        return {
            ...(0, state_1.addThought)(state, 'No tokens to analyze'),
            ...(0, state_1.updateStep)(state, 'NO_TOKENS'),
            analyzedTokens: [],
        };
    }
    // Reset per-cycle AI call counter
    aiCallCount = 0;
    const totalTokens = state.queuedTokens.length;
    logger_1.default.info(`[AnalyzeNode] Processing ${totalTokens} tokens (on-chain + optional AI)`);
    // Import web scraper
    let webScraper;
    try {
        const webModule = await Promise.resolve().then(() => __importStar(require('../services/web-scraper')));
        webScraper = webModule.default;
    }
    catch (error) {
        logger_1.default.error('[AnalyzeNode] Failed to import web scraper service');
        return {
            ...(0, state_1.addThought)(state, 'Failed to import web scraper service'),
            ...(0, state_1.updateStep)(state, 'ERROR'),
        };
    }
    const analyzedTokens = [];
    // PHASE 1: Collect on-chain data and website scraping concurrently (these hit different APIs)
    const concurrency = 5;
    const preprocessResults = [];
    for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
        const batch = state.queuedTokens.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(batch.map(async (item) => {
            const token = item.token || item;
            const metadata = item.metadata || token;
            try {
                // On-chain data collection (always)
                const onChainData = await collectOnChainData(token.mintAddress);
                if (onChainData) {
                    token.onChainData = onChainData;
                }
                // Website scraping
                const websiteUrl = normalizeWebsiteUrl(metadata.website);
                const website = websiteUrl
                    ? await webScraper.analyzeWebsite(websiteUrl, metadata)
                    : emptyWebsiteResult(metadata.website);
                return { token, metadata, onChainData, website, websiteUrl };
            }
            catch (error) {
                logger_1.default.debug(`[AnalyzeNode] Pre-processing failed for ${token.symbol}: ${error}`);
                return null;
            }
        }));
        for (const result of batchResults) {
            preprocessResults.push(result.status === 'fulfilled' ? result.value : null);
        }
    }
    // PHASE 2: Run AI analysis SERIALLY with inter-call delay to prevent GLM 429s
    for (const preprocessed of preprocessResults) {
        if (!preprocessed)
            continue;
        const { token, metadata, onChainData, website, websiteUrl } = preprocessed;
        try {
            // Optional AI analysis (pre-filtered + rate-limited)
            let aiAnalysis;
            const shouldRunAI = passesAIPrefilter(metadata, websiteUrl) && aiCallCount < MAX_AI_CALLS_PER_CYCLE;
            if (shouldRunAI) {
                // Add inter-call delay to prevent rate limiting (except for first call)
                if (aiCallCount > 0) {
                    await new Promise(r => setTimeout(r, AI_INTER_CALL_DELAY_MS));
                }
                aiAnalysis = await runOpenRouterAnalysis({
                    token,
                    metadata,
                    website,
                });
                aiCallCount++;
            }
            else {
                if (!passesAIPrefilter(metadata, websiteUrl)) {
                    logger_1.default.debug(`[AnalyzeNode] Skipping AI for ${token.symbol}: failed pre-filter`);
                }
                else {
                    logger_1.default.debug(`[AnalyzeNode] Skipping AI for ${token.symbol}: rate limit reached (${aiCallCount}/${MAX_AI_CALLS_PER_CYCLE})`);
                }
                aiAnalysis = getWebsiteFallback(website, metadata);
            }
            // Build TokenAnalysis
            analyzedTokens.push({
                id: (0, uuid_1.v4)(),
                token,
                metadata,
                security: {
                    mintAuthority: null,
                    freezeAuthority: null,
                    decimals: 0,
                    supply: 0n,
                    isMintable: false,
                    isFreezable: false,
                    metadataHash: '',
                    riskLevel: 'LOW',
                },
                website,
                social: {
                    twitter: { exists: false, followerCount: 0, tweetCount: 0, bio: '', verified: false, sentimentScore: 0 },
                    telegram: { exists: false, memberCount: 0, isChannel: false, description: '' },
                    discord: { exists: false, memberCount: 0, inviteActive: false },
                    overallPresenceScore: 0,
                    glmAnalysis: '',
                },
                websiteScore: website.contentQuality || 0,
                socialScore: 0,
                securityScore: 0,
                overallScore: 0,
                rationale: aiAnalysis.rationale,
                redFlags: aiAnalysis.redFlags,
                greenFlags: aiAnalysis.greenFlags,
                recommendation: aiAnalysis.recommendation,
                analyzedAt: new Date(),
                cycleId: state.cycleId,
                errors: [],
                onChainData: onChainData,
            });
        }
        catch (error) {
            logger_1.default.debug(`[AnalyzeNode] Failed to analyze ${token.symbol}: ${error}`);
        }
    }
    logger_1.default.info(`[AnalyzeNode] Completed analysis for ${analyzedTokens.length} tokens (AI calls: ${aiCallCount}/${MAX_AI_CALLS_PER_CYCLE})`);
    return {
        ...(0, state_1.addThought)(state, `Analysis complete for ${analyzedTokens.length} tokens (${aiCallCount} AI calls)`),
        ...(0, state_1.updateStep)(state, 'ANALYSIS_COMPLETE'),
        analyzedTokens,
    };
}
function emptyWebsiteResult(original) {
    return {
        url: original || '',
        exists: false,
        hasContent: false,
        contentQuality: 0,
        hasWhitepaper: false,
        hasTeamInfo: false,
        hasRoadmap: false,
        hasTokenomics: false,
        sslValid: false,
        glmAnalysis: original ? 'Website field is not a project site' : 'No website provided',
    };
}
function normalizeWebsiteUrl(raw) {
    if (!raw || typeof raw !== 'string')
        return '';
    let candidate = raw.trim();
    if (!candidate)
        return '';
    if (!/^https?:\/\//i.test(candidate)) {
        candidate = `https://${candidate}`;
    }
    try {
        const parsed = new URL(candidate);
        const host = parsed.hostname.toLowerCase();
        if (NON_WEBSITE_HOSTS.has(host)) {
            return '';
        }
        return parsed.toString();
    }
    catch {
        return '';
    }
}
/**
 * Run AI analysis for a token using GLM service (z.ai).
 * On failure, returns null so caller can use heuristic fallback.
 */
async function runOpenRouterAnalysis(data) {
    const prompt = buildAnalysisPrompt(data);
    const config = config_1.default.get();
    // Use GLM service instead of OpenRouter (OpenRouter API key is dead)
    const apiKey = config.glm.apiKey;
    const baseUrl = config.glm.baseUrl;
    const model = config.glm.model || 'z-ai/glm-4.7-flash';
    if (!apiKey || apiKey.length === 0 || apiKey === 'your-api-key-here') {
        logger_1.default.warn('[AnalyzeNode] GLM API key not configured, using heuristic fallback');
        return null;
    }
    const requestBody = {
        model,
        messages: [
            {
                role: 'system',
                content: 'You are a conservative crypto launch analyst. Return only valid JSON.',
            },
            {
                role: 'user',
                content: prompt,
            },
        ],
        temperature: 0.2,
        max_tokens: 800,
    };
    const requestConfig = {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://perps-trader.ai',
            'X-Title': 'PerpsTrader PumpFun Analyzer',
        },
        timeout: config.glm.timeout || 30000,
    };
    // Retry with backoff (max 3 retries)
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await axios_1.default.post(`${baseUrl}/chat/completions`, requestBody, requestConfig);
            // FIX: z-ai/glm models return content in 'reasoning' field, not 'content'
            const msg = response.data?.choices?.[0]?.message;
            let content = msg?.content || '';
            if (!content && msg?.reasoning) {
                content = msg.reasoning;
            }
            if (!content && msg?.reasoning_details && Array.isArray(msg.reasoning_details)) {
                content = msg.reasoning_details
                    .filter((d) => d.type === 'reasoning.text' && d.text)
                    .map((d) => d.text)
                    .join('\n');
            }
            const parsed = parseAIResponse(content);
            if (!parsed) {
                logger_1.default.warn('[AnalyzeNode] GLM response was not parseable JSON, using fallback');
                return null;
            }
            return parsed;
        }
        catch (error) {
            const status = error?.response?.status;
            if (status === 429) {
                const retryAfter = error?.response?.headers?.['retry-after'];
                let retryAfterMs = 0;
                if (retryAfter) {
                    const parsed = parseInt(retryAfter, 10);
                    if (!isNaN(parsed))
                        retryAfterMs = parsed < 100 ? parsed * 1000 : parsed;
                }
                if (attempt < MAX_RETRIES) {
                    const backoff = retryAfterMs || (1000 * Math.pow(2, attempt - 1) + Math.random() * 500);
                    logger_1.default.warn(`[AnalyzeNode] GLM 429 on attempt ${attempt}/${MAX_RETRIES}, retrying in ${Math.round(backoff)}ms`);
                    await new Promise(r => setTimeout(r, Math.min(backoff, 30000)));
                    continue;
                }
                logger_1.default.warn(`[AnalyzeNode] GLM 429 exhausted all ${MAX_RETRIES} retries, skipping AI for this token`);
                return null;
            }
            // 400 = bad request (wrong model, invalid params) — NOT transient, don't retry
            if (status === 400) {
                logger_1.default.warn(`[AnalyzeNode] GLM 400 (bad request) — model ${model} likely unsupported on ${baseUrl}, skipping AI for this token`);
                return null;
            }
            // 401 = auth error — no point retrying
            if (status === 401) {
                logger_1.default.warn(`[AnalyzeNode] GLM 401 (unauthorized) — check GLM_API_KEY, skipping AI for this token`);
                return null;
            }
            if (attempt === MAX_RETRIES) {
                logger_1.default.warn(`[AnalyzeNode] GLM analysis failed after ${MAX_RETRIES} attempts: ${error?.message || error}`);
            }
            else {
                // Transient errors: retry with backoff
                const backoff = 1000 * Math.pow(2, attempt - 1);
                logger_1.default.warn(`[AnalyzeNode] GLM error ${status || error?.code} on attempt ${attempt}/${MAX_RETRIES}, retrying in ${Math.min(backoff, 30000)}ms`);
                await new Promise(r => setTimeout(r, Math.min(backoff, 30000)));
                continue;
            }
            return null;
        }
    }
    return null;
}
/**
 * Build the OpenRouter analysis prompt
 */
function buildAnalysisPrompt(data) {
    const { token, metadata, website } = data;
    return `You are an expert crypto analyst evaluating a new pump.fun token launch.

TOKEN: ${metadata.name} ($${metadata.symbol})
|Mint Address: ${token.mintAddress}
Description: ${metadata.description || 'None provided'}

WEBSITE ANALYSIS:
- URL: ${website.url || 'None'}
- Content Quality: ${(website.contentQuality * 100).toFixed(0)}%
- Has Whitepaper: ${website.hasWhitepaper ? 'Yes' : 'No'}
- Has Team Info: ${website.hasTeamInfo ? 'Yes' : 'No'}
- Has Roadmap: ${website.hasRoadmap ? 'Yes' : 'No'}
- Has Tokenomics: ${website.hasTokenomics ? 'Yes' : 'No'}

Provide a comprehensive investment assessment. Return JSON ONLY (no markdown, no explanation):
{
  "rationale": "1 short sentence (max 14 words)",
  "redFlags": ["flag1"],
  "greenFlags": ["flag1"],
  "recommendation": "STRONG_BUY" | "BUY" | "HOLD" | "AVOID" | "STRONG_AVOID"
}

Important:
- Be critical and conservative. pump.fun tokens are high-risk by default.
- Prioritize website legitimacy and completeness.
- Security checks are disabled in this system, so do not infer smart contract safety.`;
}
/**
 * Parse AI response
 */
function parseAIResponse(response) {
    try {
        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*"recommendation"[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            rationale: parsed.rationale || parsed.r || 'No rationale provided',
            redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : (Array.isArray(parsed.rf) ? parsed.rf : []),
            greenFlags: Array.isArray(parsed.greenFlags) ? parsed.greenFlags : (Array.isArray(parsed.gf) ? parsed.gf : []),
            recommendation: validateRecommendation(parsed.recommendation || parsed.rec),
        };
    }
    catch (error) {
        logger_1.default.debug('[AnalyzeNode] Failed to parse OpenRouter response');
        return null;
    }
}
/**
 * Validate recommendation
 */
function validateRecommendation(rec) {
    const valid = ['STRONG_BUY', 'BUY', 'HOLD', 'AVOID', 'STRONG_AVOID'];
    if (valid.includes(rec)) {
        return rec;
    }
    return 'HOLD';
}
/**
 * Deterministic fallback when AI is unavailable or skipped.
 * Returns HOLD (neutral) for missing data -- only STRONG_AVOID for actual red flags.
 */
function getWebsiteFallback(website, metadata) {
    // Count social links
    const socialCount = [
        metadata?.twitter,
        metadata?.telegram,
        metadata?.discord,
    ].filter(Boolean).length;
    // No website + no social links: HOLD (neutral), not STRONG_AVOID
    if (!website?.url || !website?.exists) {
        if (socialCount > 0) {
            return {
                rationale: `AI unavailable. No website but has ${socialCount} social link(s). Neutral pending more data.`,
                redFlags: ['No reachable website'],
                greenFlags: [`Has ${socialCount} social link(s)`],
                recommendation: 'HOLD',
            };
        }
        return {
            rationale: 'AI unavailable. No website and no social links found. Neutral -- insufficient data for judgment.',
            redFlags: ['No website'],
            greenFlags: [],
            recommendation: 'HOLD',
        };
    }
    // Has website -- check quality
    const redFlags = [];
    const greenFlags = [];
    if (!website.sslValid)
        redFlags.push('Website is not HTTPS');
    if (!website.hasWhitepaper)
        redFlags.push('No whitepaper');
    if (!website.hasTokenomics)
        redFlags.push('No tokenomics details');
    if (!website.hasTeamInfo)
        redFlags.push('No team information');
    if (website.hasWhitepaper)
        greenFlags.push('Whitepaper available');
    if (website.hasTokenomics)
        greenFlags.push('Tokenomics section present');
    if (website.hasRoadmap)
        greenFlags.push('Roadmap available');
    if (website.hasTeamInfo)
        greenFlags.push('Team information provided');
    // High quality website with few red flags: BUY
    if (website.contentQuality >= 0.75 && redFlags.length <= 1) {
        return {
            rationale: 'Website quality is strong with multiple credibility signals. Still speculative, but documentation is better than typical launch tokens.',
            redFlags,
            greenFlags,
            recommendation: 'BUY',
        };
    }
    // Medium quality: HOLD
    if (website.contentQuality >= 0.45) {
        return {
            rationale: 'Website exists with partial documentation. AI analysis was unavailable -- rating is neutral.',
            redFlags,
            greenFlags,
            recommendation: 'HOLD',
        };
    }
    // Low quality website: HOLD (not AVOID -- missing data isn't a red flag itself)
    return {
        rationale: 'Website exists but is low quality. AI analysis unavailable -- insufficient data for strong judgment.',
        redFlags,
        greenFlags,
        recommendation: 'HOLD',
    };
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=analyze-node.js.map