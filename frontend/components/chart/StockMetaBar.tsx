import { StockMeta } from "@/types";

interface Props {
  meta: StockMeta;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fNum(n?: number): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fPrice(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function fPlain(n?: number, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fPct(n?: number): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

function fVol(n?: number): string {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}

const ANALYST_COLOR: Record<string, string> = {
  "Strong Buy": "text-green-400",
  "Buy": "text-green-400",
  "Hold": "text-amber-400",
  "Underperform": "text-red-400",
  "Sell": "text-red-400",
};

// ── Stat cell ─────────────────────────────────────────────────────────────────

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-[90px]">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className={`text-sm font-medium ${highlight ?? "text-slate-200"}`}>{value}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StockMetaBar({ meta }: Props) {
  const range52 =
    meta.weekLow52 != null && meta.weekHigh52 != null
      ? `${fPrice(meta.weekLow52)} – ${fPrice(meta.weekHigh52)}`
      : "—";

  const dayRange =
    meta.dayLow != null && meta.dayHigh != null
      ? `${fPrice(meta.dayLow)} – ${fPrice(meta.dayHigh)}`
      : "—";

  const dividend =
    meta.dividendRate != null
      ? `${fPrice(meta.dividendRate)} (${fPct(meta.dividendYield)})`
      : "—";

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 px-1 py-3 border-t border-b border-slate-800">
      <Stat label="Market Cap"   value={fNum(meta.marketCap)} />
      <Stat label="Revenue (ttm)" value={fNum(meta.revenue)} />
      <Stat label="EPS"          value={fPrice(meta.eps)} />
      <Stat label="P/E"          value={fPlain(meta.peRatio)} />
      <Stat label="Fwd P/E"      value={fPlain(meta.forwardPE)} />
      <Stat label="Beta"         value={fPlain(meta.beta)} />
      <Stat label="Volume"       value={fVol(meta.volume)} />
      <Stat label="Prev Close"   value={fPrice(meta.previousClose)} />
      <Stat label="Day's Range"  value={dayRange} />
      <Stat label="52W Range"    value={range52} />
      <Stat label="Dividend"     value={dividend} />
      {meta.earningsDate && (
        <Stat label="Earnings Date" value={meta.earningsDate} />
      )}
      {meta.analystRating && (
        <Stat
          label="Analysts"
          value={meta.analystRating}
          highlight={ANALYST_COLOR[meta.analystRating] ?? "text-slate-200"}
        />
      )}
      {meta.priceTarget != null && (
        <Stat label="Price Target" value={fPrice(meta.priceTarget)} />
      )}
    </div>
  );
}
