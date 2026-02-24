import fs from 'fs';
import path from 'path';
import { Keypair } from '@solana/web3.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import logger from '../shared/logger';
import { CHAIN_IDS, DEFAULT_RPC_URLS } from './constants';
import type { Chain, MultiChainWalletConfig } from './types';

type EvmPrivateKey = `0x${string}`;
type SolanaCommitment = 'processed' | 'confirmed' | 'finalized';
type WalletSource = 'env' | 'store' | 'generated' | 'missing';

interface StoredWalletFile {
  version: 1;
  updatedAt: string;
  wallets: {
    ethereum?: { privateKey: EvmPrivateKey };
    bsc?: { privateKey: EvmPrivateKey };
    solana?: { secretKeyBase64: string };
  };
}

interface ResolvedWallet<T> {
  value?: T;
  source: WalletSource;
}

export interface SafekeepingWalletBootstrapResult {
  config: MultiChainWalletConfig;
  addresses: Partial<Record<Chain, string>>;
  chainSources: Partial<Record<Chain, WalletSource>>;
  walletStorePath: string;
  generatedChains: Chain[];
}

const WALLET_FILE_VERSION = 1 as const;
const DEFAULT_WALLET_STORE_PATH = 'config/openclaw/wallets.json';
const LEGACY_WALLET_STORE_PATH = 'config/agent-wallets.json';

function resolveWalletStorePath(): string {
  const configuredPath = process.env.SAFEKEEPING_WALLET_STORE_PATH;
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
  }

  const preferredPath = path.resolve(process.cwd(), DEFAULT_WALLET_STORE_PATH);
  if (fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  const legacyPath = path.resolve(process.cwd(), LEGACY_WALLET_STORE_PATH);
  if (fs.existsSync(legacyPath)) {
    logger.warn(
      `[WalletBootstrap] Using legacy wallet store at ${legacyPath}. ` +
      `Set SAFEKEEPING_WALLET_STORE_PATH=${DEFAULT_WALLET_STORE_PATH} to migrate.`
    );
    return legacyPath;
  }

  return preferredPath;
}

function parseSolanaCommitment(value: string | undefined): SolanaCommitment {
  if (value === 'processed' || value === 'confirmed' || value === 'finalized') {
    return value;
  }
  return 'confirmed';
}

function normalizeEvmPrivateKey(value: string | undefined): EvmPrivateKey | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    throw new Error('Invalid EVM private key format; expected 0x-prefixed 32-byte hex string');
  }

  return trimmed as EvmPrivateKey;
}

function parseSolanaSecretKey(value: string | undefined): Uint8Array | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.length < 32) {
      throw new Error('Invalid SOLANA_SECRET_KEY JSON; expected numeric byte array');
    }

    const bytes = Uint8Array.from(parsed.map((entry) => {
      const value = Number(entry);
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error('SOLANA_SECRET_KEY JSON array contains invalid byte values');
      }
      return value;
    }));

    Keypair.fromSecretKey(bytes);
    return bytes;
  }

  const bytes = Uint8Array.from(Buffer.from(trimmed, 'base64'));
  Keypair.fromSecretKey(bytes);
  return bytes;
}

function decodeStoredSolanaSecretKey(secretKeyBase64: string): Uint8Array {
  const bytes = Uint8Array.from(Buffer.from(secretKeyBase64, 'base64'));
  Keypair.fromSecretKey(bytes);
  return bytes;
}

