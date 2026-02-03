// Safekeeping Fund System - AI Analysis Node
// Uses OpenRouter for AI-powered market analysis and recommendations

import logger from '../../shared/logger';
import axios from 'axios';
import type { SafekeepingFundState } from '../state';
import type { AIAnalysis, RiskLevel, MarketRegime, Anomaly, PoolAllocation } from '../types';

const config = (global as any).config || require('../../shared/config').default?.get?.() || {};

/**
 * AI Analysis Node
 * Leverages OpenRouter to analyze market conditions and provide recommendations
 */
export async function aiAnalysisNode(
  state: SafekeepingFundState
): Promise<Partial<SafekeepingFundState>> {
  logger.info('[AIAnalysis] Starting AI-powered market analysis');

  try {
    // Check if OpenRouter is available via config
    const apiKey = config.openrouter?.apiKey;
    if (!apiKey) {
      logger.warn('[AIAnalysis] OpenRouter not available, skipping AI analysis');
      return {
        currentStep: 'AI_ANALYSIS_SKIPPED',
        thoughts: [...state.thoughts, 'AI analysis skipped - OpenRouter not configured'],
      };
    }

    const analysis = await performAIAnalysis(state);

    logger.info(
      `[AIAnalysis] Analysis complete. Risk: ${analysis.riskLevel}, ` +
      `Regime: ${analysis.marketRegime}, Recommendations: ${analysis.recommendations.length}`
    );

    return {
      currentStep: 'AI_ANALYSIS_COMPLETE',
      marketAnalysis: analysis.summary,
      aiRecommendations: analysis.recommendations,
      aiRiskLevel: analysis.riskLevel,
      marketRegime: analysis.marketRegime,
      detectedAnomalies: analysis.anomalies,
      thoughts: [
        ...state.thoughts,
        `AI Analysis: ${analysis.riskLevel} risk, ${analysis.marketRegime} regime`,
        ...analysis.recommendations.slice(0, 2).map(r => `  - ${r}`),
      ],
    };
  } catch (error) {
    logger.error(`[AIAnalysis] Failed: ${error}`);
    return {
      currentStep: 'AI_ANALYSIS_ERROR',
      errors: [...state.errors, `AI analysis failed: ${error}`],
      aiRiskLevel: 'MEDIUM',
      marketRegime: 'SIDEWAYS',
      detectedAnomalies: [],
      thoughts: [...state.thoughts, 'AI analysis encountered an error'],
    };
  }
}

/**
 * Perform AI analysis using OpenRouter
 */
async function performAIAnalysis(state: SafekeepingFundState): Promise<AIAnalysis> {
  const apiKey = config.openrouter?.apiKey;
  if (!apiKey) {
    return getFallbackAnalysis();
  }

  const prompt = buildAnalysisPrompt(state);

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'system',
            content: AI_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://perps-trader.ai',
          'X-Title': 'PerpsTrader Safekeeping Fund',
        },
        timeout: 30000,
      }
    );

    return parseAIResponse(response.data.choices[0]?.message?.content || '');
  } catch (error) {
    logger.debug(`[AIAnalysis] OpenRouter request failed: ${error}`);
    return getFallbackAnalysis();
  }
}

/**
 * Build analysis prompt from state
 */
function buildAnalysisPrompt(state: SafekeepingFundState): string {
  const opportunities = state.topOpportunities.slice(0, 10);

  return `
You are analyzing DeFi yield opportunities for an autonomous safekeeping fund.

CURRENT PORTFOLIO:
- Total Value: $${state.totalValue.toFixed(2)}
- Current APR: ${state.totalEffectiveAPR.toFixed(2)}%
- Positions: ${state.positions.length}
- APR Trend: ${state.aprTrend}

TOP 10 YIELD OPPORTUNITIES:
${opportunities.map((opp, i) => `
${i + 1}. ${opp.token0.symbol}/${opp.token1.symbol} on ${opp.dex} (${opp.chain})
   - Pool: ${opp.address.slice(0, 10)}...
   - TVL: $${opp.tvl.toLocaleString()}
   - Fee APR: ${opp.feeAPR.toFixed(2)}%
   - Effective APR: ${opp.effectiveAPR.toFixed(2)}%
   - Risk Score: ${opp.riskScore.toFixed(2)}
   - Gas Cost: $${opp.estimatedGasCost.toFixed(2)}
`).join('')}

CHAIN STATUS:
${Array.from(state.chainStatus.entries()).map(([chain, status]) => `
- ${chain}: ${status.isConnected ? 'Connected' : 'Disconnected'} (latency: ${status.latency}ms)
`).join('')}

Analyze these opportunities and provide:
1. Market summary (2-3 sentences)
2. Top 3 recommendations with reasoning
3. Overall risk level (LOW/MEDIUM/HIGH/CRITICAL)
4. Market regime (BULL/BEAR/SIDEWAYS/VOLATILE)
5. Any anomalies detected
6. Suggested allocation percentages for top 3 pools

Return your response as JSON in this exact format:
{
  "summary": "...",
  "recommendations": ["...", "...", "..."],
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "marketRegime": "BULL|BEAR|SIDEWAYS|VOLATILE",
  "anomalies": [
    {
      "type": "...",
      "severity": "LOW|MEDIUM|HIGH|CRITICAL",
      "description": "...",
      "recommendedAction": "..."
    }
  ],
  "suggestedAllocations": [
    {
      "poolAddress": "...",
      "chain": "ethereum|bsc|solana",
      "dex": "uniswap_v3|pancakeswap_v3|meteora",
      "percentage": 50,
      "expectedAPR": 15.5,
      "riskScore": 0.3
    }
  ]
}
`.trim();
}

