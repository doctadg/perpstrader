"use strict";
// Quality Filter Node
// Second layer of filtering with LLM validation
// Filters out: sports in wrong category, non-market content, low-quality articles
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
exports.qualityFilterNode = qualityFilterNode;
const state_1 = require("../state");
const logger_1 = __importDefault(require("../../shared/logger"));
const language_1 = require("../../shared/filters/language");
const quality_1 = require("../../shared/filters/quality");
/**
 * Quality Filter Node
 * Applies LLM-based quality gate to raw scraped articles
 */
async function qualityFilterNode(state) {
    const startTime = Date.now();
    logger_1.default.info('[QualityFilterNode] Starting quality filter gate');
    const filteredArticles = [];
    let filteredLanguage = 0;
    let filteredQuality = 0;
    let filteredCategory = 0;
    for (const article of state.rawArticles) {
        try {
            // Step 1: Language detection (fast fail)
            const language = article.language || (0, language_1.detectLanguage)(article.title + ' ' + article.content);
            if (language !== 'en') {
                filteredLanguage++;
                logger_1.default.debug(`[QualityFilterNode] Filtered non-English article: ${article.title} (lang: ${language})`);
                continue;
            }
            // Step 2: Quality score check
            const qualityScore = (0, quality_1.calculateQualityScore)(article.title, article.content);
            if (qualityScore < 0.3) {
                filteredQuality++;
                logger_1.default.debug(`[QualityFilterNode] Filtered low-quality article: ${article.title} (score: ${qualityScore.toFixed(2)})`);
                continue;
            }
            // Step 3: LLM quality gate for market relevance
            const gateResult = await applyQualityGate(article);
            if (!gateResult.passes) {
                if (gateResult.isSports && !state_1.EXCLUDED_CATEGORIES.some(c => state.categories.includes(c))) {
                    filteredCategory++;
                }
                else {
                    filteredQuality++;
                }
                logger_1.default.debug(`[QualityFilterNode] Filtered article: ${article.title} (${gateResult.reasons.join(', ')})`);
                continue;
            }
            // Article passed all filters
            const filteredArticle = {
                ...article,
                qualityScore,
                isEnglish: true,
                passedFirstFilter: true,
                filterReasons: [],
            };
            filteredArticles.push(filteredArticle);
        }
        catch (error) {
            logger_1.default.debug(`[QualityFilterNode] Error processing article: ${error}`);
            // On error, be conservative and include the article
            filteredArticles.push({
                ...article,
                qualityScore: 0.5,
                isEnglish: true,
                passedFirstFilter: true,
            });
        }
    }
    const elapsed = Date.now() - startTime;
    logger_1.default.info(`[QualityFilterNode] Completed in ${elapsed}ms. ` +
        `Passed: ${filteredArticles.length}/${state.rawArticles.length}, ` +
        `Filtered: ${filteredLanguage} language, ${filteredQuality} quality, ${filteredCategory} category`);
    return {
        currentStep: 'QUALITY_FILTER_COMPLETE',
        filteredArticles,
        stats: {
            ...state.stats,
            filteredLanguage,
            filteredQuality,
            filteredCategory,
            totalRejected: filteredLanguage + filteredQuality + filteredCategory,
        },
        thoughts: [
            ...state.thoughts,
            `Quality filter: ${filteredArticles.length}/${state.rawArticles.length} articles passed`,
            `Rejected: ${filteredLanguage} non-English, ${filteredQuality} low quality, ${filteredCategory} wrong category`,
        ],
    };
}
/**
 * Apply LLM-based quality gate to an article
 * Evaluates market relevance and content appropriateness
 */
