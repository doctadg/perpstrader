"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapSafekeepingWalletConfig = bootstrapSafekeepingWalletConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const web3_js_1 = require("@solana/web3.js");
const accounts_1 = require("viem/accounts");
const logger_1 = __importDefault(require("../shared/logger"));
const constants_1 = require("./constants");
const WALLET_FILE_VERSION = 1;
const DEFAULT_WALLET_STORE_PATH = 'config/openclaw/wallets.json';
const LEGACY_WALLET_STORE_PATH = 'config/agent-wallets.json';
function resolveWalletStorePath() {
    const configuredPath = process.env.SAFEKEEPING_WALLET_STORE_PATH;
    if (configuredPath) {
        return path_1.default.isAbsolute(configuredPath)
            ? configuredPath
            : path_1.default.resolve(process.cwd(), configuredPath);
    }
    const preferredPath = path_1.default.resolve(process.cwd(), DEFAULT_WALLET_STORE_PATH);
    if (fs_1.default.existsSync(preferredPath)) {
        return preferredPath;
    }
    const legacyPath = path_1.default.resolve(process.cwd(), LEGACY_WALLET_STORE_PATH);
    if (fs_1.default.existsSync(legacyPath)) {
        logger_1.default.warn(`[WalletBootstrap] Using legacy wallet store at ${legacyPath}. ` +
            `Set SAFEKEEPING_WALLET_STORE_PATH=${DEFAULT_WALLET_STORE_PATH} to migrate.`);
        return legacyPath;
    }
    return preferredPath;
}
function parseSolanaCommitment(value) {
    if (value === 'processed' || value === 'confirmed' || value === 'finalized') {
        return value;
    }
    return 'confirmed';
}
function normalizeEvmPrivateKey(value) {
    if (!value) {
        return undefined;
    }
    const trimmed = value.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
        throw new Error('Invalid EVM private key format; expected 0x-prefixed 32-byte hex string');
    }
    return trimmed;
}
function parseSolanaSecretKey(value) {
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
        web3_js_1.Keypair.fromSecretKey(bytes);
        return bytes;
    }
    const bytes = Uint8Array.from(Buffer.from(trimmed, 'base64'));
    web3_js_1.Keypair.fromSecretKey(bytes);
    return bytes;
}
function decodeStoredSolanaSecretKey(secretKeyBase64) {
    const bytes = Uint8Array.from(Buffer.from(secretKeyBase64, 'base64'));
    web3_js_1.Keypair.fromSecretKey(bytes);
    return bytes;
}
function tryReadWalletStore(walletStorePath) {
    if (!fs_1.default.existsSync(walletStorePath)) {
        return undefined;
    }
    try {
        enforceStrictWalletFilePermissions(walletStorePath);
        const raw = fs_1.default.readFileSync(walletStorePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.version !== WALLET_FILE_VERSION || !parsed.wallets) {
            logger_1.default.warn(`[WalletBootstrap] Ignoring unsupported wallet store format at ${walletStorePath}`);
            return undefined;
        }
        return parsed;
    }
    catch (error) {
        logger_1.default.warn(`[WalletBootstrap] Failed to parse wallet store at ${walletStorePath}: ${error}`);
        return undefined;
    }
}
function writeWalletStore(walletStorePath, data) {
    const walletDir = path_1.default.dirname(walletStorePath);
    fs_1.default.mkdirSync(walletDir, { recursive: true, mode: 0o700 });
    fs_1.default.chmodSync(walletDir, 0o700);
    fs_1.default.writeFileSync(walletStorePath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    fs_1.default.chmodSync(walletStorePath, 0o600);
}
function enforceStrictWalletFilePermissions(walletStorePath) {
    try {
        const walletDir = path_1.default.dirname(walletStorePath);
        if (fs_1.default.existsSync(walletDir)) {
            const walletDirMode = fs_1.default.statSync(walletDir).mode & 0o777;
            if ((walletDirMode & 0o077) !== 0) {
                fs_1.default.chmodSync(walletDir, 0o700);
            }
        }
        const walletFileMode = fs_1.default.statSync(walletStorePath).mode & 0o777;
        if ((walletFileMode & 0o077) !== 0) {
            fs_1.default.chmodSync(walletStorePath, 0o600);
            logger_1.default.warn(`[WalletBootstrap] Tightened wallet file permissions for ${walletStorePath} to 600`);
        }
    }
    catch (error) {
        logger_1.default.warn(`[WalletBootstrap] Permission hardening skipped for ${walletStorePath}: ${error}`);
    }
}
function resolveEvmWallet(envKeyName, storedPrivateKey, autoCreateWallets) {
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
        }
        catch {
            logger_1.default.warn(`[WalletBootstrap] Stored ${envKeyName} is invalid and will be regenerated`);
        }
    }
    if (!autoCreateWallets) {
        return { source: 'missing' };
    }
    return {
        value: (0, accounts_1.generatePrivateKey)(),
        source: 'generated',
    };
}
function resolveSolanaWallet(storedSecretKeyBase64, autoCreateWallets) {
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
        }
        catch {
            logger_1.default.warn('[WalletBootstrap] Stored SOLANA_SECRET_KEY is invalid and will be regenerated');
        }
    }
    if (!autoCreateWallets) {
        return { source: 'missing' };
    }
    return {
        value: web3_js_1.Keypair.generate().secretKey,
        source: 'generated',
    };
}
function bootstrapSafekeepingWalletConfig() {
    const walletStorePath = resolveWalletStorePath();
    const autoCreateWallets = process.env.SAFEKEEPING_AUTO_CREATE_WALLETS !== 'false';
    const existingStore = tryReadWalletStore(walletStorePath);
    const ethereumWallet = resolveEvmWallet('ETH_PRIVATE_KEY', existingStore?.wallets.ethereum?.privateKey, autoCreateWallets);
    const bscWallet = resolveEvmWallet('BSC_PRIVATE_KEY', existingStore?.wallets.bsc?.privateKey, autoCreateWallets);
    const solanaWallet = resolveSolanaWallet(existingStore?.wallets.solana?.secretKeyBase64, autoCreateWallets);
    const chainSources = {
        ethereum: ethereumWallet.source,
        bsc: bscWallet.source,
        solana: solanaWallet.source,
    };
    const generatedChains = [];
    for (const [chain, source] of Object.entries(chainSources)) {
        if (source === 'generated') {
            generatedChains.push(chain);
        }
    }
    const addresses = {};
    if (ethereumWallet.value) {
        addresses.ethereum = (0, accounts_1.privateKeyToAccount)(ethereumWallet.value).address;
    }
    if (bscWallet.value) {
        addresses.bsc = (0, accounts_1.privateKeyToAccount)(bscWallet.value).address;
    }
    if (solanaWallet.value) {
        addresses.solana = web3_js_1.Keypair.fromSecretKey(solanaWallet.value).publicKey.toBase58();
    }
    const config = {
        ethereum: ethereumWallet.value ? {
            privateKey: ethereumWallet.value,
            rpcUrl: process.env.ETH_RPC_URL || constants_1.DEFAULT_RPC_URLS.ethereum,
            chainId: constants_1.CHAIN_IDS.ethereum,
        } : undefined,
        bsc: bscWallet.value ? {
            privateKey: bscWallet.value,
            rpcUrl: process.env.BSC_RPC_URL || constants_1.DEFAULT_RPC_URLS.bsc,
            chainId: constants_1.CHAIN_IDS.bsc,
        } : undefined,
        solana: solanaWallet.value ? {
            secretKey: solanaWallet.value,
            rpcUrl: process.env.SOLANA_RPC_URL || constants_1.DEFAULT_RPC_URLS.solana,
            commitment: parseSolanaCommitment(process.env.SOLANA_COMMITMENT),
        } : undefined,
    };
    const desiredStoreWallets = {
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
        }
        catch (error) {
            // Generated keys must be persisted or they are lost after process exit.
            if (generatedChains.length > 0) {
                throw new Error(`Failed to persist generated wallets at ${walletStorePath}: ${error}`);
            }
            logger_1.default.warn(`[WalletBootstrap] Could not update wallet store at ${walletStorePath}: ${error}`);
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
//# sourceMappingURL=wallet-bootstrap.js.map