"use strict";
// Analyze Node - GLM-powered comprehensive analysis
// Uses GLM service to analyze all data and generate investment recommendations
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
const glm_service_1 = __importDefault(require("../../shared/glm-service"));
const state_1 = require("../state");
const uuid_1 = require("uuid");
/**
 * Run GLM analysis on all tokens and generate final recommendations
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
    logger_1.default.info(`[AnalyzeNode] Running GLM analysis on ${state.queuedTokens.length} tokens`);
    // Import services
    let solanaRPC;
    let webScraper;
    let socialAnalyzer;
    try {
        const [solModule, webModule, socialModule] = await Promise.all([
            Promise.resolve().then(() => __importStar(require('../services/solana-rpc'))),
            Promise.resolve().then(() => __importStar(require('../services/web-scraper'))),
            Promise.resolve().then(() => __importStar(require('../services/social-analyzer'))),
        ]);
        solanaRPC = solModule.default;
        webScraper = webModule.default;
        socialAnalyzer = socialModule.default;
    }
    catch (error) {
        logger_1.default.error('[AnalyzeNode] Failed to import services');
        return {
            ...(0, state_1.addThought)(state, 'Failed to import services'),
            ...(0, state_1.updateStep)(state, 'ERROR'),
        };
    }
    const analyzedTokens = [];
    // Process tokens (limited concurrency for GLM calls)
    const concurrency = 3; // Limit to avoid overwhelming GLM API
    for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
        const batch = state.queuedTokens.slice(i, i + concurrency);
        const results = await Promise.allSettled(batch.map(async (item) => {
            const token = item.token || item;
            const metadata = item.metadata || token;
            try {
                // Get all analysis data
                const [security, website, social] = await Promise.all([
                    solanaRPC.getMintInfo(token.mintAddress),
                    metadata.website ? webScraper.analyzeWebsite(metadata.website, metadata) : null,
                    socialAnalyzer.analyzeSocial(metadata),
                ]);
                // Run GLM comprehensive analysis
                const glmAnalysis = await runGLMAnalysis({
                    token,
                    metadata,
                    website: website || {
                        url: metadata.website || '',
                        exists: false,
                        hasContent: false,
                        contentQuality: 0,
                        hasWhitepaper: false,
                        hasTeamInfo: false,
                        hasRoadmap: false,
                        hasTokenomics: false,
                        sslValid: false,
                        glmAnalysis: '',
                    },
                    social,
                    security,
                });
                // Create token analysis
                return {
                    id: (0, uuid_1.v4)(),
                    token,
                    metadata,
                    security,
                    website: website || {
                        url: metadata.website || '',
                        exists: false,
                        hasContent: false,
                        contentQuality: 0,
                        hasWhitepaper: false,
                        hasTeamInfo: false,
                        hasRoadmap: false,
                        hasTokenomics: false,
                        sslValid: false,
                        glmAnalysis: '',
                    },
                    social,
                    websiteScore: website?.contentQuality || 0,
                    socialScore: social.overallPresenceScore,
                    securityScore: calculateSecurityScore(security),
                    overallScore: 0, // Will be calculated in score node
                    rationale: glmAnalysis.rationale,
                    redFlags: glmAnalysis.redFlags,
                    greenFlags: glmAnalysis.greenFlags,
                    recommendation: glmAnalysis.recommendation,
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
        ...(0, state_1.addThought)(state, `GLM analysis complete for ${analyzedTokens.length} tokens`),
        ...(0, state_1.updateStep)(state, 'ANALYSIS_COMPLETE'),
        analyzedTokens,
    };
}
/**
 * Run GLM analysis for a token
 */
async function runGLMAnalysis(data) {
    const prompt = buildAnalysisPrompt(data);
    try {
        const response = await glm_service_1.default.generateText(prompt, 0.3);
        return parseGLMResponse(response);
    }
    catch (error) {
        logger_1.default.debug('[AnalyzeNode] GLM analysis failed, using fallback');
        // Fallback based on security
        if (data.security.isMintable || data.security.isFreezable) {
            return {
                rationale: 'Token has security risks - mintable or freezable supply',
                redFlags: data.security.isMintable ? ['Mintable supply'] : ['Freezable accounts'],
                greenFlags: [],
                recommendation: 'AVOID',
            };
        }
        return {
            rationale: 'Insufficient data for full analysis',
            redFlags: [],
            greenFlags: [],
            recommendation: 'HOLD',
        };
    }
}
/**
 * Build the GLM analysis prompt
 */
function buildAnalysisPrompt(data) {
    const { token, metadata, website, social, security } = data;
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

SOCIAL PRESENCE:
- Twitter: ${social.twitter.exists ? `${social.twitter.followerCount} followers` : 'None'}
- Telegram: ${social.telegram.exists ? `${social.telegram.memberCount} members` : 'None'}
- Discord: ${social.discord.exists ? `${social.discord.memberCount} members` : 'None'}
- Overall Score: ${(social.overallPresenceScore * 100).toFixed(0)}%

CONTRACT SECURITY:
- Mintable: ${security.isMintable ? 'YES (RISK)' : 'No'}
- Freezable: ${security.isFreezable ? 'YES (RISK)' : 'No'}
- Risk Level: ${security.riskLevel}

Provide a comprehensive investment assessment. Return JSON ONLY (no markdown, no explanation):
{
  "rationale": "3-4 sentence investment thesis",
  "redFlags": ["flag1", "flag2"],
  "greenFlags": ["flag1", "flag2"],
  "recommendation": "STRONG_BUY" | "BUY" | "HOLD" | "AVOID" | "STRONG_AVOID"
}

Important: Be critical and conservative. pump.fun tokens are high-risk by default.`;
}
/**
 * Parse GLM response
 */
function parseGLMResponse(response) {
    try {
        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*"recommendation"[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            rationale: parsed.rationale || 'No rationale provided',
            redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
            greenFlags: Array.isArray(parsed.greenFlags) ? parsed.greenFlags : [],
            recommendation: validateRecommendation(parsed.recommendation),
        };
    }
    catch (error) {
        logger_1.default.debug('[AnalyzeNode] Failed to parse GLM response');
        return {
            rationale: 'Analysis parsing failed',
            redFlags: ['Analysis failed'],
            greenFlags: [],
            recommendation: 'HOLD',
        };
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
 * Calculate security score (0-1)
 */
function calculateSecurityScore(security) {
    let score = 1.0;
    if (security.isMintable) {
        score -= 0.5;
    }
    if (security.isFreezable) {
        score -= 0.3;
    }
    return Math.max(0, score);
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=analyze-node.js.map