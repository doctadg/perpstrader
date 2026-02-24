"use strict";
/**
 * Hyperliquid SDK Client Wrapper
 *
 * Provides a centralized interface for interacting with Hyperliquid testnet/mainnet
 * using the @nktkas/hyperliquid SDK with proper EIP-712 signing.
 *
 * Enhanced with Nautilus-inspired features:
 * - Token bucket rate limiting
 * - Overfill protection
 * - State snapshots
 * - Message bus integration
 */
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
exports.HyperliquidClient = void 0;
var hyperliquid_1 = require("@nktkas/hyperliquid");
var accounts_1 = require("viem/accounts");
var logger_1 = require("../shared/logger");
var config_1 = require("../shared/config");
var token_bucket_1 = require("../infrastructure/token-bucket");
var overfill_protection_1 = require("../infrastructure/overfill-protection");
var uuid_1 = require("uuid");
// Asset index mapping (updated from meta on init)
var ASSET_INDICES = {
    'BTC': 0,
    'ETH': 4,
    'SOL': 7,
    // Will be populated dynamically from meta
};
var HyperliquidClient = /** @class */ (function () {
    function HyperliquidClient() {
        this.walletClient = null;
        this.wallet = null;
        this.walletAddress = '';
        this.userAddress = '';
        this.assetIndices = new Map();
        this.assetNames = new Map();
        this.isInitialized = false;
        var hyperliquidConfig = config_1.default.getSection('hyperliquid');
        this.isTestnet = hyperliquidConfig.testnet;
        // Initialize HTTP transport with testnet flag
        this.transport = new hyperliquid_1.HttpTransport({
            isTestnet: this.isTestnet,
            timeout: 30000
        });
        // Public client for reading data (no wallet needed)
        this.publicClient = new hyperliquid_1.PublicClient({ transport: this.transport });
        // Try to initialize wallet from private key
        // Support both apiSecret (legacy) and privateKey naming
        var privateKey = hyperliquidConfig.privateKey || hyperliquidConfig.apiSecret;
        var mainAddress = hyperliquidConfig.mainAddress || hyperliquidConfig.apiKey;
        if (privateKey && privateKey.startsWith('0x') && privateKey.length === 66) {
            try {
                this.wallet = (0, accounts_1.privateKeyToAccount)(privateKey);
                this.walletAddress = this.wallet.address;
                // If mainAddress is configured, use it as the target user address
                // Otherwise use the signer's address
                this.userAddress = mainAddress || this.walletAddress;
                // Wallet client for trading
                this.walletClient = new hyperliquid_1.WalletClient({
                    transport: this.transport,
                    wallet: this.wallet,
                    isTestnet: this.isTestnet
                    // defaultVaultAddress: mainAddress ? (mainAddress as `0x${string}`) : undefined
                });
                logger_1.default.info("Hyperliquid client initialized with wallet: ".concat(this.walletAddress.slice(0, 10), "..."));
                if (mainAddress) {
                    logger_1.default.info("Acting on behalf of main user: ".concat(this.userAddress.slice(0, 10), "..."));
                }
            }
            catch (error) {
                logger_1.default.error('Failed to initialize wallet from private key:', error);
            }
        }
        else {
            logger_1.default.warn('No valid private key configured - trading will be disabled');
        }
        logger_1.default.info("Hyperliquid client configured for ".concat(this.isTestnet ? 'TESTNET' : 'MAINNET'));
    }
    /**
     * Initialize asset indices from the API
     */
    HyperliquidClient.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var meta, i, asset, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.isInitialized)
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.publicClient.meta()];
                    case 2:
                        meta = _a.sent();
                        if (meta && meta.universe) {
                            for (i = 0; i < meta.universe.length; i++) {
                                asset = meta.universe[i];
                                this.assetIndices.set(asset.name, i);
                                this.assetNames.set(i, asset.name);
                                ASSET_INDICES[asset.name] = i;
                            }
                            logger_1.default.info("Loaded ".concat(meta.universe.length, " asset indices from Hyperliquid meta"));
                        }
                        this.isInitialized = true;
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        logger_1.default.error('Failed to initialize Hyperliquid client:', error_1);
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if the client is configured for trading
     */
    HyperliquidClient.prototype.isConfigured = function () {
        return this.walletClient !== null && this.wallet !== null;
    };
    /**
     * Get the wallet address (signer)
     */
    HyperliquidClient.prototype.getWalletAddress = function () {
        return this.walletAddress;
    };
    /**
     * Get the user address (target account)
     */
    HyperliquidClient.prototype.getUserAddress = function () {
        return this.userAddress;
    };
    /**
     * Get asset index by symbol
     */
    HyperliquidClient.prototype.getAssetIndex = function (symbol) {
        var _a;
        return (_a = this.assetIndices.get(symbol)) !== null && _a !== void 0 ? _a : ASSET_INDICES[symbol];
    };
    /**
     * Get all current mid prices (with rate limiting)
     */
    HyperliquidClient.prototype.getAllMids = function () {
        return __awaiter(this, void 0, void 0, function () {
            var mids, result, _i, _a, _b, symbol, price, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: 
                    // Apply rate limiting for info endpoint
                    return [4 /*yield*/, token_bucket_1.hyperliquidRateLimiter.throttleInfoRequest(2)];
                    case 1:
                        // Apply rate limiting for info endpoint
                        _c.sent();
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.publicClient.allMids()];
                    case 3:
                        mids = _c.sent();
                        result = {};
                        for (_i = 0, _a = Object.entries(mids); _i < _a.length; _i++) {
                            _b = _a[_i], symbol = _b[0], price = _b[1];
                            result[symbol] = parseFloat(price);
                        }
                        return [2 /*return*/, result];
                    case 4:
                        error_2 = _c.sent();
                        logger_1.default.error('Failed to get all mids:', error_2);
                        throw error_2;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get account state (balance, positions) - with rate limiting
     */
    HyperliquidClient.prototype.getAccountState = function () {
        return __awaiter(this, void 0, void 0, function () {
            var state, positions, _i, _a, assetPos, pos, size, error_3;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: 
                    // Apply rate limiting for info endpoint
                    return [4 /*yield*/, token_bucket_1.hyperliquidRateLimiter.throttleInfoRequest(60)];
                    case 1:
                        // Apply rate limiting for info endpoint
                        _c.sent();
                        if (!this.userAddress) {
                            throw new Error('No wallet configured');
                        }
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.publicClient.clearinghouseState({ user: this.userAddress })];
                    case 3:
                        state = _c.sent();
                        positions = [];
                        if (state.assetPositions) {
                            for (_i = 0, _a = state.assetPositions; _i < _a.length; _i++) {
                                assetPos = _a[_i];
                                pos = assetPos.position;
                                size = parseFloat(pos.szi);
                                if (size !== 0) {
                                    positions.push({
                                        symbol: pos.coin,
                                        side: size > 0 ? 'LONG' : 'SHORT',
                                        size: Math.abs(size),
                                        entryPrice: parseFloat(pos.entryPx || '0'),
                                        markPrice: parseFloat(pos.positionValue) / Math.abs(size),
                                        unrealizedPnL: parseFloat(pos.unrealizedPnl),
                                        leverage: parseFloat((((_b = assetPos.position.leverage) === null || _b === void 0 ? void 0 : _b.value) || '1').toString()),
                                        marginUsed: parseFloat(pos.marginUsed || '0')
                                    });
                                }
                            }
                        }
                        return [2 /*return*/, {
                                equity: parseFloat(state.marginSummary.accountValue),
                                withdrawable: parseFloat(state.withdrawable),
                                positions: positions,
                                marginUsed: parseFloat(state.marginSummary.totalMarginUsed)
                            }];
                    case 4:
                        error_3 = _c.sent();
                        logger_1.default.error('Failed to get account state:', error_3);
                        throw error_3;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get open orders
     */
    HyperliquidClient.prototype.getOpenOrders = function () {
        return __awaiter(this, void 0, void 0, function () {
            var orders, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.userAddress) {
                            throw new Error('No wallet configured');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.publicClient.openOrders({ user: this.userAddress })];
                    case 2:
                        orders = _a.sent();
                        return [2 /*return*/, orders || []];
                    case 3:
                        error_4 = _a.sent();
                        logger_1.default.error('Failed to get open orders:', error_4);
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Place an order (enhanced with rate limiting, retry logic, and overfill protection)
     */
    HyperliquidClient.prototype.placeOrder = function (params) {
        return __awaiter(this, void 0, void 0, function () {
            var clientOrderId, assetIndex, maxRetries, lastError, _loop_1, this_1, attempt, state_1;
            var _a, _b, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        if (!this.walletClient) {
                            return [2 /*return*/, {
                                    success: false,
                                    status: 'NO_WALLET',
                                    error: 'No wallet configured for trading'
                                }];
                        }
                        clientOrderId = params.clientOrderId || (0, uuid_1.v4)();
                        // Register order for overfill protection
                        overfill_protection_1.default.registerOrder({
                            orderId: clientOrderId,
                            clientOrderId: clientOrderId,
                            symbol: params.symbol,
                            side: params.side,
                            orderQty: params.size,
                            filledQty: 0,
                            avgPx: params.price || 0,
                            status: 'PENDING',
                            timestamp: Date.now(),
                        });
                        return [4 /*yield*/, this.initialize()];
                    case 1:
                        _e.sent();
                        assetIndex = this.getAssetIndex(params.symbol);
                        if (assetIndex === undefined) {
                            return [2 /*return*/, {
                                    success: false,
                                    status: 'INVALID_SYMBOL',
                                    error: "Unknown symbol: ".concat(params.symbol)
                                }];
                        }
                        maxRetries = 3;
                        lastError = null;
                        _loop_1 = function (attempt) {
                            var orderPrice, mids, midPrice, slippageMultiplier, formattedPrice, formattedSize, result, response, orderStatus, errorMessage, error_5, isRetryable, backoffMs_1;
                            return __generator(this, function (_f) {
                                switch (_f.label) {
                                    case 0:
                                        _f.trys.push([0, 5, , 6]);
                                        // Apply rate limiting before each attempt
                                        return [4 /*yield*/, token_bucket_1.hyperliquidRateLimiter.throttleExchangeRequest(1)];
                                    case 1:
                                        // Apply rate limiting before each attempt
                                        _f.sent();
                                        orderPrice = params.price;
                                        if (!!orderPrice) return [3 /*break*/, 3];
                                        return [4 /*yield*/, this_1.getAllMids()];
                                    case 2:
                                        mids = _f.sent();
                                        midPrice = mids[params.symbol];
                                        if (!midPrice) {
                                            return [2 /*return*/, { value: {
                                                        success: false,
                                                        status: 'NO_PRICE',
                                                        error: "Could not get price for ".concat(params.symbol)
                                                    } }];
                                        }
                                        slippageMultiplier = 1 + (attempt * 0.005);
                                        orderPrice = params.side === 'BUY'
                                            ? midPrice * (1.01 + (attempt * 0.005)) // More aggressive on retries
                                            : midPrice * (0.99 - (attempt * 0.005));
                                        _f.label = 3;
                                    case 3:
                                        formattedPrice = this_1.formatPrice(orderPrice, params.symbol);
                                        formattedSize = this_1.formatSize(params.size, params.symbol);
                                        logger_1.default.info("[Attempt ".concat(attempt + 1, "/").concat(maxRetries, "] Placing order: ").concat(params.side, " ").concat(formattedSize, " ").concat(params.symbol, " @ ").concat(formattedPrice));
                                        return [4 /*yield*/, this_1.walletClient.order({
                                                orders: [{
                                                        a: assetIndex,
                                                        b: params.side === 'BUY',
                                                        p: formattedPrice,
                                                        s: formattedSize,
                                                        r: params.reduceOnly || false,
                                                        t: params.orderType === 'market'
                                                            ? { limit: { tif: 'Ioc' } } // IOC for market-like execution
                                                            : { limit: { tif: 'Gtc' } } // GTC for limit orders
                                                    }],
                                                grouping: 'na'
                                            })];
                                    case 4:
                                        result = _f.sent();
                                        if (result.status === 'ok') {
                                            response = result.response;
                                            orderStatus = (_b = (_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.statuses) === null || _b === void 0 ? void 0 : _b[0];
                                            if (orderStatus === null || orderStatus === void 0 ? void 0 : orderStatus.filled) {
                                                logger_1.default.info("Order filled: ".concat(params.side, " ").concat(formattedSize, " ").concat(params.symbol, " @ ").concat(orderStatus.filled.avgPx || formattedPrice));
                                                return [2 /*return*/, { value: {
                                                            success: true,
                                                            orderId: (_c = orderStatus.filled.oid) === null || _c === void 0 ? void 0 : _c.toString(),
                                                            filledPrice: parseFloat(orderStatus.filled.avgPx || formattedPrice),
                                                            filledSize: parseFloat(orderStatus.filled.totalSz || formattedSize),
                                                            status: 'FILLED'
                                                        } }];
                                            }
                                            else if (orderStatus === null || orderStatus === void 0 ? void 0 : orderStatus.resting) {
                                                logger_1.default.info("Order resting: ".concat(params.side, " ").concat(formattedSize, " ").concat(params.symbol, " @ ").concat(formattedPrice));
                                                return [2 /*return*/, { value: {
                                                            success: true,
                                                            orderId: (_d = orderStatus.resting.oid) === null || _d === void 0 ? void 0 : _d.toString(),
                                                            status: 'RESTING'
                                                        } }];
                                            }
                                            else if (orderStatus === null || orderStatus === void 0 ? void 0 : orderStatus.error) {
                                                errorMessage = String(orderStatus.error).toLowerCase();
                                                if (errorMessage.includes('insufficient') || errorMessage.includes('margin')) {
                                                    return [2 /*return*/, { value: {
                                                                success: false,
                                                                status: 'ERROR',
                                                                error: orderStatus.error
                                                            } }];
                                                }
                                                lastError = orderStatus.error;
                                            }
                                            else {
                                                // Status OK but no clear fill/resting - check response data
                                                logger_1.default.warn("Order response unclear: ".concat(JSON.stringify(response)));
                                                return [2 /*return*/, { value: {
                                                            success: true,
                                                            status: 'OK'
                                                        } }];
                                            }
                                        }
                                        else {
                                            lastError = "Order failed: ".concat(JSON.stringify(result));
                                            logger_1.default.warn("[Attempt ".concat(attempt + 1, "/").concat(maxRetries, "] ").concat(lastError));
                                        }
                                        return [3 /*break*/, 6];
                                    case 5:
                                        error_5 = _f.sent();
                                        lastError = error_5;
                                        isRetryable = this_1.isRetryableError(error_5);
                                        logger_1.default.error("[Attempt ".concat(attempt + 1, "/").concat(maxRetries, "] Order error:"), error_5);
                                        if (!isRetryable || attempt >= maxRetries - 1) {
                                            return [2 /*return*/, { value: {
                                                        success: false,
                                                        status: 'EXCEPTION',
                                                        error: error_5.message || String(error_5)
                                                    } }];
                                        }
                                        return [3 /*break*/, 6];
                                    case 6:
                                        if (!(attempt < maxRetries - 1)) return [3 /*break*/, 8];
                                        backoffMs_1 = Math.min(1000 * Math.pow(2, attempt), 5000);
                                        logger_1.default.info("Retrying in ".concat(backoffMs_1, "ms..."));
                                        return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, backoffMs_1); })];
                                    case 7:
                                        _f.sent();
                                        _f.label = 8;
                                    case 8: return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        attempt = 0;
                        _e.label = 2;
                    case 2:
                        if (!(attempt < maxRetries)) return [3 /*break*/, 5];
                        return [5 /*yield**/, _loop_1(attempt)];
                    case 3:
                        state_1 = _e.sent();
                        if (typeof state_1 === "object")
                            return [2 /*return*/, state_1.value];
                        _e.label = 4;
                    case 4:
                        attempt++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/, {
                            success: false,
                            status: 'RETRY_EXHAUSTED',
                            error: (lastError === null || lastError === void 0 ? void 0 : lastError.message) || String(lastError) || 'Max retries exceeded'
                        }];
                }
            });
        });
    };
    /**
     * Check if an error is retryable (temporary network/server issues)
     */
    HyperliquidClient.prototype.isRetryableError = function (error) {
        var errorMessage = String((error === null || error === void 0 ? void 0 : error.message) || error || '').toLowerCase();
        var retryablePatterns = [
            'timeout', 'timed out',
            'network', 'connection',
            '502', '503', '504', '500', // HTTP server errors
            'econnreset', 'etimedout',
            'rate limit',
        ];
        return retryablePatterns.some(function (pattern) { return errorMessage.includes(pattern); });
    };
    /**
     * Cancel an order
     */
    HyperliquidClient.prototype.cancelOrder = function (symbol, orderId) {
        return __awaiter(this, void 0, void 0, function () {
            var assetIndex, result, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.walletClient) {
                            logger_1.default.error('No wallet configured for trading');
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        assetIndex = this.getAssetIndex(symbol);
                        if (assetIndex === undefined) {
                            logger_1.default.error("Unknown symbol: ".concat(symbol));
                            return [2 /*return*/, false];
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.walletClient.cancel({
                                cancels: [{
                                        a: assetIndex,
                                        o: parseInt(orderId)
                                    }]
                            })];
                    case 3:
                        result = _a.sent();
                        return [2 /*return*/, result.status === 'ok'];
                    case 4:
                        error_6 = _a.sent();
                        logger_1.default.error('Failed to cancel order:', error_6);
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Cancel all open orders
     */
    HyperliquidClient.prototype.cancelAllOrders = function () {
        return __awaiter(this, void 0, void 0, function () {
            var openOrders, _i, openOrders_1, order, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        return [4 /*yield*/, this.getOpenOrders()];
                    case 1:
                        openOrders = _a.sent();
                        _i = 0, openOrders_1 = openOrders;
                        _a.label = 2;
                    case 2:
                        if (!(_i < openOrders_1.length)) return [3 /*break*/, 5];
                        order = openOrders_1[_i];
                        return [4 /*yield*/, this.cancelOrder(order.coin, order.oid.toString())];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/, true];
                    case 6:
                        error_7 = _a.sent();
                        logger_1.default.error('Failed to cancel all orders:', error_7);
                        return [2 /*return*/, false];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Update leverage for a symbol
     */
    HyperliquidClient.prototype.updateLeverage = function (symbol_1, leverage_1) {
        return __awaiter(this, arguments, void 0, function (symbol, leverage, isCross) {
            var assetIndex, result, error_8;
            if (isCross === void 0) { isCross = true; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.walletClient) {
                            logger_1.default.error('No wallet configured for trading');
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, this.initialize()];
                    case 1:
                        _a.sent();
                        assetIndex = this.getAssetIndex(symbol);
                        if (assetIndex === undefined) {
                            logger_1.default.error("Unknown symbol: ".concat(symbol));
                            return [2 /*return*/, false];
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.walletClient.updateLeverage({
                                asset: assetIndex,
                                leverage: leverage,
                                isCross: isCross
                            })];
                    case 3:
                        result = _a.sent();
                        return [2 /*return*/, result.status === 'ok'];
                    case 4:
                        error_8 = _a.sent();
                        logger_1.default.error('Failed to update leverage:', error_8);
                        return [2 /*return*/, false];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Format price to appropriate precision for the asset
     * BTC uses $1 tick, ETH uses $0.1, SOL/others use $0.01
     */
    HyperliquidClient.prototype.formatPrice = function (price, symbol) {
        // Different assets have different tick sizes on Hyperliquid
        if (symbol === 'BTC') {
            // BTC: $1 tick size - round to nearest integer
            return Math.round(price).toString();
        }
        else if (symbol === 'ETH') {
            // ETH: $0.1 tick size
            return (Math.round(price * 10) / 10).toFixed(1);
        }
        else {
            // Most other assets: $0.01 tick size
            return (Math.round(price * 100) / 100).toFixed(2);
        }
    };
    /**
     * Format size to appropriate precision for the asset
     */
    HyperliquidClient.prototype.formatSize = function (size, symbol) {
        // Different assets have different size increments
        var decimals = symbol === 'BTC' ? 5 : 4;
        return size.toFixed(decimals);
    };
    /**
     * Get L2 order book
     */
    HyperliquidClient.prototype.getL2Book = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            var error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.publicClient.l2Book({ coin: symbol })];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        error_9 = _a.sent();
                        logger_1.default.error("Failed to get L2 book for ".concat(symbol, ":"), error_9);
                        throw error_9;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get recent trades
     */
    HyperliquidClient.prototype.getRecentTrades = function (symbol) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    // recentTrades is not available in PublicClient, returning empty array for now
                    // const result = await this.publicClient.recentTrades({ coin: symbol });
                    return [2 /*return*/, []];
                }
                catch (error) {
                    logger_1.default.error("Failed to get recent trades for ".concat(symbol, ":"), error);
                    return [2 /*return*/, []];
                }
                return [2 /*return*/];
            });
        });
    };
    return HyperliquidClient;
}());
exports.HyperliquidClient = HyperliquidClient;
// Singleton instance
var hyperliquidClient = new HyperliquidClient();
exports.default = hyperliquidClient;
