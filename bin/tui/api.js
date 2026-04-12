"use strict";
// =============================================================================
// PerpsTrader TUI — Agent Control API Client
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkConnection = checkConnection;
exports.fetchAllData = fetchAllData;
exports.closePosition = closePosition;
exports.cancelOrder = cancelOrder;
exports.emergencyStop = emergencyStop;
exports.triggerCycle = triggerCycle;
exports.startAgent = startAgent;
exports.stopAgent = stopAgent;
exports.fetchOrders = fetchOrders;
exports.fetchBacktestHistory = fetchBacktestHistory;
exports.getApiUrl = getApiUrl;
const API_BASE = process.env.AGENT_API_URL || 'http://localhost:3001';
const API_KEY = process.env.AGENT_API_KEY || 'perpstrader-dev-key';
// =============================================================================
// Fetch Helper
// =============================================================================
async function apiFetch(path, timeoutMs = 8000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`${API_BASE}${path}`, {
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok)
            return null;
        return (await res.json());
    }
    catch {
        return null;
    }
}
// Unauthenticated fetch for public endpoints (health, old status)
async function publicFetch(path, timeoutMs = 5000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`${API_BASE}${path}`, {
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok)
            return null;
        return (await res.json());
    }
    catch {
        return null;
    }
}
// =============================================================================
// Public API
// =============================================================================
async function checkConnection() {
    try {
        const res = await fetch(`${API_BASE}/api/health`, {
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
async function fetchAllData() {
    const empty = {
        status: null,
        portfolio: null,
        positions: null,
        signals: null,
        news: null,
        predictions: null,
        risk: null,
        strategies: null,
    };
    try {
        const [agentStatus, health, portfolio, positions, signals, news, predictions, risk, strategies] = await Promise.all([
            apiFetch('/api/agent/status'),
            publicFetch('/api/health'),
            apiFetch('/api/agent/portfolio'),
            apiFetch('/api/agent/positions'),
            apiFetch('/api/agent/signals'),
            apiFetch('/api/agent/news?limit=50'),
            apiFetch('/api/agent/predictions'),
            apiFetch('/api/agent/risk'),
            apiFetch('/api/agent/strategies'),
        ]);
        const status = agentStatus ?? (await publicFetch('/api/status'));
        return {
            data: {
                status: status ?? empty.status,
                portfolio: portfolio ?? empty.portfolio,
                positions: positions ?? empty.positions,
                signals: signals ?? empty.signals,
                news: news ?? empty.news,
                predictions: predictions ?? empty.predictions,
                risk: risk ?? empty.risk,
                strategies: strategies ?? empty.strategies,
            },
            connected: !!(agentStatus || status || health),
        };
    }
    catch {
        return { data: empty, connected: false };
    }
}
// =============================================================================
// POST Helper (for actions)
// =============================================================================
async function apiPost(path, body, timeoutMs = 8000) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok)
            return null;
        return (await res.json());
    }
    catch {
        return null;
    }
}
// =============================================================================
// Action Endpoints
// =============================================================================
async function closePosition(positionId) {
    return apiPost(`/api/agent/close/${positionId}`);
}
async function cancelOrder(orderId) {
    return apiPost('/api/agent/orders/cancel', { orderId });
}
async function emergencyStop() {
    return apiPost('/api/agent/emergency-stop');
}
async function triggerCycle(symbol) {
    return apiPost('/api/agent/cycle/trigger', symbol ? { symbol } : {});
}
async function startAgent(agentName) {
    return apiPost(`/api/agent/start/${agentName}`);
}
async function stopAgent(agentName) {
    return apiPost(`/api/agent/stop/${agentName}`);
}
async function fetchOrders() {
    return apiFetch('/api/agent/orders');
}
async function fetchBacktestHistory() {
    return apiFetch('/api/agent/backtest/history');
}
function getApiUrl() {
    return API_BASE;
}
//# sourceMappingURL=api.js.map