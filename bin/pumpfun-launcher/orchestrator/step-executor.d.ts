import { Step, CreateStep, BuyStep, StaggeredBuyStep, PumpFunSellStep, SellStep, SimulationResult, SignerContext } from '../../shared/types';
import { StepResult, RunState } from './types';
import { FeeResolution } from './fee-manager';
export interface StepExecutionContext {
    state: RunState;
    feeResolution: FeeResolution;
    /** Get or create a signer for a wallet ID */
    resolveSigner(walletId: string): Promise<SignerContext>;
    /** Get current blockhash */
    getBlockhash(): Promise<{
        blockhash: string;
        slot: number;
    }>;
    /** Simulate a transaction */
    simulate(message: Uint8Array): Promise<SimulationResult>;
    /** Send a signed transaction */
    send(signature: string, message: Uint8Array): Promise<string>;
    /** Send as Jito bundle */
    sendBundle(signedTxs: Array<{
        signature: string;
        message: Uint8Array;
    }>, tipSol: number): Promise<string>;
    /** Resolve a wallet group to individual wallet IDs */
    resolveWalletGroup(groupId: string): Promise<string[]>;
}
/**
 * Execute a create step — deploy a new token on pump.fun
 */
export declare function executeCreateStep(step: CreateStep, ctx: StepExecutionContext): Promise<StepResult>;
/**
 * Execute a buy step — buy tokens on pump.fun
 */
export declare function executeBuyStep(step: BuyStep, ctx: StepExecutionContext): Promise<StepResult>;
/**
 * Execute a staggered buy — wallets buy with random delays between them
 */
export declare function executeStaggeredBuyStep(step: StaggeredBuyStep, ctx: StepExecutionContext): Promise<StepResult>;
/**
 * Execute a pump.fun sell step
 */
export declare function executePumpFunSellStep(step: PumpFunSellStep, ctx: StepExecutionContext): Promise<StepResult>;
/**
 * Execute a DEX sell step
 */
export declare function executeDexSellStep(step: SellStep, ctx: StepExecutionContext): Promise<StepResult>;
/**
 * Dispatch a step to the correct executor based on type
 */
export declare function executeStep(step: Step, ctx: StepExecutionContext): Promise<StepResult>;
//# sourceMappingURL=step-executor.d.ts.map