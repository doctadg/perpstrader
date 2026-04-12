"use strict";
// =============================================================================
// PerpsTrader TUI — Views (Dashboard, Positions, News, Risk, Strategies, Predictions)
// =============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardView = DashboardView;
exports.PositionsView = PositionsView;
exports.NewsView = NewsView;
exports.RiskView = RiskView;
exports.StrategiesView = StrategiesView;
exports.PredictionsView = PredictionsView;
exports.OrdersView = OrdersView;
exports.BacktestView = BacktestView;
const react_1 = __importDefault(require("react"));
const ink_1 = require("ink");
const T = __importStar(require("./theme"));
const components_1 = require("./components");
// =============================================================================
// 1. DASHBOARD VIEW
// =============================================================================
function DashboardView({ data, loading }) {
    if (loading) {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", alignItems: "center", flexGrow: 1, paddingTop: 2 },
            react_1.default.createElement(components_1.Spinner, { text: "Loading dashboard..." }),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                '\n',
                "  Fetching all data from Agent API...")));
    }
    const positions = data.positions?.positions || [];
    const signals = data.signals?.signals || [];
    const news = data.news?.articles || [];
    const risk = data.risk;
    const strategies = data.strategies?.strategies || [];
    const predictions = data.predictions?.positions || [];
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
        react_1.default.createElement(ink_1.Box, { flexDirection: "row", flexGrow: 1 },
            react_1.default.createElement(components_1.Panel, { title: "Positions", icon: T.icons.chart, flex: 1 }, positions.length === 0 ? (react_1.default.createElement(components_1.EmptyState, { message: "No open positions" })) : (positions.slice(0, 5).map((pos, i) => {
                const pnl = pos.unrealizedPnL || 0;
                const entryPx = pos.entryPrice || pos.averageEntryPrice || 0;
                return (react_1.default.createElement(ink_1.Box, { key: i, flexDirection: "column", marginBottom: i < Math.min(positions.length, 5) - 1 ? 1 : 0 },
                    react_1.default.createElement(ink_1.Box, null,
                        react_1.default.createElement(ink_1.Text, { color: T.colors.text, bold: true }, pos.symbol || '???'),
                        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                            " ",
                            pos.leverage || 1,
                            "x "),
                        react_1.default.createElement(ink_1.Text, { color: pos.side === 'LONG' ? T.colors.green : T.colors.red }, (pos.side || 'LONG').toLowerCase())),
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                        '  ',
                        "Entry: ",
                        T.formatNum(entryPx)),
                    react_1.default.createElement(ink_1.Text, { color: T.pnlColor(pnl) },
                        '  ',
                        T.pnlIcon(pnl),
                        " ",
                        T.formatUSD(pnl),
                        pos.pnlPct != null && ` (${T.formatPct(pos.pnlPct)})`)));
            }))),
            react_1.default.createElement(components_1.Panel, { title: "Signals", icon: T.icons.live, flex: 1 }, signals.length === 0 ? (react_1.default.createElement(components_1.EmptyState, { message: "No signals yet" })) : (signals.slice(0, 6).map((sig, i) => {
                const dir = sig.signal || sig.direction || sig.side || 'NEUTRAL';
                return (react_1.default.createElement(ink_1.Box, { key: i, flexDirection: "column", marginBottom: i < Math.min(signals.length, 6) - 1 ? 1 : 0 },
                    react_1.default.createElement(ink_1.Box, null,
                        react_1.default.createElement(ink_1.Text, { color: T.signalColor(dir) }, T.icons.dot),
                        react_1.default.createElement(ink_1.Text, { color: T.colors.text, bold: true },
                            " ",
                            (dir).toUpperCase().substring(0, 7)),
                        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                            " ",
                            sig.symbol || '')),
                    sig.confidence != null && sig.confidence > 0 && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                        '  ',
                        "Conf: ",
                        (sig.confidence * 100).toFixed(0),
                        "%"))));
            }))),
            react_1.default.createElement(components_1.Panel, { title: "News", icon: T.icons.news, flex: 1 }, news.length === 0 ? (react_1.default.createElement(components_1.EmptyState, { message: "No news articles" })) : (news.slice(0, 5).map((article, i) => {
                const sentiment = article.sentiment || article.overallSentiment || 'NEUTRAL';
                return (react_1.default.createElement(ink_1.Box, { key: i, flexDirection: "column", marginBottom: i < Math.min(news.length, 5) - 1 ? 1 : 0 },
                    react_1.default.createElement(ink_1.Box, null,
                        react_1.default.createElement(ink_1.Text, { color: T.sentimentColor(sentiment) }, T.icons.dot),
                        react_1.default.createElement(ink_1.Text, { color: T.colors.subtext0 },
                            " ",
                            T.truncate(article.title || 'Untitled', 30))),
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                        '  ',
                        T.timeAgo(article.publishedAt || article.timestamp || article.createdAt),
                        article.source ? ` \u00b7 ${article.source}` : '')));
            })))),
        react_1.default.createElement(ink_1.Box, { flexDirection: "row", flexGrow: 1 },
            react_1.default.createElement(components_1.Panel, { title: "Risk", icon: T.icons.risk, flex: 1 }, risk ? (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
                react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                        '  ',
                        T.icons.warning,
                        " Risk:",
                        ' ',
                        react_1.default.createElement(ink_1.Text, { color: T.riskLevelColor(risk.riskLevel), bold: true }, risk.riskLevel || 'UNKNOWN')),
                    risk.riskScore != null && (react_1.default.createElement(components_1.ProgressBar, { percent: risk.riskScore * 10, width: 22 }))),
                react_1.default.createElement(components_1.DataRow, { label: "Drawdown", value: `${(risk.drawdown?.current || 0).toFixed(1)}% / ${(risk.drawdown?.max || 0).toFixed(1)}%`, valueColor: T.colors.peach }),
                react_1.default.createElement(components_1.DataRow, { label: "Margin", value: `${(risk.exposure?.utilization || 0).toFixed(1)}%` }),
                react_1.default.createElement(components_1.DataRow, { label: "Gross Exp", value: T.formatUSD(risk.exposure?.gross || 0) }),
                react_1.default.createElement(components_1.DataRow, { label: "Circuit", value: react_1.default.createElement(ink_1.Text, null,
                        react_1.default.createElement(ink_1.Text, { color: T.colors.green },
                            T.icons.check,
                            " OK"),
                        risk.warnings && risk.warnings.length > 0 && (react_1.default.createElement(ink_1.Text, { color: T.colors.yellow },
                            " ",
                            ' ',
                            risk.warnings.length,
                            " warn"))) }))) : (react_1.default.createElement(components_1.EmptyState, { message: "No risk data available" }))),
            react_1.default.createElement(components_1.Panel, { title: "Strategies", icon: T.icons.strategy, flex: 1 }, strategies.length === 0 ? (react_1.default.createElement(components_1.EmptyState, { message: "No strategies active" })) : (strategies.slice(0, 5).map((strat, i) => {
                const perf = strat.performance || {};
                return (react_1.default.createElement(ink_1.Box, { key: i, flexDirection: "column", marginBottom: i < Math.min(strategies.length, 5) - 1 ? 1 : 0 },
                    react_1.default.createElement(ink_1.Box, null,
                        react_1.default.createElement(ink_1.Text, { color: strat.isActive ? T.colors.green : T.colors.overlay1 }, strat.isActive ? T.icons.dot : T.icons.bullet),
                        react_1.default.createElement(ink_1.Text, { color: T.colors.text, bold: true },
                            " ",
                            T.truncate(strat.name || 'Unknown', 22))),
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                        '  ',
                        "Sharpe: ",
                        react_1.default.createElement(ink_1.Text, { color: T.colors.text }, (perf.sharpeRatio || 0).toFixed(2)),
                        '  Win: ',
                        (perf.winRate * 100 || 0).toFixed(0),
                        "%",
                        '  PnL: ',
                        T.formatUSD(perf.totalPnL || 0))));
            }))),
            react_1.default.createElement(components_1.Panel, { title: "Predictions", icon: T.icons.prediction, flex: 1 }, predictions.length === 0 ? (react_1.default.createElement(components_1.EmptyState, { message: "No prediction positions" })) : (predictions.slice(0, 5).map((pred, i) => {
                const status = pred.status || pred.outcome || 'OPEN';
                const pnl = pred.realizedPnL || pred.unrealizedPnL || pred.pnl || 0;
                return (react_1.default.createElement(ink_1.Box, { key: i, flexDirection: "column", marginBottom: i < Math.min(predictions.length, 5) - 1 ? 1 : 0 },
                    react_1.default.createElement(ink_1.Box, null,
                        react_1.default.createElement(ink_1.Text, { color: status === 'WON' ? T.colors.green : status === 'LOST' ? T.colors.red : T.colors.yellow },
                            status === 'WON' ? T.icons.check : status === 'LOST' ? T.icons.cross : T.icons.dot,
                            ' ',
                            status.toUpperCase().substring(0, 4)),
                        react_1.default.createElement(ink_1.Text, { color: T.colors.subtext0 },
                            " ",
                            T.truncate(pred.marketTitle || pred.title || '???', 25))),
                    pnl !== 0 && (react_1.default.createElement(ink_1.Text, { color: T.pnlColor(pnl) },
                        '  ',
                        T.formatUSD(pnl)))));
            }))))));
}
// =============================================================================
// 2. POSITIONS VIEW — Detailed position cards with scrolling
// =============================================================================
const POSITION_CARD_HEIGHT = 8; // approximate lines per position card
function PositionsView({ data, loading, scrollOffset, selectedIndex = 0, onAction }) {
    const positions = data.positions?.positions || [];
    const totalPnL = data.positions?.totalUnrealizedPnL || 0;
    if (loading && positions.length === 0) {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", alignItems: "center", flexGrow: 1, paddingTop: 2 },
            react_1.default.createElement(components_1.Spinner, { text: "Loading positions..." })));
    }
    // Calculate visible window
    const maxVisible = Math.max(1, Math.floor(20 / POSITION_CARD_HEIGHT)); // ~20 rows available
    const clampedOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, positions.length - maxVisible)));
    const visiblePositions = positions.slice(clampedOffset, clampedOffset + maxVisible);
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
        react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.subtext1, bold: true },
                '  ',
                T.icons.chart,
                " Positions (",
                positions.length,
                " open)"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502'),
            react_1.default.createElement(ink_1.Text, { color: T.pnlColor(totalPnL) },
                ' ',
                T.pnlIcon(totalPnL),
                " Total PnL: ",
                T.formatUSD(totalPnL)),
            positions.length > maxVisible && (react_1.default.createElement(react_1.default.Fragment, null,
                react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                    " ",
                    '\u2502'),
                react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                    ' ',
                    clampedOffset + selectedIndex + 1,
                    "/",
                    positions.length))),
            positions.length > 0 && onAction && (react_1.default.createElement(react_1.default.Fragment, null,
                react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                    " ",
                    '\u2502'),
                react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                    " ",
                    ' ',
                    "[c] close selected")))),
        positions.length === 0 ? (react_1.default.createElement(components_1.Panel, { title: "No Positions", icon: T.icons.bullet },
            react_1.default.createElement(components_1.EmptyState, { message: "No open positions found" }))) : (visiblePositions.map((pos, i) => {
            const realIndex = clampedOffset + i;
            const isSelected = realIndex === selectedIndex;
            const pnl = pos.unrealizedPnL || 0;
            const entryPx = pos.entryPrice || pos.averageEntryPrice || 0;
            const markPx = pos.markPrice || pos.currentPrice || 0;
            const size = pos.size || pos.quantity || 0;
            const leverage = pos.leverage || 1;
            const liqPrice = pos.liquidationPrice;
            const stopLoss = pos.stopLoss;
            const takeProfit = pos.takeProfit;
            const side = pos.side || 'LONG';
            const pnlPct = pos.pnlPct || (entryPx > 0 ? ((markPx - entryPx) / entryPx * 100 * (side === 'SHORT' ? -1 : 1)) : 0);
            const notional = size * (markPx || entryPx);
            return (react_1.default.createElement(components_1.Panel, { key: realIndex, title: `${isSelected ? '\u25b6 ' : ''}${pos.symbol || '???'} ${side.toLowerCase()} ${leverage}x`, icon: side === 'LONG' ? T.icons.up : T.icons.down, borderColor: isSelected ? T.colors.mauve : (side === 'LONG' ? '#2d4a2d' : '#4a2d2d') },
                react_1.default.createElement(ink_1.Box, { flexDirection: "row" },
                    react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
                        react_1.default.createElement(components_1.DataRow, { label: "Entry", value: T.formatNum(entryPx), indent: 0 }),
                        react_1.default.createElement(components_1.DataRow, { label: "Mark", value: T.formatNum(markPx), indent: 0 }),
                        react_1.default.createElement(components_1.DataRow, { label: "Size", value: `${T.formatNum(size, 4)} (${T.formatUSD(notional)})`, indent: 0 })),
                    react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
                        react_1.default.createElement(components_1.DataRow, { label: "PnL", value: `${T.formatUSD(pnl)} (${T.formatPct(pnlPct)})`, valueColor: T.pnlColor(pnl), indent: 0 }),
                        liqPrice != null && (react_1.default.createElement(components_1.DataRow, { label: "Liq Price", value: T.formatNum(liqPrice), valueColor: T.colors.red, indent: 0 })))),
                (stopLoss || takeProfit) && (react_1.default.createElement(ink_1.Box, { marginTop: 1 },
                    stopLoss != null && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                        '  ',
                        "SL: ",
                        react_1.default.createElement(ink_1.Text, { color: T.colors.red }, T.formatNum(stopLoss)))),
                    takeProfit != null && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                        '  ',
                        "TP: ",
                        react_1.default.createElement(ink_1.Text, { color: T.colors.green }, T.formatNum(takeProfit))))))));
        }))));
}
// =============================================================================
// 3. NEWS VIEW — Scrollable news feed
// =============================================================================
function NewsView({ data, loading, scrollOffset }) {
    const articles = data.news?.articles || [];
    const categories = data.news?.categories || {};
    if (loading && articles.length === 0) {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", alignItems: "center", flexGrow: 1, paddingTop: 2 },
            react_1.default.createElement(components_1.Spinner, { text: "Loading news..." })));
    }
    // Category summary
    const catEntries = Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
        react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.subtext1, bold: true },
                '  ',
                T.icons.news,
                " News Feed (",
                articles.length,
                " articles)"),
            catEntries.length > 0 && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                ' ',
                catEntries.map(([k, v]) => `${k}(${v})`).join(' \u00b7 ')))),
        articles.length === 0 ? (react_1.default.createElement(components_1.Panel, { title: "No News", icon: T.icons.bullet },
            react_1.default.createElement(components_1.EmptyState, { message: "No news articles found" }))) : (react_1.default.createElement(ink_1.Box, { flexDirection: "column" },
            articles.slice(scrollOffset, scrollOffset + 20).map((article, i) => {
                const sentiment = article.sentiment || article.overallSentiment || 'NEUTRAL';
                const categories = article.categories || [];
                const importance = article.importance || article.impact || 'MEDIUM';
                const impColor = importance === 'HIGH' ? T.colors.peach : importance === 'LOW' ? T.colors.overlay0 : T.colors.yellow;
                return (react_1.default.createElement(components_1.Panel, { key: i, title: T.truncate(article.title || 'Untitled', 35), compact: true, borderColor: T.colors.surface0 },
                    react_1.default.createElement(ink_1.Box, null,
                        react_1.default.createElement(ink_1.Text, { color: T.sentimentColor(sentiment), bold: true },
                            T.icons.dot,
                            " ",
                            (sentiment).toUpperCase().substring(0, 7)),
                        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                            " ",
                            '\u2502',
                            " "),
                        react_1.default.createElement(ink_1.Text, { color: impColor }, importance),
                        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                            " ",
                            '\u2502',
                            " "),
                        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, T.timeAgo(article.publishedAt || article.timestamp || article.createdAt))),
                    react_1.default.createElement(ink_1.Box, null,
                        react_1.default.createElement(ink_1.Text, { color: T.colors.text, bold: true }, T.truncate(article.title || 'Untitled', 60))),
                    react_1.default.createElement(ink_1.Box, null, article.description && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, T.truncate(article.description, 80)))),
                    categories.length > 0 && (react_1.default.createElement(ink_1.Box, null,
                        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                            '  ',
                            categories.slice(0, 5).map((c) => `#${c}`).join(' ')))),
                    (article.source || article.url) && (react_1.default.createElement(ink_1.Box, null,
                        react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                            '  ',
                            article.source || 'Unknown',
                            article.url && react_1.default.createElement(ink_1.Text, { color: T.colors.blue },
                                " ",
                                T.icons.right,
                                " link"))))));
            }),
            articles.length > scrollOffset + 20 && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                '  ',
                T.icons.down,
                " ",
                articles.length - scrollOffset - 20,
                " more articles..."))))));
}
// =============================================================================
// 4. RISK VIEW — Full risk dashboard
// =============================================================================
function RiskView({ data, loading }) {
    const risk = data.risk;
    const portfolio = data.portfolio;
    if (loading && !risk) {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", alignItems: "center", flexGrow: 1, paddingTop: 2 },
            react_1.default.createElement(components_1.Spinner, { text: "Loading risk data..." })));
    }
    const drawdown = risk?.drawdown || {};
    const exposure = risk?.exposure || {};
    const daily = risk?.dailyMetrics || {};
    const breakers = risk?.circuitBreakers || [];
    const warnings = risk?.warnings || [];
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
        react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.subtext1, bold: true },
                '  ',
                T.icons.risk,
                " Risk Dashboard"),
            risk?.riskLevel && (react_1.default.createElement(react_1.default.Fragment, null,
                react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                    " ",
                    '\u2502'),
                react_1.default.createElement(ink_1.Text, { color: T.riskLevelColor(risk.riskLevel), bold: true },
                    ' ',
                    "Risk: ",
                    risk.riskLevel)))),
        !risk ? (react_1.default.createElement(components_1.Panel, { title: "No Risk Data", icon: T.icons.bullet },
            react_1.default.createElement(components_1.EmptyState, { message: "Risk data not available" }))) : (react_1.default.createElement(react_1.default.Fragment, null,
            react_1.default.createElement(components_1.Panel, { title: "Risk Score", icon: T.icons.warning },
                react_1.default.createElement(components_1.ProgressBar, { percent: (risk.riskScore || 0) * 10, width: 40, color: T.riskLevelColor(risk.riskLevel) }),
                warnings.length > 0 && (react_1.default.createElement(ink_1.Box, { flexDirection: "column", marginTop: 1 }, warnings.slice(0, 5).map((w, i) => (react_1.default.createElement(ink_1.Box, { key: i },
                    react_1.default.createElement(ink_1.Text, { color: T.colors.yellow },
                        T.icons.warning,
                        " "),
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, w))))))),
            react_1.default.createElement(ink_1.Box, { flexDirection: "row" },
                react_1.default.createElement(components_1.Panel, { title: "Drawdown", icon: T.icons.down, flex: 1 },
                    react_1.default.createElement(components_1.DataRow, { label: "Current", value: `${(drawdown.current || 0).toFixed(2)}%`, valueColor: drawdown.current > 10 ? T.colors.red : drawdown.current > 5 ? T.colors.yellow : T.colors.green }),
                    react_1.default.createElement(components_1.DataRow, { label: "Max", value: `${(drawdown.max || 0).toFixed(2)}%`, valueColor: T.colors.peach }),
                    react_1.default.createElement(components_1.DataRow, { label: "Daily", value: `${(drawdown.daily || 0).toFixed(2)}%`, valueColor: T.pnlColor(-(drawdown.daily || 0)) })),
                react_1.default.createElement(components_1.Panel, { title: "Exposure", icon: T.icons.chart, flex: 1 },
                    react_1.default.createElement(components_1.DataRow, { label: "Gross", value: T.formatUSD(exposure.gross || 0) }),
                    react_1.default.createElement(components_1.DataRow, { label: "Net", value: T.formatUSD(exposure.net || 0) }),
                    react_1.default.createElement(components_1.DataRow, { label: "Long", value: T.formatUSD(exposure.long || 0), valueColor: T.colors.green }),
                    react_1.default.createElement(components_1.DataRow, { label: "Short", value: T.formatUSD(exposure.short || 0), valueColor: T.colors.red }),
                    react_1.default.createElement(components_1.DataRow, { label: "Utilization", value: `${(exposure.utilization || 0).toFixed(1)}%` }),
                    exposure.utilization != null && (react_1.default.createElement(components_1.ProgressBar, { percent: exposure.utilization, width: 20 })))),
            react_1.default.createElement(components_1.Panel, { title: "Today's Trading", icon: T.icons.clock },
                react_1.default.createElement(components_1.DataRow, { label: "PnL", value: T.formatUSD(daily.pnl || 0), valueColor: T.pnlColor(daily.pnl || 0) }),
                react_1.default.createElement(components_1.DataRow, { label: "Trades", value: `${daily.trades || 0}` }),
                react_1.default.createElement(components_1.DataRow, { label: "Wins", value: `${daily.wins || 0}`, valueColor: T.colors.green }),
                react_1.default.createElement(components_1.DataRow, { label: "Losses", value: `${daily.losses || 0}`, valueColor: T.colors.red }),
                daily.consecutiveLosses > 0 && (react_1.default.createElement(components_1.DataRow, { label: "Consec. Losses", value: `${daily.consecutiveLosses}`, valueColor: daily.consecutiveLosses > 3 ? T.colors.red : T.colors.yellow }))),
            react_1.default.createElement(components_1.Panel, { title: "Circuit Breakers", icon: T.icons.risk }, breakers.length === 0 ? (react_1.default.createElement(components_1.DataRow, { label: "All Systems", value: react_1.default.createElement(ink_1.Text, { color: T.colors.green },
                    T.icons.check,
                    " OK") })) : (breakers.map((cb, i) => {
                const state = cb.state || 'CLOSED';
                const isOk = state === 'CLOSED';
                return (react_1.default.createElement(ink_1.Box, { key: i, flexDirection: "column" },
                    react_1.default.createElement(components_1.DataRow, { label: cb.name || `Breaker ${i + 1}`, value: react_1.default.createElement(ink_1.Text, { color: isOk ? T.colors.green : T.colors.red },
                            isOk ? T.icons.check : T.icons.cross,
                            " ",
                            state) }),
                    cb.tripCount > 0 && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                        '      ',
                        "Trips: ",
                        cb.tripCount))));
            })))))));
}
// =============================================================================
// 5. STRATEGIES VIEW — Strategy leaderboard with scrolling
// =============================================================================
const STRATEGY_CARD_HEIGHT = 10;
function StrategiesView({ data, loading, scrollOffset, selectedIndex = 0 }) {
    const strategies = data.strategies?.strategies || [];
    const activeCount = data.strategies?.activeCount || 0;
    if (loading && strategies.length === 0) {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", alignItems: "center", flexGrow: 1, paddingTop: 2 },
            react_1.default.createElement(components_1.Spinner, { text: "Loading strategies..." })));
    }
    // Sort by Sharpe ratio descending
    const sorted = [...strategies].sort((a, b) => {
        const sa = a.performance?.sharpeRatio || 0;
        const sb = b.performance?.sharpeRatio || 0;
        return sb - sa;
    });
    // Calculate visible window
    const maxVisible = Math.max(1, Math.floor(20 / STRATEGY_CARD_HEIGHT));
    const clampedOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, sorted.length - maxVisible)));
    const visible = sorted.slice(clampedOffset, clampedOffset + maxVisible);
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
        react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.subtext1, bold: true },
                '  ',
                T.icons.strategy,
                " Strategies (",
                activeCount,
                "/",
                strategies.length,
                " active)"),
            sorted.length > maxVisible && (react_1.default.createElement(react_1.default.Fragment, null,
                react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                    " ",
                    '\u2502'),
                react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                    ' ',
                    clampedOffset + selectedIndex + 1,
                    "/",
                    sorted.length)))),
        strategies.length === 0 ? (react_1.default.createElement(components_1.Panel, { title: "No Strategies", icon: T.icons.bullet },
            react_1.default.createElement(components_1.EmptyState, { message: "No strategies configured" }))) : (visible.map((strat, i) => {
            const realIndex = clampedOffset + i;
            const isSelected = realIndex === selectedIndex;
            const perf = strat.performance || {};
            const isActive = strat.isActive !== false;
            const symbols = (strat.symbols || []).join(', ');
            const type = strat.type || 'AI_PREDICTION';
            const totalPnL = perf.totalPnL || 0;
            const winRate = perf.winRate || 0;
            const sharpe = perf.sharpeRatio || 0;
            const trades = perf.totalTrades || 0;
            const maxDD = perf.maxDrawdown || 0;
            const pf = perf.profitFactor || 0;
            return (react_1.default.createElement(components_1.Panel, { key: realIndex, title: `${isSelected ? '\u25b6 ' : ''}${T.truncate(strat.name || 'Unnamed Strategy', 35)}`, icon: isActive ? T.icons.dot : T.icons.bullet, borderColor: isSelected ? T.colors.mauve : (isActive ? T.colors.surface1 : T.colors.surface0) },
                react_1.default.createElement(ink_1.Box, null,
                    react_1.default.createElement(ink_1.Text, { color: isActive ? T.colors.green : T.colors.overlay1, bold: true }, isActive ? 'ACTIVE' : 'INACTIVE'),
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                        ' ',
                        "\\u00b7 ",
                        type.replace(/_/g, ' '))),
                symbols && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                    '  ',
                    "Symbols: ",
                    react_1.default.createElement(ink_1.Text, { color: T.colors.subtext0 }, symbols))),
                react_1.default.createElement(ink_1.Box, { flexDirection: "row", marginTop: 1 },
                    react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
                        react_1.default.createElement(components_1.DataRow, { label: "Sharpe", value: sharpe.toFixed(2), valueColor: sharpe > 1 ? T.colors.green : sharpe > 0.5 ? T.colors.text : T.colors.red, indent: 0 }),
                        react_1.default.createElement(components_1.DataRow, { label: "Win Rate", value: `${(winRate * 100).toFixed(1)}%`, valueColor: winRate > 0.6 ? T.colors.green : winRate > 0.4 ? T.colors.text : T.colors.red, indent: 0 }),
                        react_1.default.createElement(components_1.DataRow, { label: "Trades", value: `${trades}`, indent: 0 })),
                    react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
                        react_1.default.createElement(components_1.DataRow, { label: "PnL", value: T.formatUSD(totalPnL), valueColor: T.pnlColor(totalPnL), indent: 0 }),
                        react_1.default.createElement(components_1.DataRow, { label: "Max DD", value: `${maxDD.toFixed(1)}%`, valueColor: maxDD > 15 ? T.colors.red : maxDD > 8 ? T.colors.yellow : T.colors.green, indent: 0 }),
                        react_1.default.createElement(components_1.DataRow, { label: "Profit Factor", value: pf.toFixed(2), valueColor: pf > 1.5 ? T.colors.green : pf > 1 ? T.colors.text : T.colors.red, indent: 0 }))),
                react_1.default.createElement(ink_1.Box, { marginTop: 1 },
                    react_1.default.createElement(components_1.ProgressBar, { percent: Math.min(100, sharpe * 50), width: 30, color: sharpe > 1 ? T.colors.green : T.colors.teal }))));
        }))));
}
// =============================================================================
// 6. PREDICTIONS VIEW — Prediction market positions
// =============================================================================
function PredictionsView({ data, loading }) {
    const positions = data.predictions?.positions || [];
    const signals = data.predictions?.signals || [];
    const totalPnL = data.predictions?.unrealizedPnL || 0;
    const totalPositions = data.predictions?.totalPositions || 0;
    if (loading && positions.length === 0) {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", alignItems: "center", flexGrow: 1, paddingTop: 2 },
            react_1.default.createElement(components_1.Spinner, { text: "Loading predictions..." })));
    }
    // Stats
    const won = positions.filter((p) => p.status === 'WON' || p.outcome === 'WON').length;
    const lost = positions.filter((p) => p.status === 'LOST' || p.outcome === 'LOST').length;
    const open = positions.filter((p) => !p.status || p.status === 'OPEN' || p.status === 'PENDING').length;
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
        react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.subtext1, bold: true },
                '  ',
                T.icons.prediction,
                " Predictions (",
                totalPositions,
                " positions)"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502'),
            react_1.default.createElement(ink_1.Text, { color: T.colors.green },
                " ",
                T.icons.check,
                won,
                "W"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, " "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.red },
                T.icons.cross,
                lost,
                "L"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, " "),
            react_1.default.createElement(ink_1.Text, { color: T.colors.yellow },
                T.icons.dot,
                open,
                " open"),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                " ",
                '\u2502'),
            react_1.default.createElement(ink_1.Text, { color: T.pnlColor(totalPnL) },
                ' ',
                "Unrealized: ",
                T.formatUSD(totalPnL))),
        positions.length === 0 ? (react_1.default.createElement(components_1.Panel, { title: "No Predictions", icon: T.icons.bullet },
            react_1.default.createElement(components_1.EmptyState, { message: "No prediction market positions" }))) : (react_1.default.createElement(react_1.default.Fragment, null,
            signals.length > 0 && (react_1.default.createElement(components_1.Panel, { title: "Recent Signals", icon: T.icons.live, compact: true }, signals.slice(0, 5).map((sig, i) => (react_1.default.createElement(ink_1.Box, { key: i, flexDirection: "column", marginBottom: i < Math.min(signals.length, 5) - 1 ? 1 : 0 },
                react_1.default.createElement(ink_1.Box, null,
                    react_1.default.createElement(ink_1.Text, { color: sig.action === 'BUY' ? T.colors.green : sig.action === 'SELL' ? T.colors.red : T.colors.yellow },
                        T.icons.diamond,
                        " ",
                        sig.action || 'HOLD'),
                    react_1.default.createElement(ink_1.Text, { color: T.colors.text, bold: true },
                        " ",
                        T.truncate(sig.marketTitle || '???', 40))),
                react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                    '  ',
                    "Conf: ",
                    (sig.confidence * 100).toFixed(0),
                    "%",
                    sig.reason && ` \u00b7 ${T.truncate(sig.reason, 50)}`)))))),
            positions.map((pred, i) => {
                const status = pred.status || pred.outcome || 'OPEN';
                const pnl = pred.realizedPnL || pred.unrealizedPnL || pred.pnl || 0;
                const confidence = pred.confidence || pred.probability || 0;
                const title = pred.marketTitle || pred.title || pred.question || 'Unknown Market';
                const entryPrice = pred.entryPrice || pred.avgPrice || 0;
                const currentPrice = pred.currentPrice || pred.markPrice || 0;
                const size = pred.size || pred.quantity || 0;
                const side = pred.side || pred.outcome || 'YES';
                const isWon = status === 'WON';
                const isLost = status === 'LOST';
                const isOpen = !isWon && !isLost;
                return (react_1.default.createElement(components_1.Panel, { key: i, title: T.truncate(title, 45), icon: isWon ? T.icons.check : isLost ? T.icons.cross : T.icons.prediction, borderColor: isWon ? '#2d4a2d' : isLost ? '#4a2d2d' : T.colors.surface1 },
                    react_1.default.createElement(ink_1.Box, { flexDirection: "row" },
                        react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
                            react_1.default.createElement(ink_1.Box, null,
                                react_1.default.createElement(ink_1.Text, { color: isWon ? T.colors.green : isLost ? T.colors.red : T.colors.yellow, bold: true }, status.toUpperCase()),
                                react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                                    ' ',
                                    "\\u00b7 ",
                                    side === 'YES' ? 'YES' : 'NO')),
                            react_1.default.createElement(components_1.DataRow, { label: "Confidence", value: `${(confidence * 100 || confidence || 0).toFixed(0)}%`, valueColor: confidence > 0.7 ? T.colors.green : confidence > 0.5 ? T.colors.yellow : T.colors.red, indent: 0 }),
                            size > 0 && (react_1.default.createElement(components_1.DataRow, { label: "Size", value: T.formatUSD(size), indent: 0 }))),
                        react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
                            entryPrice > 0 && (react_1.default.createElement(components_1.DataRow, { label: "Entry", value: `$${entryPrice.toFixed(2)}`, indent: 0 })),
                            currentPrice > 0 && currentPrice !== entryPrice && (react_1.default.createElement(components_1.DataRow, { label: "Current", value: `$${currentPrice.toFixed(2)}`, indent: 0 })),
                            react_1.default.createElement(components_1.DataRow, { label: "PnL", value: T.formatUSD(pnl), valueColor: T.pnlColor(pnl), indent: 0 })))));
            })))));
}
// =============================================================================
// 7. ORDERS VIEW — Open orders with cancel action
// =============================================================================
function OrdersView({ data, loading, scrollOffset, selectedIndex = 0, onAction }) {
    const orders = data.orders?.orders || [];
    if (loading && orders.length === 0) {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", alignItems: "center", flexGrow: 1, paddingTop: 2 },
            react_1.default.createElement(components_1.Spinner, { text: "Loading orders..." })));
    }
    // Calculate visible window
    const maxVisible = 15;
    const clampedOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, orders.length - maxVisible)));
    const visible = orders.slice(clampedOffset, clampedOffset + maxVisible);
    const statusColor = (status) => {
        switch ((status || '').toUpperCase()) {
            case 'FILLED':
                return T.colors.green;
            case 'OPEN':
            case 'PENDING':
                return T.colors.yellow;
            case 'CANCELLED':
            case 'CANCELED':
                return T.colors.red;
            case 'PARTIALLY_FILLED':
                return T.colors.peach;
            default:
                return T.colors.overlay0;
        }
    };
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
        react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.subtext1, bold: true },
                '  ',
                T.icons.chart,
                " Orders (",
                orders.length,
                " open)"),
            orders.length > maxVisible && (react_1.default.createElement(react_1.default.Fragment, null,
                react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                    " ",
                    '\u2502'),
                react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                    ' ',
                    clampedOffset + selectedIndex + 1,
                    "/",
                    orders.length))),
            orders.length > 0 && onAction && (react_1.default.createElement(react_1.default.Fragment, null,
                react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                    " ",
                    '\u2502'),
                react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                    " ",
                    ' ',
                    "[x] cancel selected")))),
        orders.length > 0 && (react_1.default.createElement(ink_1.Box, { paddingLeft: 2, marginBottom: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1, bold: true },
                '  ',
                'ID'.padEnd(12),
                'Symbol'.padEnd(10),
                'Side'.padEnd(6),
                'Type'.padEnd(8),
                'Price'.padEnd(12),
                'Size'.padEnd(10),
                'Status'.padEnd(12)),
            react_1.default.createElement(ink_1.Text, { color: T.colors.surface0 }, ' '.repeat(80)))),
        orders.length === 0 ? (react_1.default.createElement(components_1.Panel, { title: "No Orders", icon: T.icons.bullet },
            react_1.default.createElement(components_1.EmptyState, { message: "No open orders found" }))) : (visible.map((order, i) => {
            const realIndex = clampedOffset + i;
            const isSelected = realIndex === selectedIndex;
            const id = T.truncate(order.id || order.orderId || '???', 12);
            const symbol = (order.symbol || '???').padEnd(10);
            const side = order.side === 'BUY' ? 'BUY ' : 'SELL';
            const type = (order.type || 'LIMIT').padEnd(8);
            const price = (order.price != null ? T.formatNum(order.price) : 'MARKET').padEnd(12);
            const size = T.formatNum(order.size || 0, 4).padEnd(10);
            const status = (order.status || 'OPEN').padEnd(12);
            const created = order.createdAt ? T.timeAgo(order.createdAt) : '';
            return (react_1.default.createElement(ink_1.Box, { key: realIndex, paddingLeft: 2 },
                react_1.default.createElement(ink_1.Text, { color: isSelected ? T.colors.mauve : T.colors.text, bold: isSelected },
                    isSelected ? '\u25b6 ' : '  ',
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, id),
                    ' ',
                    react_1.default.createElement(ink_1.Text, { bold: true }, symbol),
                    ' ',
                    react_1.default.createElement(ink_1.Text, { color: order.side === 'BUY' ? T.colors.green : T.colors.red }, side),
                    ' ',
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 }, type),
                    ' ',
                    react_1.default.createElement(ink_1.Text, null, price),
                    ' ',
                    react_1.default.createElement(ink_1.Text, null, size),
                    ' ',
                    react_1.default.createElement(ink_1.Text, { color: statusColor(order.status) }, status),
                    created && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                        " ",
                        created)))));
        }))));
}
// =============================================================================
// 8. BACKTEST VIEW — Backtest history and results
// =============================================================================
function BacktestView({ data, loading, scrollOffset, selectedIndex = 0 }) {
    const runs = data.backtest?.runs || [];
    if (loading && runs.length === 0) {
        return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", alignItems: "center", flexGrow: 1, paddingTop: 2 },
            react_1.default.createElement(components_1.Spinner, { text: "Loading backtests..." })));
    }
    // Calculate visible window
    const maxVisible = 10;
    const clampedOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, runs.length - maxVisible)));
    const visible = runs.slice(clampedOffset, clampedOffset + maxVisible);
    return (react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
        react_1.default.createElement(ink_1.Box, { marginBottom: 1 },
            react_1.default.createElement(ink_1.Text, { color: T.colors.subtext1, bold: true },
                '  ',
                T.icons.strategy,
                " Backtest History (",
                runs.length,
                " runs)"),
            runs.length > maxVisible && (react_1.default.createElement(react_1.default.Fragment, null,
                react_1.default.createElement(ink_1.Text, { color: T.colors.surface2 },
                    " ",
                    '\u2502'),
                react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                    ' ',
                    clampedOffset + selectedIndex + 1,
                    "/",
                    runs.length)))),
        runs.length === 0 ? (react_1.default.createElement(components_1.Panel, { title: "No Backtests", icon: T.icons.bullet },
            react_1.default.createElement(components_1.EmptyState, { message: "No backtest results found" }))) : (visible.map((run, i) => {
            const realIndex = clampedOffset + i;
            const isSelected = realIndex === selectedIndex;
            const runStatusColor = run.status === 'COMPLETED'
                ? T.colors.green
                : run.status === 'RUNNING'
                    ? T.colors.yellow
                    : run.status === 'FAILED'
                        ? T.colors.red
                        : T.colors.overlay0;
            return (react_1.default.createElement(components_1.Panel, { key: realIndex, title: `${isSelected ? '\u25b6 ' : ''}${run.strategyName || 'Unnamed Strategy'}`, icon: T.icons.strategy, borderColor: isSelected ? T.colors.mauve : T.colors.surface1, compact: true },
                react_1.default.createElement(ink_1.Box, null,
                    react_1.default.createElement(ink_1.Text, { color: runStatusColor, bold: true }, run.status || 'UNKNOWN'),
                    react_1.default.createElement(ink_1.Text, { color: T.colors.overlay0 },
                        ' ',
                        "ID: ",
                        T.truncate(String(run.id || ''), 12)),
                    run.completedAt && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                        ' ',
                        "completed ",
                        T.timeAgo(run.completedAt)))),
                react_1.default.createElement(ink_1.Box, { flexDirection: "row", marginTop: 1 },
                    react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
                        react_1.default.createElement(components_1.DataRow, { label: "Return", value: T.formatPct((run.totalReturn || 0) * 100), valueColor: T.pnlColor(run.totalReturn || 0), indent: 0 }),
                        react_1.default.createElement(components_1.DataRow, { label: "Win Rate", value: `${((run.winRate || 0) * 100).toFixed(1)}%`, valueColor: (run.winRate || 0) > 0.5 ? T.colors.green : T.colors.red, indent: 0 }),
                        react_1.default.createElement(components_1.DataRow, { label: "Trades", value: `${run.totalTrades || 0}`, indent: 0 })),
                    react_1.default.createElement(ink_1.Box, { flexDirection: "column", flexGrow: 1 },
                        react_1.default.createElement(components_1.DataRow, { label: "Sharpe", value: (run.sharpeRatio || 0).toFixed(2), valueColor: (run.sharpeRatio || 0) > 1 ? T.colors.green : T.colors.text, indent: 0 }),
                        react_1.default.createElement(components_1.DataRow, { label: "Max DD", value: `${(run.maxDrawdown || 0).toFixed(1)}%`, valueColor: (run.maxDrawdown || 0) > 15 ? T.colors.red : T.colors.yellow, indent: 0 }))),
                run.error && (react_1.default.createElement(ink_1.Box, { marginTop: 1 },
                    react_1.default.createElement(ink_1.Text, { color: T.colors.red },
                        '  ',
                        T.icons.cross,
                        " Error: ",
                        run.error))),
                run.instruments && run.instruments.length > 0 && (react_1.default.createElement(ink_1.Text, { color: T.colors.overlay1 },
                    '  ',
                    "Instruments: ",
                    run.instruments.slice(0, 5).join(', ')))));
        }))));
}
//# sourceMappingURL=views.js.map