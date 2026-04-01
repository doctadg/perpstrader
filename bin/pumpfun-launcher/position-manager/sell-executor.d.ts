/**
 * Sell Executor — Execute pump.fun sell transactions via Jito bundles
 *
 * References:
 *   - /home/d/printterminal/app/lib/launcher/pumpfunInstructions.ts (instruction building)
 *   - /home/d/printterminal/app/lib/launcher/pumpfunBuilder.ts (Jito bundling pattern)
 *   - /home/d/printterminal/app/api/launcher/sell/route.ts (sell API interface)
 */
import { PublicKey, Keypair, Connection } from '@solana/web3.js';
import { SellResult, ExitStrategy, PositionConfig } from './types';
export declare class SellExecutor {
    private connection;
    private config;
    constructor(connection: Connection, config: PositionConfig);
    /**
     * Execute sells for all wallets holding a token, bundled via Jito
     */
    executeSell(mint: string, symbol: string, walletKeypairs: Keypair[], tokenAmounts: Map<string, bigint>, exitStrategy: ExitStrategy, creatorPubkey?: PublicKey): Promise<SellResult>;
    /**
     * Build a pump.fun sell instruction
     * Reference: /home/d/printterminal/app/lib/launcher/pumpfunInstructions.ts
     */
    private buildSellInstruction;
    /**
     * Submit transactions as Jito bundles
     */
    private submitJitoBundles;
    /**
     * Sweep SOL from wallets back to main wallet
     */
    private sweepSol;
}
export default SellExecutor;
//# sourceMappingURL=sell-executor.d.ts.map