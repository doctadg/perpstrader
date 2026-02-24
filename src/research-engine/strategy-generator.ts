// Strategy Generator - Uses GLM service to generate new strategy ideas from market conditions

import { GLMAIService } from '../shared/glm-service';
import logger from '../shared/logger';
import { MarketRegime } from './market-analyzer';
import { StrategyIdea, IdeaStatus } from './idea-queue';
import { v4 as uuidv4 } from 'uuid';

export interface GeneratedStrategy {
  name: string;
  description: string;
  type: 'TREND_FOLLOWING' | 'MEAN_REVERSION' | 'MARKET_MAKING' | 'ARBITRAGE' | 'AI_PREDICTION';
  symbols: string[];
  timeframe: string;
  parameters: Record<string, any>;
  entryConditions: string[];
  exitConditions: string[];
  riskParameters: {
    maxPositionSize: number;
    stopLoss: number;
    takeProfit: number;
    maxLeverage: number;
  };
  confidence: number;
  rationale: string;
}

export class StrategyGenerator {
  private glmService: GLMAIService;

  constructor() {
    this.glmService = new GLMAIService();
  }

  /**
   * Generate strategy ideas based on current market conditions
   */
  async generateIdeas(marketRegime: MarketRegime, count: number = 5): Promise<StrategyIdea[]> {
    logger.info(`[StrategyGenerator] Generating ${count} strategy ideas for ${marketRegime.regime} regime`);

    // Try GLM service first
    if (this.glmService.canUseService()) {
      try {
        const ideas = await this.generateWithGLM(marketRegime, count);
        if (ideas.length > 0) {
          return ideas;
        }
        logger.warn('[StrategyGenerator] GLM generation returned empty, using fallback');
      } catch (error) {
        logger.error('[StrategyGenerator] GLM generation failed:', error);
      }
    } else {
      logger.warn('[StrategyGenerator] GLM service not available, using fallback strategies');
    }

    // Fallback to template-based generation
    return this.generateFallbackIdeas(marketRegime, count);
  }

  /**
   * Generate strategies using GLM AI service
   */
  private async generateWithGLM(marketRegime: MarketRegime, count: number): Promise<StrategyIdea[]> {
    const prompt = this.buildStrategyPrompt(marketRegime, count);
    
    try {
      const response = await this.glmService.generateText(prompt, 0.8);
      return this.parseStrategyResponse(response, marketRegime);
    } catch (error) {
      logger.error('[StrategyGenerator] GLM API call failed:', error);
      return [];
    }
  }

  /**
   * Build the strategy generation prompt for GLM
   */
  private buildStrategyPrompt(marketRegime: MarketRegime, count: number): string {
    const topMovers = marketRegime.topMovers
      .map(s => `${s.symbol}: ${s.change24h > 0 ? '+' : ''}${s.change24h.toFixed(2)}%`)
      .join(', ');

    const volatilityRank = marketRegime.volatility < 0.3 ? 'low' : marketRegime.volatility > 0.7 ? 'high' : 'medium';

    return `You are an expert cryptocurrency trading strategist for Hyperliquid DEX.

Current Market Conditions:
- Market Regime: ${marketRegime.regime}
- Volatility Level: ${volatilityRank} (${marketRegime.volatility.toFixed(2)})
- Trend Strength: ${marketRegime.trendStrength.toFixed(2)} (-1 to 1 scale)
- Top 24h Movers: ${topMovers || 'N/A'}
- Analysis Timestamp: ${marketRegime.timestamp.toISOString()}

Generate ${count} highly profitable trading strategies optimized for these exact market conditions.

Requirements:
1. Strategies should be specific to the current regime (${marketRegime.regime})
2. Use appropriate timeframes (1m, 5m, 15m, 1h, 4h)
3. Include clear entry/exit conditions with technical indicators
4. Risk parameters should reflect current volatility
5. Each strategy needs a confidence score (0.0-1.0)

Return valid JSON only:
{
  "strategies": [
    {
      "name": "Strategy Name",
      "description": "Detailed description of how the strategy works",
      "type": "TREND_FOLLOWING|MEAN_REVERSION|MARKET_MAKING|ARBITRAGE|AI_PREDICTION",
      "symbols": ["BTC", "ETH", "SOL"],
      "timeframe": "1h",
      "parameters": {
        "indicator1": value,
        "indicator2": value
      },
      "entryConditions": ["RSI < 30", "Price > EMA50"],
      "exitConditions": ["RSI > 70", "Stop loss hit"],
      "riskParameters": {
        "maxPositionSize": 0.1,
        "stopLoss": 0.03,
        "takeProfit": 0.06,
        "maxLeverage": 5
      },
      "confidence": 0.85,
      "rationale": "Why this strategy fits current market conditions"
    }
  ]
}`;
  }

