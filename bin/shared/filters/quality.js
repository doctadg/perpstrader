"use strict";
// Quality Filter
// Calculate quality scores for news articles based on various heuristics
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateQualityScore = calculateQualityScore;
exports.isSpam = isSpam;
exports.isLikelySpam = isLikelySpam;
exports.cleanTitle = cleanTitle;
/**
 * Spam and clickbait patterns
 */
const SPAM_PATTERNS = [
    /you won'?t believe/i,
    /shocking (truth|reveal|news)/i,
    /must read|click here|subscribe now/i,
    /.*\.{3,}/, // Ellipsis abuse "Breaking news..."
    /^[A-Z\s!]+$/, // All caps titles
    /^\d+ (ways|things|reasons)/i, // Listicle bait
    /\$\d+k?\s*(bonus|profit|gain)$/i, // Spam financial claims
];
/**
 * Generic/low-quality patterns
 */
const GENERIC_PATTERNS = [
    /^price (update|watch|alert)$/i,
    /^market (update|news|report)$/i,
    /^daily (update|recap)$/i,
    /^breaking (news|update)$/i,
    /^just in:/i,
    /^(more|continues?)?(\.\.\.)?$/i,
];
/**
 * Minimum content thresholds
 */
const MIN_CONTENT_LENGTH = 150;
const MIN_TITLE_LENGTH = 10;
const MAX_TITLE_LENGTH = 200;
/**
 * Calculate quality score for an article (0-1)
 * Higher scores indicate better quality
 */
function calculateQualityScore(title, content) {
    let score = 0.5; // Start at neutral
    // Title quality (0-0.3 points)
    score += evaluateTitleQuality(title) * 0.3;
    // Content quality (0-0.4 points)
    if (content) {
        score += evaluateContentQuality(title, content) * 0.4;
    }
    // Source quality (0-0.2 points) - inferred from title patterns
    score += evaluateSourceQuality(title) * 0.2;
    // Spam penalty (can reduce score below 0)
    if (isSpam(title, content)) {
        score -= 0.5;
    }
    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, score));
}
/**
 * Evaluate title quality (0-1)
 */
function evaluateTitleQuality(title) {
    let score = 0.5;
    // Length check
    if (title.length < MIN_TITLE_LENGTH) {
        score -= 0.3;
    }
    else if (title.length > MAX_TITLE_LENGTH) {
        score -= 0.1;
    }
    else if (title.length >= 40 && title.length <= 100) {
        score += 0.2;
    }
    // Has specific entity (capitalized words that aren't at start)
    const words = title.split(/\s+/);
    const capitalizedWords = words.filter((w, i) => i > 0 && /^[A-Z][a-z]/.test(w) && !/^(The|A|An|This|That|These|Those)$/.test(w));
    if (capitalizedWords.length > 0) {
        score += 0.2;
    }
    // Has numbers (stats, prices, dates)
    if (/\d+/.test(title)) {
        score += 0.1;
    }
    // Not all lowercase or uppercase
    if (!title.includes('  ') && title !== title.toUpperCase()) {
        score += 0.1;
    }
    // No excessive punctuation
    const punctuationCount = (title.match(/[!?]/g) || []).length;
    if (punctuationCount === 0) {
        score += 0.1;
    }
    else if (punctuationCount >= 2) {
        score -= 0.2;
    }
    return Math.max(0, Math.min(1, score));
}
/**
 * Evaluate content quality (0-1)
 */
function evaluateContentQuality(title, content) {
    let score = 0.5;
    // Length check
    if (content.length < MIN_CONTENT_LENGTH) {
        return 0; // Too short, fail immediately
    }
    // Good length (200-2000 chars)
    if (content.length >= 200 && content.length <= 2000) {
        score += 0.2;
    }
    else if (content.length > 2000) {
        score += 0.1; // Long but acceptable
    }
    // Content should be more than just title repeated
    const titleWords = new Set(title.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const contentWords = content.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const overlap = contentWords.filter(w => titleWords.has(w)).length;
    if (overlap < contentWords.length * 0.3) {
        score += 0.2; // Good, content is not just title repetition
    }
    // Has paragraph structure (indicates real content)
    if (content.split(/\n\n+/).length >= 2) {
        score += 0.1;
    }
    // No excessive repetition of words
    const wordCounts = new Map();
    for (const word of contentWords) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
    let maxCount = 0;
    for (const count of wordCounts.values()) {
        maxCount = Math.max(maxCount, count);
    }
    if (maxCount < contentWords.length * 0.1) {
        score += 0.1; // Good, no word dominates
    }
    return Math.max(0, Math.min(1, score));
}
/**
 * Evaluate source quality based on patterns (0-1)
 */
function evaluateSourceQuality(title) {
    // Negative indicators
    if (SPAM_PATTERNS.some(p => p.test(title))) {
        return 0;
    }
    if (GENERIC_PATTERNS.some(p => p.test(title))) {
        return 0.3;
    }
    // Positive indicators (specific entities, actions)
    const hasEntity = /\b[A-Z][a-z]+\b/.test(title);
    const hasAction = /\b(approves?|launch|reports?|announces?|says?|declines?|rises?|falls?|hacks?|bans?|adopts?|rejects?|proposes?|passes?)/i.test(title);
    if (hasEntity && hasAction) {
        return 1.0;
    }
    if (hasEntity) {
        return 0.7;
    }
    return 0.5;
}
/**
 * Check if article appears to be spam
 */
function isSpam(title, content) {
    // Check title against spam patterns
    if (SPAM_PATTERNS.some(p => p.test(title))) {
        return true;
    }
    // Check for excessive capitalization
    const uppercaseRatio = (title.match(/[A-Z]/g) || []).length / title.length;
    if (uppercaseRatio > 0.5 && title.length > 20) {
        return true;
    }
    // Check for excessive punctuation
    const punctuationCount = (title.match(/[!?]/g) || []).length;
    if (punctuationCount >= 3) {
        return true;
    }
    // Check content if available
    if (content) {
        // Very short content with long title is suspicious
        if (content.length < 100 && title.length > 50) {
            return true;
        }
        // Content is mostly the title repeated
        const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedContent = content.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedContent.length > 0) {
            const similarity = calculateSimilarity(normalizedTitle, normalizedContent);
            if (similarity > 0.7) {
                return true; // Content is basically just the title
            }
        }
    }
    return false;
}
/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(a, b) {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0)
        return 1;
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}
/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j] + 1 // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}
/**
 * Check if title is likely spam using heuristics
 */
function isLikelySpam(title) {
    return isSpam(title);
}
/**
 * Clean and normalize a title
 */
function cleanTitle(title) {
    // Remove common prefixes
    let cleaned = title
        .replace(/^(Breaking|UPDATE|JUST IN|ALERT|NEWS):?\s*/i, '')
        .replace(/^\d+\.\s*/, '') // Remove "1." style prefixes
        .replace(/\s*-\s*(Source|Reuters|Bloomberg|AP|AFP).*$/i, '') // Remove source suffixes
        .replace(/\s*\|.*$/, '') // Remove " | Source" style
        .trim();
    // Fix double spaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    return {
        title: cleaned,
        qualityScore: calculateQualityScore(cleaned),
    };
}
//# sourceMappingURL=quality.js.map