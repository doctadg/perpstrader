// Analyze Node - Optional AI analysis + mandatory on-chain data collection
// AI analysis is rate-limited and only runs for tokens passing a pre-filter
// On-chain bonding curve data is collected for ALL tokens

import logger from '../../shared/logger';
import configManager from '../../shared/config';
import openrouterService from '../../shared/openrouter-service';
import { PumpFunAgentState, TokenAnalysis, TokenRecommendation } from '../../shared/types';
import { addThought, updateStep } from '../state';
import { bondingCurveService } from '../services/bonding-curve';
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

// Rate limiter: max AI calls per cycle
const MAX_AI_CALLS_PER_CYCLE = 5;
let aiCallCount = 0;

/**
 * Check if a token passes the pre-filter for AI analysis.
 * Requires at least 2 social links OR a real website.
 */
function passesAIPrefilter(metadata: any, websiteUrl: string): boolean {
  let socialCount = 0;
  if (metadata.twitter) socialCount++;
  if (metadata.telegram) socialCount++;
  if (metadata.discord) socialCount++;
  if (socialCount >= 2) return true;
  if (websiteUrl) return true;
  return false;
}

/**
 * Collect on-chain bonding curve data for a token.
 */
async function collectOnChainData(
  mintAddress: string
): Promise<{
  marketCapSol: number;
  bondingCurveProgress: number;
  solInCurve: number;
  complete: boolean;
} | null> {
  try {
    const curveState = await bondingCurveService.readBondingCurveState(mintAddress);
    if (!curveState) return null;

    const quote = bondingCurveService.getBuyQuote(curveState, 0.01);
    const solInCurve = Number(curveState.realSolReserves) / 1e9;

    return {
      marketCapSol: quote?.marketCapSol ?? 0,
      bondingCurveProgress: quote?.bondingCurveProgress ?? 0,
      solInCurve,
      complete: curveState.complete,
    };
  } catch (err) {
    logger.debug(`[AnalyzeNode] On-chain data collection failed for ${mintAddress}: ${err}`);
    return null;
  }
}

/**
 * Run analysis on all tokens: on-chain data for ALL, AI only for pre-filtered tokens.
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

  // Reset per-cycle AI call counter
  aiCallCount = 0;

  const totalTokens = state.queuedTokens.length;
  logger.info(`[AnalyzeNode] Processing ${totalTokens} tokens (on-chain + optional AI)`);

  // Import web scraper
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

  // Process tokens with concurrency
  const concurrency = 5;
  for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
    const batch = state.queuedTokens.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (item: any) => {
        const token = item.token || item;
        const metadata = item.metadata || token;

        try {
          // --- STEP 1: On-chain data collection (always) ---
          const onChainData = await collectOnChainData(token.mintAddress);
          if (onChainData) {
            (token as any).onChainData = onChainData;
          }

          // --- STEP 2: Website scraping ---
          const websiteUrl = normalizeWebsiteUrl(metadata.website);
          const website = websiteUrl
            ? await webScraper.analyzeWebsite(websiteUrl, metadata)
            : emptyWebsiteResult(metadata.website);

          // --- STEP 3: Optional AI analysis (pre-filtered + rate-limited) ---
          let aiAnalysis;
          const shouldRunAI = passesAIPrefilter(metadata, websiteUrl) && aiCallCount < MAX_AI_CALLS_PER_CYCLE;

          if (shouldRunAI) {
            aiAnalysis = await runOpenRouterAnalysis({
              token,
              metadata,
              website,
            });
            aiCallCount++;
          } else {
            if (!passesAIPrefilter(metadata, websiteUrl)) {
              logger.debug(`[AnalyzeNode] Skipping AI for ${token.symbol}: failed pre-filter`);
            } else {
              logger.debug(`[AnalyzeNode] Skipping AI for ${token.symbol}: rate limit reached (${aiCallCount}/${MAX_AI_CALLS_PER_CYCLE})`);
            }
            aiAnalysis = getWebsiteFallback(website, metadata);
          }

          // --- STEP 4: Build TokenAnalysis ---
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
            onChainData: onChainData,
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

  logger.info(`[AnalyzeNode] Completed analysis for ${analyzedTokens.length} tokens (AI calls: ${aiCallCount}/${MAX_AI_CALLS_PER_CYCLE})`);

  return {
    ...addThought(state, `Analysis complete for ${analyzedTokens.length} tokens (${aiCallCount} AI calls)`),
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
 * Run OpenRouter analysis for a token (rate-limited by caller).
 * On 429 or other failures, returns null so caller can use heuristic fallback
 * instead of spamming retries.
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
} | null> {
  const prompt = buildAnalysisPrompt(data);

  if (!openrouterService.canUseService()) {
    logger.warn('[AnalyzeNode] OpenRouter API key missing, using heuristic fallback');
    return null;
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
      return null;
    }
    return parsed;
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 429) {
      logger.warn(`[AnalyzeNode] OpenRouter 429 rate limited, skipping AI for this token`);
      return null; // Don't retry on 429
    }

    // Handle 402 with reduced token budget
    const affordMatch = String(error?.response?.data?.error?.message || '').match(/afford\s+(\d+)/i);
    const affordableBudget = affordMatch ? Number.parseInt(affordMatch[1], 10) : NaN;

    if (status === 402 && Number.isFinite(affordableBudget) && affordableBudget > 12) {
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
    } else {
      logger.warn(`[AnalyzeNode] OpenRouter analysis failed: ${error}`);
    }
    return null;
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
 * Deterministic fallback when AI is unavailable or skipped.
 * Returns HOLD (neutral) for missing data -- only STRONG_AVOID for actual red flags.
 */
function getWebsiteFallback(
  website: any,
  metadata?: any
): {
  rationale: string;
  redFlags: string[];
  greenFlags: string[];
  recommendation: TokenRecommendation;
} {
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

export { addThought, updateStep } from '../state';
