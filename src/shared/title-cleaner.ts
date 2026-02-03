// Title Cleaner
// Normalizes news titles by removing clickbait, ALL-CAPS, sensationalism
// Returns cleaned title with quality score (0-1)
//
// Enhanced: Now includes market-enriched title generation with numerical context

// Re-export enhanced title system
export {
  generateEnhancedTitle,
  quickGenerateTitle,
  generateTitleWithMarketContext,
  scoreTitleQuality,
} from './market-title-generator';

export {
  extractNumericalEntities,
  getPrimaryPrice,
  getPrimaryPercentage,
  getPrimaryAmount,
  formatPrice,
  formatPercentage,
} from './numerical-extractor';

export {
  formatTitle,
  normalizeAssetName,
  getAssetTicker,
  calculateTitleMetrics,
  detectActionWord,
  detectTrendDirection,
  detectEventType,
} from './title-formatter';

export type {
  EnhancedTitle,
  TitleFormats,
  TitleMetrics,
  NumericalEntity,
  MarketContext,
  SubEventType,
} from './types';

const CLICKBAIT_PATTERNS = [
  /\b(you won't believe|you won't|you'll never believe|shocking|astonishing|unbelievable|mind-blowing|jaw-dropping)\b/gi,
  /\b(this will blow your mind|this just in|must read|breaking news|urgent|emergency|just now)\b/gi,
  /\b(\d+ reasons? you'll|\d+ things? that|\d+ ways? to|top \d+|best \d+|worst \d+)\b/gi,
  /\b(secret|hidden|exposed|revealed|uncovered|they don't want you to know|what happened next)\b/gi,
  /\b(bombshell|earth-shattering|history in the making|game changer|paradigm shift)\b/gi,
  /\b(sponsored|ad\)|advertisement|promo)\b/gi,
];

const SOURCE_PREFIXES = [
  /^(breaking:\s*)/i,
  /^(urgent:\s*)/i,
  /^(alert:\s*)/i,
  /^(just in:\s*)/i,
  /^(update:\s*)/i,
  /^(developing:\s*)/i,
  /^(report:\s*)/i,
];

const TRAILING_PATTERNS = [
  /\s+[-–—]\s*(you won't believe|read more|click here|find out more)\s*$/gi,
  /\s+[-–—]\s*\w+\s*$/, // Remove trailing "- SourceName"
  /\s+[\|\-]{2,}\s*\w+$/, // Remove "|| SourceName" or "-- SourceName"
];

const EXCESSIVE_PUNCTUATION = /([!?]){3,}/g; // More than 2 of the same punctuation
const ALL_CAPS_WORDS_THRESHOLD = 0.6; // If 60%+ of words are ALL CAPS
const MIN_TITLE_LENGTH = 15;
const MAX_TITLE_LENGTH = 200;

interface CleanedTitle {
  title: string;
  qualityScore: number;
  flags: string[];
}

/**
 * Clean and normalize a news title
 */
export function cleanTitle(title: string): CleanedTitle {
  const original = title.trim();
  const flags: string[] = [];
  let cleaned = original;

  // 1. Remove source prefixes
  for (const prefix of SOURCE_PREFIXES) {
    if (prefix.test(cleaned)) {
      flags.push('source_prefix');
      cleaned = cleaned.replace(prefix, '');
      break;
    }
  }

  // 2. Remove trailing patterns
  for (const pattern of TRAILING_PATTERNS) {
    if (pattern.test(cleaned)) {
      flags.push('trailing_pattern');
      cleaned = cleaned.replace(pattern, '');
    }
  }

  // 3. Normalize excessive punctuation
  if (EXCESSIVE_PUNCTUATION.test(cleaned)) {
    flags.push('excessive_punctuation');
    cleaned = cleaned.replace(EXCESSIVE_PUNCTUATION, '$1');
  }

  // 4. Detect and normalize ALL-CAPS titles
  const words = cleaned.split(/\s+/);
  const allCapsWords = words.filter(w => w.length > 1 && w === w.toUpperCase() && !/[0-9]/.test(w));
  const allCapsRatio = allCapsWords.length / Math.max(words.length, 1);

  if (allCapsRatio >= ALL_CAPS_WORDS_THRESHOLD) {
    flags.push('all_caps');
    // Convert to title case (smart capitalization)
    cleaned = toTitleCase(cleaned);
  }

  // 5. Detect clickbait patterns
  let clickbaitScore = 0;
  for (const pattern of CLICKBAIT_PATTERNS) {
    if (pattern.test(cleaned)) {
      clickbaitScore++;
    }
  }
  if (clickbaitScore >= 2) {
    flags.push('clickbait_heavy');
  } else if (clickbaitScore >= 1) {
    flags.push('clickbait_light');
  }

  // 6. Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 7. Remove leading/trailing punctuation
  cleaned = cleaned.replace(/^[^\w]+|[^\w]+$/g, '');

  // 8. Truncate if too long
  if (cleaned.length > MAX_TITLE_LENGTH) {
    flags.push('too_long');
    cleaned = cleaned.substring(0, MAX_TITLE_LENGTH - 3) + '...';
  }

  // Calculate quality score (0-1)
  let qualityScore = 1.0;

  // Deduct for flags
  qualityScore -= flags.includes('clickbait_heavy') ? 0.4 : 0;
  qualityScore -= flags.includes('clickbait_light') ? 0.15 : 0;
  qualityScore -= flags.includes('all_caps') ? 0.1 : 0;
  qualityScore -= flags.includes('excessive_punctuation') ? 0.1 : 0;
  qualityScore -= flags.includes('source_prefix') ? 0.05 : 0;
  qualityScore -= flags.includes('too_long') ? 0.1 : 0;

  // Length-based scoring
  if (cleaned.length < MIN_TITLE_LENGTH) {
    qualityScore -= 0.3;
    flags.push('too_short');
  }

  // Ensure score is in [0, 1]
  qualityScore = Math.max(0, Math.min(1, qualityScore));

  return {
    title: cleaned,
    qualityScore,
    flags,
  };
}

/**
 * Convert string to title case (smart capitalization)
 */
function toTitleCase(str: string): string {
  const smallWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'so', 'yet',
    'at', 'by', 'in', 'of', 'on', 'to', 'up', 'from', 'with', 'as',
  ]);

  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      // Always capitalize first word
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      // Keep small words lowercase unless they're the last word
      if (smallWords.has(word) && index !== str.split(/\s+/).length - 1) {
        return word;
      }
      // Capitalize everything else
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Check if a title is likely SEO spam or low quality
 */
export function isLikelySpam(title: string): boolean {
  const lower = title.toLowerCase();

  // Check for excessive special characters
  const specialCharRatio = (title.match(/[^\w\s]/g) || []).length / title.length;
  if (specialCharRatio > 0.3) return true;

  // Check for excessive numbers (listicles)
  const numberCount = (title.match(/\d/g) || []).length;
  if (numberCount > 5) return true;

  // Check for repetitive patterns
  const words = lower.split(/\s+/);
  const uniqueWords = new Set(words);
  if (words.length > 5 && uniqueWords.size / words.length < 0.5) return true;

  // Check for certain spam keywords
  const spamKeywords = [
    'click here', 'subscribe now', 'buy now', 'limited time',
    'you won\'t believe', 'this one trick', 'doctors hate',
  ];
  for (const keyword of spamKeywords) {
    if (lower.includes(keyword)) return true;
  }

  return false;
}

/**
 * Deduplicate similar titles (simple Jaccard similarity)
 */
export function areTitlesSimilar(title1: string, title2: string, threshold = 0.7): boolean {
  const words1 = new Set(title1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(title2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return false;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size >= threshold;
}

/**
 * Create a normalized title fingerprint for exact duplicate detection.
 * Normalizes: lowercase, removes punctuation, extra whitespace, certain stop words.
 * Returns a hashable string suitable for comparing exact duplicates.
 */
export function getTitleFingerprint(title: string): string {
  if (!title) return '';

  return title
    .toLowerCase()
    // Remove common source prefixes that might differ
    .replace(/^(breaking|urgent|alert|just in|update|developing|report):\s*/i, '')
    // Remove trailing source names
    .replace(/\s[-–—]\s*(you won't believe|read more|click here|find out more)\s*$/gi, '')
    .replace(/\s+[-–—]\s+\w+\s*$/, '') // Remove trailing "- SourceName"
    // Normalize punctuation and whitespace
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Check if two titles are exact duplicates (after normalization).
 * Stricter than areTitlesSimilar - for catching syndicated content.
 */
export function isExactDuplicate(title1: string, title2: string): boolean {
  const fp1 = getTitleFingerprint(title1);
  const fp2 = getTitleFingerprint(title2);
  return fp1 === fp2 && fp1.length > 10; // Minimum length to avoid false positives
}

/**
 * Patterns for non-market-moving content that should be filtered out.
 * These are typically syndicated general interest pieces that don't affect trading.
 */
const NON_MARKET_PATTERNS = [
  // Fact check / general reporting
  /^fact check\s+(team|team:)?/i,
  /\bfact check\b/i,
  // Generic exploring / reviewing without specific entities
  /^exploring\s+(?!bitcoin|ethereum|crypto|stock|market|fed|sec)/i,
  /^reviewing\s+/i,
  /^discussing\s+/i,
  // Non-specific local news patterns
  /^your\s+(morning|afternoon|evening)\s+/i,
  /^daily\s+(briefing|digest|summary|update)/i,
  // Community calendar type content
  /^community\s+(calendar|events|spotlight)/i,
  /^school\s+(closings|delays|menu)/i,
  // Weather
  /^weather\s+(alert|update|forecast)/i,
  /^((first|latest)?\s*)?weather\d*$/i,
  // Sports scores/recaps without market impact
  /^\d+\/\d+\s+score/i,
  /^final:\s+\d+/i,
  // Generic lifestyle content
  /^(healthy|tasty|easy)\s+(living|cooking|eating|meals)/i,
];

/**
 * Check if a title represents non-market-moving content that should be filtered.
 * Returns true for content that adds noise without trading value.
 */
export function isNonMarketMoving(title: string): boolean {
  if (!title) return false;

  const lower = title.toLowerCase();

  // Check against known patterns
  for (const pattern of NON_MARKET_PATTERNS) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  // Check for "Fact Check Team:" specifically (the example issue)
  if (lower.startsWith('fact check team:')) {
    return true;
  }

  // Check for generic "Exploring" titles without specific entities
  // that suggest non-market content
  if (/^(exploring|reviewing|discussing|examining)\s+/i.test(title)) {
    // Allow if it contains market-relevant keywords
    const marketKeywords = /\b(bitcoin|ethereum|crypto|btc|eth|defi|nft|web3|stock|market|fed|sec|inflation|recession|earnings|merger|acquisition|ipo|etf)\b/i;
    if (!marketKeywords.test(title)) {
      return true;
    }
  }

  return false;
}
