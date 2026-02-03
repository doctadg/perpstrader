// Topic Generation Node
// Generates topics with EXTREMELY strict validation
// Rejects: truncated topics, incomplete sentences, missing entities

import { NewsAgentState, LabeledArticle, FilteredArticle } from '../state';
import logger from '../../shared/logger';
import openrouterService from '../../shared/openrouter-service';

/**
 * Reject patterns for topic validation
 */
const REJECT_PATTERNS = [
  // Truncated topics (ends abruptly)
  /\w\s+On$/,            // "Lists On", "Acquires On"
  /\w+$/,                // Single word

  // Incomplete sentences
  /^(ETH|BTC|ADA|SOL|DOT|LINK)\s*:\s*\w+$/i,  // "ETH: And" (incomplete after colon)
  /^(Acquires|Lists|Launches|Reports|Says)/i,  // Missing subject

  // Generic filler
  /price (today|now|watch|update)/i,
  /market (update|news|report|watch)/i,
  /daily (update|recap)/i,
  /breaking (news|update)/i,

  // Percent-only (no context)
  /^\d+%\s*(To|At)?\s*$/i,
  /^\d+%%\s*$/,

  // Placeholder text
  /\[.*\]/,              // "[TICKER]"
  /\.\.\.$/,             // Ends with ellipsis
  /^More$/i,
  /^Continues?$/i,
];

/**
 * Valid action verbs that indicate a real event
 */
const VALID_ACTIONS = new Set([
  'approves', 'approved', 'approval',
  'rejects', 'rejected', 'rejection',
  'launches', 'launched', 'launch',
  'announces', 'announced', 'announcement',
  'reports', 'reported', 'reporting',
  'hacks', 'hacked', 'breach', 'breached',
  'bans', 'banned', 'ban',
  'adopts', 'adopted', 'adoption',
  'proposes', 'proposed', 'proposal',
  'passes', 'passed', 'passing',
  'raises', 'raised', 'raise',
  'lowers', 'lowered', 'lower',
  'cuts', 'cut', 'cutting',
  'increases', 'increased', 'increase',
  'decreases', 'decreased', 'decrease',
  'buys', 'bought', 'buying',
  'sells', 'sold', 'selling',
  'acquires', 'acquired', 'acquisition',
  'merges', 'merged', 'merger',
  'lists', 'listed', 'listing',
  'delists', 'delisted', 'delisting',
  'files', 'filed', 'filing',
  'sues', 'sued', 'suing',
  'wins', 'won', 'winning',
  'loses', 'lost', 'losing',
  'beats', 'beat', 'beating',
  'misses', 'missed', 'missing',
  'exceeds', 'exceeded', 'exceed',
  'falls', 'fell', 'falling',
  'rises', 'rose', 'rising',
  'drops', 'dropped', 'dropping',
  'jumps', 'jumped', 'jumping',
  'slumps', 'slumped', 'slumping',
  'soars', 'soared', 'soaring',
  'plunges', 'plunged', 'plunging',
  'recovers', 'recovered', 'recovery',
  'crashes', 'crashed', 'crashing',
]);

/**
 * Topic Generation Node
 * Generates topics with strict validation for categorized articles
 */