function tryReadWalletStore(walletStorePath: string): StoredWalletFile | undefined {
  if (!fs.existsSync(walletStorePath)) {
    return undefined;
  }

  try {
    enforceStrictWalletFilePermissions(walletStorePath);

    const raw = fs.readFileSync(walletStorePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredWalletFile;

    if (parsed.version !== WALLET_FILE_VERSION || !parsed.wallets) {
      logger.warn(`[WalletBootstrap] Ignoring unsupported wallet store format at ${walletStorePath}`);
      return undefined;
    }

    return parsed;
  } catch (error) {
    logger.warn(`[WalletBootstrap] Failed to parse wallet store at ${walletStorePath}: ${error}`);
    return undefined;
  }
}

function writeWalletStore(walletStorePath: string, data: StoredWalletFile): void {
  const walletDir = path.dirname(walletStorePath);
  fs.mkdirSync(walletDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(walletDir, 0o700);
  fs.writeFileSync(walletStorePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(walletStorePath, 0o600);
}

function enforceStrictWalletFilePermissions(walletStorePath: string): void {
  try {
    const walletDir = path.dirname(walletStorePath);
    if (fs.existsSync(walletDir)) {
      const walletDirMode = fs.statSync(walletDir).mode & 0o777;
      if ((walletDirMode & 0o077) !== 0) {
        fs.chmodSync(walletDir, 0o700);
      }
    }

    const walletFileMode = fs.statSync(walletStorePath).mode & 0o777;
    if ((walletFileMode & 0o077) !== 0) {
      fs.chmodSync(walletStorePath, 0o600);
      logger.warn(
        `[WalletBootstrap] Tightened wallet file permissions for ${walletStorePath} to 600`
      );
    }
  } catch (error) {
    logger.warn(`[WalletBootstrap] Permission hardening skipped for ${walletStorePath}: ${error}`);
  }
}

function resolveEvmWallet(
  envKeyName: 'ETH_PRIVATE_KEY' | 'BSC_PRIVATE_KEY',
  storedPrivateKey: EvmPrivateKey | undefined,
  autoCreateWallets: boolean
): ResolvedWallet<EvmPrivateKey> {
  const envKey = normalizeEvmPrivateKey(process.env[envKeyName]);
  if (envKey) {
    return { value: envKey, source: 'env' };
  }

  if (storedPrivateKey) {
    try {
      const normalized = normalizeEvmPrivateKey(storedPrivateKey);
      if (normalized) {
        return { value: normalized, source: 'store' };
      }
    } catch {
      logger.warn(`[WalletBootstrap] Stored ${envKeyName} is invalid and will be regenerated`);
    }
  }

  if (!autoCreateWallets) {
    return { source: 'missing' };
  }

  return {
    value: generatePrivateKey() as EvmPrivateKey,
    source: 'generated',
  };
}

function resolveSolanaWallet(
  storedSecretKeyBase64: string | undefined,
  autoCreateWallets: boolean
): ResolvedWallet<Uint8Array> {
  const envSecretKey = parseSolanaSecretKey(process.env.SOLANA_SECRET_KEY);
  if (envSecretKey) {
    return { value: envSecretKey, source: 'env' };
  }

  if (storedSecretKeyBase64) {
    try {
      return {
        value: decodeStoredSolanaSecretKey(storedSecretKeyBase64),
        source: 'store',
      };
    } catch {
      logger.warn('[WalletBootstrap] Stored SOLANA_SECRET_KEY is invalid and will be regenerated');
    }
  }

  if (!autoCreateWallets) {
    return { source: 'missing' };
  }

  return {
    value: Keypair.generate().secretKey,
    source: 'generated',
  };
}

export function bootstrapSafekeepingWalletConfig(): SafekeepingWalletBootstrapResult {
  const walletStorePath = resolveWalletStorePath();
  const autoCreateWallets = process.env.SAFEKEEPING_AUTO_CREATE_WALLETS !== 'false';
  const existingStore = tryReadWalletStore(walletStorePath);

  const ethereumWallet = resolveEvmWallet(
    'ETH_PRIVATE_KEY',
    existingStore?.wallets.ethereum?.privateKey,
    autoCreateWallets
  );
  const bscWallet = resolveEvmWallet(
    'BSC_PRIVATE_KEY',
    existingStore?.wallets.bsc?.privateKey,
    autoCreateWallets
  );
  const solanaWallet = resolveSolanaWallet(
    existingStore?.wallets.solana?.secretKeyBase64,
    autoCreateWallets
  );

  const chainSources: Partial<Record<Chain, WalletSource>> = {
    ethereum: ethereumWallet.source,
    bsc: bscWallet.source,
    solana: solanaWallet.source,
  };

  const generatedChains: Chain[] = [];
  for (const [chain, source] of Object.entries(chainSources) as Array<[Chain, WalletSource]>) {
    if (source === 'generated') {
      generatedChains.push(chain);
    }
  }

  const addresses: Partial<Record<Chain, string>> = {};
  if (ethereumWallet.value) {
    addresses.ethereum = privateKeyToAccount(ethereumWallet.value).address;
  }
  if (bscWallet.value) {
    addresses.bsc = privateKeyToAccount(bscWallet.value).address;
  }
  if (solanaWallet.value) {
    addresses.solana = Keypair.fromSecretKey(solanaWallet.value).publicKey.toBase58();
  }

  const config: MultiChainWalletConfig = {
    ethereum: ethereumWallet.value ? {
      privateKey: ethereumWallet.value,
      rpcUrl: process.env.ETH_RPC_URL || DEFAULT_RPC_URLS.ethereum,
      chainId: CHAIN_IDS.ethereum,
    } : undefined,
    bsc: bscWallet.value ? {
      privateKey: bscWallet.value,
      rpcUrl: process.env.BSC_RPC_URL || DEFAULT_RPC_URLS.bsc,
      chainId: CHAIN_IDS.bsc,
    } : undefined,
    solana: solanaWallet.value ? {
      secretKey: solanaWallet.value,
      rpcUrl: process.env.SOLANA_RPC_URL || DEFAULT_RPC_URLS.solana,
      commitment: parseSolanaCommitment(process.env.SOLANA_COMMITMENT),
    } : undefined,
  };

  const desiredStoreWallets: StoredWalletFile['wallets'] = {
    ethereum: ethereumWallet.value ? { privateKey: ethereumWallet.value } : undefined,
    bsc: bscWallet.value ? { privateKey: bscWallet.value } : undefined,
    solana: solanaWallet.value ? { secretKeyBase64: Buffer.from(solanaWallet.value).toString('base64') } : undefined,
  };

  const existingWalletsSerialized = JSON.stringify(existingStore?.wallets || {});
  const desiredWalletsSerialized = JSON.stringify(desiredStoreWallets);

  if (desiredWalletsSerialized !== '{}' && existingWalletsSerialized !== desiredWalletsSerialized) {
    try {
      writeWalletStore(walletStorePath, {
        version: WALLET_FILE_VERSION,
        updatedAt: new Date().toISOString(),
        wallets: desiredStoreWallets,
      });
    } catch (error) {
      // Generated keys must be persisted or they are lost after process exit.
      if (generatedChains.length > 0) {
        throw new Error(`Failed to persist generated wallets at ${walletStorePath}: ${error}`);
      }
      logger.warn(`[WalletBootstrap] Could not update wallet store at ${walletStorePath}: ${error}`);
    }
  }

  return {
    config,
    addresses,
    chainSources,
    walletStorePath,
    generatedChains,
  };
}
