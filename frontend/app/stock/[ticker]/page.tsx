"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchStockData, fetchWatchlist, addToWatchlist, removeFromWatchlist } from "@/lib/api";
import { StockData, OHLCBar, NewsEvent } from "@/types";
import StockChart, { StockChartHandle } from "@/components/chart/StockChart";
import EventPanel from "@/components/chart/EventPanel";
import StockMetaBar from "@/components/chart/StockMetaBar";
import Navbar from "@/components/ui/Navbar";
import { useAuth } from "@/contexts/AuthContext";

// ── Time range ────────────────────────────────────────────────────────────────

type TimeRange = "1W" | "1M" | "6M" | "1Y" | "5Y" | "ALL";

const RANGES: { label: string; value: TimeRange }[] = [
  { label: "1W", value: "1W" },
  { label: "1M", value: "1M" },
  { label: "6M", value: "6M" },
  { label: "1Y", value: "1Y" },
  { label: "5Y", value: "5Y" },
  { label: "All", value: "ALL" },
];

const RANGE_DAYS: Record<Exclude<TimeRange, "ALL">, number> = {
  "1W": 7, "1M": 30, "6M": 182, "1Y": 365, "5Y": 1825,
};

function filterBars(bars: OHLCBar[], range: TimeRange): OHLCBar[] {
  if (!bars.length || range === "ALL") return bars;
  const last = bars[bars.length - 1].time;
  const d = new Date(last + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - RANGE_DAYS[range]);
  const from = d.toISOString().slice(0, 10);
  return bars.filter((b) => b.time >= from);
}

function filterEvents(events: NewsEvent[], bars: OHLCBar[]): NewsEvent[] {
  if (!bars.length) return [];
  const from = bars[0].time;
  const to = bars[bars.length - 1].time;
  return events.filter((ev) => ev.time >= from && ev.time <= to);
}

// ── Connector line state ──────────────────────────────────────────────────────

interface ConnectorLine {
  x1: number; y1: number;
  x2: number; y2: number;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StockPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const { user, token } = useAuth();

  const [data, setData] = useState<StockData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<TimeRange>("1Y");

