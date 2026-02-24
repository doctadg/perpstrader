"use strict";
// pump.fun Token Store - SQLite Storage
// Stores and retrieves pump.fun token analysis results
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
var better_sqlite3_1 = require("better-sqlite3");
var path_1 = require("path");
var fs_1 = require("fs");
var logger_1 = require("../shared/logger");
var config_1 = require("../shared/config");
/**
 * PumpFun Token Store - SQLite storage for analyzed tokens
 */
var PumpFunStore = /** @class */ (function () {
    function PumpFunStore() {
        this.db = null;
        this.initialized = false;
        this.dbPath = process.env.PUMPFUN_DB_PATH || path_1.default.join(process.cwd(), 'data/pumpfun.db');
    }
    /**
     * Initialize the database and create tables
     */
    PumpFunStore.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var dir;
            return __generator(this, function (_a) {
                if (this.initialized) {
                    return [2 /*return*/];
                }
                try {
                    logger_1.default.info('[PumpFunStore] Initializing pump.fun database...');
                    dir = path_1.default.dirname(this.dbPath);
                    if (!fs_1.default.existsSync(dir)) {
                        fs_1.default.mkdirSync(dir, { recursive: true });
                    }
                    this.db = new better_sqlite3_1.default(this.dbPath);
                    this.db.pragma('journal_mode = WAL');
                    // Create main table
                    this.db.exec("\n        CREATE TABLE IF NOT EXISTS pumpfun_tokens (\n          id TEXT PRIMARY KEY,\n          cycle_id TEXT NOT NULL,\n          mint_address TEXT NOT NULL UNIQUE,\n          token_name TEXT NOT NULL,\n          token_symbol TEXT NOT NULL,\n          metadata_uri TEXT,\n          description TEXT,\n          website TEXT,\n          twitter TEXT,\n          telegram TEXT,\n          discord TEXT,\n          image_url TEXT,\n\n          -- Security\n          mint_authority TEXT,\n          freeze_authority TEXT,\n          is_mintable INTEGER,\n          is_freezable INTEGER,\n          security_score REAL,\n\n          -- Scores\n          website_score REAL,\n          social_score REAL,\n          overall_score REAL,\n\n          -- Analysis\n          recommendation TEXT,\n          rationale TEXT,\n          red_flags TEXT,\n          green_flags TEXT,\n\n          -- Timestamps\n          created_at TEXT NOT NULL,\n          analyzed_at TEXT NOT NULL,\n\n          -- Metadata JSON\n          metadata_json TEXT\n        )\n      ");
                    // Create indexes
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_pumpfun_mint_address\n        ON pumpfun_tokens(mint_address)\n      ");
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_pumpfun_overall_score\n        ON pumpfun_tokens(overall_score DESC)\n      ");
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_pumpfun_created_at\n        ON pumpfun_tokens(created_at DESC)\n      ");
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_pumpfun_recommendation\n        ON pumpfun_tokens(recommendation)\n      ");
                    this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_pumpfun_cycle_id\n        ON pumpfun_tokens(cycle_id)\n      ");
                    this.initialized = true;
                    logger_1.default.info('[PumpFunStore] Database initialized successfully');
                }
                catch (error) {
                    logger_1.default.error('[PumpFunStore] Failed to initialize database:', error);
                    this.db = null;
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Store a token analysis result
     */
    PumpFunStore.prototype.storeToken = function (analysis) {
        if (!this.db) {
            logger_1.default.warn('[PumpFunStore] Database not initialized');
            return false;
        }
        try {
            var stmt = this.db.prepare("\n        INSERT OR REPLACE INTO pumpfun_tokens (\n          id, cycle_id, mint_address, token_name, token_symbol, metadata_uri,\n          description, website, twitter, telegram, discord, image_url,\n          mint_authority, freeze_authority, is_mintable, is_freezable, security_score,\n          website_score, social_score, overall_score,\n          recommendation, rationale, red_flags, green_flags,\n          created_at, analyzed_at, metadata_json\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ");
            stmt.run(analysis.id, analysis.cycleId, analysis.token.mintAddress, analysis.token.name, analysis.token.symbol, analysis.token.metadataUri, analysis.metadata.description || '', analysis.metadata.website || '', analysis.metadata.twitter || '', analysis.metadata.telegram || '', analysis.metadata.discord || '', analysis.metadata.image || '', analysis.security.mintAuthority, analysis.security.freezeAuthority, analysis.security.isMintable ? 1 : 0, analysis.security.isFreezable ? 1 : 0, analysis.securityScore, analysis.websiteScore, analysis.socialScore, analysis.overallScore, analysis.recommendation, analysis.rationale, JSON.stringify(analysis.redFlags), JSON.stringify(analysis.greenFlags), analysis.token.createdAt.toISOString(), analysis.analyzedAt.toISOString(), JSON.stringify(analysis, function (_, value) {
                return typeof value === 'bigint' ? value.toString() : value;
            }));
            logger_1.default.debug("[PumpFunStore] Stored token: ".concat(analysis.token.symbol, " (").concat(analysis.overallScore.toFixed(2), ")"));
            return true;
        }
        catch (error) {
            // Check if it's a unique constraint violation (duplicate)
            if (error instanceof Error && error.message.includes('UNIQUE')) {
                logger_1.default.debug("[PumpFunStore] Token already exists: ".concat(analysis.token.mintAddress));
                return false;
            }
            logger_1.default.error('[PumpFunStore] Failed to store token:', error);
            return false;
        }
    };
    /**
     * Store multiple tokens in a transaction
     */
    PumpFunStore.prototype.storeTokens = function (analyses) {
        var _this = this;
        if (!this.db) {
            logger_1.default.warn('[PumpFunStore] Database not initialized');
            return { stored: 0, duplicates: 0 };
        }
        var stored = 0;
        var duplicates = 0;
        var transaction = this.db.transaction(function () {
            for (var _i = 0, analyses_1 = analyses; _i < analyses_1.length; _i++) {
                var analysis = analyses_1[_i];
                if (_this.storeToken(analysis)) {
                    stored++;
                }
                else {
                    duplicates++;
                }
            }
        });
        try {
            transaction();
        }
        catch (error) {
            logger_1.default.error('[PumpFunStore] Failed to store tokens in transaction:', error);
        }
        return { stored: stored, duplicates: duplicates };
    };
    /**
     * Get token by mint address
     */
    PumpFunStore.prototype.getTokenByMint = function (mintAddress) {
        if (!this.db) {
            return null;
        }
        try {
            var stmt = this.db.prepare("\n        SELECT * FROM pumpfun_tokens WHERE mint_address = ?\n      ");
            var row = stmt.get(mintAddress);
            if (!row) {
                return null;
            }
            return this.rowToTokenAnalysis(row);
        }
        catch (error) {
            logger_1.default.error('[PumpFunStore] Failed to get token by mint:', error);
            return null;
        }
    };
    /**
     * Get recent tokens
     */
    PumpFunStore.prototype.getRecentTokens = function (limit, minScore) {
        var _this = this;
        if (limit === void 0) { limit = 50; }
        if (minScore === void 0) { minScore = 0; }
        if (!this.db) {
            return [];
        }
        try {
            var stmt = this.db.prepare("\n        SELECT * FROM pumpfun_tokens\n        WHERE overall_score >= ?\n        ORDER BY created_at DESC\n        LIMIT ?\n      ");
            var rows = stmt.all(minScore, limit);
            return rows.map(function (row) { return _this.rowToTokenAnalysis(row); });
        }
        catch (error) {
            logger_1.default.error('[PumpFunStore] Failed to get recent tokens:', error);
            return [];
        }
    };
    /**
     * Get high confidence tokens
     */
    PumpFunStore.prototype.getHighConfidenceTokens = function (minScore, limit) {
        var _this = this;
        if (minScore === void 0) { minScore = 0.7; }
        if (limit === void 0) { limit = 100; }
        if (!this.db) {
            return [];
        }
        try {
            var stmt = this.db.prepare("\n        SELECT * FROM pumpfun_tokens\n        WHERE overall_score >= ?\n        ORDER BY overall_score DESC, created_at DESC\n        LIMIT ?\n      ");
            var rows = stmt.all(minScore, limit);
            return rows.map(function (row) { return _this.rowToTokenAnalysis(row); });
        }
        catch (error) {
            logger_1.default.error('[PumpFunStore] Failed to get high confidence tokens:', error);
            return [];
        }
    };
    /**
     * Get tokens by recommendation
     */
    PumpFunStore.prototype.getByRecommendation = function (recommendation, limit) {
        var _this = this;
        if (limit === void 0) { limit = 50; }
        if (!this.db) {
            return [];
        }
        try {
            var stmt = this.db.prepare("\n        SELECT * FROM pumpfun_tokens\n        WHERE recommendation = ?\n        ORDER BY created_at DESC\n        LIMIT ?\n      ");
            var rows = stmt.all(recommendation, limit);
            return rows.map(function (row) { return _this.rowToTokenAnalysis(row); });
        }
        catch (error) {
            logger_1.default.error('[PumpFunStore] Failed to get tokens by recommendation:', error);
            return [];
        }
    };
    /**
     * Get statistics
     */
    PumpFunStore.prototype.getStats = function () {
        var _a, _b;
        if (!this.db) {
            return {
                totalTokens: 0,
                averageScore: 0,
                byRecommendation: {
                    STRONG_BUY: 0,
                    BUY: 0,
                    HOLD: 0,
                    AVOID: 0,
                    STRONG_AVOID: 0,
                },
                highConfidenceCount: 0,
                lastAnalyzedAt: null,
            };
        }
        try {
            var minScoreThreshold = (_b = (_a = config_1.default.get().pumpfun) === null || _a === void 0 ? void 0 : _a.minScoreThreshold) !== null && _b !== void 0 ? _b : 0.7;
            // Total tokens
            var totalStmt = this.db.prepare("SELECT COUNT(*) as count FROM pumpfun_tokens");
            var totalResult = totalStmt.get();
            var totalTokens = totalResult.count;
            // Average score
            var avgStmt = this.db.prepare("SELECT AVG(overall_score) as avg_score FROM pumpfun_tokens");
            var avgResult = avgStmt.get();
            var averageScore = avgResult.avg_score || 0;
            // By recommendation
            var recStmt = this.db.prepare("\n        SELECT recommendation, COUNT(*) as count\n        FROM pumpfun_tokens\n        GROUP BY recommendation\n      ");
            var recRows = recStmt.all();
            var byRecommendation = {
                STRONG_BUY: 0,
                BUY: 0,
                HOLD: 0,
                AVOID: 0,
                STRONG_AVOID: 0,
            };
            for (var _i = 0, recRows_1 = recRows; _i < recRows_1.length; _i++) {
                var row = recRows_1[_i];
                if (row.recommendation in byRecommendation) {
                    byRecommendation[row.recommendation] = row.count;
                }
            }
            // High confidence count
            var highStmt = this.db.prepare("\n        SELECT COUNT(*) as count FROM pumpfun_tokens WHERE overall_score >= ?\n      ");
            var highResult = highStmt.get(minScoreThreshold);
            var highConfidenceCount = highResult.count;
            // Last analyzed
            var lastStmt = this.db.prepare("\n        SELECT analyzed_at FROM pumpfun_tokens ORDER BY analyzed_at DESC LIMIT 1\n      ");
            var lastResult = lastStmt.get();
            var lastAnalyzedAt = (lastResult === null || lastResult === void 0 ? void 0 : lastResult.analyzed_at) || null;
            return {
                totalTokens: totalTokens,
                averageScore: averageScore,
                byRecommendation: byRecommendation,
                highConfidenceCount: highConfidenceCount,
                lastAnalyzedAt: lastAnalyzedAt,
            };
        }
        catch (error) {
            logger_1.default.error('[PumpFunStore] Failed to get stats:', error);
            return {
                totalTokens: 0,
                averageScore: 0,
                byRecommendation: {
                    STRONG_BUY: 0,
                    BUY: 0,
                    HOLD: 0,
                    AVOID: 0,
                    STRONG_AVOID: 0,
                },
                highConfidenceCount: 0,
                lastAnalyzedAt: null,
            };
        }
    };
    /**
     * Check if token exists
     */
    PumpFunStore.prototype.tokenExists = function (mintAddress) {
        if (!this.db) {
            return false;
        }
        try {
            var stmt = this.db.prepare("SELECT 1 FROM pumpfun_tokens WHERE mint_address = ? LIMIT 1");
            var result = stmt.get(mintAddress);
            return result !== undefined;
        }
        catch (error) {
            return false;
        }
    };
    /**
     * Get tokens from a specific cycle
     */
    PumpFunStore.prototype.getTokensByCycle = function (cycleId) {
        var _this = this;
        if (!this.db) {
            return [];
        }
        try {
            var stmt = this.db.prepare("\n        SELECT * FROM pumpfun_tokens WHERE cycle_id = ? ORDER BY overall_score DESC\n      ");
            var rows = stmt.all(cycleId);
            return rows.map(function (row) { return _this.rowToTokenAnalysis(row); });
        }
        catch (error) {
            logger_1.default.error('[PumpFunStore] Failed to get tokens by cycle:', error);
            return [];
        }
    };
    /**
     * Convert database row to TokenAnalysis
     */
    PumpFunStore.prototype.rowToTokenAnalysis = function (row) {
        var _a;
        return {
            id: row.id,
            token: {
                mintAddress: row.mint_address,
                name: row.token_name,
                symbol: row.token_symbol,
                metadataUri: row.metadata_uri,
                createdAt: new Date(row.created_at),
            },
            metadata: {
                name: row.token_name,
                symbol: row.token_symbol,
                description: row.description,
                image: row.image_url,
                website: row.website || undefined,
                twitter: row.twitter || undefined,
                telegram: row.telegram || undefined,
                discord: row.discord || undefined,
            },
            security: {
                mintAuthority: row.mint_authority,
                freezeAuthority: row.freeze_authority,
                decimals: 0, // Not stored in main table
                supply: 0n,
                isMintable: row.is_mintable === 1,
                isFreezable: row.is_freezable === 1,
                metadataHash: '',
                riskLevel: 'MEDIUM',
            },
            website: {
                url: row.website,
                exists: !!row.website,
                hasContent: true,
                contentQuality: row.website_score,
                hasWhitepaper: false,
                hasTeamInfo: false,
                hasRoadmap: false,
                hasTokenomics: false,
                sslValid: ((_a = row.website) === null || _a === void 0 ? void 0 : _a.startsWith('https://')) || false,
                glmAnalysis: '',
            },
            social: {
                twitter: {
                    exists: !!row.twitter,
                    followerCount: 0,
                    tweetCount: 0,
                    bio: '',
                    verified: false,
                    sentimentScore: 0.5,
                },
                telegram: {
                    exists: !!row.telegram,
                    memberCount: 0,
                    isChannel: false,
                    description: '',
                },
                discord: {
                    exists: !!row.discord,
                    memberCount: 0,
                    inviteActive: false,
                },
                overallPresenceScore: row.social_score,
                glmAnalysis: '',
            },
            websiteScore: row.website_score,
            socialScore: row.social_score,
            securityScore: row.security_score,
            overallScore: row.overall_score,
            rationale: row.rationale,
            redFlags: row.red_flags ? JSON.parse(row.red_flags) : [],
            greenFlags: row.green_flags ? JSON.parse(row.green_flags) : [],
            recommendation: row.recommendation,
            analyzedAt: new Date(row.analyzed_at),
            cycleId: row.cycle_id,
            errors: [],
        };
    };
    /**
     * Close the database connection
     */
    PumpFunStore.prototype.close = function () {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.initialized = false;
            logger_1.default.info('[PumpFunStore] Database closed');
        }
    };
    return PumpFunStore;
}());
// Singleton instance
var pumpfunStore = new PumpFunStore();
exports.default = pumpfunStore;