  /**
   * Parse GLM response into strategy ideas
   */
  private parseStrategyResponse(response: string, marketRegime: MarketRegime): StrategyIdea[] {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*"strategies"[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('[StrategyGenerator] Could not find JSON in GLM response');
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const strategies: StrategyIdea[] = [];

      for (const s of parsed.strategies || []) {
        const strategy: StrategyIdea = {
          id: uuidv4(),
          name: s.name || 'Unnamed Strategy',
          description: s.description || '',
          type: this.validateStrategyType(s.type),
          symbols: Array.isArray(s.symbols) ? s.symbols : ['BTC', 'ETH'],
          timeframe: s.timeframe || '1h',
          parameters: s.parameters || {},
          entryConditions: Array.isArray(s.entryConditions) ? s.entryConditions : [],
          exitConditions: Array.isArray(s.exitConditions) ? s.exitConditions : [],
          riskParameters: {
            maxPositionSize: s.riskParameters?.maxPositionSize || 0.05,
            stopLoss: s.riskParameters?.stopLoss || 0.03,
            takeProfit: s.riskParameters?.takeProfit || 0.06,
            maxLeverage: s.riskParameters?.maxLeverage || 3,
          },
          confidence: Math.max(0, Math.min(1, s.confidence || 0.5)),
          rationale: s.rationale || `Generated for ${marketRegime.regime} regime`,
          status: 'PENDING' as IdeaStatus,
          marketContext: {
            regime: marketRegime.regime,
            volatility: marketRegime.volatility,
            trendStrength: marketRegime.trendStrength,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        strategies.push(strategy);
      }

      return strategies;
    } catch (error) {
      logger.error('[StrategyGenerator] Failed to parse GLM response:', error);
      return [];
    }
  }

  /**
   * Generate fallback ideas when GLM is unavailable
   */
  private generateFallbackIdeas(marketRegime: MarketRegime, count: number): StrategyIdea[] {
    const ideas: StrategyIdea[] = [];
    const baseTime = new Date();

    // Strategy templates based on regime
    const templates: Record<string, Partial<StrategyIdea>[]> = {
      TRENDING_UP: [
        {
          name: 'Momentum Breakout Long',
          description: 'Long positions on breakouts with momentum confirmation',
          type: 'TREND_FOLLOWING',
          entryConditions: ['Price > EMA20', 'RSI > 50', 'Volume > avg'],
          exitConditions: ['Price < EMA20', 'RSI > 80'],
          parameters: { emaPeriod: 20, rsiPeriod: 14, volumeLookback: 20 },
          riskParameters: { maxPositionSize: 0.08, stopLoss: 0.035, takeProfit: 0.08, maxLeverage: 5 },
        },
        {
          name: 'Pullback Entry Long',
          description: 'Enter long on shallow pullbacks in uptrend',
          type: 'MEAN_REVERSION',
          entryConditions: ['Price touches EMA20', 'RSI > 40', 'EMA20 > EMA50'],
          exitConditions: ['Price < EMA50', 'Stop loss hit'],
          parameters: { fastEma: 20, slowEma: 50, rsiLower: 40 },
          riskParameters: { maxPositionSize: 0.07, stopLoss: 0.03, takeProfit: 0.06, maxLeverage: 4 },
        },
      ],
      TRENDING_DOWN: [
        {
          name: 'Momentum Breakout Short',
          description: 'Short positions on breakdowns with momentum confirmation',
          type: 'TREND_FOLLOWING',
          entryConditions: ['Price < EMA20', 'RSI < 50', 'Volume > avg'],
          exitConditions: ['Price > EMA20', 'RSI < 20'],
          parameters: { emaPeriod: 20, rsiPeriod: 14, volumeLookback: 20 },
          riskParameters: { maxPositionSize: 0.08, stopLoss: 0.035, takeProfit: 0.08, maxLeverage: 5 },
        },
        {
          name: 'Bounce Fade Short',
          description: 'Short weak bounces in downtrend',
          type: 'MEAN_REVERSION',
          entryConditions: ['Price rejects EMA20', 'RSI < 60', 'EMA20 < EMA50'],
          exitConditions: ['Price > EMA50', 'Stop loss hit'],
          parameters: { fastEma: 20, slowEma: 50, rsiUpper: 60 },
          riskParameters: { maxPositionSize: 0.07, stopLoss: 0.03, takeProfit: 0.06, maxLeverage: 4 },
        },
      ],
      RANGING: [
        {
          name: 'Bollinger Bands Mean Reversion',
          description: 'Trade reversals at Bollinger Band extremes',
          type: 'MEAN_REVERSION',
          entryConditions: ['Price < BB lower band', 'RSI < 35', 'ADX < 25'],
          exitConditions: ['Price > BB middle band', 'RSI > 65'],
          parameters: { bbPeriod: 20, bbStdDev: 2, rsiPeriod: 14, adxPeriod: 14 },
          riskParameters: { maxPositionSize: 0.06, stopLoss: 0.025, takeProfit: 0.04, maxLeverage: 3 },
        },
        {
          name: 'Support/Resistance Flip',
          description: 'Trade confirmed breaks of range boundaries',
          type: 'MARKET_MAKING',
          entryConditions: ['Price breaks support with volume', 'Retest confirms resistance'],
          exitConditions: ['Price returns to range', 'Opposite boundary hit'],
          parameters: { lookbackPeriod: 50, volumeThreshold: 1.5 },
          riskParameters: { maxPositionSize: 0.05, stopLoss: 0.02, takeProfit: 0.05, maxLeverage: 3 },
        },
      ],
      VOLATILE: [
        {
          name: 'Volatility Expansion',
          description: 'Trade breakouts from volatility compression',
          type: 'TREND_FOLLOWING',
          entryConditions: ['ATR expanding', 'Price breaks 20-period high', 'Volume spike'],
          exitConditions: ['ATR contracts', '2x ATR move against position'],
          parameters: { atrPeriod: 14, breakoutPeriod: 20, volumeSpike: 2 },
          riskParameters: { maxPositionSize: 0.04, stopLoss: 0.02, takeProfit: 0.08, maxLeverage: 3 },
        },
        {
          name: 'Range Scalping',
          description: 'Quick mean reversion trades in volatile range',
          type: 'MEAN_REVERSION',
          entryConditions: ['Price at 4h ATR extreme', 'RSI divergence', 'Short timeframe'],
          exitConditions: ['Price mean reverts', 'Time limit 30min'],
          parameters: { atrPeriod: 14, rsiPeriod: 7, maxHoldTime: 30 },
          riskParameters: { maxPositionSize: 0.03, stopLoss: 0.015, takeProfit: 0.03, maxLeverage: 2 },
        },
      ],
      UNKNOWN: [
        {
          name: 'Conservative Trend Follow',
          description: 'Conservative trend following with tight stops',
          type: 'TREND_FOLLOWING',
          entryConditions: ['EMA cross confirmed', 'ADX > 20'],
          exitConditions: ['EMA uncross', 'Stop loss hit'],
          parameters: { fastEma: 9, slowEma: 21, adxPeriod: 14 },
          riskParameters: { maxPositionSize: 0.05, stopLoss: 0.025, takeProfit: 0.05, maxLeverage: 3 },
        },
      ],
    };

    // Get templates for current regime
    const regimeTemplates = templates[marketRegime.regime] || templates.UNKNOWN;

    // Generate requested number of ideas
    for (let i = 0; i < count; i++) {
      const template = regimeTemplates[i % regimeTemplates.length];
      const confidence = 0.6 + (Math.random() * 0.25); // 0.6-0.85 confidence

      ideas.push({
        id: uuidv4(),
        name: `${template.name} ${i + 1}`,
        description: template.description || '',
        type: template.type || 'TREND_FOLLOWING',
        symbols: ['BTC', 'ETH', 'SOL'],
        timeframe: i % 2 === 0 ? '1h' : '15m',
        parameters: template.parameters || {},
        entryConditions: template.entryConditions || [],
        exitConditions: template.exitConditions || [],
        riskParameters: template.riskParameters || {
          maxPositionSize: 0.05,
          stopLoss: 0.03,
          takeProfit: 0.06,
          maxLeverage: 3,
        },
        confidence,
        rationale: `Fallback strategy for ${marketRegime.regime} regime (confidence: ${confidence.toFixed(2)})`,
        status: 'PENDING',
        marketContext: {
          regime: marketRegime.regime,
          volatility: marketRegime.volatility,
          trendStrength: marketRegime.trendStrength,
        },
        createdAt: baseTime,
        updatedAt: baseTime,
      });
    }

    return ideas;
  }

  /**
   * Validate strategy type
   */
  private validateStrategyType(type: string): StrategyIdea['type'] {
    const validTypes = ['TREND_FOLLOWING', 'MEAN_REVERSION', 'MARKET_MAKING', 'ARBITRAGE', 'AI_PREDICTION'];
    return validTypes.includes(type) ? type as StrategyIdea['type'] : 'TREND_FOLLOWING';
  }
}

export default StrategyGenerator;
