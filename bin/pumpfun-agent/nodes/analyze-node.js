"use strict";
// Analyze Node - OpenRouter-powered website-first analysis
// Uses OpenRouter to analyze token website quality and generate recommendations
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
const openrouter_service_1 = __importDefault(require("../../shared/openrouter-service"));
const state_1 = require("../state");
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
/**
 * Run OpenRouter analysis on all tokens and generate final recommendations
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
    logger_1.default.info(`[AnalyzeNode] Running OpenRouter analysis on ${state.queuedTokens.length} tokens`);
    // Import services
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
    // Process tokens with limited concurrency for OpenRouter calls
    const concurrency = 3;
    for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
        const batch = state.queuedTokens.slice(i, i + concurrency);
        const results = await Promise.allSettled(batch.map(async (item) => {
            const token = item.token || item;
            const metadata = item.metadata || token;
            try {
                const websiteUrl = normalizeWebsiteUrl(metadata.website);
                const website = websiteUrl
                    ? await webScraper.analyzeWebsite(websiteUrl, metadata)
                    : emptyWebsiteResult(metadata.website);
                // Run OpenRouter website-first analysis
                const aiAnalysis = await runOpenRouterAnalysis({
                    token,
                    metadata,
                    website,
                });
                // Create token analysis
                return {
                    id: (0, uuid_1.v4)(),
                    token,
                    metadata,
                    // Security checks intentionally disabled for this flow.
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
                        twitter: {
                            exists: false,
                            followerCount: 0,
                            tweetCount: 0,
                            bio: '',
                            verified: false,
                            sentimentScore: 0,
                        },
                        telegram: {
                            exists: false,
                            memberCount: 0,
                            isChannel: false,
                            description: '',
                        },
                        discord: {
                            exists: false,
                            memberCount: 0,
                            inviteActive: false,
                        },
                        overallPresenceScore: 0,
                        glmAnalysis: '',
                    },
                    websiteScore: website.contentQuality || 0,
                    socialScore: 0,
                    securityScore: 0,
                    overallScore: 0, // Will be calculated in score node
                    rationale: aiAnalysis.rationale,
                    redFlags: aiAnalysis.redFlags,
                    greenFlags: aiAnalysis.greenFlags,
                    recommendation: aiAnalysis.recommendation,
                    analyzedAt: new Date(),
                    cycleId: state.cycleId,
                    errors: [],
                };
            }
            catch (error) {
                logger_1.default.debug(`[AnalyzeNode] Failed to analyze ${token.symbol}: ${error}`);
                return null;
            }
        }));
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                analyzedTokens.push(result.value);
            }
        }
    }
    logger_1.default.info(`[AnalyzeNode] Completed analysis for ${analyzedTokens.length} tokens`);
    return {
        ...(0, state_1.addThought)(state, `OpenRouter analysis complete for ${analyzedTokens.length} tokens`),
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
 * Run OpenRouter analysis for a token
 */
async function runOpenRouterAnalysis(data) {
    const prompt = buildAnalysisPrompt(data);
    if (!openrouter_service_1.default.canUseService()) {
        logger_1.default.warn('[AnalyzeNode] OpenRouter API key missing, using fallback website-only analysis');
        return getWebsiteFallback(data.website);
    }
    const config = config_1.default.get();
    const model = process.env.PUMPFUN_OPENROUTER_MODEL || 'arcee-ai/trinity-large-preview:free';
    let maxTokens = Number.parseInt(process.env.PUMPFUN_OPENROUTER_MAX_TOKENS || '120', 10);
    if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
        maxTokens = 120;
    }
    const requestBody = (tokenBudget) => ({
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
        max_tokens: tokenBudget,
    });
    const requestConfig = {
        headers: {
            Authorization: `Bearer ${config.openrouter.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://perps-trader.ai',
            'X-Title': 'PerpsTrader PumpFun Analyzer',
        },
        timeout: config.openrouter.timeout,
    };
    try {
        const response = await axios_1.default.post(`${config.openrouter.baseUrl}/chat/completions`, requestBody(maxTokens), requestConfig);
        const content = response.data?.choices?.[0]?.message?.content || '';
        const parsed = parseAIResponse(content);
        if (!parsed) {
            logger_1.default.warn('[AnalyzeNode] OpenRouter response was not parseable JSON, using fallback');
            return getWebsiteFallback(data.website);
        }
        return parsed;
    }
    catch (error) {
        const affordMatch = String(error?.response?.data?.error?.message || '').match(/afford\s+(\d+)/i);
        const affordableBudget = affordMatch ? Number.parseInt(affordMatch[1], 10) : NaN;
        if (error?.response?.status === 402 && Number.isFinite(affordableBudget) && affordableBudget > 12) {
            try {
                const retryBudget = Math.max(12, affordableBudget - 2);
                logger_1.default.warn(`[AnalyzeNode] Retrying OpenRouter analysis with lower token budget: ${retryBudget}`);
                const retryResponse = await axios_1.default.post(`${config.openrouter.baseUrl}/chat/completions`, requestBody(retryBudget), requestConfig);
                const retryContent = retryResponse.data?.choices?.[0]?.message?.content || '';
                const retryParsed = parseAIResponse(retryContent);
                if (retryParsed) {
                    return retryParsed;
                }
            }
            catch (retryError) {
                logger_1.default.warn(`[AnalyzeNode] OpenRouter retry failed: ${retryError}`);
            }
        }
        logger_1.default.warn(`[AnalyzeNode] OpenRouter analysis failed: ${error}`);
        return getWebsiteFallback(data.website);
    }
}
/**
 * Build the OpenRouter analysis prompt
 */
function buildAnalysisPrompt(data) {
    const { token, metadata, website } = data;
    return `You are an expert crypto analyst evaluating a new pump.fun token launch.

TOKEN: ${metadata.name} ($${metadata.symbol})
Mint Address: ${token.mintAddress}
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
 * Deterministic fallback when OpenRouter is unavailable.
 */
function getWebsiteFallback(website) {
    if (!website?.url || !website?.exists) {
        return {
            rationale: 'No reachable project website was found. Without a verifiable web presence, this token is not investable.',
            redFlags: ['No reachable website', 'Low transparency'],
            greenFlags: [],
            recommendation: 'STRONG_AVOID',
        };
    }
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
    if (website.contentQuality >= 0.75 && redFlags.length <= 1) {
        return {
            rationale: 'Website quality is strong with multiple credibility signals. Still speculative, but documentation is better than typical launch tokens.',
            redFlags,
            greenFlags,
            recommendation: 'BUY',
        };
    }
    if (website.contentQuality >= 0.45) {
        return {
            rationale: 'Website exists with partial documentation, but several credibility gaps remain. Risk is high and conviction is limited.',
            redFlags,
            greenFlags,
            recommendation: 'HOLD',
        };
    }
    return {
        rationale: 'Website exists but is low quality or incomplete, which is a significant trust risk for early-stage tokens.',
        redFlags,
        greenFlags,
        recommendation: 'AVOID',
    };
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=analyze-node.js.map