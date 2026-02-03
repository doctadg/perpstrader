"use strict";
// Human-Readable Title Formatter
// Converts LLM-generated topics into proper human-readable titles
// Fixes grammar, capitalization, and formatting issues
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatHumanReadableTitle = formatHumanReadableTitle;
exports.isNonEnglishTitle = isNonEnglishTitle;
exports.handleNonEnglishTitle = handleNonEnglishTitle;
exports.validateAndFormatTopic = validateAndFormatTopic;
/**
 * Format a topic into a human-readable title
 * Handles common LLM output issues like poor grammar, weird word order, etc.
 */
function formatHumanReadableTitle(topic, articleTitle) {
    if (!topic || topic.length < 3) {
        return articleTitle || 'Market News';
    }
    let formatted = topic.trim();
    // 1. Fix common grammar patterns
    formatted = fixGrammarPatterns(formatted);
    // 2. Proper capitalization (Title Case)
    formatted = toTitleCase(formatted);
    // 3. Fix spacing issues
    formatted = fixSpacing(formatted);
    // 4. Ensure proper sentence structure
    formatted = fixSentenceStructure(formatted);
    // 5. Clean up any remaining issues
    formatted = cleanupTitle(formatted);
    return formatted;
}
/**
 * Fix common grammar patterns from LLM output
 */
function fixGrammarPatterns(text) {
    // Common replacements for broken patterns
    const replacements = [
        // "Misses X" patterns
        [/^misses\s+(serie|premier|la\s+liga|bundesliga)/i, 'Serie A'],
        [/^misses\s+/i, ''],
        // "Joins X Y agrees Z" -> "X Agrees to Y"
        [/^joins\s+(\w+)\s+(\w+)\s+agrees\s+(\w+)/i, '$1 $2 Agrees to $3'],
        // "Updates X" -> remove if it's just "Updates"
        [/^updates\s+/i, ''],
        // "Signs X" -> "X Signs" or similar
        [/^signs\s+/i, ''],
        // "Politics Breaking Political" -> "Breaking Political"
        [/^politics\s+breaking\s+political/i, 'Breaking Political'],
        // "Sanctions why" -> "Sanctions:" or similar
        [/^sanctions\s+why\s+/i, ''],
        // "Posts why" -> remove
        [/^posts\s+why\s+/i, ''],
        // "Predicts X Y" where X is a name/verb, Y is the actual prediction
        [/^predicts\s+final\s+(.+)/i, 'Final $1 Prediction'],
        [/^predicts\s+/i, 'Prediction: '],
        // "Exits X" where X is a full phrase
        [/^exits\s+/i, 'Exit: '],
        // "Trades X" patterns
        [/^trades\s+/i, 'Trade: '],
        // "Rallies X" -> "X Rallies"
        [/^rallies\s+(\w+)\s+/i, '$1 Rallies'],
        // "Faces X" patterns
        [/^faces\s+/i, ''],
    ];
    for (const [pattern, replacement] of replacements) {
        text = text.replace(pattern, replacement);
    }
    return text;
}
/**
 * Convert to Title Case properly
 * Preserves acronyms and handles edge cases
 */
