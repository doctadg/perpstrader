"use strict";
// Step Executor
// Executes individual plan steps — create, buy, staggered buy, sell
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeCreateStep = executeCreateStep;
exports.executeBuyStep = executeBuyStep;
exports.executeStaggeredBuyStep = executeStaggeredBuyStep;
exports.executePumpFunSellStep = executePumpFunSellStep;
exports.executeDexSellStep = executeDexSellStep;
exports.executeStep = executeStep;
const timing_engine_1 = require("./timing-engine");
const logger_1 = __importDefault(require("../../shared/logger"));
// ===== STEP EXECUTORS =====
/**
 * Execute a create step — deploy a new token on pump.fun
 */
async function executeCreateStep(step, ctx) {
    const start = Date.now();
    try {
        const signer = await ctx.resolveSigner(ctx.state.plan.creatorWalletId);
        const { blockhash, slot } = await ctx.getBlockhash();
        logger_1.default.info(`[StepExecutor] CREATE: ${step.metadata.name} ($${step.metadata.symbol}) via ${signer.walletId}`);
        // Build the create instruction (placeholder — real implementation calls pump.fun program)
        const message = buildCreateMessage(step, signer, blockhash);
        // Simulate
        const sim = await ctx.simulate(message);
        if (!sim.success) {
            return {
                stepName: step.name,
                stepIndex: ctx.state.currentStepIndex,
                status: 'failed',
                simulation: sim,
                error: `Simulation failed: ${sim.error}`,
                durationMs: Date.now() - start,
            };
        }
        // Send
        const sig = await (0, timing_engine_1.withTimingRetry)(() => ctx.send(signer.publicKey, message));
        logger_1.default.info(`[StepExecutor] CREATE confirmed: ${sig}`);
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: 'success',
            signatures: [sig],
            simulation: sim,
            durationMs: Date.now() - start,
        };
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger_1.default.error(`[StepExecutor] CREATE failed: ${msg}`);
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: 'failed',
            error: msg,
            durationMs: Date.now() - start,
        };
    }
}
/**
 * Execute a buy step — buy tokens on pump.fun
 */
async function executeBuyStep(step, ctx) {
    const start = Date.now();
    try {
        const walletIds = await resolveWalletIds(step.walletIds, step.walletGroupId, ctx);
        const amounts = resolveWalletAmounts(walletIds, step);
        const { blockhash, slot } = await ctx.getBlockhash();
        logger_1.default.info(`[StepExecutor] BUY: ${walletIds.length} wallets, amounts: ${JSON.stringify(amounts)} ` +
            `jito=${step.useJitoBundle}`);
        if (step.useJitoBundle) {
            return await executeBundleBuy(walletIds, amounts, step, ctx, start);
        }
        // Sequential buys
        const signatures = [];
        const sims = [];
        let lastError;
        for (let i = 0; i < walletIds.length; i++) {
            const signer = await ctx.resolveSigner(walletIds[i]);
            const message = buildBuyMessage(ctx.state.mintAddress, amounts[walletIds[i]], signer, blockhash, ctx.feeResolution);
            const sim = await ctx.simulate(message);
            if (!sim.success) {
                lastError = `Simulation failed for ${walletIds[i]}: ${sim.error}`;
                logger_1.default.warn(`[StepExecutor] BUY sim failed for ${walletIds[i]}: ${sim.error}`);
                continue;
            }
            sims.push(sim);
            const sig = await (0, timing_engine_1.withTimingRetry)(() => ctx.send(signer.publicKey, message));
            signatures.push(sig);
        }
        if (signatures.length === 0) {
            return {
                stepName: step.name,
                stepIndex: ctx.state.currentStepIndex,
                status: 'failed',
                error: lastError ?? 'No successful buys',
                durationMs: Date.now() - start,
            };
        }
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: 'success',
            signatures,
            simulation: sims[0],
            durationMs: Date.now() - start,
        };
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger_1.default.error(`[StepExecutor] BUY failed: ${msg}`);
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: 'failed',
            error: msg,
            durationMs: Date.now() - start,
        };
    }
}
/**
 * Execute a staggered buy — wallets buy with random delays between them
 */
