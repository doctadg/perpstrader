// =============================================================================
// PerpsTrader TUI — Agent Control API Client
// =============================================================================

const API_BASE = process.env.AGENT_API_URL || 'http://localhost:3001';
const API_KEY = process.env.AGENT_API_KEY || 'perpstrader-dev-key';

// =============================================================================
// Types
// =============================================================================

export interface ApiData {
  status: any;
  portfolio: any;
  positions: any;
  signals: any;
  news: any;
  predictions: any;
  risk: any;
  strategies: any;
  orders?: any;
  backtest?: any;
}

// =============================================================================
// Fetch Helper
// =============================================================================

async function apiFetch<T>(path: string, timeoutMs = 8000): Promise<T | null> {
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
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Unauthenticated fetch for public endpoints (health, old status)
async function publicFetch<T>(path: string, timeoutMs = 5000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// =============================================================================
// Public API
// =============================================================================

export async function checkConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchAllData(): Promise<{ data: ApiData; connected: boolean }> {
  const empty: ApiData = {
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
    const [agentStatus, health, portfolio, positions, signals, news, predictions, risk, strategies] =
      await Promise.all([
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
  } catch {
    return { data: empty, connected: false };
  }
}

// =============================================================================
// POST Helper (for actions)
// =============================================================================

async function apiPost<T>(path: string, body?: any, timeoutMs = 8000): Promise<T | null> {
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
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// =============================================================================
// Action Endpoints
// =============================================================================

export async function closePosition(positionId: string): Promise<any> {
  return apiPost(`/api/agent/close/${positionId}`);
}

export async function cancelOrder(orderId: string): Promise<any> {
  return apiPost('/api/agent/orders/cancel', { orderId });
}

export async function emergencyStop(): Promise<any> {
  return apiPost('/api/agent/emergency-stop');
}

export async function triggerCycle(symbol?: string): Promise<any> {
  return apiPost('/api/agent/cycle/trigger', symbol ? { symbol } : {});
}

export async function startAgent(agentName: string): Promise<any> {
  return apiPost(`/api/agent/start/${agentName}`);
}

export async function stopAgent(agentName: string): Promise<any> {
  return apiPost(`/api/agent/stop/${agentName}`);
}

export async function fetchOrders(): Promise<any> {
  return apiFetch<{ orders: any[]; total: number }>('/api/agent/orders');
}

export async function fetchBacktestHistory(): Promise<any> {
  return apiFetch<{ runs: any[]; total: number }>('/api/agent/backtest/history');
}

export function getApiUrl(): string {
  return API_BASE;
}
