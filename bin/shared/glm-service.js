"use strict";
// GLM AI Service - Wrapper for Z.AI LLM API
// Used for strategy generation and market analysis
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GLMAIService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const config_1 = __importDefault(require("../shared/config"));
const logger_1 = __importDefault(require("../shared/logger"));
const config = config_1.default.get();
/**
 * GLM AI Service for strategy generation
 */
class GLMAIService {
    baseUrl;
    apiKey;
    model;
    labelingModel;
    timeout;
    constructor() {
        this.baseUrl = config.glm.baseUrl;
        this.apiKey = config.glm.apiKey;
        this.model = config.glm.model || 'glm-4.7';
        this.labelingModel = process.env.GLM_LABELING_MODEL || 'glm-4.5-air';
        this.timeout = config.glm.timeout;
    }
    /**
     * Check if the service is configured
     */
    canUseService() {
        return !!this.apiKey && this.apiKey.length > 0 && this.apiKey !== 'your-api-key-here';
    }
    safeErrorMessage(error) {
        const status = error?.response?.status;
        const apiMessage = error?.response?.data?.error?.message || error?.response?.data?.message;
        const code = error?.code;
        const message = error?.message;
        return [
            status ? `HTTP ${status}` : null,
            code ? `code=${code}` : null,
            apiMessage ? `api=${String(apiMessage)}` : null,
            message ? `msg=${String(message)}` : null,
        ].filter(Boolean).join(' ');
    }
    /**
     * Generate trading strategies based on research data
     */
    async generateTradingStrategies(researchData) {
        if (!this.canUseService()) {
            logger_1.default.warn('[GLM] API key not configured, using fallback strategies');
            return this.generateFallbackStrategies(researchData);
        }
        try {
            const prompt = this.buildStrategyPrompt(researchData);
            const response = await this.callAPI(prompt);
            // Parse strategies from response
            const strategies = this.parseStrategies(response);
            logger_1.default.info(`[GLM] Generated ${strategies.length} strategies`);
            return strategies;
        }
        catch (error) {
            logger_1.default.error(`[GLM] Strategy generation failed: ${this.safeErrorMessage(error)}`);
            return this.generateFallbackStrategies(researchData);
        }
    }
    /**
     * Generate prediction market ideas based on linked news and market prices
     */
    async generatePredictionIdeas(context) {
        if (!this.canUseService()) {
            logger_1.default.warn('[GLM] API key not configured, skipping prediction ideas');
            return [];
        }
        try {
            const prompt = this.buildPredictionPrompt(context);
            const response = await this.callAPI(prompt);
            return this.parsePredictionIdeas(response);
        }
        catch (error) {
            logger_1.default.error(`[GLM] Prediction idea generation failed: ${this.safeErrorMessage(error)}`);
            return [];
        }
    }
    /**
     * Call the GLM API
     * @param prompt - The prompt to send
     * @param retries - Number of retry attempts
     * @param modelOverride - Optional model override (defaults to this.model)
     * @param temperature - Temperature for generation (default 0.7)
     */
    async callAPI(prompt, retries = 3, modelOverride, temperature = 0.7) {
        const modelToUse = modelOverride || this.model;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios_1.default.post(`${this.baseUrl}/chat/completions`, {
                    model: modelToUse,
                    messages: [
                        { role: 'system', content: 'You are an expert cryptocurrency trading strategist focused on MAXIMUM PROFITABILITY.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: temperature,
                    max_tokens: 4000,
                }, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: this.timeout,
                });
                return response.data.choices[0]?.message?.content || '';
            }
            catch (error) {
                if (attempt === retries)
                    throw error;
                logger_1.default.warn(`[GLM] Attempt ${attempt} failed, retrying...`);
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
        throw new Error('GLM API call failed after retries');
    }
    /**
     * Build the strategy generation prompt
     */
    buildStrategyPrompt(data) {
        return `Based on the following market research data, generate 10 highly profitable trading strategies for Hyperliquid DEX.

Research Data:
- Topic: ${data.topic}
- Insights: ${data.insights.join('\n')}
- Confidence: ${data.confidence}

Return strategies in this JSON format:
{
  "strategies": [
    {
      "name": "Strategy Name",
      "description": "Description",
      "type": "TREND_FOLLOWING" | "MEAN_REVERSION" | "MARKET_MAKING" | "ARBITRAGE" | "AI_PREDICTION",
      "symbols": ["BTC", "ETH"],
      "timeframe": "1h",
      "entryConditions": ["condition1", "condition2"],
      "exitConditions": ["condition1", "condition2"],
      "parameters": { "key": "value" },
      "riskParameters": {
        "maxPositionSize": 0.1,
        "stopLoss": 0.03,
        "takeProfit": 0.06,
        "maxLeverage": 5
      }
    }
  ]
}

Focus on AGGRESSIVE, HIGH-EDGE strategies with clear entry/exit conditions.`;
    }
    buildPredictionPrompt(context) {
        const markets = context.markets.slice(0, 12).map(market => {
            const news = (context.marketNews[market.id] || []).slice(0, 3);
            const newsLines = news.map(item => `- ${item.title} (${item.sentiment}, ${item.importance})`).join('\n');
            const yesPrice = Number.isFinite(market.yesPrice) ? market.yesPrice?.toFixed(3) : 'n/a';
            const noPrice = Number.isFinite(market.noPrice) ? market.noPrice?.toFixed(3) : 'n/a';
            return `Market: ${market.title}
ID: ${market.id}
Yes: ${yesPrice} | No: ${noPrice}
News:\n${newsLines || '- none'}\n`;
        }).join('\n');
        return `You are a prediction market analyst. Given markets and linked news, propose up to 6 actionable ideas.
Each idea must include a predicted probability vs implied probability and choose YES or NO.

Return JSON only in this format:
{
  "ideas": [
    {
      "marketId": "string",
      "marketTitle": "string",
      "outcome": "YES" | "NO",
      "impliedProbability": 0.55,
      "predictedProbability": 0.62,
      "edge": 0.07,
      "confidence": 0.7,
      "timeHorizon": "7d",
      "catalysts": ["headline 1", "headline 2"],
      "rationale": "short explanation"
    }
  ]
}

Markets:\n${markets}`;
    }
    parsePredictionIdeas(response) {
        try {
            const parsed = JSON.parse(response);
            const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
            return ideas
                .map((idea) => ({
                id: crypto_1.default.randomUUID(),
                marketId: String(idea.marketId || ''),
                marketTitle: String(idea.marketTitle || ''),
                outcome: idea.outcome === 'NO' ? 'NO' : 'YES',
                impliedProbability: Number(idea.impliedProbability) || 0,
                predictedProbability: Number(idea.predictedProbability) || 0,
                edge: Number(idea.edge) || 0,
                confidence: Number(idea.confidence) || 0.5,
                timeHorizon: idea.timeHorizon || '7d',
                catalysts: Array.isArray(idea.catalysts) ? idea.catalysts.map(String) : [],
                rationale: String(idea.rationale || ''),
            }))
                .filter((idea) => !!idea.marketId && !!idea.marketTitle);
        }
        catch (error) {
            logger_1.default.warn('[GLM] Failed to parse prediction ideas JSON');
            return [];
        }
    }
    /**
     * Parse strategies from LLM response
     */
    parseStrategies(response) {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*"strategies"[\s\S]*\}/);
            if (!jsonMatch) {
                logger_1.default.warn('[GLM] Could not find JSON in response');
                return [];
            }
            const parsed = JSON.parse(jsonMatch[0]);
            const strategies = [];
            for (const s of parsed.strategies || []) {
                strategies.push({
                    id: crypto_1.default.randomUUID(),
                    name: s.name,
                    description: s.description,
                    type: s.type || 'TREND_FOLLOWING',
                    symbols: s.symbols || ['BTC'],
                    timeframe: s.timeframe || '1h',
                    parameters: s.parameters || {},
                    entryConditions: s.entryConditions || [],
                    exitConditions: s.exitConditions || [],
                    riskParameters: {
                        maxPositionSize: s.riskParameters?.maxPositionSize || 0.1,
                        stopLoss: s.riskParameters?.stopLoss || 0.03,
                        takeProfit: s.riskParameters?.takeProfit || 0.06,
                        maxLeverage: s.riskParameters?.maxLeverage || 5,
                    },
                    isActive: true,
                    performance: {
                        totalTrades: 0,
                        winningTrades: 0,
                        losingTrades: 0,
                        winRate: 0,
                        totalPnL: 0,
                        sharpeRatio: 0,
                        maxDrawdown: 0,
                        averageWin: 0,
                        averageLoss: 0,
                        profitFactor: 0,
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }
            return strategies;
        }
        catch (error) {
            logger_1.default.error(`[GLM] Failed to parse strategies: ${this.safeErrorMessage(error)}`);
            return [];
        }
    }
    /**
     * Fallback strategies when API is unavailable
     */
    generateFallbackStrategies(data) {
        const baseStrategy = {
            isActive: true,
            performance: {
                totalTrades: 0,
                winningTrades: 0,
                losingTrades: 0,
                winRate: 0,
                totalPnL: 0,
                sharpeRatio: 0,
                maxDrawdown: 0,
                averageWin: 0,
                averageLoss: 0,
                profitFactor: 0,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        return [
            {
                ...baseStrategy,
                id: crypto_1.default.randomUUID(),
                name: 'RSI Mean Reversion',
                description: 'Mean reversion based on RSI extremes',
                type: 'MEAN_REVERSION',
                symbols: ['BTC', 'ETH', 'SOL'],
                timeframe: '1h',
                parameters: { rsiPeriod: 14, oversold: 30, overbought: 70, bbPeriod: 20, bbStdDev: 2 },
                entryConditions: ['RSI < 30 for long', 'RSI > 70 for short'],
                exitConditions: ['RSI crosses 50', 'Stop loss hit'],
                riskParameters: { maxPositionSize: 0.05, stopLoss: 0.02, takeProfit: 0.04, maxLeverage: 3 },
            },
            {
                ...baseStrategy,
                id: crypto_1.default.randomUUID(),
                name: 'RSI Tight Reversion',
                description: 'Aggressive mean reversion on deeper RSI extremes',
                type: 'MEAN_REVERSION',
                symbols: ['BTC', 'ETH', 'SOL'],
                timeframe: '1h',
                parameters: { rsiPeriod: 10, oversold: 25, overbought: 75, bbPeriod: 20, bbStdDev: 2.2 },
                entryConditions: ['RSI < 25 for long', 'RSI > 75 for short'],
                exitConditions: ['RSI crosses 50', 'Stop loss hit'],
                riskParameters: { maxPositionSize: 0.04, stopLoss: 0.025, takeProfit: 0.045, maxLeverage: 3 },
            },
            {
                ...baseStrategy,
                id: crypto_1.default.randomUUID(),
                name: 'RSI Loose Reversion',
                description: 'Mean reversion with wider RSI bands',
                type: 'MEAN_REVERSION',
                symbols: ['BTC', 'ETH', 'SOL'],
                timeframe: '1h',
                parameters: { rsiPeriod: 14, oversold: 35, overbought: 65, bbPeriod: 18, bbStdDev: 1.8 },
                entryConditions: ['RSI < 35 for long', 'RSI > 65 for short'],
                exitConditions: ['RSI crosses 50', 'Stop loss hit'],
                riskParameters: { maxPositionSize: 0.05, stopLoss: 0.03, takeProfit: 0.05, maxLeverage: 3 },
            },
            {
                ...baseStrategy,
                id: crypto_1.default.randomUUID(),
                name: 'Fast SMA Trend',
                description: 'Trend following on fast SMA crossover',
                type: 'TREND_FOLLOWING',
                symbols: ['BTC', 'ETH', 'SOL'],
                timeframe: '1h',
                parameters: { fastPeriod: 9, slowPeriod: 21 },
                entryConditions: ['Fast SMA crosses above slow SMA for long', 'Fast SMA crosses below slow SMA for short'],
                exitConditions: ['Opposite crossover', 'Stop loss hit'],
                riskParameters: { maxPositionSize: 0.07, stopLoss: 0.03, takeProfit: 0.06, maxLeverage: 4 },
            },
            {
                ...baseStrategy,
                id: crypto_1.default.randomUUID(),
                name: 'Standard SMA Trend',
                description: 'Trend following on standard SMA crossover',
                type: 'TREND_FOLLOWING',
                symbols: ['BTC', 'ETH', 'SOL'],
                timeframe: '1h',
                parameters: { fastPeriod: 12, slowPeriod: 26 },
                entryConditions: ['Fast SMA crosses above slow SMA for long', 'Fast SMA crosses below slow SMA for short'],
                exitConditions: ['Opposite crossover', 'Stop loss hit'],
                riskParameters: { maxPositionSize: 0.08, stopLoss: 0.03, takeProfit: 0.06, maxLeverage: 4 },
            },
            {
                ...baseStrategy,
                id: crypto_1.default.randomUUID(),
                name: 'Slow SMA Trend',
                description: 'Trend following with longer SMA windows',
                type: 'TREND_FOLLOWING',
                symbols: ['BTC', 'ETH', 'SOL'],
                timeframe: '1h',
                parameters: { fastPeriod: 20, slowPeriod: 50 },
                entryConditions: ['Fast SMA crosses above slow SMA for long', 'Fast SMA crosses below slow SMA for short'],
                exitConditions: ['Opposite crossover', 'Stop loss hit'],
                riskParameters: { maxPositionSize: 0.06, stopLoss: 0.035, takeProfit: 0.07, maxLeverage: 4 },
            },
        ];
    }
    /**
     * Optimize a strategy based on its performance (stub for compatibility)
     */
    async optimizeStrategy(strategy, performance) {
        logger_1.default.info(`[GLM] Optimizing strategy: ${strategy.name}`);
        // Return the same strategy with slightly adjusted parameters
        return {
            ...strategy,
            riskParameters: {
                ...strategy.riskParameters,
                stopLoss: performance.winRate > 50 ? strategy.riskParameters.stopLoss * 0.95 : strategy.riskParameters.stopLoss * 1.05,
                takeProfit: performance.profitFactor > 1 ? strategy.riskParameters.takeProfit * 1.05 : strategy.riskParameters.takeProfit * 0.95,
            },
            updatedAt: new Date(),
        };
    }
    /**
     * Generate a trading signal (stub for compatibility)
     */
    async generateTradingSignal(indicators, patterns) {
        logger_1.default.info('[GLM] generateTradingSignal called (stub)');
        return null;
    }
    /**
     * Summarize an article content into 1-3 paragraphs.
     */
    async summarizeArticle(content) {
        if (!this.canUseService()) {
            logger_1.default.warn('[GLM] API key not configured, returning fallback summary');
            return this.generateFallbackSummary(content);
        }
        try {
            const prompt = this.buildSummarizationPrompt(content);
            const summary = await this.callAPI(prompt);
            return summary.trim();
        }
        catch (error) {
            logger_1.default.error(`[GLM] Summarization failed: ${this.safeErrorMessage(error)}`);
            return this.generateFallbackSummary(content);
        }
    }
    buildSummarizationPrompt(content) {
        return `Summarize the following news article content into exactly 1-3 paragraphs. 
Focus on the technical and economic implications, providing a clear and concise overview for a high-frequency trader.

Article Content:
${content.substring(0, 10000)}

Summary:`;
    }
    generateFallbackSummary(content) {
        if (!content)
            return 'No content available for summarization.';
        const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
        return sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '...' : '');
    }
    /**
     * Generate vector embedding for text using GLM API
     */
    async generateEmbedding(text) {
        if (!this.canUseService()) {
            return null; // Fallback to keyword clustering
        }
        try {
            // Truncate if too long (max 8192 tokens usually, keep safe limit)
            const safeText = text.substring(0, 8000);
            const embeddingModel = process.env.ZAI_EMBEDDING_MODEL || this.model;
            const response = await axios_1.default.post(`${this.baseUrl}/embeddings`, {
                model: embeddingModel,
                input: [safeText],
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: this.timeout,
            });
            // Extract embedding vector
            if (response.data && response.data.data && response.data.data[0] && response.data.data[0].embedding) {
                return response.data.data[0].embedding;
            }
            return null;
        }
        catch (error) {
            logger_1.default.warn(`[GLM] Embedding generation failed: ${this.safeErrorMessage(error)}`);
            return null;
        }
    }
    /**
     * Generate a specific event label for a single news event.
     * Used for individual article clustering with trend direction.
     */
    async generateEventLabel(input) {
        if (!this.canUseService()) {
            return null;
        }
        const title = (input.title || '').trim();
        if (!title)
            return null;
        const prompt = `You are a financial news analyst for a crypto/perps trading dashboard.

Analyze this headline and extract specific event details.

HEADLINE: ${title}
CATEGORY: ${input.category || 'UNKNOWN'}
TAGS: ${(input.tags || []).slice(0, 5).join(', ') || 'none'}

REQUIREMENTS:
1. topic: 3-8 words, MUST be human-readable with proper spacing (NO underscores)
   - Include PRIMARY ENTITY (specific company, person, country, crypto token)
   - Include SPECIFIC ACTION (what is happening)
   - Use Title Case for readability
   - Good examples:
     * "Spot Bitcoin ETF Approval"
     * "Federal Reserve Rate Hike to 5.25%"
     * "Binance $400M Security Breach"
     * "Milei Argentina Election Victory"
   - Bad examples (avoid):
     * "price action", "latest news", "market update"
     * "bitcoin_etf" (underscores, not human-readable)
     * "btc breaks 100k" (abbreviations, unclear)

2. subEventType: specific action category
   Options: seizure|approval|launch|hack|announcement|sanction|regulation|
            earnings|price_surge|price_drop|breakout|partnership|listing|
            delisting|merger|acquisition|proposal|ruling|protest|conflict|other

3. trendDirection: is this bullish or bearish for markets?
   UP: price surges, approvals, launches, partnerships, listings, breakthroughs
   DOWN: hacks, sanctions, delistings, crashes, bans, conflicts
   NEUTRAL: announcements, general news, scheduled events

4. urgency: how time-sensitive is this?
   CRITICAL: breaking major developments, immediate market impact
   HIGH: significant news, scheduled events, data releases
   MEDIUM: analysis, secondary coverage
   LOW: retrospective, evergreen content

5. keywords: 4-7 specific entities and terms (short, searchable, space-separated)
   - Good: ["spot ETF", "Bitcoin", "SEC approval", "institutional flows"]
   - Bad: ["spot_etf", "btc", "sec", "flows"] (abbreviated, unclear)

Return JSON ONLY:
{
  "topic": "...",
  "subEventType": "...",
  "trendDirection": "UP|DOWN|NEUTRAL",
  "urgency": "CRITICAL|HIGH|MEDIUM|LOW",
  "keywords": ["...", "..."]
}`;
        try {
            const raw = await this.callAPI(prompt, 1, this.labelingModel, 0.3);
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match)
                return null;
            const parsed = JSON.parse(match[0]);
            const topic = String(parsed.topic || '').trim();
            const subEventType = String(parsed.subEventType || 'other').toLowerCase();
            const trendDirection = parsed.trendDirection?.toUpperCase();
            const urgency = parsed.urgency?.toUpperCase();
            if (!topic || !['UP', 'DOWN', 'NEUTRAL'].includes(trendDirection || '')) {
                return null;
            }
            return {
                topic,
                subEventType: validateSubEventType(subEventType),
                trendDirection: trendDirection,
                urgency: validateUrgency(urgency),
                keywords: Array.isArray(parsed.keywords)
                    ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 7)
                    : [],
            };
        }
        catch (error) {
            logger_1.default.warn(`[GLM] Event label generation failed: ${this.safeErrorMessage(error)}`);
            return null;
        }
    }
    /**
     * Generate a broad-but-specific trend label for a cluster of related news.
     * Returns null if GLM is not configured.
     */
    async generateNewsTrendLabel(input) {
        if (!this.canUseService()) {
            return null;
        }
        const titles = (input.titles || []).map(t => t.trim()).filter(Boolean).slice(0, 12);
        if (titles.length === 0)
            return null;
        const prompt = `You label real-time market/news trends for a crypto trader.

Given these related headlines, produce ONE broad-but-specific trend label that would make sense on a market heatmap.

Rules:
- Topic: 3-8 words, plain text, Title Case, proper spacing, no underscores
- Must include the key entity/entities AND what is happening
- Good examples:
  * "Spot Bitcoin ETF Approval"
  * "Federal Reserve Rate Decision"
  * "US China Trade Tensions"
- Bad examples (avoid):
  * "btc_etf" (underscores, abbreviations)
  * "market news" (too vague)
  * "price action" (not specific)
- Summary: 1 sentence, trader-focused
- Keywords: 4-8 short tokens (entities + key terms), space-separated

Category hint: ${input.category || 'UNKNOWN'}
Tag hint: ${(input.tags || []).slice(0, 10).join(', ') || 'none'}

Headlines:
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Return JSON ONLY:
{
  "topic": "...",
  "summary": "...",
  "keywords": ["...", "..."]
}`;
        try {
            const raw = await this.callAPI(prompt, 2, this.labelingModel, 0.3);
            const match = raw.match(/\{[\s\S]*\}/);
            if (!match)
                return null;
            const parsed = JSON.parse(match[0]);
            if (!parsed?.topic || !parsed?.summary)
                return null;
            return {
                topic: String(parsed.topic).trim(),
                summary: String(parsed.summary).trim(),
                keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map((k) => String(k).trim()).filter(Boolean) : [],
            };
        }
        catch (error) {
            logger_1.default.warn(`[GLM] Trend label generation failed: ${this.safeErrorMessage(error)}`);
            return null;
        }
    }
    /**
     * Generate text using GLM (public method for agent tools)
     * @param prompt - The prompt to send
     * @param temperature - Temperature for generation (default 0.7)
     */
    async generateText(prompt, temperature = 0.7) {
        if (!this.canUseService()) {
            throw new Error('GLM service not configured');
        }
        return await this.callAPI(prompt, 2, undefined, temperature);
    }
}
exports.GLMAIService = GLMAIService;
// Singleton instance
const glmService = new GLMAIService();
exports.default = glmService;
function validateSubEventType(value) {
    const validTypes = [
        'seizure', 'approval', 'launch', 'hack', 'announcement', 'sanction',
        'regulation', 'earnings', 'price_surge', 'price_drop', 'breakout',
        'partnership', 'listing', 'delisting', 'merger', 'acquisition',
        'proposal', 'ruling', 'protest', 'conflict', 'other'
    ];
    return validTypes.includes(value) ? value : 'other';
}
function validateUrgency(value) {
    if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(value)) {
        return value;
    }
    return 'MEDIUM';
}
//# sourceMappingURL=glm-service.js.map