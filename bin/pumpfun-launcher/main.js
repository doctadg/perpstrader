"use strict";
/**
 * pumpfun-launcher — Top-level entry point
 * Starts the orchestrator loop for autonomous token launches
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const orchestrator_1 = require("./orchestrator");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'pumpfun-launcher' });
async function main() {
    logger.info('Starting pumpfun-launcher...');
    const orchestrator = new orchestrator_1.Orchestrator({
        // Override with env vars if set
        launchIntervalMs: parseInt(process.env.LAUNCH_INTERVAL_MS || '', 10) || undefined,
        dailyBudgetSol: parseFloat(process.env.DAILY_BUDGET_SOL || '') || undefined,
        buyAmountSolPerWallet: parseFloat(process.env.BUY_AMOUNT_SOL || '') || undefined,
        numBuyerWallets: parseInt(process.env.NUM_BUYER_WALLETS || '', 10) || undefined,
        printterminalUrl: process.env.PRINTTERMINAL_URL || undefined,
    });
    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info({ signal }, 'Shutting down...');
        await orchestrator.stop();
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    await orchestrator.start();
}
main().catch((err) => {
    logger.fatal({ err }, 'Fatal error');
    process.exit(1);
});
//# sourceMappingURL=main.js.map