// Analyze Node - GLM-powered comprehensive analysis
// Uses GLM service to analyze all data and generate investment recommendations

import logger from '../../shared/logger';
import glmService from '../../shared/glm-service';
import { PumpFunAgentState, TokenAnalysis, TokenRecommendation } from '../../shared/types';
import { addThought, updateStep } from '../state';
import { v4 as uuidv4 } from 'uuid';

/**
 * Run GLM analysis on all tokens and generate final recommendations
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

  logger.info(`[AnalyzeNode] Running GLM analysis on ${state.queuedTokens.length} tokens`);

  // Import services
  let solanaRPC: any;
  let webScraper: any;
  let socialAnalyzer: any;

  try {
    const [solModule, webModule, socialModule] = await Promise.all([
      import('../services/solana-rpc'),
      import('../services/web-scraper'),
      import('../services/social-analyzer'),
    ]);
    solanaRPC = solModule.default;
    webScraper = webModule.default;
    socialAnalyzer = socialModule.default;
  } catch (error) {
    logger.error('[AnalyzeNode] Failed to import services');
    return {
      ...addThought(state, 'Failed to import services'),
      ...updateStep(state, 'ERROR'),
    };
  }

  const analyzedTokens: TokenAnalysis[] = [];

  // Process tokens (limited concurrency for GLM calls)
  const concurrency = 3; // Limit to avoid overwhelming GLM API
  for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
    const batch = state.queuedTokens.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (item: any) => {
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
            id: uuidv4(),
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
    ...addThought(state, `GLM analysis complete for ${analyzedTokens.length} tokens`),
    ...updateStep(state, 'ANALYSIS_COMPLETE'),
    analyzedTokens,
  };
}

/**
 * Run GLM analysis for a token
 */
async function runGLMAnalysis(data: {
  token: any;
  metadata: any;
  website: any;
  social: any;
  security: any;
}): Promise<{
  rationale: string;
  redFlags: string[];
  greenFlags: string[];
  recommendation: TokenRecommendation;
}> {
  const prompt = buildAnalysisPrompt(data);

  try {
    const response = await glmService.generateText(prompt, 0.3);
    return parseGLMResponse(response);
  } catch (error) {
    logger.debug('[AnalyzeNode] GLM analysis failed, using fallback');
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
function buildAnalysisPrompt(data: {
  token: any;
  metadata: any;
  website: any;
  social: any;
  security: any;
}): string {
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
function parseGLMResponse(response: string): {
  rationale: string;
  redFlags: string[];
  greenFlags: string[];
  recommendation: TokenRecommendation;
} {
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
  } catch (error) {
    logger.debug('[AnalyzeNode] Failed to parse GLM response');
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
function validateRecommendation(rec: string): TokenRecommendation {
  const valid: TokenRecommendation[] = ['STRONG_BUY', 'BUY', 'HOLD', 'AVOID', 'STRONG_AVOID'];
  if (valid.includes(rec as TokenRecommendation)) {
    return rec as TokenRecommendation;
  }
  return 'HOLD';
}

/**
 * Calculate security score (0-1)
 */
function calculateSecurityScore(security: any): number {
  let score = 1.0;

  if (security.isMintable) {
    score -= 0.5;
  }
  if (security.isFreezable) {
    score -= 0.3;
  }

  return Math.max(0, score);
}

export { addThought, updateStep } from '../state';