/**
 * System prompt for AI analysis
 */
const AI_SYSTEM_PROMPT = `You are an expert DeFi yield strategist analyzing liquidity provision opportunities across multiple chains.

Your expertise includes:
- Understanding AMM mechanics, impermanent loss, and fee structures
- Evaluating risk across different blockchain networks
- Identifying market anomalies and potential manipulation
- Optimizing portfolio allocation for risk-adjusted returns

Always be conservative in risk assessment. When in doubt, flag anomalies and recommend caution.

Focus on:
1. Risk-adjusted returns, not just highest APR
2. Diversification across chains and token pairs
3. Gas cost impact on net returns
4. Liquidity depth and exit strategy
5. Smart contract and platform risk

Provide specific, actionable recommendations backed by reasoning.`;

/**
 * Parse AI response
 */
function parseAIResponse(response: string): AIAnalysis {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and set defaults
    return {
      summary: parsed.summary || 'No analysis available',
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      riskLevel: validateRiskLevel(parsed.riskLevel),
      marketRegime: validateMarketRegime(parsed.marketRegime),
      marketConditions: parsed.marketConditions || parsed.summary || 'Market conditions unknown',
      anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies.map(validateAnomaly).filter(Boolean) : [],
      suggestedAllocations: Array.isArray(parsed.suggestedAllocations) ? parsed.suggestedAllocations : [],
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error(`[AIAnalysis] Failed to parse response: ${error}`);
    return getFallbackAnalysis();
  }
}

/**
 * Validate risk level
 */
function validateRiskLevel(value: string): RiskLevel {
  const valid = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return valid.includes(value?.toUpperCase()) ? value.toUpperCase() as RiskLevel : 'MEDIUM';
}

/**
 * Validate market regime
 */
function validateMarketRegime(value: string): MarketRegime {
  const valid = ['BULL', 'BEAR', 'SIDEWAYS', 'VOLATILE'];
  return valid.includes(value?.toUpperCase()) ? value.toUpperCase() as MarketRegime : 'SIDEWAYS';
}

/**
 * Validate and sanitize anomaly
 */
function validateAnomaly(anomaly: unknown): Anomaly | null {
  if (!anomaly || typeof anomaly !== 'object') return null;

  const a = anomaly as Record<string, unknown>;

  return {
    type: String(a.type || 'UNKNOWN'),
    severity: validateRiskLevel(String(a.severity)),
    description: String(a.description || 'No description'),
    recommendedAction: String(a.recommendedAction || 'Monitor closely'),
    timestamp: new Date(),
  };
}

/**
 * Get fallback analysis when AI fails
 */
function getFallbackAnalysis(): AIAnalysis {
  return {
    summary: 'AI analysis unavailable. Using default conservative approach.',
    recommendations: [
      'Maintain current positions',
      'Monitor for APR improvements',
      'Rebalance only if APR improvement exceeds 2%',
    ],
    riskLevel: 'MEDIUM',
    marketRegime: 'SIDEWAYS',
    marketConditions: 'Market conditions unknown - using default conservative approach',
    anomalies: [],
    suggestedAllocations: [],
    timestamp: new Date(),
  };
}

/**
 * Quick confidence score for a rebalance decision
 */
export function calculateRebalanceConfidence(state: SafekeepingFundState): number {
  let confidence = 0.5; // Base confidence

  // Higher confidence with more opportunities
  if (state.poolOpportunities.length >= 10) confidence += 0.1;
  if (state.poolOpportunities.length >= 20) confidence += 0.1;

  // Higher confidence if APR improvement is significant
  const bestAPR = state.bestOpportunity?.effectiveAPR || 0;
  const currentAPR = state.totalEffectiveAPR;
  const aprDelta = bestAPR - currentAPR;

  if (aprDelta > 5) confidence += 0.2;
  else if (aprDelta > 2) confidence += 0.1;
  else if (aprDelta < 0.5) confidence -= 0.2;

  // Reduce confidence if there are anomalies
  const criticalAnomalies = state.detectedAnomalies.filter(a => a.severity === 'CRITICAL').length;
  if (criticalAnomalies > 0) confidence -= 0.3;

  const highAnomalies = state.detectedAnomalies.filter(a => a.severity === 'HIGH').length;
  if (highAnomalies > 0) confidence -= 0.1;

  // Reduce confidence in volatile markets
  if (state.marketRegime === 'VOLATILE') confidence -= 0.15;

  return Math.max(0, Math.min(1, confidence));
}
