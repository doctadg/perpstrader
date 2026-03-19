"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedText = embedText;
const crypto_1 = __importDefault(require("crypto"));
const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'into', 'over', 'after', 'before',
    'about', 'their', 'they', 'them', 'will', 'would', 'could', 'should', 'what', 'when', 'where',
    'which', 'while', 'were', 'been', 'than', 'then', 'also', 'just', 'more', 'less', 'very',
    'today', 'latest', 'breaking', 'update', 'analysis', 'news', 'report', 'reports', 'says', 'said',
    'amid', 'as', 'at', 'by', 'in', 'is', 'it', 'of', 'on', 'or', 'to', 'a', 'an',
]);
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^a-z0-9\s$%.-]/g, ' ')
        .split(/\s+/)
        .map(t => t.trim())
        .filter(Boolean)
        .filter(t => t.length >= 2)
        .filter(t => !STOP_WORDS.has(t));
}
function hash32(input) {
    const buf = crypto_1.default.createHash('sha256').update(input).digest();
    return buf.readUInt32LE(0);
}
function l2Normalize(vec) {
    let sum = 0;
    for (const v of vec)
        sum += v * v;
    const norm = Math.sqrt(sum);
    if (!Number.isFinite(norm) || norm <= 0)
        return vec;
    return vec.map(v => v / norm);
}
/**
 * Tiny, deterministic local embeddings via feature hashing (no external models).
 * Good enough for coarse semantic clustering and dedupe.
 */
function embedText(text, dims = 64) {
    const resolvedDims = Number.isFinite(dims) && dims > 8 ? Math.floor(dims) : 64;
    const vec = new Array(resolvedDims).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0)
        return vec;
    const maxTokens = Math.min(tokens.length, 128);
    for (let i = 0; i < maxTokens; i++) {
        const token = tokens[i];
        const h = hash32(token);
        const idx = h % resolvedDims;
        const sign = (h & 1) === 0 ? 1 : -1;
        vec[idx] += sign * 1;
        // Add a lightweight bigram signal
        if (i + 1 < maxTokens) {
            const bigram = `${token}_${tokens[i + 1]}`;
            const hb = hash32(bigram);
            const idxb = hb % resolvedDims;
            const signb = (hb & 1) === 0 ? 1 : -1;
            vec[idxb] += signb * 0.5;
        }
    }
    return l2Normalize(vec);
}
//# sourceMappingURL=local-embeddings.js.map