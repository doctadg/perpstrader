"use strict";
// SearXNG Search Client - Direct integration for news ingestion
// Bypasses the search server and uses SearXNG directly
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchSearXNG = searchSearXNG;
exports.searchSearXNGParallel = searchSearXNGParallel;
exports.checkSearXNGHealth = checkSearXNGHealth;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("./logger"));
/**
 * Search using local SearXNG instance
 */
async function searchSearXNG(query, numResults = 10, category = 'general') {
    const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
    try {
        const params = new URLSearchParams({
            q: query,
            format: 'json',
            categories: category,
            language: 'en-US',
            safesearch: '0',
        });
        const response = await axios_1.default.get(`${searxngUrl}/search?${params.toString()}`, {
            timeout: 30000,
            headers: {
                'Accept': 'application/json',
            },
        });
        const data = response.data;
        logger_1.default.info(`[SearXNG] Query: "${query}" - Found ${data.results?.length || 0} results`);
        return (data.results || []).slice(0, numResults).map(r => ({
            title: r.title,
            url: r.url,
            content: r.content,
            publishedDate: r.publishedDate,
            engine: r.engine,
            score: r.score,
        }));
    }
    catch (error) {
        logger_1.default.error(`[SearXNG] Search failed for "${query}":`, error);
        return [];
    }
}
/**
 * Search multiple queries in parallel
 */
async function searchSearXNGParallel(queries, numResults = 10) {
    const results = new Map();
    // Rate limit: 2 concurrent searches
    const batchSize = 2;
    for (let i = 0; i < queries.length; i += batchSize) {
        const batch = queries.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(q => searchSearXNG(q, numResults)));
        batch.forEach((query, idx) => {
            results.set(query, batchResults[idx]);
        });
        // Small delay between batches
        if (i + batchSize < queries.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return results;
}
/**
 * Check SearXNG health
 */
async function checkSearXNGHealth() {
    const searxngUrl = process.env.SEARXNG_URL || 'http://localhost:8080';
    const start = Date.now();
    try {
        const response = await axios_1.default.get(searxngUrl, {
            timeout: 10000,
        });
        const latency = Date.now() - start;
        if (response.status === 200) {
            return { ok: true, latency, message: `Healthy (${latency}ms)` };
        }
        return { ok: false, latency, message: `HTTP ${response.status}` };
    }
    catch (error) {
        return { ok: false, latency: Date.now() - start, message: String(error) };
    }
}
//# sourceMappingURL=searxng-client.js.map