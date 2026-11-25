"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisProps, bucketLabel, ChartTooltip, Legend, SERIES } from "./chart-kit";

/**
 * Counts per time bucket, stacked by series (fixed colour order). Columns are
 * capped at 24px, with a 2px surface gap between segments and a 4px rounded top.
 */
export function StackedColumns({ data, series, height = 240 }: { data: Array<Record<string, number | string>>; series: Array<{ key: string; label: string }>; height?: number }) {
  const last = series.length - 1;
  return (
    <div>
      <Legend items={series.map((s, i) => ({ label: s.label, color: SERIES[i % SERIES.length] }))} swatch="square" />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="bucket" tickFormatter={bucketLabel} {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} allowDecimals={false} width={40} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip labelFormat={bucketLabel} />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={SERIES[i % SERIES.length]}
                stroke="var(--card)"
                strokeWidth={2}
                maxBarSize={24}
                radius={i === last ? [4, 4, 0, 0] : 0}
                animationDuration={500}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
