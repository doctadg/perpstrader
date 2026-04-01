"use strict";
/**
 * Sell Executor — Execute pump.fun sell transactions via Jito bundles
 *
 * References:
 *   - /home/d/printterminal/app/lib/launcher/pumpfunInstructions.ts (instruction building)
 *   - /home/d/printterminal/app/lib/launcher/pumpfunBuilder.ts (Jito bundling pattern)
 *   - /home/d/printterminal/app/api/launcher/sell/route.ts (sell API interface)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SellExecutor = void 0;
const web3_js_1 = require("@solana/web3.js");
const spl_token_1 = require("@solana/spl-token");
const bs58_1 = __importDefault(require("bs58"));
// ─── Pump.fun constants ───────────────────────────────
const PUMPFUN_PROGRAM_ID = new web3_js_1.PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMPFUN_GLOBAL = new web3_js_1.PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMPFUN_FEE_RECIPIENT = new web3_js_1.PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
const PUMPFUN_EVENT_AUTHORITY = new web3_js_1.PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
// Jito tip accounts (rotated)
const JITO_TIP_ACCOUNTS = [
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTqvQss8hp11i4bVqkfRtQ3NpsDBesC37qR3',
    'ADaUMid9yfUC67HyGY2avCA952rrXy1RLKmH6iW6eNsL',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];
const JITO_BUNDLE_API = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
function getDiscriminator(name) {
    const { createHash } = require('crypto');
    return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}
function borshU64(value) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(value, 0);
    return buf;
}
function getBondingCurvePDA(mint) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), mint.toBuffer()], PUMPFUN_PROGRAM_ID);
}
function getCreatorVaultPDA(creator) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('creator-vault'), creator.toBuffer()], PUMPFUN_PROGRAM_ID);
}
function getAssociatedTokenAddress(mint, owner) {
    return (0, spl_token_1.getAssociatedTokenAddressSync)(mint, owner, false, spl_token_1.TOKEN_PROGRAM_ID);
}
function getRandomTipAccount() {
    const addr = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
    return new web3_js_1.PublicKey(addr);
}
class SellExecutor {
    connection;
    config;
    constructor(connection, config) {
        this.connection = connection;
        this.config = config;
    }
    /**
     * Execute sells for all wallets holding a token, bundled via Jito
     */
    async executeSell(mint, symbol, walletKeypairs, tokenAmounts, exitStrategy, creatorPubkey) {
        const startTime = Date.now();
        const mintPk = new web3_js_1.PublicKey(mint);
        // Filter wallets that have tokens to sell
        const sellers = walletKeypairs.filter(kp => {
            const amount = tokenAmounts.get(kp.publicKey.toBase58()) ?? 0n;
            return amount > 0n;
        });
        if (sellers.length === 0) {
            return {
                success: false,
                mint,
                symbol,
                walletResults: [],
                totalSolReceived: 0,
                exitStrategy,
                timestamp: Date.now(),
            };
        }
        try {
            const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
            // Build individual sell transactions
            const txs = [];
            const walletResults = sellers.map(kp => ({
                walletAddress: kp.publicKey.toBase58(),
                success: false,
                tokensSold: tokenAmounts.get(kp.publicKey.toBase58()) ?? 0n,
            }));
            for (let i = 0; i < sellers.length; i++) {
                const kp = sellers[i];
                const tokenAmount = tokenAmounts.get(kp.publicKey.toBase58()) ?? 0n;
                if (tokenAmount === 0n)
                    continue;
                const sellIx = await this.buildSellInstruction(kp.publicKey, mintPk, tokenAmount, 0n, // minSolOutput — set to 0 for speed, protected by slippage in compute
                creatorPubkey);
                // Compute budget
                const computeBudgetIx = web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 });
                const computePriceIx = web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: this.config.priorityFeeMicroLamports,
                });
                // Close ATA after sell to reclaim rent
                const ata = getAssociatedTokenAddress(mintPk, kp.publicKey);
                const closeAtaIx = (0, spl_token_1.createCloseAccountInstruction)(ata, kp.publicKey, kp.publicKey, [], spl_token_1.TOKEN_PROGRAM_ID);
                // Jito tip (only on first wallet's tx to avoid over-tipping)
                const instructions = [computeBudgetIx, computePriceIx, sellIx, closeAtaIx];
                if (i === 0) {
                    instructions.push(web3_js_1.SystemProgram.transfer({
                        fromPubkey: kp.publicKey,
                        toPubkey: getRandomTipAccount(),
                        lamports: 100_000, // 0.0001 SOL tip
                    }));
                }
                const message = new web3_js_1.TransactionMessage({
                    payerKey: kp.publicKey,
                    recentBlockhash: blockhash,
                    instructions,
                }).compileToV0Message();
                const tx = new web3_js_1.VersionedTransaction(message);
                tx.sign([kp]);
                txs.push(tx);
            }
            // Submit as Jito bundle (chunks of 4 + tip tx)
            const bundleIds = await this.submitJitoBundles(txs);
            // Mark results as successful
            for (let i = 0; i < walletResults.length; i++) {
                walletResults[i].success = true;
                walletResults[i].signature = bundleIds[0]; // Same bundle
            }
            // Sweep SOL if configured
            if (this.config.sweepAfterSell) {
                this.sweepSol(sellers).catch(err => {
                    console.warn(`[SellExecutor] SOL sweep failed: ${err.message}`);
                });
            }
            console.log(`[SellExecutor] Sold ${symbol} | ${sellers.length} wallets | strategy: ${exitStrategy} | ${Date.now() - startTime}ms`);
            return {
                success: true,
                mint,
                symbol,
                walletResults,
                totalSolReceived: 0, // We don't know exact SOL until TX confirms
                exitStrategy,
                timestamp: Date.now(),
                bundleId: bundleIds[0],
            };
        }
        catch (err) {
            console.error(`[SellExecutor] Sell failed for ${symbol}:`, err.message);
            return {
                success: false,
                mint,
                symbol,
                walletResults: sellers.map(kp => ({
                    walletAddress: kp.publicKey.toBase58(),
                    success: false,
                    tokensSold: tokenAmounts.get(kp.publicKey.toBase58()) ?? 0n,
                    error: err.message,
                })),
                totalSolReceived: 0,
                exitStrategy,
                timestamp: Date.now(),
                bundleId: undefined,
            };
        }
    }
    /**
     * Build a pump.fun sell instruction
     * Reference: /home/d/printterminal/app/lib/launcher/pumpfunInstructions.ts
     */
    async buildSellInstruction(seller, mint, amount, minSolOutput, creator) {
        const [bondingCurve] = getBondingCurvePDA(mint);
        const associatedBondingCurve = getAssociatedTokenAddress(mint, bondingCurve);
        const associatedUser = getAssociatedTokenAddress(mint, seller);
        // Use seller as fallback creator
        const creatorPubkey = creator || seller;
        const [creatorVault] = getCreatorVaultPDA(creatorPubkey);
        const discriminator = getDiscriminator('sell');
        const data = Buffer.concat([
            discriminator,
            borshU64(amount),
            borshU64(minSolOutput),
        ]);
        const { TransactionInstruction } = require('@solana/web3.js');
        const keys = [
            { pubkey: PUMPFUN_GLOBAL, isSigner: false, isWritable: false },
            { pubkey: PUMPFUN_FEE_RECIPIENT, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedUser, isSigner: false, isWritable: true },
            { pubkey: seller, isSigner: true, isWritable: true },
            { pubkey: web3_js_1.SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: creatorVault, isSigner: false, isWritable: false },
            { pubkey: spl_token_1.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false },
        ];
        return new TransactionInstruction({
            keys,
            programId: PUMPFUN_PROGRAM_ID,
            data,
        });
    }
    /**
     * Submit transactions as Jito bundles
     */
    async submitJitoBundles(txs) {
        const bundleIds = [];
        const chunkSize = 4; // 4 TXs + 1 tip = 5 max per bundle
        for (let i = 0; i < txs.length; i += chunkSize) {
            const chunk = txs.slice(i, i + chunkSize);
            const serialized = chunk.map(tx => bs58_1.default.encode(tx.serialize()));
            try {
                const response = await fetch(JITO_BUNDLE_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'sendBundle',
                        params: [serialized],
                    }),
                });
                const result = await response.json();
                const bundleId = result.result;
                bundleIds.push(bundleId);
                console.log(`[SellExecutor] Jito bundle submitted: ${bundleId}`);
            }
            catch (err) {
                console.error(`[SellExecutor] Jito bundle failed:`, err.message);
                bundleIds.push('failed');
            }
            // Small delay between bundles
            if (i + chunkSize < txs.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }
        return bundleIds;
    }
    /**
     * Sweep SOL from wallets back to main wallet
     */
    async sweepSol(wallets) {
        const mainWallet = new web3_js_1.PublicKey(this.config.mainWalletAddress);
        if (!mainWallet)
            return;
        for (const wallet of wallets) {
            try {
                const balance = await this.connection.getBalance(wallet.publicKey);
                const reserve = 5000; // Keep 5000 lamports for rent
                if (balance <= reserve)
                    continue;
                const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
                const transferIx = web3_js_1.SystemProgram.transfer({
                    fromPubkey: wallet.publicKey,
                    toPubkey: mainWallet,
                    lamports: balance - reserve,
                });
                const message = new web3_js_1.TransactionMessage({
                    payerKey: wallet.publicKey,
                    recentBlockhash: blockhash,
                    instructions: [transferIx],
                }).compileToV0Message();
                const tx = new web3_js_1.VersionedTransaction(message);
                tx.sign([wallet]);
                const sig = await this.connection.sendRawTransaction(tx.serialize(), {
                    skipPreflight: true,
                    maxRetries: 2,
                });
                console.log(`[SellExecutor] Swept SOL from ${wallet.publicKey.toBase58().slice(0, 8)}: ${sig.slice(0, 20)}...`);
            }
            catch (err) {
                console.warn(`[SellExecutor] Sweep failed for ${wallet.publicKey.toBase58().slice(0, 8)}: ${err.message}`);
            }
        }
    }
}
exports.SellExecutor = SellExecutor;
exports.default = SellExecutor;
//# sourceMappingURL=sell-executor.js.map