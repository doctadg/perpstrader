"use strict";
// Scrape Node - Scrape and analyze websites for tokens
// Uses web scraper to analyze website content quality
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
exports.updateStep = exports.addThought = void 0;
exports.scrapeNode = scrapeNode;
const logger_1 = __importDefault(require("../../shared/logger"));
const state_1 = require("../state");
/**
 * Scrape websites for all queued tokens
 */
async function scrapeNode(state) {
    if (state.queuedTokens.length === 0) {
        logger_1.default.warn('[ScrapeNode] No tokens to scrape');
        return {
            ...(0, state_1.addThought)(state, 'No tokens to scrape'),
            ...(0, state_1.updateStep)(state, 'NO_TOKENS'),
        };
    }
    logger_1.default.info(`[ScrapeNode] Scraping websites for ${state.queuedTokens.length} tokens`);
    // Import web scraper service
    let webScraper;
    try {
        webScraper = (await Promise.resolve().then(() => __importStar(require('../services/web-scraper')))).default;
    }
    catch (error) {
        logger_1.default.error('[ScrapeNode] Failed to import web scraper service');
        return {
            ...(0, state_1.addThought)(state, 'Failed to import web scraper service'),
            ...(0, state_1.updateStep)(state, 'ERROR'),
        };
    }
    const websiteAnalyses = new Map();
    // Scrape websites with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < state.queuedTokens.length; i += concurrency) {
        const batch = state.queuedTokens.slice(i, i + concurrency);
        await Promise.allSettled(batch.map(async (item) => {
            const token = item.token || item;
            const metadata = item.metadata || token;
            if (!metadata.website) {
                // No website to scrape
                websiteAnalyses.set(token.mintAddress, {
                    url: '',
                    exists: false,
                    hasContent: false,
                    contentQuality: 0,
                    hasWhitepaper: false,
                    hasTeamInfo: false,
                    hasRoadmap: false,
                    hasTokenomics: false,
                    sslValid: false,
                    glmAnalysis: 'No website provided',
                });
                return;
            }
            try {
                const analysis = await webScraper.analyzeWebsite(metadata.website, {
                    name: metadata.name,
                    symbol: metadata.symbol,
                });
                websiteAnalyses.set(token.mintAddress, analysis);
            }
            catch (error) {
                logger_1.default.debug(`[ScrapeNode] Failed to scrape ${metadata.website}: ${error}`);
                websiteAnalyses.set(token.mintAddress, {
                    url: metadata.website,
                    exists: false,
                    hasContent: false,
                    contentQuality: 0,
                    hasWhitepaper: false,
                    hasTeamInfo: false,
                    hasRoadmap: false,
                    hasTokenomics: false,
                    sslValid: false,
                    glmAnalysis: 'Scraping failed',
                });
            }
        }));
    }
    logger_1.default.info(`[ScrapeNode] Analyzed ${websiteAnalyses.size} websites`);
    return {
        ...(0, state_1.addThought)(state, `Analyzed ${websiteAnalyses.size} websites`),
        ...(0, state_1.updateStep)(state, 'WEBSITES_SCRAPED'),
        thoughts: [...state.thoughts, `Website analyses: ${websiteAnalyses.size} completed`],
    };
}
var state_2 = require("../state");
Object.defineProperty(exports, "addThought", { enumerable: true, get: function () { return state_2.addThought; } });
Object.defineProperty(exports, "updateStep", { enumerable: true, get: function () { return state_2.updateStep; } });
//# sourceMappingURL=scrape-node.js.map