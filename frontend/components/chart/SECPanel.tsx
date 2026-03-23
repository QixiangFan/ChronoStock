"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { SECFiling } from "@/lib/api";

interface Props {
  filings: SECFiling[];
}

export default function SECPanel({ filings }: Props) {
  const [expanded, setExpanded] = useState<"8-K" | "4" | null>(null);

  if (!filings.length) return null;

  const filings8K = filings.filter((f) => f.form === "8-K");
  const filings4  = filings.filter((f) => f.form === "4");

  const Section = ({
    form,
    label,
    color,
    items,
  }: {
    form: "8-K" | "4";
    label: string;
    color: string;
    items: SECFiling[];
  }) => {
    if (!items.length) return null;
    const open = expanded === form;
    return (
      <div className="border-b border-slate-800 last:border-0">
        <button
          onClick={() => setExpanded(open ? null : form)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: color + "22", color }}
            >
              {form}
            </span>
            <span className="text-xs text-slate-400">{label}</span>
          </div>
          <span className="text-xs text-slate-600">{items.length} · {open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="pb-2">
            {items.map((f, i) => (
              <a
                key={i}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2.5 px-4 py-2 hover:bg-slate-800/50 transition-colors group"
              >
                <span className="text-[10px] text-slate-500 font-mono mt-0.5 shrink-0 w-20">
                  {f.date}
                </span>
                <span className="text-xs text-slate-300 flex-1 leading-snug">{f.label}</span>
                <ExternalLink
                  className="w-3 h-3 text-slate-600 group-hover:text-slate-400 shrink-0 mt-0.5 transition-colors"
                />
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          SEC Filings
        </p>
      </div>
      <Section form="8-K" label="Corporate Events"       color="#6366f1" items={filings8K} />
      <Section form="4"   label="Insider Transactions"   color="#f97316" items={filings4}  />
    </div>
  );
}
