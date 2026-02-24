"use strict";
// Solana RPC Service for pump.fun Token Monitoring
// Handles Solana blockchain interactions for token discovery and security analysis
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var web3_js_1 = require("@solana/web3.js");
var axios_1 = require("axios");
var config_1 = require("../../shared/config");
var logger_1 = require("../../shared/logger");
// pump.fun Program ID
var PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkjon8nkdqXHDr3EbmLB4TqRASFjZxb';
// Metaplex Metadata Program ID
var METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
// Metadata account seed
var METADATA_SEED = 'metadata';
/**
 * Solana RPC Service for pump.fun token monitoring
 */
var SolanaRPCService = /** @class */ (function () {
    function SolanaRPCService() {
        var _a, _b, _c;
        this.connection = null;
        this.subscriptionId = null;
        var config = config_1.default.get();
        this.rpcUrl = ((_a = config.solana) === null || _a === void 0 ? void 0 : _a.rpcUrl) || 'https://api.mainnet-beta.solana.com';
        this.wsUrl = ((_b = config.solana) === null || _b === void 0 ? void 0 : _b.wsUrl) || this.rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        this.commitment = ((_c = config.solana) === null || _c === void 0 ? void 0 : _c.commitment) || 'confirmed';
    }
    /**
     * Connect to Solana RPC
     */
    SolanaRPCService.prototype.connect = function () {
        return __awaiter(this, void 0, void 0, function () {
            var version, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        // Connection constructor requires HTTP URL; wsEndpoint is for WebSocket subscriptions
                        this.connection = new web3_js_1.Connection(this.rpcUrl, {
                            commitment: this.commitment,
                            wsEndpoint: this.wsUrl,
                        });
                        return [4 /*yield*/, this.connection.getVersion()];
                    case 1:
                        version = _a.sent();
                        logger_1.default.info("[SolanaRPC] Connected to Solana RPC: ".concat(version['solana-core']));
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        logger_1.default.error("[SolanaRPC] Failed to connect: ".concat(error_1));
                        throw error_1;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Subscribe to pump.fun token creation events
     */
    SolanaRPCService.prototype.subscribeToTokenLaunches = function (callback_1) {
        return __awaiter(this, arguments, void 0, function (callback, durationMs) {
            var programId, seenMints;
            var _this = this;
            if (durationMs === void 0) { durationMs = 30000; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.connection) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.connect()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        programId = new web3_js_1.PublicKey(PUMPFUN_PROGRAM_ID);
                        seenMints = new Set();
                        logger_1.default.info("[SolanaRPC] Subscribing to pump.fun program: ".concat(PUMPFUN_PROGRAM_ID));
                        this.subscriptionId = this.connection.onLogs(programId, function (logs, context) {
                            try {
                                // Parse logs for token creation events
                                var token = _this.parseTokenCreationEvent(logs, context);
                                if (token && !seenMints.has(token.mintAddress)) {
                                    seenMints.add(token.mintAddress);
                                    logger_1.default.info("[SolanaRPC] Discovered token: ".concat(token.symbol, " (").concat(token.mintAddress, ")"));
                                    callback(token);
                                }
                            }
                            catch (error) {
                                logger_1.default.warn("[SolanaRPC] Failed to parse logs: ".concat(error));
                            }
                        }, this.commitment);
                        logger_1.default.info("[SolanaRPC] Subscription active for ".concat(durationMs, "ms"));
                        // Auto-unsubscribe after duration
                        setTimeout(function () {
                            _this.unsubscribe();
                            logger_1.default.info("[SolanaRPC] Subscription ended. Discovered ".concat(seenMints.size, " tokens."));
                        }, durationMs);
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Parse pump.fun log data to extract token creation event
     */
    SolanaRPCService.prototype.parseTokenCreationEvent = function (logs, context) {
        try {
            // Check if logs contain pump.fun specific patterns
            var logStrings = logs.logs || [];
            // pump.fun create events typically contain "Program log: Instruction: Create" or similar
            // The actual mint address can be found in the signature or parsed from log data
            // For now, extract from the signature (first account in the transaction is usually the mint)
            var signature = context.signature;
            if (!signature)
                return null;
            // Parse transaction to get actual token details
            // This is a simplified version - in production we'd fetch and parse the full transaction
            // For now, return a placeholder that will be filled in by fetchMetadata
            return {
                mintAddress: '', // Will be filled when fetching transaction details
                name: 'Unknown',
                symbol: 'UNKNOWN',
                metadataUri: '',
                createdAt: new Date(),
                txSignature: signature,
            };
        }
        catch (error) {
            logger_1.default.warn("[SolanaRPC] Failed to parse token creation event: ".concat(error));
            return null;
        }
    };
    /**
     * Get mint account information for security analysis
     */
    SolanaRPCService.prototype.getMintInfo = function (mintAddress) {
        return __awaiter(this, void 0, void 0, function () {
            var mintPubkey, accountInfo, data, mintAuthorityOption, supply, decimals, freezeAuthorityOption, isMintable, isFreezable, riskLevel, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.connection) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.connect()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        mintPubkey = new web3_js_1.PublicKey(mintAddress);
                        return [4 /*yield*/, this.connection.getAccountInfo(mintPubkey)];
                    case 3:
                        accountInfo = _a.sent();
                        if (!accountInfo || !accountInfo.data) {
                            throw new Error("No account info for mint: ".concat(mintAddress));
                        }
                        data = Buffer.from(accountInfo.data);
                        mintAuthorityOption = data.readUInt32LE(0);
                        supply = data.readBigUInt64LE(36);
                        decimals = data.readUInt8(44);
                        freezeAuthorityOption = data.readUInt32LE(45);
                        isMintable = mintAuthorityOption === 1;
                        isFreezable = freezeAuthorityOption === 1;
                        riskLevel = 'LOW';
                        if (isMintable && isFreezable) {
                            riskLevel = 'HIGH';
                        }
                        else if (isMintable || isFreezable) {
                            riskLevel = 'MEDIUM';
                        }
                        return [2 /*return*/, {
                                mintAuthority: isMintable ? 'SET' : null,
                                freezeAuthority: isFreezable ? 'SET' : null,
                                decimals: decimals,
                                supply: supply,
                                isMintable: isMintable,
                                isFreezable: isFreezable,
                                metadataHash: '', // Could be derived from on-chain data
                                riskLevel: riskLevel,
                            }];
                    case 4:
                        error_2 = _a.sent();
                        logger_1.default.error("[SolanaRPC] Failed to get mint info: ".concat(error_2));
                        // Return safe defaults on error
                        return [2 /*return*/, {
                                mintAuthority: null,
                                freezeAuthority: null,
                                decimals: 0,
                                supply: 0n,
                                isMintable: false,
                                isFreezable: false,
                                metadataHash: '',
                                riskLevel: 'HIGH', // Assume high risk if we can't verify
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get token metadata from Metaplex metadata account
     * Uses HTTP API for metadata fetching (more reliable than direct RPC for metadata)
     */
    SolanaRPCService.prototype.getTokenMetadata = function (mintAddress) {
        return __awaiter(this, void 0, void 0, function () {
            var mintPubkey, metadataPDA, metadataUri, metadataAccount, error_3, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 9, , 10]);
                        mintPubkey = new web3_js_1.PublicKey(mintAddress);
                        return [4 /*yield*/, this.getMetadataPDA(mintPubkey)];
                    case 1:
                        metadataPDA = _a.sent();
                        metadataUri = '';
                        if (!this.connection) return [3 /*break*/, 5];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.connection.getAccountInfo(metadataPDA)];
                    case 3:
                        metadataAccount = _a.sent();
                        if (metadataAccount && metadataAccount.data) {
                            // Parse metadata (simplified - Metaplex metadata is borsh serialized)
                            // For production, use @metaplex-foundation/js
                            metadataUri = this.extractMetadataUri(metadataAccount.data);
                        }
                        return [3 /*break*/, 5];
                    case 4:
                        error_3 = _a.sent();
                        logger_1.default.debug("[SolanaRPC] Could not fetch metadata from RPC: ".concat(error_3));
                        return [3 /*break*/, 5];
                    case 5:
                        if (!metadataUri) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.fetchMetadataFromUri(metadataUri)];
                    case 6: return [2 /*return*/, _a.sent()];
                    case 7: return [4 /*yield*/, this.fetchPumpFunMetadata(mintAddress)];
                    case 8: 
                    // Fallback: try to get from pump.fun API
                    return [2 /*return*/, _a.sent()];
                    case 9:
                        error_4 = _a.sent();
                        logger_1.default.error("[SolanaRPC] Failed to get token metadata: ".concat(error_4));
                        return [2 /*return*/, null];
                    case 10: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Derive Metaplex metadata PDA for a mint
     */
    SolanaRPCService.prototype.getMetadataPDA = function (mint) {
        return __awaiter(this, void 0, void 0, function () {
            var metadataProgramId, seeds, pda;
            return __generator(this, function (_a) {
                metadataProgramId = new web3_js_1.PublicKey(METADATA_PROGRAM_ID);
                seeds = [
                    Buffer.from(METADATA_SEED),
                    metadataProgramId.toBuffer(),
                    mint.toBuffer(),
                ];
                pda = web3_js_1.PublicKey.findProgramAddressSync(seeds, metadataProgramId)[0];
                return [2 /*return*/, pda];
            });
        });
    };
    /**
     * Extract metadata URI from raw metadata account data
     * This is a simplified version - production should use proper borsh deserialization
     */
    SolanaRPCService.prototype.extractMetadataUri = function (data) {
        try {
            // Skip metadata header (1 byte key + 32 bytes update authority + optional cretor)
            // The URI is usually after the name and symbol fields
            // This is a placeholder - proper implementation requires borsh parsing
            // For now, return empty and let the pump.fun API fallback handle it
            return '';
        }
        catch (error) {
            return '';
        }
    };
    /**
     * Fetch metadata from Arweave/IPFS URI
     */
    SolanaRPCService.prototype.fetchMetadataFromUri = function (uri) {
        return __awaiter(this, void 0, void 0, function () {
            var response, data, error_5;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, axios_1.default.get(uri, { timeout: 10000 })];
                    case 1:
                        response = _e.sent();
                        data = response.data;
                        return [2 /*return*/, {
                                name: data.name || 'Unknown',
                                symbol: data.symbol || 'UNKNOWN',
                                description: data.description || '',
                                image: data.image || '',
                                website: (_a = data.extensions) === null || _a === void 0 ? void 0 : _a.website,
                                twitter: (_b = data.extensions) === null || _b === void 0 ? void 0 : _b.twitter,
                                telegram: (_c = data.extensions) === null || _c === void 0 ? void 0 : _c.telegram,
                                discord: (_d = data.extensions) === null || _d === void 0 ? void 0 : _d.discord,
                                extensions: data.extensions || {},
                            }];
                    case 2:
                        error_5 = _e.sent();
                        logger_1.default.warn("[SolanaRPC] Failed to fetch metadata from URI ".concat(uri, ": ").concat(error_5));
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Fetch token metadata from pump.fun API (fallback)
     */
    SolanaRPCService.prototype.fetchPumpFunMetadata = function (mintAddress) {
        return __awaiter(this, void 0, void 0, function () {
            var response, data, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, axios_1.default.get("https://api.pump.fun/coins/".concat(mintAddress), { timeout: 10000 })];
                    case 1:
                        response = _a.sent();
                        data = response.data;
                        return [2 /*return*/, {
                                name: data.name || 'Unknown',
                                symbol: data.symbol || 'UNKNOWN',
                                description: data.description || '',
                                image: data.image || '',
                                website: data.website || data.website_url || undefined,
                                twitter: data.twitter,
                                telegram: data.telegram,
                                discord: data.discord,
                                extensions: {
                                    bondingCurveKey: data.bonding_curve_key,
                                },
                            }];
                    case 2:
                        error_6 = _a.sent();
                        logger_1.default.warn("[SolanaRPC] Failed to fetch from pump.fun API: ".concat(error_6));
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get detailed transaction information
     */
    SolanaRPCService.prototype.getTransaction = function (signature) {
        return __awaiter(this, void 0, void 0, function () {
            var tx, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.connection) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.connect()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 })];
                    case 3:
                        tx = _a.sent();
                        return [2 /*return*/, tx];
                    case 4:
                        error_7 = _a.sent();
                        logger_1.default.error("[SolanaRPC] Failed to get transaction: ".concat(error_7));
                        return [2 /*return*/, null];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Unsubscribe from logs
     */
    SolanaRPCService.prototype.unsubscribe = function () {
        if (this.subscriptionId !== null && this.connection) {
            try {
                // Try removeOnLogs first (older versions)
                if (typeof this.connection.removeOnLogs === 'function') {
                    this.connection.removeOnLogs(this.subscriptionId);
                }
            }
            catch (error) {
                // Ignore error, subscription will timeout naturally
                logger_1.default.debug('[SolanaRPC] removeOnLogs not available or failed:', error);
            }
            this.subscriptionId = null;
            logger_1.default.info('[SolanaRPC] Unsubscribed from pump.fun program');
        }
    };
    /**
     * Disconnect from Solana RPC
     */
    SolanaRPCService.prototype.disconnect = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.unsubscribe();
                this.connection = null;
                logger_1.default.info('[SolanaRPC] Disconnected');
                return [2 /*return*/];
            });
        });
    };
    /**
     * Get connection status
     */
    SolanaRPCService.prototype.isConnected = function () {
        return this.connection !== null;
    };
    return SolanaRPCService;
}());
// Singleton instance
var solanaRPCService = new SolanaRPCService();
exports.default = solanaRPCService;
