"use strict";
// =============================================================================
// PerpsTrader TUI — Agent Control API Client
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkConnection = checkConnection;
exports.fetchAllData = fetchAllData;
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
function getApiUrl() {
    return API_BASE;
}
