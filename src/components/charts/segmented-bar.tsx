import { fmtInt } from "@/lib/format";

export interface Segment {
  label: string;
  value: number;
  color: string;
  /** Label colour inside the block (white or near-black by the fill's lightness), e.g. a CSS var. */
  ink: string;
}

/**
 * One whole split into a few parts (≤ 6): a tall bar of blocks with each
 * share printed inside when it fits, and a legend that names the parts with
 * their counts. Parts at zero draw nothing.
 */
export function SegmentedBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div>
      <div
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value} (${pct(s.value)}%)`).join(", ")}`}
        className="flex h-7 w-full gap-0.5 overflow-hidden"
      >
        {total === 0 && <div className="h-full w-full rounded bg-muted" />}
        {shown.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${fmtInt(s.value)} (${pct(s.value)}%)`}
            className="flex h-full min-w-0 items-center rounded px-2 text-[11px] font-medium"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color, color: s.ink }}
          >
            {/* Only print the share when the block is wide enough to hold it. */}
            {s.value / total >= 0.08 && <span className="truncate">{pct(s.value)}%</span>}
          </div>
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {segments.map((s) => (
          <li key={s.label} className="flex min-w-0 items-center gap-2 text-sm">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-medium tabular">{fmtInt(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
