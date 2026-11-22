"use client";
/** Shared chart pieces: fixed-order series colors (validated palette), tooltip, legend. */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export const axisProps = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelFormat,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
  format?: (v: number, key?: string) => string;
  labelFormat?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-foreground">{labelFormat && label ? labelFormat(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-4 font-medium text-foreground tabular">{format ? format(Number(p.value), p.dataKey) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  if (items.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: i.color, height: 3 }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function bucketLabel(b: string) {
  if (b.length === 7) {
    const [y, m] = b.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "short", year: "2-digit", timeZone: "UTC" });
  }
  const [y, m, d] = b.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}
