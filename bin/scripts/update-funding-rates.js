#!/usr/bin/env node
"use strict";
/**
 * Funding Rate Update Script (One-shot)
 *
 * Quick update script for use with cron:
 * Run every 5 minutes via cron
 */
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
const funding_arbitrage_scanner_1 = __importDefault(require("../market-ingester/funding-arbitrage-scanner"));
const logger_1 = __importDefault(require("../shared/logger"));
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const EXTREME_THRESHOLD = 0.5; // 50% APR
async function main() {
    logger_1.default.info('[FundingUpdate] Starting one-shot funding rate update...');
    try {
        // Initialize scanner
        await funding_arbitrage_scanner_1.default.initialize();
        // Scan all funding rates
        const rates = await funding_arbitrage_scanner_1.default.scanAllFundingRates();
        logger_1.default.info(`[FundingUpdate] Scanned ${rates.length} markets`);
        // Identify opportunities
        const opportunities = await funding_arbitrage_scanner_1.default.identifyOpportunities(EXTREME_THRESHOLD);
        logger_1.default.info(`[FundingUpdate] Found ${opportunities.length} opportunities`);
        // Compare similar assets
        await funding_arbitrage_scanner_1.default.compareSimilarAssets();
        // Log extreme opportunities
        const extreme = opportunities.filter(o => Math.abs(o.annualizedRate) >= 100);
        if (extreme.length > 0) {
            logger_1.default.warn(`[FundingUpdate] ${extreme.length} EXTREME opportunities detected!`);
            for (const opp of extreme) {
                logger_1.default.warn(`[FundingUpdate] ${opp.type.toUpperCase()} ${opp.symbol}: ${opp.annualizedRate.toFixed(2)}% APR`);
            }
        }
        // Get stats
        const stats = await funding_arbitrage_scanner_1.default.getFundingStats();
        logger_1.default.info(`[FundingUpdate] Stats: Avg=${stats.averageFunding.toFixed(2)}%, Extreme=${stats.extremeMarketsCount} markets`);
        logger_1.default.info('[FundingUpdate] Update completed successfully');
        process.exit(0);
    }
    catch (error) {
        logger_1.default.error('[FundingUpdate] Update failed:', error);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=update-funding-rates.js.map