async function applyQualityGate(article) {
    try {
        // Build a concise prompt for quality evaluation
        const prompt = buildQualityGatePrompt(article);
        // Use axios directly for quality gate evaluation
        const axios = (await Promise.resolve().then(() => __importStar(require('axios')))).default;
        const config = (await Promise.resolve().then(() => __importStar(require('../../shared/config')))).default.get();
        const response = await axios.post(`${config.openrouter.baseUrl}/chat/completions`, {
            model: 'openai/gpt-oss-20b',
            messages: [
                {
                    role: 'system',
                    content: QUALITY_GATE_SYSTEM_PROMPT,
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            max_tokens: 500,
            temperature: 0.1,
        }, {
            headers: {
                'Authorization': `Bearer ${config.openrouter.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://perps-trader.ai',
                'X-Title': 'PerpsTrader News System',
            },
            timeout: config.openrouter.timeout,
        });
        if (!response.data?.choices?.[0]?.message?.content) {
            // On API failure, be conservative and pass
            return {
                passes: true,
                reasons: [],
                marketRelevance: 'MEDIUM',
                isSports: false,
            };
        }
        return parseQualityGateResponse(response.data.choices[0].message.content, article);
    }
    catch (error) {
        logger_1.default.debug(`[QualityFilterNode] LLM gate failed for article "${article.title}": ${error}`);
        // On error, be conservative and pass with medium relevance
        return {
            passes: true,
            reasons: [],
            marketRelevance: 'MEDIUM',
            isSports: false,
        };
    }
}
/**
 * Build prompt for quality gate evaluation
 */
function buildQualityGatePrompt(article) {
    return `Evaluate this news article for a PERPETUAL TRADING platform:

Title: ${article.title}
Source: ${article.source}
Published: ${article.publishedAt}
Content Preview: ${article.content?.slice(0, 500) || article.snippet || ''}

Respond with JSON ONLY:
{
  "passes": true/false,
  "reasons": ["reason1", "reason2"],
  "marketRelevance": "HIGH" | "MEDIUM" | "LOW" | "NONE",
  "isSports": true/false,
  "suggestedCategory": "CRYPTO" | "STOCKS" | "ECONOMICS" | "GEOPOLITICS" | null
}`;
}
/**
 * Parse LLM response for quality gate result
 */
function parseQualityGateResponse(content, article) {
    try {
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return { passes: true, reasons: [], marketRelevance: 'MEDIUM', isSports: false };
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            passes: parsed.passes !== false,
            reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
            marketRelevance: ['HIGH', 'MEDIUM', 'LOW', 'NONE'].includes(parsed.marketRelevance)
                ? parsed.marketRelevance
                : 'MEDIUM',
            suggestedCategory: parsed.suggestedCategory,
            isSports: Boolean(parsed.isSports),
        };
    }
    catch (error) {
        logger_1.default.debug(`[QualityFilterNode] Failed to parse quality gate response: ${error}`);
        return { passes: true, reasons: [], marketRelevance: 'MEDIUM', isSports: false };
    }
}
/**
 * System prompt for quality gate evaluation
 */
const QUALITY_GATE_SYSTEM_PROMPT = `You are a content quality evaluator for a PERPETUAL TRADING news platform.

Your job is to evaluate news articles and determine if they are relevant for cryptocurrency and financial traders.

EVALUATION CRITERIA:

1. Market Relevance:
   - HIGH: Direct impact on crypto/stock prices (regulations, hacks, earnings, Fed decisions)
   - MEDIUM: Indirectly relevant (industry trends, general market news)
   - LOW: Tangentially related (tech news, general business)
   - NONE: Not relevant (sports, entertainment, lifestyle)

2. Content Quality:
   - Reject clickbait: "You won't believe...", "Shocking...", etc.
   - Reject spam: Promotional content, excessive ads, low-quality sourcing
   - Reject generic content: "Market update today", "Price watch" without specifics

3. Category Validation:
   - Sports content should NOT be in CRYPTO/STOCKS categories
   - Entertainment should NOT be in trading categories
   - Redirect to appropriate category if misclassified

PASS if:
- Market relevance is MEDIUM or higher
- Content is specific and actionable (has named entities, clear events)
- Not sports/entertainment in a trading category

FAIL if:
- Market relevance is NONE
- Pure sports/entertainment content in trading category
- Clickbait, spam, or promotional content
- Less than 200 characters of actual content
- Non-English content

Respond with valid JSON only.`;
//# sourceMappingURL=quality-filter-node.js.map