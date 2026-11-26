import { ArrowDown } from "lucide-react";
import { fmtInt, fmtPct } from "@/lib/format";
import type { JourneySummary } from "@/lib/metrics/journey";

/**
 * The lead journey as horizontal bars on one baseline (one hue), widths
 * relative to the first step, with the step-to-step conversion between rows.
 */
export function JourneyFunnel({ summary }: { summary: JourneySummary }) {
  const top = Math.max(1, summary.steps[0]?.count ?? 0);
  return (
    <ol className="flex flex-col">
      {summary.steps.map((s, i) => (
        <li key={s.key}>
          {i > 0 && (
            <div className="flex items-center gap-1.5 py-1.5 pl-1 text-[11px] text-muted-foreground">
              <ArrowDown className="size-3" aria-hidden />
              <span className="tabular">{fmtPct(s.fromPrev, 0)}</span> continue
            </div>
          )}
          <div className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 sm:grid-cols-[8.5rem_1fr_4rem]">
            <span className="truncate text-sm" title={s.label}>{s.label}</span>
            <span className="h-6 overflow-hidden rounded-[4px] bg-muted" role="img" aria-label={`${s.label}: ${s.count}`}>
              <span
                className="block h-full rounded-[4px] bg-[var(--chart-1)]"
                style={{ width: `${(s.count / top) * 100}%`, opacity: 1 - i * 0.12 }}
              />
            </span>
            <span className="text-right text-sm font-semibold tabular">{fmtInt(s.count)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
