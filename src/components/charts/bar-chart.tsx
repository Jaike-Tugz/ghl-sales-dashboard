"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, ChartTooltip, Legend, SERIES } from "./chart-kit";

/** Horizontal or vertical bars for category breakdowns; series share one axis. */
export function SimpleBarChart({
  data,
  series,
  categoryKey = "label",
  layout = "vertical",
  height = 260,
  currency,
  percent,
}: {
  data: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string }>;
  categoryKey?: string;
  layout?: "vertical" | "horizontal";
  height?: number;
  currency?: boolean;
  percent?: boolean;
}) {
  const fmt = (v: number) =>
    percent
      ? `${(v * 100).toFixed(1)}%`
      : currency
        ? new Intl.NumberFormat("en-AU", { style: "currency", currency: process.env.NEXT_PUBLIC_CURRENCY || "AUD", maximumFractionDigits: 0 }).format(v)
        : new Intl.NumberFormat("en-AU").format(v);
  const compact = (v: number) => (percent ? `${Math.round(v * 100)}%` : new Intl.NumberFormat("en-AU", { notation: "compact" }).format(v));
  const horizontalBars = layout === "vertical";
  return (
    <div>
      <Legend items={series.map((s, i) => ({ label: s.label, color: SERIES[i % SERIES.length] }))} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={layout} margin={{ top: 4, right: 12, left: horizontalBars ? 0 : -8, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid horizontal={!horizontalBars} vertical={horizontalBars} stroke="var(--border)" />
            {horizontalBars ? (
              <>
                <XAxis type="number" {...axisProps} tickFormatter={compact} />
                <YAxis type="category" dataKey={categoryKey} {...axisProps} width={120} tick={{ fontSize: 11, fill: "var(--foreground)" }} />
              </>
            ) : (
              <>
                <XAxis dataKey={categoryKey} {...axisProps} />
                <YAxis {...axisProps} tickFormatter={compact} width={48} />
              </>
            )}
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltip format={fmt} />} />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i % SERIES.length]} radius={horizontalBars ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28} animationDuration={600} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
