"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import {
  createChart,
  IChartApi,
  AreaSeries,
  ColorType,
  createSeriesMarkers,
  Time,
} from "lightweight-charts";
import { OHLCBar, NewsEvent } from "@/types";

export interface StockChartHandle {
  /** X pixel offset from the chart container's left edge for a given date string */
  getXForTime: (time: string) => number | null;
}

interface StockChartProps {
  bars: OHLCBar[];
  events: NewsEvent[];
  activeEventTime: string | null;
  onChartEventHover: (event: NewsEvent | null) => void;
}

const SENTIMENT_COLOR: Record<NewsEvent["sentiment"], string> = {
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#f59e0b",
};

const StockChart = forwardRef<StockChartHandle, StockChartProps>(
  ({ bars, events, activeEventTime, onChartEventHover }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const highlightRef = useRef<HTMLDivElement>(null);
    const onHoverRef = useRef(onChartEventHover);
    onHoverRef.current = onChartEventHover;

    useImperativeHandle(ref, () => ({
      getXForTime: (time: string) => {
        if (!chartRef.current) return null;
        return chartRef.current.timeScale().timeToCoordinate(time as Time);
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "#0f172a" },
          textColor: "#94a3b8",
        },
        grid: {
          vertLines: { color: "#1e293b" },
          horzLines: { color: "#1e293b" },
        },
        crosshair: {
          vertLine: { color: "#475569", labelBackgroundColor: "#1e293b" },
          horzLine: { color: "#475569", labelBackgroundColor: "#1e293b" },
        },
        rightPriceScale: { borderColor: "#1e293b" },
        timeScale: { borderColor: "#1e293b", timeVisible: true },
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });

      const series = chart.addSeries(AreaSeries, {
        lineColor: "#818cf8",
        topColor: "rgba(99, 102, 241, 0.35)",
        bottomColor: "rgba(99, 102, 241, 0.02)",
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderColor: "#818cf8",
        crosshairMarkerBackgroundColor: "#0f172a",
      });

      // Area series expects { time, value }
      const lineData = bars.map((b) => ({ time: b.time as Time, value: b.close }));
      series.setData(lineData);
      chart.timeScale().fitContent();
      chartRef.current = chart;

      // Event markers: arrows above/below line with short title
      const markers = events.map((ev) => ({
        time: ev.time as Time,
        position: "aboveBar" as const,
        color: SENTIMENT_COLOR[ev.sentiment],
        shape: ev.sentiment === "negative" ? ("arrowDown" as const) : ("arrowUp" as const),
        text: ev.title.length > 22 ? ev.title.slice(0, 22) + "…" : ev.title,
        size: 2,
      }));
      createSeriesMarkers(series, markers);

      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          chart.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      ro.observe(containerRef.current);

      chart.subscribeCrosshairMove((param) => {
        if (!param.time) { onHoverRef.current(null); return; }
        const hit = events.find((ev) => ev.time === param.time);
        onHoverRef.current(hit ?? null);
      });

      return () => {
        ro.disconnect();
        chart.remove();
      };
    }, [bars, events]);

    // Sync vertical highlight with active event
    useEffect(() => {
      const el = highlightRef.current;
      const chart = chartRef.current;
      if (!el || !chart) return;

      if (!activeEventTime) {
        el.style.display = "none";
        return;
      }
      const x = chart.timeScale().timeToCoordinate(activeEventTime as Time);
      if (x === null) { el.style.display = "none"; return; }

      el.style.display = "block";
      el.style.left = `${x}px`;
    }, [activeEventTime]);

    return (
      <div className="relative w-full h-full">
        <div ref={containerRef} className="w-full h-full" />
        <div
          ref={highlightRef}
          className="absolute top-0 bottom-0 hidden pointer-events-none"
          style={{
            width: "2px",
            transform: "translateX(-50%)",
            background: "linear-gradient(to bottom, rgba(99,102,241,0.9), rgba(99,102,241,0.05))",
            boxShadow: "0 0 12px 2px rgba(99,102,241,0.45)",
            zIndex: 10,
          }}
        />
      </div>
    );
  }
);
StockChart.displayName = "StockChart";

export default StockChart;