  const [activeEvent, setActiveEvent] = useState<NewsEvent | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connector, setConnector] = useState<ConnectorLine | null>(null);

  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  const chartRef = useRef<StockChartHandle>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    setActiveEvent(null);
    setExpandedId(null);
    fetchStockData(ticker)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [ticker]);

  // Load watchlist state
  useEffect(() => {
    if (!user || !token) {
      setInWatchlist(false);
      return;
    }
    fetchWatchlist(token)
      .then((list) => {
        setInWatchlist(list.some((w) => w.ticker === ticker.toUpperCase()));
      })
      .catch(() => setInWatchlist(false));
  }, [user, token, ticker]);

  // Derived filtered data
  const { filteredBars, filteredEvents } = useMemo(() => {
    if (!data) return { filteredBars: [], filteredEvents: [] };
    const fb = filterBars(data.bars, range);
    // Only show events to logged-in users
    if (!user) return { filteredBars: fb, filteredEvents: [] };
    return { filteredBars: fb, filteredEvents: filterEvents(data.events, fb) };
  }, [data, range, user]);

  // Price change stats for the selected range
  const priceStats = useMemo(() => {
    if (filteredBars.length < 2) return null;
    const start = filteredBars[0].close;
    const end = filteredBars[filteredBars.length - 1].close;
    const diff = end - start;
    const pct = (diff / start) * 100;
    return { start, end, diff, pct };
  }, [filteredBars]);

  const handleChartEventHover = useCallback((ev: NewsEvent | null) => {
    setActiveEvent(ev);
    setConnector(null);
  }, []);

  const handleCardHover = useCallback(
    (ev: NewsEvent | null, cardEl: HTMLDivElement | null) => {
      setActiveEvent(ev);
      if (!ev || !cardEl || !chartRef.current || !chartContainerRef.current) {
        setConnector(null);
        return;
      }
      const x = chartRef.current.getXForTime(ev.time);
      if (x === null) { setConnector(null); return; }

      const chartRect = chartContainerRef.current.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();

      setConnector({
        x1: chartRect.left + x,
        y1: chartRect.top + 60,
        x2: cardRect.left,
        y2: cardRect.top + cardRect.height / 2,
      });
    },
    []
  );

  const handleCardClick = useCallback((ev: NewsEvent) => {
    setExpandedId((prev) => (prev === ev.id ? null : ev.id));
  }, []);

  const handleRangeChange = (r: TimeRange) => {
    setRange(r);
    setActiveEvent(null);
    setConnector(null);
    setExpandedId(null);
  };

  async function handleWatchlistToggle() {
    if (!token) return;
    setWatchlistLoading(true);
    try {
      if (inWatchlist) {
        await removeFromWatchlist(ticker, token);
        setInWatchlist(false);
      } else {
        await addToWatchlist(ticker, token);
        setInWatchlist(true);
      }
    } catch {
      // silently ignore
    } finally {
      setWatchlistLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
      <Navbar showSearch />

      {error && (
        <div className="flex flex-1 items-center justify-center text-red-400">{error}</div>
      )}
      {!data && !error && (
        <div className="flex flex-1 items-center justify-center text-slate-500 animate-pulse">
          Loading {ticker.toUpperCase()}…
        </div>
      )}

      {data && (
        <div className="flex flex-1 overflow-hidden relative">
          {/* Chart column */}
          <div className="flex flex-col flex-1 overflow-hidden p-4 gap-3">

            {/* Ticker header + stats */}
            <div className="flex items-end justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-white leading-none">
                    {data.ticker}
                    <span className="ml-3 text-base font-normal text-slate-400">
                      {data.companyName}
                    </span>
                  </h2>

                  {/* Watchlist button */}
                  {user ? (
                    <button
                      onClick={handleWatchlistToggle}
                      disabled={watchlistLoading}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium border transition-colors ${
                        inWatchlist
                          ? "bg-indigo-900/50 border-indigo-700 text-indigo-300 hover:bg-indigo-900"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                      }`}
                    >
                      {inWatchlist ? "★ Saved" : "☆ Save"}
                    </button>
                  ) : (
                    <Link
                      href="/login"
                      className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium border bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      Sign in to save
                    </Link>
                  )}
                </div>

                {priceStats && (
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-semibold text-white">
                      ${priceStats.end.toFixed(2)}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        priceStats.diff >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {priceStats.diff >= 0 ? "+" : ""}
                      {priceStats.diff.toFixed(2)} ({priceStats.pct >= 0 ? "+" : ""}
                      {priceStats.pct.toFixed(2)}%)
                    </span>
                    <span className="text-xs text-slate-600">vs range open</span>
                  </div>
                )}
              </div>

              {/* Time range selector */}
              <div className="flex gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
                {RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => handleRangeChange(r.value)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                      range === r.value
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fundamentals strip */}
            {data.meta && <StockMetaBar meta={data.meta} />}

            {/* Chart */}
            <div
              ref={chartContainerRef}
              className="flex-1 rounded-xl overflow-hidden border border-slate-800"
            >
              <StockChart
                ref={chartRef}
                bars={filteredBars}
                events={filteredEvents}
                activeEventTime={activeEvent?.time ?? null}
                onChartEventHover={handleChartEventHover}
              />
            </div>

            {/* Legend (only shown when logged in and there are events) */}
            {user ? (
              <div className="flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Positive
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> Negative
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Neutral
                </span>
                <span className="ml-auto">
                  Hover markers or cards to link · Click cards to expand
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                <Link
                  href="/login"
                  className="text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Sign in to see AI-powered event analysis overlaid on this chart →
                </Link>
              </div>
            )}
          </div>

          {/* Sidebar — only shown when logged in */}
          {user && (
            <aside className="w-80 shrink-0 border-l border-slate-800 p-4 overflow-hidden">
              <EventPanel
                events={filteredEvents}
                activeEvent={activeEvent}
                onCardHover={handleCardHover}
                onCardClick={handleCardClick}
                expandedId={expandedId}
              />
            </aside>
          )}

          {/* SVG bezier connector (card hover → chart date) */}
          {connector && (
            <svg
              className="pointer-events-none fixed inset-0 w-full h-full"
              style={{ zIndex: 50 }}
            >
              <defs>
                <marker id="dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
                  <circle cx="5" cy="5" r="4" fill="#818cf8" />
                </marker>
              </defs>
              {/* Glow */}
              <path
                d={`M ${connector.x1} ${connector.y1} C ${connector.x1 + 100} ${connector.y1}, ${connector.x2 - 100} ${connector.y2}, ${connector.x2} ${connector.y2}`}
                fill="none"
                stroke="rgba(99,102,241,0.2)"
                strokeWidth="8"
                strokeLinecap="round"
              />
              {/* Line */}
              <path
                d={`M ${connector.x1} ${connector.y1} C ${connector.x1 + 100} ${connector.y1}, ${connector.x2 - 100} ${connector.y2}, ${connector.x2} ${connector.y2}`}
                fill="none"
                stroke="#818cf8"
                strokeWidth="1.5"
                strokeDasharray="5 3"
                strokeLinecap="round"
                markerStart="url(#dot)"
                markerEnd="url(#dot)"
              />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