async function executeStaggeredBuyStep(step, ctx) {
    const start = Date.now();
    try {
        const walletIds = await resolveWalletIds(step.walletIds, step.walletGroupId, ctx);
        const amounts = resolveWalletAmounts(walletIds, step);
        logger_1.default.info(`[StepExecutor] STAGGERED BUY: ${walletIds.length} wallets, ` +
            `delay ${step.delayMinMs}-${step.delayMaxMs}ms`);
        const signatures = [];
        for (let i = 0; i < walletIds.length; i++) {
            if (i > 0) {
                const delay = (0, timing_engine_1.staggerDelay)(step.delayMinMs, step.delayMaxMs);
                logger_1.default.debug(`[StepExecutor] Stagger delay: ${delay.toFixed(0)}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            const signer = await ctx.resolveSigner(walletIds[i]);
            const { blockhash } = await ctx.getBlockhash();
            const message = buildBuyMessage(ctx.state.mintAddress, amounts[walletIds[i]], signer, blockhash, ctx.feeResolution);
            const sim = await ctx.simulate(message);
            if (!sim.success) {
                logger_1.default.warn(`[StepExecutor] Staggered BUY sim failed for ${walletIds[i]}: ${sim.error}`);
                continue;
            }
            const sig = await (0, timing_engine_1.withTimingRetry)(() => ctx.send(signer.publicKey, message));
            signatures.push(sig);
        }
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: signatures.length > 0 ? 'success' : 'failed',
            signatures,
            error: signatures.length === 0 ? 'All staggered buys failed' : undefined,
            durationMs: Date.now() - start,
        };
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: 'failed',
            error: msg,
            durationMs: Date.now() - start,
        };
    }
}
/**
 * Execute a pump.fun sell step
 */
async function executePumpFunSellStep(step, ctx) {
    const start = Date.now();
    try {
        const walletIds = await resolveWalletIds(step.walletIds, step.walletGroupId, ctx);
        const { blockhash } = await ctx.getBlockhash();
        logger_1.default.info(`[StepExecutor] SELL: ${walletIds.length} wallets, ${step.amountTokensEach} tokens each`);
        const signatures = [];
        for (const walletId of walletIds) {
            const signer = await ctx.resolveSigner(walletId);
            const message = buildPumpFunSellMessage(ctx.state.mintAddress, step.amountTokensEach, step.decimals, signer, blockhash, ctx.feeResolution);
            const sim = await ctx.simulate(message);
            if (!sim.success) {
                logger_1.default.warn(`[StepExecutor] SELL sim failed for ${walletId}: ${sim.error}`);
                continue;
            }
            const sig = await (0, timing_engine_1.withTimingRetry)(() => ctx.send(signer.publicKey, message));
            signatures.push(sig);
        }
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: signatures.length > 0 ? 'success' : 'failed',
            signatures,
            error: signatures.length === 0 ? 'All sells failed' : undefined,
            durationMs: Date.now() - start,
        };
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: 'failed',
            error: msg,
            durationMs: Date.now() - start,
        };
    }
}
/**
 * Execute a DEX sell step
 */
async function executeDexSellStep(step, ctx) {
    const start = Date.now();
    try {
        const { blockhash } = await ctx.getBlockhash();
        logger_1.default.info(`[StepExecutor] DEX SELL: ${step.walletIds.length} wallets, ` +
            `${step.percentEach}% of ${step.tokenMint}`);
        const signatures = [];
        for (const walletId of step.walletIds) {
            const signer = await ctx.resolveSigner(walletId);
            const message = buildDexSellMessage(step.tokenMint, step.percentEach, step.minOutBps, signer, blockhash, ctx.feeResolution);
            const sim = await ctx.simulate(message);
            if (!sim.success) {
                logger_1.default.warn(`[StepExecutor] DEX SELL sim failed for ${walletId}: ${sim.error}`);
                continue;
            }
            const sig = await (0, timing_engine_1.withTimingRetry)(() => ctx.send(signer.publicKey, message));
            signatures.push(sig);
        }
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: signatures.length > 0 ? 'success' : 'failed',
            signatures,
            error: signatures.length === 0 ? 'All DEX sells failed' : undefined,
            durationMs: Date.now() - start,
        };
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
            stepName: step.name,
            stepIndex: ctx.state.currentStepIndex,
            status: 'failed',
            error: msg,
            durationMs: Date.now() - start,
        };
    }
}
/**
 * Dispatch a step to the correct executor based on type
 */
async function executeStep(step, ctx) {
    switch (step.type) {
        case 'pumpfun.create':
            return executeCreateStep(step, ctx);
        case 'pumpfun.buy':
            return executeBuyStep(step, ctx);
        case 'pumpfun.buy.staggered':
            return executeStaggeredBuyStep(step, ctx);
        case 'pumpfun.sell':
            return executePumpFunSellStep(step, ctx);
        case 'dex.sell':
            return executeDexSellStep(step, ctx);
        default:
            return {
                stepName: step.name ?? 'unknown',
                stepIndex: ctx.state.currentStepIndex,
                status: 'failed',
                error: `Unknown step type: ${step.type}`,
                durationMs: 0,
            };
    }
}
// ===== INTERNAL HELPERS =====
async function resolveWalletIds(walletIds, groupId, ctx) {
    if (walletIds && walletIds.length > 0)
        return walletIds;
    if (groupId)
        return ctx.resolveWalletGroup(groupId);
    return [ctx.state.plan.creatorWalletId];
}
function resolveWalletAmounts(walletIds, step) {
    const amounts = {};
    for (const wid of walletIds) {
        if (step.walletAmounts && step.walletAmounts[wid] !== undefined) {
            amounts[wid] = step.walletAmounts[wid];
        }
        else if (step.amountSolEach !== undefined) {
            amounts[wid] = step.amountSolEach;
        }
        else if (step.amountSolMin !== undefined && step.amountSolMax !== undefined) {
            amounts[wid] = step.amountSolMin + Math.random() * (step.amountSolMax - step.amountSolMin);
        }
        else {
            amounts[wid] = 0.01; // Safe fallback
        }
    }
    return amounts;
}
async function executeBundleBuy(walletIds, amounts, step, ctx, startTime) {
    const signedTxs = [];
    for (const walletId of walletIds) {
        const signer = await ctx.resolveSigner(walletId);
        const { blockhash } = await ctx.getBlockhash();
        const message = buildBuyMessage(ctx.state.mintAddress, amounts[walletId], signer, blockhash, ctx.feeResolution);
        signedTxs.push({ signature: signer.publicKey, message });
    }
    const bundleId = await ctx.sendBundle(signedTxs, ctx.feeResolution.jitoTipSol ?? 0.001);
    return {
        stepName: step.name,
        stepIndex: ctx.state.currentStepIndex,
        status: 'success',
        signatures: [bundleId],
        durationMs: Date.now() - startTime,
    };
}
// ===== PLACEHOLDER BUILDERS =====
// These return empty Uint8Arrays — real implementation plugs in @solana/web3.js
function buildCreateMessage(step, signer, blockhash) {
    // TODO: Build real pump.fun create instruction via @solana/web3.js
    return new Uint8Array(0);
}
function buildBuyMessage(mint, amountSol, signer, blockhash, fees) {
    // TODO: Build real pump.fun buy instruction
    return new Uint8Array(0);
}
function buildPumpFunSellMessage(mint, amountTokens, decimals, signer, blockhash, fees) {
    // TODO: Build real pump.fun sell instruction
    return new Uint8Array(0);
}
function buildDexSellMessage(tokenMint, percent, minOutBps, signer, blockhash, fees) {
    // TODO: Build real DEX swap instruction (Jupiter/Raydium)
    return new Uint8Array(0);
}
//# sourceMappingURL=step-executor.js.map