function toTitleCase(text) {
    const lowercaseWords = new Set([
        'a', 'an', 'the', 'and', 'or', 'but', 'for', 'nor', 'on', 'at',
        'to', 'from', 'by', 'with', 'in', 'of', 'over', 'vs', 'via'
    ]);
    return text
        .toLowerCase()
        .split(/\s+/)
        .map((word, index) => {
        // Preserve uppercase acronyms (BTC, ETH, SEC, Fed, etc.)
        if (/^[A-Z]{2,}$/.test(word)) {
            return word.toUpperCase();
        }
        // Preserve $XX patterns
        if (word.startsWith('$')) {
            return word.charAt(0) + word.slice(1).toUpperCase();
        }
        // First word and non-lowercase words get capitalized
        if (index === 0 || !lowercaseWords.has(word)) {
            return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return word;
    })
        .join(' ');
}
/**
 * Fix spacing issues
 */
function fixSpacing(text) {
    return text
        .replace(/\s+/g, ' ') // Multiple spaces -> single
        .replace(/\s*([\-–—])\s*/g, ' - ') // Dashes with proper spacing
        .replace(/\s*,\s*/g, ', ') // Commas with proper spacing
        .replace(/\s*\.\s*/g, '. ') // Periods with proper spacing
        .trim();
}
/**
 * Fix sentence structure issues
 */
function fixSentenceStructure(text) {
    // Ensure sentences end properly
    if (!text.endsWith('.') && !text.endsWith('?') && !text.endsWith('!')) {
        // Don't add period if it looks like a title/heading
        const words = text.split(/\s+/);
        if (words.length > 4) {
            text += '.';
        }
    }
    // Fix double periods
    text = text.replace(/\.+/g, '.');
    // Fix spaces before periods
    text = text.replace(/\s+\./g, '.');
    return text;
}
/**
 * Final cleanup of any remaining issues
 */
function cleanupTitle(text) {
    // Remove leading/trailing special chars
    text = text.replace(/^[^\w]+|[^\w]+$/g, '');
    // Remove multiple punctuation
    text = text.replace(/([!?])\1+/g, '$1');
    // Ensure not empty
    if (!text) {
        return 'Market News';
    }
    // Limit length reasonably
    if (text.length > 120) {
        const words = text.split(' ');
        const truncated = words.slice(0, 12).join(' ');
        text = truncated + '...';
    }
    return text;
}
/**
 * Check if a title appears to be non-English
 */
function isNonEnglishTitle(title) {
    const text = title.toLowerCase();
    // Common non-English indicators
    const nonEnglishPatterns = [
        // Spanish
        /\b(es|la|el|los|las|un|una|unos|unas|de|del|en|por|para|con|sin|sobre|entre|hasta)\b.*\b(mostr|qued|ser|hab|est|ten)\b/i,
        // French
        /\b(le|la|les|un|une|des|du|de|en|pour|avec|sans|sur|entre|jusqu)\b.*\b(montr|rest|ser)\b/i,
        // German
        /\b(der|die|das|ein|eine|von|zu|mit|ohne|auf|fuer|zwischen)\b.*\b(nicht|mehr|sehr)\b/i,
        // Italian
        /\b(il|la|lo|gli|le|un|una|di|da|in|per|con|senza|su|tra)\b.*\b(mostr|riman)\b/i,
    ];
    for (const pattern of nonEnglishPatterns) {
        if (pattern.test(text)) {
            return true;
        }
    }
    return false;
}
/**
 * Translate or fallback for non-English titles
 * For now, we'll try to extract key entities and return a generic English title
 */
function handleNonEnglishTitle(title, articleTitle) {
    // Extract key entities (names, places, etc.)
    const entities = extractEntities(title);
    if (entities.length > 0) {
        return entities.join(' ') + ' News';
    }
    // Fallback to article title if available
    if (articleTitle && articleTitle.length > 10) {
        return articleTitle;
    }
    return 'International News';
}
/**
 * Extract entities from a non-English title
 */
function extractEntities(text) {
    const entities = [];
    // Extract capitalized words (potential names)
    const capitalizedWords = text.match(/\b[A-Z][a-z]+\b/g) || [];
    entities.push(...capitalizedWords);
    // Extract ticker symbols
    const tickers = text.match(/\b[A-Z]{2,5}\b/g) || [];
    entities.push(...tickers);
    return [...new Set(entities)].slice(0, 3);
}
/**
 * Validate and format a topic for storage
 * This is the main entry point used by the clustering system
 */
function validateAndFormatTopic(topic, articleTitle) {
    if (!topic || topic.length < 3) {
        return articleTitle || 'Market News';
    }
    let formatted = formatHumanReadableTitle(topic, articleTitle);
    // Check for non-English and handle appropriately
    if (isNonEnglishTitle(formatted)) {
        formatted = handleNonEnglishTitle(formatted, articleTitle);
    }
    // Final quality check
    if (formatted.length < 5) {
        return articleTitle || 'Market News';
    }
    return formatted;
}
//# sourceMappingURL=human-title-formatter.js.map