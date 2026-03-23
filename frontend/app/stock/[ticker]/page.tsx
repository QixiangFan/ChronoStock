"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchStockData, fetchWatchlist, addToWatchlist, removeFromWatchlist, fetchNews, fetchEarnings, fetchSECFilings, StockNews, EarningsDate, SECFiling } from "@/lib/api";
import { StockData, OHLCBar, NewsEvent } from "@/types";
import StockChart, { StockChartHandle } from "@/components/chart/StockChart";
import EventPanel from "@/components/chart/EventPanel";
import StockMetaBar from "@/components/chart/StockMetaBar";
import NewsPanel from "@/components/chart/NewsPanel";
import SECPanel from "@/components/chart/SECPanel";
import Navbar from "@/components/ui/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { FileChartColumn } from "lucide-react";

// ── Time range ────────────────────────────────────────────────────────────────

type TimeRange = "1W" | "1M" | "6M" | "1Y" | "5Y" | "ALL";

// ── Moving averages ───────────────────────────────────────────────────────────

interface MAConfig { period: number; color: string; label: string; }

const MA_CONFIGS: MAConfig[] = [
  { period: 20,  color: "#38bdf8", label: "SMA 20"  },
  { period: 50,  color: "#fb923c", label: "SMA 50"  },
  { period: 200, color: "#a78bfa", label: "SMA 200" },
];

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

  const [news, setNews] = useState<StockNews[]>([]);
  const [earnings, setEarnings] = useState<EarningsDate[]>([]);
  const [secFilings, setSecFilings] = useState<SECFiling[]>([]);
  const [showEarnings, setShowEarnings] = useState(false);
  const [activeMAs, setActiveMAs] = useState<Set<number>>(new Set());
  const [expandedEarning, setExpandedEarning] = useState<string | null>(null);
  const [earningPositions, setEarningPositions] = useState<
    { date: string; x: number; y: number; earning: EarningsDate }[]
  >([]);

  const [inWatchlist, setInWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);

  const chartRef = useRef<StockChartHandle>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    setActiveEvent(null);
    setExpandedId(null);
    setNews([]);
    setEarnings([]);
    fetchStockData(ticker)
      .then(setData)
      .catch((e: Error) => setError(e.message));
    fetchNews(ticker).then(setNews);
    fetchEarnings(ticker).then(setEarnings);
    fetchSECFilings(ticker).then(setSecFilings);
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
  const { filteredBars, filteredEvents, filteredEarnings } = useMemo(() => {
    if (!data) return { filteredBars: [], filteredEvents: [], filteredEarnings: [] };
    const fb = filterBars(data.bars, range);
    const from = fb[0]?.time ?? "";
    const to = fb[fb.length - 1]?.time ?? "";
    const fe = user ? filterEvents(data.events, fb) : [];
    const earn = earnings.filter((e) => e.date >= from && e.date <= to);
    return { filteredBars: fb, filteredEvents: fe, filteredEarnings: earn };
  }, [data, range, user, earnings]);

  const filteredSEC = useMemo(() => {
    if (!filteredBars.length) return [];
    const from = filteredBars[0].time;
    const to = filteredBars[filteredBars.length - 1].time;
    return secFilings.filter((f) => f.date >= from && f.date <= to);
  }, [secFilings, filteredBars]);

  // Refs so the stable callback always reads the latest values
  const filteredEarningsRef = useRef<EarningsDate[]>([]);
  filteredEarningsRef.current = filteredEarnings;
  const filteredBarsRef = useRef<OHLCBar[]>([]);
  filteredBarsRef.current = filteredBars;

  // Stable callback — called on every pan / zoom / resize and on data change
  const computeEarningPositions = useCallback(() => {
    if (!chartRef.current || !chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const currentEarnings = filteredEarningsRef.current;
    const currentBars = filteredBarsRef.current;

    const chartWidth  = chartContainerRef.current.clientWidth;
    const chartHeight = chartContainerRef.current.clientHeight;

    const positions = currentEarnings.flatMap((e) => {
      // Find the bar on or just after the earnings date
      const bar = currentBars.find((b) => b.time >= e.date) ?? null;
      if (!bar) return [];
      const pos = chartRef.current!.getPositionForDate(e.date, bar.close);
      if (!pos) return [];
      // Skip icons panned outside the visible chart pane.
      // Subtract ~70px for the right price-scale column so icons don't bleed into it.
      if (pos.x < 0 || pos.x > chartWidth - 70) return [];
      if (pos.y < 0 || pos.y > chartHeight) return [];
      return [{
        date: e.date,
        x: rect.left + pos.x,
        y: rect.top + pos.y,  // directly on the price line
        earning: e,
      }];
    });
    setEarningPositions(positions);
  }, []);

  // Recompute when data / range changes (after chart re-renders)
  useEffect(() => {
    if (!filteredEarnings.length) { setEarningPositions([]); return; }
    const timer = setTimeout(computeEarningPositions, 250);
    return () => clearTimeout(timer);
  }, [filteredEarnings, computeEarningPositions]);

  // SMA computation
  const movingAverages = useMemo(() => {
    if (!filteredBars.length || !activeMAs.size) return [];
    return MA_CONFIGS
      .filter((cfg) => activeMAs.has(cfg.period))
      .map((cfg) => {
        const data: { time: string; value: number }[] = [];
        for (let i = 0; i < filteredBars.length; i++) {
          if (i < cfg.period - 1) continue;
          let sum = 0;
          for (let j = i - cfg.period + 1; j <= i; j++) sum += filteredBars[j].close;
          data.push({ time: filteredBars[i].time, value: sum / cfg.period });
        }
        return { period: cfg.period, color: cfg.color, data };
      });
  }, [filteredBars, activeMAs]);

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

            {/* MA toggles */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider">MA</span>
              {MA_CONFIGS.map((cfg) => {
                const active = activeMAs.has(cfg.period);
                return (
                  <button
                    key={cfg.period}
                    onClick={() =>
                      setActiveMAs((prev) => {
                        const next = new Set(prev);
                        if (next.has(cfg.period)) next.delete(cfg.period);
                        else next.add(cfg.period);
                        return next;
                      })
                    }
                    className={`px-2.5 py-0.5 rounded-md text-xs font-medium border transition-all ${
                      active
                        ? "border-transparent text-slate-900"
                        : "bg-transparent border-slate-700 text-slate-500 hover:text-slate-300"
                    }`}
                    style={active ? { backgroundColor: cfg.color, borderColor: cfg.color } : undefined}
                  >
                    {cfg.label}
                  </button>
                );
              })}
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
                onViewChange={computeEarningPositions}
                movingAverages={movingAverages}
                secFilings={filteredSEC}
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
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border border-green-400" style={{ boxShadow: "0 0 4px #4ade8088" }} />
                  Earnings beat
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border border-red-400" style={{ boxShadow: "0 0 4px #f8717188" }} />
                  Earnings miss
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

          {/* Sidebar */}
          <aside className="w-80 shrink-0 border-l border-slate-800 overflow-y-auto">
            {user && (
              <div className="p-4 border-b border-slate-800">
                <EventPanel
                  events={filteredEvents}
                  activeEvent={activeEvent}
                  onCardHover={handleCardHover}
                  onCardClick={handleCardClick}
                  expandedId={expandedId}
                />
              </div>
            )}
            {earnings.length > 0 && (
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileChartColumn className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                    Earnings Reports
                  </span>
                </div>
                <button
                  onClick={() => { setShowEarnings((v) => !v); setExpandedEarning(null); }}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    showEarnings ? "bg-indigo-600" : "bg-slate-700"
                  }`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    showEarnings ? "translate-x-5" : "translate-x-1"
                  }`} />
                </button>
              </div>
            )}
            <SECPanel filings={secFilings} />
            <div className="p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
                Recent News
              </p>
              <NewsPanel news={news} />
            </div>
          </aside>

          {/* Earnings icons overlay */}
          {showEarnings && earningPositions.map((pos) => {
            const beat = pos.earning.surprisePct != null && pos.earning.surprisePct > 0;
            const miss = pos.earning.surprisePct != null && pos.earning.surprisePct < 0;
            const colorHex = beat ? "#4ade80" : miss ? "#f87171" : "#fbbf24";
            const isExpanded = expandedEarning === pos.date;

            return (
              <div
                key={pos.date}
                className="fixed z-30 pointer-events-none"
                style={{ left: pos.x - 10, top: pos.y - 10, width: 20, height: 20 }}
              >
                {/* Circular badge centered on the price line */}
                <div
                  className="pointer-events-auto cursor-pointer w-5 h-5 rounded-full flex items-center justify-center transition-transform hover:scale-125"
                  title="Earnings Report"
                  onClick={() => setExpandedEarning(isExpanded ? null : pos.date)}
                  style={{
                    backgroundColor: "#0f172a",
                    border: `1.5px solid ${colorHex}`,
                    boxShadow: `0 0 8px 2px ${colorHex}55`,
                    color: colorHex,
                  }}
                >
                  <FileChartColumn style={{ width: 10, height: 10 }} />
                </div>

                {/* Expanded detail card — floats above the badge */}
                {isExpanded && (
                  <div
                    className="pointer-events-auto absolute w-44 rounded-xl border border-slate-700 bg-slate-900 shadow-xl p-3 text-xs"
                    style={{ bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="font-semibold mb-2" style={{ color: colorHex }}>
                      {beat ? "Earnings Beat" : miss ? "Earnings Miss" : "Upcoming Earnings"}
                    </p>
                    <p className="text-slate-400 font-mono mb-1">{pos.date}</p>
                    <div className="flex justify-between text-slate-400">
                      <span>Estimate</span>
                      <span className="text-slate-200">
                        {pos.earning.epsEstimate != null ? `$${pos.earning.epsEstimate.toFixed(2)}` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Actual</span>
                      <span className="text-slate-200">
                        {pos.earning.reportedEps != null ? `$${pos.earning.reportedEps.toFixed(2)}` : "—"}
                      </span>
                    </div>
                    {pos.earning.surprisePct != null && (
                      <div className="flex justify-between mt-1 font-semibold" style={{ color: colorHex }}>
                        <span>Surprise</span>
                        <span>{pos.earning.surprisePct > 0 ? "+" : ""}{pos.earning.surprisePct.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

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
