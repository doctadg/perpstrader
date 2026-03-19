import type { Chain, MultiChainWalletConfig } from './types';
type WalletSource = 'env' | 'store' | 'generated' | 'missing';
export interface SafekeepingWalletBootstrapResult {
    config: MultiChainWalletConfig;
    addresses: Partial<Record<Chain, string>>;
    chainSources: Partial<Record<Chain, WalletSource>>;
    walletStorePath: string;
    generatedChains: Chain[];
}
export declare function bootstrapSafekeepingWalletConfig(): SafekeepingWalletBootstrapResult;
export {};
//# sourceMappingURL=wallet-bootstrap.d.ts.map