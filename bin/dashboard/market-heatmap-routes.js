"use strict";
// Market Heatmap API Routes
// Express routes for market-based heatmap data
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const market_data_sync_1 = __importDefault(require("../shared/market-data-sync"));
const market_mention_extractor_1 = __importDefault(require("../shared/market-mention-extractor"));
const market_heat_calculator_1 = __importDefault(require("../shared/market-heat-calculator"));
const logger_1 = __importDefault(require("../shared/logger"));
const router = (0, express_1.Router)();
// Initialize services
let initialized = false;
async function ensureInitialized() {
    if (initialized)
        return;
    await Promise.all([
        market_data_sync_1.default.initialize(),
        market_mention_extractor_1.default.initialize(),
        market_heat_calculator_1.default.initialize(),
    ]);
    initialized = true;
}
/**
 * GET /api/heatmap/markets
 * Get all active markets with optional filtering
 */
router.get('/markets', async (req, res) => {
    try {
        await ensureInitialized();
        const { type, category, active = 'true' } = req.query;
        let markets = await market_data_sync_1.default.getActiveMarkets();
        // Apply filters
        if (type) {
            markets = markets.filter(m => m.type === type);
        }
        if (category) {
            markets = markets.filter(m => m.category === category);
        }
        if (active === 'false') {
            // Return all markets including inactive
            // For now, getActiveMarkets only returns active ones
        }
        res.json({
            success: true,
            count: markets.length,
            markets,
        });
    }
    catch (error) {
        logger_1.default.error('[HeatmapAPI] Failed to get markets:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * POST /api/heatmap/sync
 * Trigger market data sync from Hyperliquid and Polymarket
 */
router.post('/sync', async (req, res) => {
    try {
        await ensureInitialized();
        logger_1.default.info('[HeatmapAPI] Starting market data sync...');
        const result = await market_data_sync_1.default.syncAllMarkets();
        // Deactivate stale markets
        const deactivated = await market_data_sync_1.default.deactivateStaleMarkets(24);
        res.json({
            success: true,
            synced: result,
            deactivated,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error('[HeatmapAPI] Market sync failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/heatmap/bubbles
 * Get bubble map data
 * X-axis: Market categories, Y-axis: Volume/Activity,
 * Bubble size: Article count, Color: Sentiment
 */
router.get('/bubbles', async (req, res) => {
    try {
        await ensureInitialized();
        const { category, minHeat = '0' } = req.query;
        const heatData = await market_heat_calculator_1.default.getHeatSnapshot(category, parseFloat(minHeat));
        // Transform to bubble map format
        const bubbles = heatData.map(h => ({
            id: h.marketId,
            name: h.marketName,
            type: h.marketType,
            category: h.category,
            x: h.category, // X-axis: category
            y: h.heatScore, // Y-axis: heat score
            volume: 0, // Would need to fetch from markets table
            size: Math.sqrt(h.articleCount) * 5 + 10, // Bubble size based on article count
            color: h.avgSentiment > 0.2 ? '#00ff9d' : // Positive = green
                h.avgSentiment < -0.2 ? '#ff3e3e' : // Negative = red
                    '#ffb300', // Neutral = amber
            sentiment: h.avgSentiment,
            articleCount: h.articleCount,
            mentionCount: h.mentionCount,
            trendDirection: h.trendDirection,
            velocity: h.velocity,
        }));
        res.json({
            success: true,
            count: bubbles.length,
            bubbles,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error('[HeatmapAPI] Failed to get bubble data:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/heatmap/grid
 * Get heatmap grid data
 * Rows: Markets, Columns: Time periods (1h, 4h, 24h)
 * Cell color intensity: Article volume + sentiment
 */
router.get('/grid', async (req, res) => {
    try {
        await ensureInitialized();
        const { periods = '1h,4h,24h' } = req.query;
        const periodTypes = periods.split(',');
        const gridData = await market_heat_calculator_1.default.getHeatGridData(periodTypes);
        res.json({
            success: true,
            count: gridData.length,
            periods: periodTypes,
            grid: gridData,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error('[HeatmapAPI] Failed to get grid data:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/heatmap/market/:marketId
 * Get detailed heat data for a specific market
 */
router.get('/market/:marketId', async (req, res) => {
    try {
        await ensureInitialized();
        const { marketId } = req.params;
        const { history = 'false', periods = '30' } = req.query;
        // Get current heat snapshot for this market
        const snapshot = await market_heat_calculator_1.default.getHeatSnapshot();
        const marketData = snapshot.find(m => m.marketId === marketId);
        if (!marketData) {
            res.status(404).json({
                success: false,
                error: 'Market not found',
            });
            return;
        }
        const result = {
            ...marketData,
        };
        // Get history if requested
        if (history === 'true') {
            result.history = await market_heat_calculator_1.default.getHeatHistory(marketId, '24h', parseInt(periods));
        }
        // Get recent mentions
        result.recentMentions = await market_mention_extractor_1.default.getMentionsForMarket(marketId, 24, 30);
        res.json({
            success: true,
            market: result,
        });
    }
    catch (error) {
        logger_1.default.error(`[HeatmapAPI] Failed to get market data for ${req.params.marketId}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/heatmap/top
 * Get top mentioned markets
 */
router.get('/top', async (req, res) => {
    try {
        await ensureInitialized();
        const { hours = '24', limit = '20' } = req.query;
        const topMarkets = await market_mention_extractor_1.default.getTopMentionedMarkets(parseInt(hours), parseInt(limit));
        res.json({
            success: true,
            count: topMarkets.length,
            markets: topMarkets,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error('[HeatmapAPI] Failed to get top markets:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/heatmap/categories
 * Get all unique categories with counts
 */
router.get('/categories', async (req, res) => {
    try {
        await ensureInitialized();
        const markets = await market_data_sync_1.default.getActiveMarkets();
        // Group by category
        const categoryCounts = {};
        for (const m of markets) {
            if (!categoryCounts[m.category]) {
                categoryCounts[m.category] = { count: 0, volume: 0 };
            }
            categoryCounts[m.category].count++;
            categoryCounts[m.category].volume += m.volume24h;
        }
        const categories = Object.entries(categoryCounts)
            .map(([name, stats]) => ({
            name,
            count: stats.count,
            totalVolume: stats.volume,
        }))
            .sort((a, b) => b.count - a.count);
        res.json({
            success: true,
            count: categories.length,
            categories,
        });
    }
    catch (error) {
        logger_1.default.error('[HeatmapAPI] Failed to get categories:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * POST /api/heatmap/calculate
 * Trigger heat calculation for all markets
 */
router.post('/calculate', async (req, res) => {
    try {
        await ensureInitialized();
        const { periods = '1h,4h,24h' } = req.query;
        const periodTypes = periods.split(',');
        const hoursMap = {
            '1h': 1,
            '4h': 4,
            '24h': 24,
            '7d': 168,
        };
        const results = {};
        for (const periodType of periodTypes) {
            const hours = hoursMap[periodType] || 24;
            logger_1.default.info(`[HeatmapAPI] Calculating ${periodType} heat...`);
            const heatData = await market_heat_calculator_1.default.calculateMarketHeat(periodType, hours);
            const stored = await market_heat_calculator_1.default.storeHeatCalculations(heatData, periodType);
            results[periodType] = stored;
        }
        res.json({
            success: true,
            calculated: results,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        logger_1.default.error('[HeatmapAPI] Heat calculation failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.default = router;
//# sourceMappingURL=market-heatmap-routes.js.map