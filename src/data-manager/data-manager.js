"use strict";
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
exports.DataManager = void 0;
var better_sqlite3_1 = require("better-sqlite3");
var path_1 = require("path");
var fs_1 = require("fs");
var uuid_1 = require("uuid");
var config_1 = require("../shared/config");
var logger_1 = require("../shared/logger");
var DataManager = /** @class */ (function () {
    function DataManager() {
        var dbConfig = config_1.default.getSection('database');
        this.dbPath = dbConfig.connection;
        // Ensure data directory exists
        var dataDir = path_1.default.dirname(this.dbPath);
        if (!fs_1.default.existsSync(dataDir)) {
            fs_1.default.mkdirSync(dataDir, { recursive: true });
        }
        this.db = new better_sqlite3_1.default(this.dbPath);
        this.initializeDatabase();
        logger_1.default.info("Database initialized at: ".concat(this.dbPath));
    }
    DataManager.prototype.initializeDatabase = function () {
        try {
            // Strategies table
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS strategies (\n          id TEXT PRIMARY KEY,\n          name TEXT NOT NULL,\n          description TEXT,\n          type TEXT NOT NULL,\n          symbols TEXT NOT NULL,\n          timeframe TEXT NOT NULL,\n          parameters TEXT NOT NULL,\n          entryConditions TEXT NOT NULL,\n          exitConditions TEXT NOT NULL,\n          riskParameters TEXT NOT NULL,\n          isActive INTEGER DEFAULT 0,\n          performance TEXT NOT NULL,\n          createdAt TEXT NOT NULL,\n          updatedAt TEXT NOT NULL\n        )\n      ");
            // Trades table
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS trades (\n          id TEXT PRIMARY KEY,\n          strategyId TEXT NOT NULL,\n          symbol TEXT NOT NULL,\n          side TEXT NOT NULL,\n          size REAL NOT NULL,\n          price REAL NOT NULL,\n          fee REAL DEFAULT 0,\n          pnl REAL DEFAULT 0,\n          timestamp TEXT NOT NULL,\n          type TEXT NOT NULL,\n          status TEXT NOT NULL,\n          entryExit TEXT NOT NULL,\n          FOREIGN KEY (strategyId) REFERENCES strategies (id)\n        )\n      ");
            // Market data table
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS market_data (\n          id INTEGER PRIMARY KEY AUTOINCREMENT,\n          symbol TEXT NOT NULL,\n          timestamp TEXT NOT NULL,\n          open REAL NOT NULL,\n          high REAL NOT NULL,\n          low REAL NOT NULL,\n          close REAL NOT NULL,\n          volume REAL NOT NULL,\n          vwap REAL,\n          bid REAL,\n          ask REAL,\n          bidSize REAL,\n          askSize REAL\n        );\n\n        CREATE UNIQUE INDEX IF NOT EXISTS idx_market_symbol_time ON market_data(symbol, timestamp);\n        CREATE INDEX IF NOT EXISTS idx_market_symbol ON market_data(symbol);\n        CREATE INDEX IF NOT EXISTS idx_market_timestamp ON market_data(timestamp);\n      ");
            // AI insights table
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS ai_insights (\n          id TEXT PRIMARY KEY,\n          type TEXT NOT NULL,\n          title TEXT NOT NULL,\n          description TEXT NOT NULL,\n          confidence REAL NOT NULL,\n          actionable INTEGER NOT NULL,\n          timestamp TEXT NOT NULL,\n          data TEXT NOT NULL\n        )\n      ");
            // Research data table
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS research_data (\n          id TEXT PRIMARY KEY,\n          topic TEXT NOT NULL,\n          timestamp TEXT NOT NULL,\n          searchResults TEXT NOT NULL,\n          scrapedContent TEXT NOT NULL,\n          insights TEXT NOT NULL,\n          sources TEXT NOT NULL,\n          confidence REAL NOT NULL\n        )\n      ");
            // Backtest results table
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS backtest_results (\n          id TEXT PRIMARY KEY,\n          strategyId TEXT NOT NULL,\n          periodStart TEXT NOT NULL,\n          periodEnd TEXT NOT NULL,\n          initialCapital REAL NOT NULL,\n          finalCapital REAL NOT NULL,\n          totalReturn REAL NOT NULL,\n          annualizedReturn REAL NOT NULL,\n          sharpeRatio REAL NOT NULL,\n          maxDrawdown REAL NOT NULL,\n          winRate REAL NOT NULL,\n          totalTrades INTEGER NOT NULL,\n          trades TEXT NOT NULL,\n          metrics TEXT NOT NULL,\n          createdAt TEXT NOT NULL\n        )\n      ");
            // System status table
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS system_status (\n          id INTEGER PRIMARY KEY AUTOINCREMENT,\n          agent TEXT NOT NULL,\n          execution TEXT NOT NULL,\n          research TEXT NOT NULL,\n          data TEXT NOT NULL,\n          dashboard TEXT NOT NULL,\n          uptime INTEGER NOT NULL,\n          lastUpdate TEXT NOT NULL,\n          errors TEXT\n        )\n      ");
            logger_1.default.info('Database tables initialized successfully');
        }
        catch (error) {
            logger_1.default.error('Database initialization failed:', error);
            throw error;
        }
    };
    // Strategy operations
    DataManager.prototype.saveStrategy = function (strategy) {
        return __awaiter(this, void 0, void 0, function () {
            var stmt;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare("\n        INSERT OR REPLACE INTO strategies (\n          id, name, description, type, symbols, timeframe, parameters,\n          entryConditions, exitConditions, riskParameters, isActive,\n          performance, createdAt, updatedAt\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ");
                    stmt.run(strategy.id, strategy.name, strategy.description, strategy.type, JSON.stringify(strategy.symbols), strategy.timeframe, JSON.stringify(strategy.parameters), JSON.stringify(strategy.entryConditions), JSON.stringify(strategy.exitConditions), JSON.stringify(strategy.riskParameters), strategy.isActive ? 1 : 0, JSON.stringify(strategy.performance), strategy.createdAt.toISOString(), strategy.updatedAt.toISOString());
                    logger_1.default.info("Strategy saved: ".concat(strategy.name));
                }
                catch (error) {
                    logger_1.default.error('Failed to save strategy:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.getStrategy = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var stmt, row;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare('SELECT * FROM strategies WHERE id = ?');
                    row = stmt.get(id);
                    if (!row)
                        return [2 /*return*/, null];
                    return [2 /*return*/, this.mapRowToStrategy(row)];
                }
                catch (error) {
                    logger_1.default.error('Failed to get strategy:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.getAllStrategies = function () {
        return __awaiter(this, void 0, void 0, function () {
            var stmt, rows;
            var _this = this;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare('SELECT * FROM strategies ORDER BY createdAt DESC');
                    rows = stmt.all();
                    return [2 /*return*/, rows.map(function (row) { return _this.mapRowToStrategy(row); })];
                }
                catch (error) {
                    logger_1.default.error('Failed to get all strategies:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.deleteStrategy = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var stmt, result;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare('DELETE FROM strategies WHERE id = ?');
                    result = stmt.run(id);
                    return [2 /*return*/, result.changes > 0];
                }
                catch (error) {
                    logger_1.default.error('Failed to delete strategy:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    // Trade operations
    DataManager.prototype.saveTrade = function (trade) {
        return __awaiter(this, void 0, void 0, function () {
            var stmt;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare("\n        INSERT OR REPLACE INTO trades (\n          id, strategyId, symbol, side, size, price, fee, pnl,\n          timestamp, type, status, entryExit\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ");
                    stmt.run(trade.id, trade.strategyId, trade.symbol, trade.side, trade.size, trade.price, trade.fee, trade.pnl || 0, trade.timestamp.toISOString(), trade.type, trade.status, trade.entryExit);
                    logger_1.default.info("Trade saved: ".concat(trade.id));
                }
                catch (error) {
                    logger_1.default.error('Failed to save trade:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.getTrades = function (strategyId_1, symbol_1) {
        return __awaiter(this, arguments, void 0, function (strategyId, symbol, limit) {
            var query, params, conditions, stmt, rows;
            var _this = this;
            if (limit === void 0) { limit = 100; }
            return __generator(this, function (_a) {
                try {
                    query = 'SELECT * FROM trades';
                    params = [];
                    conditions = [];
                    if (strategyId) {
                        conditions.push('strategyId = ?');
                        params.push(strategyId);
                    }
                    if (symbol) {
                        conditions.push('symbol = ?');
                        params.push(symbol);
                    }
                    if (conditions.length > 0) {
                        query += ' WHERE ' + conditions.join(' AND ');
                    }
                    query += ' ORDER BY timestamp DESC LIMIT ?';
                    params.push(limit);
                    stmt = this.db.prepare(query);
                    rows = stmt.all.apply(stmt, params);
                    return [2 /*return*/, rows.map(function (row) { return _this.mapRowToTrade(row); })];
                }
                catch (error) {
                    logger_1.default.error('Failed to get trades:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.clearAllTrades = function () {
        return __awaiter(this, void 0, void 0, function () {
            var stmt, result;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare('DELETE FROM trades');
                    result = stmt.run();
                    logger_1.default.info("Cleared ".concat(result.changes, " trades from database"));
                    return [2 /*return*/, result.changes];
                }
                catch (error) {
                    logger_1.default.error('Failed to clear trades:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    // Market data operations
    DataManager.prototype.saveMarketData = function (marketData) {
        return __awaiter(this, void 0, void 0, function () {
            var stmt_1, transaction;
            return __generator(this, function (_a) {
                try {
                    stmt_1 = this.db.prepare("\n        INSERT OR REPLACE INTO market_data (\n          symbol, timestamp, open, high, low, close, volume,\n          vwap, bid, ask, bidSize, askSize\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ");
                    transaction = this.db.transaction(function () {
                        for (var _i = 0, marketData_1 = marketData; _i < marketData_1.length; _i++) {
                            var data = marketData_1[_i];
                            stmt_1.run(data.symbol, data.timestamp.toISOString(), data.open, data.high, data.low, data.close, data.volume, data.vwap || null, data.bid || null, data.ask || null, data.bidSize || null, data.askSize || null);
                        }
                    });
                    transaction();
                    logger_1.default.info("Saved ".concat(marketData.length, " market data points"));
                }
                catch (error) {
                    logger_1.default.error('Failed to save market data:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.getMarketData = function (symbol_1, startTime_1, endTime_1) {
        return __awaiter(this, arguments, void 0, function (symbol, startTime, endTime, limit) {
            var query, params, stmt, rows;
            var _this = this;
            if (limit === void 0) { limit = 1000; }
            return __generator(this, function (_a) {
                try {
                    query = 'SELECT * FROM market_data WHERE symbol = ?';
                    params = [symbol];
                    if (startTime) {
                        query += ' AND timestamp >= ?';
                        params.push(startTime.toISOString());
                    }
                    if (endTime) {
                        query += ' AND timestamp <= ?';
                        params.push(endTime.toISOString());
                    }
                    query += ' ORDER BY timestamp DESC LIMIT ?';
                    params.push(limit);
                    stmt = this.db.prepare(query);
                    rows = stmt.all.apply(stmt, params);
                    return [2 /*return*/, rows.map(function (row) { return _this.mapRowToMarketData(row); })];
                }
                catch (error) {
                    logger_1.default.error('Failed to get market data:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    // Backtest results operations
    DataManager.prototype.saveBacktestResult = function (result) {
        return __awaiter(this, void 0, void 0, function () {
            var stmt;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare("\n        INSERT OR REPLACE INTO backtest_results (\n          id, strategyId, periodStart, periodEnd, initialCapital,\n          finalCapital, totalReturn, annualizedReturn, sharpeRatio,\n          maxDrawdown, winRate, totalTrades, trades, metrics, createdAt\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ");
                    stmt.run((0, uuid_1.v4)(), result.strategyId, result.period.start.toISOString(), result.period.end.toISOString(), result.initialCapital, result.finalCapital, result.totalReturn, result.annualizedReturn, result.sharpeRatio, result.maxDrawdown, result.winRate, result.totalTrades, JSON.stringify(result.trades), JSON.stringify(result.metrics), new Date().toISOString());
                    logger_1.default.info("Backtest result saved for strategy: ".concat(result.strategyId));
                }
                catch (error) {
                    logger_1.default.error('Failed to save backtest result:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    // AI insights operations
    DataManager.prototype.saveAIInsight = function (insight) {
        return __awaiter(this, void 0, void 0, function () {
            var stmt;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare("\n        INSERT OR REPLACE INTO ai_insights (\n          id, type, title, description, confidence, actionable, timestamp, data\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\n      ");
                    stmt.run(insight.id, insight.type, insight.title, insight.description, insight.confidence, insight.actionable ? 1 : 0, insight.timestamp.toISOString(), JSON.stringify(insight.data));
                    logger_1.default.info("AI insight saved: ".concat(insight.title));
                }
                catch (error) {
                    logger_1.default.error('Failed to save AI insight:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.getAIInsights = function (type_1) {
        return __awaiter(this, arguments, void 0, function (type, limit) {
            var query, params, stmt, rows;
            var _this = this;
            if (limit === void 0) { limit = 50; }
            return __generator(this, function (_a) {
                try {
                    query = 'SELECT * FROM ai_insights';
                    params = [];
                    if (type) {
                        query += ' WHERE type = ?';
                        params.push(type);
                    }
                    query += ' ORDER BY timestamp DESC LIMIT ?';
                    params.push(limit);
                    stmt = this.db.prepare(query);
                    rows = stmt.all.apply(stmt, params);
                    return [2 /*return*/, rows.map(function (row) { return _this.mapRowToAIInsight(row); })];
                }
                catch (error) {
                    logger_1.default.error('Failed to get AI insights:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    // Research data operations
    DataManager.prototype.saveResearchData = function (research) {
        return __awaiter(this, void 0, void 0, function () {
            var stmt;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare("\n        INSERT OR REPLACE INTO research_data (\n          id, topic, timestamp, searchResults, scrapedContent, insights, sources, confidence\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\n      ");
                    stmt.run((0, uuid_1.v4)(), research.topic, research.timestamp.toISOString(), JSON.stringify(research.searchResults), JSON.stringify(research.scrapedContent), JSON.stringify(research.insights), JSON.stringify(research.sources), research.confidence);
                    logger_1.default.info("Research data saved: ".concat(research.topic));
                }
                catch (error) {
                    logger_1.default.error('Failed to save research data:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    // Analytics and reporting
    DataManager.prototype.getPortfolioPerformance = function () {
        return __awaiter(this, arguments, void 0, function (timeframe) {
            var endTime, startTime, stmt, result;
            if (timeframe === void 0) { timeframe = '7d'; }
            return __generator(this, function (_a) {
                try {
                    endTime = new Date();
                    startTime = new Date();
                    switch (timeframe) {
                        case '1d':
                            startTime.setDate(startTime.getDate() - 1);
                            break;
                        case '7d':
                            startTime.setDate(startTime.getDate() - 7);
                            break;
                        case '30d':
                            startTime.setDate(startTime.getDate() - 30);
                            break;
                        case '90d':
                            startTime.setDate(startTime.getDate() - 90);
                            break;
                    }
                    stmt = this.db.prepare("\n        SELECT \n          COUNT(*) as totalTrades,\n          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winningTrades,\n          SUM(pnl) as totalPnL,\n          AVG(pnl) as avgPnL,\n          MAX(pnl) as bestTrade,\n          MIN(pnl) as worstTrade\n        FROM trades \n        WHERE timestamp >= ? AND timestamp <= ?\n      ");
                    result = stmt.get(startTime.toISOString(), endTime.toISOString());
                    return [2 /*return*/, {
                            timeframe: timeframe,
                            totalTrades: result.totalTrades || 0,
                            winningTrades: result.winningTrades || 0,
                            winRate: result.totalTrades > 0 ? (result.winningTrades / result.totalTrades) * 100 : 0,
                            totalPnL: result.totalPnL || 0,
                            avgPnL: result.avgPnL || 0,
                            bestTrade: result.bestTrade || 0,
                            worstTrade: result.worstTrade || 0
                        }];
                }
                catch (error) {
                    logger_1.default.error('Failed to get portfolio performance:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    // Cleanup and maintenance
    DataManager.prototype.cleanupOldData = function () {
        return __awaiter(this, arguments, void 0, function (daysToKeep) {
            var cutoffDate, marketDataStmt, marketDataResult, insightsStmt, insightsResult;
            if (daysToKeep === void 0) { daysToKeep = 90; }
            return __generator(this, function (_a) {
                try {
                    cutoffDate = new Date();
                    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
                    marketDataStmt = this.db.prepare('DELETE FROM market_data WHERE timestamp < ?');
                    marketDataResult = marketDataStmt.run(cutoffDate.toISOString());
                    insightsStmt = this.db.prepare('DELETE FROM ai_insights WHERE timestamp < ?');
                    insightsResult = insightsStmt.run(cutoffDate.toISOString());
                    logger_1.default.info("Cleanup completed: removed ".concat(marketDataResult.changes, " market data points and ").concat(insightsResult.changes, " insights"));
                }
                catch (error) {
                    logger_1.default.error('Failed to cleanup old data:', error);
                    throw error;
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.close = function () {
        this.db.close();
        logger_1.default.info('Database connection closed');
    };
    // Helper methods for mapping rows to objects
    DataManager.prototype.mapRowToStrategy = function (row) {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            type: row.type,
            symbols: JSON.parse(row.symbols),
            timeframe: row.timeframe,
            parameters: JSON.parse(row.parameters),
            entryConditions: JSON.parse(row.entryConditions),
            exitConditions: JSON.parse(row.exitConditions),
            riskParameters: JSON.parse(row.riskParameters),
            isActive: row.isActive === 1,
            performance: JSON.parse(row.performance),
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt)
        };
    };
    DataManager.prototype.mapRowToTrade = function (row) {
        return {
            id: row.id,
            strategyId: row.strategyId,
            symbol: row.symbol,
            side: row.side,
            size: row.size,
            price: row.price,
            fee: row.fee,
            pnl: row.pnl,
            timestamp: new Date(row.timestamp),
            type: row.type,
            status: row.status,
            entryExit: row.entryExit
        };
    };
    DataManager.prototype.mapRowToMarketData = function (row) {
        return {
            symbol: row.symbol,
            timestamp: new Date(row.timestamp),
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            vwap: row.vwap,
            bid: row.bid,
            ask: row.ask,
            bidSize: row.bidSize,
            askSize: row.askSize
        };
    };
    DataManager.prototype.mapRowToAIInsight = function (row) {
        return {
            id: row.id,
            type: row.type,
            title: row.title,
            description: row.description,
            confidence: row.confidence,
            actionable: row.actionable === 1,
            timestamp: new Date(row.timestamp),
            data: JSON.parse(row.data)
        };
    };
    DataManager.prototype.saveSystemStatus = function (status) {
        return __awaiter(this, void 0, void 0, function () {
            var stmt;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare("\n        INSERT INTO system_status (agent, execution, research, data, dashboard, uptime, lastUpdate, errors)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?)\n      ");
                    stmt.run(status.agent, status.execution, status.research, status.data, status.dashboard, status.uptime, status.lastUpdate.toISOString(), JSON.stringify(status.errors || []));
                    logger_1.default.debug('System status saved to database');
                }
                catch (error) {
                    logger_1.default.error('Failed to save system status:', error);
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.getSystemStatus = function () {
        return __awaiter(this, void 0, void 0, function () {
            var stmt, row;
            return __generator(this, function (_a) {
                try {
                    stmt = this.db.prepare("\n        SELECT * FROM system_status\n        ORDER BY id DESC\n        LIMIT 1\n      ");
                    row = stmt.get();
                    if (!row) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, {
                            agent: row.agent,
                            execution: row.execution,
                            research: row.research,
                            data: row.data,
                            dashboard: row.dashboard,
                            uptime: row.uptime,
                            lastUpdate: new Date(row.lastUpdate),
                            errors: JSON.parse(row.errors || '[]')
                        }];
                }
                catch (error) {
                    logger_1.default.error('Failed to get system status:', error);
                    return [2 /*return*/, null];
                }
                return [2 /*return*/];
            });
        });
    };
    DataManager.prototype.cleanupOldStatusEntries = function () {
        return __awaiter(this, arguments, void 0, function (maxAge) {
            var cutoffDate, stmt, result;
            if (maxAge === void 0) { maxAge = 7; }
            return __generator(this, function (_a) {
                try {
                    cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);
                    stmt = this.db.prepare("\n        DELETE FROM system_status\n        WHERE lastUpdate < ?\n      ");
                    result = stmt.run(cutoffDate.toISOString());
                    logger_1.default.info("Cleaned up ".concat(result.changes, " old system status entries"));
                }
                catch (error) {
                    logger_1.default.error('Failed to cleanup old status entries:', error);
                }
                return [2 /*return*/];
            });
        });
    };
    return DataManager;
}());
exports.DataManager = DataManager;
exports.default = new DataManager();
