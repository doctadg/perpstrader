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

// =============================================================================
// Public API
// =============================================================================

export async function checkConnection(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/agent/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
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
    const [status, portfolio, positions, signals, news, predictions, risk, strategies] =
      await Promise.all([
        apiFetch('/api/agent/status'),
        apiFetch('/api/agent/portfolio'),
        apiFetch('/api/agent/positions'),
        apiFetch('/api/agent/signals'),
        apiFetch('/api/agent/news?limit=50'),
        apiFetch('/api/agent/predictions'),
        apiFetch('/api/agent/risk'),
        apiFetch('/api/agent/strategies'),
      ]);

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
      connected: !!status,
    };
  } catch {
    return { data: empty, connected: false };
  }
}

export function getApiUrl(): string {
  return API_BASE;
}