export async function topicGenerationNode(state: NewsAgentState): Promise<Partial<NewsAgentState>> {
  const startTime = Date.now();
  logger.info(`[TopicGenerationNode] Starting topic generation for ${state.labeledArticles.length} articles`);

  const labeledArticles: LabeledArticle[] = [];
  let generated = 0;
  let skipped = 0;

  for (const article of state.labeledArticles) {
    try {
      // Check if article already has a valid topic from categorization
      if (article.topic && article.topic.length > 5) {
        // Validate existing topic
        const validation = validateTopic(article.topic, article.title);

        if (validation.valid) {
          // Existing topic is good, use it
          labeledArticles.push(article);
          generated++;
          continue;
        }
      }

      // Generate new topic (article might be a FilteredArticle without topic yet)
      const filterArticle = article as FilteredArticle;
      const topicResult = await generateTopic(filterArticle);

      if (topicResult && topicResult.topic) {
        // Validate the generated topic
        const validation = validateTopic(topicResult.topic, article.title);

        if (validation.valid) {
          labeledArticles.push({
            ...article,
            topic: topicResult.topic,
            subEventType: topicResult.subEventType || article.subEventType || 'other',
            trendDirection: topicResult.trendDirection || article.trendDirection || 'NEUTRAL',
            urgency: topicResult.urgency || article.urgency || 'MEDIUM',
            keywords: topicResult.keywords || article.keywords || [],
          });
          generated++;
        } else {
          logger.debug(`[TopicGenerationNode] Rejected topic "${topicResult.topic}": ${validation.reason}`);
          skipped++;

          // Still include the article with a fallback topic
          labeledArticles.push({
            ...article,
            topic: generateFallbackTopic(article),
            subEventType: article.subEventType || 'other',
          });
        }
      } else {
        skipped++;

        // Include with fallback topic
        labeledArticles.push({
          ...article,
          topic: generateFallbackTopic(article),
        });
      }

    } catch (error) {
      logger.debug(`[TopicGenerationNode] Error generating topic for article "${article.title}": ${error}`);
      skipped++;

      // Include with fallback topic on error
      labeledArticles.push({
        ...article,
        topic: generateFallbackTopic(article),
      });
    }
  }

  const elapsed = Date.now() - startTime;
  logger.info(
    `[TopicGenerationNode] Completed in ${elapsed}ms. ` +
    `Generated: ${generated}, Skipped: ${skipped}`
  );

  return {
    currentStep: 'TOPIC_GENERATION_COMPLETE',
    labeledArticles,
    stats: {
      ...state.stats,
      labeled: generated,
    },
    thoughts: [
      ...state.thoughts,
      `Topic generation: ${generated} topics generated, ${skipped} used fallbacks`,
    ],
  };
}

/**
 * Generate a topic for an article using LLM
 */
