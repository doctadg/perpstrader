// Analyze Node - OpenRouter-powered website-first analysis
// Uses OpenRouter to analyze token website quality and generate recommendations

import logger from '../../shared/logger';
import configManager from '../../shared/config';
import openrouterService from '../../shared/openrouter-service';
import { PumpFunAgentState, TokenAnalysis, TokenRecommendation } from '../../shared/types';
import { addThought, updateStep } from '../state';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

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
export async function analyzeNode(state: PumpFunAgentState): Promise<Partial<PumpFunAgentState>> {
  if (state.queuedTokens.length === 0) {
    logger.warn('[AnalyzeNode] No tokens to analyze');
    return {
      ...addThought(state, 'No tokens to analyze'),
      ...updateStep(state, 'NO_TOKENS'),
      analyzedTokens: [],
    };
  }

  logger.info(`[AnalyzeNode] Running OpenRouter analysis on ${state.queuedTokens.length} tokens`);

  // Import services
  let webScraper: any;

  try {
    const webModule = await import('../services/web-scraper');
    webScraper = webModule.default;
  } catch (error) {
    logger.error('[AnalyzeNode] Failed to import web scraper service');
    return {
      ...addThought(state, 'Failed to import web scraper service'),
      ...updateStep(state, 'ERROR'),
    };
  }

  const analyzedTokens: TokenAnalysis[] = [];

  // Process tokens with limited concurrency for OpenRouter calls
  const concurrency = 3;
  for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
    const batch = state.queuedTokens.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (item: any) => {
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
            id: uuidv4(),
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
          } as TokenAnalysis;
        } catch (error) {
          logger.debug(`[AnalyzeNode] Failed to analyze ${token.symbol}: ${error}`);
          return null;
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        analyzedTokens.push(result.value);
      }
    }
  }

  logger.info(`[AnalyzeNode] Completed analysis for ${analyzedTokens.length} tokens`);

  return {
    ...addThought(state, `OpenRouter analysis complete for ${analyzedTokens.length} tokens`),
    ...updateStep(state, 'ANALYSIS_COMPLETE'),
    analyzedTokens,
  };
}

function emptyWebsiteResult(original?: string): {
  url: string;
  exists: boolean;
  hasContent: boolean;
  contentQuality: number;
  hasWhitepaper: boolean;
  hasTeamInfo: boolean;
  hasRoadmap: boolean;
  hasTokenomics: boolean;
  sslValid: boolean;
  glmAnalysis: string;
} {
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

function normalizeWebsiteUrl(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let candidate = raw.trim();
  if (!candidate) return '';

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
  } catch {
    return '';
  }
}

/**
 * Run OpenRouter analysis for a token
 */
async function runOpenRouterAnalysis(data: {
  token: any;
  metadata: any;
  website: any;
}): Promise<{
  rationale: string;
  redFlags: string[];
  greenFlags: string[];
  recommendation: TokenRecommendation;
}> {
  const prompt = buildAnalysisPrompt(data);

  if (!openrouterService.canUseService()) {
    logger.warn('[AnalyzeNode] OpenRouter API key missing, using fallback website-only analysis');
    return getWebsiteFallback(data.website);
  }

  const config = configManager.get();
  const model = process.env.PUMPFUN_OPENROUTER_MODEL || 'arcee-ai/trinity-large-preview:free';
  let maxTokens = Number.parseInt(process.env.PUMPFUN_OPENROUTER_MAX_TOKENS || '120', 10);
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    maxTokens = 120;
  }

  const requestBody = (tokenBudget: number) => ({
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
    const response = await axios.post(
      `${config.openrouter.baseUrl}/chat/completions`,
      requestBody(maxTokens),
      requestConfig
    );

    const content = response.data?.choices?.[0]?.message?.content || '';
    const parsed = parseAIResponse(content);
    if (!parsed) {
      logger.warn('[AnalyzeNode] OpenRouter response was not parseable JSON, using fallback');
      return getWebsiteFallback(data.website);
    }
    return parsed;
  } catch (error) {
    const affordMatch = String((error as any)?.response?.data?.error?.message || '').match(/afford\s+(\d+)/i);
    const affordableBudget = affordMatch ? Number.parseInt(affordMatch[1], 10) : NaN;

    if ((error as any)?.response?.status === 402 && Number.isFinite(affordableBudget) && affordableBudget > 12) {
      try {
        const retryBudget = Math.max(12, affordableBudget - 2);
        logger.warn(`[AnalyzeNode] Retrying OpenRouter analysis with lower token budget: ${retryBudget}`);

        const retryResponse = await axios.post(
          `${config.openrouter.baseUrl}/chat/completions`,
          requestBody(retryBudget),
          requestConfig
        );

        const retryContent = retryResponse.data?.choices?.[0]?.message?.content || '';
        const retryParsed = parseAIResponse(retryContent);
        if (retryParsed) {
          return retryParsed;
        }
      } catch (retryError) {
        logger.warn(`[AnalyzeNode] OpenRouter retry failed: ${retryError}`);
      }
    }

    logger.warn(`[AnalyzeNode] OpenRouter analysis failed: ${error}`);
    return getWebsiteFallback(data.website);
  }
}

/**
 * Build the OpenRouter analysis prompt
 */
function buildAnalysisPrompt(data: {
  token: any;
  metadata: any;
  website: any;
}): string {
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
function parseAIResponse(response: string): {
  rationale: string;
  redFlags: string[];
  greenFlags: string[];
  recommendation: TokenRecommendation;
} | null {
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
  } catch (error) {
    logger.debug('[AnalyzeNode] Failed to parse OpenRouter response');
    return null;
  }
}

/**
 * Validate recommendation
 */
function validateRecommendation(rec: string): TokenRecommendation {
  const valid: TokenRecommendation[] = ['STRONG_BUY', 'BUY', 'HOLD', 'AVOID', 'STRONG_AVOID'];
  if (valid.includes(rec as TokenRecommendation)) {
    return rec as TokenRecommendation;
  }
  return 'HOLD';
}

/**
 * Deterministic fallback when OpenRouter is unavailable.
 */
function getWebsiteFallback(website: any): {
  rationale: string;
  redFlags: string[];
  greenFlags: string[];
  recommendation: TokenRecommendation;
} {
  if (!website?.url || !website?.exists) {
    return {
      rationale: 'No reachable project website was found. Without a verifiable web presence, this token is not investable.',
      redFlags: ['No reachable website', 'Low transparency'],
      greenFlags: [],
      recommendation: 'STRONG_AVOID',
    };
  }

  const redFlags: string[] = [];
  const greenFlags: string[] = [];

  if (!website.sslValid) redFlags.push('Website is not HTTPS');
  if (!website.hasWhitepaper) redFlags.push('No whitepaper');
  if (!website.hasTokenomics) redFlags.push('No tokenomics details');
  if (!website.hasTeamInfo) redFlags.push('No team information');

  if (website.hasWhitepaper) greenFlags.push('Whitepaper available');
  if (website.hasTokenomics) greenFlags.push('Tokenomics section present');
  if (website.hasRoadmap) greenFlags.push('Roadmap available');
  if (website.hasTeamInfo) greenFlags.push('Team information provided');

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

export { addThought, updateStep } from '../state';
