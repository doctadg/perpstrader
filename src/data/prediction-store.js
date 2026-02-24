"use strict";
// Prediction Market Store - SQLite persistence for prediction markets
// Keeps market snapshots, trades, positions, and agent status
Object.defineProperty(exports, "__esModule", { value: true });
var better_sqlite3_1 = require("better-sqlite3");
var logger_1 = require("../shared/logger");
var PredictionStore = /** @class */ (function () {
    function PredictionStore() {
        this.db = null;
        this.initialized = false;
        this.dbPath = process.env.PREDICTION_DB_PATH || './data/predictions.db';
    }
    PredictionStore.prototype.coerceTimestamp = function (value) {
        if (value === null || value === undefined)
            return 0;
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value > 1e12 ? value : value * 1000;
        }
        if (typeof value === 'string') {
            var parsed = Date.parse(value);
            if (!Number.isNaN(parsed))
                return parsed;
            var num = Number(value);
            if (Number.isFinite(num))
                return num > 1e12 ? num : num * 1000;
        }
        return 0;
    };
    PredictionStore.prototype.resolveMarketTimestamp = function (market) {
        var meta = market.metadata;
        var metaTimestamp = this.coerceTimestamp(meta === null || meta === void 0 ? void 0 : meta.marketTimestamp);
        if (metaTimestamp)
            return metaTimestamp;
        if (market.closeTime)
            return market.closeTime.getTime();
        return 0;
    };
    PredictionStore.prototype.initialize = function () {
        if (this.initialized)
            return;
        try {
            this.db = new better_sqlite3_1.default(this.dbPath);
            this.db.pragma('journal_mode = WAL');
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS prediction_markets (\n          id TEXT PRIMARY KEY,\n          slug TEXT,\n          title TEXT NOT NULL,\n          category TEXT,\n          status TEXT,\n          outcomes TEXT,\n          yes_price REAL,\n          no_price REAL,\n          volume REAL,\n          liquidity REAL,\n          close_time TEXT,\n          updated_at TEXT NOT NULL,\n          metadata TEXT\n        )\n      ");
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS prediction_market_prices (\n          id INTEGER PRIMARY KEY AUTOINCREMENT,\n          market_id TEXT NOT NULL,\n          timestamp TEXT NOT NULL,\n          yes_price REAL,\n          no_price REAL,\n          volume REAL,\n          liquidity REAL\n        )\n      ");
            this.db.exec("\n        CREATE INDEX IF NOT EXISTS idx_prediction_market_prices\n        ON prediction_market_prices(market_id, timestamp)\n      ");
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS prediction_trades (\n          id TEXT PRIMARY KEY,\n          market_id TEXT NOT NULL,\n          market_title TEXT NOT NULL,\n          outcome TEXT NOT NULL,\n          side TEXT NOT NULL,\n          shares REAL NOT NULL,\n          price REAL NOT NULL,\n          fee REAL NOT NULL,\n          pnl REAL,\n          timestamp TEXT NOT NULL,\n          status TEXT NOT NULL,\n          reason TEXT\n        )\n      ");
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS prediction_positions (\n          market_id TEXT NOT NULL,\n          market_title TEXT NOT NULL,\n          outcome TEXT NOT NULL,\n          shares REAL NOT NULL,\n          average_price REAL NOT NULL,\n          last_price REAL NOT NULL,\n          unrealized_pnl REAL NOT NULL,\n          opened_at TEXT NOT NULL,\n          updated_at TEXT NOT NULL,\n          PRIMARY KEY (market_id, outcome)\n        )\n      ");
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS prediction_backtests (\n          id TEXT PRIMARY KEY,\n          idea_id TEXT NOT NULL,\n          market_id TEXT NOT NULL,\n          period_start TEXT NOT NULL,\n          period_end TEXT NOT NULL,\n          total_return REAL NOT NULL,\n          average_return REAL NOT NULL,\n          win_rate REAL NOT NULL,\n          max_drawdown REAL NOT NULL,\n          trades_simulated INTEGER NOT NULL,\n          sharpe_ratio REAL NOT NULL,\n          created_at TEXT NOT NULL\n        )\n      ");
            this.db.exec("\n        CREATE TABLE IF NOT EXISTS prediction_agent_status (\n          id INTEGER PRIMARY KEY CHECK (id = 1),\n          status TEXT NOT NULL,\n          current_cycle_id TEXT,\n          current_step TEXT,\n          last_update TEXT,\n          last_cycle_start TEXT,\n          last_cycle_end TEXT,\n          last_trade_id TEXT,\n          last_trade_at TEXT,\n          active_markets INTEGER,\n          open_positions INTEGER,\n          metadata TEXT\n        )\n      ");
            this.initialized = true;
            logger_1.default.info('[PredictionStore] Initialized prediction database');
        }
        catch (error) {
            logger_1.default.error('[PredictionStore] Failed to initialize:', error);
            throw error;
        }
    };
    PredictionStore.prototype.upsertMarkets = function (markets) {
        if (!this.db)
            this.initialize();
        if (!this.db)
            return;
        var stmt = this.db.prepare("\n      INSERT INTO prediction_markets (\n        id, slug, title, category, status, outcomes, yes_price, no_price,\n        volume, liquidity, close_time, updated_at, metadata\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ON CONFLICT(id) DO UPDATE SET\n        slug = excluded.slug,\n        title = excluded.title,\n        category = excluded.category,\n        status = excluded.status,\n        outcomes = excluded.outcomes,\n        yes_price = excluded.yes_price,\n        no_price = excluded.no_price,\n        volume = excluded.volume,\n        liquidity = excluded.liquidity,\n        close_time = excluded.close_time,\n        updated_at = excluded.updated_at,\n        metadata = excluded.metadata\n    ");
        var batch = this.db.transaction(function (items) {
            var _a, _b, _c, _d;
            for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
                var market = items_1[_i];
                stmt.run(market.id, market.slug || null, market.title, market.category || null, market.status, JSON.stringify(market.outcomes || []), (_a = market.yesPrice) !== null && _a !== void 0 ? _a : null, (_b = market.noPrice) !== null && _b !== void 0 ? _b : null, (_c = market.volume) !== null && _c !== void 0 ? _c : null, (_d = market.liquidity) !== null && _d !== void 0 ? _d : null, market.closeTime ? market.closeTime.toISOString() : null, market.updatedAt.toISOString(), market.metadata ? JSON.stringify(market.metadata) : null);
            }
        });
        batch(markets);
    };
    PredictionStore.prototype.pruneMarkets = function (options) {
        if (options === void 0) { options = {}; }
        if (!this.db)
            this.initialize();
        if (!this.db)
            return 0;
        var removed = 0;
        if (options.removeClosed) {
            removed += this.db.prepare("\n        DELETE FROM prediction_markets\n        WHERE status IN ('CLOSED', 'RESOLVED')\n      ").run().changes;
        }
        if (options.removeNoVolume) {
            removed += this.db.prepare("\n        DELETE FROM prediction_markets\n        WHERE volume IS NULL\n      ").run().changes;
        }
        return removed;
    };
    PredictionStore.prototype.recordMarketSnapshot = function (snapshot) {
        var _a, _b;
        if (!this.db)
            this.initialize();
        if (!this.db)
            return;
        this.db.prepare("\n      INSERT INTO prediction_market_prices (\n        market_id, timestamp, yes_price, no_price, volume, liquidity\n      ) VALUES (?, ?, ?, ?, ?, ?)\n    ").run(snapshot.marketId, snapshot.timestamp.toISOString(), snapshot.yesPrice, snapshot.noPrice, (_a = snapshot.volume) !== null && _a !== void 0 ? _a : null, (_b = snapshot.liquidity) !== null && _b !== void 0 ? _b : null);
    };
    PredictionStore.prototype.getMarkets = function (limit, filter) {
        var _this = this;
        var _a, _b;
        if (limit === void 0) { limit = 50; }
        if (filter === void 0) { filter = {}; }
        if (!this.db)
            this.initialize();
        if (!this.db)
            return [];
        var resolvedLimit = Number.isFinite(limit) ? limit : 50;
        var scanLimit = Math.max(resolvedLimit * 5, resolvedLimit);
        var rows = this.db.prepare("\n      SELECT * FROM prediction_markets\n      ORDER BY updated_at DESC\n      LIMIT ?\n    ").all(scanLimit);
        var markets = rows.map(function (row) { return ({
            id: row.id,
            slug: row.slug || undefined,
            title: row.title,
            category: row.category || undefined,
            status: (row.status || 'UNKNOWN'),
            outcomes: (function () {
                if (!row.outcomes)
                    return [];
                try {
                    return JSON.parse(row.outcomes);
                }
                catch (error) {
                    return [];
                }
            })(),
            yesPrice: Number.isFinite(row.yes_price) ? row.yes_price : undefined,
            noPrice: Number.isFinite(row.no_price) ? row.no_price : undefined,
            volume: Number.isFinite(row.volume) ? row.volume : undefined,
            liquidity: Number.isFinite(row.liquidity) ? row.liquidity : undefined,
            closeTime: row.close_time ? new Date(row.close_time) : null,
            source: 'POLYMARKET',
            updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
            metadata: (function () {
                if (!row.metadata)
                    return undefined;
                try {
                    return JSON.parse(row.metadata);
                }
                catch (error) {
                    return undefined;
                }
            })(),
        }); });
        if (filter.statuses && filter.statuses.length) {
            var allowed_1 = new Set(filter.statuses);
            markets = markets.filter(function (market) { return allowed_1.has(market.status); });
        }
        if (Number.isFinite((_a = filter.minVolume) !== null && _a !== void 0 ? _a : NaN)) {
            var minVolume_1 = filter.minVolume;
            markets = markets.filter(function (market) { var _a; return ((_a = market.volume) !== null && _a !== void 0 ? _a : 0) >= minVolume_1; });
        }
        if (Number.isFinite((_b = filter.maxAgeDays) !== null && _b !== void 0 ? _b : NaN) && filter.maxAgeDays > 0) {
            var cutoff_1 = Date.now() - filter.maxAgeDays * 24 * 60 * 60 * 1000;
            markets = markets.filter(function (market) {
                var timestamp = _this.resolveMarketTimestamp(market);
                return timestamp > 0 && timestamp >= cutoff_1;
            });
        }
        return markets.slice(0, resolvedLimit);
    };
    PredictionStore.prototype.getMarketPrices = function (marketId, limit) {
        if (limit === void 0) { limit = 200; }
        if (!this.db)
            this.initialize();
        if (!this.db)
            return [];
        var resolvedLimit = Number.isFinite(limit) ? limit : 200;
        var rows = this.db.prepare("\n      SELECT * FROM prediction_market_prices\n      WHERE market_id = ?\n      ORDER BY timestamp DESC\n      LIMIT ?\n    ").all(marketId, resolvedLimit);
        return rows.map(function (row) { return ({
            marketId: row.market_id,
            timestamp: new Date(row.timestamp),
            yesPrice: row.yes_price,
            noPrice: row.no_price,
            volume: row.volume,
            liquidity: row.liquidity,
        }); }).reverse();
    };
    PredictionStore.prototype.storeTrade = function (trade) {
        var _a;
        if (!this.db)
            this.initialize();
        if (!this.db)
            return;
        this.db.prepare("\n      INSERT OR REPLACE INTO prediction_trades (\n        id, market_id, market_title, outcome, side, shares, price, fee,\n        pnl, timestamp, status, reason\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ").run(trade.id, trade.marketId, trade.marketTitle, trade.outcome, trade.side, trade.shares, trade.price, trade.fee, (_a = trade.pnl) !== null && _a !== void 0 ? _a : null, trade.timestamp.toISOString(), trade.status, trade.reason || null);
    };
    PredictionStore.prototype.getTrades = function (limit) {
        if (limit === void 0) { limit = 50; }
        if (!this.db)
            this.initialize();
        if (!this.db)
            return [];
        var resolvedLimit = Number.isFinite(limit) ? limit : 50;
        var rows = this.db.prepare("\n      SELECT * FROM prediction_trades\n      ORDER BY timestamp DESC\n      LIMIT ?\n    ").all(resolvedLimit);
        return rows.map(function (row) {
            var _a;
            return ({
                id: row.id,
                marketId: row.market_id,
                marketTitle: row.market_title,
                outcome: row.outcome,
                side: row.side,
                shares: row.shares,
                price: row.price,
                fee: row.fee,
                pnl: (_a = row.pnl) !== null && _a !== void 0 ? _a : undefined,
                timestamp: new Date(row.timestamp),
                status: row.status,
                reason: row.reason || undefined,
            });
        });
    };
    PredictionStore.prototype.upsertPosition = function (position) {
        if (!this.db)
            this.initialize();
        if (!this.db)
            return;
        this.db.prepare("\n      INSERT INTO prediction_positions (\n        market_id, market_title, outcome, shares, average_price,\n        last_price, unrealized_pnl, opened_at, updated_at\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ON CONFLICT(market_id, outcome) DO UPDATE SET\n        shares = excluded.shares,\n        average_price = excluded.average_price,\n        last_price = excluded.last_price,\n        unrealized_pnl = excluded.unrealized_pnl,\n        updated_at = excluded.updated_at\n    ").run(position.marketId, position.marketTitle, position.outcome, position.shares, position.averagePrice, position.lastPrice, position.unrealizedPnL, position.openedAt.toISOString(), new Date().toISOString());
    };
    PredictionStore.prototype.removePosition = function (marketId, outcome) {
        if (!this.db)
            this.initialize();
        if (!this.db)
            return;
        this.db.prepare("\n      DELETE FROM prediction_positions WHERE market_id = ? AND outcome = ?\n    ").run(marketId, outcome);
    };
    PredictionStore.prototype.getPositions = function () {
        if (!this.db)
            this.initialize();
        if (!this.db)
            return [];
        var rows = this.db.prepare("\n      SELECT * FROM prediction_positions\n      ORDER BY updated_at DESC\n    ").all();
        return rows.map(function (row) { return ({
            marketId: row.market_id,
            marketTitle: row.market_title,
            outcome: row.outcome,
            shares: row.shares,
            averagePrice: row.average_price,
            lastPrice: row.last_price,
            unrealizedPnL: row.unrealized_pnl,
            openedAt: new Date(row.opened_at),
        }); });
    };
    PredictionStore.prototype.storeBacktest = function (result) {
        if (!this.db)
            this.initialize();
        if (!this.db)
            return;
        this.db.prepare("\n      INSERT OR REPLACE INTO prediction_backtests (\n        id, idea_id, market_id, period_start, period_end, total_return,\n        average_return, win_rate, max_drawdown, trades_simulated,\n        sharpe_ratio, created_at\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ").run("".concat(result.ideaId, ":").concat(result.marketId), result.ideaId, result.marketId, result.period.start.toISOString(), result.period.end.toISOString(), result.totalReturn, result.averageReturn, result.winRate, result.maxDrawdown, result.tradesSimulated, result.sharpeRatio, new Date().toISOString());
    };
    PredictionStore.prototype.getBacktests = function (limit) {
        if (limit === void 0) { limit = 50; }
        if (!this.db)
            this.initialize();
        if (!this.db)
            return [];
        var resolvedLimit = Number.isFinite(limit) ? limit : 50;
        var rows = this.db.prepare("\n      SELECT * FROM prediction_backtests\n      ORDER BY created_at DESC\n      LIMIT ?\n    ").all(resolvedLimit);
        return rows.map(function (row) { return ({
            ideaId: row.idea_id,
            marketId: row.market_id,
            period: {
                start: new Date(row.period_start),
                end: new Date(row.period_end),
            },
            totalReturn: row.total_return,
            averageReturn: row.average_return,
            winRate: row.win_rate,
            maxDrawdown: row.max_drawdown,
            tradesSimulated: row.trades_simulated,
            sharpeRatio: row.sharpe_ratio,
        }); });
    };
    PredictionStore.prototype.updateAgentStatus = function (status) {
        if (!this.db)
            this.initialize();
        if (!this.db)
            return;
        this.db.prepare("\n      INSERT INTO prediction_agent_status (\n        id, status, current_cycle_id, current_step, last_update,\n        last_cycle_start, last_cycle_end, last_trade_id, last_trade_at,\n        active_markets, open_positions, metadata\n      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n      ON CONFLICT(id) DO UPDATE SET\n        status = excluded.status,\n        current_cycle_id = excluded.current_cycle_id,\n        current_step = excluded.current_step,\n        last_update = excluded.last_update,\n        last_cycle_start = excluded.last_cycle_start,\n        last_cycle_end = excluded.last_cycle_end,\n        last_trade_id = excluded.last_trade_id,\n        last_trade_at = excluded.last_trade_at,\n        active_markets = excluded.active_markets,\n        open_positions = excluded.open_positions,\n        metadata = excluded.metadata\n    ").run(status.status, status.currentCycleId, status.currentStep, status.lastUpdate ? status.lastUpdate.toISOString() : null, status.lastCycleStart ? status.lastCycleStart.toISOString() : null, status.lastCycleEnd ? status.lastCycleEnd.toISOString() : null, status.lastTradeId, status.lastTradeAt ? status.lastTradeAt.toISOString() : null, status.activeMarkets, status.openPositions, status.metadata ? JSON.stringify(status.metadata) : null);
    };
    PredictionStore.prototype.getAgentStatus = function () {
        if (!this.db)
            this.initialize();
        if (!this.db) {
            return {
                status: 'IDLE',
                currentCycleId: null,
                currentStep: null,
                lastUpdate: null,
                lastCycleStart: null,
                lastCycleEnd: null,
                lastTradeId: null,
                lastTradeAt: null,
                activeMarkets: 0,
                openPositions: 0,
            };
        }
        var row = this.db.prepare("\n      SELECT * FROM prediction_agent_status WHERE id = 1\n    ").get();
        if (!row) {
            return {
                status: 'IDLE',
                currentCycleId: null,
                currentStep: null,
                lastUpdate: null,
                lastCycleStart: null,
                lastCycleEnd: null,
                lastTradeId: null,
                lastTradeAt: null,
                activeMarkets: 0,
                openPositions: 0,
            };
        }
        return {
            status: row.status,
            currentCycleId: row.current_cycle_id,
            currentStep: row.current_step,
            lastUpdate: row.last_update ? new Date(row.last_update) : null,
            lastCycleStart: row.last_cycle_start ? new Date(row.last_cycle_start) : null,
            lastCycleEnd: row.last_cycle_end ? new Date(row.last_cycle_end) : null,
            lastTradeId: row.last_trade_id,
            lastTradeAt: row.last_trade_at ? new Date(row.last_trade_at) : null,
            activeMarkets: row.active_markets || 0,
            openPositions: row.open_positions || 0,
            metadata: (function () {
                if (!row.metadata)
                    return undefined;
                try {
                    return JSON.parse(row.metadata);
                }
                catch (error) {
                    return undefined;
                }
            })(),
        };
    };
    return PredictionStore;
}());
var predictionStore = new PredictionStore();
exports.default = predictionStore;