async function generateTopic(article: FilteredArticle): Promise<{
  topic: string;
  subEventType: string;
  trendDirection: 'UP' | 'DOWN' | 'NEUTRAL';
  urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  keywords: string[];
} | null> {
  try {
    const prompt = buildTopicPrompt(article);

    // Use axios directly for topic generation
    const axios = (await import('axios')).default;
    const config = (await import('../../shared/config')).default.get();

    const response = await axios.post(
      `${config.openrouter.baseUrl}/chat/completions`,
      {
        model: 'openai/gpt-oss-20b',
        messages: [
          {
            role: 'system',
            content: TOPIC_GENERATION_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openrouter.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://perps-trader.ai',
          'X-Title': 'PerpsTrader News System',
        },
        timeout: config.openrouter.timeout,
      }
    );

    if (!response.data?.choices?.[0]?.message?.content) {
      return null;
    }

    return parseTopicResponse(response.data.choices[0].message.content, article);

  } catch (error) {
    logger.debug(`[TopicGenerationNode] LLM request failed: ${error}`);
    return null;
  }
}

/**
 * Build prompt for topic generation
 */
function buildTopicPrompt(article: FilteredArticle): string {
  return `Generate a topic for this news article:

Title: ${article.title}
Source: ${article.source}
Published: ${article.publishedAt}
Category: ${article.categories?.[0] || 'UNKNOWN'}
Content Preview: ${article.content?.slice(0, 300) || article.snippet || ''}

Respond with JSON ONLY:
{
  "topic": "Entity Action (3-8 words, Title Case)",
  "subEventType": "earnings|regulation|hack|launch|military|political|other",
  "trendDirection": "UP" | "DOWN" | "NEUTRAL",
  "urgency": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;
}

/**
 * Parse LLM response for topic result
 */
function parseTopicResponse(content: string, article: FilteredArticle): any {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      topic: parsed.topic || '',
      subEventType: parsed.subEventType || 'other',
      trendDirection: ['UP', 'DOWN', 'NEUTRAL'].includes(parsed.trendDirection)
        ? parsed.trendDirection
        : 'NEUTRAL',
      urgency: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(parsed.urgency)
        ? parsed.urgency
        : 'MEDIUM',
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 7) : [],
    };

  } catch (error) {
    logger.debug(`[TopicGenerationNode] Failed to parse topic response: ${error}`);
    return null;
  }
}

/**
 * Validate a topic against strict quality rules
 */
function validateTopic(topic: string, articleTitle: string): { valid: boolean; reason?: string } {
  if (!topic || topic.length < 5) {
    return { valid: false, reason: 'Topic too short' };
  }

  // Check against reject patterns
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(topic)) {
      return { valid: false, reason: `Matches reject pattern` };
    }
  }

  // Must have Entity + Action structure
  const entityActionMatch = topic.match(/^([A-Z][a-zA-Z0-9&]+(?:\s+[A-Z][a-zA-Z0-9&]+)*)\s+([A-Z][a-z]+.+)$/);

  if (!entityActionMatch) {
    return { valid: false, reason: 'Missing Entity + Action structure' };
  }

  const [, entity, action] = entityActionMatch;

  // Entity must be at least 2 characters
  if (entity.length < 2) {
    return { valid: false, reason: 'Entity too short' };
  }

  // Action must be at least 4 characters
  if (action.length < 4) {
    return { valid: false, reason: 'Action too short' };
  }

  // Action should be a valid action verb or phrase
  const actionWords = action.toLowerCase().split(/\s+/);
  const firstActionWord = actionWords[0];

  if (!VALID_ACTIONS.has(firstActionWord) && actionWords.length < 3) {
    // If action is short, it should be a recognized verb
    return { valid: false, reason: 'Action not a recognized verb' };
  }

  // Must share at least one meaningful word with article title (not hallucinated)
  const titleWords = new Set(
    articleTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  );
  const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const overlap = topicWords.filter(w => titleWords.has(w));

  if (overlap.length === 0) {
    return { valid: false, reason: 'Topic shares no words with title (hallucinated)' };
  }

  // Topic should be between 5 and 80 characters
  if (topic.length > 80) {
    return { valid: false, reason: 'Topic too long' };
  }

  // Check for double percent bug (e.g., "7%%")
  if (topic.includes('%%')) {
    return { valid: false, reason: 'Contains double percent' };
  }

  return { valid: true };
}

/**
 * Generate a fallback topic from article title
 */
function generateFallbackTopic(article: LabeledArticle | FilteredArticle): string {
  let topic = article.title;

  // Remove common prefixes
  topic = topic.replace(/^(Breaking|UPDATE|JUST IN|ALERT|NEWS):?\s*/i, '');
  topic = topic.replace(/^\d+\.\s*/, '');
  topic = topic.replace(/\s*-\s*(Source|Reuters|Bloomberg|AP|AFP).*$/i, '');
  topic = topic.replace(/\s*\|.*$/, '');

  // Capitalize properly
  topic = topic.replace(/\b\w+/g, word => {
    const lower = word.toLowerCase();
    // Capitalize important words
    if (['btc', 'eth', 'usd', 'fed', 'sec', 'ceo', 'cfo', 'ai', 'gdp', 'cpi'].includes(lower)) {
      return lower.toUpperCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  // Limit length
  if (topic.length > 80) {
    topic = topic.substring(0, 77) + '...';
  }

  return topic || 'Market News';
}

/**
 * System prompt for topic generation
 */
const TOPIC_GENERATION_SYSTEM_PROMPT = `You are a financial news analyst for PERPETUAL TRADERS.

Generate PRECISE, ACTIONABLE topics for market news.

CRITICAL RULES:
1. Entity: Must be a specific company, token, person, or organization
2. Action: What happened (verb: Approves, Hacks, Launches, Reports, etc.)
3. Format: "Entity Action" in Title Case
4. 3-8 words maximum
5. Must be based on facts from the article

GOOD examples:
✓ "Bitcoin Spot ETF Approval by SEC"
✓ "Federal Reserve Raises Interest Rates"
✓ "Binance Security Breach"
✓ "Tesla Q4 Earnings Beat"

BAD examples (REJECT):
✗ "BTC Lists On" (incomplete)
✗ "Acquires BTC" (missing subject)
✗ "Price Surges 7%" (no entity)
✗ "Market Update" (too generic)
✗ "Breaking: Big News" (not specific)

If the article doesn't contain enough specific information to create a quality topic, return:
{ "skip": true, "reason": "insufficient_specific_information" }

Respond with valid JSON only.`;
