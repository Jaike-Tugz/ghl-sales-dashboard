"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, bucketLabel, ChartTooltip, Legend, SERIES } from "./chart-kit";

export interface TrendSeries {
  key: string;
  label: string;
}

/** Multi-series line chart over time buckets. One y-axis only — series must share a unit. */
export function TrendChart({
  data,
  series,
  height = 260,
  currency,
}: {
  data: Array<Record<string, number | string>>;
  series: TrendSeries[];
  height?: number;
  currency?: boolean;
}) {
  const fmt = (v: number) =>
    currency ? new Intl.NumberFormat("en-AU", { style: "currency", currency: process.env.NEXT_PUBLIC_CURRENCY || "AUD", maximumFractionDigits: 0 }).format(v) : new Intl.NumberFormat("en-AU").format(v);
  return (
    <div>
      <Legend items={series.map((s, i) => ({ label: s.label, color: SERIES[i % SERIES.length] }))} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="bucket" tickFormatter={bucketLabel} {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} allowDecimals={false} width={currency ? 64 : 40} tickFormatter={(v) => (currency ? new Intl.NumberFormat("en-AU", { notation: "compact" }).format(v) : v)} />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<ChartTooltip format={fmt} labelFormat={bucketLabel} />} />
            {series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                fill={SERIES[i % SERIES.length]}
                fillOpacity={i === 0 ? 0.1 : 0}
                dataKey={s.key}
                name={s.label}
                stroke={SERIES[i % SERIES.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                animationDuration={600}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
