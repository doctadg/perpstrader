// Language Detection Filter
// Fast language detection using character patterns and keywords

// Common non-English character patterns
const NON_ENGLISH_PATTERNS = {
  spanish: /[áéíóúüñ¿¡]/i,
  french: /[àâäéèêëïîôùûüç]/i,
  german: /[äöüß]/i,
  italian: /[àèéìòù]/i,
  portuguese: /[ãõáéíóú]/i,
  russian: /[а-яё]/i,
  chinese: /[\u4e00-\u9fff]/,
  japanese: /[\u3040-\u309f\u30a0-\u30ff]/,
  korean: /[\uac00-\ud7af]/,
  arabic: /[\u0600-\u06ff]/,
  thai: /[\u0e00-\u0e7f]/,
};

// Common non-English words at the start of articles
const NON_ENGLISH_START_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'uno', // Spanish
  'le', 'la', 'les', 'un', 'une', 'des', // French
  'der', 'die', 'das', 'ein', 'eine', // German
  'il', 'lo', 'la', 'uno', 'una', // Italian
  'o', 'a', 'os', 'as', 'um', 'uma', // Portuguese
  'estas', 'este', 'estos', 'estas', // Spanish
]);

// Common English start words for comparison
const ENGLISH_START_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'us', 'uk', 'new', 'breaking', 'update', 'report',
  'bitcoin', 'ethereum', 'crypto', 'stock', 'market',
  'federal', 'reserve', 'sec', 'congress', 'president',
]);

/**
 * Detect the primary language of a text
 * Returns ISO 639-1 language code ('en', 'es', 'fr', etc.)
 */
export function detectLanguage(text: string): string {
  if (!text || text.length < 10) {
    return 'en'; // Default to English for very short text
  }

  const sample = text.slice(0, 500); // Check first 500 chars
  const lower = sample.toLowerCase();

  // Check for non-Latin scripts first (fast detection)
  if (NON_ENGLISH_PATTERNS.chinese.test(sample)) return 'zh';
  if (NON_ENGLISH_PATTERNS.japanese.test(sample)) return 'ja';
  if (NON_ENGLISH_PATTERNS.korean.test(sample)) return 'ko';
  if (NON_ENGLISH_PATTERNS.russian.test(sample)) return 'ru';
  if (NON_ENGLISH_PATTERNS.arabic.test(sample)) return 'ar';
  if (NON_ENGLISH_PATTERNS.thai.test(sample)) return 'th';

  // Check for specific European language characters
  if (NON_ENGLISH_PATTERNS.german.test(sample)) {
    // Could be German, but verify it's not just borrowed words
    const germanMatchCount = (sample.match(/ß|und|der|die|das|ein/eine/gi) || []).length;
    if (germanMatchCount >= 2) return 'de';
  }

  if (NON_ENGLISH_PATTERNS.spanish.test(sample)) {
    const spanishMatchCount = (sample.match(/¿|¡|el|la|los|las|y|o/gi) || []).length;
    if (spanishMatchCount >= 3) return 'es';
  }

  if (NON_ENGLISH_PATTERNS.french.test(sample)) {
    const frenchMatchCount = (sample.match(/le|la|les|des|et|en/gi) || []).length;
    if (frenchMatchCount >= 3) return 'fr';
  }

  if (NON_ENGLISH_PATTERNS.portuguese.test(sample)) {
    const portugueseMatchCount = (sample.match(/ã|õ|o|a|os|as|em/gi) || []).length;
    if (portugueseMatchCount >= 3) return 'pt';
  }

  if (NON_ENGLISH_PATTERNS.italian.test(sample)) {
    const italianMatchCount = (sample.match(/il|lo|la|un|uno|una|di/gi) || []).length;
    if (italianMatchCount >= 3) return 'it';
  }

  // Check first word of title/article
  const words = sample.split(/\s+/).slice(0, 5);
  const firstWord = words[0]?.toLowerCase().replace(/[^a-z]/g, '');

  if (firstWord && NON_ENGLISH_START_WORDS.has(firstWord)) {
    // Need to disambiguate from false positives (e.g., "la" could be "Los Angeles")
    // Check for multiple non-English indicators
    let nonEnglishIndicators = 0;

    for (const word of words.slice(0, 10)) {
      const clean = word.toLowerCase().replace(/[^a-z]/g, '');
      if (NON_ENGLISH_START_WORDS.has(clean)) {
        nonEnglishIndicators++;
      }
    }

    if (nonEnglishIndicators >= 2) {
      // Determine which language based on character patterns
      if (NON_ENGLISH_PATTERNS.spanish.test(sample)) return 'es';
      if (NON_ENGLISH_PATTERNS.french.test(sample)) return 'fr';
      if (NON_ENGLISH_PATTERNS.german.test(sample)) return 'de';
      if (NON_ENGLISH_PATTERNS.italian.test(sample)) return 'it';
      if (NON_ENGLISH_PATTERNS.portuguese.test(sample)) return 'pt';
    }
  }

  // Default to English
  return 'en';
}

/**
 * Check if text is primarily English
 */
export function isEnglish(text: string): boolean {
  return detectLanguage(text) === 'en';
}

/**
 * Get confidence score for English detection (0-1)
 */
export function englishConfidence(text: string): number {
  if (!text || text.length < 10) return 0.5;

  const lang = detectLanguage(text);
  if (lang === 'en') return 0.9;

  // Check for mixed content (some English but mostly other language)
  const words = text.toLowerCase().split(/\s+/);
  let englishWords = 0;

  for (const word of words.slice(0, 50)) {
    if (ENGLISH_START_WORDS.has(word.replace(/[^a-z]/g, ''))) {
      englishWords++;
    }
  }

  return englishWords / Math.min(words.length, 50);
}
