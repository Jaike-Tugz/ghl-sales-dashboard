import { fmtInt } from "@/lib/format";

export interface MeterRow {
  label: string;
  sub?: string | null;
  /** 0–1 */
  ratio: number | null;
  /** Shown after the percentage, e.g. "36 of 128". */
  detail?: string;
}

/** A name, a bar and a figure per row, bars aligned: for one ratio per named row. */
export function MeterList({ rows, empty = "Nothing to show yet." }: { rows: MeterRow[]; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-5">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium" title={r.label}>{r.label}</div>
              {r.sub && <div className="truncate text-xs text-muted-foreground">{r.sub}</div>}
            </div>
            <div className="flex shrink-0 items-baseline gap-2">
              {r.detail && <span className="text-xs text-muted-foreground tabular">{r.detail}</span>}
              <span className="w-10 text-right text-sm font-semibold tabular">{r.ratio == null ? "—" : `${Math.round(r.ratio * 100)}%`}</span>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--chart-1)_14%,transparent)]" role="img" aria-label={`${r.label}: ${r.ratio == null ? "no data" : `${Math.round(r.ratio * 100)}%`}`}>
            <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(0, Math.min(1, r.ratio ?? 0)) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export const ofText = (part: number, whole: number) => `${fmtInt(part)} of ${fmtInt(whole)}`;
