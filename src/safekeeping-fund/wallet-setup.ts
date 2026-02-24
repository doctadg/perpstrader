import 'dotenv/config';
import { bootstrapSafekeepingWalletConfig } from './wallet-bootstrap';

function printChainAddress(chain: string, address: string | undefined, source: string | undefined): void {
  if (!address) {
    console.log(`${chain}: not configured`);
    return;
  }
  console.log(`${chain}: ${address} (${source || 'unknown'})`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--no-create')) {
    process.env.SAFEKEEPING_AUTO_CREATE_WALLETS = 'false';
  }

  const result = bootstrapSafekeepingWalletConfig();

  console.log('Safekeeping Agent Wallets');
  console.log(`Store: ${result.walletStorePath}`);
  console.log('');

  printChainAddress('ethereum', result.addresses.ethereum, result.chainSources.ethereum);
  printChainAddress('bsc', result.addresses.bsc, result.chainSources.bsc);
  printChainAddress('solana', result.addresses.solana, result.chainSources.solana);

  if (result.generatedChains.length > 0) {
    console.log('');
    console.log(`Generated new wallets: ${result.generatedChains.join(', ')}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[wallet-setup] Failed:', error);
    process.exit(1);
  });
}
