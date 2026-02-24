"use strict";
// Funding Arbitrage API Routes
// Express routes for funding rate data and arbitrage opportunities
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const funding_arbitrage_scanner_1 = __importDefault(require("../market-ingester/funding-arbitrage-scanner"));
const hyperliquid_all_markets_1 = __importDefault(require("../market-ingester/hyperliquid-all-markets"));
const logger_1 = __importDefault(require("../shared/logger"));
const router = (0, express_1.Router)();
let initialized = false;
async function ensureInitialized() {
    if (initialized)
        return;
    await funding_arbitrage_scanner_1.default.initialize();
    initialized = true;
}
/**
 * GET /api/funding/rates
 * Get all current funding rates
 * Query params:
 *   - sort: 'rate' | 'opportunity' | 'trend'
 *   - minApr: minimum annualized rate
 *   - maxApr: maximum annualized rate
 *   - limit: max results
 */
router.get('/rates', async (req, res) => {
    try {
        await ensureInitialized();
        const { sort = 'rate', minApr, maxApr, limit } = req.query;
        let rates = await funding_arbitrage_scanner_1.default.getAllCurrentRates();
        // Apply filters
        if (minApr !== undefined) {
            rates = rates.filter(r => r.annualizedRate >= parseFloat(minApr));
        }
        if (maxApr !== undefined) {
            rates = rates.filter(r => r.annualizedRate <= parseFloat(maxApr));
        }
        // Apply sorting
        switch (sort) {
            case 'opportunity':
                rates.sort((a, b) => b.opportunityScore - a.opportunityScore);
                break;
            case 'trend':
                const trendOrder = { increasing: 0, stable: 1, decreasing: 2 };
                rates.sort((a, b) => trendOrder[a.trend] - trendOrder[b.trend]);
                break;
            case 'rate':
            default:
                rates.sort((a, b) => Math.abs(b.annualizedRate) - Math.abs(a.annualizedRate));
                break;
        }
        // Apply limit
        if (limit) {
            rates = rates.slice(0, parseInt(limit));
        }
        res.json({
            success: true,
            count: rates.length,
            rates,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to get rates:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/opportunities
 * Get top arbitrage opportunities
 * Query params:
 *   - threshold: minimum APR for extreme funding (default: 50)
 *   - limit: max results (default: 20)
 */
router.get('/opportunities', async (req, res) => {
    try {
        await ensureInitialized();
        const { threshold = '50', limit = '20' } = req.query;
        const opportunities = await funding_arbitrage_scanner_1.default.identifyOpportunities(parseFloat(threshold) / 100);
        const limited = opportunities.slice(0, parseInt(limit));
        res.json({
            success: true,
            count: limited.length,
            opportunities: limited,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to get opportunities:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/history/:symbol
 * Get historical funding data for a symbol
 * Query params:
 *   - hours: number of hours of history (default: 24)
 */
router.get('/history/:symbol', async (req, res) => {
    try {
        await ensureInitialized();
        const { symbol } = req.params;
        const { hours = '24' } = req.query;
        const history = await funding_arbitrage_scanner_1.default.getFundingHistory(symbol.toUpperCase(), parseInt(hours));
        res.json({
            success: true,
            symbol: symbol.toUpperCase(),
            count: history.length,
            history,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error(`[FundingAPI] Failed to get history for ${req.params.symbol}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/stats
 * Get summary statistics
 */
router.get('/stats', async (req, res) => {
    try {
        await ensureInitialized();
        const stats = await funding_arbitrage_scanner_1.default.getFundingStats();
        res.json({
            success: true,
            stats,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to get stats:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/compare
 * Compare funding rates between similar assets
 */
router.get('/compare', async (req, res) => {
    try {
        await ensureInitialized();
        await funding_arbitrage_scanner_1.default.compareSimilarAssets();
        res.json({
            success: true,
            message: 'Comparison completed',
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to compare assets:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * POST /api/funding/refresh
 * Trigger manual refresh of funding data
 */
router.post('/refresh', async (req, res) => {
    try {
        await ensureInitialized();
        logger_1.default.info('[FundingAPI] Manual refresh triggered');
        const rates = await funding_arbitrage_scanner_1.default.scanAllFundingRates();
        const opportunities = await funding_arbitrage_scanner_1.default.identifyOpportunities();
        res.json({
            success: true,
            ratesCount: rates.length,
            opportunitiesCount: opportunities.length,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Refresh failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/alert
 * Check for extreme funding events that should trigger alerts
 * Query params:
 *   - threshold: minimum APR for alerts (default: 100)
 */
router.get('/alert', async (req, res) => {
    try {
        await ensureInitialized();
        const { threshold = '100' } = req.query;
        const minApr = parseFloat(threshold);
        const rates = await funding_arbitrage_scanner_1.default.getAllCurrentRates();
        const alerts = rates.filter(r => Math.abs(r.annualizedRate) >= minApr).map(r => ({
            symbol: r.symbol,
            type: r.annualizedRate > 0 ? 'short' : 'long',
            annualizedRate: r.annualizedRate,
            urgency: Math.abs(r.annualizedRate) > 200 ? 'high' :
                Math.abs(r.annualizedRate) > 150 ? 'medium' : 'low',
            message: r.annualizedRate > 0
                ? `${r.symbol} has extreme positive funding (${r.annualizedRate.toFixed(2)}% APR). Consider shorting.`
                : `${r.symbol} has extreme negative funding (${r.annualizedRate.toFixed(2)}% APR). Consider longing.`,
        }));
        res.json({
            success: true,
            alertCount: alerts.length,
            alerts,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Alert check failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// ==========================================
// CROSS-EXCHANGE ARBITRAGE ROUTES
// ==========================================
/**
 * GET /api/funding/cross-exchange
 * Get cross-exchange arbitrage opportunities (pairwise across Hyperliquid, Asterdex, Binance)
 * Query params:
 *   - minSpread: minimum annualized spread percentage (default: 10)
 *   - urgency: filter by urgency level ('high', 'medium', 'low')
 *   - limit: max results (default: 50)
 */
router.get('/cross-exchange', async (req, res) => {
    try {
        await ensureInitialized();
        const { minSpread = '10', urgency, limit = '50', refresh = 'false' } = req.query;
        const minSpreadValue = parseFloat(minSpread);
        const staleThresholdMs = 3 * 60 * 1000;
        let opportunities = await funding_arbitrage_scanner_1.default.getCrossExchangeOpportunities(minSpreadValue);
        const forceRefresh = refresh === 'true';
        const isStale = opportunities.length > 0
            ? Date.now() - opportunities[0].timestamp > staleThresholdMs
            : false;
        if (forceRefresh || opportunities.length === 0 || isStale) {
            logger_1.default.info(`[FundingAPI] Running live cross-exchange scan (force=${forceRefresh}, empty=${opportunities.length === 0}, stale=${isStale})`);
            await funding_arbitrage_scanner_1.default.scanCrossExchangeArbitrage();
            opportunities = await funding_arbitrage_scanner_1.default.getCrossExchangeOpportunities(minSpreadValue);
        }
        // Filter by urgency if specified
        if (urgency) {
            opportunities = opportunities.filter(o => o.urgency === urgency);
        }
        // Apply limit
        const limited = opportunities.slice(0, parseInt(limit));
        res.json({
            success: true,
            count: limited.length,
            opportunities: limited,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to get cross-exchange opportunities:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/cross-exchange/stats
 * Get cross-exchange arbitrage statistics
 */
router.get('/cross-exchange/stats', async (req, res) => {
    try {
        await ensureInitialized();
        const stats = await funding_arbitrage_scanner_1.default.getCrossExchangeStats();
        res.json({
            success: true,
            stats,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to get cross-exchange stats:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/cross-exchange/:symbol
 * Get cross-exchange opportunity for a specific symbol
 */
router.get('/cross-exchange/:symbol', async (req, res) => {
    try {
        await ensureInitialized();
        const { symbol } = req.params;
        const opportunity = await funding_arbitrage_scanner_1.default.getCrossExchangeOpportunity(symbol.toUpperCase());
        if (!opportunity) {
            return res.status(404).json({
                success: false,
                error: `No cross-exchange opportunity found for ${symbol.toUpperCase()}`,
            });
        }
        res.json({
            success: true,
            opportunity,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error(`[FundingAPI] Failed to get cross-exchange opportunity for ${req.params.symbol}:`, error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/exchanges
 * Get status of connected exchanges
 */
router.get('/exchanges', async (req, res) => {
    try {
        await ensureInitialized();
        const exchanges = await funding_arbitrage_scanner_1.default.getExchangeInfo();
        res.json({
            success: true,
            exchanges,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to get exchange info:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * POST /api/funding/cross-exchange/scan
 * Trigger manual cross-exchange arbitrage scan
 */
router.post('/cross-exchange/scan', async (req, res) => {
    try {
        await ensureInitialized();
        logger_1.default.info('[FundingAPI] Manual cross-exchange scan triggered');
        const opportunities = await funding_arbitrage_scanner_1.default.scanCrossExchangeArbitrage();
        res.json({
            success: true,
            count: opportunities.length,
            opportunities,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Cross-exchange scan failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * POST /api/funding/refresh-all
 * Trigger complete scan (single-exchange + cross-exchange)
 */
router.post('/refresh-all', async (req, res) => {
    try {
        await ensureInitialized();
        logger_1.default.info('[FundingAPI] Complete refresh triggered');
        const result = await funding_arbitrage_scanner_1.default.runCompleteScan();
        res.json({
            success: true,
            ...result,
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Complete refresh failed:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
// ==========================================
// LIVE HYPERLIQUID FUNDING ROUTES
// ==========================================
/**
 * GET /api/funding/hyperliquid/live
 * Get live funding rates directly from Hyperliquid API (all 228+ markets)
 * Query params:
 *   - sort: 'volume' | 'funding' | 'apr'
 *   - limit: max results (default: 50)
 *   - category: filter by category (Layer 1, Layer 2, DeFi, Meme, AI, etc.)
 */
router.get('/hyperliquid/live', async (req, res) => {
    try {
        const { sort = 'volume', limit = '50', category } = req.query;
        logger_1.default.info('[FundingAPI] Fetching live Hyperliquid funding rates...');
        const { markets, count } = await hyperliquid_all_markets_1.default.fetchAllMarkets();
        let filtered = markets;
        // Filter by category if specified
        if (category) {
            const categories = hyperliquid_all_markets_1.default.getMarketsByCategory(markets);
            filtered = categories[category] || [];
        }
        // Apply sorting
        switch (sort) {
            case 'funding':
                filtered.sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));
                break;
            case 'apr':
                filtered.sort((a, b) => Math.abs(b.fundingRate * 3 * 365) - Math.abs(a.fundingRate * 3 * 365));
                break;
            case 'volume':
            default:
                filtered.sort((a, b) => b.volume24h - a.volume24h);
                break;
        }
        // Apply limit
        const limited = filtered.slice(0, parseInt(limit));
        // Transform to funding rate format
        const rates = limited.map(m => ({
            symbol: m.coin,
            fundingRate: m.fundingRate,
            annualizedRate: m.fundingRate * 3 * 365 * 100, // Convert to percentage
            markPrice: m.markPrice,
            volume24h: m.volume24h,
            openInterest: m.openInterest,
            category: hyperliquid_all_markets_1.default.getMarketsByCategory([m]),
        }));
        res.json({
            success: true,
            count: rates.length,
            totalMarkets: count,
            rates,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to get live Hyperliquid rates:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/hyperliquid/extreme
 * Get markets with extreme funding rates (best opportunities)
 * Query params:
 *   - threshold: minimum absolute funding rate (default: 0.01%)
 *   - limit: max results per side (default: 20)
 */
router.get('/hyperliquid/extreme', async (req, res) => {
    try {
        const { threshold = '0.0001', limit = '20' } = req.query;
        const minThreshold = parseFloat(threshold);
        logger_1.default.info('[FundingAPI] Fetching extreme funding opportunities...');
        const { positive, negative } = await hyperliquid_all_markets_1.default.getExtremeFundingMarkets(minThreshold);
        // Format the response
        const formatMarket = (m, type) => ({
            symbol: m.coin,
            fundingRate: m.fundingRate,
            annualizedRate: m.fundingRate * 3 * 365 * 100,
            markPrice: m.markPrice,
            volume24h: m.volume24h,
            openInterest: m.openInterest,
            recommendation: type === 'long' ? 'Long (negative funding = get paid)' : 'Short (positive funding = get paid)',
        });
        res.json({
            success: true,
            longOpportunities: negative.slice(0, parseInt(limit)).map(m => formatMarket(m, 'long')),
            shortOpportunities: positive.slice(0, parseInt(limit)).map(m => formatMarket(m, 'short')),
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to get extreme funding rates:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * GET /api/funding/hyperliquid/categories
 * Get markets grouped by category
 */
router.get('/hyperliquid/categories', async (req, res) => {
    try {
        logger_1.default.info('[FundingAPI] Fetching markets by category...');
        const { markets } = await hyperliquid_all_markets_1.default.fetchAllMarkets();
        const categories = hyperliquid_all_markets_1.default.getMarketsByCategory(markets);
        // Count per category and get top markets
        const result = {};
        for (const [cat, catMarkets] of Object.entries(categories)) {
            if (catMarkets.length > 0) {
                result[cat] = {
                    count: catMarkets.length,
                    topMarkets: catMarkets
                        .sort((a, b) => b.volume24h - a.volume24h)
                        .slice(0, 5)
                        .map(m => ({
                        symbol: m.coin,
                        fundingRate: m.fundingRate,
                        annualizedRate: m.fundingRate * 3 * 365 * 100,
                        volume24h: m.volume24h,
                    })),
                };
            }
        }
        res.json({
            success: true,
            categories: result,
            timestamp: Date.now(),
        });
    }
    catch (error) {
        logger_1.default.error('[FundingAPI] Failed to get categories:', error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.default = router;
//# sourceMappingURL=funding-arbitrage-routes.js.map