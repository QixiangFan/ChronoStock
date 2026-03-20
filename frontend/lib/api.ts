/**
 * API client — currently returns mock data.
 * Flip USE_MOCK to false when the backend is live.
 *
 * Backend contract:
 *   GET /api/stock/{ticker}?range=1W|1M|6M|1Y|5Y|ALL
 *   → { ticker, companyName, bars: OHLCBar[], events: NewsEvent[] }
 *
 * Note: in mock mode the frontend filters by range itself (page.tsx).
 * In real mode the backend filters and only the requested slice is returned.
 */

import { StockData } from "@/types";

// Stock data + search → real backend
// Auth + watchlist → still mocked (linked later)
const MOCK_AUTH = true;
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// In-memory mock watchlist
let mockWatchlist: { ticker: string; added_at: string }[] = [];

export async function fetchStockData(ticker: string): Promise<StockData> {
  // Fetch full history so the frontend can switch ranges client-side
  const res = await fetch(`${API_BASE}/api/stock/${ticker}?range=ALL`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json() as Promise<StockData>;
}

export async function searchTickers(query: string): Promise<{ ticker: string; companyName: string }[]> {
  const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export interface TrendingItem {
  ticker: string;
  companyName: string;
  price?: number;
  change?: number;
  changePct?: number;
}

export async function fetchTrending(): Promise<TrendingItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/trending`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function fetchWatchlist(token: string): Promise<{ ticker: string; added_at: string }[]> {
  if (MOCK_AUTH) {
    return [...mockWatchlist];
  }

  const res = await fetch(`${API_BASE}/api/watchlist`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function addToWatchlist(ticker: string, token: string): Promise<void> {
  if (MOCK_AUTH) {
    const upper = ticker.toUpperCase();
    if (!mockWatchlist.find((w) => w.ticker === upper)) {
      mockWatchlist.push({ ticker: upper, added_at: new Date().toISOString() });
    }
    return;
  }

  const res = await fetch(`${API_BASE}/api/watchlist/${ticker}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function removeFromWatchlist(ticker: string, token: string): Promise<void> {
  if (MOCK_AUTH) {
    const upper = ticker.toUpperCase();
    mockWatchlist = mockWatchlist.filter((w) => w.ticker !== upper);
    return;
  }

  const res = await fetch(`${API_BASE}/api/watchlist/${ticker}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}
