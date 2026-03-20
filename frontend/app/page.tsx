"use client";

import { useEffect, useState } from "react";
import SearchBar from "@/components/ui/SearchBar";
import Navbar from "@/components/ui/Navbar";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWatchlist, removeFromWatchlist, fetchTrending } from "@/lib/api";

export default function Home() {
  const { user, token } = useAuth();
  const [watchlist, setWatchlist] = useState<{ ticker: string; added_at: string }[]>([]);
  const [trending, setTrending] = useState<Awaited<ReturnType<typeof fetchTrending>> | null>(null);

  useEffect(() => {
    fetchTrending().then(setTrending);
  }, []);

  useEffect(() => {
    if (!user || !token) { setWatchlist([]); return; }
    fetchWatchlist(token).then(setWatchlist).catch(() => setWatchlist([]));
  }, [user, token]);

  async function handleRemove(ticker: string) {
    if (!token) return;
    try {
      await removeFromWatchlist(ticker, token);
      setWatchlist((prev) => prev.filter((w) => w.ticker !== ticker));
    } catch { /* ignore */ }
  }

  const TrendingList = ({ className }: { className?: string }) => (
    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2 ${className ?? ""}`}>
      {trending === null
        ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-800 animate-pulse" />
          ))
        : trending.length === 0
        ? <p className="col-span-3 text-slate-600 text-sm text-center">No trending data available.</p>
        : trending.map((s) => {
            const up = (s.changePct ?? 0) >= 0;
            return (
              <Link
                key={s.ticker}
                href={`/stock/${s.ticker}`}
                className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-indigo-400 text-sm">{s.ticker}</span>
                  {s.changePct != null && (
                    <span className={`text-xs font-medium ${up ? "text-green-400" : "text-red-400"}`}>
                      {up ? "+" : ""}{s.changePct.toFixed(2)}%
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-400 truncate">{s.companyName}</span>
                {s.price != null && (
                  <span className="text-sm font-semibold text-slate-200">${s.price.toFixed(2)}</span>
                )}
              </Link>
            );
          })}
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-slate-950">
      <Navbar />

      <main className="flex flex-col items-center justify-center flex-1 px-4">
        {user ? (
          /* ── Logged-in view ── */
          <div className="w-full max-w-2xl">
            {/* Watchlist */}
            <div className="mb-10">
              <h2 className="text-lg font-semibold text-white mb-4">My Watchlist</h2>
              {watchlist.length === 0 ? (
                <p className="text-slate-500 text-sm">No stocks saved yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {watchlist.map((item) => (
                    <div
                      key={item.ticker}
                      className="flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-lg bg-slate-800 border border-slate-700"
                    >
                      <Link
                        href={`/stock/${item.ticker}`}
                        className="font-mono font-bold text-indigo-400 text-sm hover:text-indigo-300 transition-colors"
                      >
                        {item.ticker}
                      </Link>
                      <button
                        onClick={() => handleRemove(item.ticker)}
                        className="ml-1 text-slate-500 hover:text-red-400 transition-colors text-base leading-none px-1"
                        aria-label={`Remove ${item.ticker}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div className="w-full max-w-sm mx-auto mb-8">
              <SearchBar />
            </div>

            {/* Trending */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 text-center">
                Trending
              </p>
              <TrendingList />
            </div>
          </div>
        ) : (
          /* ── Logged-out view ── */
          <>
            {/* Hero */}
            <div className="text-center mb-12">
              <h1 className="text-5xl font-bold text-white tracking-tight mb-3">
                Chrono<span className="text-indigo-400">Stock</span>
              </h1>
              <p className="text-slate-400 text-lg max-w-xl">
                AI-powered narrative charting. See the{" "}
                <span className="text-slate-200 font-medium">real-world events</span> behind every
                price move — overlaid directly on the chart.
              </p>
            </div>

            {/* Search */}
            <div className="w-full max-w-sm mb-8">
              <SearchBar />
            </div>

            {/* Trending */}
            <div className="mb-10 w-full max-w-lg">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3 text-center">
                Trending
              </p>
              <TrendingList />
            </div>

            {/* Sign-in banner */}
            <div className="px-5 py-3 rounded-xl bg-slate-900 border border-slate-800 text-sm text-slate-400 max-w-md text-center">
              <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                Sign in
              </Link>{" "}
              to save stocks and unlock AI-powered event analysis
            </div>
          </>
        )}
      </main>
    </div>
  );
}
